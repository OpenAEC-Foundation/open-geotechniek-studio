// apps/desktop/src/calc/modules/pile-bearing-capacity/types.ts
import type { StrengthResult } from "./parts/strength-check";
import type { AppliedOverride as SharedAppliedOverride, InterpretationOverride as SharedInterpretationOverride } from "../../shared/interpretation/overrides";

/** Soil-type voor neg.kleef + schachtwrijving. */
export type SoilKind = "sand-dry" | "sand-wet" | "clay" | "peat";

export interface SoilLayer {
  kind: SoilKind;
  startNap: number;            // m NAP (top van laag)
  endNap: number;              // m NAP (onderkant van laag)
  /** Volumegewicht in kN/m³ (droog of nat afhankelijk van GWS). */
  gammaK: number;
  /** Waterdruk-aandeel; 0 voor lagen boven GWS, 10 voor verzadigd. */
  gammaW: number;
  /** Inwendige wrijvingshoek in graden. */
  phi: number;
}

export interface PileTypeSpec {
  id: string;                  // "steel-pipe-driven-closed"
  name: string;                // UI label
  alphaP: number;              // Tabel 7.c
  alphaS: number;
  alphaT: number;
  beta: number;                // 1.0 voor cilindrisch
  s: number;                   // 1.0 voor cilindrisch
  isCircular: boolean;         // false → vierkante doorsnede; diameterMm = zijlengte a
  /** Materiaal voor visualisatie + toekomstige EA-berekening.
   *  Defaults naar "steel" als afwezig (back-compat oude IFCX-files). */
  material?: "steel" | "concrete" | "wood";
  source?: string;
  edition?: string;
  conditions?: string;
  settlementLine?: 1 | 2 | 3;
  requiresEA?: boolean;
  qcIIIStartCapMpa?: number;
  /** De tabel van de gekozen editie heeft voor dit type geen (volledige)
   *  paalklassefactoren; rekenen kan dan alleen met projectfactoren. */
  factorsMissing?: boolean;
  /** Met projectfactoren op een type zonder tabelregel: lastzakkingslijn onbekend. */
  settlementLineUnknown?: boolean;
  /** Open buis (geen voetplaat): de puntweerstand hangt af van de grondprop, zie `PileInput.openTube`. */
  openEnd?: boolean;
}

/**
 * Open stalen buispaal: hoe de punt wordt gerekend.
 * - `plug: false` — zonder prop: puntweerstand alleen over de staalring, inwendige
 *   schachtwrijving niet meegenomen (ondergrens van NEN 9997-1 art. 7.6.2.3(d)).
 * - `plug: true` — met prop: puntweerstand over de staalring plus `plugFactor` maal de
 *   binnendoorsnede. De factor (0 < η ≤ 1) vult de gebruiker in en onderbouwt hem; zonder
 *   factor wordt er niet gerekend.
 */
export interface OpenTubeInput {
  plug: boolean;
  plugFactor?: number;
}

/** Betonopzetter op een houten paal: boven de las beton, eronder hout. */
export interface ConcreteExtension {
  /** Onderkant van de opzetter, de las tussen beton en hout [m NAP]. */
  jointNap: number;
  /** Zijde (vierkant) of diameter (rond) van de opzetter [mm]. */
  sizeMm: number;
  isCircular: boolean;
}

export interface ProjectPileFactors {
  alphaP: number;
  alphaS: number;
  alphaT: number;
  beta: number;
  s: number;
  source: string;
  edition: string;
}

export interface PilePresets {
  /** Maatreeks per paaltype [mm]. */
  sizesMm?: Record<string, number[]>;
  extensions?: Array<{ sizeMm: number; isCircular: boolean }>;
  extensionLengthsM?: number[];
  timberToeMm?: number;
  /** Gezaagde houten palen: doorsneden a × b [mm]. */
  rectSizesMm?: Array<[number, number]>;
}

/** Optionele toets van de paal als constructie-element op de axiale rekenbelasting. */
export interface StrengthCheckInput {
  enabled: boolean;
  /** Staalsoort van de buis, bv. "S355". Standaard S235. */
  steelGrade?: string;
  /** Sterkteklasse van het hout (NEN-EN 338), bv. "C18". */
  timberClass?: string;
  /** Eigen karakteristieke druksterkte evenwijdig aan de vezel [MPa]; gaat voor de klasse. */
  timberFc0kMpa?: number;
  /** Modificatiefactor; standaard 0,50 (klimaatklasse 3, blijvende belasting). */
  kMod?: number;
  /** Materiaalfactor hout; standaard 1,3. */
  gammaMTimber?: number;
  /** Betonsterkteklasse van paal of opzetter, bv. "C35/45". */
  concreteClass?: string;
}

/**
 * Aanpassing van de grondlaaginterpretatie voor één dieptetraject van één
 * sondering, met de grondsoorten van de paalberekening. De vorm is gedeeld
 * met de andere modules: zie calc/shared/interpretation/overrides.ts.
 */
export type InterpretationOverride = SharedInterpretationOverride<SoilKind>;

/** Een aanpassing zoals hij in de berekening is verwerkt, voor scherm en uitdraai. */
export type AppliedOverride = SharedAppliedOverride<SoilKind>;

export interface PileInput {
  /** Aanpassingen van de grondlaaginterpretatie, per sondering. Ontbrekend = gemeten interpretatie. */
  interpretationOverrides?: InterpretationOverride[];
  /** Gedeelde invoer met afzonderlijke resultaten per sondering en puntniveau. */
  /** Instellingen van deze berekening: eigen standaardreeksen. Ontbrekend = standaard. */
  presets?: PilePresets;
  capacityTable?: {
    cptIds:string[];toeNaps:number[];
    /** Paalmaten [mm] voor de tabel; ontbrekend = alleen diameterMm. */
    sizesMm?:number[];
    /** Gezocht netto draagvermogen Rc;net;d [kN]. */
    targetKn?:{minKn:number;maxKn:number};
    /** Draagvermogens [kN] voor het maatgevende overzicht; ontbrekend = alleen de ondergrens. */
    targetsKn?:number[];
    /** Andere paaltypes voor het maatgevende overzicht, elk met een eigen maatreeks [mm]. */
    extraTypes?:Array<{pileTypeId:string;sizesMm:number[]}>;
    /** Voorbeeldberekeningen die volledig in de uitdraai komen; daarna alleen de tabellen. */
    examples?:Array<{cptId:string;sizeMm:number;toeNap:number}>;
  };
  /** Ontbrekend: behoud het bestaande projectmodel. */
  standard?: "nen-6743-1991" | "nen-6743-2006" | "nen-9997-2012" | "nen-9997-2017" | "nen-9997-2025";
  cptId: string | null;        // referentie naar CPT in project
  pileTypeId: string;          // "steel-pipe-driven-closed"
  diameterMm: number;          // 219
  wallThicknessMm: number;     // 8.0 — voor EA
  /** Ontbrekend betekent dezelfde maat als de schacht (bestaande projecten). */
  baseDiameterMm?: number;
  /** Gezaagd hout: tweede zijde b [mm] van een rechthoekige doorsnede; diameterMm
   *  is dan zijde a. Ontbrekend = vierkant (b = a). */
  sideBMm?: number;
  /** Optionele sterktetoets van de paal; ontbrekend of uit = geen toets. */
  strengthCheck?: StrengthCheckInput;
  /** Hout: houtsoort en sorteerklasse (parts/timber-species.ts). Bepaalt alleen
   *  de sterkteklasse in de sterktetoets en de kleur in de tekening, niet de
   *  paalklassefactoren. Ontbrekend = eigen sterkteklasse. */
  timberSpecies?: { id: string; gradeId?: string };
  /** Omvang van rekenblad en uitdraai; ontbrekend = beknopt. */
  reportDetail?: "compact" | "full";
  /** Hout: lineair verloop vanaf de bovenkant van het hout (paalkop, of de
   *  las bij een betonopzetter) over lengthM, daarna constante puntdiameter. */
  timberTaper?: { toeDiameterMm: number; lengthM: number };
  /** Hout: betonopzetter van paalkop tot de las. Daaronder het hout, met
   *  diameterMm als houtdiameter bij de las. */
  concreteExtension?: ConcreteExtension;
  /** Projectspecifieke axiale stijfheid EA, in kN. */
  axialStiffnessKn?: number;
  /** Open stalen buispaal: met of zonder grondprop. Ontbrekend bij een open buis = zonder prop. */
  openTube?: OpenTubeInput;
  /** Eigen, conservatieve keuze: qc in traject I en II vóór de middeling op 15 MPa
   *  begrenzen. De norm begrenst alleen qb;max. Ontbrekend = uit. */
  capPointQc15?: boolean;
  projectFactors?: ProjectPileFactors;
  pileTopNap: number;          // 0.34
  pileToeNap: number;          // -14.50
  waterNap: number;            // -0.16
  excavationNap: number;       // 0.84
  nEd: number;                 // 324 kN
  nEk: number;                 // 303 kN
  gammaM: number;              // 1.20
  gammaFnk: number;            // 1.00
  negKleefBottomNap: number;   // -9.00
  /** Bovenkant van het POSITIEVE schachtwrijvings-traject [m NAP].
   *  Default = `negKleefBottomNap` (pos-kleef begint waar neg-kleef
   *  ophoudt). Engineer kan dit ONAFHANKELIJK omlaag zetten als er een
   *  zwakke laag in een tussenstuk zit waar geen wrijving werkt.
   *  De ONDERGRENS van pos-kleef is altijd paalpunt (`pileToeNap`).
   *  Optioneel veld voor IFCX-backward-compat. */
  posKleefTopNap?: number;
  soilProfile: SoilLayer[];    // user-editable
  ksMinFactor: number;         // 0.25 (Eurocode min-cap)
}

export interface NegKleefLayerResult {
  layer: SoilLayer;
  thickness: number;           // m
  sigmaRepTop: number;         // kPa cumulative at top
  sigmaRepBottom: number;      // kPa cumulative at bottom
  sigmaGemRep: number;         // kPa·m (× Δh)
  k0: number;
  delta: number;               // radians
  k0TanDelta: number;          // ≥ ksMinFactor
  /** Lengtegemiddelde schachtomtrek binnen deze laag [m]. Ontbreekt in oudere resultaten. */
  perimeterM?: number;
  fsNkRep: number;             // kN
}

export interface NegKleefResult {
  meanPerimeterM?: number;     // gemiddelde over het negatieve-kleeftraject
  layers: NegKleefLayerResult[];
  fnkRep: number;              // sum, kN
  fnkD: number;                // = γf,nk × fnkRep
  bottomNap: number;
  deltaLnk: number;            // paalkop tot bottomNap
}

export interface BaseResistanceResult {
  deqMm: number;
  qcIGemMpa: number;
  qcIIGemMpa: number;
  qcIIIGemMpa: number;
  criticalDepthM: number;      // 0,7..4 Deq onder paalpunt
  /** Bovengrens van traject III waarmee is gerekend [m onder maaiveld]: 8 Deq boven
   *  de paalpunt, begrensd op het maaiveld. Optioneel ivm eerdere PileResult-snapshots. */
  zoneIIITopDepthM?: number;
  qbMaxMpaRaw: number;         // voor cap
  qbMaxMpa: number;            // na cap op 15 MPa
  abMm2: number;
  rbCalMax: number;            // kN
  /** "Effectieve" qc-curve over de qc;II + qc;III invloed-zones na
   *  toepassing van de running-min "afkapregel" uit NEN 9997-1 NB:2019
   *  §7.6.2.3. Gesorteerd op stijgende depth (m onder maaiveld). Wordt
   *  door VisualPanel gerenderd als donkerblauwe lijn binnen de 8D-zone
   *  zodat zichtbaar is hoeveel qc er is "weggesnoept". Optioneel ivm
   *  back-compat met eerdere PileResult-snapshots. */
  clippedQcCurve?: Array<{ depth: number; qcClipped: number }>;
  /** Open buis: de oppervlakken achter abMm2 [mm²] en de gekozen rekenwijze. */
  openTube?: { plug: boolean; plugFactor?: number; ringMm2: number; innerMm2: number; fullMm2: number };
}

export interface ShaftFrictionResult {
  perLayer: Array<{ layer: SoilLayer; qcGemMpa: number; qsMpa: number; rsLayer: number; perimeterM?: number }>;
  rsCalMax: number;            // kN
}

export interface SettlementWorkpoint {
  fcTot: number;               // kN
  sbMm: number;                // paalpunt-zakking
  rbMobil: number;             // kN
  rsMobil: number;             // kN
  fgem: number;                // kN
  selMm: number;               // elastische verkorting
  s1Mm: number;                // totale paalkop-zakking
}

export interface SettlementResult {
  /** false: de vereiste lastzakkingslijn is nog niet ondersteund. */
  available?: boolean;
  sls: SettlementWorkpoint;
  uls: SettlementWorkpoint;
  curve: Array<{ sbMm: number; rbKn: number; rsKn: number; totalKn: number }>;
  /** Geometrie + stijfheid zoals gebruikt in de zakkingsberekening —
   *  nodig om de F_gem/s_el-formules in rapport en ResultPanel met
   *  ingevulde getallen te tonen. Optioneel ivm back-compat met oudere
   *  PileResult-snapshots in opgeslagen .ifcgeo-bestanden. */
  eaKn?: number;               // axiale stijfheid E·A [kN]
  lM?: number;                 // paallengte L [m]
  ellM?: number;               // λ — paalkop → bovenkant pos-kleef [m]
  deltaLM?: number;            // ΔL — pos. schachtwrijvings-traject [m]
}

export interface SpringStiffnessResult {
  kSlsKnPerM: number;
  kUlsKnPerM: number;
  kMinKnPerM: number;
  kMaxKnPerM: number;
}

export interface SummaryResult {
  /** Historische vermenigvuldigingsfactor; geen Eurocode-deler. */
  historicalXi?: number;
  xi3: number;
  xi4: number;
  rcCal: number;
  rcK: number;
  rcD: number;
  rcNetD: number;
  unityCheck: number;
  passes: boolean;
}

/** Taalonafhankelijke soort fout, voor de draagvermogentabel (de fouttekst zelf is vertaald). */
export type PileErrorCode = "cptTooShort" | "kleefLevels" | "eaMissing" | "factorsMissing";

export interface PileResult {
  ok: boolean;
  error?: string;              // human-readable fout, b.v. "Sondering te ondiep"
  errorCode?: PileErrorCode;
  warnings: string[];          // niet-kritieke meldingen
  /** Aanpassingen van de grondlaaginterpretatie voor de gebruikte sondering. Ontbreekt zonder aanpassingen. */
  interpretation?: AppliedOverride[];
  negKleef: NegKleefResult;
  base: BaseResistanceResult;
  shaft: ShaftFrictionResult;
  settlement: SettlementResult;
  spring: SpringStiffnessResult;
  summary: SummaryResult;
  /** Sterktetoets van de paal; alleen aanwezig als hij is aangevinkt. */
  strength?: StrengthResult;
}
