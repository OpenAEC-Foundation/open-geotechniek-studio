// Verenmodel van de wand: een elastisch ondersteunde ligger met aan beide zijden grondveren die bij de
// neutrale gronddruk beginnen en begrensd zijn door de actieve en de passieve gronddruk.
//
// De ligger zelf wordt opgelost door de lineaire liggeroplosser van de module voor horizontaal belaste palen
// (beam.ts). Die kent per element een constante bedding en een constante lijnlast; daarmee wordt de
// tweezijdige, begrensde veer per element geschreven als "bedding + lijnlast" en itereert dit bestand over de
// tak waarop elke veer staat tot die niet meer verandert.
//
// De veer is een stuksgewijs rechte lijn tussen de actieve en de passieve grens: één tak met één
// beddingsconstante, of drie takken volgens CUR 166. Bij drie takken zijn k1, k2 en k3 secanswaarden vanaf het
// actieve punt: de druk bereikt 50 %, 80 % en 100 % van het verschil tussen passief en actief na een
// verplaatsing van 0,5·Δp/k1, 0,8·Δp/k2 en Δp/k3. De lijn wordt zo verschoven dat hij bij y = 0 door de
// neutrale druk gaat.
//
// Tekens: z omlaag vanaf de bovenkant van de wand, verplaatsing y positief naar de lage zijde. De hoge zijde
// (links) duwt in +y, de lage zijde (rechts) in −y. Alles per strekkende meter wand: kN/m, kNm/m, kPa.
import { solveBeam, type BeamResult } from "../laterally-loaded-pile/beam";

export interface SideSpring {
  /** Neutrale korreldruk bij y = 0 [kPa]. */
  p0: number;
  /** Ondergrens (actief) en bovengrens (passief) van de korreldruk [kPa]. */
  pa: number;
  pp: number;
  /** Beddingsconstante [kN/m³]; bij drie takken de eerste (tot 50 %). */
  k: number;
  /** Tweede en derde tak [kN/m³] (tot 80 % en tot 100 %); beide nodig voor de drietakkige veer. */
  k2?: number;
  k3?: number;
  /**
   * Verplaatsing naar de grond toe waarbij de druk p0 is [m]; standaard 0. In een volgende bouwfase begint de veer
   * op de vervormde stand van de vorige fase: p0 is dan de druk aan het eind van die fase en w0 de verplaatsing daar.
   */
  w0?: number;
}

export interface WallElement {
  topM: number;
  bottomM: number;
  left: SideSpring | null;
  right: SideSpring | null;
  /** Belasting die niet van de verplaatsing afhangt, positief naar de lage zijde [kPa] (waterdrukverschil). */
  loadKpa: number;
  /** Extra lineaire veer in dit element [kN/m²]: het anker of de stempel, uitgesmeerd over de elementlengte. */
  supportKnM2?: number;
  /** Kracht van die veer bij y = 0 [kN/m per m elementlengte], positief tegen +y in: de voorspanning. */
  supportPreloadKnM?: number;
}

export type SpringState = "elastic" | "active" | "passive";

export interface WallElementResult {
  yM: number;
  left: { state: SpringState; branch: number; pressureKpa: number } | null;
  right: { state: SpringState; branch: number; pressureKpa: number } | null;
  /** Kracht in de steun in dit element [kN/m], positief als de steun de wand tegenhoudt. */
  supportKnM: number;
}

export interface SpringWallResult {
  beam: BeamResult;
  elements: WallElementResult[];
  iterations: number;
  converged: boolean;
  /** Kracht die de veren boven hun grens zouden moeten leveren [kN/m]; vrijwel nul bij evenwicht. */
  excessKn: number;
}

/** Reststijfheid van een veer op zijn grens, als fractie van k: houdt het stelsel oplosbaar. */
const RESIDUAL = 1e-4;
const MAX_ITERATIONS = 300;

/** De veer als knikpunten (w, p): w is de verplaatsing naar de grond toe, p loopt van actief naar passief. */
interface Curve { w: number[]; p: number[]; residual: number }

export function springCurve(s: SideSpring): Curve {
  const delta = s.pp - s.pa, residual = RESIDUAL * Math.max(s.k, 1e-9), w0 = s.w0 ?? 0;
  if (!(delta > 1e-12) || !(s.k > 0)) return { w: [w0], p: [s.pa], residual };
  const p0 = Math.max(s.pa, Math.min(s.pp, s.p0));
  if (!(s.k2 && s.k3 && s.k2 > 0 && s.k3 > 0)) return { w: [(s.pa - p0) / s.k + w0, (s.pp - p0) / s.k + w0], p: [s.pa, s.pp], residual };
  // Drie takken, verplaatsing gemeten vanaf het actieve punt; een tak mag niet teruglopen.
  const r1 = (0.5 * delta) / s.k, r2 = Math.max(r1 * 1.0001, (0.8 * delta) / s.k2), r3 = Math.max(r2 * 1.0001, delta / s.k3);
  const r = [0, r1, r2, r3], p = [s.pa, s.pa + 0.5 * delta, s.pa + 0.8 * delta, s.pp];
  let at = r3;
  for (let k = 1; k < 4; k++) if (p0 <= p[k]) { at = r[k - 1] + ((p0 - p[k - 1]) / (p[k] - p[k - 1])) * (r[k] - r[k - 1]); break; }
  return { w: r.map((v) => v - at + w0), p, residual };
}

/** Tak bij verplaatsing w: 0 = op de actieve grens, 1..n = de takken, n+1 = op de passieve grens. */
function branchOf(c: Curve, w: number): number {
  let b = 0;
  while (b < c.w.length && w > c.w[b] + 1e-15) b++;
  return b;
}

/**
 * Mag de veer op tak b blijven bij verplaatsing w? Ja als w binnen 0,1 µm van die tak ligt. Zonder die marge kan een veer
 * die precies op een knik staat (zoals aan het begin van een volgende fase) eindeloos tussen twee takken wisselen.
 */
const SETTLE_M = 1e-7;
function stays(c: Curve, b: number, w: number): boolean {
  const n = c.w.length;
  if (b === 0) return w <= c.w[0] + SETTLE_M;
  if (b === n) return w >= c.w[n - 1] - SETTLE_M;
  return w >= c.w[b - 1] - SETTLE_M && w <= c.w[b] + SETTLE_M;
}

/** Druk op de lijn (zonder reststijfheid), en het lineaire stuk p = load + spring·w van één tak. */
function pressureAt(c: Curve, w: number): number {
  const b = branchOf(c, w), n = c.w.length;
  if (b === 0) return c.p[0];
  if (b === n) return c.p[n - 1];
  return c.p[b - 1] + ((w - c.w[b - 1]) / (c.w[b] - c.w[b - 1])) * (c.p[b] - c.p[b - 1]);
}
function linear(c: Curve, b: number): { spring: number; load: number } {
  const n = c.w.length;
  if (b === 0) return { spring: c.residual, load: c.p[0] - c.residual * c.w[0] };
  if (b === n) return { spring: c.residual, load: c.p[n - 1] - c.residual * c.w[n - 1] };
  const spring = (c.p[b] - c.p[b - 1]) / (c.w[b] - c.w[b - 1]);
  return { spring, load: c.p[b - 1] - spring * c.w[b - 1] };
}

/**
 * Lost de wand op. `elements` sluiten op elkaar aan van z = 0 tot de teen; elk element is één liggerelement.
 * Gooit een fout als de ligger niet oplosbaar is (geen steun).
 */
export function solveSpringWall(input: { lengthM: number; eiKnM2: number; elements: WallElement[]; headForceKn?: number; headMomentKnM?: number }): SpringWallResult {
  const { elements } = input, n = elements.length;
  const curves = elements.map((e) => ({ left: e.left ? springCurve(e.left) : null, right: e.right ? springCurve(e.right) : null }));
  // Begin op de tak door de beginstand: de neutrale druk, of de stand aan het eind van de vorige fase.
  const start = (c: Curve | null, w0: number | undefined) => (c ? Math.max(1, Math.min(c.w.length - 1, branchOf(c, w0 ?? 0))) : 0);
  let left = curves.map((c, i) => start(c.left, elements[i].left?.w0)), right = curves.map((c, i) => start(c.right, elements[i].right?.w0));
  let beam: BeamResult | null = null, mids: number[] = [], iterations = 0, converged = false;
  const solve = () => solveBeam({
    lengthM: input.lengthM, eiKnM2: input.eiKnM2, maxElementM: input.lengthM * 2, headForceKn: input.headForceKn ?? 0, headMomentKnM: input.headMomentKnM ?? 0,
    headFixedRotation: false, toeFixed: false,
    layers: elements.map((e, i) => {
      // Links is w = −y, rechts w = +y; de linker druk werkt in +y, de rechter in −y.
      const l = curves[i].left ? linear(curves[i].left!, left[i]) : { spring: 0, load: 0 }, r = curves[i].right ? linear(curves[i].right!, right[i]) : { spring: 0, load: 0 };
      return { topM: e.topM, bottomM: e.bottomM, lineSpringKnM2: l.spring + r.spring + (e.supportKnM2 ?? 0), lineLoadKnM: l.load - r.load + e.loadKpa - (e.supportPreloadKnM ?? 0) };
    }),
  });
  const seen = new Set<string>();
  for (; iterations < MAX_ITERATIONS;) {
    beam = solve(); iterations++;
    if (beam.nodes.length !== n + 1) throw new Error("Elementindeling van de wand sluit niet aan.");
    mids = elements.map((e, i) => {
      const a = beam!.nodes[i], b = beam!.nodes[i + 1], l = e.bottomM - e.topM;
      return (a.yM + b.yM) / 2 + (l * (a.rotationRad - b.rotationRad)) / 8;
    });
    const nextLeft = curves.map((c, i) => (c.left ? (stays(c.left, left[i], -mids[i]) ? left[i] : branchOf(c.left, -mids[i])) : 0));
    const nextRight = curves.map((c, i) => (c.right ? (stays(c.right, right[i], mids[i]) ? right[i] : branchOf(c.right, mids[i])) : 0));
    const changed = nextLeft.reduce((c, s, i) => c + Number(s !== left[i]) + Number(nextRight[i] !== right[i]), 0);
    if (changed === 0) { converged = true; break; }
    // Een toestand die terugkomt betekent een cyclus: dan wisselt per stap nog maar de helft van de veren.
    const key = nextLeft.join(",") + "|" + nextRight.join(",");
    if (seen.has(key)) {
      let skip = false;
      for (let i = 0; i < n; i++) {
        if (nextLeft[i] !== left[i]) { if (!skip) left[i] = nextLeft[i]; skip = !skip; }
        if (nextRight[i] !== right[i]) { if (!skip) right[i] = nextRight[i]; skip = !skip; }
      }
    } else { seen.add(key); left = nextLeft; right = nextRight; }
  }
  let excess = 0;
  const out: WallElementResult[] = elements.map((e, i) => {
    const y = mids[i], l = e.bottomM - e.topM;
    const side = (c: Curve | null, w: number) => {
      if (!c) return null;
      const b = branchOf(c, w), top = c.w.length;
      // Wat de reststijfheid voorbij de grens levert, telt als overschot.
      excess += c.residual * (b === 0 ? c.w[0] - w : b === top ? w - c.w[top - 1] : 0) * l;
      return { state: (b === 0 ? "active" : b === top ? "passive" : "elastic") as SpringState, branch: b, pressureKpa: pressureAt(c, w) };
    };
    return { yM: y, left: side(curves[i].left, -y), right: side(curves[i].right, y), supportKnM: ((e.supportKnM2 ?? 0) * y + (e.supportPreloadKnM ?? 0)) * l };
  });
  return { beam: beam!, elements: out, iterations, converged, excessKn: excess };
}
