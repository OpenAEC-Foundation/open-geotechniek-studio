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
//
// Voor de profielen in sheet-pile-contours.json gaat de exacte contour voor: de omtrek van de planken zoals de
// openbare CAD-tekening van de fabrikant hem geeft, met de sloten erin (basis "drawing"). Die contour is per
// profiel getoetst: A en I eruit binnen 3 % en 5 % van de profieltabel (zie sheetPileContour.test.ts).
import type { SheetPileProfile } from "./sheetPiles";
import contourData from "./sheet-pile-contours.json";

export interface Pt { x: number; y: number }
export type ContourBasis = "drawing" | "table" | "derived" | "schematic";

/** Exacte contour uit de CAD-tekening van de fabrikant (schema ogs.sheetpilecontours/1). */
export interface DrawingContour {
  manufacturer: string;
  /** Bestand in de download (bij een zip: het pad in de zip). */
  file: string;
  archive?: string;
  url: string;
  dwgUrl?: string;
  /** Ophaaldatum (ISO). */
  retrieved: string;
  /** Breedte van de getekende strook [mm]: het aantal getekende planken maal b. */
  pitchMm: number;
  /** Per getekende plank een gesloten omtrek [x0, y0, x1, y1, ...] in mm; y = 0 is de as van de wand. */
  planks: number[][];
  lockAxes: number[][];
}

const DRAWINGS = (contourData as unknown as { contours: Record<string, DrawingContour> }).contours;

/** De exacte contour van een profiel, als de bibliotheek die heeft. */
export function drawingContour(p: { id?: string; manufacturer?: string }): DrawingContour | undefined {
  const c = p.id ? DRAWINGS[p.id] : undefined;
  return c && (!p.manufacturer || c.manufacturer === p.manufacturer) ? c : undefined;
}

export const DRAWING_CONTOUR_IDS: readonly string[] = Object.keys(DRAWINGS);

const toPts = (flat: number[]): Pt[] => { const out: Pt[] = []; for (let k = 0; k + 1 < flat.length; k += 2) out.push({ x: flat[k], y: flat[k + 1] }); return out; };

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

type ProfileLike = Pick<SheetPileProfile, "shape" | "widthMm" | "wallHeightMm"> & Partial<Pick<SheetPileProfile, "id" | "manufacturer" | "flangeMm" | "webMm" | "areaCm2PerM" | "iCm4PerM" | "flangeWidthMm">>;

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

/**
 * De wand in de plattegrond: `planks` planken naast elkaar, om en om gespiegeld. Met een exacte contour (en
 * `exact` niet uit) zijn de platen de getekende planken, herhaald per getekende strook, met de sloten erin; de
 * hartlijn en de slotpunten blijven de schematische, zo gespiegeld dat ze bij de tekening passen.
 */
export function sheetContour(p: ProfileLike, planks = 2, options: { exact?: boolean } = {}): SheetContour {
  const schematic = schematicContour(p, planks), drawing = options.exact === false ? undefined : drawingContour(p);
  if (!drawing) return schematic;
  const drawn = drawing.planks.map(toPts), b = schematic.geometry.widthMm, plates: Pt[][] = [];
  for (let k = 0; k < planks; k++) { const shift = Math.floor(k / drawn.length) * drawing.pitchMm; plates.push(drawn[k % drawn.length].map((q) => ({ x: q.x + shift, y: q.y }))); }
  // Ligt de schematische hartlijn aan de andere kant van de as dan de getekende plank, dan wordt zij gespiegeld.
  let agree = 0;
  schematic.centerlines.slice(0, drawn.length).forEach((line, k) => { for (const q of line) { const near = drawn[k].filter((r) => Math.abs(r.x - q.x) < 0.08 * b); if (near.length) agree += q.y * (near.reduce((s, r) => s + r.y, 0) / near.length); } });
  const flip = (q: Pt): Pt => (agree < 0 ? { x: q.x, y: -q.y } : q);
  return { ...schematic, geometry: { ...schematic.geometry, basis: "drawing" }, plates, locks: [], centerlines: schematic.centerlines.map((l) => l.map(flip)), lockPoints: schematic.lockPoints.map(flip) };
}

function schematicContour(p: ProfileLike, planks: number): SheetContour {
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
export function contourSectionProperties(p: ProfileLike, options: { exact?: boolean } = {}): { areaCm2PerM: number; iCm4PerM: number } {
  const { polygons, widthMm } = sectionPolygons(p, options), props = contourProperties(polygons), width = widthMm / 1000;
  return { areaCm2PerM: props.areaMm2 / 100 / width, iCm4PerM: props.inertiaMm4 / 1e4 / width };
}

/** De omtrekken van één herhalende strook wand: de getekende strook, of twee schematische planken met hun sloten. */
export function sectionPolygons(p: ProfileLike, options: { exact?: boolean }): { polygons: Pt[][]; widthMm: number } {
  const drawing = options.exact === false ? undefined : drawingContour(p);
  if (drawing) return { polygons: drawing.planks.map(toPts), widthMm: drawing.pitchMm };
  const c = sheetContour(p, 2, { exact: false });
  return { polygons: [...c.plates, ...c.locks.slice(0, 2)], widthMm: c.widthMm };
}

/** Oppervlak en eerste moment om de lijn y = y0 van het deel van een omtrek boven (of onder) die lijn. */
function clipMoment(poly: Pt[], y0: number, above: boolean): { area: number; moment: number } {
  const keep = (q: Pt) => (above ? q.y >= y0 : q.y <= y0), out: Pt[] = [];
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k], b = poly[(k + 1) % poly.length];
    if (keep(a)) out.push(a);
    if (keep(a) !== keep(b)) { const t = (y0 - a.y) / (b.y - a.y); out.push({ x: a.x + t * (b.x - a.x), y: y0 }); }
  }
  let area = 0, moment = 0;
  for (let k = 0; k < out.length; k++) { const a = out[k], b = out[(k + 1) % out.length], cross = a.x * b.y - b.x * a.y; area += cross / 2; moment += ((a.y - y0 + b.y - y0) * cross) / 6; }
  return { area: Math.abs(area), moment: Math.abs(moment) };
}

/**
 * Weerstandsmomenten per m wand uit de contour: elastisch W_el = I / e met e de afstand van de zwaartelijn tot de
 * uiterste vezel, en plastisch W_pl = S_boven + S_onder om de plastische neutrale lijn (gelijke oppervlakken).
 */
export function contourModuli(p: ProfileLike, options: { exact?: boolean } = {}): { welCm3PerM: number; wplCm3PerM: number; neutralAxisMm: number; plasticAxisMm: number } {
  const { polygons, widthMm } = sectionPolygons(p, options), m = polygonModuli(polygons, widthMm);
  return { welCm3PerM: m.welCm3PerM, wplCm3PerM: m.wplCm3PerM, neutralAxisMm: m.neutralAxisMm, plasticAxisMm: m.plasticAxisMm };
}

/**
 * Doorsnedegrootheden per m wand van gesloten omtrekken over een strook van `widthMm`: A, I om de eigen zwaartelijn,
 * W_el = I / e en W_pl om de plastische neutrale lijn. Ook voor omtrekken die niet uit de bibliotheek komen, zoals een
 * contour na afroesting.
 */
export function polygonModuli(polygons: Pt[][], widthMm: number): { areaCm2PerM: number; iCm4PerM: number; welCm3PerM: number; wplCm3PerM: number; neutralAxisMm: number; plasticAxisMm: number; extremeMm: number } {
  const width = widthMm / 1000;
  let area = 0, first = 0, second = 0;
  for (const poly of polygons) {
    let a = 0, s = 0, i = 0;
    for (let k = 0; k < poly.length; k++) { const u = poly[k], v = poly[(k + 1) % poly.length], cross = u.x * v.y - v.x * u.y; a += cross / 2; s += ((u.y + v.y) * cross) / 6; i += ((u.y * u.y + u.y * v.y + v.y * v.y) * cross) / 12; }
    const sign = a < 0 ? -1 : 1; area += sign * a; first += sign * s; second += sign * i;
  }
  const yc = first / area, inertia = second - area * yc * yc, ys = polygons.flat().map((q) => q.y), e = Math.max(...ys.map((y) => Math.abs(y - yc)));
  let lo = Math.min(...ys), hi = Math.max(...ys);
  for (let k = 0; k < 80; k++) { const mid = (lo + hi) / 2, up = polygons.reduce((s, poly) => s + clipMoment(poly, mid, true).area, 0); if (up > area / 2) lo = mid; else hi = mid; }
  const yp = (lo + hi) / 2, plastic = polygons.reduce((s, poly) => s + clipMoment(poly, yp, true).moment + clipMoment(poly, yp, false).moment, 0);
  return { areaCm2PerM: area / 100 / width, iCm4PerM: inertia / 1e4 / width, welCm3PerM: inertia / e / 1e3 / width, wplCm3PerM: plastic / 1e3 / width, neutralAxisMm: yc, plasticAxisMm: yp, extremeMm: e };
}
