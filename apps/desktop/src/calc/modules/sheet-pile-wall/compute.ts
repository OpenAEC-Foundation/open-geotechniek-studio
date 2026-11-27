// Damwand of beschoeiing met een hoge en een lage zijde, één ontgravingsfase. Rekenregels, bronnen en
// controlegetallen staan in VERIFICATIE.md; de module is een concept tot de normtekst zelf is nagelopen.
//
// Niveaus in m NAP, spanningen in kPa, krachten per strekkende meter wand. De hoge zijde staat links.
import type { Cpt } from "../../../types/cpt";
import { ct } from "../../i18n";
import { E_STEEL_MPA, findGrade, findSheetPile, wallMomentCapacity, wallStiffness, type SheetPileProfile } from "../../library/sheetPiles";
import { layersFromCpt } from "../spread-foundation/compute";
import { NO_CORROSION, corrodedSheetPile, faceSourceText, requireLoss, type CorrodedSheet, type CorrosionFace } from "../../shared/corrosion";
import { blum, type BlumResult } from "./blum";
import { coefficients, type PassiveMethod, type PressureCoefficients } from "./earth-pressure";
import { solveSpringWall, type SideSpring, type SpringState, type WallElement } from "./spring-model";
import { extraVerticalStress, profileStrips, type LineLoad, type Strip, type SurfaceLoad, type SurfacePoint } from "./surface-loads";

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
  /** Horizontale beddingsconstante [kN/m³]; invoer van de gebruiker. Bij drie takken de eerste (tot 50 %). */
  kh: number;
  /** Tweede en derde tak van de veer (tot 80 % en tot 100 %) [kN/m³]; beide ingevuld = drietakkige veer. */
  kh2?: number;
  kh3?: number;
  /** Wateroverspanning boven en onder in de laag [kPa], boven op de hydrostatische druk (stroming, stijghoogte). */
  excessTop?: number;
  excessBottom?: number;
}

export type AnchorKind = "strut" | "tie" | "grout";

/** Groutanker: vrije lengte, groutlichaam, trekelement, voorspanning en de factoren voor de toetsen. */
export interface GroutAnchor {
  freeLengthM: number;
  groutLengthM: number;
  diameterMm: number;
  tendonType: "bar" | "strand";
  gradeId: string;
  /** Doorsnede van het trekelement [mm²], rekgrens f_p0,1k of f_y [N/mm²] en elasticiteitsmodulus [N/mm²]. */
  areaMm2: number;
  fMPa: number;
  eMPa: number;
  /** Voorspankracht per anker, axiaal [kN]; 0 = niet voorgespannen. */
  prestressKn: number;
  /** Schachtwrijving langs het groutlichaam [kPa], representatief; invoer van de gebruiker. */
  shaftFrictionKpa: number;
  /** Extra factor op de ankerkracht uit de wandberekening. */
  loadFactor: number;
  /** Materiaalfactor op het staal en weerstandsfactor op de houdkracht van het groutlichaam. */
  gammaSteel: number;
  gammaPullout: number;
}

/**
 * Staalsoorten voor het trekelement met de rekgrens en de elasticiteitsmodulus uit de productnormen; niet tegen
 * de normtekst gelegd (VERIFICATIE.md). De gebruiker kan elke waarde overschrijven.
 */
export const TENDON_GRADES: Array<{ id: string; type: "bar" | "strand"; name: string; fMPa: number; eMPa: number }> = [
  { id: "y1860", type: "strand", name: "Y1860S7", fMPa: 1600, eMPa: 195000 },
  { id: "y1050", type: "bar", name: "Y1050H", fMPa: 950, eMPa: 205000 },
  { id: "b500", type: "bar", name: "B500B", fMPa: 500, eMPa: 200000 },
];
export const DEFAULT_GROUT: GroutAnchor = { freeLengthM: 6, groutLengthM: 6, diameterMm: 150, tendonType: "strand", gradeId: "y1860", areaMm2: 600, fMPa: 1600, eMPa: 195000, prestressKn: 0, shaftFrictionKpa: 0, loadFactor: 1.25, gammaSteel: 1.15, gammaPullout: 1.1 };

export interface WallAnchor {
  /** Vaste aanduiding van het steunpunt ("A1", "A2", …), waarmee een fase het aanbrengt of verwijdert. */
  id?: string;
  /** Soort steun: stempel naar de lage zijde, ankerstaaf naar een ankerschot of ankerpaal, of groutanker. */
  kind?: AnchorKind;
  grout?: GroutAnchor;
  enabled: boolean;
  levelNap: number;
  /** Hoek met de horizontaal, omlaag positief [°]; 0 voor een stempel. */
  angleDeg: number;
  rigid: boolean;
  /** Axiale veerstijfheid van één anker of stempel [kN/m]. */
  stiffnessKnPerM: number;
  /** Hart-op-hartafstand [m]. */
  spacingM: number;
  /** Voorspankracht per anker of stempel, axiaal [kN], bij een stempel of ankerstaaf; een groutanker heeft die in `grout`. */
  prestressKn?: number;
  /** Toets van de ankerstaaf (NEN-EN 1993-5 art. 7.2.3); alleen bij een ankerstaaf. */
  tie?: TieRod;
  /** Toets van de gording als ligger langs de wand tussen de ankers of stempels. */
  waler?: Waler;
}

/** Ankerstaaf: bruto doorsnede en spanningsdoorsnede van de draad, staalsoort, factoren en de extra factor op de ankerkracht. */
export interface TieRod { enabled: boolean; grossMm2: number; threadMm2: number; fyMPa: number; fuMPa: number; kt: number; gammaM0: number; gammaM2: number; loadFactor: number }
export const DEFAULT_TIE: TieRod = { enabled: false, grossMm2: 1257, threadMm2: 1000, fyMPa: 355, fuMPa: 490, kt: 0.6, gammaM0: 1, gammaM2: 1.25, loadFactor: 1.25 };
/** Gording: weerstandsmoment, staalsoort en de momentcoëfficiënt (q·a²/c; 8 = één veld, 10 = doorgaande ligger als benadering). */
export interface Waler { enabled: boolean; wCm3: number; fyMPa: number; gammaM0: number; coefficient: number; loadFactor: number }
export const DEFAULT_WALER: Waler = { enabled: false, wCm3: 1000, fyMPa: 355, gammaM0: 1, coefficient: 10, loadFactor: 1 };

/** Toetsen die een adviesrapport vaak bevat en die u aanzet: de vervormingseis en het verticale evenwicht. */
export interface WallExtraChecks {
  /** Grootste verplaatsing (representatief) tegen kerende hoogte / ratio, met een maximum. */
  deformation: { enabled: boolean; ratio: number; maxMm: number };
  /** Neerwaartse kracht op de wand tegen de puntweerstand: q_b;max · A_punt / (ξ · γ_b). */
  vertical: { enabled: boolean; qbMaxMPa: number; xi: number; gammaB: number };
}
export const DEFAULT_EXTRA_CHECKS: WallExtraChecks = { deformation: { enabled: false, ratio: 100, maxMm: 50 }, vertical: { enabled: false, qbMaxMPa: 0, xi: 1.39, gammaB: 1.2 } };

/**
 * Bouwfase: wat er ten opzichte van de vorige fase verandert. Een veld dat leeg is houdt de waarde van de vorige fase
 * (de eerste fase die van de invoer). Elke fase rekent verder vanaf de vervormde wand en de grondveren van de vorige.
 */
export interface WallPhase {
  name: string;
  /** Ontgraving of waterbodem aan de lage zijde [m NAP]. */
  excavationNap?: number;
  waterHighNap?: number;
  waterLowNap?: number;
  /** Gelijkmatige bovenbelasting op de hoge zijde [kPa]. */
  surchargeKpa?: number;
  /** Steunpunten (id) die in deze fase worden aangebracht en die worden verwijderd. */
  install?: string[];
  remove?: string[];
  /** Belastingen op afstand (id) die in deze fase werken; leeg = als de vorige fase (de eerste: alle). */
  loadIds?: string[];
  /** Maaiveld aan de hoge zijde (aanvullen, ophogen) en het maaiveldprofiel per zijde in deze fase. */
  groundHighNap?: number;
  profileHigh?: SurfacePoint[];
  profileLow?: SurfacePoint[];
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
  /** Verdere ankerrijen of stempels, elk met een eigen niveau, stijfheid en voorspanning. */
  extraSupports?: WallAnchor[];
  /** Bouwfasen; leeg = één fase met alle steunpunten. */
  phases?: WallPhase[];
  /** Stappenplan van CUR 166 (stap 6.1 tot en met 6.5); uit = één berekening met rekenwaarden en één representatief. */
  cur?: CurSetup;
  /** Vervormingseis en verticaal evenwicht. */
  extraChecks?: WallExtraChecks;
  /** Maaiveld dat van de wand af niet vlak is (talud, aflopende waterbodem), per zijde ten opzichte van het maaiveld bij de wand. */
  profileHigh?: SurfacePoint[];
  profileLow?: SurfacePoint[];
  /** Strook- en lijnlasten op afstand van de wand, naast de gelijkmatige bovenbelasting. */
  loads?: SurfaceLoad[];
  passiveMethod: PassiveMethod;
  factors: WallFactors;
  /** Reductiefactor op de buigstijfheid (U-planken zonder volledige schuifkrachtoverdracht in de sloten). */
  eiFactor?: number;
  /** Volumegewicht van water [kN/m³]; standaard 10. */
  gammaWater?: number;
  /** Afroesting van de stalen damwand; zonder deze invoer geen afroesting. */
  corrosion?: WallCorrosion;
}

/**
 * Afroesting per zijde van de wand, optioneel in twee zones boven en onder een niveau (bijvoorbeeld de waterlijn).
 * Alleen in de toetsen van de doorsnede, en in de buigstijfheid als `reducedStiffness` aan staat; niet in de gronddruk.
 */
export interface WallCorrosion {
  /** Hoge en lage zijde, over de hele wand of in de bovenste zone. */
  high: CorrosionFace;
  low: CorrosionFace;
  /** Twee zones: onder `zoneNap` gelden `highBelow` en `lowBelow`. */
  zoned: boolean;
  zoneNap: number;
  highBelow: CorrosionFace;
  lowBelow: CorrosionFace;
  /** Rekent de krachtsverdeling met de EI na afroesting (de kleinste over de zones); standaard met de oorspronkelijke. */
  reducedStiffness: boolean;
  /** Doorsnedeklasse na afroesting als die uit de catalogus niet vast te stellen is; leeg = de ongunstigste. */
  classChoice?: 2 | 3 | 4;
}
export const DEFAULT_CORROSION: WallCorrosion = { high: NO_CORROSION, low: NO_CORROSION, zoned: false, zoneNap: 0, highBelow: NO_CORROSION, lowBelow: NO_CORROSION, reducedStiffness: false };

/** Een zone van de wand met de doorsnede na afroesting. */
export interface CorrosionZone {
  topNap: number;
  bottomNap: number;
  /** Aanduiding in de koppen van de toetsen ("boven NAP 18,00 m"); leeg bij één zone. */
  label: string;
  lossHighMm: number;
  lossLowMm: number;
  sourceHigh: string;
  sourceLow: string;
  sheet: CorrodedSheet;
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

/**
 * Factorsets zoals openbare uitvoer van het stappenplan ze afdrukt (VERIFICATIE.md 13): γφ′ en γc′ als hierboven, een factor
 * op de variabele bovenbelasting (1,0 / 1,1 / 1,25), water aan de hoge zijde 0,05 m hoger en aan de lage zijde 0,20 m (RC1)
 * of 0,25 m (RC2, RC3) hoger of lager. Niet tegen de tekst van CUR 166 of NEN 9997-1 gelegd; γcu niet in die uitvoer.
 */
export const CUR_FACTOR_SETS: Array<{ id: string; name: string; factors: WallFactors; resultFactor: number }> = [
  { id: "rc1-cur", name: "RC1", factors: { ...FACTOR_SETS[0].factors, gammaQ: 1, deltaWaterHighM: 0.05, deltaWaterLowM: 0.2 }, resultFactor: 1.2 },
  { id: "rc2-cur", name: "RC2", factors: { ...FACTOR_SETS[1].factors, gammaQ: 1.1, deltaWaterHighM: 0.05, deltaWaterLowM: 0.25 }, resultFactor: 1.2 },
  { id: "rc3-cur", name: "RC3", factors: { ...FACTOR_SETS[2].factors, gammaQ: 1.25, deltaWaterHighM: 0.05, deltaWaterLowM: 0.25 }, resultFactor: 1.35 },
];

/** Verschuiving van de waterstand aan de lage zijde in een stap: omhoog, omlaag (met de toeslag van de factorset) of niet. */
export type WaterShift = "up" | "down" | "none";
/** Eén stap van het stappenplan. */
export interface CurStep {
  id: string;
  on: boolean;
  /** Rekenwaarden van de grondparameters (en de toeslagen); uit = representatieve waarden zonder toeslagen. */
  design: boolean;
  /** Factor op de ingevoerde beddingsconstanten. */
  khFactor: number;
  lowWater: WaterShift;
  /** Factor op moment, dwarskracht en ankerkracht van deze stap; bij stap 6.5 de factor waarmee de representatieve uitkomst ook als rekenwaarde telt. */
  resultFactor: number;
}
export interface CurSetup {
  enabled: boolean;
  steps: CurStep[];
  /** Laat de stappen met een hogere waterstand aan de lage zijde weg als daar in elke fase vrij water staat. */
  skipFreeWater: boolean;
}
/**
 * Het stappenplan zoals openbare uitvoer het per stap afdrukt (VERIFICATIE.md 13): 6.1 tot en met 6.4 met rekenwaarden in alle
 * fasen, lage beddingsconstanten (invoer / 1,3) of hoge (invoer × 2,25), het water aan de lage zijde omhoog (6.1, 6.2) of omlaag
 * (6.3, 6.4); 6.5 representatief, waarvan moment, dwarskracht en ankerkracht maal 1,2 (RC3: 1,35) ook als rekenwaarde tellen.
 * Niet tegen de tekst van CUR 166 gelegd.
 */
export const CUR_STEPS: CurStep[] = [
  { id: "6.1", on: true, design: true, khFactor: 1 / 1.3, lowWater: "up", resultFactor: 1 },
  { id: "6.2", on: true, design: true, khFactor: 2.25, lowWater: "up", resultFactor: 1 },
  { id: "6.3", on: true, design: true, khFactor: 1 / 1.3, lowWater: "down", resultFactor: 1 },
  { id: "6.4", on: true, design: true, khFactor: 2.25, lowWater: "down", resultFactor: 1 },
  { id: "6.5", on: true, design: false, khFactor: 1, lowWater: "none", resultFactor: 1.2 },
];
export const DEFAULT_CUR: CurSetup = { enabled: false, steps: CUR_STEPS, skipFreeWater: true };

/** De factoren van één stap: de factorset van de invoer met de beddingsconstante en de waterstand van de stap. */
export function stepFactors(f: WallFactors, step: CurStep): WallFactors {
  const water = step.lowWater === "down" ? f.deltaWaterLowM : step.lowWater === "up" ? -f.deltaWaterLowM : 0;
  return step.design ? { ...f, gammaK: 1 / step.khFactor, deltaWaterLowM: water } : { ...REPRESENTATIVE, gammaK: 1 / step.khFactor, deltaWaterLowM: water, gammaM0: f.gammaM0 };
}

/** Vult velden aan die een eerder opgeslagen berekening nog niet had. */
export function normalizeWallInput(i: WallInput): WallInput {
  return {
    ...i, construction: i.construction ?? "sheet-pile", material: i.material ?? "timber", timber: { ...DEFAULT_TIMBER, ...i.timber }, plankMm: i.plankMm ?? 50,
    custom: { ...DEFAULT_CUSTOM, ...i.custom }, posts: { ...DEFAULT_POSTS, ...i.posts }, factors: { ...DEFAULT_FACTORS, ...i.factors },
    extraChecks: { deformation: { ...DEFAULT_EXTRA_CHECKS.deformation, ...i.extraChecks?.deformation }, vertical: { ...DEFAULT_EXTRA_CHECKS.vertical, ...i.extraChecks?.vertical } },
    eiFactor: i.eiFactor ?? 1, gammaWater: i.gammaWater ?? GAMMA_WATER, cur: i.cur ? { ...DEFAULT_CUR, ...i.cur, steps: i.cur.steps?.length ? i.cur.steps : CUR_STEPS } : undefined, corrosion: { ...DEFAULT_CORROSION, ...i.corrosion }, anchor: { ...i.anchor, kind: i.anchor.kind ?? "tie", grout: { ...DEFAULT_GROUT, ...i.anchor.grout } },
  };
}

/** Hoek van de steun met de horizontaal [°]: een stempel ligt horizontaal. */
export const anchorAngle = (a: WallAnchor): number => (a.kind === "strut" ? 0 : a.angleDeg);
/** Axiale veerstijfheid van één anker [kN/m]: bij een groutanker E·A / vrije lengte. */
export function anchorStiffness(a: WallAnchor): number {
  const g = a.grout;
  return a.kind === "grout" && g ? (g.eMPa * g.areaMm2) / 1000 / g.freeLengthM : a.stiffnessKnPerM;
}

/** Alle steunpunten die meedoen, met hun id: steunpunt 1 is `anchor`, daarna `extraSupports`. Palen met schotten zijn onverankerd. */
export function wallSupports(i: WallInput): WallAnchor[] {
  if (i.construction === "posts") return [];
  const extra = (i.extraSupports ?? []).map((a, k) => ({ ...a, kind: a.kind ?? "tie", id: a.id || `A${k + 2}`, grout: a.kind === "grout" ? { ...DEFAULT_GROUT, ...a.grout } : a.grout }));
  return [{ ...i.anchor, id: i.anchor.id || "A1" }, ...extra].filter((a) => a.enabled);
}
export const hasAnchor = (i: WallInput): boolean => wallSupports(i).length > 0;

/** Een fase met alle waarden ingevuld en de steunpunten die er werken. */
export interface ResolvedPhase {
  index: number;
  name: string;
  excavationNap: number;
  waterHighNap: number;
  waterLowNap: number;
  surchargeKpa: number;
  /** Werkende steunpunten, en welke daarvan in deze fase zijn aangebracht. */
  supports: WallAnchor[];
  installed: string[];
  /** Belastingen op afstand die in deze fase werken. */
  loadIds: string[];
  groundHighNap: number;
  profileHigh: SurfacePoint[];
  profileLow: SurfacePoint[];
}

/** Belastingen op afstand met hun id ("B1", "B2", …). */
export const wallLoads = (i: WallInput): SurfaceLoad[] => (i.loads ?? []).map((l, k) => ({ ...l, id: l.id || `B${k + 1}` }));

/** Fasen met de geërfde waarden; zonder fasen één fase met alle steunpunten. */
export function resolvePhases(i: WallInput): ResolvedPhase[] {
  const all = wallSupports(i), loads = wallLoads(i).map((l) => l.id!);
  const first = { excavationNap: i.excavationNap, waterHighNap: i.waterHighNap, waterLowNap: i.waterLowNap, surchargeKpa: i.surchargeKpa, groundHighNap: i.groundHighNap, profileHigh: i.profileHigh ?? [], profileLow: i.profileLow ?? [] };
  if (!i.phases?.length) return [{ index: 0, name: "", ...first, supports: all, installed: all.map((a) => a.id!), loadIds: loads }];
  let prev = first, loadIds = loads;
  const active = new Set<string>();
  return i.phases.map((ph, index) => {
    const cur = { excavationNap: ph.excavationNap ?? prev.excavationNap, waterHighNap: ph.waterHighNap ?? prev.waterHighNap, waterLowNap: ph.waterLowNap ?? prev.waterLowNap, surchargeKpa: ph.surchargeKpa ?? prev.surchargeKpa,
      groundHighNap: ph.groundHighNap ?? prev.groundHighNap, profileHigh: ph.profileHigh ?? prev.profileHigh, profileLow: ph.profileLow ?? prev.profileLow };
    for (const id of ph.remove ?? []) active.delete(id);
    const installed = (ph.install ?? []).filter((id) => all.some((a) => a.id === id) && !active.has(id));
    for (const id of installed) active.add(id);
    prev = cur;
    if (ph.loadIds) loadIds = ph.loadIds.filter((id) => loads.includes(id));
    return { index, name: ph.name || String(index + 1), ...cur, supports: all.filter((a) => active.has(a.id!)), installed, loadIds };
  });
}

/** De invoer zoals die in één fase geldt: niveau lage zijde, waterstanden en bovenbelasting van die fase. */
export const phaseInput = (i: WallInput, ph: ResolvedPhase): WallInput => ({ ...i, excavationNap: ph.excavationNap, waterHighNap: ph.waterHighNap, waterLowNap: ph.waterLowNap, surchargeKpa: ph.surchargeKpa, groundHighNap: ph.groundHighNap, profileHigh: ph.profileHigh, profileLow: ph.profileLow, loads: wallLoads(i).filter((l) => ph.loadIds.includes(l.id!)) });

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
  kh2?: number;
  kh3?: number;
  excessTop: number;
  excessBottom: number;
  coef: PressureCoefficients;
}

export interface Side {
  surfaceNap: number;
  waterNap: number;
  surchargeKpa: number;
  gammaWater: number;
  layers: ScenarioLayer[];
  /** Strooklasten (belastingen op afstand en het maaiveldprofiel) en lijnlasten, met hun factor; leeg bij een vlak, onbelast maaiveld. */
  strips?: Strip[];
  lines?: LineLoad[];
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
    return { topNap: l.topNap, name: l.name, soilId: l.soilId, gamma: l.gamma / f.gammaGamma, gammaSat: l.gammaSat / f.gammaGamma, phi, c: l.c / f.gammaC, delta, undrained: l.undrained, cu: l.cu / f.gammaCu, kh: l.kh / f.gammaK, kh2: l.kh2 ? l.kh2 / f.gammaK : undefined, kh3: l.kh3 ? l.kh3 / f.gammaK : undefined, excessTop: l.excessTop ?? 0, excessBottom: l.excessBottom ?? 0, coef: coefficients(phi, delta, method) };
  });
}

export function buildScenario(i: WallInput, f: WallFactors, supportLevels: number[] = wallSupports(i).map((a) => a.levelNap)): Scenario {
  // Kerende hoogte: onder de onderste steun, of vanaf het maaiveld bij een onverankerde wand.
  const from = supportLevels.length ? Math.min(...supportLevels, i.groundHighNap) : i.groundHighNap;
  const deltaA = Math.min((f.deltaAPct / 100) * Math.max(0, from - i.excavationNap), f.deltaAMaxM);
  const high = scenarioLayers(i.layersHigh, f, i.passiveMethod), gw = i.gammaWater ?? GAMMA_WATER;
  const low = i.lowSameAsHigh ? high : scenarioLayers(i.layersLow, f, i.passiveMethod);
  const sides = { high: { surfaceNap: i.groundHighNap, waterNap: i.waterHighNap + f.deltaWaterHighM, layers: high }, low: { surfaceNap: i.excavationNap - deltaA, waterNap: i.waterLowNap - f.deltaWaterLowM, layers: low } };
  // Belastingen op afstand (maal de factor op de bovenbelasting) en het maaiveldprofiel als strooklasten; het profiel van de
  // lage zijde zakt met de toeslag op de kerende hoogte evenwijdig mee.
  const extra = (side: "high" | "low") => {
    const sd = sides[side], top = sd.layers[0];
    const gammaAt = (dz: number) => (sd.surfaceNap + dz / 2 > sd.waterNap ? top.gamma : top.gammaSat - gw);
    const strips: Strip[] = [...profileStrips((side === "high" ? i.profileHigh : i.profileLow) ?? [], gammaAt), ...(i.loads ?? []).filter((l) => l.side === side && l.kind === "strip").map((l) => ({ q: l.value * f.gammaQ, x1: Math.max(0, l.fromM), x2: l.toM }))];
    const lines: LineLoad[] = (i.loads ?? []).filter((l) => l.side === side && l.kind === "line").map((l) => ({ p: l.value * f.gammaQ, x: Math.max(0, l.fromM) }));
    return strips.length || lines.length ? { strips, lines } : {};
  };
  return {
    factors: f, deltaAM: deltaA,
    high: { ...sides.high, surchargeKpa: i.surchargeKpa * f.gammaQ, gammaWater: gw, ...extra("high") },
    low: { ...sides.low, surchargeKpa: 0, gammaWater: gw, ...extra("low") },
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
/** Wateroverspanning op niveau nap: lineair tussen boven- en onderkant van de laag; de onderste laag houdt de bovenwaarde. */
export function excessPressure(side: Side, nap: number): number {
  const k = side.layers.indexOf(layerAt(side.layers, nap)), l = side.layers[k], below = side.layers[k + 1];
  if (!below || !(l.topNap > below.topNap)) return l.excessTop;
  return l.excessTop + (Math.max(0, Math.min(1, (l.topNap - nap) / (l.topNap - below.topNap)))) * (l.excessBottom - l.excessTop);
}

export function sidePoint(side: Side, nap: number): SidePoint {
  const hydrostatic = side.gammaWater * Math.max(0, side.waterNap - nap);
  if (nap >= side.surfaceNap) return { sigmaV: hydrostatic, u: hydrostatic, sigmaVEff: 0, soil: null };
  const u = Math.max(0, hydrostatic + excessPressure(side, nap));
  let sigmaV = side.surchargeKpa + side.gammaWater * Math.max(0, side.waterNap - side.surfaceNap);
  const cuts = [side.surfaceNap, ...side.layers.map((l) => l.topNap), side.waterNap, nap].filter((z) => z <= side.surfaceNap && z >= nap).sort((a, b) => b - a);
  for (let k = 1; k < cuts.length; k++) {
    const a = cuts[k - 1], b = cuts[k], mid = (a + b) / 2;
    if (a - b <= 0) continue;
    const l = layerAt(side.layers, mid);
    sigmaV += (mid < side.waterNap ? l.gammaSat : l.gamma) * (a - b);
  }
  // Belastingen op afstand en het maaiveldprofiel; de korrelspanning wordt daardoor niet negatief.
  if (side.strips?.length || side.lines?.length) sigmaV = Math.max(sigmaV + extraVerticalStress(side.strips ?? [], side.lines ?? [], side.surfaceNap - nap), Math.min(sigmaV, u));
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
  return { sigmaV, u, sigmaVEff: eff, soil: { p0, pa, pp, k: layer.kh, k2: layer.kh2, k3: layer.kh3, layer } };
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
  return { pa, pp, p0: Math.max(pa, Math.min(pp, p.p0 * w.soil)), k: p.k * w.passive, k2: p.k2 ? p.k2 * w.passive : undefined, k3: p.k3 ? p.k3 * w.passive : undefined };
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
  /** Ankerkracht van het eerste werkende steunpunt: horizontaal per m, axiaal per m en per anker, en de verticale component per m. */
  anchor: { horizontalKn: number; axialKn: number; perAnchorKn: number; verticalKn: number; displacementM: number } | null;
  /** Kracht in elk werkend steunpunt. */
  supports: SupportForce[];
  /** Stand aan het eind van deze berekening, voor de volgende fase; null bij een omhullende. */
  state: RunState | null;
  /** Passieve weerstand aan de lage zijde: aangesproken en maximaal [kN/m]. */
  passive: { mobilisedKn: number; maxKn: number; ratio: number };
  iterations: number;
  stable: boolean;
}

/** Diepte van het midden van de band waarover een steun in het liggermodel is uitgesmeerd [m vanaf de kop]. */
const bandCentre = (i: WallInput, levelNap: number) => Math.max(ANCHOR_BAND_M / 2, Math.min(i.wallTopNap - i.toeNap - ANCHOR_BAND_M / 2, i.wallTopNap - levelNap));
/**
 * Breedte van de band [m]. Een uitgesmeerde veer houdt de wand ook tegen draaien, met k·b²/12; bij een stijve steun op een
 * slappe wand (een lichte beschoeiing met een vrijwel star anker) is dat niet meer klein. De band wordt dan smaller, tot die
 * draaistijfheid hooguit 2 % van EI per meter is: b = √(0,24·EI / k), niet breder dan 4 cm en niet smaller dan 2 mm.
 */
const bandWidth = (sup: WallAnchor, eiKnM2?: number) => (eiKnM2 ? Math.max(0.002, Math.min(ANCHOR_BAND_M, Math.sqrt((0.24 * eiKnM2) / supportStiffness(sup)))) : ANCHOR_BAND_M);

/** Elementindeling van de wand: dezelfde voor alle fasen van één berekening, zodat elke fase op de vorige aansluit. */
export function mesh(i: WallInput, scenarios: Scenario[], supports: WallAnchor[] = wallSupports(i), eiKnM2?: number): number[] {
  const length = i.wallTopNap - i.toeNap, z = (nap: number) => i.wallTopNap - nap;
  const cuts: number[] = [0, length];
  const add = (v: number) => { if (v > 0 && v < length && cuts.every((c) => Math.abs(c - v) >= 0.01)) cuts.push(v); };
  // De banden van de steunpunten eerst, met hun eigen breedte; een smalle band in vier stukken.
  const fine: Array<{ a: number; b: number; step: number }> = [];
  for (const sup of supports) {
    const a = bandCentre(i, sup.levelNap), w = bandWidth(sup, eiKnM2);
    for (const v of [a - w / 2, a + w / 2]) if (v > 0 && v < length && cuts.every((c) => Math.abs(c - v) >= 1e-6)) cuts.push(v);
    if (w < ANCHOR_BAND_M) fine.push({ a: a - w / 2, b: a + w / 2, step: w / 4 });
  }
  for (const s of scenarios) for (const nap of [...(i.construction === "posts" ? [i.posts.boardBottomNap] : []), s.high.surfaceNap, s.low.surfaceNap, s.high.waterNap, s.low.waterNap, ...s.high.layers.map((l) => l.topNap), ...s.low.layers.map((l) => l.topNap)]) add(z(nap));
  cuts.sort((a, b) => a - b);
  const step = Math.max(0.02, length / 140), out = [0];
  for (let k = 1; k < cuts.length; k++) {
    const len = cuts[k] - cuts[k - 1], mid = (cuts[k] + cuts[k - 1]) / 2, own = fine.find((x) => mid > x.a && mid < x.b)?.step ?? step, parts = Math.max(1, Math.ceil(len / Math.min(step, own) - 1e-9));
    for (let j = 1; j <= parts; j++) out.push(j === parts ? cuts[k] : cuts[k - 1] + (len * j) / parts);
  }
  return out;
}

/** Horizontale veerstijfheid van de steun per m wand [kN/m per m]. */
export function supportStiffness(a: WallAnchor): number {
  return a.rigid && a.kind !== "grout" ? RIGID_SUPPORT : (anchorStiffness(a) * Math.cos(rad(anchorAngle(a))) ** 2) / a.spacingM;
}
/** Horizontale voorspankracht per m wand [kN/m]: bij een groutanker uit `grout`, anders uit `prestressKn`. */
export function supportPreload(a: WallAnchor): number {
  const p = a.kind === "grout" ? a.grout?.prestressKn ?? 0 : a.prestressKn ?? 0;
  return (p * Math.cos(rad(anchorAngle(a)))) / a.spacingM;
}

/** Een werkend steunpunt in een fase, met de verplaatsing van de wand op zijn niveau toen het werd aangebracht. */
export interface ActiveSupport { support: WallAnchor; installYM: number }

/** Stand van de wand en de grond aan het eind van een fase, waar de volgende fase op verder rekent. */
export interface RunState {
  zs: number[];
  yM: number[];
  /** Per element en zijde: korreldruk (per m wand) en verticale korrelspanning aan het eind van de fase; null zonder grond. */
  high: Array<{ p: number; sv: number } | null>;
  low: Array<{ p: number; sv: number } | null>;
  /** Per werkend steunpunt de verplaatsing waarbij het werd aangebracht. */
  supports: Record<string, { installYM: number }>;
}

/** Kracht in één steunpunt in een fase. */
export interface SupportForce { id: string; levelNap: number; horizontalKn: number; axialKn: number; perAnchorKn: number; verticalKn: number; displacementM: number }

/**
 * Verenmodel van één fase. Zonder `previous` beginnen de veren bij de neutrale druk en een rechte wand; met `previous`
 * bij de druk en de verplaatsing aan het eind van de vorige fase, met de verandering van de verticale korrelspanning
 * maal K0 erbij (binnen de nieuwe grenzen). Een steunpunt werkt vanaf de verplaatsing waarbij het werd aangebracht.
 */
export function runSpringModel(i: WallInput, s: Scenario, eiKnM2: number, opts: { supports?: ActiveSupport[]; previous?: RunState; zs?: number[] } = {}): WallRun {
  const active = opts.supports ?? wallSupports(i).map((support) => ({ support, installYM: 0 }));
  const zs = opts.zs ?? mesh(i, [s], active.map((a) => a.support), eiKnM2), length = i.wallTopNap - i.toeNap, nap = (z: number) => i.wallTopNap - z;
  const prev = opts.previous && opts.previous.zs.length === zs.length ? opts.previous : undefined;
  const bands = active.map((a) => ({ ...a, z: bandCentre(i, a.support.levelNap), w: bandWidth(a.support, eiKnM2), kh: supportStiffness(a.support), preload: supportPreload(a.support) }));
  const points = zs.slice(0, -1).map((a, k) => { const mid = nap((a + zs[k + 1]) / 2); return { high: sidePoint(s.high, mid), low: sidePoint(s.low, mid), w: widthFactors(i, mid) }; });
  // Een veer die er al was begint op de stand van de vorige fase; nieuwe grond begint neutraal op de vervormde wand.
  const continued = (spring: SideSpring | null, point: SidePoint, w: { soil: number }, before: { p: number; sv: number } | null | undefined, wPrev: number): SideSpring | null => {
    if (!spring || !point.soil || !prev) return spring;
    if (!before) return { ...spring, w0: wPrev };
    const p0 = Math.max(spring.pa, Math.min(spring.pp, before.p + w.soil * point.soil.layer.coef.k0 * (point.sigmaVEff - before.sv)));
    return { ...spring, p0, w0: wPrev };
  };
  const inBandOf = (mid: number) => bands.filter((x) => mid > x.z - x.w / 2 && mid < x.z + x.w / 2);
  const elements: WallElement[] = zs.slice(0, -1).map((a, k) => {
    const b = zs[k + 1], p = points[k], inBand = inBandOf((a + b) / 2), yPrev = prev ? prev.yM[k] : 0;
    return {
      topM: a, bottomM: b, left: continued(narrowed(p.high.soil, p.w), p.high, p.w, prev?.high[k], -yPrev), right: continued(narrowed(p.low.soil, p.w), p.low, p.w, prev?.low[k], yPrev), loadKpa: (p.high.u - p.low.u) * p.w.soil,
      supportKnM2: inBand.reduce((sum, x) => sum + x.kh / x.w, 0),
      // Kracht = k·(y − y_aangebracht) + voorspanning, als lijnlast geschreven: k·y + (voorspanning − k·y_aangebracht).
      supportPreloadKnM: inBand.reduce((sum, x) => sum + (x.preload - x.kh * x.installYM) / x.w, 0),
    };
  });
  const solved = solveSpringWall({ lengthM: length, eiKnM2, elements });
  let mobilised = 0, max = 0;
  const forces = bands.map(() => ({ h: 0, y: 0 }));
  const rows: RunRow[] = elements.map((e, k) => {
    const r = solved.elements[k], p = points[k], l = e.bottomM - e.topM, mid = (e.topM + e.bottomM) / 2;
    const side = (spring: SideSpring | null, res: { state: SpringState; pressureKpa: number } | null): RunSide | null =>
      spring && res ? { pressureKpa: res.pressureKpa, activeKpa: spring.pa, passiveKpa: spring.pp, neutralKpa: spring.p0, state: res.state } : null;
    const low = side(e.right, r.right);
    if (low) { mobilised += low.pressureKpa * l; max += low.passiveKpa * l; }
    bands.forEach((x, j) => { if (mid > x.z - x.w / 2 && mid < x.z + x.w / 2) { forces[j].h += ((x.kh * r.yM + x.preload - x.kh * x.installYM) / x.w) * l; forces[j].y += (r.yM * l) / x.w; } });
    return { topNap: nap(e.topM), bottomNap: nap(e.bottomM), yM: r.yM, uHighKpa: p.high.u * p.w.soil, uLowKpa: p.low.u * p.w.soil, high: side(e.left, r.left), low, mobilisation: low && low.passiveKpa > 0 ? low.pressureKpa / low.passiveKpa : null };
  });
  // Binnen de band van een steun is de dwarskracht die van de uitgesmeerde veer; daar geldt de sprong van boven naar onder,
  // lineair over de band (anders kan een smalle, stijve band een piek geven die er bij een puntveer niet is).
  const raw = solved.beam.samples;
  const samples: RunSample[] = raw.map((p) => {
    const band = bands.find((x) => p.zM > x.z - x.w / 2 + 1e-12 && p.zM < x.z + x.w / 2 - 1e-12);
    if (!band) return { nap: nap(p.zM), yM: p.yM, momentKnM: p.momentKnM, shearKn: p.shearKn };
    const edge = (zM: number) => raw.reduce((b, q) => (Math.abs(q.zM - zM) < Math.abs(b.zM - zM) ? q : b)).shearKn, a = band.z - band.w / 2, t = (p.zM - a) / band.w;
    return { nap: nap(p.zM), yM: p.yM, momentKnM: p.momentKnM, shearKn: edge(a) + t * (edge(band.z + band.w / 2) - edge(a)) };
  });
  const peak = (value: (p: RunSample) => number) => samples.reduce((best, p) => (Math.abs(value(p)) > Math.abs(best.value) ? { value: value(p), nap: p.nap } : best), { value: 0, nap: i.wallTopNap });
  const supports: SupportForce[] = bands.map((x, j) => {
    const angle = rad(anchorAngle(x.support)), cos = Math.cos(angle), h = forces[j].h;
    return { id: x.support.id ?? "A1", levelNap: x.support.levelNap, horizontalKn: h, axialKn: h / cos, perAnchorKn: (h / cos) * x.support.spacingM, verticalKn: h * Math.tan(angle), displacementM: forces[j].y };
  });
  const state: RunState = {
    zs, yM: solved.elements.map((e) => e.yM),
    high: rows.map((row, k) => (row.high ? { p: row.high.pressureKpa, sv: points[k].high.sigmaVEff } : null)),
    low: rows.map((row, k) => (row.low ? { p: row.low.pressureKpa, sv: points[k].low.sigmaVEff } : null)),
    supports: Object.fromEntries(bands.map((x) => [x.support.id ?? "A1", { installYM: x.installYM }])),
  };
  const first = supports[0];
  return {
    scenario: s, rows, samples, maxMoment: peak((p) => p.momentKnM), maxShear: peak((p) => p.shearKn), headDisplacementM: solved.beam.nodes[0].yM, maxDisplacement: peak((p) => p.yM),
    anchor: first ? { horizontalKn: first.horizontalKn, axialKn: first.axialKn, perAnchorKn: first.perAnchorKn, verticalKn: first.verticalKn, displacementM: first.displacementM } : null,
    supports, state,
    passive: { mobilisedKn: mobilised, maxKn: max, ratio: max > 0 ? mobilised / max : Infinity },
    iterations: solved.iterations,
    // Evenwicht: de iteratie is tot rust gekomen en de veren hoeven niets boven hun grens te leveren.
    stable: solved.converged && solved.excessKn <= 0.005 * Math.max(max, 1) && Math.abs(solved.beam.nodes[0].yM) < length,
  };
}

/** Uitkomst van één fase binnen een berekening. */
export interface PhaseRun { phase: ResolvedPhase; scenario: Scenario; run: WallRun }

/**
 * Alle fasen van één berekening achter elkaar, met dezelfde factoren en elementindeling: elke fase begint op de stand
 * van de vorige. Een nieuw steunpunt werkt vanaf de verplaatsing van de wand op zijn niveau aan het eind van de vorige fase.
 */
export function runPhases(i: WallInput, phases: ResolvedPhase[], f: WallFactors, eiKnM2: number, scenarioOf: (ph: ResolvedPhase) => Scenario = (ph) => buildScenario(phaseInput(i, ph), f, ph.supports.map((a) => a.levelNap))): PhaseRun[] {
  const scenarios = phases.map(scenarioOf);
  const all = wallSupports(i).filter((a) => phases.some((ph) => ph.supports.some((b) => b.id === a.id)));
  const zs = mesh(i, scenarios, all, eiKnM2);
  let previous: RunState | undefined;
  return phases.map((ph, k) => {
    const supports = ph.supports.map((support) => {
      const known = previous?.supports[support.id!];
      if (known) return { support, installYM: known.installYM };
      const z = bandCentre(i, support.levelNap), e = zs.findIndex((a, j) => j + 1 < zs.length && z >= a && z <= zs[j + 1]);
      return { support, installYM: previous && e >= 0 ? previous.yM[e] : 0 };
    });
    const run = runSpringModel(phaseInput(i, ph), scenarios[k], eiKnM2, { supports, previous, zs });
    previous = run.state!;
    return { phase: ph, scenario: scenarios[k], run };
  });
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
  id: "bending" | "shear" | "normal" | "board" | "boardShear" | "passive" | "embedment" | "tendon" | "pullout" | "freeLength" | "deformation" | "vertical" | "tie" | "waler";
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

/** Uitwerking van het groutanker: ligging, stijfheid, krachten en weerstanden per anker. */
export interface GroutResult {
  /** Begin en eind van het groutlichaam: afstand achter de wand [m] en niveau [m NAP]. */
  start: { xM: number; nap: number };
  end: { xM: number; nap: number };
  /** Axiale veerstijfheid per anker [kN/m] en horizontaal per m wand [kN/m per m]. */
  stiffnessKnPerM: number;
  horizontalStiffness: number;
  /** Actief glijvlak vanaf de teen: hoek met de horizontaal [°] en de gemiddelde φ′ waarmee hij is bepaald. */
  slipAngleDeg: number;
  phiAvgDeg: number;
  /** Vrije lengte waarbij het groutlichaam op het glijvlak begint [m]. */
  requiredFreeM: number;
  /** Ankerkracht per anker uit de wandberekening met rekenwaarden, en met de extra factor [kN]. */
  forceKn: number;
  designForceKn: number;
  steelRdKn: number;
  pulloutRkKn: number;
  pulloutRdKn: number;
  /** Verlenging van de vrije lengte bij de ankerkracht [mm]. */
  elongationMm: number;
  /** Lagen waar het groutlichaam doorheen gaat, met de lengte in elke laag [m]. */
  layers: Array<{ name: string; lengthM: number; weak: boolean }>;
}

/** Eén berekening van één fase: de stap (rekenwaarden, representatief of een stap van het stappenplan) en de uitkomst. */
export interface CaseRun {
  /** "uls" en "sls" zonder stappenplan, anders de stap ("6.1" … "6.5"). */
  stepId: string;
  phase: number;
  phaseName: string;
  /** Telt mee voor de snedekrachten en de ankerkracht (rekenwaarden, of stap 6.5 maal de factor). */
  design: boolean;
  /** Geeft de verplaatsingen (representatieve waarden). */
  serviceability: boolean;
  /** Factor op moment, dwarskracht en ankerkracht van deze berekening (stap 6.5). */
  resultFactor: number;
  run: WallRun;
}

/**
 * Omhullende van berekeningen: per grootheid de grootste waarde, met de factor op de uitkomst. De verloop-lijnen zijn
 * de samengevoegde punten van alle berekeningen; voor de tekening per fase en stap staat elke berekening apart in `cases`.
 */
export function envelopeRun(list: CaseRun[]): WallRun {
  if (list.length === 1 && list[0].resultFactor === 1) return list[0].run;
  const scaled = list.map((c) => ({ c, f: c.resultFactor, samples: c.run.samples.map((p) => ({ ...p, momentKnM: p.momentKnM * c.resultFactor, shearKn: p.shearKn * c.resultFactor })) }));
  const samples = scaled.flatMap((x) => x.samples);
  const best = <T>(value: (c: CaseRun) => number, pick: (c: CaseRun) => T) => pick(list.reduce((a, b) => (value(b) > value(a) ? b : a)));
  const peak = (value: (p: RunSample) => number) => samples.reduce((b, p) => (Math.abs(value(p)) > Math.abs(b.value) ? { value: value(p), nap: p.nap } : b), { value: 0, nap: samples[0]?.nap ?? 0 });
  const ids = [...new Set(list.flatMap((c) => c.run.supports.map((x) => x.id)))];
  const supports: SupportForce[] = ids.map((id) => {
    const found = list.flatMap((c) => c.run.supports.filter((x) => x.id === id).map((x) => ({ x, f: c.resultFactor })));
    const top = found.reduce((a, b) => (Math.abs(b.x.horizontalKn * b.f) > Math.abs(a.x.horizontalKn * a.f) ? b : a));
    return { ...top.x, horizontalKn: top.x.horizontalKn * top.f, axialKn: top.x.axialKn * top.f, perAnchorKn: top.x.perAnchorKn * top.f, verticalKn: top.x.verticalKn * top.f };
  });
  const head = best((c) => Math.abs(c.run.headDisplacementM), (c) => c.run.headDisplacementM), first = supports[0];
  return {
    scenario: best((c) => Math.abs(c.run.maxMoment.value) * c.resultFactor, (c) => c.run.scenario), rows: best((c) => c.run.passive.ratio, (c) => c.run.rows), samples,
    maxMoment: peak((p) => p.momentKnM), maxShear: peak((p) => p.shearKn), headDisplacementM: head, maxDisplacement: peak((p) => p.yM),
    anchor: first ? { horizontalKn: first.horizontalKn, axialKn: first.axialKn, perAnchorKn: first.perAnchorKn, verticalKn: first.verticalKn, displacementM: first.displacementM } : null,
    supports, state: null, passive: best((c) => c.run.passive.ratio, (c) => c.run.passive), iterations: list.reduce((sum, c) => sum + c.run.iterations, 0), stable: list.every((c) => c.run.stable),
  };
}

/** De representatieve berekening met de grootste verplaatsing (de fase die de verplaatsing bepaalt). */
export const governingSls = (list: CaseRun[]): WallRun => list.reduce((a, b) => (Math.abs(b.run.maxDisplacement.value) > Math.abs(a.run.maxDisplacement.value) ? b : a)).run;

export interface WallOk {
  ok: true;
  /** Alle berekeningen per fase (en per stap), en de fasen zelf. */
  cases: CaseRun[];
  phases: ResolvedPhase[];
  grout: GroutResult | null;
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
  /** Afroesting per zone; null zonder afroesting of bij een beschoeiing. */
  corrosion: { zones: CorrosionZone[]; reducedStiffness: boolean; eiOriginalKnM2: number } | null;
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
      if (![l.topNap, l.gamma, l.gammaSat, l.phi, l.c, l.delta, l.cu, l.kh].every(Number.isFinite) || l.gamma <= 0 || l.gammaSat <= 0 || l.phi < 0 || l.phi >= 50 || l.c < 0 || (l.delta < 0 && l.delta <= -l.phi) || l.cu < 0)
        return t("errors.layer", "Laag {{name}}: controleer het volumegewicht, φ′, c′, δ en cu.", { name });
      if (l.undrained && l.cu <= 0) return t("errors.cu", "Laag {{name}} is ongedraineerd maar heeft geen cu.", { name });
      if (!l.undrained && l.phi <= 0) return t("errors.phi", "Laag {{name}}: een gedraineerde laag heeft een φ′ groter dan 0.", { name });
      if ((l.kh2 || l.kh3) && !(l.kh2! > 0 && l.kh3! > 0 && l.kh2! <= l.kh && l.kh3! <= l.kh2!)) return t("errors.branches", "Laag {{name}}: vul voor de drietakkige veer kh2 en kh3 allebei in, met kh1 ≥ kh2 ≥ kh3.", { name });
      if (![l.excessTop ?? 0, l.excessBottom ?? 0].every(Number.isFinite)) return t("errors.excess", "Laag {{name}}: controleer de wateroverspanning.", { name });
      if (!(l.kh > 0)) return t("errors.kh", "Laag {{name}}: vul de beddingsconstante in. Het rekenblad levert daarvoor geen tabelwaarde.", { name });
    }
  }
  const phases = resolvePhases(i);
  for (const ph of phases) {
    if (![ph.excavationNap, ph.waterHighNap, ph.waterLowNap, ph.surchargeKpa].every(Number.isFinite) || ph.surchargeKpa < 0) return t("stage.errors.phase", "Fase {{name}}: vul de niveaus en de belasting in.", { name: ph.name });
    if (ph.excavationNap >= ph.groundHighNap || ph.excavationNap <= i.toeNap || ph.groundHighNap > i.wallTopNap + 1e-9) return t("stage.errors.phaseLevel", "Fase {{name}}: het niveau aan de lage zijde ligt onder het maaiveld van de hoge zijde en boven de teen.", { name: ph.name });
  }
  for (const a of wallSupports(i)) {
    const g = a.grout!;
    if (a.kind === "grout") {
      if (![g.freeLengthM, g.groutLengthM, g.diameterMm, g.areaMm2, g.fMPa, g.eMPa, g.loadFactor, g.gammaSteel, g.gammaPullout].every((v) => Number.isFinite(v) && v > 0) || !(g.prestressKn >= 0) || !(a.spacingM > 0) || !(a.angleDeg >= 0 && a.angleDeg < 80))
        return t("errors.grout", "Controleer het groutanker: lengten, diameter, doorsnede, staalsterkte, elasticiteitsmodulus en factoren zijn groter dan 0; de hoek ligt tussen 0° en 80°.");
      if (!(g.shaftFrictionKpa > 0)) return t("errors.shaftFriction", "Vul de schachtwrijving langs het groutlichaam in. Het rekenblad levert daarvoor geen tabelwaarde.");
    } else if (![a.levelNap, a.angleDeg, a.spacingM, a.stiffnessKnPerM, a.prestressKn ?? 0].every(Number.isFinite) || a.spacingM <= 0 || Math.abs(a.angleDeg) >= 80 || (!a.rigid && a.stiffnessKnPerM <= 0) || (a.prestressKn ?? 0) < 0)
      return t("errors.anchor", "Controleer het anker: hoek kleiner dan 80°, hart-op-hartafstand en veerstijfheid groter dan 0.");
    const lowest = Math.min(...phases.filter((ph) => ph.supports.some((b) => b.id === a.id)).map((ph) => ph.excavationNap), Infinity);
    if (a.levelNap > i.wallTopNap || a.levelNap <= i.toeNap || (Number.isFinite(lowest) && a.levelNap <= lowest)) return t("errors.anchorLevel", "Het anker ligt tussen de bovenkant van de wand en het niveau aan de lage zijde.");
  }
  for (const l of i.loads ?? []) if (![l.value, l.fromM].every(Number.isFinite) || l.fromM < 0 || (l.kind === "strip" && !(l.toM > l.fromM))) return t("stage.errors.load", "Belasting op afstand: vul de grootte en de afstand tot de wand in; een strook loopt van een kleinere naar een grotere afstand.");
  for (const p of [...(i.profileHigh ?? []), ...(i.profileLow ?? [])]) if (![p.xM, p.dzM].every(Number.isFinite) || p.xM < 0) return t("stage.errors.profile", "Maaiveld: vul per punt de afstand tot de wand (niet negatief) en de hoogte in.");
  if (i.cur?.enabled && !i.cur.steps.every((x) => Number.isFinite(x.khFactor) && x.khFactor > 0 && Number.isFinite(x.resultFactor) && x.resultFactor >= 0)) return t("stage.errors.steps", "Stappenplan: de factoren op de beddingsconstante zijn groter dan 0 en die op de uitkomst niet negatief.");
  const f = i.factors;
  if (![f.gammaPhi, f.gammaC, f.gammaCu, f.gammaGamma, f.gammaK, f.gammaM0].every((v) => Number.isFinite(v) && v > 0) || ![f.gammaQ, f.deltaAPct, f.deltaAMaxM, f.deltaWaterHighM, f.deltaWaterLowM].every((v) => Number.isFinite(v) && v >= 0))
    return t("errors.factors", "De partiële factoren zijn groter dan 0; de toeslagen zijn niet negatief.");
  return null;
}

const mEdStep = (uls: WallRun, value: number, unit: string, nap = uls.maxMoment.nap): WallStep => ({ symbol: "M_Ed", formula: t("steps.mEd", "grootste moment uit het verenmodel met rekenwaarden, op NAP {{nap}} m", { nap: n(nap) }), result: `${n(value, 1)} ${unit}` });
const vEdStep = (uls: WallRun, value: number, unit: string, nap = uls.maxShear.nap): WallStep => ({ symbol: "V_Ed", formula: t("steps.vEd", "grootste dwarskracht uit het verenmodel met rekenwaarden, op NAP {{nap}} m", { nap: n(nap) }), result: `${n(value, 1)} ${unit}` });

/** Grootste moment en dwarskracht binnen een zone van de wand [kNm/m, kN/m] met hun niveau. */
function zonePeaks(uls: WallRun, zone: CorrosionZone) {
  const inside = uls.samples.filter((q) => q.nap <= zone.topNap + 1e-9 && q.nap >= zone.bottomNap - 1e-9);
  const peak = (value: (q: RunSample) => number) => inside.reduce((best, q) => (Math.abs(value(q)) > Math.abs(best.value) ? { value: value(q), nap: q.nap } : best), { value: 0, nap: zone.topNap });
  return { moment: peak((q) => q.momentKnM), shear: peak((q) => q.shearKn) };
}

/**
 * Toetsen van het stalen profiel (NEN-EN 1993-5). Met een zone: het profiel na afroesting van die zone, met het grootste
 * moment en de grootste dwarskracht binnen de zone; zonder zone het profiel zoals het is, met de grootste waarden.
 */
export function steelChecks(i: WallInput, p: SheetPileProfile, fy: number, uls: WallRun, zone?: CorrosionZone): { checks: WallCheck[]; warnings: string[] } {
  const g = i.factors.gammaM0, checks: WallCheck[] = [], warnings: string[] = [];
  const peaks = zone ? zonePeaks(uls, zone) : { moment: uls.maxMoment, shear: uls.maxShear }, corroded = zone && zone.sheet.basis !== "none" ? zone.sheet : null;
  const vertical = uls.supports?.length ? uls.supports.reduce((sum, x) => sum + Math.abs(x.verticalKn), 0) : uls.anchor ? Math.abs(uls.anchor.verticalKn) : 0;
  const mEd = Math.abs(peaks.moment.value), vEd = Math.abs(peaks.shear.value), nEd = Math.abs(i.normalForceKn) + vertical;
  const cap = wallMomentCapacity(p, i.grade, g), cls = p.classes?.[findGrade(i.grade)!.grade];
  const where = zone?.label ? ` (${zone.label})` : "";
  const lossSteps: WallStep[] = corroded && zone ? [
    { symbol: "Δt", formula: t("corrosion.steps.loss", "afroesting hoge zijde + lage zijde"), filled: `${n(zone.lossHighMm)} + ${n(zone.lossLowMm)} mm`, result: `${n(zone.lossHighMm + zone.lossLowMm)} mm` },
    { symbol: "t_f; t_w", formula: t("corrosion.steps.thickness", "plaatdikten na afroesting"), filled: `${n(corroded.original.flangeMm ?? 0, 1)} − ${n(zone.lossHighMm + zone.lossLowMm)}; ${n(corroded.original.webMm ?? 0, 1)} − ${n(zone.lossHighMm + zone.lossLowMm)}`, result: `${n(p.flangeMm ?? 0, 2)}; ${n(p.webMm ?? 0, 2)} mm` },
  ] : [];
  if (!cap) {
    if (corroded) warnings.push(t("corrosion.warnings.class4", "Na afroesting{{where}} is de doorsnede klasse 4 of heeft zij geen weerstandsmoment; buiging en normaalkracht zijn daar niet getoetst.", { where }));
    warnings.push(t("warnings.noMoment", "Voor dit profiel en deze staalsoort geeft de bibliotheek geen momentcapaciteit (doorsnedeklasse 4 of geen weerstandsmoment); de staaltoetsen ontbreken."));
    return { checks, warnings };
  }
  const plastic = cap.basis === "plastisch", w = plastic ? p.wplCm3PerM! : p.welCm3PerM!, mRd = cap.mRd * i.betaB;
  const wOriginal = corroded ? (plastic ? corroded.original.wplCm3PerM : corroded.original.welCm3PerM) : null;
  const wStep: WallStep[] = corroded && wOriginal !== null ? [{ symbol: plastic ? "W_pl;red" : "W_el;red", formula: corroded.basis === "contour" ? t("corrosion.steps.wContour", "uit de contour met de plaatdikte aan beide zijden verkleind") : t("corrosion.steps.wApprox", "benadering: W · (t_f − Δt) / t_f"), filled: `${n(wOriginal, 0)} → ${n(w, 0)} cm³/m`, result: `${n(w, 0)} cm³/m` }] : [];
  const origCls = corroded ? corroded.original.classes?.[findGrade(i.grade)!.grade] : undefined;
  checks.push({
    id: "bending", label: t("checks.bending.label", "buiging") + where, title: t("checks.bending.title", "Buiging van het profiel") + where, article: "NEN-EN 1993-5 art. 5.2.2", load: mEd, resistance: mRd, unit: "kNm/m", uc: mEd / mRd, passes: mEd <= mRd,
    steps: [
      mEdStep(uls, mEd, "kNm/m", peaks.moment.nap),
      ...lossSteps, ...wStep,
      { symbol: "M_c;Rd", formula: `β_B · ${plastic ? "W_pl" : "W_el"} · f_y / γ_M0`, filled: `${n(i.betaB)} · ${n(w, 0)} cm³/m · ${n(fy, 0)} N/mm² / ${n(g)}`, result: `${n(mRd, 1)} kNm/m` },
      { symbol: "", formula: (cls ? t("steps.class", "doorsnedeklasse {{cls}} bij {{grade}}: {{basis}} weerstandsmoment", { cls, grade: i.grade, basis: plastic ? t("steps.plastic", "plastisch") : t("steps.elastic", "elastisch") }) : t("steps.noClass", "geen doorsnedeklasse in de bibliotheek: elastisch weerstandsmoment")) + (corroded && origCls !== undefined && cls !== origCls ? ` ${t("corrosion.steps.classShift", "(na afroesting; zonder afroesting klasse {{cls}})", { cls: origCls })}` : ""), result: `u.c. ${n(mEd / mRd)}` },
    ],
  });
  if (p.areaCm2PerM !== null) {
    const nRd = (p.areaCm2PerM * 100 * fy) / 1000 / g, ratio = nEd / nRd, z = p.shape === "Z", limit = !plastic ? 0 : z ? 0.1 : 0.25;
    // Interactie met de normaalkracht (art. 5.2.3): Z-profielen 1,11·(1 − n), U-profielen 1,33·(1 − n); klasse 3 lineair.
    const reduced = ratio <= limit ? mRd : Math.min(mRd, (plastic ? (z ? 1.11 : 1.33) : 1) * mRd * (1 - ratio));
    checks.push({
      id: "normal", label: t("checks.normal.label", "normaalkracht") + where, title: t("checks.normal.title", "Buiging met normaalkracht") + where, article: "NEN-EN 1993-5 art. 5.2.3", load: mEd, resistance: reduced, unit: "kNm/m", uc: Math.max(ratio, reduced > 0 ? mEd / reduced : Infinity), passes: ratio <= 1 && mEd <= reduced,
      steps: [
        { symbol: "N_Ed", formula: t("steps.nEd", "invoer plus de verticale component van de ankerkracht"), filled: `${n(Math.abs(i.normalForceKn), 1)} + ${n(vertical, 1)}`, result: `${n(nEd, 1)} kN/m` },
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
      id: "shear", label: t("checks.shear.label", "dwarskracht") + where, title: t("checks.shear.title", "Dwarskracht in het profiel") + where, article: "NEN-EN 1993-5 art. 5.2.2", load: vEd, resistance: vRd, unit: "kN/m", uc: vEd / vRd, passes: vEd <= vRd,
      steps: [
        vEdStep(uls, vEd, "kN/m", peaks.shear.nap),
        ...lossSteps,
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

/** Ankerstaaf (NEN-EN 1993-5 art. 7.2.3) en gording (ligger langs de wand) van één steunpunt, met de ankerkracht uit de omhullende. */
export function supportChecks(a: WallAnchor, uls: WallRun, suffix = ""): WallCheck[] {
  const out: WallCheck[] = [], f = uls.supports?.find((x) => x.id === a.id) ?? (a.id === "A1" && uls.anchor ? { ...uls.anchor, id: "A1", levelNap: a.levelNap } : null);
  if (!f) return out;
  const tie = a.tie ? { ...DEFAULT_TIE, ...a.tie } : null;
  if (tie?.enabled && a.kind === "tie") {
    const fd = tie.loadFactor * Math.abs(f.perAnchorKn), ftt = (tie.kt * tie.fuMPa * tie.threadMm2) / tie.gammaM2 / 1000, ftg = (tie.fyMPa * tie.grossMm2) / tie.gammaM0 / 1000, rd = Math.min(ftt, ftg);
    out.push({ id: "tie", label: t("stage.checks.tie.label", "ankerstaaf") + suffix, title: t("stage.checks.tie.title", "Ankerstaaf op trek") + suffix, article: "NEN-EN 1993-5 art. 7.2.3", load: fd, resistance: rd, unit: "kN", uc: fd / rd, passes: fd <= rd,
      steps: [
        { symbol: "F_t;Ed", formula: t("stage.steps.tieLoad", "extra factor × ankerkracht per anker uit de omhullende"), filled: `${n(tie.loadFactor)} · ${n(Math.abs(f.perAnchorKn), 1)}`, result: `${n(fd, 1)} kN` },
        { symbol: "F_tt;Rd", formula: "k_t · f_ua · A_s / γ_M2", filled: `${n(tie.kt)} · ${n(tie.fuMPa, 0)} · ${n(tie.threadMm2, 0)} / ${n(tie.gammaM2)}`, result: `${n(ftt, 1)} kN` },
        { symbol: "F_tg;Rd", formula: "f_y · A_g / γ_M0", filled: `${n(tie.fyMPa, 0)} · ${n(tie.grossMm2, 0)} / ${n(tie.gammaM0)}`, result: `${n(ftg, 1)} kN` },
        { symbol: "F_t;Rd", formula: "min(F_tt;Rd; F_tg;Rd)", result: `${n(rd, 1)} kN` },
      ] });
  }
  const w = a.waler ? { ...DEFAULT_WALER, ...a.waler } : null;
  if (w?.enabled) {
    const q = w.loadFactor * Math.abs(f.horizontalKn), m = (q * a.spacingM ** 2) / w.coefficient, rd = (w.wCm3 * w.fyMPa) / w.gammaM0 / 1000;
    out.push({ id: "waler", label: t("stage.checks.waler.label", "gording") + suffix, title: t("stage.checks.waler.title", "Gording op buiging tussen de ankers") + suffix, article: "NEN-EN 1993-1-1 art. 6.2.5", load: m, resistance: rd, unit: "kNm", uc: m / rd, passes: m <= rd,
      steps: [
        { symbol: "q_d", formula: t("stage.steps.walerLoad", "factor × horizontale ankerkracht per m wand uit de omhullende"), filled: `${n(w.loadFactor)} · ${n(Math.abs(f.horizontalKn), 1)}`, result: `${n(q, 1)} kN/m` },
        { symbol: "M_Ed", formula: `q_d · a² / ${n(w.coefficient, 0)}`, filled: `${n(q, 1)} · ${n(a.spacingM)}² / ${n(w.coefficient, 0)}`, result: `${n(m, 1)} kNm` },
        { symbol: "M_Rd", formula: "W · f_y / γ_M0", filled: `${n(w.wCm3, 0)} cm³ · ${n(w.fyMPa, 0)} N/mm² / ${n(w.gammaM0)}`, result: `${n(rd, 1)} kNm` },
      ] });
  }
  return out;
}

/** Vervormingseis: grootste verplaatsing met representatieve waarden tegen de kerende hoogte gedeeld door de verhouding, met een maximum. */
export function deformationCheck(i: WallInput, phases: ResolvedPhase[], sls: WallRun, d: WallExtraChecks["deformation"]): WallCheck {
  const h = i.groundHighNap - Math.min(...phases.map((p) => p.excavationNap)), allowed = Math.min((1000 * h) / d.ratio, d.maxMm), y = Math.abs(sls.maxDisplacement.value) * 1000;
  return { id: "deformation", label: t("stage.checks.deformation.label", "vervorming"), title: t("stage.checks.deformation.title", "Vervorming tegen de eis"), article: t("stage.checks.deformation.article", "eis van de gebruiker"), load: y, resistance: allowed, unit: "mm", uc: y / allowed, passes: y <= allowed + 1e-9,
    steps: [
      { symbol: "u", formula: t("stage.steps.deformation", "grootste verplaatsing met representatieve waarden, op NAP {{nap}} m", { nap: n(sls.maxDisplacement.nap) }), result: `${n(y, 1)} mm` },
      { symbol: "u_toel", formula: "min(H / r; u_max)", filled: `min(${n(h)} m / ${n(d.ratio, 0)}; ${n(d.maxMm, 0)} mm)`, result: `${n(allowed, 1)} mm` },
    ] };
}

/** Wrijving van de korreldruk langs de wand: Σ σ′h · tan δ over de hoogte, aan de hoge zijde (omlaag) [kN/m]. */
function wallFriction(run: WallRun, side: "high" | "low"): number {
  return run.rows.reduce((sum, row) => {
    const r = row[side], mid = (row.topNap + row.bottomNap) / 2;
    return r ? sum + r.pressureKpa * (row.topNap - row.bottomNap) * Math.tan(rad(layerAt(run.scenario[side].layers, mid).delta)) : sum;
  }, 0);
}

/**
 * Verticaal evenwicht, in de vorm die openbare uitvoer afdrukt (VERIFICATIE.md 15): de neerwaartse kracht uit de wrijving
 * aan de hoge zijde (Σ σ′h·tan δ), de normaalkracht en de verticale component van de ankers, tegen de puntweerstand
 * q_b;max · A_punt / (ξ · γ_b). De wrijving aan de lage zijde (omhoog) telt niet mee; dat is aan de veilige kant.
 */
export function verticalCheck(i: WallInput, section: SectionModel, list: CaseRun[], v: WallExtraChecks["vertical"]): WallCheck | string {
  const area = section.profile ? section.profile.areaCm2PerM : i.construction === "plank" ? i.plankMm * 10 : i.posts.shape === "round" ? (Math.PI * (i.posts.sizeMm / 10) ** 2) / 4 / i.posts.spacingM : (i.posts.sizeMm / 10) ** 2 / i.posts.spacingM;
  if (!(area && area > 0) || !(v.qbMaxMPa >= 0 && v.xi > 0 && v.gammaB > 0)) return t("stage.warnings.vertical", "Verticaal evenwicht niet getoetst: geef de puntweerstand, ξ en γ_b op; de bibliotheek moet een doorsnede A hebben.");
  const worst = list.map((c) => ({ c, friction: wallFriction(c.run, "high"), anchors: c.run.supports.reduce((sum, x) => sum + Math.max(0, x.verticalKn), 0) })).reduce((a, b) => (b.friction + b.anchors > a.friction + a.anchors ? b : a));
  const fd = worst.friction + worst.anchors + Math.abs(i.normalForceKn), rb = (v.qbMaxMPa * 1000 * area * 1e-4) / (v.xi * v.gammaB);
  return { id: "vertical", label: t("stage.checks.vertical.label", "verticaal evenwicht"), title: t("stage.checks.vertical.title", "Verticaal evenwicht van de wand"), article: "CUR 166; NEN 9997-1", load: fd, resistance: rb, unit: "kN/m", uc: rb > 0 ? fd / rb : Infinity, passes: fd <= rb,
    steps: [
      { symbol: "F_δ", formula: t("stage.steps.friction", "Σ σ′h · tan δ aan de hoge zijde, representatief{{where}}", { where: worst.c.phaseName ? `, ${t("stage.errors.phaseName", "fase {{name}}", { name: worst.c.phaseName })}` : "" }), result: `${n(worst.friction, 1)} kN/m` },
      { symbol: "F_v;d", formula: t("stage.steps.verticalSum", "wrijving + verticale component van de ankers + normaalkracht"), filled: `${n(worst.friction, 1)} + ${n(worst.anchors, 1)} + ${n(Math.abs(i.normalForceKn), 1)}`, result: `${n(fd, 1)} kN/m` },
      { symbol: "R_b;d", formula: "q_b;max · A / (ξ · γ_b)", filled: `${n(v.qbMaxMPa)} MPa · ${n(area, 1)} cm²/m / (${n(v.xi)} · ${n(v.gammaB)})`, result: `${n(rb, 1)} kN/m` },
    ] };
}

/** Groutanker: ligging ten opzichte van het actieve glijvlak, trekelement en houdkracht van het groutlichaam. */
export function groutAnchor(i: WallInput, uls: WallRun, a: WallAnchor = { ...i.anchor, id: i.anchor.id || "A1" }, suffix = ""): { result: GroutResult; checks: WallCheck[]; warnings: string[] } {
  const g = a.grout!, s = uls.scenario, alpha = rad(a.angleDeg), warnings: string[] = [];
  const point = (along: number) => ({ xM: along * Math.cos(alpha), nap: a.levelNap - along * Math.sin(alpha) });
  const start = point(g.freeLengthM), end = point(g.freeLengthM + g.groutLengthM);
  // Gemiddelde φ′ (rekenwaarde) over de hoogte van de wand aan de hoge zijde, gewogen naar laagdikte.
  const top = Math.min(i.wallTopNap, s.high.surfaceNap), cuts = [top, ...s.high.layers.map((l) => l.topNap).filter((z) => z < top && z > i.toeNap), i.toeNap];
  let weighted = 0;
  for (let k = 1; k < cuts.length; k++) weighted += layerAt(s.high.layers, (cuts[k - 1] + cuts[k]) / 2).phi * (cuts[k - 1] - cuts[k]);
  const phiAvg = weighted / (top - i.toeNap), slip = 45 + phiAvg / 2, tanSlip = Math.tan(rad(slip));
  // Snijpunt van de ankerlijn met het glijvlak vanaf de teen: L·cos α·tan θ = (niveau − L·sin α) − teen.
  const required = (a.levelNap - i.toeNap) / (tanSlip * Math.cos(alpha) + Math.sin(alpha));
  const force = uls.supports?.find((x) => x.id === a.id)?.perAnchorKn ?? uls.anchor!.perAnchorKn, design = force * g.loadFactor;
  const steelRd = (g.areaMm2 * g.fMPa) / 1000 / g.gammaSteel, perimeter = Math.PI * (g.diameterMm / 1000);
  const pulloutRk = perimeter * g.groutLengthM * g.shaftFrictionKpa, pulloutRd = pulloutRk / g.gammaPullout, stiffness = anchorStiffness(a);
  // Lagen langs het groutlichaam.
  const layers: GroutResult["layers"] = [], lo = Math.min(start.nap, end.nap), hi = Math.max(start.nap, end.nap);
  s.high.layers.forEach((l, k) => {
    const upper = k === 0 ? Infinity : l.topNap, lower = k + 1 < s.high.layers.length ? s.high.layers[k + 1].topNap : -Infinity;
    const inside = hi === lo ? (lo <= upper && lo > lower ? g.groutLengthM : 0) : (Math.max(0, Math.min(hi, upper) - Math.max(lo, lower)) / (hi - lo)) * g.groutLengthM;
    if (inside > 1e-9) layers.push({ name: l.name, lengthM: inside, weak: l.undrained || l.phi < 27.5 });
  });
  if (start.nap > s.high.surfaceNap - 1e-9 || end.nap > s.high.surfaceNap - 1e-9) warnings.push(t("warnings.groutAboveGround", "Het groutlichaam komt boven het maaiveld van de hoge zijde uit; controleer niveau, hoek en lengten."));
  for (const l of layers.filter((x) => x.weak)) warnings.push(t("warnings.groutWeak", "Het groutlichaam ligt over {{length}} m in {{name}}. Controleer of die laag draagkrachtig is en welke schachtwrijving daar geldt.", { length: n(l.lengthM), name: l.name }));
  if (g.prestressKn > 0 && g.prestressKn > steelRd) warnings.push(t("warnings.prestress", "De voorspankracht is groter dan de rekenwaarde van de staalweerstand."));
  const fStep: WallStep = { symbol: "F_A;d", formula: t("steps.anchorDesign", "factor × ankerkracht per anker uit het verenmodel met rekenwaarden"), filled: `${n(g.loadFactor)} · ${n(force, 1)}`, result: `${n(design, 1)} kN` };
  const checks: WallCheck[] = [
    { id: "tendon", label: t("checks.tendon.label", "ankerstaal") + suffix, title: t("checks.tendon.title", "Trekelement van het groutanker") + suffix, article: "NEN-EN 1537; NEN 9997-1 hfdst. 8", load: design, resistance: steelRd, unit: "kN", uc: design / steelRd, passes: design <= steelRd,
      steps: [fStep, { symbol: "R_t;d", formula: `A · ${g.tendonType === "strand" ? "f_p0,1k" : "f_y"} / γ_s`, filled: `${n(g.areaMm2, 0)} mm² · ${n(g.fMPa, 0)} N/mm² / ${n(g.gammaSteel)}`, result: `${n(steelRd, 1)} kN` }] },
    { id: "pullout", label: t("checks.pullout.label", "groutlichaam") + suffix, title: t("checks.pullout.title", "Houdkracht van het groutlichaam") + suffix, article: "NEN 9997-1 hfdst. 8; CUR 166", load: design, resistance: pulloutRd, unit: "kN", uc: design / pulloutRd, passes: design <= pulloutRd,
      steps: [fStep, { symbol: "R_a;k", formula: "π · D · L_grout · τ", filled: `π · ${n(g.diameterMm / 1000, 3)} m · ${n(g.groutLengthM)} m · ${n(g.shaftFrictionKpa, 0)} kPa`, result: `${n(pulloutRk, 1)} kN` }, { symbol: "R_a;d", formula: "R_a;k / γ_a", filled: `${n(pulloutRk, 1)} / ${n(g.gammaPullout)}`, result: `${n(pulloutRd, 1)} kN` }] },
    { id: "freeLength", label: t("checks.freeLength.label", "vrije lengte") + suffix, title: t("checks.freeLength.title", "Groutlichaam buiten het actieve glijvlak") + suffix, article: "CUR 166", load: required, resistance: g.freeLengthM, unit: "m", uc: required / g.freeLengthM, passes: required <= g.freeLengthM + 1e-9,
      steps: [
        { symbol: "θ", formula: "45° + φ′_gem;d / 2", filled: `45 + ${n(phiAvg)} / 2`, result: `${n(slip, 1)}°` },
        { symbol: "L_vrij;min", formula: "(z_anker − z_teen) / (tan θ · cos α + sin α)", filled: `(${n(a.levelNap)} − (${n(i.toeNap)})) / (tan ${n(slip, 1)}° · cos ${n(a.angleDeg, 1)}° + sin ${n(a.angleDeg, 1)}°)`, result: `${n(required)} m` },
        { symbol: "L_vrij", formula: t("steps.freeLength", "vrije ankerlengte, invoer"), result: `${n(g.freeLengthM)} m` },
      ] },
  ];
  return { result: { start, end, stiffnessKnPerM: stiffness, horizontalStiffness: supportStiffness(a), slipAngleDeg: slip, phiAvgDeg: phiAvg, requiredFreeM: required, forceKn: force, designForceKn: design, steelRdKn: steelRd, pulloutRkKn: pulloutRk, pulloutRdKn: pulloutRd, elongationMm: (force / stiffness) * 1000, layers }, checks, warnings };
}

/**
 * Zones van de wand met het profiel na afroesting: één zone over de hele wand, of twee (boven en onder `zoneNap`). Een
 * melding als een tabelwaarde ontbreekt of de afroesting niet te verwerken is.
 */
export function corrosionZones(i: WallInput, profile: SheetPileProfile): CorrosionZone[] | string {
  const c = { ...DEFAULT_CORROSION, ...i.corrosion }, split = c.zoned && c.zoneNap < i.wallTopNap && c.zoneNap > i.toeNap;
  const zoneLabel = (above: boolean) => (!split ? "" : above ? t("corrosion.zoneAbove", "boven NAP {{nap}} m", { nap: n(c.zoneNap) }) : t("corrosion.zoneBelow", "onder NAP {{nap}} m", { nap: n(c.zoneNap) }));
  const parts: Array<[number, number, CorrosionFace, CorrosionFace, string]> = split
    ? [[i.wallTopNap, c.zoneNap, c.high, c.low, zoneLabel(true)], [c.zoneNap, i.toeNap, c.highBelow, c.lowBelow, zoneLabel(false)]]
    : [[i.wallTopNap, i.toeNap, c.high, c.low, ""]];
  const out: CorrosionZone[] = [];
  for (const [top, bottom, high, low, label] of parts) {
    const where = (side: string) => (label ? `${side}, ${label}` : side);
    const lh = requireLoss(high, where(t("corrosion.high", "hoge zijde"))), ll = requireLoss(low, where(t("corrosion.low", "lage zijde")));
    if (typeof lh === "string") return lh;
    if (typeof ll === "string") return ll;
    // De hoge zijde is zijde 1 van de contour (+y), de lage zijde zijde 2; de doorsnede is daarin symmetrisch.
    try { out.push({ topNap: top, bottomNap: bottom, label, lossHighMm: lh, lossLowMm: ll, sourceHigh: faceSourceText(high), sourceLow: faceSourceText(low), sheet: corrodedSheetPile(profile, lh, ll, c.classChoice) }); }
    catch (e) { return e instanceof Error ? e.message : String(e); }
  }
  return out;
}

function corrosionWarnings(i: WallInput, zones: CorrosionZone[]): string[] {
  const out: string[] = [], grade = findGrade(i.grade)!.grade;
  if (zones.some((z) => z.sheet.basis === "approx")) out.push(t("corrosion.warnings.approx", "Afroesting zonder exacte contour van dit profiel: I en W zijn benaderd met (t_f − Δt) / t_f en A met de gemiddelde plaatdikte. Dat is een benadering; controleer de waarden met de gegevens van de fabrikant."));
  for (const z of zones) {
    const range = z.sheet.classRange[grade], where = z.label ? ` (${z.label})` : "";
    if (range && range[1] > range[0]) out.push(t("corrosion.warnings.classUncertain", "Doorsnedeklasse na afroesting{{where}} bij {{grade}}: uit de catalogus volgt klasse {{from}} of {{to}}; gerekend met klasse {{cls}}. Kies onder Afroesting een klasse als u die kunt onderbouwen.", { where, grade, from: range[0], to: range[1], cls: z.sheet.profile.classes?.[grade] ?? "–" }));
  }
  if (!i.corrosion?.reducedStiffness) out.push(t("corrosion.warnings.stiffness", "De krachtsverdeling is gerekend met de buigstijfheid zonder afroesting; de afroesting telt alleen in de toetsen van de doorsnede."));
  return out;
}

export function computeWall(raw: WallInput): WallResult {
  const i = normalizeWallInput(raw);
  const invalid = validate(i);
  if (invalid) return fail(invalid);
  const section = resolveSection(i);
  if (typeof section === "string") return fail(section);
  if (!(i.eiFactor! > 0 && i.eiFactor! <= 1) || !(i.gammaWater! > 0)) return fail(t("errors.eiFactor", "De reductiefactor op EI ligt tussen 0 en 1 en het volumegewicht van water is groter dan 0."));
  const zones = section.profile ? corrosionZones(i, section.profile) : [];
  if (typeof zones === "string") return fail(zones);
  const corroded = zones.some((z) => z.sheet.basis !== "none"), co = i.corrosion!;
  // Standaard de oorspronkelijke buigstijfheid; met het vinkje de kleinste na afroesting.
  const eiCorroded = corroded && co.reducedStiffness ? Math.min(...zones.map((z) => wallStiffness(z.sheet.profile) ?? section.eiKnM2)) : section.eiKnM2;
  const ei = eiCorroded * i.eiFactor!, length = i.wallTopNap - i.toeNap, phases = resolvePhases(i), multi = phases.length > 1;
  const phaseScenario = (f: WallFactors) => (ph: ResolvedPhase) => buildScenario(phaseInput(i, ph), f, ph.supports.map((a) => a.levelNap));
  const ulsScenarios = phases.map(phaseScenario(i.factors));
  if (ulsScenarios.some((s) => s.low.surfaceNap <= i.toeNap)) return fail(t("errors.toeAboveDesign", "Met de toeslag op de kerende hoogte komt het niveau aan de lage zijde onder de teen."));

  // Blum met rekenwaarden, in de fase met de diepste ontgraving: hoge zijde actief, lage zijde passief. Alleen met hooguit één steunpunt.
  const deepest = ulsScenarios.reduce((best, s, k) => (s.low.surfaceNap < ulsScenarios[best].low.surfaceNap ? k : best), 0), ulsScenario = ulsScenarios[deepest];
  const blumSupports = phases[deepest].supports, anchored = blumSupports.length > 0, blumInput = phaseInput(i, phases[deepest]);
  const z = (nap: number) => i.wallTopNap - nap, excavationM = z(ulsScenario.low.surfaceNap);
  const classic = blum((zM) => blumLoad(blumInput, ulsScenario, i.wallTopNap - zM), excavationM, anchored ? z(Math.max(...blumSupports.map((a) => a.levelNap))) : null, Math.min(120, Math.max(2 * length, excavationM * 4 + 5)), 0.01);
  const blumOut: WallOk["blum"] = { ...classic, kind: anchored ? "anchored" : "cantilever", excavationNap: ulsScenario.low.surfaceNap };
  const needed = blumSupports.length > 1 ? null : anchored ? classic.free : classic.cantilever;
  const hint = needed ? " " + t("errors.blumHint", "De evenwichtsberekening volgens Blum vraagt een teen op NAP {{nap}} m of dieper.", { nap: n(i.wallTopNap - needed.requiredToeM) }) : "";

  let ulsRuns: PhaseRun[], slsRuns: PhaseRun[];
  try { ulsRuns = runPhases(i, phases, i.factors, ei, phaseScenario(i.factors)); slsRuns = runPhases(i, phases, REPRESENTATIVE, ei, phaseScenario(REPRESENTATIVE)); }
  catch (e) { return fail(t("errors.solver", "Het verenmodel is niet oplosbaar: {{reason}}", { reason: e instanceof Error ? e.message : String(e) }) + hint); }
  const where = (runs: PhaseRun[]) => { const bad = runs.find((x) => !x.run.stable); return bad && multi ? " " + t("stage.errors.inPhase", "(fase {{name}})", { name: bad.phase.name }) : ""; };
  if (ulsRuns.some((x) => !x.run.stable)) return fail(t("errors.unstable", "Geen evenwicht met rekenwaarden: de passieve weerstand aan de lage zijde is uitgeput. Vergroot de inheidiepte of voeg een steun toe.") + where(ulsRuns) + hint);
  if (slsRuns.some((x) => !x.run.stable)) return fail(t("errors.unstableSls", "Geen evenwicht met representatieve waarden; controleer de invoer.") + where(slsRuns) + hint);
  const cases: CaseRun[] = [
    ...ulsRuns.map((x) => ({ stepId: "uls", phase: x.phase.index, phaseName: x.phase.name, design: true, serviceability: false, resultFactor: 1, run: x.run })),
    ...slsRuns.map((x) => ({ stepId: "sls", phase: x.phase.index, phaseName: x.phase.name, design: false, serviceability: true, resultFactor: 1, run: x.run })),
  ];
  const curOn = i.cur?.enabled === true, skipped: string[] = [];
  if (curOn) {
    // Stappenplan: elke stap rekent alle fasen door, met de factoren van die stap in alle fasen.
    cases.length = 0;
    const free = phases.every((ph) => ph.waterLowNap >= ph.excavationNap - 1e-9);
    for (const step of i.cur!.steps.filter((x) => x.on)) {
      if (i.cur!.skipFreeWater && free && step.lowWater === "up") { skipped.push(step.id); continue; }
      const f = stepFactors(i.factors, step);
      let runs: PhaseRun[];
      try { runs = runPhases(i, phases, f, ei, phaseScenario(f)); }
      catch (e) { return fail(t("errors.solver", "Het verenmodel is niet oplosbaar: {{reason}}", { reason: e instanceof Error ? e.message : String(e) }) + hint); }
      const bad = runs.find((x) => !x.run.stable);
      if (bad) return fail(t("stage.errors.unstableStep", "Geen evenwicht in stap {{step}}{{phase}}: de passieve weerstand aan de lage zijde is uitgeput. Vergroot de inheidiepte of voeg een steun toe.", { step: step.id, phase: multi ? ", " + t("stage.errors.phaseName", "fase {{name}}", { name: bad.phase.name }) : "" }) + hint);
      if (runs.some((x) => x.scenario.low.surfaceNap <= i.toeNap)) return fail(t("errors.toeAboveDesign", "Met de toeslag op de kerende hoogte komt het niveau aan de lage zijde onder de teen."));
      for (const x of runs) cases.push({ stepId: step.id, phase: x.phase.index, phaseName: x.phase.name, design: step.design || step.resultFactor > 0, serviceability: !step.design, resultFactor: step.design ? step.resultFactor : Math.max(0, step.resultFactor), run: x.run });
    }
    if (!cases.some((c) => c.serviceability) || !cases.some((c) => c.design)) return fail(t("stage.errors.noSteps", "Zet in het stappenplan minstens één stap met rekenwaarden en stap 6.5 (representatief) aan."));
  }
  const uls = envelopeRun(cases.filter((c) => c.design)), sls = governingSls(cases.filter((c) => c.serviceability));

  const { checks, warnings } = !section.profile ? revetmentChecks(i, uls) : !corroded ? steelChecks(i, section.profile, section.fyMPa, uls) : zones.reduce<{ checks: WallCheck[]; warnings: string[] }>((acc, z) => {
    const part = steelChecks(i, z.sheet.profile, section.fyMPa, uls, z);
    return { checks: [...acc.checks, ...part.checks], warnings: [...acc.warnings, ...part.warnings.filter((w) => !acc.warnings.includes(w))] };
  }, { checks: [], warnings: [] });
  if (corroded) warnings.push(...corrosionWarnings(i, zones));
  checks.push({
    id: "passive", label: t("checks.passive.label", "passieve weerstand"), title: t("checks.passive.title", "Aangesproken passieve weerstand"), article: "CUR 166", load: uls.passive.mobilisedKn, resistance: uls.passive.maxKn, unit: "kN/m", uc: uls.passive.ratio, passes: uls.passive.ratio <= 1,
    steps: [
      { symbol: "E_p;mob", formula: t("steps.eMob", "som van de korreldruk aan de lage zijde uit het verenmodel met rekenwaarden"), result: `${n(uls.passive.mobilisedKn, 1)} kN/m` },
      { symbol: "E_p;max", formula: t("steps.eMax", "som van de passieve korreldruk tussen NAP {{top}} m en de teen", { top: n(ulsScenario.low.surfaceNap) }), result: `${n(uls.passive.maxKn, 1)} kN/m` },
    ],
  });
  let grout: GroutResult | null = null;
  const all = wallSupports(i), grouts = all.filter((a) => a.kind === "grout");
  for (const a of grouts) {
    const ga = groutAnchor(i, uls, a, all.length > 1 ? ` (${a.id})` : "");
    grout ??= ga.result; checks.push(...ga.checks); warnings.push(...ga.warnings.filter((w) => !warnings.includes(w)));
  }
  if (grouts.length) warnings.push(t("warnings.kranz", "De stabiliteit van het diepe glijvlak (Kranz) en de beproeving van het anker zitten niet in dit rekenblad."));
  if (blumSupports.length > 1) warnings.push(t("stage.warnings.blumMulti", "Blum is alleen uitgewerkt voor één steunpunt; met meer steunpunten ontbreekt de vergelijking van de inheidiepte."));
  if (skipped.length) warnings.push(t("stage.warnings.skipped", "Stap {{steps}} vervalt: aan de lage zijde staat in elke fase vrij water, dan is een lage waterstand het ongunstigst.", { steps: skipped.join(", ") }));
  if (curOn) warnings.push(t("stage.warnings.curSteps", "Het stappenplan volgt de instellingen die openbare berekeningen per stap afdrukken; het is niet tegen de tekst van CUR 166 gelegd. Controleer de stappen en factoren."));
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
  } else if (blumSupports.length <= 1) warnings.push(t("warnings.noBlum", "De evenwichtsberekening volgens Blum vindt binnen het rekenbereik geen inheidiepte; de vergelijking ontbreekt."));

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

  const excess = [...i.layersHigh, ...(i.lowSameAsHigh ? [] : i.layersLow)].some((l) => (l.excessTop ?? 0) !== 0 || (l.excessBottom ?? 0) !== 0);
  if (ulsScenario.high.waterNap !== ulsScenario.low.waterNap && !excess) warnings.push(t("warnings.water", "De waterdruk is aan beide zijden hydrostatisch gerekend. Stroomt er water onder de teen door of heeft een diepere laag een hogere stijghoogte, dan is de waterdruk aan de lage zijde hoger en de passieve weerstand lager: in een nagerekend openbaar geval gaf dat een 25 % groter moment. Voer in dat geval de wateroverspanning per laag in."));
  if ([...i.layersHigh, ...(i.lowSameAsHigh ? [] : i.layersLow)].every((l) => !(l.kh2 && l.kh3))) warnings.push(t("warnings.singleBranch", "Er is gerekend met één beddingsconstante per laag. Met de drietakkige veer van CUR 166 (kh1, kh2, kh3) worden de verplaatsingen groter en het moment enkele procenten groter."));
  if (i.construction === "posts") warnings.push(t("warnings.posts", "Palen met schotten: onder de schotten telt de passieve weerstand over {{f}} × de paalbreedte. Die factor voor ruimtelijke werking is invoer; controleer hem bij uw grond en paalafstand.", { f: n(i.posts.spatialFactor, 1) }));
  if (!section.profile && i.material === "timber") warnings.push(t("warnings.timber", "Hout: de verplaatsing is gerekend met E_0;mean zonder kruip (k_def); bij blijvende belasting in natte toepassing wordt de verplaatsing groter."));
  // Ankerstaaf en gording per steunpunt; vervormingseis en verticaal evenwicht als ze aan staan.
  for (const a of all) checks.push(...supportChecks(a, uls, all.length > 1 ? ` (${a.id})` : ""));
  const extra = { ...DEFAULT_EXTRA_CHECKS, ...i.extraChecks };
  const serviceability = cases.filter((c) => c.serviceability);
  if (extra.deformation.enabled) checks.push(deformationCheck(i, phases, sls, extra.deformation));
  if (extra.vertical.enabled) {
    const v = verticalCheck(i, section, serviceability, extra.vertical);
    if (typeof v === "string") warnings.push(v); else checks.push(v);
  }
  const governing = checks.reduce((a, b) => (b.uc > a.uc ? b : a));
  return { ok: true, grout, section, eiKnM2: ei, lengthM: length, sls, uls, cases, phases, coefficients: coefficientRows, levels, blum: blumOut, checks, governing, passes: checks.every((c) => c.passes), warnings,
    corrosion: corroded ? { zones, reducedStiffness: co.reducedStiffness, eiOriginalKnM2: section.eiKnM2 * i.eiFactor! } : null };
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
