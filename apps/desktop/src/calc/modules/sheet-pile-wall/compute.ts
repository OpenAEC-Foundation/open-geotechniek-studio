// Damwand of beschoeiing met een hoge en een lage zijde, één ontgravingsfase. Rekenregels, bronnen en
// controlegetallen staan in VERIFICATIE.md; de module is een concept tot de normtekst zelf is nagelopen.
//
// Niveaus in m NAP, spanningen in kPa, krachten per strekkende meter wand. De hoge zijde staat links.
import type { Cpt } from "../../../types/cpt";
import { ct } from "../../i18n";
import { E_STEEL_MPA, findGrade, findSheetPile, wallMomentCapacity, wallStiffness, type SheetPileProfile } from "../../library/sheetPiles";
import { layersFromCpt } from "../spread-foundation/compute";
import { blum, type BlumResult } from "./blum";
import { coefficients, type PassiveMethod, type PressureCoefficients } from "./earth-pressure";
import { solveSpringWall, type SideSpring, type SpringState, type WallElement } from "./spring-model";

/** Volumegewicht van water [kN/m³]. */
export const GAMMA_WATER = 10;
/** Lengte waarover het anker in het liggermodel is uitgesmeerd [m]. */
const ANCHOR_BAND_M = 0.04;
/** Horizontale stijfheid van een starre steun [kN/m per m wand]. */
const RIGID_SUPPORT = 1e7;

const t = (key: string, nl: string, vars?: Record<string, unknown>) => ct("calcWall", key, nl, vars);
const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
export const n = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d).replace(".", ",") : "—");

export interface WallLayer {
  /** Bovenkant van de laag [m NAP]; de bovenste laag loopt door tot het maaiveld. */
  topNap: number;
  name: string;
  soilId?: string;
  /** Volumegewicht boven en onder de grondwaterstand [kN/m³]. */
  gamma: number;
  gammaSat: number;
  /** Hoek van inwendige wrijving φ' [°], cohesie c' [kPa] en wandwrijvingshoek δ [°]. */
  phi: number;
  c: number;
  delta: number;
  /** Reken deze laag ongedraineerd, met cu [kPa]. */
  undrained: boolean;
  cu: number;
  /** Horizontale beddingsconstante [kN/m³]; invoer van de gebruiker. */
  kh: number;
}

export interface WallAnchor {
  enabled: boolean;
  levelNap: number;
  /** Hoek met de horizontaal, omlaag positief [°]; 0 voor een stempel. */
  angleDeg: number;
  rigid: boolean;
  /** Axiale veerstijfheid van één anker of stempel [kN/m]. */
  stiffnessKnPerM: number;
  /** Hart-op-hartafstand [m]. */
  spacingM: number;
}

export interface WallFactors {
  /** Op tan φ', c' en cu. */
  gammaPhi: number;
  gammaC: number;
  gammaCu: number;
  /** Op het volumegewicht. */
  gammaGamma: number;
  /** Op de bovenbelasting. */
  gammaQ: number;
  /** Deler op de beddingsconstante. */
  gammaK: number;
  /** Toeslag op de kerende hoogte: percentage van de hoogte, met een maximum [m]. */
  deltaAPct: number;
  deltaAMaxM: number;
  /** Verhoging van de waterstand aan de hoge zijde en verlaging aan de lage zijde [m]. */
  deltaWaterHighM: number;
  deltaWaterLowM: number;
  /** Op de vloeigrens van het staal. */
  gammaM0: number;
}

export type Construction = "sheet-pile" | "plank" | "posts";
export type WallMaterial = "timber" | "custom";

/** Hout volgens NEN-EN 1995-1-1: sterkteklasse met de karakteristieke waarden en de factoren voor de rekenwaarde. */
export interface TimberInput {
  classId: string;
  /** Buigsterkte en schuifsterkte [N/mm²], gemiddelde elasticiteitsmodulus [N/mm²]. */
  fmK: number;
  fvK: number;
  eMeanMPa: number;
  kmod: number;
  gammaM: number;
  /** Scheurfactor op de breedte bij afschuiving. */
  kcr: number;
}

/**
 * Sterkteklassen met waarden in de orde van NEN-EN 338; niet tegen de normtekst gelegd (VERIFICATIE.md). De
 * gebruiker kan elke waarde overschrijven.
 */
export const TIMBER_CLASSES: Array<{ id: string; fmK: number; fvK: number; eMeanMPa: number }> = [
  { id: "C18", fmK: 18, fvK: 3.4, eMeanMPa: 9000 }, { id: "C24", fmK: 24, fvK: 4.0, eMeanMPa: 11000 },
  { id: "D30", fmK: 30, fvK: 3.9, eMeanMPa: 11000 }, { id: "D40", fmK: 40, fvK: 4.2, eMeanMPa: 13000 }, { id: "D50", fmK: 50, fvK: 4.5, eMeanMPa: 14000 },
  { id: "D60", fmK: 60, fvK: 4.8, eMeanMPa: 17000 }, { id: "D70", fmK: 70, fvK: 5.0, eMeanMPa: 20000 },
];
/** Natte toepassing: klimaatklasse 3, blijvende belasting (k_mod = 0,50), massief hout (γ_M = 1,3). */
export const DEFAULT_TIMBER: TimberInput = { classId: "D40", fmK: 40, fvK: 4.2, eMeanMPa: 13000, kmod: 0.5, gammaM: 1.3, kcr: 0.67 };

export interface WallPosts {
  /** Hart-op-hartafstand van de palen [m]. */
  spacingM: number;
  shape: "round" | "square";
  /** Diameter of zijde van de paal [mm]. */
  sizeMm: number;
  /** Factor op de paalbreedte voor de passieve weerstand en de bedding onder de schotten (ruimtelijke werking). */
  spatialFactor: number;
  /** Dikte van de schotten [mm] en hun onderkant [m NAP]. */
  boardMm: number;
  boardBottomNap: number;
}
export const DEFAULT_CUSTOM = { eiKnM2: 100, mRdKnM: 10, vRdKn: 0 };
export const DEFAULT_POSTS: WallPosts = { spacingM: 1, shape: "round", sizeMm: 140, spatialFactor: 3, boardMm: 30, boardBottomNap: -1.8 };

export interface WallInput {
  /** Soort constructie: stalen damwand uit de bibliotheek, doorgaande wand van planken, of palen met schotten. */
  construction: Construction;
  /** Materiaal van de plank of de paal bij een beschoeiing. */
  material: WallMaterial;
  timber: TimberInput;
  /** Dikte van de plank van een doorgaande wand [mm]. */
  plankMm: number;
  /** Eigen doorsnede (kunststof, beton): per m wand bij planken, per paal bij palen met schotten. */
  custom: { eiKnM2: number; mRdKnM: number; vRdKn: number };
  posts: WallPosts;
  cptId: string | null;
  groundHighNap: number;
  /** Maaiveld aan de lage zijde vóór het ontgraven; alleen voor de tekening. */
  groundLowNap: number;
  /** Ontgravingsniveau of waterbodem aan de lage zijde. */
  excavationNap: number;
  waterHighNap: number;
  waterLowNap: number;
  /** Gelijkmatige bovenbelasting op de hoge zijde [kPa], representatief. */
  surchargeKpa: number;
  layersHigh: WallLayer[];
  lowSameAsHigh: boolean;
  layersLow: WallLayer[];
  profileId: string;
  manufacturer: string;
  grade: string;
  /** Reductiefactor βB op het weerstandsmoment (schuifkrachtoverdracht in de sloten van U-planken). */
  betaB: number;
  wallTopNap: number;
  toeNap: number;
  /** Extra normaalkracht in de wand [kN/m], rekenwaarde. */
  normalForceKn: number;
  anchor: WallAnchor;
  passiveMethod: PassiveMethod;
  factors: WallFactors;
}

export const REPRESENTATIVE: WallFactors = { gammaPhi: 1, gammaC: 1, gammaCu: 1, gammaGamma: 1, gammaQ: 1, gammaK: 1, deltaAPct: 0, deltaAMaxM: 0, deltaWaterHighM: 0, deltaWaterLowM: 0, gammaM0: 1 };

/**
 * Sets partiële factoren. De waarden zijn een voorstel uit de praktijk van NEN 9997-1 met CUR 166 en zijn
 * niet tegen de normtekst gelegd (VERIFICATIE.md, open punten); de gebruiker controleert en past ze aan.
 */
export const FACTOR_SETS: Array<{ id: string; name: string; factors: WallFactors }> = [
  { id: "rc1", name: "RC1", factors: { ...REPRESENTATIVE, gammaPhi: 1.15, gammaC: 1.15, gammaCu: 1.5, deltaAPct: 10, deltaAMaxM: 0.5 } },
  { id: "rc2", name: "RC2", factors: { ...REPRESENTATIVE, gammaPhi: 1.175, gammaC: 1.25, gammaCu: 1.6, deltaAPct: 10, deltaAMaxM: 0.5 } },
  { id: "rc3", name: "RC3", factors: { ...REPRESENTATIVE, gammaPhi: 1.2, gammaC: 1.4, gammaCu: 1.65, deltaAPct: 10, deltaAMaxM: 0.5 } },
  { id: "rep", name: "1,0", factors: { ...REPRESENTATIVE } },
];
export const DEFAULT_FACTORS: WallFactors = FACTOR_SETS[1].factors;

/** Vult velden aan die een eerder opgeslagen berekening nog niet had. */
export function normalizeWallInput(i: WallInput): WallInput {
  return {
    ...i, construction: i.construction ?? "sheet-pile", material: i.material ?? "timber", timber: { ...DEFAULT_TIMBER, ...i.timber }, plankMm: i.plankMm ?? 50,
    custom: { ...DEFAULT_CUSTOM, ...i.custom }, posts: { ...DEFAULT_POSTS, ...i.posts }, factors: { ...DEFAULT_FACTORS, ...i.factors },
  };
}

/** Palen met schotten zijn onverankerd; anders telt het vinkje van de steun. */
export const hasAnchor = (i: WallInput): boolean => i.anchor.enabled && i.construction !== "posts";

// ─── Scenario: de invoer na het toepassen van de factoren ─────────

export interface ScenarioLayer {
  topNap: number;
  name: string;
  soilId?: string;
  gamma: number;
  gammaSat: number;
  phi: number;
  c: number;
  delta: number;
  undrained: boolean;
  cu: number;
  kh: number;
  coef: PressureCoefficients;
}

export interface Side {
  surfaceNap: number;
  waterNap: number;
  surchargeKpa: number;
  layers: ScenarioLayer[];
}

export interface Scenario {
  factors: WallFactors;
  /** Toeslag op de kerende hoogte [m]. */
  deltaAM: number;
  high: Side;
  low: Side;
}

function scenarioLayers(layers: WallLayer[], f: WallFactors, method: PassiveMethod): ScenarioLayer[] {
  return [...layers].sort((a, b) => b.topNap - a.topNap).map((l) => {
    const phi = deg(Math.atan(Math.tan(rad(l.phi)) / f.gammaPhi));
    // De wandwrijving houdt dezelfde verhouding tot φ' als in de invoer.
    const delta = l.phi > 0 ? Math.min(l.delta, l.phi) * (phi / l.phi) : 0;
    return { topNap: l.topNap, name: l.name, soilId: l.soilId, gamma: l.gamma / f.gammaGamma, gammaSat: l.gammaSat / f.gammaGamma, phi, c: l.c / f.gammaC, delta, undrained: l.undrained, cu: l.cu / f.gammaCu, kh: l.kh / f.gammaK, coef: coefficients(phi, delta, method) };
  });
}

export function buildScenario(i: WallInput, f: WallFactors): Scenario {
  // Kerende hoogte: onder de onderste steun, of vanaf het maaiveld bij een onverankerde wand.
  const from = hasAnchor(i) ? Math.min(i.anchor.levelNap, i.groundHighNap) : i.groundHighNap;
  const deltaA = Math.min((f.deltaAPct / 100) * Math.max(0, from - i.excavationNap), f.deltaAMaxM);
  const high = scenarioLayers(i.layersHigh, f, i.passiveMethod);
  return {
    factors: f, deltaAM: deltaA,
    high: { surfaceNap: i.groundHighNap, waterNap: i.waterHighNap + f.deltaWaterHighM, surchargeKpa: i.surchargeKpa * f.gammaQ, layers: high },
    low: { surfaceNap: i.excavationNap - deltaA, waterNap: i.waterLowNap - f.deltaWaterLowM, surchargeKpa: 0, layers: i.lowSameAsHigh ? high : scenarioLayers(i.layersLow, f, i.passiveMethod) },
  };
}

const layerAt = (layers: ScenarioLayer[], nap: number): ScenarioLayer => {
  let found = layers[0];
  for (const l of layers) if (l.topNap >= nap) found = l;
  return found;
};

export interface SidePoint {
  /** Totale verticale spanning, waterspanning en verticale korrelspanning [kPa]. */
  sigmaV: number;
  u: number;
  sigmaVEff: number;
  /** Grenzen en neutrale waarde van de horizontale korreldruk [kPa]; null boven het maaiveld. */
  soil: (SideSpring & { layer: ScenarioLayer }) | null;
}

/** Spanningen en grenzen van de gronddruk aan één zijde, op niveau `nap`. */
export function sidePoint(side: Side, nap: number): SidePoint {
  const u = GAMMA_WATER * Math.max(0, side.waterNap - nap);
  if (nap >= side.surfaceNap) return { sigmaV: u, u, sigmaVEff: 0, soil: null };
  let sigmaV = side.surchargeKpa + GAMMA_WATER * Math.max(0, side.waterNap - side.surfaceNap);
  const cuts = [side.surfaceNap, ...side.layers.map((l) => l.topNap), side.waterNap, nap].filter((z) => z <= side.surfaceNap && z >= nap).sort((a, b) => b - a);
  for (let k = 1; k < cuts.length; k++) {
    const a = cuts[k - 1], b = cuts[k], mid = (a + b) / 2;
    if (a - b <= 0) continue;
    const l = layerAt(side.layers, mid);
    sigmaV += (mid < side.waterNap ? l.gammaSat : l.gamma) * (a - b);
  }
  const eff = sigmaV - u, layer = layerAt(side.layers, nap), k = layer.coef;
  let pa: number, pp: number;
  if (layer.undrained) {
    // Totaalspanningen: σh = σv ∓ 2·cu; de korreldruk is wat daarvan overblijft boven de waterspanning.
    pa = Math.max(0, sigmaV - 2 * layer.cu - u);
    pp = Math.max(pa, sigmaV + 2 * layer.cu - u);
  } else {
    pa = Math.max(0, k.ka * eff - k.kac * layer.c);
    pp = Math.max(pa, k.kp * eff + k.kpc * layer.c);
  }
  const p0 = Math.max(pa, Math.min(pp, k.k0 * eff));
  return { sigmaV, u, sigmaVEff: eff, soil: { p0, pa, pp, k: layer.kh, layer } };
}

/**
 * Palen met schotten: onder de schotten werkt de grond alleen nog op de paal. Per m wand telt de gronddruk dan
 * over paalbreedte / h.o.h.; de passieve weerstand en de bedding over factor × paalbreedte, niet meer dan h.o.h.
 */
export function widthFactors(i: WallInput, nap: number): { soil: number; passive: number } {
  if (i.construction !== "posts" || nap >= i.posts.boardBottomNap) return { soil: 1, passive: 1 };
  const b = i.posts.sizeMm / 1000, a = i.posts.spacingM;
  return { soil: Math.min(1, b / a), passive: Math.min(1, (i.posts.spatialFactor * b) / a) };
}
const narrowed = (p: SidePoint["soil"], w: { soil: number; passive: number }): SideSpring | null => {
  if (!p) return null;
  const pa = p.pa * w.soil, pp = Math.max(pa, p.pp * w.passive);
  return { pa, pp, p0: Math.max(pa, Math.min(pp, p.p0 * w.soil)), k: p.k * w.passive };
};
/** Resulterende belasting volgens Blum op niveau nap: hoge zijde actief, lage zijde passief, met de waterdruk. */
export function blumLoad(i: WallInput, s: Scenario, nap: number): number {
  const h = sidePoint(s.high, nap), l = sidePoint(s.low, nap), w = widthFactors(i, nap);
  return ((h.soil?.pa ?? 0) + h.u - l.u) * w.soil - (l.soil?.pp ?? 0) * w.passive;
}

// ─── Verenmodel ───────────────────────────────────────────────────

export interface RunSide { pressureKpa: number; activeKpa: number; passiveKpa: number; neutralKpa: number; state: SpringState }
export interface RunRow {
  topNap: number;
  bottomNap: number;
  yM: number;
  uHighKpa: number;
  uLowKpa: number;
  high: RunSide | null;
  low: RunSide | null;
  /** Aandeel van de passieve weerstand dat aan de lage zijde is aangesproken (0 tot 1). */
  mobilisation: number | null;
}
export interface RunSample { nap: number; yM: number; momentKnM: number; shearKn: number }
export interface WallRun {
  scenario: Scenario;
  /** Drukken per m wand; bij palen met schotten onder de schotten omgerekend naar de paalbreedte. */
  rows: RunRow[];
  samples: RunSample[];
  maxMoment: { value: number; nap: number };
  maxShear: { value: number; nap: number };
  headDisplacementM: number;
  maxDisplacement: { value: number; nap: number };
  /** Ankerkracht: horizontaal per m, axiaal per m en per anker, en de verticale component per m. */
  anchor: { horizontalKn: number; axialKn: number; perAnchorKn: number; verticalKn: number; displacementM: number } | null;
  /** Passieve weerstand aan de lage zijde: aangesproken en maximaal [kN/m]. */
  passive: { mobilisedKn: number; maxKn: number; ratio: number };
  iterations: number;
  stable: boolean;
}

function mesh(i: WallInput, s: Scenario): number[] {
  const length = i.wallTopNap - i.toeNap, z = (nap: number) => i.wallTopNap - nap;
  const cuts: number[] = [0, length];
  const add = (v: number) => { if (v > 0 && v < length && cuts.every((c) => Math.abs(c - v) >= 0.01)) cuts.push(v); };
  if (hasAnchor(i)) {
    const a = Math.max(ANCHOR_BAND_M / 2, Math.min(length - ANCHOR_BAND_M / 2, z(i.anchor.levelNap)));
    add(a - ANCHOR_BAND_M / 2); add(a + ANCHOR_BAND_M / 2);
  }
  for (const nap of [...(i.construction === "posts" ? [i.posts.boardBottomNap] : []), s.high.surfaceNap, s.low.surfaceNap, s.high.waterNap, s.low.waterNap, ...s.high.layers.map((l) => l.topNap), ...s.low.layers.map((l) => l.topNap)]) add(z(nap));
  cuts.sort((a, b) => a - b);
  const step = Math.max(0.02, length / 140), out = [0];
  for (let k = 1; k < cuts.length; k++) {
    const len = cuts[k] - cuts[k - 1], parts = Math.max(1, Math.ceil(len / step - 1e-9));
    for (let j = 1; j <= parts; j++) out.push(j === parts ? cuts[k] : cuts[k - 1] + (len * j) / parts);
  }
  return out;
}

/** Horizontale veerstijfheid van de steun per m wand [kN/m per m]. */
export function supportStiffness(a: WallAnchor): number {
  return a.rigid ? RIGID_SUPPORT : (a.stiffnessKnPerM * Math.cos(rad(a.angleDeg)) ** 2) / a.spacingM;
}

export function runSpringModel(i: WallInput, s: Scenario, eiKnM2: number): WallRun {
  const zs = mesh(i, s), length = i.wallTopNap - i.toeNap, nap = (z: number) => i.wallTopNap - z, anchored = hasAnchor(i);
  const anchorZ = anchored ? Math.max(ANCHOR_BAND_M / 2, Math.min(length - ANCHOR_BAND_M / 2, i.wallTopNap - i.anchor.levelNap)) : null;
  const points = zs.slice(0, -1).map((a, k) => { const mid = nap((a + zs[k + 1]) / 2); return { high: sidePoint(s.high, mid), low: sidePoint(s.low, mid), w: widthFactors(i, mid) }; });
  const elements: WallElement[] = zs.slice(0, -1).map((a, k) => {
    const b = zs[k + 1], p = points[k], inBand = anchorZ !== null && (a + b) / 2 > anchorZ - ANCHOR_BAND_M / 2 && (a + b) / 2 < anchorZ + ANCHOR_BAND_M / 2;
    return { topM: a, bottomM: b, left: narrowed(p.high.soil, p.w), right: narrowed(p.low.soil, p.w), loadKpa: (p.high.u - p.low.u) * p.w.soil, supportKnM2: inBand ? supportStiffness(i.anchor) / ANCHOR_BAND_M : 0 };
  });
  const solved = solveSpringWall({ lengthM: length, eiKnM2, elements });
  let mobilised = 0, max = 0, support = 0, supportY = 0;
  const rows: RunRow[] = elements.map((e, k) => {
    const r = solved.elements[k], p = points[k], l = e.bottomM - e.topM;
    const side = (spring: SideSpring | null, res: { state: SpringState; pressureKpa: number } | null): RunSide | null =>
      spring && res ? { pressureKpa: res.pressureKpa, activeKpa: spring.pa, passiveKpa: spring.pp, neutralKpa: spring.p0, state: res.state } : null;
    const low = side(e.right, r.right);
    if (low) { mobilised += low.pressureKpa * l; max += low.passiveKpa * l; }
    if (e.supportKnM2) { support += r.supportKnM; supportY = r.yM; }
    return { topNap: nap(e.topM), bottomNap: nap(e.bottomM), yM: r.yM, uHighKpa: p.high.u * p.w.soil, uLowKpa: p.low.u * p.w.soil, high: side(e.left, r.left), low, mobilisation: low && low.passiveKpa > 0 ? low.pressureKpa / low.passiveKpa : null };
  });
  const samples: RunSample[] = solved.beam.samples.map((p) => ({ nap: nap(p.zM), yM: p.yM, momentKnM: p.momentKnM, shearKn: p.shearKn }));
  const peak = (value: (p: RunSample) => number) => samples.reduce((best, p) => (Math.abs(value(p)) > Math.abs(best.value) ? { value: value(p), nap: p.nap } : best), { value: 0, nap: i.wallTopNap });
  const cos = Math.cos(rad(i.anchor.angleDeg));
  return {
    scenario: s, rows, samples, maxMoment: peak((p) => p.momentKnM), maxShear: peak((p) => p.shearKn), headDisplacementM: solved.beam.nodes[0].yM, maxDisplacement: peak((p) => p.yM),
    anchor: anchored ? { horizontalKn: support, axialKn: support / cos, perAnchorKn: (support / cos) * i.anchor.spacingM, verticalKn: support * Math.tan(rad(i.anchor.angleDeg)), displacementM: supportY } : null,
    passive: { mobilisedKn: mobilised, maxKn: max, ratio: max > 0 ? mobilised / max : Infinity },
    iterations: solved.iterations,
    // Evenwicht: de iteratie is tot rust gekomen en de veren hoeven niets boven hun grens te leveren.
    stable: solved.converged && solved.excessKn <= 0.005 * Math.max(max, 1) && Math.abs(solved.beam.nodes[0].yM) < length,
  };
}

// ─── Doorsnede ────────────────────────────────────────────────────

export interface SectionModel {
  construction: Construction;
  /** Korte naam voor koppen en tekeningen. */
  label: string;
  /** Buigstijfheid per m wand [kNm²/m]. */
  eiKnM2: number;
  /** Dikte van de wand of breedte van de paal dwars op de wand [m], voor de tekening. */
  depthM: number;
  /** Eigenschappen voor de uitdraai: naam en waarde. */
  properties: Array<[string, string]>;
  profile: SheetPileProfile | null;
  fyMPa: number;
  massKgPerM2: number | null;
}

function timberDesign(tm: TimberInput) { return { fmD: (tm.kmod * tm.fmK) / tm.gammaM, fvD: (tm.kmod * tm.fvK) / tm.gammaM }; }

export function resolveSection(i: WallInput): SectionModel | string {
  const tm = i.timber, timberName = `${t("section.timber", "hout")} ${tm.classId}`;
  if (i.construction === "sheet-pile") {
    const profile = findSheetPile(i.profileId, i.manufacturer) ?? findSheetPile(i.profileId), grade = findGrade(i.grade);
    if (!profile) return t("errors.profile", "Kies een profiel uit de bibliotheek.");
    if (!grade) return t("errors.grade", "Kies een staalsoort.");
    const ei = wallStiffness(profile);
    if (ei === null) return t("errors.noStiffness", "Dit profiel heeft geen buigstijfheid in de bibliotheek (recht profiel).");
    return {
      construction: "sheet-pile", label: `${profile.id} ${grade.grade}`, eiKnM2: ei, depthM: (profile.wallHeightMm ?? 300) / 1000, profile, fyMPa: grade.fyMPa, massKgPerM2: profile.massKgPerM2,
      properties: [["I", `${n(profile.iCm4PerM ?? 0, 0)} cm⁴/m`], ["W_el", `${n(profile.welCm3PerM ?? 0, 0)} cm³/m`], ...(profile.wplCm3PerM ? [["W_pl", `${n(profile.wplCm3PerM, 0)} cm³/m`] as [string, string]] : []), ["A", `${n(profile.areaCm2PerM ?? 0, 1)} cm²/m`], ["f_y", `${n(grade.fyMPa, 0)} N/mm²`]],
    };
  }
  const timber = i.material === "timber";
  if (timber && !([tm.fmK, tm.fvK, tm.eMeanMPa, tm.kmod, tm.gammaM, tm.kcr].every((v) => Number.isFinite(v) && v > 0))) return t("errors.timber", "Controleer het hout: sterkte, elasticiteitsmodulus, k_mod, γ_M en k_cr zijn groter dan 0.");
  if (!timber && !(i.custom.eiKnM2 > 0 && i.custom.mRdKnM > 0 && i.custom.vRdKn >= 0)) return t("errors.custom", "Vul voor de eigen doorsnede de buigstijfheid en het opneembare moment in.");
  if (i.construction === "plank") {
    const d = i.plankMm / 1000;
    if (!(d > 0)) return t("errors.plank", "Vul de dikte van de plank in.");
    if (!timber) return { construction: "plank", label: t("section.customPlank", "plank, eigen doorsnede"), eiKnM2: i.custom.eiKnM2, depthM: d, profile: null, fyMPa: 0, massKgPerM2: null, properties: [["EI", `${n(i.custom.eiKnM2, 0)} kNm²/m`], ["M_Rd", `${n(i.custom.mRdKnM, 1)} kNm/m`]] };
    // Per m wand: I = d³/12, W = d²/6, A = d.
    return { construction: "plank", label: `${timberName}, ${n(i.plankMm, 0)} mm`, eiKnM2: (tm.eMeanMPa * 1000 * d ** 3) / 12, depthM: d, profile: null, fyMPa: 0, massKgPerM2: null,
      properties: [["I", `${n((d ** 3 / 12) * 1e8, 0)} cm⁴/m`], ["W", `${n((d ** 2 / 6) * 1e6, 0)} cm³/m`], ["E_0;mean", `${n(tm.eMeanMPa, 0)} N/mm²`], ["f_m;k", `${n(tm.fmK, 1)} N/mm²`], ["f_v;k", `${n(tm.fvK, 1)} N/mm²`]] };
  }
  const p = i.posts, b = p.sizeMm / 1000;
  if (!(b > 0 && p.spacingM > 0 && p.spatialFactor > 0 && p.boardMm > 0)) return t("errors.posts", "Controleer de palen: afmeting, hart-op-hartafstand, factor en schotdikte zijn groter dan 0.");
  if (b >= p.spacingM) return t("errors.postSpacing", "De hart-op-hartafstand is groter dan de paalbreedte.");
  const shape = p.shape === "round" ? t("section.round", "rond") : t("section.square", "vierkant");
  if (!timber) return { construction: "posts", label: t("section.customPost", "palen, eigen doorsnede"), eiKnM2: i.custom.eiKnM2 / p.spacingM, depthM: b, profile: null, fyMPa: 0, massKgPerM2: null, properties: [["EI", `${n(i.custom.eiKnM2, 0)} kNm² ${t("section.perPost", "per paal")}`], ["M_Rd", `${n(i.custom.mRdKnM, 1)} kNm ${t("section.perPost", "per paal")}`]] };
  const inertia = p.shape === "round" ? (Math.PI * b ** 4) / 64 : b ** 4 / 12, modulus = p.shape === "round" ? (Math.PI * b ** 3) / 32 : b ** 3 / 6;
  return { construction: "posts", label: `${timberName}, ${shape} ${n(p.sizeMm, 0)} mm`, eiKnM2: (tm.eMeanMPa * 1000 * inertia) / p.spacingM, depthM: b, profile: null, fyMPa: 0, massKgPerM2: null,
    properties: [["I", `${n(inertia * 1e8, 0)} cm⁴ ${t("section.perPost", "per paal")}`], ["W", `${n(modulus * 1e6, 0)} cm³ ${t("section.perPost", "per paal")}`], ["E_0;mean", `${n(tm.eMeanMPa, 0)} N/mm²`], ["f_m;k", `${n(tm.fmK, 1)} N/mm²`], ["f_v;k", `${n(tm.fvK, 1)} N/mm²`]] };
}

// ─── Uitkomst ─────────────────────────────────────────────────────

export interface WallStep { symbol: string; formula: string; filled?: string; result: string }
export interface WallCheck {
  id: "bending" | "shear" | "normal" | "board" | "boardShear" | "passive" | "embedment";
  label: string;
  title: string;
  article: string;
  load: number;
  resistance: number;
  unit: string;
  uc: number;
  passes: boolean;
  steps: WallStep[];
}

export interface CoefficientRow { side: "high" | "low"; name: string; topNap: number; phiRep: number; deltaRep: number; phiD: number; deltaD: number; cD: number; cuD: number; undrained: boolean; khD: number; coef: PressureCoefficients }
export interface LevelRow { nap: number; label: string; high: SidePoint; low: SidePoint }

export interface WallOk {
  ok: true;
  section: SectionModel;
  eiKnM2: number;
  lengthM: number;
  /** Representatieve berekening (factoren 1,0): verplaatsingen. */
  sls: WallRun;
  /** Berekening met rekenwaarden: snedekrachten, ankerkracht en toetsen. */
  uls: WallRun;
  coefficients: CoefficientRow[];
  levels: LevelRow[];
  blum: BlumResult & { kind: "cantilever" | "anchored"; excavationNap: number };
  checks: WallCheck[];
  governing: WallCheck;
  passes: boolean;
  warnings: string[];
}
export type WallResult = WallOk | { ok: false; error: string };

const fail = (error: string): WallResult => ({ ok: false, error });

function validate(i: WallInput): string | null {
  const nums = [i.groundHighNap, i.groundLowNap, i.excavationNap, i.waterHighNap, i.waterLowNap, i.surchargeKpa, i.wallTopNap, i.toeNap, i.betaB, i.normalForceKn];
  if (!nums.every(Number.isFinite)) return t("errors.incomplete", "Vul alle niveaus en belastingen in.");
  if (i.excavationNap >= i.groundHighNap) return t("errors.noRetaining", "Het niveau aan de lage zijde moet lager liggen dan het maaiveld aan de hoge zijde.");
  if (i.wallTopNap < i.groundHighNap - 1e-9) return t("errors.topBelowGround", "De bovenkant van de wand moet op of boven het maaiveld van de hoge zijde liggen.");
  if (i.toeNap >= i.excavationNap) return t("errors.toeAboveExcavation", "De teen van de wand moet onder het niveau aan de lage zijde liggen.");
  if (i.wallTopNap - i.toeNap > 60) return t("errors.tooLong", "De wand is langer dan 60 m; dat valt buiten dit rekenblad.");
  if (i.surchargeKpa < 0 || i.betaB <= 0 || i.betaB > 1) return t("errors.loads", "De bovenbelasting mag niet negatief zijn en βB ligt tussen 0 en 1.");
  if (i.construction === "posts" && !(i.posts.boardBottomNap < i.wallTopNap && i.posts.boardBottomNap > i.toeNap && i.posts.boardBottomNap <= i.excavationNap + 1e-9))
    return t("errors.boardBottom", "De onderkant van de schotten ligt op of onder het niveau aan de lage zijde en boven de teen van de paal.");
  const lists = i.lowSameAsHigh ? [i.layersHigh] : [i.layersHigh, i.layersLow];
  for (const layers of lists) {
    if (!layers.length) return t("errors.noLayers", "Voer minstens één grondlaag in.");
    for (const [k, l] of layers.entries()) {
      const name = l.name || String(k + 1);
      if (![l.topNap, l.gamma, l.gammaSat, l.phi, l.c, l.delta, l.cu, l.kh].every(Number.isFinite) || l.gamma <= 0 || l.gammaSat <= 0 || l.phi < 0 || l.phi >= 50 || l.c < 0 || l.delta < 0 || l.cu < 0)
        return t("errors.layer", "Laag {{name}}: controleer het volumegewicht, φ′, c′, δ en cu.", { name });
      if (l.undrained && l.cu <= 0) return t("errors.cu", "Laag {{name}} is ongedraineerd maar heeft geen cu.", { name });
      if (!l.undrained && l.phi <= 0) return t("errors.phi", "Laag {{name}}: een gedraineerde laag heeft een φ′ groter dan 0.", { name });
      if (!(l.kh > 0)) return t("errors.kh", "Laag {{name}}: vul de beddingsconstante in. Het rekenblad levert daarvoor geen tabelwaarde.", { name });
    }
  }
  const a = i.anchor;
  if (hasAnchor(i)) {
    if (![a.levelNap, a.angleDeg, a.spacingM, a.stiffnessKnPerM].every(Number.isFinite) || a.spacingM <= 0 || Math.abs(a.angleDeg) >= 80 || (!a.rigid && a.stiffnessKnPerM <= 0))
      return t("errors.anchor", "Controleer het anker: hoek kleiner dan 80°, hart-op-hartafstand en veerstijfheid groter dan 0.");
    if (a.levelNap > i.wallTopNap || a.levelNap <= i.excavationNap) return t("errors.anchorLevel", "Het anker ligt tussen de bovenkant van de wand en het niveau aan de lage zijde.");
  }
  const f = i.factors;
  if (![f.gammaPhi, f.gammaC, f.gammaCu, f.gammaGamma, f.gammaK, f.gammaM0].every((v) => Number.isFinite(v) && v > 0) || ![f.gammaQ, f.deltaAPct, f.deltaAMaxM, f.deltaWaterHighM, f.deltaWaterLowM].every((v) => Number.isFinite(v) && v >= 0))
    return t("errors.factors", "De partiële factoren zijn groter dan 0; de toeslagen zijn niet negatief.");
  return null;
}

const mEdStep = (uls: WallRun, value: number, unit: string): WallStep => ({ symbol: "M_Ed", formula: t("steps.mEd", "grootste moment uit het verenmodel met rekenwaarden, op NAP {{nap}} m", { nap: n(uls.maxMoment.nap) }), result: `${n(value, 1)} ${unit}` });
const vEdStep = (uls: WallRun, value: number, unit: string): WallStep => ({ symbol: "V_Ed", formula: t("steps.vEd", "grootste dwarskracht uit het verenmodel met rekenwaarden, op NAP {{nap}} m", { nap: n(uls.maxShear.nap) }), result: `${n(value, 1)} ${unit}` });

function steelChecks(i: WallInput, p: SheetPileProfile, fy: number, uls: WallRun): { checks: WallCheck[]; warnings: string[] } {
  const g = i.factors.gammaM0, checks: WallCheck[] = [], warnings: string[] = [];
  const mEd = Math.abs(uls.maxMoment.value), vEd = Math.abs(uls.maxShear.value), nEd = Math.abs(i.normalForceKn) + (uls.anchor ? Math.abs(uls.anchor.verticalKn) : 0);
  const cap = wallMomentCapacity(p, i.grade, g), cls = p.classes?.[findGrade(i.grade)!.grade];
  if (!cap) {
    warnings.push(t("warnings.noMoment", "Voor dit profiel en deze staalsoort geeft de bibliotheek geen momentcapaciteit (doorsnedeklasse 4 of geen weerstandsmoment); de staaltoetsen ontbreken."));
    return { checks, warnings };
  }
  const plastic = cap.basis === "plastisch", w = plastic ? p.wplCm3PerM! : p.welCm3PerM!, mRd = cap.mRd * i.betaB;
  checks.push({
    id: "bending", label: t("checks.bending.label", "buiging"), title: t("checks.bending.title", "Buiging van het profiel"), article: "NEN-EN 1993-5 art. 5.2.2", load: mEd, resistance: mRd, unit: "kNm/m", uc: mEd / mRd, passes: mEd <= mRd,
    steps: [
      mEdStep(uls, mEd, "kNm/m"),
      { symbol: "M_c;Rd", formula: `β_B · ${plastic ? "W_pl" : "W_el"} · f_y / γ_M0`, filled: `${n(i.betaB)} · ${n(w, 0)} cm³/m · ${n(fy, 0)} N/mm² / ${n(g)}`, result: `${n(mRd, 1)} kNm/m` },
      { symbol: "", formula: cls ? t("steps.class", "doorsnedeklasse {{cls}} bij {{grade}}: {{basis}} weerstandsmoment", { cls, grade: i.grade, basis: plastic ? t("steps.plastic", "plastisch") : t("steps.elastic", "elastisch") }) : t("steps.noClass", "geen doorsnedeklasse in de bibliotheek: elastisch weerstandsmoment"), result: `u.c. ${n(mEd / mRd)}` },
    ],
  });
  if (p.areaCm2PerM !== null) {
    const nRd = (p.areaCm2PerM * 100 * fy) / 1000 / g, ratio = nEd / nRd, z = p.shape === "Z", limit = !plastic ? 0 : z ? 0.1 : 0.25;
    // Interactie met de normaalkracht (art. 5.2.3): Z-profielen 1,11·(1 − n), U-profielen 1,33·(1 − n); klasse 3 lineair.
    const reduced = ratio <= limit ? mRd : Math.min(mRd, (plastic ? (z ? 1.11 : 1.33) : 1) * mRd * (1 - ratio));
    checks.push({
      id: "normal", label: t("checks.normal.label", "normaalkracht"), title: t("checks.normal.title", "Buiging met normaalkracht"), article: "NEN-EN 1993-5 art. 5.2.3", load: mEd, resistance: reduced, unit: "kNm/m", uc: Math.max(ratio, reduced > 0 ? mEd / reduced : Infinity), passes: ratio <= 1 && mEd <= reduced,
      steps: [
        { symbol: "N_Ed", formula: t("steps.nEd", "invoer plus de verticale component van de ankerkracht"), filled: `${n(Math.abs(i.normalForceKn), 1)} + ${n(uls.anchor ? Math.abs(uls.anchor.verticalKn) : 0, 1)}`, result: `${n(nEd, 1)} kN/m` },
        { symbol: "N_pl;Rd", formula: "A · f_y / γ_M0", filled: `${n(p.areaCm2PerM, 1)} cm²/m · ${n(fy, 0)} N/mm² / ${n(g)}`, result: `${n(nRd, 0)} kN/m` },
        { symbol: "N_Ed / N_pl;Rd", formula: ratio <= limit ? t("steps.nSmall", "niet groter dan {{limit}}: geen reductie van het moment", { limit: n(limit) }) : t("steps.nLarge", "groter dan {{limit}}: het opneembare moment wordt kleiner", { limit: n(limit) }), result: n(ratio, 3) },
        { symbol: "M_N;Rd", formula: ratio <= limit ? "M_c;Rd" : plastic ? `${z ? "1,11" : "1,33"} · M_c;Rd · (1 − N_Ed / N_pl;Rd) ≤ M_c;Rd` : "M_c;Rd · (1 − N_Ed / N_pl;Rd)", result: `${n(reduced, 1)} kNm/m` },
      ],
    });
  }
  if (p.webMm !== null && p.flangeMm !== null && p.widthMm !== null && p.wallHeightMm !== null && (p.shape === "Z" || p.shape === "U")) {
    // Afschuifoppervlak per lijf: tw·(h − tf); per m wand één lijf per plankbreedte.
    const av = (p.webMm * (p.wallHeightMm - p.flangeMm)) / (p.widthMm / 1000), vRd = (av * fy) / Math.sqrt(3) / 1000 / g;
    checks.push({
      id: "shear", label: t("checks.shear.label", "dwarskracht"), title: t("checks.shear.title", "Dwarskracht in het profiel"), article: "NEN-EN 1993-5 art. 5.2.2", load: vEd, resistance: vRd, unit: "kN/m", uc: vEd / vRd, passes: vEd <= vRd,
      steps: [
        vEdStep(uls, vEd, "kN/m"),
        { symbol: "A_v", formula: "t_w · (h − t_f) / b", filled: `${n(p.webMm, 1)} · (${n(p.wallHeightMm, 0)} − ${n(p.flangeMm, 1)}) / ${n(p.widthMm / 1000, 3)}`, result: `${n(av, 0)} mm²/m` },
        { symbol: "V_pl;Rd", formula: "A_v · f_y / (√3 · γ_M0)", filled: `${n(av, 0)} · ${n(fy, 0)} / (√3 · ${n(g)})`, result: `${n(vRd, 0)} kN/m` },
      ],
    });
    if (vEd > 0.5 * vRd) warnings.push(t("warnings.shearInteraction", "De dwarskracht is groter dan de helft van V_pl;Rd: de reductie van het moment door dwarskracht (NEN-EN 1993-5 art. 5.2.2) zit niet in dit rekenblad."));
  } else warnings.push(t("warnings.noShear", "De bibliotheek geeft voor dit profiel geen lijfdikte; de dwarskrachttoets ontbreekt."));
  return { checks, warnings };
}

/** Toetsen van een beschoeiing: plank of paal op buiging en afschuiving, en bij palen het schot als ligger ertussen. */
function revetmentChecks(i: WallInput, uls: WallRun): { checks: WallCheck[]; warnings: string[] } {
  const checks: WallCheck[] = [], warnings: string[] = [], tm = i.timber, d = timberDesign(tm), posts = i.construction === "posts", a = posts ? i.posts.spacingM : 1;
  const unitM = posts ? "kNm" : "kNm/m", unitV = posts ? "kN" : "kN/m", mEd = Math.abs(uls.maxMoment.value) * a, vEd = Math.abs(uls.maxShear.value) * a;
  const per = posts ? ` · ${n(a)} m (h.o.h.)` : "";
  const mStep = { ...mEdStep(uls, mEd, unitM), filled: posts ? `${n(Math.abs(uls.maxMoment.value), 1)} kNm/m${per}` : undefined };
  const vStep = { ...vEdStep(uls, vEd, unitV), filled: posts ? `${n(Math.abs(uls.maxShear.value), 1)} kN/m${per}` : undefined };
  const strength: WallStep[] = [
    { symbol: "f_m;d", formula: "k_mod · f_m;k / γ_M", filled: `${n(tm.kmod)} · ${n(tm.fmK, 1)} / ${n(tm.gammaM)}`, result: `${n(d.fmD)} N/mm²` },
  ];
  const shearStrength: WallStep = { symbol: "f_v;d", formula: "k_mod · f_v;k / γ_M", filled: `${n(tm.kmod)} · ${n(tm.fvK, 1)} / ${n(tm.gammaM)}`, result: `${n(d.fvD)} N/mm²` };
  const what = posts ? t("checks.post", "de paal") : t("checks.plank", "de plank");
  if (i.material === "timber") {
    // Weerstandsmoment en afschuifoppervlak: per m wand voor de plank, per paal voor rond of vierkant hout.
    const b = (posts ? i.posts.sizeMm : i.plankMm) / 1000, round = posts && i.posts.shape === "round";
    const w = !posts ? b ** 2 / 6 : round ? (Math.PI * b ** 3) / 32 : b ** 3 / 6, area = !posts ? b : round ? (Math.PI * b ** 2) / 4 : b ** 2, shape = round ? 4 / 3 : 1.5;
    const mRd = d.fmD * 1000 * w, vRd = (d.fvD * 1000 * tm.kcr * area) / shape;
    checks.push({ id: "bending", label: t("checks.bending.label", "buiging"), title: t("checks.bending.titleOf", "Buiging van {{what}}", { what }), article: "NEN-EN 1995-1-1 art. 6.1.6", load: mEd, resistance: mRd, unit: unitM, uc: mEd / mRd, passes: mEd <= mRd,
      steps: [mStep, ...strength, { symbol: "M_Rd", formula: `f_m;d · W, W = ${!posts ? "d² / 6" : round ? "π · d³ / 32" : "b³ / 6"}`, filled: `${n(d.fmD)} N/mm² · ${n(w * 1e6, 0)} cm³`, result: `${n(mRd, 2)} ${unitM}` }] });
    checks.push({ id: "shear", label: t("checks.shear.label", "dwarskracht"), title: t("checks.shear.titleOf", "Afschuiving van {{what}}", { what }), article: "NEN-EN 1995-1-1 art. 6.1.7", load: vEd, resistance: vRd, unit: unitV, uc: vEd / vRd, passes: vEd <= vRd,
      steps: [vStep, shearStrength, { symbol: "V_Rd", formula: `f_v;d · k_cr · A / ${round ? "(4/3)" : "1,5"}`, filled: `${n(d.fvD)} N/mm² · ${n(tm.kcr)} · ${n(area * 1e4, 1)} cm² / ${round ? "(4/3)" : "1,5"}`, result: `${n(vRd, 1)} ${unitV}` }] });
  } else {
    const mRd = i.custom.mRdKnM, vRd = i.custom.vRdKn;
    checks.push({ id: "bending", label: t("checks.bending.label", "buiging"), title: t("checks.bending.titleOf", "Buiging van {{what}}", { what }), article: t("checks.customArticle", "opgave van de leverancier"), load: mEd, resistance: mRd, unit: unitM, uc: mEd / mRd, passes: mEd <= mRd,
      steps: [mStep, { symbol: "M_Rd", formula: t("steps.customM", "opneembaar moment, invoer"), result: `${n(mRd, 2)} ${unitM}` }] });
    if (vRd > 0) checks.push({ id: "shear", label: t("checks.shear.label", "dwarskracht"), title: t("checks.shear.titleOf", "Afschuiving van {{what}}", { what }), article: t("checks.customArticle", "opgave van de leverancier"), load: vEd, resistance: vRd, unit: unitV, uc: vEd / vRd, passes: vEd <= vRd,
      steps: [vStep, { symbol: "V_Rd", formula: t("steps.customV", "opneembare dwarskracht, invoer"), result: `${n(vRd, 1)} ${unitV}` }] });
    else warnings.push(t("warnings.noCustomShear", "Er is geen opneembare dwarskracht ingevuld; de dwarskrachttoets ontbreekt."));
  }
  if (posts) {
    // Het schot draagt de druk op de wand naar de palen: ligger op twee steunpunten met overspanning h.o.h.
    const loaded = uls.rows.filter((row) => (row.topNap + row.bottomNap) / 2 > i.posts.boardBottomNap);
    const worst = loaded.reduce((best, row) => { const q = (row.high?.pressureKpa ?? 0) + row.uHighKpa - (row.low?.pressureKpa ?? 0) - row.uLowKpa; return q > best.q ? { q, nap: (row.topNap + row.bottomNap) / 2 } : best; }, { q: 0, nap: i.wallTopNap });
    const tb = i.posts.boardMm / 1000, m = (worst.q * a ** 2) / 8, v = (worst.q * a) / 2, mRd = d.fmD * 1000 * (tb ** 2 / 6), vRd = (d.fvD * 1000 * tm.kcr * tb) / 1.5;
    const qStep: WallStep = { symbol: "q_d", formula: t("steps.boardLoad", "grootste druk op het schot (grond en water, hoge min lage zijde), op NAP {{nap}} m", { nap: n(worst.nap) }), result: `${n(worst.q, 1)} kPa` };
    checks.push({ id: "board", label: t("checks.board.label", "schot"), title: t("checks.board.title", "Buiging van het schot tussen de palen"), article: "NEN-EN 1995-1-1 art. 6.1.6", load: m, resistance: mRd, unit: "kNm/m", uc: m / mRd, passes: m <= mRd,
      steps: [qStep, { symbol: "M_Ed", formula: "q_d · a² / 8", filled: `${n(worst.q, 1)} · ${n(a)}² / 8`, result: `${n(m, 2)} kNm/m` }, ...strength, { symbol: "M_Rd", formula: "f_m;d · t² / 6", filled: `${n(d.fmD)} N/mm² · ${n((tb ** 2 / 6) * 1e6, 0)} cm³/m`, result: `${n(mRd, 2)} kNm/m` }] });
    checks.push({ id: "boardShear", label: t("checks.boardShear.label", "schot, afschuiving"), title: t("checks.boardShear.title", "Afschuiving van het schot bij de paal"), article: "NEN-EN 1995-1-1 art. 6.1.7", load: v, resistance: vRd, unit: "kN/m", uc: v / vRd, passes: v <= vRd,
      steps: [qStep, { symbol: "V_Ed", formula: "q_d · a / 2", filled: `${n(worst.q, 1)} · ${n(a)} / 2`, result: `${n(v, 2)} kN/m` }, shearStrength, { symbol: "V_Rd", formula: "f_v;d · k_cr · t / 1,5", filled: `${n(d.fvD)} N/mm² · ${n(tm.kcr)} · ${n(i.posts.boardMm, 0)} mm / 1,5`, result: `${n(vRd, 1)} kN/m` }] });
  }
  return { checks, warnings };
}

export function computeWall(raw: WallInput): WallResult {
  const i = normalizeWallInput(raw);
  const invalid = validate(i);
  if (invalid) return fail(invalid);
  const section = resolveSection(i);
  if (typeof section === "string") return fail(section);
  const ei = section.eiKnM2, length = i.wallTopNap - i.toeNap, anchored = hasAnchor(i);
  const ulsScenario = buildScenario(i, i.factors), slsScenario = buildScenario(i, REPRESENTATIVE);
  if (ulsScenario.low.surfaceNap <= i.toeNap) return fail(t("errors.toeAboveDesign", "Met de toeslag op de kerende hoogte komt het niveau aan de lage zijde onder de teen."));

  // Blum met rekenwaarden: hoge zijde actief, lage zijde passief.
  const z = (nap: number) => i.wallTopNap - nap, excavationM = z(ulsScenario.low.surfaceNap);
  const classic = blum((zM) => blumLoad(i, ulsScenario, i.wallTopNap - zM), excavationM, anchored ? z(i.anchor.levelNap) : null, Math.min(120, Math.max(2 * length, excavationM * 4 + 5)), 0.01);
  const blumOut: WallOk["blum"] = { ...classic, kind: anchored ? "anchored" : "cantilever", excavationNap: ulsScenario.low.surfaceNap };
  const needed = anchored ? classic.free : classic.cantilever;
  const hint = needed ? " " + t("errors.blumHint", "De evenwichtsberekening volgens Blum vraagt een teen op NAP {{nap}} m of dieper.", { nap: n(i.wallTopNap - needed.requiredToeM) }) : "";

  let uls: WallRun, sls: WallRun;
  try { uls = runSpringModel(i, ulsScenario, ei); sls = runSpringModel(i, slsScenario, ei); }
  catch (e) { return fail(t("errors.solver", "Het verenmodel is niet oplosbaar: {{reason}}", { reason: e instanceof Error ? e.message : String(e) }) + hint); }
  if (!uls.stable) return fail(t("errors.unstable", "Geen evenwicht met rekenwaarden: de passieve weerstand aan de lage zijde is uitgeput. Vergroot de inheidiepte of voeg een steun toe.") + hint);
  if (!sls.stable) return fail(t("errors.unstableSls", "Geen evenwicht met representatieve waarden; controleer de invoer.") + hint);

  const { checks, warnings } = section.profile ? steelChecks(i, section.profile, section.fyMPa, uls) : revetmentChecks(i, uls);
  checks.push({
    id: "passive", label: t("checks.passive.label", "passieve weerstand"), title: t("checks.passive.title", "Aangesproken passieve weerstand"), article: "CUR 166", load: uls.passive.mobilisedKn, resistance: uls.passive.maxKn, unit: "kN/m", uc: uls.passive.ratio, passes: uls.passive.ratio <= 1,
    steps: [
      { symbol: "E_p;mob", formula: t("steps.eMob", "som van de korreldruk aan de lage zijde uit het verenmodel met rekenwaarden"), result: `${n(uls.passive.mobilisedKn, 1)} kN/m` },
      { symbol: "E_p;max", formula: t("steps.eMax", "som van de passieve korreldruk tussen NAP {{top}} m en de teen", { top: n(ulsScenario.low.surfaceNap) }), result: `${n(uls.passive.maxKn, 1)} kN/m` },
    ],
  });
  if (needed) {
    const available = ulsScenario.low.surfaceNap - i.toeNap, required = needed.requiredToeM - excavationM;
    checks.push({
      id: "embedment", label: t("checks.embedment.label", "inheidiepte"), title: anchored ? t("checks.embedment.titleFree", "Inheidiepte tegen Blum, vrij opgelegde voet") : t("checks.embedment.titleCantilever", "Inheidiepte tegen Blum, ingeklemde voet"),
      article: "Blum (1931)", load: required, resistance: available, unit: "m", uc: required / available, passes: required <= available + 1e-9,
      steps: [
        { symbol: "t_ben", formula: anchored ? t("steps.tFree", "momentenevenwicht om het anker") : "u + 1,2 · x", filled: anchored ? undefined : `${n(needed.zeroLoadM - excavationM)} + 1,2 · ${n(needed.theoreticalToeM - needed.zeroLoadM)}`, result: `${n(required)} m (NAP ${n(i.wallTopNap - needed.requiredToeM)} m)` },
        { symbol: "t", formula: t("steps.tAvailable", "niveau aan de lage zijde met toeslag min teenniveau"), filled: `${n(ulsScenario.low.surfaceNap)} − (${n(i.toeNap)})`, result: `${n(available)} m` },
      ],
    });
  } else warnings.push(t("warnings.noBlum", "De evenwichtsberekening volgens Blum vindt binnen het rekenbereik geen inheidiepte; de vergelijking ontbreekt."));

  const rows = (side: "high" | "low", rep: WallLayer[], d: ScenarioLayer[]): CoefficientRow[] => {
    const sorted = [...rep].sort((a, b) => b.topNap - a.topNap);
    return d.map((l, k) => ({ side, name: l.name, topNap: l.topNap, phiRep: sorted[k].phi, deltaRep: Math.min(sorted[k].delta, sorted[k].phi), phiD: l.phi, deltaD: l.delta, cD: l.c, cuD: l.cu, undrained: l.undrained, khD: l.kh, coef: l.coef }));
  };
  const coefficientRows = [...rows("high", i.layersHigh, ulsScenario.high.layers), ...(i.lowSameAsHigh ? [] : rows("low", i.layersLow, ulsScenario.low.layers))];
  // Tussenwaarden op de kenmerkende niveaus, net onder elke grens, en aan de teen.
  const marks = new Map<number, string>();
  const mark = (nap: number, label: string) => { if (nap <= i.wallTopNap && nap > i.toeNap) marks.set(Math.round(nap * 1000) / 1000, label); };
  for (const l of [...ulsScenario.high.layers, ...ulsScenario.low.layers]) mark(Math.min(l.topNap, ulsScenario.high.surfaceNap), l.name);
  mark(ulsScenario.high.waterNap, t("levels.waterHigh", "water hoge zijde")); mark(ulsScenario.low.waterNap, t("levels.waterLow", "water lage zijde"));
  mark(ulsScenario.high.surfaceNap, t("levels.groundHigh", "maaiveld hoge zijde")); mark(ulsScenario.low.surfaceNap, t("levels.excavation", "niveau lage zijde"));
  const levels: LevelRow[] = [...marks.entries()].sort((a, b) => b[0] - a[0]).map(([nap, label]) => ({ nap, label, high: sidePoint(ulsScenario.high, nap - 1e-6), low: sidePoint(ulsScenario.low, nap - 1e-6) }));
  levels.push({ nap: i.toeNap, label: t("levels.toe", "teen"), high: sidePoint(ulsScenario.high, i.toeNap), low: sidePoint(ulsScenario.low, i.toeNap) });

  if (ulsScenario.high.waterNap !== ulsScenario.low.waterNap) warnings.push(t("warnings.water", "De waterdruk is aan beide zijden hydrostatisch gerekend; stroming onder de teen door en het effect daarvan op de korrelspanning zitten niet in dit rekenblad."));
  if (i.construction === "posts") warnings.push(t("warnings.posts", "Palen met schotten: onder de schotten telt de passieve weerstand over {{f}} × de paalbreedte. Die factor voor ruimtelijke werking is invoer; controleer hem bij uw grond en paalafstand.", { f: n(i.posts.spatialFactor, 1) }));
  if (!section.profile && i.material === "timber") warnings.push(t("warnings.timber", "Hout: de verplaatsing is gerekend met E_0;mean zonder kruip (k_def); bij blijvende belasting in natte toepassing wordt de verplaatsing groter."));
  const governing = checks.reduce((a, b) => (b.uc > a.uc ? b : a));
  return { ok: true, section, eiKnM2: ei, lengthM: length, sls, uls, coefficients: coefficientRows, levels, blum: blumOut, checks, governing, passes: checks.every((c) => c.passes), warnings };
}

// ─── Voorbeelden en laagvoorstel ──────────────────────────────────

/** Laagindeling uit een sondering met startwaarden per grondsoort; de beddingsconstante blijft open. */
export function wallLayersFromCpt(cpt: Cpt): WallLayer[] {
  return layersFromCpt(cpt).map((l) => ({ topNap: l.topNap, name: l.name, soilId: l.soilId, gamma: l.gamma, gammaSat: l.gammaSat, phi: l.phi, c: l.c, delta: Math.round((l.phi * 2) / 3 * 10) / 10, undrained: false, cu: l.cu, kh: 0 }));
}

export const E_STEEL = E_STEEL_MPA;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Voorbeeld: enkel verankerde stalen damwand in zand, 4 m kerende hoogte. De beddingsconstanten zijn voorbeeldinvoer. */
export function wallExample(groundNap = 0): WallInput {
  const g = r2(groundNap);
  return {
    construction: "sheet-pile", material: "timber", timber: { ...DEFAULT_TIMBER }, plankMm: 50, custom: { eiKnM2: 100, mRdKnM: 10, vRdKn: 0 }, posts: { ...DEFAULT_POSTS, boardBottomNap: r2(g - 4.3) },
    cptId: null, groundHighNap: g, groundLowNap: g, excavationNap: g - 4, waterHighNap: g - 1.5, waterLowNap: g - 4, surchargeKpa: 10,
    layersHigh: [
      { topNap: g, name: "Zand, matig", soilId: "sand-medium", gamma: 18, gammaSat: 20, phi: 32.5, c: 0, delta: 21.7, undrained: false, cu: 0, kh: 20000 },
      { topNap: g - 7, name: "Zand, vast", soilId: "sand-dense", gamma: 19, gammaSat: 21, phi: 35, c: 0, delta: 23.3, undrained: false, cu: 0, kh: 40000 },
    ],
    lowSameAsHigh: true, layersLow: [],
    profileId: "AZ 18-700", manufacturer: "ArcelorMittal", grade: "S355GP", betaB: 1, wallTopNap: g, toeNap: g - 9, normalForceKn: 0,
    anchor: { enabled: true, levelNap: g - 1, angleDeg: 30, rigid: false, stiffnessKnPerM: 30000, spacingM: 2.8 },
    passiveMethod: "auto", factors: { ...DEFAULT_FACTORS },
  };
}

/**
 * Voorbeeld van een beschoeiing langs een watergang: 1,0 m kerende hoogte, water aan de voorzijde, grondwater
 * erachter en de belasting van een pad. Met houten planken (doorgaande wand) of met palen en schotten.
 */
export function revetmentExample(kind: "plank" | "posts", groundNap = 0): WallInput {
  const g = r2(groundNap), base = wallExample(g);
  return {
    ...base, construction: kind, material: "timber", timber: { ...DEFAULT_TIMBER }, plankMm: 50,
    posts: { spacingM: 0.8, shape: "round", sizeMm: 160, spatialFactor: 3, boardMm: 40, boardBottomNap: r2(g - 1.3) },
    groundHighNap: g, groundLowNap: g, excavationNap: r2(g - 1), waterHighNap: r2(g - 0.4), waterLowNap: r2(g - 0.5), surchargeKpa: 5,
    layersHigh: [
      { topNap: g, name: "Klei, matig", soilId: "clay-medium", gamma: 17, gammaSat: 17, phi: 22.5, c: 2, delta: 15, undrained: false, cu: 50, kh: 4000 },
      { topNap: r2(g - 2.5), name: "Zand, matig", soilId: "sand-medium", gamma: 18, gammaSat: 20, phi: 32.5, c: 0, delta: 21.7, undrained: false, cu: 0, kh: 20000 },
    ],
    wallTopNap: r2(g + 0.1), toeNap: r2(g - (kind === "posts" ? 4 : 3.5)), anchor: { ...base.anchor, enabled: false, levelNap: r2(g - 0.3), angleDeg: 0, stiffnessKnPerM: 5000, spacingM: 2 },
    factors: { ...FACTOR_SETS[0].factors },
  };
}
