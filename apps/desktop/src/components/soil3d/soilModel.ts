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
//
// Vorm: het raster draait mee met de opstelling van de sonderingen (de
// kleinste omsluitende rechthoek), zodat een raster onder 45° geen schuin
// blok in een recht kader wordt. Cellen verder dan `reach` van de dichtstbij-
// zijnde sondering blijven leeg: het model ligt om de sonderingen heen.
import type { Cpt } from "../../types/cpt";
import { analyzeLayers } from "../../utils/layerAnalysis";
import { bearingLayerTop } from "../../utils/bearingLayer";
import { zones } from "../../utils/soilZones";
import { pt } from "../../utils/panelsI18n";

export interface ColumnLayer { topNap: number; bottomNap: number; zone: number; color: string; name: string }
export interface Column {
  id: string;
  /** Lokale coördinaten t.o.v. het modelmidden langs de assen van het model in m (zie `rotation`). */
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
  /**
   * Draaiing van de modelassen t.o.v. RD [rad], tegen de klok in: lokale `east` wijst in RD naar
   * (cos, sin). 0 = de assen van RD. Zie `toRd` en `fromRd`.
   */
  rotation: number;
  /** Cellen verder dan dit van de dichtstbijzijnde sondering zijn leeg [m]; null = hele rechthoek. */
  reach: number | null;
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
  /** false = rechthoekig blok langs RD, zoals vroeger. */
  fitShape?: boolean;
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
  const rd = withRd.map((c) => ({ x: c.position!.x_rd, y: c.position!.y_rd }));
  const rotation = allMissing || opts.fitShape === false ? 0 : fitRotation(rd);
  // Midden van de omsluitende rechthoek langs de modelassen.
  const cs = Math.cos(rotation), sn = Math.sin(rotation);
  const us = rd.map((p) => p.x * cs + p.y * sn), vs = rd.map((p) => -p.x * sn + p.y * cs);
  const uc = (Math.min(...us) + Math.max(...us)) / 2, vc = (Math.min(...vs) + Math.max(...vs)) / 2;
  const origin = allMissing ? { x: 0, y: 0 } : { x: uc * cs - vc * sn, y: uc * sn + vc * cs };
  const frame = { origin, rotation };

  const columns: Column[] = [];
  const missing = cpts.filter((c) => !withRd.includes(c));
  for (const c of withRd) { const p = fromRd(frame, c.position!.x_rd, c.position!.y_rd); columns.push({ ...cptColumn(c, opts), east: p.east, north: p.north, placed: true }); }
  if (missing.length) {
    if (allMissing) warnings.push(pt("soil3d.warn.noRd", "Geen RD-coördinaten: de sonderingen staan op een rij met 10 m tussenafstand."));
    else warnings.push(pt("soil3d.warn.missingRd", "Zonder RD-coördinaten (niet in het model): {{ids}}.", { ids: missing.map((c) => c.id).join(", ") }));
    const south = allMissing ? 0 : Math.min(...columns.map((c) => c.north)) - 10;
    missing.forEach((c, i) => columns.push({ ...cptColumn(c, opts), east: (i - (missing.length - 1) / 2) * 10, north: south, placed: allMissing }));
  }
  const used = columns.filter((c) => c.placed);
  for (const c of used) if (!c.layers.length) warnings.push(pt("soil3d.warn.noLayers", "Sondering {{id}} heeft geen laagindeling.", { id: c.id }));

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
  // Bereik om de sonderingen: de rand, of driekwart van de gangbare tussenafstand als die groter is.
  const reach = opts.fitShape === false || !used.length ? null : Math.max(margin, 0.75 * medianSpacing(used));
  const inReach = (e: number, n: number) => reach === null || used.some((c) => Math.hypot(c.east - e, c.north - n) <= reach + 1e-9);

  const surf = (pick: (c: Column) => number | null): Surface | null => {
    const pts = used.map((c) => ({ e: c.east, n: c.north, v: pick(c) })).filter((p): p is { e: number; n: number; v: number } => p.v !== null && Number.isFinite(p.v));
    if (!pts.length) return null;
    const values = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const e = eMin + (i + 0.5) * dx, n = nMin + (j + 0.5) * dy;
      values[i + nx * j] = inReach(e, n) ? idw(pts, e, n, power) : NaN;
    }
    return { nx, ny, east0: eMin, north0: nMin, dx, dy, values };
  };
  const ground = surf((c) => c.groundNap)!;
  const bottom = surf((c) => c.endNap)!;
  const bearing = surf((c) => c.bearingTopNap);
  const missingBearing = used.filter((c) => c.bearingTopNap === null).map((c) => c.id);
  if (bearing && missingBearing.length) warnings.push(pt("soil3d.warn.bearingPartial", "Draagkrachtige laag niet gevonden in {{ids}}; daar is het vlak geïnterpoleerd.", { ids: missingBearing.join(", ") }));
  if (!bearing) warnings.push(pt("soil3d.warn.bearingNone", "Draagkrachtige laag in geen enkele sondering gevonden."));

  const top = Math.max(...used.map((c) => c.groundNap)), low = Math.min(...used.map((c) => c.endNap));
  let dz = 0.5;
  if ((top - low) / dz > maxLayers) dz = (top - low) / maxLayers;
  const nz = Math.max(1, Math.ceil((top - low) / dz));
  const zone = new Uint8Array(nx * ny * nz);
  const present = new Set<number>();
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const e = eMin + (i + 0.5) * dx, n = nMin + (j + 0.5) * dy;
    const g = ground.values[i + nx * j], b = bottom.values[i + nx * j];
    if (!Number.isFinite(g) || !Number.isFinite(b)) continue;
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
    origin, rotation, reach, columns, ground, bearing,
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

/** Lokale modelcoördinaten naar RD. */
export function toRd(model: Pick<SoilModel, "origin" | "rotation">, east: number, north: number): { x: number; y: number } {
  const c = Math.cos(model.rotation ?? 0), s = Math.sin(model.rotation ?? 0);
  return { x: model.origin.x + east * c - north * s, y: model.origin.y + east * s + north * c };
}
/** RD naar lokale modelcoördinaten. */
export function fromRd(model: Pick<SoilModel, "origin" | "rotation">, x: number, y: number): { east: number; north: number } {
  const c = Math.cos(model.rotation ?? 0), s = Math.sin(model.rotation ?? 0), dx = x - model.origin.x, dy = y - model.origin.y;
  return { east: dx * c + dy * s, north: -dx * s + dy * c };
}
/** Omsluitende rechthoek in RD van een lokale rechthoek (de hoeken gedraaid). */
export function rdExtent(model: Pick<SoilModel, "origin" | "rotation">, e0: number, e1: number, n0: number, n1: number) {
  const pts = [toRd(model, e0, n0), toRd(model, e1, n0), toRd(model, e1, n1), toRd(model, e0, n1)];
  return { xmin: Math.min(...pts.map((p) => p.x)), ymin: Math.min(...pts.map((p) => p.y)), xmax: Math.max(...pts.map((p) => p.x)), ymax: Math.max(...pts.map((p) => p.y)) };
}

/** Convexe omhullende (monotone ketting), tegen de klok in, zonder dubbele punten. */
export function convexHull(points: { x: number; y: number }[]): { x: number; y: number }[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y).filter((p, i, a) => i === 0 || p.x !== a[i - 1].x || p.y !== a[i - 1].y);
  if (pts.length < 3) return pts;
  const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: typeof pts = [], upper: typeof pts = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  for (const p of [...pts].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/**
 * Draaiing van de modelassen: de richting van de zijde van de omhullende waarlangs de rechthoek om de
 * sonderingen (met rand) het kleinst is, binnen ±45°. Bijna langs RD (minder dan 2° of minder dan 5 % kleiner)
 * blijft het model recht.
 */
export function fitRotation(points: { x: number; y: number }[]): number {
  const hull = convexHull(points);
  if (hull.length < 2) return 0;
  const area = (a: number) => {
    const c = Math.cos(a), s = Math.sin(a);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const p of hull) { const u = p.x * c + p.y * s, v = -p.x * s + p.y * c; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const w = u1 - u0, h = v1 - v0, m = Math.max(5, 0.15 * Math.max(w, h));
    return (w + 2 * m) * (h + 2 * m);
  };
  const quarter = Math.PI / 2;
  const norm = (a: number) => { let r = a % quarter; if (r > quarter / 2) r -= quarter; if (r <= -quarter / 2) r += quarter; return r; };
  let best = 0, bestArea = area(0);
  for (let i = 0; i < hull.length; i++) {
    const p = hull[i], q = hull[(i + 1) % hull.length];
    const a = norm(Math.atan2(q.y - p.y, q.x - p.x)), ar = area(a);
    if (ar < bestArea - 1e-9) { best = a; bestArea = ar; }
  }
  if (Math.abs(best) < (2 * Math.PI) / 180 || bestArea > 0.95 * area(0)) return 0;
  return best;
}

/** Mediaan van de afstand van elke sondering tot haar dichtstbijzijnde buur; 0 bij één sondering. */
export function medianSpacing(cols: { east: number; north: number }[]): number {
  if (cols.length < 2) return 0;
  const d = cols.map((a, i) => Math.min(...cols.filter((_, j) => j !== i).map((b) => Math.hypot(a.east - b.east, a.north - b.north)))).sort((a, b) => a - b);
  return d[Math.floor(d.length / 2)];
}
