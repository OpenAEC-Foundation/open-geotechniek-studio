// Ruimtelijk grondmodel uit de sonderingen van een project.
//
// Per sondering: de laagindeling (dezelfde als in de grafiek), de conus-
// weerstand en de bovenkant van de draagkrachtige laag. Tussen de sonderingen
// wordt geïnterpoleerd met inverse-afstandsweging (IDW, macht 2):
//   - maaiveld, onderkant model en draagkrachtige laag als oppervlak;
//   - de grondsoort per cel als gewogen stemming: elke sondering die op dat
//     NAP-niveau een laag heeft, stemt met gewicht 1/d² op haar zone.
// Het model is indicatief en volgt alleen de sonderingen; het is geen
// geologische interpretatie.
import type { Cpt } from "../../types/cpt";
import { analyzeLayers } from "../../utils/layerAnalysis";
import { bearingLayerTop } from "../../utils/bearingLayer";
import { zones } from "../../utils/soilZones";

export interface ColumnLayer { topNap: number; bottomNap: number; zone: number; color: string; name: string }
export interface Column {
  id: string;
  /** Lokale coördinaten t.o.v. het modelmidden: oost en noord in m. */
  east: number;
  north: number;
  /** false = geen RD-coördinaten; de sondering staat op een hulplijn en telt niet mee in de interpolatie. */
  placed: boolean;
  groundNap: number;
  endNap: number;
  layers: ColumnLayer[];
  qc: { nap: number; qc: number }[];
  bearingTopNap: number | null;
}
export interface Surface { nx: number; ny: number; east0: number; north0: number; dx: number; dy: number; values: Float32Array }
export interface VoxelGrid {
  nx: number; ny: number; nz: number;
  east0: number; north0: number; dx: number; dy: number;
  /** NAP van de bovenkant van laag k = 0; cellen lopen omlaag met `dz`. */
  topNap: number; dz: number;
  /** Zone per cel (0 = leeg); index = i + nx·(j + ny·k). */
  zone: Uint8Array;
}
export interface SoilModel {
  origin: { x: number; y: number };
  columns: Column[];
  grid: VoxelGrid;
  ground: Surface;
  bearing: Surface | null;
  zonesPresent: number[];
  span: number;
  warnings: string[];
}
export interface SoilModelOptions {
  bearingQcMpa: number;
  bearingMinThicknessM: number;
  /** Maximaal aantal cellen langs de langste horizontale as. */
  maxCells?: number;
  /** Maximaal aantal cellen in de hoogte. */
  maxLayers?: number;
  power?: number;
}

const groundOf = (cpt: Cpt) => cpt.metadata.ground_level_nap ?? cpt.position?.z_nap ?? 0;

export function cptColumn(cpt: Cpt, opts: SoilModelOptions): Omit<Column, "east" | "north" | "placed"> {
  const ground = groundOf(cpt);
  const depths = cpt.points.map((p) => p.depth).filter(Number.isFinite);
  const end = depths.length ? Math.max(...depths) : 0;
  let layers: ColumnLayer[] = [];
  try {
    layers = analyzeLayers(cpt).layers.map((l) => ({
      topNap: ground - l.depth_top, bottomNap: ground - l.depth_bottom, zone: l.zone_number, color: l.zone_color, name: l.zone_name,
    }));
  } catch { layers = []; }
  const top = bearingLayerTop(cpt, opts.bearingQcMpa, opts.bearingMinThicknessM);
  return {
    id: cpt.id, groundNap: ground, endNap: ground - end, layers,
    qc: cpt.points.filter((p) => Number.isFinite(p.depth) && Number.isFinite(p.qc)).map((p) => ({ nap: ground - p.depth, qc: p.qc as number })),
    bearingTopNap: top === null ? null : ground - top,
  };
}

/** Inverse-afstandsweging; een punt binnen 1 cm van een sondering krijgt diens waarde. */
export function idw(points: { e: number; n: number; v: number }[], e: number, n: number, power = 2): number {
  let sw = 0, sv = 0;
  for (const p of points) {
    const d = Math.hypot(p.e - e, p.n - n);
    if (d < 0.01) return p.v;
    const w = 1 / d ** power;
    sw += w; sv += w * p.v;
  }
  return sw > 0 ? sv / sw : NaN;
}

export function zoneAt(col: Pick<Column, "layers">, nap: number): number {
  for (const l of col.layers) if (nap <= l.topNap + 1e-9 && nap >= l.bottomNap - 1e-9) return l.zone;
  return 0;
}

export function buildSoilModel(cpts: Cpt[], opts: SoilModelOptions): SoilModel {
  const power = opts.power ?? 2, maxCells = opts.maxCells ?? 28, maxLayers = opts.maxLayers ?? 120;
  const warnings: string[] = [];
  const withRd = cpts.filter((c) => c.position && Number.isFinite(c.position.x_rd) && Number.isFinite(c.position.y_rd));
  const allMissing = withRd.length === 0;
  const xs = withRd.map((c) => c.position!.x_rd), ys = withRd.map((c) => c.position!.y_rd);
  const origin = allMissing ? { x: 0, y: 0 } : { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };

  const columns: Column[] = [];
  const missing = cpts.filter((c) => !withRd.includes(c));
  for (const c of withRd) columns.push({ ...cptColumn(c, opts), east: c.position!.x_rd - origin.x, north: c.position!.y_rd - origin.y, placed: true });
  if (missing.length) {
    if (allMissing) warnings.push("Geen RD-coördinaten: de sonderingen staan op een rij met 10 m tussenafstand.");
    else warnings.push(`Zonder RD-coördinaten (niet in het model): ${missing.map((c) => c.id).join(", ")}.`);
    const south = allMissing ? 0 : Math.min(...columns.map((c) => c.north)) - 10;
    missing.forEach((c, i) => columns.push({ ...cptColumn(c, opts), east: (i - (missing.length - 1) / 2) * 10, north: south, placed: allMissing }));
  }
  const used = columns.filter((c) => c.placed);
  for (const c of used) if (!c.layers.length) warnings.push(`Sondering ${c.id} heeft geen laagindeling.`);

  // Horizontale uitsnede: de sonderingen plus een rand.
  const es = used.map((c) => c.east), ns = used.map((c) => c.north);
  let eMin = Math.min(...es), eMax = Math.max(...es), nMin = Math.min(...ns), nMax = Math.max(...ns);
  const span0 = Math.max(eMax - eMin, nMax - nMin);
  const margin = Math.max(5, 0.15 * span0);
  eMin -= margin; eMax += margin; nMin -= margin; nMax += margin;
  const span = Math.max(eMax - eMin, nMax - nMin);
  const cell = Math.max(0.5, span / maxCells);
  const nx = Math.max(1, Math.round((eMax - eMin) / cell)), ny = Math.max(1, Math.round((nMax - nMin) / cell));
  const dx = (eMax - eMin) / nx, dy = (nMax - nMin) / ny;

  const surf = (pick: (c: Column) => number | null): Surface | null => {
    const pts = used.map((c) => ({ e: c.east, n: c.north, v: pick(c) })).filter((p): p is { e: number; n: number; v: number } => p.v !== null && Number.isFinite(p.v));
    if (!pts.length) return null;
    const values = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) values[i + nx * j] = idw(pts, eMin + (i + 0.5) * dx, nMin + (j + 0.5) * dy, power);
    return { nx, ny, east0: eMin, north0: nMin, dx, dy, values };
  };
  const ground = surf((c) => c.groundNap)!;
  const bottom = surf((c) => c.endNap)!;
  const bearing = surf((c) => c.bearingTopNap);
  const missingBearing = used.filter((c) => c.bearingTopNap === null).map((c) => c.id);
  if (bearing && missingBearing.length) warnings.push(`Draagkrachtige laag niet gevonden in ${missingBearing.join(", ")}; daar is het vlak geïnterpoleerd.`);
  if (!bearing) warnings.push("Draagkrachtige laag in geen enkele sondering gevonden.");

  const top = Math.max(...used.map((c) => c.groundNap)), low = Math.min(...used.map((c) => c.endNap));
  let dz = 0.5;
  if ((top - low) / dz > maxLayers) dz = (top - low) / maxLayers;
  const nz = Math.max(1, Math.ceil((top - low) / dz));
  const zone = new Uint8Array(nx * ny * nz);
  const present = new Set<number>();
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const e = eMin + (i + 0.5) * dx, n = nMin + (j + 0.5) * dy;
    const g = ground.values[i + nx * j], b = bottom.values[i + nx * j];
    const w = used.map((c) => 1 / Math.max(0.01, Math.hypot(c.east - e, c.north - n)) ** power);
    for (let k = 0; k < nz; k++) {
      const z = top - (k + 0.5) * dz;
      if (z > g || z < b) continue;
      const votes = new Map<number, number>();
      used.forEach((c, ci) => { const zn = zoneAt(c, z); if (zn) votes.set(zn, (votes.get(zn) ?? 0) + w[ci]); });
      let best = 0, bw = 0;
      for (const [zn, v] of votes) if (v > bw) { best = zn; bw = v; }
      if (best) { zone[i + nx * (j + ny * k)] = best; present.add(best); }
    }
  }
  return {
    origin, columns, ground, bearing,
    grid: { nx, ny, nz, east0: eMin, north0: nMin, dx, dy, topNap: top, dz, zone },
    zonesPresent: [...present].sort((a, b) => a - b),
    span, warnings,
  };
}

/**
 * Cellen die getekend moeten worden: zichtbaar en met minstens één zijde naar
 * een lege, verborgen of weggesneden buur. Het binnenste blijft weg, zodat
 * ook een fijn raster vlot draait.
 */
export function exposedCells(grid: VoxelGrid, show: (zone: number, i: number, j: number, k: number) => boolean): Map<number, number[]> {
  const { nx, ny, nz, zone } = grid;
  const on = (i: number, j: number, k: number) =>
    i >= 0 && j >= 0 && k >= 0 && i < nx && j < ny && k < nz && zone[i + nx * (j + ny * k)] !== 0 && show(zone[i + nx * (j + ny * k)], i, j, k);
  const out = new Map<number, number[]>();
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (!on(i, j, k)) continue;
    if (on(i - 1, j, k) && on(i + 1, j, k) && on(i, j - 1, k) && on(i, j + 1, k) && on(i, j, k - 1) && on(i, j, k + 1)) continue;
    const z = zone[i + nx * (j + ny * k)];
    const list = out.get(z) ?? [];
    list.push(i + nx * (j + ny * k));
    out.set(z, list);
  }
  return out;
}

export const zoneInfo = (n: number) => zones.find((z) => z.number === n);
