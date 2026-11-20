// Fundering op staal (strook of poer) volgens NEN 9997-1 art. 6.5.
//
//   gedraineerd    σ'max;d = c'·Nc·sc·ic·bc·λc + σ'v;z;d·Nq·sq·iq·bq·λq + ½·γ'·b'·Nγ·sγ·iγ·bγ·λγ
//   ongedraineerd  σ'max;d = (π + 2)·cu;d·sc·ic·bc·λc + σ'v;z;d·λq
//   afschuiven     Rh;d = V'd·tan δd (gedraineerd) of A'·cu;d (ongedraineerd)
//
// Bij gelaagde grond worden φ', c' en γ' gewogen gemiddeld over de invloedsdiepte;
// bij een slappere laag onder een stijvere komt daar doorponsen bij, met een fictief
// funderingsvlak op de bovenkant van de slappe laag en een spreiding van 8°.
// De rekenregels, de bronnen en de controleberekeningen staan in VERIFICATIE.md.
import type { Cpt } from "../../../types/cpt";
import { analyzeLayers } from "../../../utils/layerAnalysis";
import { DEFAULT_FACTORS, soilTypeForZone, type SpreadFactors } from "./catalog";

export const GAMMA_WATER = 10;
/** Spreiding van de belasting naar het fictieve funderingsvlak bij doorponsen [°]. */
export const PUNCH_SPREAD_DEG = 8;
/** Verschil in φ'k waarboven een slappere onderlaag op doorponsen wordt getoetst [°]. */
export const PUNCH_PHI_DIFFERENCE_DEG = 6;

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
/** Getal met decimale komma, voor de uitgeschreven formules. */
export const n = (v: number, d = 2): string => (Number.isFinite(v) ? v.toFixed(d).replace(".", ",") : "-");
const nap = (v: number) => `NAP ${v >= 0 ? "+" : ""}${n(v, 2)} m`;

/** Eén grondlaag; de onderkant is de bovenkant van de volgende laag. Waarden representatief. */
export interface SpreadLayer {
  topNap: number;
  name: string;
  /** Volumegewicht boven de grondwaterstand [kN/m³]. */
  gamma: number;
  /** Verzadigd volumegewicht [kN/m³]. */
  gammaSat: number;
  /** φ' [°]. */
  phi: number;
  /** c' [kPa]. */
  c: number;
  /** cu [kPa]; 0 = niet-cohesief, geen ongedraineerde toets. */
  cu: number;
  /** Grondsoort uit de catalogus waar de waarden vandaan komen. */
  soilId?: string;
}

export interface SpreadInput {
  /** Sondering voor het laagvoorstel en de tekening. */
  cptId: string | null;
  shape: "strip" | "pad";
  widthM: number;
  /** Lengte van de poer [m]; bij een strook niet gebruikt. */
  lengthM: number;
  foundationNap: number;
  /** Maaiveld aan de lage zijde [m NAP]: bepaalt de dekking. */
  groundNap: number;
  waterNap: number;
  /** Rekenwaarde verticale belasting op het funderingsvlak [kN; strook kN/m]. */
  vDKn: number;
  /** Kleinste rekenwaarde verticale belasting, voor afschuiven; ontbrekend = vDKn. */
  vMinDKn?: number;
  hDKn: number;
  /** Richting van de horizontale belasting: evenwijdig aan B of aan L. */
  hDirection: "B" | "L";
  /** Hoogte van het aangrijpingspunt van H boven het funderingsvlak [m]. */
  hArmM: number;
  /** Excentriciteit van V in de breedte- en lengterichting [m]. */
  eccBM: number;
  eccLM: number;
  /** Moment in de breedterichting op het funderingsvlak [kNm; strook kNm/m]. */
  momentDKnm: number;
  /** Helling van het maaiveld naast de fundering β [°]. */
  slopeDeg: number;
  /** Helling van de onderkant van de fundering α [°]. */
  baseTiltDeg: number;
  /** In het werk gestort: δ = φ'; anders (glad prefab) δ = ⅔ φ'. */
  castInPlace: boolean;
  /** Passieve gronddruk die bij afschuiven mag meetellen [kN; strook kN/m]. */
  passiveDKn: number;
  /** Water of lucht kan het contactvlak bereiken: ongedraineerd Rh;d ≤ 0,4·Vd. */
  gapPossible: boolean;
  /** Invloedsdiepte met de hand vastgezet [m]; ontbrekend = iteratief bepaald. */
  zeManualM?: number;
  /** Kantelen (EQU), representatieve waarden [kN, kNm; strook per m]. Ontbrekend = 0. */
  vGRepKn?: number;
  hGRepKn?: number;
  hQRepKn?: number;
  mGRepKnm?: number;
  mQRepKnm?: number;
  factors: SpreadFactors;
  layers: SpreadLayer[];
}

// ─── Draagkrachtfactoren ─────────────────────────────────────────

export function bearingFactors(phiDeg: number): { nq: number; nc: number; ngamma: number } {
  if (phiDeg < 1e-6) return { nq: 1, nc: Math.PI + 2, ngamma: 0 };
  const t = Math.tan(rad(phiDeg));
  const nq = Math.exp(Math.PI * t) * Math.tan(rad(45 + phiDeg / 2)) ** 2;
  return { nq, nc: (nq - 1) / t, ngamma: 2 * (nq - 1) * t };
}

// Invloedsbreedte ae/b' en invloedsdiepte ze/b' bij H/V = 0 en H/V = 1, per φ'rep.
// De bron geeft bij φ' = 0 geen invloedsbreedte: 1,00 volgt uit het bezwijkvlak van Prandtl, 0,53 is doorgetrokken.
const INFLUENCE_TABLE: Array<[phi: number, ae0: number, ae1: number, ze0: number, ze1: number]> = [
  [0, 1.00, 0.53, 0.70, 0.40], [5, 1.25, 0.65, 0.77, 0.41], [10, 1.57, 0.77, 0.88, 0.44], [15, 1.99, 0.92, 1.00, 0.47],
  [20, 2.53, 1.10, 1.16, 0.50], [25, 3.27, 1.33, 1.35, 0.54], [30, 4.29, 1.62, 1.59, 0.59], [35, 5.77, 2.01, 1.90, 0.65],
  [40, 8.01, 2.53, 2.33, 0.73], [45, 11.61, 3.27, 2.95, 0.84],
];

/** Invloedsdiepte en -breedte als veelvoud van b', lineair geïnterpoleerd in φ'rep en in H/V. */
export function influenceRatios(phiRepDeg: number, hOverV: number): { ze: number; ae: number } {
  const phi = Math.min(45, Math.max(0, phiRepDeg)), hv = Math.min(1, Math.max(0, hOverV));
  const k = Math.min(INFLUENCE_TABLE.length - 2, Math.floor(phi / 5));
  const a = INFLUENCE_TABLE[k], b = INFLUENCE_TABLE[k + 1], t = (phi - a[0]) / 5;
  const at = (col: 1 | 2 | 3 | 4) => a[col] + t * (b[col] - a[col]);
  return { ae: at(1) + hv * (at(2) - at(1)), ze: at(3) + hv * (at(4) - at(3)) };
}

// ─── Grondkolom ──────────────────────────────────────────────────

/** Deel van een laag boven of onder de grondwaterstand, met rekenwaarden. */
export interface Segment {
  topNap: number;
  bottomNap: number;
  thicknessM: number;
  layer: SpreadLayer;
  submerged: boolean;
  phiD: number;
  cD: number;
  cuD: number;
  /** Effectief volumegewicht, rekenwaarde: γ/γγ, onder water verminderd met γw. */
  gammaD: number;
  /** Effectief volumegewicht, representatief. */
  gammaK: number;
}

const sortLayers = (layers: SpreadLayer[]) => [...layers].sort((a, b) => b.topNap - a.topNap);

/** De grond tussen twee niveaus, gesplitst per laag en op de grondwaterstand. `layers` van boven naar beneden. */
export function soilSegments(layers: SpreadLayer[], topNap: number, bottomNap: number, waterNap: number, f: SpreadFactors): Segment[] {
  const out: Segment[] = [];
  const add = (layer: SpreadLayer, top: number, bottom: number, submerged: boolean) => {
    if (top - bottom <= 1e-9) return;
    out.push({
      topNap: top, bottomNap: bottom, thicknessM: top - bottom, layer, submerged,
      phiD: deg(Math.atan(Math.tan(rad(layer.phi)) / f.gammaPhi)), cD: layer.c / f.gammaC, cuD: layer.cu / f.gammaCu,
      gammaD: submerged ? layer.gammaSat / f.gammaGamma - GAMMA_WATER : layer.gamma / f.gammaGamma,
      gammaK: submerged ? layer.gammaSat - GAMMA_WATER : layer.gamma,
    });
  };
  layers.forEach((layer, i) => {
    const top = Math.min(topNap, i === 0 ? Infinity : layer.topNap), bottom = Math.max(bottomNap, layers[i + 1]?.topNap ?? -Infinity);
    if (top - bottom <= 1e-9) return;
    if (waterNap < top && waterNap > bottom) { add(layer, top, waterNap, false); add(layer, waterNap, bottom, true); }
    else add(layer, top, bottom, top <= waterNap + 1e-9);
  });
  return out;
}

/** Gewogen gemiddelde over de invloedsdiepte: gewicht = laagdikte × afstand van het laagmidden tot de invloedsdiepte. */
function weightedMean(segments: Segment[], floorNap: number, pick: (s: Segment) => number): number {
  let num = 0, den = 0;
  for (const s of segments) { const w = s.thicknessM * ((s.topNap + s.bottomNap) / 2 - floorNap); num += pick(s) * w; den += w; }
  return den > 0 ? num / den : segments.length ? pick(segments[0]) : 0;
}

// ─── Effectieve afmetingen ───────────────────────────────────────

export interface EffectiveDims {
  eccBM: number;
  eccLM: number;
  /** Effectieve maat in de breedte- en in de lengterichting van de fundering [m]; strook: lengte 1. */
  bRawM: number;
  lRawM: number;
  /** Kleinste en grootste effectieve maat: b' en l' in de formules. */
  bEffM: number;
  lEffM: number;
  /** b'/l'; 0 bij een strook. */
  ratio: number;
  areaM2: number;
  /** De horizontale belasting werkt in de richting van b'. */
  hAlongWidth: boolean;
}

/** b' = B − 2·eB en l' = L − 2·eL, met de excentriciteit uit het moment op het funderingsvlak. */
export function effectiveDims(strip: boolean, widthM: number, lengthM: number, vKn: number, momentB: number, momentL: number, hDirection: "B" | "L"): EffectiveDims | null {
  const eccBM = Math.abs(momentB) / vKn, eccLM = strip ? 0 : Math.abs(momentL) / vKn;
  const bRawM = widthM - 2 * eccBM, lRawM = strip ? 1 : lengthM - 2 * eccLM;
  if (!(bRawM > 1e-6) || !(lRawM > 1e-6)) return null;
  const swapped = !strip && bRawM > lRawM;
  const bEffM = swapped ? lRawM : bRawM, lEffM = swapped ? bRawM : lRawM;
  return { eccBM, eccLM, bRawM, lRawM, bEffM, lEffM, ratio: strip ? 0 : bEffM / lEffM, areaM2: bRawM * lRawM, hAlongWidth: (hDirection === "B") !== swapped };
}

// ─── Verticaal draagvermogen ─────────────────────────────────────

export interface DrainedParams {
  bEffM: number;
  lEffM: number;
  /** b'/l'; 0 bij een strook. */
  ratio: number;
  vKn: number;
  hKn: number;
  hAlongWidth: boolean;
  phiD: number;
  cD: number;
  gammaD: number;
  qKpa: number;
  slopeDeg: number;
  baseTiltDeg: number;
}
export interface DrainedBearing {
  nq: number; nc: number; ngamma: number;
  sc: number; sq: number; sgamma: number;
  ic: number; iq: number; igamma: number;
  bc: number; bq: number; bgamma: number;
  lambdaC: number; lambdaQ: number; lambdaGamma: number;
  termC: number; termQ: number; termGamma: number;
  sigmaMaxKpa: number;
}

/** Gedraineerd draagvermogen σ'max;d uit rekenwaarden. */
export function drainedBearing(p: DrainedParams): DrainedBearing {
  const { nq, nc, ngamma } = bearingFactors(p.phiD);
  const frictionless = p.phiD < 1e-6, phi = rad(p.phiD), t = Math.tan(phi), area = p.bEffM * p.lEffM;
  const tanBeta = Math.tan(rad(p.slopeDeg)), alpha = rad(p.baseTiltDeg);
  const sq = 1 + p.ratio * Math.sin(phi), sgamma = 1 - 0.3 * p.ratio;
  const sc = frictionless ? 1 + 0.2 * p.ratio : (sq * nq - 1) / (nq - 1);
  let ic: number, iq: number, igamma: number;
  if (frictionless) {
    iq = igamma = 1;
    ic = p.cD > 0 ? 0.5 * (1 + Math.sqrt(Math.max(0, 1 - p.hKn / (area * p.cD)))) : 1;
  } else {
    const x = p.hKn / (p.vKn + (area * p.cD) / t);
    if (p.hAlongWidth) { iq = Math.max(0, 1 - 0.7 * x) ** 3; igamma = Math.max(0, 1 - x) ** 3; }
    else iq = igamma = Math.max(0, 1 - x);
    ic = Math.max(0, (iq * nq - 1) / (nq - 1));
  }
  const bq = (1 - alpha * t) ** 2, bgamma = bq;
  const bc = frictionless ? 1 - (2 * alpha) / (Math.PI + 2) : bq - (1 - bq) / (nc * t);
  const lambdaQ = Math.max(0, 1 - tanBeta) ** 1.9, lambdaGamma = Math.max(0, 1 - 0.5 * tanBeta) ** 6;
  const lambdaC = frictionless ? 1 - 0.4 * tanBeta : Math.max(0, (nq * Math.exp(-0.0349 * p.slopeDeg * t) - 1) / (nq - 1));
  const termC = p.cD * nc * sc * ic * bc * lambdaC;
  const termQ = p.qKpa * nq * sq * iq * bq * lambdaQ;
  const termGamma = 0.5 * p.gammaD * p.bEffM * ngamma * sgamma * igamma * bgamma * lambdaGamma;
  return { nq, nc, ngamma, sc, sq, sgamma, ic, iq, igamma, bc, bq, bgamma, lambdaC, lambdaQ, lambdaGamma, termC, termQ, termGamma, sigmaMaxKpa: termC + termQ + termGamma };
}

export interface UndrainedParams { bEffM: number; lEffM: number; ratio: number; hKn: number; cuD: number; qKpa: number; slopeDeg: number; baseTiltDeg: number }
export interface UndrainedBearing { sc: number; ic: number; bc: number; lambdaC: number; lambdaQ: number; sigmaMaxKpa: number }

/** Ongedraineerd draagvermogen σ'max;d uit rekenwaarden. */
export function undrainedBearing(p: UndrainedParams): UndrainedBearing {
  const tanBeta = Math.tan(rad(p.slopeDeg));
  const sc = 1 + 0.2 * p.ratio;
  const ic = p.cuD > 0 ? 0.5 * (1 + Math.sqrt(Math.max(0, 1 - p.hKn / (p.bEffM * p.lEffM * p.cuD)))) : 1;
  const bc = 1 - (2 * rad(p.baseTiltDeg)) / (Math.PI + 2);
  const lambdaC = 1 - 0.4 * tanBeta, lambdaQ = Math.max(0, 1 - tanBeta) ** 1.9;
  return { sc, ic, bc, lambdaC, lambdaQ, sigmaMaxKpa: (Math.PI + 2) * p.cuD * sc * ic * bc * lambdaC + p.qKpa * lambdaQ };
}

// ─── Kantelen ────────────────────────────────────────────────────

export interface OverturningParams {
  /** Stabiliserend moment om de rand van de voet, representatief (permanent, gunstig). */
  stabilisingRepKnm: number;
  /** Kantelend moment, representatief: permanent en veranderlijk. */
  dstGRepKnm: number;
  dstQRepKnm: number;
  gammaGStb: number;
  gammaGDst: number;
  gammaQDst: number;
}
export interface OverturningResult { mStbD: number; mDstD: number; uc: number }

/** Evenwicht tegen kantelen (EQU): γG;dst·MG + γQ;dst·MQ ≤ γG;stb·Mstb. */
export function overturning(p: OverturningParams): OverturningResult {
  const mStbD = p.gammaGStb * p.stabilisingRepKnm, mDstD = p.gammaGDst * p.dstGRepKnm + p.gammaQDst * p.dstQRepKnm;
  return { mStbD, mDstD, uc: mStbD > 0 ? mDstD / mStbD : Infinity };
}

// ─── Uitkomst ────────────────────────────────────────────────────

/** Eén regel van de uitwerking: symbool = formule = ingevuld = uitkomst. */
export interface Step { symbol: string; formula: string; filled?: string; result: string }

export interface WeightRow {
  topNap: number; bottomNap: number; name: string; submerged: boolean;
  thicknessM: number;
  /** Afstand van het laagmidden tot de invloedsdiepte [m]. */
  zM: number;
  phiK: number; phiD: number; cD: number; gammaD: number;
}

/** Eén stap van de iteratie: gemiddelden over de aangenomen ze en de ze die daaruit volgt. */
export interface ZeIteration { step: number; zeM: number; phiRepDeg: number; phiD: number; cD: number; gammaD: number; zeNextM: number }

export interface DrainedCase {
  levelNap: number;
  dims: EffectiveDims;
  vKn: number;
  hKn: number;
  qKpa: number;
  /** Invloedsdiepte en -breedte [m]. */
  zeM: number;
  aeM: number;
  phiRepDeg: number;
  /** Stappen van de iteratie naar de invloedsdiepte. */
  iterations: ZeIteration[];
  converged: boolean;
  /** De invloedsdiepte is met de hand vastgezet. */
  zeManual: boolean;
  rows: WeightRow[];
  phiD: number;
  cD: number;
  gammaD: number;
  bearing: DrainedBearing;
  resistanceKn: number;
}
export interface UndrainedCase {
  levelNap: number;
  dims: EffectiveDims;
  vKn: number;
  hKn: number;
  qKpa: number;
  zeM: number;
  cuD: number;
  cuLayer: string;
  bearing: UndrainedBearing;
  resistanceKn: number;
}
export interface PunchCase {
  /** Fictief funderingsvlak: bovenkant van de slappe laag [m NAP]. */
  levelNap: number;
  layerName: string;
  thicknessM: number;
  widthM: number;
  lengthM: number;
  /** Gewicht van de grond tussen het funderingsvlak en het fictieve vlak, rekenwaarde. */
  deltaVKn: number;
  vKn: number;
  qKpa: number;
  drained?: DrainedCase;
  undrained?: UndrainedCase;
}

export interface SpreadCheck {
  id: string;
  title: string;
  article: string;
  /** Kort etiket voor de toets, bijvoorbeeld "draagvermogen gedraineerd". */
  label: string;
  /** Belasting en weerstand in `unit` (bij excentriciteit in m, bij kantelen in kNm). */
  loadKn: number;
  resistanceKn: number;
  unit: string;
  uc: number;
  passes: boolean;
  steps: Step[];
  /** Lagen binnen de invloedsdiepte, bij een gedraineerde toets. */
  rows?: WeightRow[];
}

export interface SpreadOk {
  ok: true;
  /** Eenheid van krachten: kN bij een poer, kN/m bij een strook. */
  unit: "kN" | "kN/m";
  strip: boolean;
  dims: EffectiveDims;
  coverM: number;
  qKpa: number;
  drained: DrainedCase;
  undrained: UndrainedCase | null;
  punch: PunchCase[];
  /** Kanteltoets; null als de representatieve belastingen daarvoor niet zijn ingevuld. */
  overturning: OverturningResult | null;
  checks: SpreadCheck[];
  governing: SpreadCheck;
  passes: boolean;
  layers: SpreadLayer[];
  warnings: string[];
}
export type SpreadResult = { ok: false; error: string } | SpreadOk;

// ─── Rekenkern per funderingsvlak ────────────────────────────────

interface Level {
  levelNap: number;
  widthM: number;
  lengthM: number;
  vKn: number;
  momentB: number;
  momentL: number;
  qKpa: number;
}
interface Context { strip: boolean; layers: SpreadLayer[]; waterNap: number; f: SpreadFactors; hKn: number; hDirection: "B" | "L"; slopeDeg: number; baseTiltDeg: number }

/** Toegestane afwijking tussen twee opeenvolgende waarden van de invloedsdiepte [m]. */
export const ZE_TOLERANCE_M = 0.001;
const ZE_MAX_STEPS = 60;

/** Gewogen gemiddelden over een aangenomen invloedsdiepte, en de invloedsdiepte die daaruit volgt. */
function averagesOver(ctx: Context, levelNap: number, bEffM: number, hv: number, zeM: number) {
  const floor = levelNap - zeM, segs = soilSegments(ctx.layers, levelNap, floor, ctx.waterNap, ctx.f);
  const phiRepDeg = weightedMean(segs, floor, (s) => s.layer.phi);
  return { floor, segs, phiRepDeg, phiD: weightedMean(segs, floor, (s) => s.phiD), cD: weightedMean(segs, floor, (s) => s.cD), gammaD: weightedMean(segs, floor, (s) => s.gammaD), zeNextM: bEffM * influenceRatios(phiRepDeg, hv).ze };
}

/**
 * Gedraineerd draagvermogen op een (fictief) funderingsvlak. De invloedsdiepte hangt af van
 * φ'gem;rep, en dat gemiddelde weer van de invloedsdiepte: begin bij 1,5·b' en herhaal tot
 * ze niet meer verandert. Na 25 stappen wordt gedempt (het gemiddelde van oud en nieuw).
 */
function drainedCase(ctx: Context, lv: Level, dims: EffectiveDims, zeManualM?: number): DrainedCase {
  const hv = lv.vKn > 0 ? ctx.hKn / lv.vKn : 0, iterations: ZeIteration[] = [];
  const manual = zeManualM !== undefined && zeManualM > 0;
  let ze = manual ? zeManualM! : 1.5 * dims.bEffM, converged = manual;
  for (let step = 1; !manual && step <= ZE_MAX_STEPS; step++) {
    const a = averagesOver(ctx, lv.levelNap, dims.bEffM, hv, ze);
    iterations.push({ step, zeM: ze, phiRepDeg: a.phiRepDeg, phiD: a.phiD, cD: a.cD, gammaD: a.gammaD, zeNextM: a.zeNextM });
    if (Math.abs(a.zeNextM - ze) < ZE_TOLERANCE_M) { converged = true; break; }
    ze = step < 25 ? a.zeNextM : (ze + a.zeNextM) / 2;
  }
  const a = averagesOver(ctx, lv.levelNap, dims.bEffM, hv, ze);
  if (manual) iterations.push({ step: 1, zeM: ze, phiRepDeg: a.phiRepDeg, phiD: a.phiD, cD: a.cD, gammaD: a.gammaD, zeNextM: a.zeNextM });
  const { phiD, cD, gammaD, phiRepDeg, segs, floor } = a;
  const bearing = drainedBearing({ bEffM: dims.bEffM, lEffM: dims.lEffM, ratio: dims.ratio, vKn: lv.vKn, hKn: ctx.hKn, hAlongWidth: dims.hAlongWidth, phiD, cD, gammaD, qKpa: lv.qKpa, slopeDeg: ctx.slopeDeg, baseTiltDeg: ctx.baseTiltDeg });
  return {
    levelNap: lv.levelNap, dims, vKn: lv.vKn, hKn: ctx.hKn, qKpa: lv.qKpa, zeM: ze, aeM: dims.bEffM * influenceRatios(phiRepDeg, hv).ae, phiRepDeg, iterations, converged, zeManual: manual,
    rows: segs.map((s) => ({ topNap: s.topNap, bottomNap: s.bottomNap, name: s.layer.name, submerged: s.submerged, thicknessM: s.thicknessM, zM: (s.topNap + s.bottomNap) / 2 - floor, phiK: s.layer.phi, phiD: s.phiD, cD: s.cD, gammaD: s.gammaD })),
    phiD, cD, gammaD, bearing, resistanceKn: bearing.sigmaMaxKpa * dims.areaM2,
  };
}

/** Ongedraineerd: alleen als de laag direct onder het vlak cohesief is; de laagste cu;d van de aaneengesloten cohesieve lagen binnen de invloedsdiepte. */
function undrainedCase(ctx: Context, lv: Level, dims: EffectiveDims): UndrainedCase | null {
  const hv = lv.vKn > 0 ? ctx.hKn / lv.vKn : 0, ze = dims.bEffM * influenceRatios(0, hv).ze;
  const segs = soilSegments(ctx.layers, lv.levelNap, lv.levelNap - ze, ctx.waterNap, ctx.f);
  if (!segs.length || !(segs[0].layer.cu > 0)) return null;
  let weakest = segs[0];
  for (const s of segs) { if (!(s.layer.cu > 0)) break; if (s.cuD < weakest.cuD) weakest = s; }
  const bearing = undrainedBearing({ bEffM: dims.bEffM, lEffM: dims.lEffM, ratio: dims.ratio, hKn: ctx.hKn, cuD: weakest.cuD, qKpa: lv.qKpa, slopeDeg: ctx.slopeDeg, baseTiltDeg: ctx.baseTiltDeg });
  return { levelNap: lv.levelNap, dims, vKn: lv.vKn, hKn: ctx.hKn, qKpa: lv.qKpa, zeM: ze, cuD: weakest.cuD, cuLayer: weakest.layer.name, bearing, resistanceKn: bearing.sigmaMaxKpa * dims.areaM2 };
}

// ─── Uitgeschreven formules ──────────────────────────────────────

const product = (...v: Array<[number, number]>) => v.map(([x, d]) => n(x, d)).join(" · ");

function dimSteps(strip: boolean, d: EffectiveDims, widthM: number, lengthM: number): Step[] {
  const steps: Step[] = [{ symbol: "b'", formula: "B − 2·eB", filled: `${n(widthM)} − 2 · ${n(d.eccBM, 3)}`, result: `${n(d.bRawM)} m` }];
  if (!strip) steps.push({ symbol: "l'", formula: "L − 2·eL", filled: `${n(lengthM)} − 2 · ${n(d.eccLM, 3)}`, result: `${n(d.lRawM)} m` });
  return steps;
}

function drainedSteps(strip: boolean, unit: string, c: DrainedCase, widthM: number, lengthM: number): Step[] {
  const b = c.bearing, d = c.dims, hv = c.vKn > 0 ? c.hKn / c.vKn : 0;
  const steps = dimSteps(strip, d, widthM, lengthM);
  steps.push(
    c.zeManual ? { symbol: "ze", formula: "met de hand vastgezet", result: `${n(c.zeM)} m, tot ${nap(c.levelNap - c.zeM)} (uit de tabel zou volgen ${n(c.iterations[0]?.zeNextM ?? NaN)} m)` } : { symbol: "ze", formula: `b' · f(φ'gem;rep ; Hd/Vd), ${c.converged ? `na ${c.iterations.length} stappen` : "niet geconvergeerd"}`, filled: `${n(d.bEffM)} · ${n(c.zeM / d.bEffM, 2)}  (φ'gem;rep = ${n(c.phiRepDeg, 1)}°, Hd/Vd = ${n(hv, 3)})`, result: `${n(c.zeM)} m, tot ${nap(c.levelNap - c.zeM)}` },
    { symbol: "φ'gem;d", formula: "Σ φ'i;d·hi·zi / Σ hi·zi", result: `${n(c.phiD, 2)}°` },
    { symbol: "c'gem;d", formula: "Σ c'i;d·hi·zi / Σ hi·zi", result: `${n(c.cD, 2)} kPa` },
    { symbol: "γ'gem;d", formula: "Σ γ'i;d·hi·zi / Σ hi·zi", result: `${n(c.gammaD, 2)} kN/m³` },
    { symbol: "Nq", formula: "e^(π·tan φ') · tan²(45° + φ'/2)", result: n(b.nq, 2) },
    { symbol: "Nc", formula: "(Nq − 1) · cot φ'", result: n(b.nc, 2) },
    { symbol: "Nγ", formula: "2 · (Nq − 1) · tan φ'", result: n(b.ngamma, 2) },
  );
  if (!strip) steps.push(
    { symbol: "sq", formula: "1 + (b'/l') · sin φ'", filled: `1 + ${n(d.ratio, 3)} · sin ${n(c.phiD, 2)}°`, result: n(b.sq, 3) },
    { symbol: "sγ", formula: "1 − 0,3 · b'/l'", filled: `1 − 0,3 · ${n(d.ratio, 3)}`, result: n(b.sgamma, 3) },
    { symbol: "sc", formula: "(sq·Nq − 1) / (Nq − 1)", result: n(b.sc, 3) },
  );
  if (c.hKn > 0) {
    const denom = `${n(c.vKn, 1)} + ${n(d.areaM2, 2)} · ${n(c.cD, 2)} · cot ${n(c.phiD, 2)}°`;
    steps.push(d.hAlongWidth
      ? { symbol: "iq", formula: "(1 − 0,70·Hd / (Vd + A'·c'·cot φ'))³", filled: `(1 − 0,70 · ${n(c.hKn, 1)} / (${denom}))³`, result: n(b.iq, 3) }
      : { symbol: "iq = iγ", formula: "1 − Hd / (Vd + A'·c'·cot φ')", filled: `1 − ${n(c.hKn, 1)} / (${denom})`, result: n(b.iq, 3) });
    if (d.hAlongWidth) steps.push({ symbol: "iγ", formula: "(1 − Hd / (Vd + A'·c'·cot φ'))³", filled: `(1 − ${n(c.hKn, 1)} / (${denom}))³`, result: n(b.igamma, 3) });
    steps.push({ symbol: "ic", formula: "(iq·Nq − 1) / (Nq − 1)", filled: `(${n(b.iq, 3)} · ${n(b.nq, 2)} − 1) / (${n(b.nq, 2)} − 1)`, result: n(b.ic, 3) });
  }
  if (b.lambdaQ !== 1) steps.push({ symbol: "λc ; λq ; λγ", formula: "(Nq·e^(−0,0349·β·tan φ') − 1)/(Nq − 1) ; (1 − tan β)^1,9 ; (1 − 0,5·tan β)^6", result: `${n(b.lambdaC, 3)} ; ${n(b.lambdaQ, 3)} ; ${n(b.lambdaGamma, 3)}` });
  if (b.bq !== 1) steps.push({ symbol: "bc ; bq = bγ", formula: "bq − (1 − bq)/(Nc·tan φ') ; (1 − α·tan φ')²", result: `${n(b.bc, 3)} ; ${n(b.bq, 3)}` });
  steps.push(
    { symbol: "σ'max;d", formula: "c'·Nc·sc·ic·bc·λc + σ'v;z;d·Nq·sq·iq·bq·λq + ½·γ'·b'·Nγ·sγ·iγ·bγ·λγ",
      filled: `${product([c.cD, 2], [b.nc, 2], [b.sc, 3], [b.ic, 3], [b.bc, 3], [b.lambdaC, 3])} + ${product([c.qKpa, 1], [b.nq, 2], [b.sq, 3], [b.iq, 3], [b.bq, 3], [b.lambdaQ, 3])} + 0,5 · ${product([c.gammaD, 2], [d.bEffM, 2], [b.ngamma, 2], [b.sgamma, 3], [b.igamma, 3], [b.bgamma, 3], [b.lambdaGamma, 3])}`,
      result: `${n(b.termC, 1)} + ${n(b.termQ, 1)} + ${n(b.termGamma, 1)} = ${n(b.sigmaMaxKpa, 1)} kPa` },
    resistanceStep(strip, unit, b.sigmaMaxKpa, d, c.resistanceKn),
  );
  return steps;
}

const resistanceStep = (strip: boolean, unit: string, sigma: number, d: EffectiveDims, r: number): Step =>
  ({ symbol: "Rv;d", formula: strip ? "σ'max;d · b'" : "σ'max;d · b' · l'", filled: strip ? `${n(sigma, 1)} · ${n(d.bRawM)}` : `${n(sigma, 1)} · ${n(d.bRawM)} · ${n(d.lRawM)}`, result: `${n(r, 1)} ${unit}` });

function undrainedSteps(strip: boolean, unit: string, c: UndrainedCase, widthM: number, lengthM: number): Step[] {
  const b = c.bearing, d = c.dims, steps = dimSteps(strip, d, widthM, lengthM);
  steps.push({ symbol: "cu;d", formula: "cu / γcu", result: `${n(c.cuD, 1)} kPa (${c.cuLayer})` });
  if (!strip) steps.push({ symbol: "sc", formula: "1 + 0,2 · b'/l'", filled: `1 + 0,2 · ${n(d.ratio, 3)}`, result: n(b.sc, 3) });
  if (c.hKn > 0) steps.push({ symbol: "ic", formula: "0,5 · (1 + √(1 − Hd / (A'·cu;d)))", filled: `0,5 · (1 + √(1 − ${n(c.hKn, 1)} / (${n(d.areaM2, 2)} · ${n(c.cuD, 1)})))`, result: n(b.ic, 3) });
  if (b.lambdaQ !== 1) steps.push({ symbol: "λc ; λq", formula: "1 − 0,4·tan β ; (1 − tan β)^1,9", result: `${n(b.lambdaC, 3)} ; ${n(b.lambdaQ, 3)}` });
  if (b.bc !== 1) steps.push({ symbol: "bc", formula: "1 − 2·α / (π + 2)", result: n(b.bc, 3) });
  steps.push(
    { symbol: "σ'max;d", formula: "(π + 2)·cu;d·sc·ic·bc·λc + σ'v;z;d·λq", filled: `5,14 · ${product([c.cuD, 1], [b.sc, 3], [b.ic, 3], [b.bc, 3], [b.lambdaC, 3])} + ${product([c.qKpa, 1], [b.lambdaQ, 3])}`, result: `${n(b.sigmaMaxKpa, 1)} kPa` },
    resistanceStep(strip, unit, b.sigmaMaxKpa, d, c.resistanceKn),
  );
  return steps;
}

const toCheck = (id: string, title: string, label: string, article: string, loadKn: number, resistanceKn: number, unit: string, loadSymbol: string, resSymbol: string, steps: Step[], rows?: WeightRow[]): SpreadCheck => {
  const uc = resistanceKn > 0 ? loadKn / resistanceKn : Infinity, passes = uc <= 1;
  return { id, title, label, article, loadKn, resistanceKn, unit, uc, passes, rows,
    steps: [...steps, { symbol: "Toets", formula: `${loadSymbol} ≤ ${resSymbol}`, filled: `${n(loadKn, unit === "m" ? 3 : 1)} ≤ ${n(resistanceKn, unit === "m" ? 3 : 1)} ${unit}`, result: `u.c. ${n(uc, 2)}: ${passes ? "voldoet" : "voldoet niet"}` }] };
};

// ─── Hoofdberekening ─────────────────────────────────────────────

const finite = (...v: number[]) => v.every((x) => typeof x === "number" && Number.isFinite(x));

export function computeSpread(input: SpreadInput): SpreadResult {
  const fail = (error: string): SpreadResult => ({ ok: false, error });
  const strip = input.shape === "strip", unit = strip ? "kN/m" : "kN", f = { ...DEFAULT_FACTORS, ...input.factors };
  if (!finite(input.widthM, input.foundationNap, input.groundNap, input.waterNap, input.vDKn, input.hDKn, input.hArmM, input.eccBM, input.eccLM, input.momentDKnm, input.slopeDeg, input.baseTiltDeg, input.passiveDKn) || (!strip && !finite(input.lengthM)))
    return fail("Vul voor alle velden een getal in.");
  if (!(input.widthM > 0) || (!strip && !(input.lengthM > 0))) return fail("De afmetingen van de fundering moeten groter zijn dan nul.");
  if (!(input.vDKn > 0)) return fail("Vul de rekenwaarde van de verticale belasting Vd in.");
  if (input.hDKn < 0 || input.passiveDKn < 0 || input.hArmM < 0) return fail("De horizontale belasting, de arm en de passieve gronddruk mogen niet negatief zijn.");
  if (input.vMinDKn !== undefined && !(finite(input.vMinDKn) && input.vMinDKn > 0)) return fail("De kleinste verticale belasting moet groter zijn dan nul.");
  if (input.slopeDeg < 0 || input.slopeDeg >= 45 || input.baseTiltDeg < 0 || input.baseTiltDeg > 30) return fail("De maaiveldhelling moet tussen 0° en 45° liggen en de helling van de onderkant tussen 0° en 30°.");
  if (![f.gammaPhi, f.gammaC, f.gammaCu, f.gammaGamma, f.gammaGPunch, f.gammaGDst, f.gammaQDst].every((x) => finite(x) && x >= 1)) return fail("De partiële factoren moeten minimaal 1,0 zijn.");
  if (!(finite(f.gammaGStb) && f.gammaGStb > 0 && f.gammaGStb <= 1)) return fail("De factor voor gunstige permanente belasting moet tussen 0 en 1,0 liggen.");
  if (input.zeManualM !== undefined && !(finite(input.zeManualM) && input.zeManualM > 0)) return fail("De vastgezette invloedsdiepte moet groter zijn dan nul.");
  if (!input.layers?.length) return fail("Voer minimaal één grondlaag in.");
  for (const l of input.layers) {
    if (!finite(l.topNap, l.gamma, l.gammaSat, l.phi, l.c, l.cu)) return fail(`Laag "${l.name}": vul alle waarden in.`);
    if (!(l.gamma > 0) || l.gammaSat < l.gamma || l.gammaSat < GAMMA_WATER) return fail(`Laag "${l.name}": het volumegewicht moet groter zijn dan nul en het verzadigde gewicht minstens zo groot en niet kleiner dan ${GAMMA_WATER} kN/m³.`);
    if (l.phi < 0 || l.phi > 45 || l.c < 0 || l.cu < 0) return fail(`Laag "${l.name}": φ' moet tussen 0° en 45° liggen; c' en cu mogen niet negatief zijn.`);
  }
  const layers = sortLayers(input.layers);
  if (layers.some((l, i) => i > 0 && layers[i - 1].topNap - l.topNap < 1e-6)) return fail("Twee lagen hebben dezelfde bovenkant.");
  if (input.foundationNap > input.groundNap + 1e-9) return fail("Het aanlegniveau ligt boven het maaiveld.");

  const ctx: Context = { strip, layers, waterNap: input.waterNap, f, hKn: input.hDKn, hDirection: input.hDirection, slopeDeg: input.slopeDeg, baseTiltDeg: input.baseTiltDeg };
  const lengthM = strip ? 1 : input.lengthM;
  /** Momenten om het midden van een vlak dat `extraArmM` onder het funderingsvlak ligt. */
  const momentsFor = (vKn: number, extraArmM = 0) => ({
    momentB: vKn * input.eccBM + input.momentDKnm + (input.hDirection === "B" ? input.hDKn * (input.hArmM + extraArmM) : 0),
    momentL: strip ? 0 : vKn * input.eccLM + (input.hDirection === "L" ? input.hDKn * (input.hArmM + extraArmM) : 0),
  });

  // Dekking naast de fundering, aan de lage zijde.
  const coverSegs = soilSegments(layers, input.groundNap, input.foundationNap, input.waterNap, f);
  const coverM = input.groundNap - input.foundationNap, qKpa = coverSegs.reduce((s, x) => s + x.thicknessM * x.gammaD, 0);

  const base: Level = { levelNap: input.foundationNap, widthM: input.widthM, lengthM, vKn: input.vDKn, ...momentsFor(input.vDKn), qKpa };
  const dims = effectiveDims(strip, base.widthM, base.lengthM, base.vKn, base.momentB, base.momentL, input.hDirection);
  if (!dims) return fail("De resultante van de belasting valt buiten het funderingsvlak: er is geen effectief oppervlak.");

  const checks: SpreadCheck[] = [], warnings: string[] = [];
  const drained = drainedCase(ctx, base, dims, input.zeManualM);
  if (!drained.converged) warnings.push(`De iteratie naar de invloedsdiepte is na ${drained.iterations.length} stappen niet geconvergeerd; er is gerekend met ze = ${n(drained.zeM)} m. Zet ze zo nodig met de hand vast.`);
  checks.push(toCheck("bearing-drained", "Verticaal draagvermogen, gedraineerd", "draagvermogen gedraineerd", "art. 6.5.2", base.vKn, drained.resistanceKn, unit, "Vd", "Rv;d", drainedSteps(strip, unit, drained, base.widthM, base.lengthM), drained.rows));
  const undrained = undrainedCase(ctx, base, dims);
  if (undrained) checks.push(toCheck("bearing-undrained", "Verticaal draagvermogen, ongedraineerd", "draagvermogen ongedraineerd", "art. 6.5.2", base.vKn, undrained.resistanceKn, unit, "Vd", "Rv;d", undrainedSteps(strip, unit, undrained, base.widthM, base.lengthM)));

  // Doorponsen: elke slappere of cohesieve laag onder een stijvere laag, ook onder de invloedsdiepte.
  const punch: PunchCase[] = [];
  const tan8 = Math.tan(rad(PUNCH_SPREAD_DEG));
  layers.forEach((layer, j) => {
    if (j === 0) return;
    const t = input.foundationNap - layer.topNap, above = layers[j - 1];
    if (t <= 1e-6) return;
    const weaker = layer.phi < above.phi - PUNCH_PHI_DIFFERENCE_DEG, cohesiveBelow = layer.cu > 0 && !(above.cu > 0);
    if (!weaker && !cohesiveBelow) return;
    const widthM = input.widthM + 2 * t * tan8, pLengthM = strip ? 1 : input.lengthM + 2 * t * tan8;
    // Inhoud van de grondmoot per meter hoogte: trapezium bij een strook, afgeknotte piramide bij een poer.
    const a0 = input.widthM * input.lengthM, a1 = widthM * pLengthM;
    const meanArea = strip ? (input.widthM + widthM) / 2 : (a0 + a1 + Math.sqrt(a0 * a1)) / 3;
    const between = soilSegments(layers, input.foundationNap, layer.topNap, input.waterNap, f);
    const deltaVKn = f.gammaGPunch * meanArea * between.reduce((s, x) => s + x.thicknessM * x.gammaK, 0);
    const vKn = input.vDKn + deltaVKn;
    const lv: Level = { levelNap: layer.topNap, widthM, lengthM: pLengthM, vKn, ...momentsFor(input.vDKn, t), qKpa: qKpa + between.reduce((s, x) => s + x.thicknessM * x.gammaD, 0) };
    const pDims = effectiveDims(strip, widthM, pLengthM, vKn, lv.momentB, lv.momentL, input.hDirection);
    const entry: PunchCase = { levelNap: layer.topNap, layerName: layer.name, thicknessM: t, widthM, lengthM: pLengthM, deltaVKn, vKn, qKpa: lv.qKpa };
    punch.push(entry);
    if (!pDims) { warnings.push(`Doorponsen op ${nap(layer.topNap)}: de resultante valt buiten het fictieve funderingsvlak; niet getoetst.`); return; }
    const head: Step[] = [
      { symbol: "Bpons", formula: `B + 2·t·tan ${PUNCH_SPREAD_DEG}°`, filled: `${n(input.widthM)} + 2 · ${n(t)} · tan ${PUNCH_SPREAD_DEG}°`, result: `${n(widthM)} m${strip ? "" : `; Lpons = ${n(pLengthM)} m`}` },
      { symbol: "Vpons;d", formula: "Vd + γG · Σ γ·t · Agem", filled: `${n(input.vDKn, 1)} + ${n(deltaVKn, 1)}`, result: `${n(vKn, 1)} ${unit}` },
      { symbol: "σ'v;z;d", formula: "dekking tot het fictieve vlak", result: `${n(lv.qKpa, 1)} kPa` },
    ];
    const at = nap(layer.topNap);
    if (weaker) {
      entry.drained = drainedCase(ctx, lv, pDims);
      checks.push(toCheck(`punch-drained-${j}`, `Doorponsen, gedraineerd, op ${at} (${layer.name})`, `doorponsen gedraineerd ${at}`, "art. 6.5.2", vKn, entry.drained.resistanceKn, unit, "Vpons;d", "Rv;d", [...head, ...drainedSteps(strip, unit, entry.drained, widthM, pLengthM)], entry.drained.rows));
    }
    const u = undrainedCase(ctx, lv, pDims);
    if (u) {
      entry.undrained = u;
      checks.push(toCheck(`punch-undrained-${j}`, `Doorponsen, ongedraineerd, op ${at} (${layer.name})`, `doorponsen ongedraineerd ${at}`, "art. 6.5.2", vKn, u.resistanceKn, unit, "Vpons;d", "Rv;d", [...head, ...undrainedSteps(strip, unit, u, widthM, pLengthM)]));
    }
  });

  // Afschuiven langs het funderingsvlak, met de kleinste verticale belasting.
  if (input.hDKn > 0) {
    const vSl = input.vMinDKn ?? input.vDKn, baseSeg = soilSegments(layers, input.foundationNap, input.foundationNap - 0.01, input.waterNap, f)[0];
    const passive: Step[] = input.passiveDKn > 0 ? [{ symbol: "Rp;d", formula: "passieve gronddruk (invoer)", result: `${n(input.passiveDKn, 1)} ${unit}` }] : [];
    const resSymbol = input.passiveDKn > 0 ? "Rh;d + Rp;d" : "Rh;d";
    if (baseSeg.phiD > 0) {
      const deltaD = (input.castInPlace ? 1 : 2 / 3) * baseSeg.phiD, rh = vSl * Math.tan(rad(deltaD));
      checks.push(toCheck("sliding-drained", "Afschuiven, gedraineerd", "afschuiven gedraineerd", "art. 6.5.3", input.hDKn, rh + input.passiveDKn, unit, "Hd", resSymbol, [
        { symbol: "δd", formula: input.castInPlace ? "φ'd (in het werk gestort)" : "⅔ · φ'd (glad, prefab)", result: `${n(deltaD, 2)}° (${baseSeg.layer.name}, φ'd = ${n(baseSeg.phiD, 2)}°)` },
        { symbol: "Rh;d", formula: "V'd · tan δd", filled: `${n(vSl, 1)} · tan ${n(deltaD, 2)}°`, result: `${n(rh, 1)} ${unit}` }, ...passive]));
    }
    if (baseSeg.layer.cu > 0) {
      const mSl = momentsFor(vSl);
      const sDims = effectiveDims(strip, input.widthM, lengthM, vSl, mSl.momentB, mSl.momentL, input.hDirection);
      if (!sDims) warnings.push("Afschuiven ongedraineerd: bij de kleinste verticale belasting valt de resultante buiten het funderingsvlak; niet getoetst.");
      else {
        const full = sDims.areaM2 * baseSeg.cuD, rh = input.gapPossible ? Math.min(full, 0.4 * vSl) : full;
        checks.push(toCheck("sliding-undrained", "Afschuiven, ongedraineerd", "afschuiven ongedraineerd", "art. 6.5.3", input.hDKn, rh + input.passiveDKn, unit, "Hd", resSymbol, [
          { symbol: "A'", formula: strip ? "b' (per m)" : "b' · l'", result: `${n(sDims.areaM2, 2)} m²${strip ? "/m" : ""}` },
          { symbol: "Rh;d", formula: input.gapPossible ? "min(A' · cu;d ; 0,4 · Vd)" : "A' · cu;d", filled: input.gapPossible ? `min(${n(sDims.areaM2, 2)} · ${n(baseSeg.cuD, 1)} ; 0,4 · ${n(vSl, 1)})` : `${n(sDims.areaM2, 2)} · ${n(baseSeg.cuD, 1)}`, result: `${n(rh, 1)} ${unit}` }, ...passive]));
      }
    }
  }

  // Excentriciteit van de resultante en kantelen.
  const third = strip || dims.eccBM / input.widthM >= dims.eccLM / input.lengthM ? { e: dims.eccBM, size: input.widthM, name: "B" } : { e: dims.eccLM, size: input.lengthM, name: "L" };
  const eccCheck = toCheck("eccentricity", "Excentriciteit van de resultante", "excentriciteit", "art. 6.5.4", third.e, third.size / 3, "m", `e${third.name}`, `${third.name}/3`, [
    { symbol: "eB", formula: "(Vd·eV + Md + Hd·h) / Vd", filled: `${n(Math.abs(base.momentB), 1)} / ${n(base.vKn, 1)}`, result: `${n(dims.eccBM, 3)} m` },
    ...(strip ? [] : [{ symbol: "eL", formula: "ML;d / Vd", filled: `${n(Math.abs(base.momentL), 1)} / ${n(base.vKn, 1)}`, result: `${n(dims.eccLM, 3)} m` }]),
    { symbol: "Kern", formula: `e ≤ ${third.name}/6`, filled: `${n(third.e, 3)} ≤ ${n(third.size / 6, 3)} m`, result: third.e <= third.size / 6 + 1e-9 ? "de resultante ligt binnen de kern: overal druk" : "de resultante ligt buiten de kern: het funderingsvlak draagt niet overal" },
  ]);
  checks.push(eccCheck);
  const vG = input.vGRepKn ?? 0;
  const dstG = (input.hGRepKn ?? 0) * input.hArmM + (input.mGRepKnm ?? 0), dstQ = (input.hQRepKn ?? 0) * input.hArmM + (input.mQRepKnm ?? 0);
  if ([vG, dstG, dstQ].some((x) => !Number.isFinite(x) || x < 0)) return fail("De belastingen voor de kanteltoets mogen niet negatief zijn.");
  let overturn: OverturningResult | null = null;
  if (vG > 0 && dstG + dstQ > 0) {
    const alongL = !strip && input.hDirection === "L";
    const armM = alongL ? input.lengthM / 2 - input.eccLM : input.widthM / 2 - input.eccBM;
    overturn = overturning({ stabilisingRepKnm: vG * armM, dstGRepKnm: dstG, dstQRepKnm: dstQ, gammaGStb: f.gammaGStb, gammaGDst: f.gammaGDst, gammaQDst: f.gammaQDst });
    const mUnit = strip ? "kNm/m" : "kNm";
    checks.push(toCheck("overturning", "Kantelen om de rand van de voet (EQU)", "kantelen", "NEN-EN 1990 tabel A1.2(A)", overturn.mDstD, overturn.mStbD, mUnit, "Mdst;d", "Mstb;d", [
      { symbol: "a", formula: alongL ? "L/2 − eL" : "B/2 − eB", filled: alongL ? `${n(input.lengthM / 2)} − ${n(input.eccLM, 3)}` : `${n(input.widthM / 2)} − ${n(input.eccBM, 3)}`, result: `${n(armM, 3)} m` },
      { symbol: "Mstb;d", formula: "γG;stb · VG;rep · a", filled: `${n(f.gammaGStb)} · ${n(vG, 1)} · ${n(armM, 3)}`, result: `${n(overturn.mStbD, 1)} ${mUnit}` },
      { symbol: "Mdst;d", formula: "γG;dst · (HG;rep·h + MG;rep) + γQ;dst · (HQ;rep·h + MQ;rep)", filled: `${n(f.gammaGDst)} · ${n(dstG, 1)} + ${n(f.gammaQDst)} · ${n(dstQ, 1)}`, result: `${n(overturn.mDstD, 1)} ${mUnit}` },
    ]));
  }

  if (input.waterNap > input.foundationNap + 1e-9) warnings.push("De grondwaterstand ligt boven het aanlegniveau: vul Vd in als effectieve belasting, dus verminderd met de opwaartse waterdruk.");
  if (!eccCheck.passes) warnings.push("De excentriciteit is groter dan een derde van de afmeting: de norm vraagt dan bijzondere voorzorgen, waaronder maattoleranties tot 0,10 m.");
  if (coverM > 2 * input.widthM) warnings.push("De dekking is groter dan 2·B; ga na of de volledige dekking in rekening mag worden gebracht.");
  if (input.slopeDeg > 0.5 * drained.phiD) warnings.push("De maaiveldhelling is groter dan de helft van φ'gem;d: toets ook de algehele stabiliteit met een glijvlakberekening.");
  if (layers.some((l) => l.c > 0)) warnings.push("Er is met effectieve cohesie gerekend; dat mag alleen als de cohesie blijvend aanwezig is.");

  const governing = checks.reduce((a, b) => (b.uc > a.uc ? b : a));
  return { ok: true, unit, strip, dims, coverM, qKpa, drained, undrained, punch, overturning: overturn, checks, governing, passes: checks.every((c) => c.passes), layers, warnings };
}

// ─── Laagvoorstel uit een sondering ──────────────────────────────

/** Laagindeling van de sondering met tabelwaarden per grondsoort; een voorstel dat de gebruiker aanpast. */
export function layersFromCpt(cpt: Cpt): SpreadLayer[] {
  const ground = cpt.metadata.ground_level_nap ?? 0;
  const out: SpreadLayer[] = [];
  for (const layer of analyzeLayers(cpt).layers) {
    const qcs = cpt.points.filter((p) => Math.abs(p.depth) >= layer.depth_top && Math.abs(p.depth) <= layer.depth_bottom && typeof p.qc === "number" && Number.isFinite(p.qc)).map((p) => p.qc as number);
    const soil = soilTypeForZone(layer.zone_number, qcs.length ? qcs.reduce((a, b) => a + b, 0) / qcs.length : 0);
    if (out.length && out[out.length - 1].soilId === soil.id) continue;
    out.push({ topNap: Math.round((out.length ? ground - layer.depth_top : ground) * 100) / 100, name: soil.name, gamma: soil.gamma, gammaSat: soil.gammaSat, phi: soil.phi, c: soil.c, cu: soil.cu, soilId: soil.id });
  }
  return out;
}
