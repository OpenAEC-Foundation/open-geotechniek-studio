// apps/desktop/src/calc/modules/pile-bearing-capacity/types.ts

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

export interface PileInput {
  /** Ontbrekend: behoud het bestaande projectmodel. */
  standard?: "nen-6743-1991" | "nen-6743-2006" | "nen-9997-2012" | "nen-9997-2017";
  cptId: string | null;        // referentie naar CPT in project
  pileTypeId: string;          // "steel-pipe-driven-closed"
  diameterMm: number;          // 219
  wallThicknessMm: number;     // 8.0 — voor EA
  /** Ontbrekend betekent dezelfde maat als de schacht (bestaande projecten). */
  baseDiameterMm?: number;
  /** Hout: lineair verloop vanaf kopdiameter over lengthM, daarna constante puntdiameter. */
  timberTaper?: { toeDiameterMm: number; lengthM: number };
  /** Projectspecifieke axiale stijfheid EA, in kN. */
  axialStiffnessKn?: number;
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
}

export interface ShaftFrictionResult {
  perLayer: Array<{ layer: SoilLayer; qcGemMpa: number; qsMpa: number; rsLayer: number }>;
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

export interface PileResult {
  ok: boolean;
  error?: string;              // human-readable fout, b.v. "Sondering te ondiep"
  warnings: string[];          // niet-kritieke meldingen
  negKleef: NegKleefResult;
  base: BaseResistanceResult;
  shaft: ShaftFrictionResult;
  settlement: SettlementResult;
  spring: SpringStiffnessResult;
  summary: SummaryResult;
}
