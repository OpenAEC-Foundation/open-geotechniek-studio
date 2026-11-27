// Contour van een damwandprofiel in de plattegrond van de wand: één functie voor alle tekeningen (doorsnede,
// detail, 3D), zodat het profiel overal hetzelfde is.
//
// Wat uit de profieltabellen komt en dus maatvast is: de plankbreedte b, de wandhoogte h, de flensdikte t en de
// lijfdikte s, en de plaats van het slot per soort (Z: aan de flens op de buitenvezel; U: op de neutrale lijn).
// De openbare tabellen van de fabrikanten geven de breedte van de flens, de hoek van het lijf, de afrondingen
// en de vorm van het slot niet. Staat de flensbreedte wel in de bibliotheek (veld `flangeWidthMm`), dan wordt
// die gebruikt. Anders wordt zij afgeleid uit de doorsnede A en het traagheidsmoment I van de tabel: de
// flensbreedte waarbij vlakke platen met de diktes t en s, plus het slot als puntmassa, precies die A en I
// geven. Dat is een afgeleide maat, geen fabrieksmaat, en de tekening heet dan "schematisch". Lukt ook dat
// niet (hoedprofielen, ontbrekende waarden), dan krijgt de flens een vast deel van de plankbreedte.
import type { SheetPileProfile } from "./sheetPiles";

export interface Pt { x: number; y: number }
export type ContourBasis = "table" | "derived" | "schematic";

export interface SheetGeometry {
  /** Waar de flensbreedte vandaan komt: uit de tabel, afgeleid uit A en I, of een vast deel van de breedte. */
  basis: ContourBasis;
  /** Breedte van de flens tussen de snijpunten van de hartlijnen [mm]: bij Z de twee halve flenzen samen. */
  flangeMm: number;
  /** Hoek van het lijf met de as van de wand [°]. */
  webAngleDeg: number;
  /** Doorsnede van één slot [mm²]; 0 als die niet is bepaald. */
  lockAreaMm2: number;
  widthMm: number;
  heightMm: number;
  flangeThicknessMm: number;
  webThicknessMm: number;
}

type ProfileLike = Pick<SheetPileProfile, "shape" | "widthMm" | "wallHeightMm"> & Partial<Pick<SheetPileProfile, "flangeMm" | "webMm" | "areaCm2PerM" | "iCm4PerM" | "flangeWidthMm">>;

/** Vast deel van de plankbreedte voor de flens als er niets af te leiden valt. */
const SCHEMATIC_FLANGE = 0.4;

/** A [mm²] en I [mm⁴] per golf (twee planken) van vlakke platen met een slot als puntmassa. */
function plateProperties(shape: "Z" | "U", b: number, h: number, t: number, s: number, f: number, lock: number): { area: number; inertia: number } {
  const d = (h - t) / 2;
  if (shape === "Z") {
    const web = Math.hypot(b - f, 2 * d);
    return { area: 2 * f * t + 2 * web * s + 2 * lock, inertia: 2 * f * t * d * d + (2 * f * t ** 3) / 12 + (2 * s * web * (2 * d) ** 2) / 12 + 2 * lock * d * d };
  }
  const web = Math.hypot((b - f) / 2, d);
  return { area: 2 * f * t + 4 * web * s + 2 * lock, inertia: 2 * f * t * d * d + (2 * f * t ** 3) / 12 + (4 * s * web * d * d) / 3 };
}

export function sheetGeometry(p: ProfileLike): SheetGeometry {
  const b = p.widthMm ?? 500, h = p.shape === "straight" ? 0 : p.wallHeightMm ?? 0;
  const t = p.flangeMm ?? p.webMm ?? 10, s = p.webMm ?? p.flangeMm ?? 10, d = Math.max(0, (h - t) / 2);
  const angle = (f: number) => (p.shape === "Z" ? Math.atan2(2 * d, b - f) : Math.atan2(d, (b - f) / 2)) * (180 / Math.PI);
  const base = { widthMm: b, heightMm: h, flangeThicknessMm: t, webThicknessMm: s };
  const schematic = (): SheetGeometry => ({ ...base, basis: "schematic", flangeMm: SCHEMATIC_FLANGE * b, webAngleDeg: p.shape === "straight" ? 0 : angle(SCHEMATIC_FLANGE * b), lockAreaMm2: 0 });
  if (p.shape !== "Z" && p.shape !== "U") return schematic();
  const complete = p.flangeMm != null && p.webMm != null && p.areaCm2PerM != null && p.iCm4PerM != null && h > t;
  // Per golf van twee planken: A en I van de tabel zijn per m wand.
  const areaTotal = (p.areaCm2PerM ?? 0) * 100 * ((2 * b) / 1000), inertiaTotal = (p.iCm4PerM ?? 0) * 1e4 * ((2 * b) / 1000);
  const lockFor = (f: number) => (areaTotal - plateProperties(p.shape as "Z" | "U", b, h, t, s, f, 0).area) / 2;
  if (p.flangeWidthMm != null && p.flangeWidthMm > 0 && p.flangeWidthMm < b) return { ...base, basis: "table", flangeMm: p.flangeWidthMm, webAngleDeg: angle(p.flangeWidthMm), lockAreaMm2: complete ? Math.max(0, lockFor(p.flangeWidthMm)) : 0 };
  if (!complete) return schematic();
  // Bij U ligt het slot op de neutrale lijn en telt het niet mee in I; bij Z op de buitenvezel, en volgt het uit A.
  const inertiaAt = (f: number) => plateProperties(p.shape as "Z" | "U", b, h, t, s, f, p.shape === "Z" ? lockFor(f) : 0).inertia;
  let lo = 0.05 * b, hi = 0.95 * b;
  if (!(inertiaAt(lo) < inertiaTotal && inertiaAt(hi) > inertiaTotal)) return schematic();
  for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (inertiaAt(mid) < inertiaTotal) lo = mid; else hi = mid; }
  const f = (lo + hi) / 2, lock = lockFor(f);
  // Een negatief slot of een slot groter dan een kwart van de doorsnede betekent dat het platenmodel niet past.
  if (!(lock >= 0 && 2 * lock <= 0.5 * areaTotal)) return schematic();
  return { ...base, basis: "derived", flangeMm: f, webAngleDeg: angle(f), lockAreaMm2: lock };
}

export interface SheetContour {
  geometry: SheetGeometry;
  /** Hartlijn per plank [mm]: x langs de wand vanaf 0, y dwars op de wand om de as van de wand. */
  centerlines: Pt[][];
  /** Gesloten omtrek van elke plank, met de plaatdikten. */
  plates: Pt[][];
  /** Sloten als blokje met de doorsnede van het slot; de vorm is schematisch. */
  locks: Pt[][];
  /** Plaats van de sloten. */
  lockPoints: Pt[];
  widthMm: number;
}

/** Omtrek van een strook met per stuk een eigen dikte, met verstek in de knikken. */
export function thicken(line: Pt[], thickness: number[]): Pt[] {
  const n = line.length, side = (sign: 1 | -1): Pt[] => {
    const out: Pt[] = [];
    for (let k = 0; k < n; k++) {
      const seg = (j: number) => { const a = line[j], c = line[j + 1], l = Math.hypot(c.x - a.x, c.y - a.y) || 1, nx = (-(c.y - a.y) / l) * sign * (thickness[j] / 2), ny = ((c.x - a.x) / l) * sign * (thickness[j] / 2); return { ax: a.x + nx, ay: a.y + ny, dx: c.x - a.x, dy: c.y - a.y }; };
      if (k === 0) { const s0 = seg(0); out.push({ x: s0.ax, y: s0.ay }); continue; }
      if (k === n - 1) { const s1 = seg(n - 2); out.push({ x: s1.ax + s1.dx, y: s1.ay + s1.dy }); continue; }
      const p = seg(k - 1), q = seg(k), det = p.dx * q.dy - p.dy * q.dx;
      if (Math.abs(det) < 1e-9) { out.push({ x: q.ax, y: q.ay }); continue; }
      const u = ((q.ax - p.ax) * q.dy - (q.ay - p.ay) * q.dx) / det;
      out.push({ x: p.ax + u * p.dx, y: p.ay + u * p.dy });
    }
    return out;
  };
  return [...side(1), ...side(-1).reverse()];
}

const square = (c: Pt, side: number): Pt[] => [{ x: c.x - side / 2, y: c.y - side / 2 }, { x: c.x + side / 2, y: c.y - side / 2 }, { x: c.x + side / 2, y: c.y + side / 2 }, { x: c.x - side / 2, y: c.y + side / 2 }];

/** De wand in de plattegrond: `planks` planken naast elkaar, om en om gespiegeld. */
export function sheetContour(p: ProfileLike, planks = 2): SheetContour {
  const g = sheetGeometry(p), b = g.widthMm, t = g.flangeThicknessMm, s = g.webThicknessMm, d = Math.max(0, (g.heightMm - t) / 2), f = g.flangeMm;
  const centerlines: Pt[][] = [], plates: Pt[][] = [], lockPoints: Pt[] = [];
  for (let k = 0; k < planks; k++) {
    const x0 = k * b, sign = k % 2 ? -1 : 1;
    let line: Pt[], thickness: number[], ends: [number, number];
    if (p.shape === "Z") { line = [{ x: x0, y: sign * d }, { x: x0 + f / 2, y: sign * d }, { x: x0 + b - f / 2, y: -sign * d }, { x: x0 + b, y: -sign * d }]; thickness = [t, s, t]; ends = [sign * d, -sign * d]; }
    else if (p.shape === "hat") { line = [{ x: x0, y: -d }, { x: x0 + 0.15 * b, y: -d }, { x: x0 + 0.3 * b, y: d }, { x: x0 + 0.7 * b, y: d }, { x: x0 + 0.85 * b, y: -d }, { x: x0 + b, y: -d }]; thickness = [t, s, t, s, t]; ends = [-d, -d]; }
    else if (p.shape === "straight") { line = [{ x: x0, y: 0 }, { x: x0 + b, y: 0 }]; thickness = [s]; ends = [0, 0]; }
    else { const run = (b - f) / 2; line = [{ x: x0, y: 0 }, { x: x0 + run, y: sign * d }, { x: x0 + run + f, y: sign * d }, { x: x0 + b, y: 0 }]; thickness = [s, t, s]; ends = [0, 0]; }
    centerlines.push(line); plates.push(thicken(line, thickness));
    lockPoints.push({ x: x0, y: ends[0] }); if (k === planks - 1) lockPoints.push({ x: x0 + b, y: ends[1] });
  }
  // Zonder bepaalde slotdoorsnede een blokje van tweemaal de plaatdikte, alleen als aanduiding.
  const side = g.lockAreaMm2 > 0 ? Math.sqrt(g.lockAreaMm2) : 2 * Math.max(t, s);
  return { geometry: g, centerlines, plates, locks: lockPoints.map((c) => square(c, side)), lockPoints, widthMm: planks * b };
}

/** Oppervlak [mm²] en traagheidsmoment om de as van de wand (y = 0) [mm⁴] van gesloten omtrekken. */
export function contourProperties(polygons: Pt[][]): { areaMm2: number; inertiaMm4: number } {
  let area = 0, inertia = 0;
  for (const poly of polygons) {
    let a = 0, i = 0;
    for (let k = 0; k < poly.length; k++) { const p = poly[k], q = poly[(k + 1) % poly.length], cross = p.x * q.y - q.x * p.y; a += cross / 2; i += ((p.y * p.y + p.y * q.y + q.y * q.y) * cross) / 12; }
    area += Math.abs(a); inertia += Math.abs(i);
  }
  return { areaMm2: area, inertiaMm4: inertia };
}

/**
 * A [cm²/m] en I [cm⁴/m] per m wand zoals ze uit de getekende contour volgen. Een slot dat halverwege de
 * getekende strook ligt telt één keer; de sloten op de rand van de strook tellen samen als één.
 */
export function contourSectionProperties(p: ProfileLike): { areaCm2PerM: number; iCm4PerM: number } {
  const c = sheetContour(p, 2), plates = contourProperties(c.plates), locks = contourProperties(c.locks.slice(0, 2)), width = c.widthMm / 1000;
  return { areaCm2PerM: (plates.areaMm2 + locks.areaMm2) / 100 / width, iCm4PerM: (plates.inertiaMm4 + locks.inertiaMm4) / 1e4 / width };
}
