import type { Cpt } from "../types/cpt";
import { analyzeLayers } from "./layerAnalysis";

/**
 * Indicatief 3D-ondergrondmodel uit sonderingen.
 *
 * Per sondering wordt de (indicatieve of handmatige) laagindeling in NAP
 * omgerekend. Het voxelraster krijgt per cel de grondsoort met de hoogste
 * inverse-afstandsgewogen stem van de sonderingen die op dat NAP-niveau
 * een laag hebben. Maaiveld en onderkant worden op dezelfde manier
 * geïnterpoleerd. Het model is een visualisatie, geen geostatistische
 * schematisatie: tussen sonderingen is de indeling een aanname.
 */

export interface ModelLayer {
  /** Bovenkant in m NAP. */
  top: number;
  /** Onderkant in m NAP. */
  bottom: number;
  zone: number;
}

export interface ModelCpt {
  id: string;
  name: string;
  x: number;
  y: number;
  /** Maaiveld in m NAP. */
  surface: number;
  /** Einddiepte in m NAP. */
  bottom: number;
  layers: ModelLayer[];
}

export interface VoxelGrid {
  /** RD-coördinaat van de hoek (minimale x, y) van het raster. */
  x0: number;
  y0: number;
  /** NAP-niveau van de bovenkant van de bovenste cellaag. */
  zTop: number;
  nx: number;
  ny: number;
  nz: number;
  dx: number;
  dz: number;
  /** Zone per cel (0 = leeg), index = ix + nx * (iy + ny * iz). */
  cells: Uint8Array;
}

export interface SubsurfaceModel {
  cpts: ModelCpt[];
  grid: VoxelGrid | null;
  /** Sonderingen zonder bruikbare RD-positie. */
  skipped: string[];
  zones: number[];
}

export interface SubsurfaceOptions {
  /** Horizontale celgrootte in m; standaard afgeleid van de omvang. */
  cellSize?: number;
  /** Verticale celgrootte in m. */
  layerThickness?: number;
  /** Rand rond de sonderingen in m. */
  marginM?: number;
  /** IDW-macht. */
  power?: number;
  /** Maximaal aantal cellen per horizontale richting. */
  maxCellsXY?: number;
}

export function cptName(cpt: Cpt): string {
  const src = cpt.metadata.source_file?.replace(/^.*[\\/]/, "") ?? "";
  return src.replace(/\.[^.]+$/, "") || cpt.id;
}

export function toModelCpt(cpt: Cpt): ModelCpt | null {
  const p = cpt.position;
  if (!p || !Number.isFinite(p.x_rd) || !Number.isFinite(p.y_rd)) return null;
  if (p.x_rd === 0 && p.y_rd === 0) return null;
  const surface = p.z_nap ?? cpt.metadata.ground_level_nap ?? 0;
  const { layers } = analyzeLayers(cpt);
  const maxDepth = cpt.points.reduce(
    (m, pt) => (Number.isFinite(pt.depth) ? Math.max(m, pt.depth) : m),
    0,
  );
  const modelLayers = layers.map((l) => ({
    top: surface - l.depth_top,
    bottom: surface - l.depth_bottom,
    zone: l.zone_number,
  }));
  return {
    id: cpt.id,
    name: cptName(cpt),
    x: p.x_rd,
    y: p.y_rd,
    surface,
    bottom: surface - maxDepth,
    layers: modelLayers,
  };
}

function zoneAt(c: ModelCpt, z: number): number {
  for (const l of c.layers) if (z <= l.top && z >= l.bottom) return l.zone;
  // Kleine gaten (ongeclassificeerde punten) overbruggen met de dichtstbijzijnde laag.
  let best = 0;
  let bestDist = 0.5;
  for (const l of c.layers) {
    const d = z > l.top ? z - l.top : l.bottom - z;
    if (d < bestDist) {
      bestDist = d;
      best = l.zone;
    }
  }
  return best;
}

export function buildSubsurfaceModel(
  input: Cpt[],
  options: SubsurfaceOptions = {},
): SubsurfaceModel {
  const cpts: ModelCpt[] = [];
  const skipped: string[] = [];
  for (const cpt of input) {
    const m = toModelCpt(cpt);
    if (m && m.layers.length) cpts.push(m);
    else skipped.push(cptName(cpt));
  }
  const zoneSet = new Set<number>();
  cpts.forEach((c) => c.layers.forEach((l) => zoneSet.add(l.zone)));
  const zones = [...zoneSet].sort((a, b) => a - b);
  if (!cpts.length) return { cpts, grid: null, skipped, zones };

  const power = options.power ?? 2;
  const minX = Math.min(...cpts.map((c) => c.x));
  const maxX = Math.max(...cpts.map((c) => c.x));
  const minY = Math.min(...cpts.map((c) => c.y));
  const maxY = Math.max(...cpts.map((c) => c.y));
  const span = Math.max(maxX - minX, maxY - minY);
  const margin = options.marginM ?? Math.max(3, span * 0.15);
  const maxCells = options.maxCellsXY ?? 48;
  const dx =
    options.cellSize ?? Math.max(0.5, (span + 2 * margin) / maxCells);
  const dz = options.layerThickness ?? 0.25;
  const x0 = minX - margin;
  const y0 = minY - margin;
  const nx = Math.max(1, Math.ceil((maxX - minX + 2 * margin) / dx));
  const ny = Math.max(1, Math.ceil((maxY - minY + 2 * margin) / dx));
  const zTop = Math.ceil(Math.max(...cpts.map((c) => c.surface)) / dz) * dz;
  const zBot = Math.floor(Math.min(...cpts.map((c) => c.bottom)) / dz) * dz;
  const nz = Math.max(1, Math.round((zTop - zBot) / dz));
  const cells = new Uint8Array(nx * ny * nz);
  const votes = new Float64Array(10);

  for (let iy = 0; iy < ny; iy++) {
    const y = y0 + (iy + 0.5) * dx;
    for (let ix = 0; ix < nx; ix++) {
      const x = x0 + (ix + 0.5) * dx;
      const w = cpts.map((c) => {
        const d = Math.hypot(c.x - x, c.y - y);
        return d < 1e-6 ? 1e12 : 1 / Math.pow(d, power);
      });
      const wSum = w.reduce((a, b) => a + b, 0);
      let surface = 0;
      let bottom = 0;
      cpts.forEach((c, i) => {
        surface += (w[i] * c.surface) / wSum;
        bottom += (w[i] * c.bottom) / wSum;
      });
      for (let iz = 0; iz < nz; iz++) {
        const z = zTop - (iz + 0.5) * dz;
        if (z > surface || z < bottom) continue;
        votes.fill(0);
        cpts.forEach((c, i) => {
          const zone = zoneAt(c, z);
          if (zone) votes[zone] += w[i];
        });
        let best = 0;
        for (let k = 1; k < votes.length; k++)
          if (votes[k] > votes[best]) best = k;
        if (votes[best] > 0) cells[ix + nx * (iy + ny * iz)] = best;
      }
    }
  }
  return {
    cpts,
    grid: { x0, y0, zTop, nx, ny, nz, dx, dz, cells },
    skipped,
    zones,
  };
}
