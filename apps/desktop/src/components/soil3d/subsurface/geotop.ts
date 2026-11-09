// GeoTOP (TNO): 3D-voxelmodel van de ondiepe ondergrond, 100 × 100 × 0,5 m, via OPeNDAP (open, CC-BY).
// Per voxel de meest waarschijnlijke lithoklasse. De coördinaten in het bestand zijn het midden van de voxel.
import type { Bbox } from "./regis";

export const GEOTOP_URL = "https://www.dinodata.nl/opendap/GeoTOP/geotop.nc";
const X0 = 13_600, Y0 = 338_500, Z0 = -50, CELL = 100, DZ = 0.5, NZ = 313, NODATA = -127;

/** Lithoklassen van GeoTOP met een kleur in de lijn van de bestaande grondsoortkleuren. */
export const LITHOCLASSES: Record<number, { name: string; color: string }> = {
  0: { name: "Antropogeen", color: "#9ca3af" },
  1: { name: "Veen", color: "#795548" },
  2: { name: "Klei", color: "#4caf50" },
  3: { name: "Kleiig zand / zandige klei", color: "#8bc34a" },
  5: { name: "Fijn zand", color: "#ffc107" },
  6: { name: "Matig grof zand", color: "#ff9800" },
  7: { name: "Grof zand", color: "#ff5722" },
  8: { name: "Grind", color: "#b45309" },
  9: { name: "Schelpen", color: "#e7e5e4" },
};

export interface GeoTopBlock {
  source: "GeoTOP";
  /** Middens van de voxels [m RD / m NAP]. */
  xs: number[];
  ys: number[];
  zs: number[];
  /** Lithoklasse per voxel, index (ix·ny + iy)·nz + iz; null = geen gegevens. */
  lithok: (number | null)[];
  cell: number;
  dz: number;
}

export function geotopRange(b: Bbox, zMin: number, zMax: number, max = 8) {
  const clamp = (lo: number, hi: number, limit: number) => {
    if (hi - lo + 1 <= limit) return [lo, hi];
    const mid = Math.floor((lo + hi) / 2);
    return [mid - Math.floor(limit / 2) + 1, mid + Math.ceil(limit / 2)];
  };
  const [i0, i1] = clamp(Math.round((b.xmin - X0) / CELL), Math.round((b.xmax - X0) / CELL), max);
  const [j0, j1] = clamp(Math.round((b.ymin - Y0) / CELL), Math.round((b.ymax - Y0) / CELL), max);
  const k0 = Math.max(0, Math.floor((zMin - Z0) / DZ)), k1 = Math.min(NZ - 1, Math.ceil((zMax - Z0) / DZ));
  return { i0, i1, j0, j1, k0, k1 };
}

export function geotopUrl(b: Bbox, zMin: number, zMax: number): string {
  const { i0, i1, j0, j1, k0, k1 } = geotopRange(b, zMin, zMax);
  const q = `lithok[${i0}:1:${i1}][${j0}:1:${j1}][${k0}:1:${k1}]`;
  return `${GEOTOP_URL}.ascii?${q.replace(/\[/g, "%5B").replace(/\]/g, "%5D")}`;
}

/** Regels: `lithok.z, -2, -1.5, …` en `lithok.lithok[lithok.x=126300][lithok.y=426600], 1, 2, 7, …`. */
export function parseGeotopAscii(text: string, b: Bbox, zMin: number, zMax: number): GeoTopBlock {
  const { i0, i1, j0, j1, k0, k1 } = geotopRange(b, zMin, zMax);
  const nx = i1 - i0 + 1, ny = j1 - j0 + 1, nz = k1 - k0 + 1;
  const xs = Array.from({ length: nx }, (_, i) => X0 + (i0 + i) * CELL);
  const ys = Array.from({ length: ny }, (_, j) => Y0 + (j0 + j) * CELL);
  let zs = Array.from({ length: nz }, (_, k) => Z0 + (k0 + k) * DZ);
  const lithok: (number | null)[] = new Array(nx * ny * nz).fill(null);
  const row = /^lithok\.lithok\[lithok\.x=(-?[\d.]+)\]\[lithok\.y=(-?[\d.]+)\],\s*(.*)$/;
  let found = false;
  for (const line of text.split(/\r?\n/)) {
    const l = line.trim();
    if (l.startsWith("lithok.z,")) { zs = l.slice(9).split(",").map((s) => Number(s.trim())); continue; }
    const m = row.exec(l);
    if (!m) continue;
    const ix = Math.round((Number(m[1]) - xs[0]) / CELL), iy = Math.round((Number(m[2]) - ys[0]) / CELL);
    if (ix < 0 || iy < 0 || ix >= nx || iy >= ny) continue;
    found = true;
    m[3].split(",").forEach((s, k) => {
      const v = Number(s.trim());
      if (k < nz) lithok[(ix * ny + iy) * nz + k] = Number.isFinite(v) && v !== NODATA ? v : null;
    });
  }
  if (!found) throw new Error("GeoTOP gaf geen gegevens voor dit gebied (buiten het gekarteerde deel van Nederland?).");
  return { source: "GeoTOP", xs, ys, zs, lithok, cell: CELL, dz: DZ };
}

export async function fetchGeotop(b: Bbox, zMin: number, zMax: number, signal?: AbortSignal): Promise<GeoTopBlock> {
  const r = await fetch(geotopUrl(b, zMin, zMax), { signal });
  if (!r.ok) throw new Error(`GeoTOP niet bereikbaar (${r.status}).`);
  return parseGeotopAscii(await r.text(), b, zMin, zMax);
}
