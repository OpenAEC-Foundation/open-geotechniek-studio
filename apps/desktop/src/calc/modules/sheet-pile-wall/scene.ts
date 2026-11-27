// Geometrie voor de tekeningen: de plattegrond van de wand en de maten van het grondblok in 3D.
// Zuivere functies; de tekening zelf staat in SectionDrawing.tsx, WallScene3D.tsx en report.ts.
import type { SheetPileProfile } from "../../library/sheetPiles";
import { sheetContour, type ContourBasis } from "../../library/sheetPileContour";
import { getSoilType } from "../spread-foundation/catalog";
import { getTableRow, zoneColor, zoneForSoil } from "./cpt-layers";
import { anchorAngle, normalizeWallInput, resolvePhases, wallLoads, wallSupports, type AnchorKind, type CaseRun, type Construction, type ResolvedPhase, type ScenarioLayer, type Side, type WallInput, type WallOk, type WallRun } from "./compute";
import type { SurfaceLoad } from "./surface-loads";

/** Punt in de plattegrond van de wand: a langs de wand, x dwars erop (hoge zijde negatief) [m]. */
export interface PlanPoint { a: number; x: number }
/** Gesloten omtrek in de plattegrond, over de volle hoogte van de wand. */
export interface PlanOutline { kind: "plate" | "lock" | "plank"; points: PlanPoint[] }

/** Breedte van één plank van een doorgaande beschoeiing in de tekening [m]. */
export const PLANK_WIDTH_M = 0.2;

/** Stalen damwand: de contour uit de profielbibliotheek, per plank, met de sloten. */
export function profilePlan(p: SheetPileProfile, lengthM: number): { outlines: PlanOutline[]; line: PlanPoint[]; basis: ContourBasis } {
  const planks = Math.max(1, Math.ceil((lengthM * 1000) / (p.widthMm ?? 600) - 1e-9)), c = sheetContour(p, planks), m = (q: { x: number; y: number }): PlanPoint => ({ a: q.x / 1000, x: q.y / 1000 });
  return { outlines: [...c.plates.map((poly) => ({ kind: "plate" as const, points: poly.map(m) })), ...c.locks.map((poly) => ({ kind: "lock" as const, points: poly.map(m) }))], line: c.centerlines.flat().map(m), basis: c.geometry.basis };
}

/**
 * Doorgaande wand van planken: planken van vaste breedte naast elkaar. Houten planken met messing en groef
 * (een derde van de dikte, schematisch); een eigen doorsnede als rechte plank.
 */
export function plankPlan(thicknessM: number, lengthM: number, tongue: boolean): PlanOutline[] {
  const out: PlanOutline[] = [], d = thicknessM / 2, g = tongue ? Math.min(0.012, thicknessM / 3) : 0, e = thicknessM / 6;
  for (let a = 0; a < lengthM - 1e-9; a += PLANK_WIDTH_M) {
    const a1 = a + PLANK_WIDTH_M;
    out.push({ kind: "plank", points: g
      ? [{ a, x: -d }, { a: a1, x: -d }, { a: a1, x: -e }, { a: a1 + g, x: -e }, { a: a1 + g, x: e }, { a: a1, x: e }, { a: a1, x: d }, { a, x: d }, { a, x: e }, { a: a + g, x: e }, { a: a + g, x: -e }, { a, x: -e }]
      : [{ a: a + 0.002, x: -d }, { a: a1 - 0.002, x: -d }, { a: a1 - 0.002, x: d }, { a: a + 0.002, x: d }] });
  }
  return out;
}

/** Het stuk van een lijn tussen a0 en a1, met de eindpunten erbij geïnterpoleerd. */
export function clipLine(line: PlanPoint[], a0: number, a1: number): PlanPoint[] {
  const at = (a: number): PlanPoint => {
    for (let k = 1; k < line.length; k++) if (line[k].a >= a && line[k].a > line[k - 1].a) { const t = Math.max(0, Math.min(1, (a - line[k - 1].a) / (line[k].a - line[k - 1].a))); return { a, x: line[k - 1].x + t * (line[k].x - line[k - 1].x) }; }
    return { a, x: line[line.length - 1]?.x ?? 0 };
  };
  return [at(a0), ...line.filter((p) => p.a > a0 + 1e-9 && p.a < a1 - 1e-9), at(a1)];
}

const EPS = 1e-9;

/**
 * Buitenkant van de wand aan één zijde in de plattegrond, tussen a0 en a1: per plaats langs de wand het buitenste
 * staal aan die zijde (side −1: de hoge zijde, kleinste x; +1: de lage zijde, grootste x). Stuksgewijs recht en
 * exact op de randen van de omtrekken, dus de contour verschoven met de plaatdikte naar die zijde, met de sloten
 * erin. Daar sluit de grond op aan: geen spleet en geen overlap. Zonder omtrekken (palen) de as x = 0.
 */
export function wallFace(outlines: PlanOutline[], side: 1 | -1, a0: number, a1: number): PlanPoint[] {
  if (!outlines.length) return [{ a: a0, x: 0 }, { a: a1, x: 0 }];
  const edges: Array<{ a0: number; a1: number; x0: number; x1: number }> = [];
  for (const o of outlines) for (let k = 0; k < o.points.length; k++) {
    const p = o.points[k], q = o.points[(k + 1) % o.points.length];
    if (Math.abs(q.a - p.a) < EPS) continue;
    const [u, v] = p.a < q.a ? [p, q] : [q, p];
    if (v.a <= a0 + EPS || u.a >= a1 - EPS) continue;
    edges.push({ a0: u.a, a1: v.a, x0: u.x, x1: v.x });
  }
  edges.sort((p, q) => p.a0 - q.a0);
  const raw = [a0, a1, ...edges.flatMap((e) => [e.a0, e.a1]).filter((a) => a > a0 && a < a1)].sort((p, q) => p - q);
  const cuts = raw.filter((a, k) => k === 0 || a - raw[k - 1] > EPS);
  const xAt = (e: (typeof edges)[number], a: number) => e.x0 + ((e.x1 - e.x0) * (a - e.a0)) / (e.a1 - e.a0);
  const out: PlanPoint[] = [];
  let next = 0, active: typeof edges = [];
  for (let k = 0; k + 1 < cuts.length; k++) {
    const lo = cuts[k], hi = cuts[k + 1];
    while (next < edges.length && edges[next].a0 <= lo + EPS) active.push(edges[next++]);
    active = active.filter((e) => e.a1 > lo + EPS);
    const here = active.filter((e) => e.a1 >= hi - EPS);
    if (!here.length) continue;
    // Het buitenste van rechte stukken: de knikken liggen op de snijpunten van twee ervan.
    const at = [lo, hi];
    for (let i = 0; i < here.length; i++) for (let j = i + 1; j < here.length; j++) {
      const p = here[i], q = here[j], dp = (p.x1 - p.x0) / (p.a1 - p.a0), dq = (q.x1 - q.x0) / (q.a1 - q.a0);
      if (Math.abs(dp - dq) < 1e-12) continue;
      const a = lo + (xAt(q, lo) - xAt(p, lo)) / (dp - dq);
      if (a > lo + EPS && a < hi - EPS) at.push(a);
    }
    for (const a of at.sort((p, q) => p - q)) out.push({ a, x: side * Math.max(...here.map((e) => side * xAt(e, a))) });
  }
  // Dubbele punten en punten op een rechte lijn eruit.
  const face: PlanPoint[] = [];
  for (const p of out) {
    const last = face[face.length - 1];
    if (last && Math.abs(last.a - p.a) < EPS && Math.abs(last.x - p.x) < EPS) continue;
    if (face.length >= 2) {
      const o = face[face.length - 2], cross = (last.a - o.a) * (p.x - o.x) - (last.x - o.x) * (p.a - o.a);
      if (Math.abs(cross) < 1e-12 * Math.max(1e-6, Math.hypot(p.a - o.a, p.x - o.x))) face.pop();
    }
    face.push(p);
  }
  return face;
}

/** Grondvlak aan één zijde in de plattegrond: de buitenkant van de wand en de rand van het blok op x = farX. */
export function soilOutline(face: PlanPoint[], farX: number): PlanPoint[] {
  return [{ a: face[0].a, x: farX }, ...face, { a: face[face.length - 1].a, x: farX }];
}

export interface SceneLayer { name: string; color: string; topNap: number; bottomNap: number; zone?: number }
export interface SceneSupport { kind: AnchorKind; levelNap: number; angleDeg: number; freeM: number; groutM: number; groutDiameterM: number }
export interface WallScene {
  construction: Construction;
  /** Halve breedte van het grondblok dwars op de wand en de lengte langs de wand [m]. */
  halfWidthM: number;
  lengthM: number;
  /** Stuk wand dat voor het snijvlak uitsteekt [m]. */
  frontM: number;
  topNap: number;
  bottomNap: number;
  wallTopNap: number;
  toeNap: number;
  /** Dikte van de wand of breedte van de paal dwars op de wand [m]. */
  wallHeightM: number;
  /** Omtrekken over de volle hoogte van de wand (damwand met sloten, of planken); leeg bij palen met schotten. */
  outlines: PlanOutline[];
  /** Hartlijn van de wand in de plattegrond: de grond sluit er aan beide zijden tegenaan. */
  wallLine: PlanPoint[];
  /** Buitenkant van de wand aan de hoge en de lage zijde, van het snijvlak tot de achterkant van het blok (zie wallFace). */
  faceHigh: PlanPoint[];
  faceLow: PlanPoint[];
  /** Waar de vorm van het stalen profiel vandaan komt; null bij een beschoeiing. */
  contourBasis: ContourBasis | null;
  /** Fabrikant van de getekende contour, als die uit de CAD-tekening komt. */
  contourManufacturer: string | null;
  /** Palen met hun plaats langs de wand, en de schotten aan de hoge zijde. */
  posts: Array<{ alongM: number; shape: "round" | "square"; sizeM: number }>;
  boards: { thicknessM: number; bottomNap: number } | null;
  /** Gording op het niveau van het anker, aan de lage zijde van een doorgaande wand. */
  waling: { levelNap: number; sizeM: number } | null;
  high: { surfaceNap: number; waterNap: number; layers: SceneLayer[] };
  low: { surfaceNap: number; waterNap: number; originalNap: number; layers: SceneLayer[] };
  surchargeKpa: number;
  /** Breedte van het grondblok aan de hoge zijde [m]; groter dan de halve breedte als een groutanker dat vraagt. */
  extentHighM: number;
  /** De (eerste) steun in de doorsnede: getekende vrije lengte en, bij een groutanker, het groutlichaam op schaal. */
  support: SceneSupport | null;
  /** Alle steunpunten die in deze berekening werken, met hun plaatsen langs de wand. */
  supports: Array<SceneSupport & { id: string; anchors: number[]; forceKnPerM: number | null }>;
  /** Maaiveld van de wand af per zijde (afstand, niveau), en de belastingen op afstand in deze fase. */
  profileHigh: Array<{ xM: number; nap: number }>;
  profileLow: Array<{ xM: number; nap: number }>;
  loads: SurfaceLoad[];
  /** Actief glijvlak vanaf de teen (alleen bij een groutanker): hoek met de horizontaal en het punt op het maaiveld. */
  slip: { angleDeg: number; reachM: number } | null;
  /** Plaatsen van de ankers langs de wand [m]. */
  anchors: number[];
  profileName: string;
}

const FALLBACK = "#C9B28A";
/** Kleur en lichtheid van een kleur in #rrggbb gemengd met wit (f > 0) of zwart (f < 0). */
function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16), mix = (c: number) => Math.round(f >= 0 ? c + (255 - c) * f : c * (1 + f));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => mix(c).toString(16).padStart(2, "0")).join("")}`;
}
/**
 * Kleur van een laag: de kleur van de zone van de sondering, zoals in de sondeergrafiek en het paneel Grondopbouw (bij
 * een handmatige laag de zone die bij de grondsoort hoort), lichter bij los of slap en donkerder bij vast. Zonder zone
 * de kleur van de grondsoort.
 */
export const layerColor = (l: { soilId?: string; zone?: number }): string => {
  const base = zoneColor(l.zone ?? zoneForSoil(l.soilId));
  if (!base) return getSoilType(l.soilId)?.color ?? FALLBACK;
  const c = getTableRow(l.soilId)?.consistency ?? (/-(loose|soft)$/.test(l.soilId ?? "") ? "los" : /-(dense|stiff)$/.test(l.soilId ?? "") ? "vast" : "matig");
  return shade(base, c === "los" || c === "slap" ? 0.25 : c === "vast" ? -0.15 : 0);
};

/** Lagen van één zijde tussen het maaiveld en de onderkant van het blok. */
export function sceneLayers(side: Side, bottomNap: number): SceneLayer[] {
  const layers = side.layers as ScenarioLayer[];
  return layers.map((l, k) => ({ name: l.name, color: layerColor(l), zone: l.zone, topNap: k === 0 ? side.surfaceNap : Math.min(l.topNap, side.surfaceNap), bottomNap: Math.max(bottomNap, k + 1 < layers.length ? Math.min(layers[k + 1].topNap, side.surfaceNap) : bottomNap) }))
    .filter((l) => l.topNap > l.bottomNap);
}

/**
 * De fase bij een berekening: de fase van de berekening zelf, of bij de omhullende de fase met de diepste ontgraving.
 */
export function phaseOf(r: WallOk, run: WallRun): ResolvedPhase | undefined {
  const own = r.cases?.find((c) => c.run === run);
  if (own) return r.phases[own.phase];
  return r.phases?.reduce<ResolvedPhase | undefined>((best, p) => (!best || p.excavationNap < best.excavationNap ? p : best), undefined);
}

export function wallScene(raw: WallInput, r: WallOk, run: WallRun = r.sls, phaseIn?: ResolvedPhase): WallScene {
  const i = normalizeWallInput(raw), s = run.scenario, height = i.wallTopNap - i.toeNap, sec = r.section, kind = sec.construction;
  const phase = phaseIn ?? phaseOf(r, run) ?? resolvePhases(i)[0];
  const b = (sec.profile?.widthMm ?? 600) / 1000, period = kind === "posts" ? i.posts.spacingM : kind === "plank" ? 3 * PLANK_WIDTH_M : sec.profile?.shape === "hat" ? b : 2 * b;
  const length = Math.max(3 * period, Math.min(8, Math.ceil((0.6 * height) / period) * period)), front = kind === "posts" ? period / 2 : period;
  const bottomWall = i.toeNap - Math.max(0.5, 0.12 * height), half = Math.max(1.5, Math.min(9, 0.55 * height));
  // De steunpunten die in deze berekening werken (bij een omhullende: alle die ergens werken).
  const active = run.supports ? wallSupports(i).filter((a) => run.supports.some((x) => x.id === a.id)) : wallSupports(i);
  const supports: WallScene["supports"] = active.map((an) => {
    const akind = an.kind ?? "tie", g = an.grout, along: number[] = [];
    for (let a = Math.min(an.spacingM, length) / 2; a < length; a += an.spacingM) along.push(a);
    const base: SceneSupport = akind === "grout" && g
      ? { kind: akind, levelNap: an.levelNap, angleDeg: an.angleDeg, freeM: g.freeLengthM, groutM: g.groutLengthM, groutDiameterM: g.diameterMm / 1000 }
      : { kind: akind, levelNap: an.levelNap, angleDeg: anchorAngle(an), freeM: Math.min(half * 0.9, 3.2), groutM: 0, groutDiameterM: 0 };
    return { ...base, id: an.id!, anchors: along, forceKnPerM: run.supports?.find((x) => x.id === an.id)?.axialKn ?? null };
  });
  const support: WallScene["support"] = supports[0] ? { kind: supports[0].kind, levelNap: supports[0].levelNap, angleDeg: supports[0].angleDeg, freeM: supports[0].freeM, groutM: supports[0].groutM, groutDiameterM: supports[0].groutDiameterM } : null;
  const anchors = supports[0]?.anchors ?? [], an = active[0], akind = an?.kind ?? "tie", anchored = supports.length > 0;
  const grouts = supports.filter((x) => x.kind === "grout");
  const reach = Math.max(0, ...grouts.map((x) => (x.freeM + x.groutM) * Math.cos((x.angleDeg * Math.PI) / 180)));
  const deepest = Math.min(i.toeNap, ...grouts.map((x) => x.levelNap - (x.freeM + x.groutM) * Math.sin((x.angleDeg * Math.PI) / 180)));
  const bottom = Math.min(bottomWall, deepest - 1);
  const slip = r.grout ? { angleDeg: r.grout.slipAngleDeg, reachM: (Math.min(i.wallTopNap, s.high.surfaceNap) - i.toeNap) / Math.tan((r.grout.slipAngleDeg * Math.PI) / 180) } : null;
  const plan = kind === "sheet-pile" && sec.profile ? profilePlan(sec.profile, length + front) : null;
  const outlines = plan ? plan.outlines : kind === "plank" ? plankPlan(sec.depthM, length + front, i.material === "timber") : [];
  const posts: WallScene["posts"] = [];
  if (kind === "posts") for (let a = period / 2; a < length + front; a += period) posts.push({ alongM: a, shape: i.posts.shape, sizeM: i.posts.sizeMm / 1000 });
  return {
    extentHighM: Math.max(half, reach + 1), support, slip,
    construction: kind, halfWidthM: half, lengthM: length, frontM: front, topNap: Math.max(i.wallTopNap, s.high.surfaceNap), bottomNap: bottom, wallTopNap: i.wallTopNap, toeNap: i.toeNap,
    wallHeightM: sec.depthM, outlines, faceHigh: wallFace(outlines, -1, front, front + length), faceLow: wallFace(outlines, 1, front, front + length),
    wallLine: plan ? plan.line : [{ a: 0, x: 0 }, { a: length + front, x: 0 }], contourBasis: plan ? plan.basis : null, contourManufacturer: plan && plan.basis === "drawing" ? sec.profile?.manufacturer ?? null : null,
    posts, boards: kind === "posts" ? { thicknessM: i.posts.boardMm / 1000, bottomNap: i.posts.boardBottomNap } : null,
    waling: anchored && (kind === "plank" || akind === "grout") ? { levelNap: an!.levelNap, sizeM: kind === "plank" ? Math.max(0.08, 2 * sec.depthM) : 0.2 } : null,
    supports,
    profileHigh: [{ xM: 0, nap: s.high.surfaceNap }, ...[...(phase?.profileHigh ?? [])].sort((p, q) => p.xM - q.xM).filter((p) => p.xM > 0).map((p) => ({ xM: p.xM, nap: s.high.surfaceNap + p.dzM }))],
    profileLow: [{ xM: 0, nap: s.low.surfaceNap }, ...[...(phase?.profileLow ?? [])].sort((p, q) => p.xM - q.xM).filter((p) => p.xM > 0).map((p) => ({ xM: p.xM, nap: s.low.surfaceNap + p.dzM }))],
    loads: wallLoads(i).filter((l) => !phase || phase.loadIds.includes(l.id!)),
    high: { surfaceNap: s.high.surfaceNap, waterNap: s.high.waterNap, layers: sceneLayers(s.high, bottom) },
    low: { surfaceNap: s.low.surfaceNap, waterNap: s.low.waterNap, originalNap: i.groundLowNap, layers: sceneLayers(s.low, bottom) },
    surchargeKpa: s.high.surchargeKpa, anchors, profileName: sec.label,
  };
}

/**
 * Omhullende van verplaatsing, moment en dwarskracht over berekeningen, op vaste niveaus: per niveau de kleinste en de
 * grootste waarde (moment en dwarskracht maal de factor van de berekening). Voor de tekening.
 */
export function envelopeLines(cases: CaseRun[], topNap: number, toeNap: number, count = 160): Array<{ nap: number; y: [number, number]; m: [number, number]; v: [number, number] }> {
  const at = (c: CaseRun, nap: number, value: (p: WallRun["samples"][number]) => number) => {
    const s = c.run.samples;
    let best = s[0];
    for (const p of s) if (Math.abs(p.nap - nap) < Math.abs(best.nap - nap)) best = p;
    return value(best);
  };
  return Array.from({ length: count + 1 }, (_, k) => {
    const nap = topNap - ((topNap - toeNap) * k) / count;
    const range = (value: (p: WallRun["samples"][number]) => number, factor: (c: CaseRun) => number): [number, number] => {
      const vals = cases.map((c) => at(c, nap, value) * factor(c));
      return [Math.min(...vals), Math.max(...vals)];
    };
    return { nap, y: range((p) => p.yM * 1000, () => 1), m: range((p) => p.momentKnM, (c) => c.resultFactor), v: range((p) => p.shearKn, (c) => c.resultFactor) };
  });
}

/** Ronde schaalwaarden (1, 2, 2,5 of 5 × 10ⁿ) die het bereik inclusief 0 dekken. */
export function niceTicks(lo: number, hi: number, target = 4): number[] {
  const a = Math.min(0, lo), b = Math.max(0, hi), span = b - a || 1;
  const raw = span / target, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((v) => v >= raw - 1e-12)!;
  const first = Math.floor(a / step + 1e-9) * step, last = Math.ceil(b / step - 1e-9) * step;
  return Array.from({ length: Math.round((last - first) / step) + 1 }, (_, k) => +(first + k * step).toPrecision(12));
}
