// Vlakke meetkunde van de plaatsingen: zijden van een bouwkuip, kant van de ontgraving, arcering, hoeken van een
// fundering. Werkt in elk rechthoekig assenstelsel met x naar rechts en y omhoog (RD of het lokale stelsel van het
// grondmodel), zolang alle punten in hetzelfde stelsel staan.
import type { RdXY, WallPlacement } from "./types";

export interface Vec { x: number; y: number }

/** Oppervlakte met teken (schoenveterformule): positief = tegen de klok in. */
export function signedArea(pts: Vec[]): number {
  let s = 0;
  for (let k = 0; k < pts.length; k++) {
    const a = pts[k], b = pts[(k + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/** Punt binnen een veelhoek (even-oneven-regel); punten precies op de rand tellen niet vast mee. */
export function pointInPolygon(p: Vec, poly: Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export interface Side { index: number; a: Vec; b: Vec; length: number; /** Eenheidsvector langs de zijde. */ t: Vec; /** Eenheidsnormaal naar de kant van de ontgraving. */ low: Vec }

/** Zijden van een damwandlijn, met per zijde de richting naar de ontgraving. */
export function wallSides(w: Pick<WallPlacement, "points" | "closed" | "excavation">, pts: Vec[] = w.points): Side[] {
  const n = pts.length, count = w.closed && n >= 3 ? n : n - 1;
  if (count < 1) return [];
  // Links van de tekenrichting is (−ty, tx). Bij een veelhoek tegen de klok in ligt het binnengebied links.
  const ccw = w.closed ? signedArea(pts) > 0 : true;
  const toLeft = w.closed ? (w.excavation === "inside") === ccw : w.excavation === "left";
  const out: Side[] = [];
  for (let k = 0; k < count; k++) {
    const a = pts[k], b = pts[(k + 1) % n];
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    if (len < 1e-9) continue;
    const t = { x: dx / len, y: dy / len };
    out.push({ index: k, a, b, length: len, t, low: toLeft ? { x: -t.y, y: t.x } : { x: t.y, y: -t.x } });
  }
  return out;
}

/** Ligt dit punt in de ontgraving van een gesloten bouwkuip? Een open lijn of ontgraving buiten de kuip: nee. */
export function inPit(w: Pick<WallPlacement, "closed" | "excavation">, poly: Vec[], p: Vec): boolean {
  return w.closed && w.excavation === "inside" && poly.length >= 3 && pointInPolygon(p, poly);
}

/**
 * Arcering van de damwand op de kerende (hoge) kant: schuine streepjes langs elke zijde, `spacing` uit elkaar,
 * `length` lang, onder 45°. Geeft lijnstukken [van, naar].
 */
export function wallHatch(w: Pick<WallPlacement, "points" | "closed" | "excavation">, spacing = 1, length = 0.6, pts: Vec[] = w.points): Array<[Vec, Vec]> {
  const out: Array<[Vec, Vec]> = [];
  const c = Math.SQRT1_2;
  for (const s of wallSides(w, pts)) {
    const count = Math.max(1, Math.floor(s.length / spacing));
    const step = s.length / count;
    for (let k = 0; k < count; k++) {
      const d = (k + 0.5) * step;
      const p = { x: s.a.x + s.t.x * d, y: s.a.y + s.t.y * d };
      // Van de wand af naar de hoge kant, en een stukje mee langs de wand.
      const q = { x: p.x + length * (-s.low.x * c + s.t.x * c), y: p.y + length * (-s.low.y * c + s.t.y * c) };
      out.push([p, q]);
    }
  }
  return out;
}

/** Hoeken van een rechthoek met middelpunt, breedte (dwars), lengte (langs de as) en draaiing van de lengteas [°]. */
export function rectangleCorners(cx: number, cy: number, widthM: number, lengthM: number, angleDeg: number): Vec[] {
  const a = (angleDeg * Math.PI) / 180, u = { x: Math.cos(a), y: Math.sin(a) }, v = { x: -u.y, y: u.x };
  const hl = lengthM / 2, hw = widthM / 2;
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => ({ x: cx + u.x * hl * i + v.x * hw * j, y: cy + u.y * hl * i + v.y * hw * j }));
}

/** Afstand langs een straal tot de eerste rand van een veelhoek (verder dan `minT`); null als hij niets raakt. */
export function rayToPolygon(o: Vec, d: Vec, poly: Vec[], minT = 1e-6): number | null {
  let best: number | null = null;
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k], b = poly[(k + 1) % poly.length];
    const ex = b.x - a.x, ey = b.y - a.y, den = d.x * ey - d.y * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((a.x - o.x) * ey - (a.y - o.y) * ex) / den;
    const u = ((a.x - o.x) * d.y - (a.y - o.y) * d.x) / den;
    if (t > minT && u >= -1e-9 && u <= 1 + 1e-9 && (best === null || t < best)) best = t;
  }
  return best;
}

/** Punten op een cirkel (gesloten veelhoek), voor het paalsymbool in de CAD-export. */
export function circlePoints(x: number, y: number, r: number, n = 16): Vec[] {
  return Array.from({ length: n }, (_, k) => ({ x: x + r * Math.cos((2 * Math.PI * k) / n), y: y + r * Math.sin((2 * Math.PI * k) / n) }));
}

/** Zwaartepunt van een reeks punten (gemiddelde), voor labels en de camera. */
export function centroid(pts: RdXY[]): Vec {
  if (!pts.length) return { x: 0, y: 0 };
  return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
}

/** Lengte van een lijn of de omtrek van een veelhoek [m]. */
export function polylineLength(pts: Vec[], closed: boolean): number {
  let s = 0;
  const count = closed && pts.length >= 3 ? pts.length : pts.length - 1;
  for (let k = 0; k < count; k++) { const a = pts[k], b = pts[(k + 1) % pts.length]; s += Math.hypot(b.x - a.x, b.y - a.y); }
  return s;
}
