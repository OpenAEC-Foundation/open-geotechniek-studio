// Trekweerstand van een funderingspaal volgens NEN 9997-1 art. 7.6.3.
//
// De rekenkern werkt op een lijst grondlagen met per laag een conusweerstand.
// `layersFromCpt` maakt die lijst uit een sondering; de controleberekeningen
// in compute.test.ts geven de lagen rechtstreeks op.
//
//   R_t;d = min(R_t;wrijving;d, R_t;kluit;d) + G'_paal;d
//   q_s;z;d = f1 · f2 · αt · q_c;z;d        q_c;z;d = q_c;z;a / (ξ · γ_m;var;qc · γ_s;t)
//
// Uitgangspunten staan in VERIFICATIE.md naast dit bestand.
import type { Cpt } from "../../../types/cpt";
import { analyzeLayers } from "../../../utils/layerAnalysis";
import { QcProfile } from "../pile-bearing-capacity/parts/qc-profile";
import { getTensionPileType, type TensionPileType } from "./catalog";

export type TensionSoil = "sand" | "clay" | "loam" | "peat";

/** Eén grondlaag voor de rekenkern. Niveaus in m NAP, gewichten in kN/m³, qc in MPa. */
export interface TensionLayer {
  topNap: number;
  bottomNap: number;
  soil: TensionSoil;
  /** Volumegewicht boven de grondwaterstand. */
  gamma: number;
  /** Verzadigd volumegewicht. */
  gammaSat: number;
  /** Hoek van inwendige wrijving φ' in graden (voor de kluit bij niet-verdringende palen). */
  phi: number;
  qcMpa: number;
  /** Opgegeven rekenwaarde q_c;z;d in kPa: slaat reductie, afsnuiten en de factoren over. */
  qcDesignKpa?: number;
}

export interface SoilDefaults { gamma: number; gammaSat: number; phi: number }
export const SOIL_DEFAULTS: Record<TensionSoil, SoilDefaults> = {
  sand: { gamma: 18, gammaSat: 20, phi: 32.5 },
  clay: { gamma: 16, gammaSat: 16, phi: 20 },
  loam: { gamma: 19, gammaSat: 20, phi: 27.5 },
  peat: { gamma: 11, gammaSat: 11, phi: 15 },
};
export const SOIL_LABELS: Record<TensionSoil, string> = { sand: "Zand", clay: "Klei", loam: "Leem", peat: "Veen" };

export interface TensionGroup {
  /** Hart-op-hartafstanden van het palenstramien [m]. */
  spacingXM: number;
  spacingYM: number;
  /** Eigen invloedsoppervlak per paal [m²]; ontbrekend = stramien min paaldoorsnede. */
  areaM2?: number;
  /** Rand- of hoekpaal: kleinere tophoek van de kluitkegel. */
  edge?: boolean;
  /** Verdichtingsfactor f1; groter dan 1 alleen met controlesonderingen achteraf. */
  f1?: number;
}

export interface TensionTableConfig {
  cptIds: string[];
  toeNaps: number[];
  sizesMm: number[];
  /** Volledig uitgewerkt in de uitdraai. */
  examples?: Array<{ cptId: string; sizeMm: number; toeNap: number }>;
}

export interface TensionInput {
  cptId: string | null;
  pileTypeId: string;
  /** Diameter (rond) of zijde (vierkant) [mm]. */
  sizeMm: number;
  pileTopNap: number;
  pileToeNap: number;
  waterNap: number;
  /** Ontgravingsniveau [m NAP]; ontbrekend of op maaiveld = geen ontgraving. */
  excavationNap?: number;
  /** "sqrt": geïnstalleerd vóór ontgraven of trillingsarm; "linear": geheid na ontgraven; "none": sondering na ontgraven. */
  excavationReduction: "none" | "sqrt" | "linear";
  /** Overconsolidatiegraad van het zand; 1 = normaal geconsolideerd. */
  ocr?: number;
  /** Bovenkant van de trekzone [m NAP]; ontbrekend = 1 m onder maaiveld of ontgraving. */
  tensionTopNap?: number;
  /** Representatieve trekbelasting, trek positief [kN]. */
  ftMaxRepKn: number;
  /** Kleinste representatieve belasting; druk negatief [kN]. */
  ftMinRepKn: number;
  /** Rekenwaarde van de trekbelasting [kN]. */
  ftDKn: number;
  /** Aantal sonderingen voor ξ en de stijfheid van het bouwwerk. */
  cptCount: number;
  stiffStructure: boolean;
  /** Klei en leem tellen mee in de trekweerstand. */
  includeCohesive: boolean;
  /** Halve αt in klei en leem: de paal ontleent zijn weerstand vooral aan zand. */
  halveCohesive: boolean;
  /** Eigen gewichten per grondsoort; ontbrekend = SOIL_DEFAULTS. */
  soil?: Partial<Record<TensionSoil, Partial<SoilDefaults>>>;
  /** Paal in een groep; ontbrekend = alleenstaande paal (f1 = f2 = 1, geen kluittoets). */
  group?: TensionGroup;
  table?: TensionTableConfig;
}

/** Factoren die de controleberekeningen afwijkend kunnen zetten. */
export interface TensionFactors {
  xi: number;
  gammaVar: number;
  gammaSt: number;
  /** Partiële factor op het volumegewicht van grond en paal. */
  gammaGamma: number;
  gammaWater: number;
}

export interface TensionLayerResult {
  topNap: number;
  bottomNap: number;
  thicknessM: number;
  soil: TensionSoil;
  inTensionZone: boolean;
  qcMpa: number;
  /** Na ontgraving en overconsolidatie. */
  qcReducedMpa: number;
  /** Na afsnuiten op 12 of 15 MPa. */
  qcAppliedMpa: number;
  qcDesignKpa: number;
  alphaT: number;
  /** Rekenwaarde van de verticale korrelspanning aan de bovenkant, na ontgraven [kPa]. */
  sigmaTopDesignKpa: number;
  f2: number;
  /** Bijdrage aan de trekweerstand van de alleenstaande paal [kN]. */
  rSingleKn: number;
  /** Bijdrage in de groep (met f1 en f2) [kN]. */
  rGroupKn: number;
}

export interface TensionOk {
  ok: true;
  pileType: TensionPileType;
  factors: TensionFactors;
  perimeterM: number;
  pileAreaM2: number;
  equivalentDiameterM: number;
  tensionTopNap: number;
  layers: TensionLayerResult[];
  /** Som zonder groepswerking [kN]. */
  rSingleKn: number;
  /** Maatgevende wrijvingsweerstand: de groepswaarde als er een groep is [kN]. */
  rFrictionKn: number;
  group: null | { areaM2: number; coneHeightM: number; halfAngleDeg: number; rKluitKn: number; f1: number };
  gPileKn: number;
  /** min(wrijving, kluit) + paalgewicht [kN]. */
  rtDKn: number;
  governing: "friction" | "kluit";
  unityCheck: number | null;
  passes: boolean;
  warnings: string[];
}
export type TensionResult = TensionOk | { ok: false; error: string };

/** Tabel A.10a/A.10b (NEN 9997-1): ξ3 op het gemiddelde, ξ4 op het minimum. */
const XI_N = [1, 2, 3, 4, 5, 7, 10];
const XI = {
  soft: { xi3: [1.39, 1.32, 1.30, 1.28, 1.28, 1.27, 1.25], xi4: [1.39, 1.32, 1.30, 1.03, 1.03, 1.01, 1.00] },
  stiff: { xi3: [1.26, 1.20, 1.18, 1.17, 1.17, 1.15, 1.14], xi4: [1.26, 0.96, 0.94, 0.93, 0.93, 0.92, 0.91] },
};
/** ξ voor n sonderingen; tussen de tabelwaarden geldt de waarde van het kleinere aantal. */
export function correlationFactors(count: number, stiff: boolean): { xi3: number; xi4: number } {
  const n = Math.max(1, Math.floor(count));
  let k = 0;
  for (let i = 0; i < XI_N.length; i++) if (XI_N[i] <= n) k = i;
  const row = stiff ? XI.stiff : XI.soft;
  return { xi3: row.xi3[k], xi4: row.xi4[k] };
}

/** γ_m;var;qc = 1 + 0,25 · (F_max − F_min) / F_max, tussen 1,0 en 1,5. Druk is negatief. */
export function variableLoadFactor(ftMaxRepKn: number, ftMinRepKn: number): number {
  if (!(ftMaxRepKn > 0)) return 1;
  return Math.max(1, Math.min(1.5, 1 + 0.25 * (ftMaxRepKn - Math.min(ftMinRepKn, ftMaxRepKn)) / ftMaxRepKn));
}

/** αt in klei (tabel 7.d): 0,02 onder 2 MPa, 0,03 vanaf 2,5 MPa, daartussen lineair. */
export function clayAlphaT(qcMpa: number): number {
  if (qcMpa >= 2.5) return 0.03;
  if (qcMpa < 2) return 0.02;
  return 0.02 * (qcMpa - 1);
}

export const GAMMA_ST = 1.35;
const QC_PEAK_CAP = 12, QC_LAYER_CAP = 15, THICK_LAYER_M = 1;
const E_MAX = 0.8, E_MIN = 0.4;

/** Afsnuiten: een piek boven 12 MPa naar 12 MPa; is het pakket boven 12 MPa dikker dan 1 m, dan naar 15 MPa. */
export function capQc(values: number[], thickness: number[], peakCap = QC_PEAK_CAP): number[] {
  const out = values.slice();
  for (let i = 0; i < values.length;) {
    if (!(values[i] > QC_PEAK_CAP)) { i++; continue; }
    let j = i, run = 0;
    while (j < values.length && values[j] > QC_PEAK_CAP) run += thickness[j++];
    const cap = run > THICK_LAYER_M - 1e-9 ? QC_LAYER_CAP : peakCap;
    for (let k = i; k < j; k++) out[k] = Math.min(values[k], cap);
    i = j;
  }
  return out;
}

/** f1 uit de verdichting door n omringende palen op hart-op-hartafstand `spacingM` (CUR 2001-4). */
export function compactionFactor(qcKpa: number, sigmaV0Kpa: number, spacingM: number, equivalentDiameterM: number, neighbours: number): number {
  const r = spacingM / equivalentDiameterM;
  if (!(r < 6) || !(qcKpa > 0) || !(sigmaV0Kpa > 0)) return 1;
  const re = Math.max(0, Math.min(1, 0.34 * Math.log(qcKpa / (61 * sigmaV0Kpa ** 0.71))));
  const e0 = E_MAX - re * (E_MAX - E_MIN);
  const deltaE = neighbours * ((6 - r) / 5.5) * ((1 + e0) / 50);
  return Math.exp(3 * deltaE / (E_MAX - E_MIN));
}

export interface CoreOptions {
  pileType: TensionPileType;
  sizeMm: number;
  pileTopNap: number;
  pileToeNap: number;
  waterNap: number;
  /** Maaiveld vóór ontgraven; standaard de bovenkant van de eerste laag. */
  groundNap?: number;
  excavationNap?: number;
  excavationReduction?: "none" | "sqrt" | "linear";
  ocr?: number;
  tensionTopNap?: number;
  includeCohesive?: boolean;
  halveCohesive?: boolean;
  /** Grens voor een piek dunner dan 1 m; standaard 12 MPa. */
  qcPeakCapMpa?: number;
  /** Vaste αt voor klei en leem in plaats van tabel 7.d. */
  cohesiveAlphaT?: number;
  group?: TensionGroup;
  factors: TensionFactors;
  ftDKn?: number;
}

/** Splits lagen op de gegeven niveaus en in stukken van hoogstens `maxM`. */
export function splitLayers(layers: TensionLayer[], levels: number[], maxM = Infinity): TensionLayer[] {
  const out: TensionLayer[] = [];
  for (const l of layers) {
    const cuts = [l.topNap, ...levels.filter((v) => v < l.topNap - 1e-9 && v > l.bottomNap + 1e-9).sort((a, b) => b - a), l.bottomNap];
    for (let i = 1; i < cuts.length; i++) {
      const top = cuts[i - 1], bottom = cuts[i], n = Math.max(1, Math.ceil((top - bottom) / maxM - 1e-9));
      for (let k = 0; k < n; k++) out.push({ ...l, topNap: top - (top - bottom) * k / n, bottomNap: top - (top - bottom) * (k + 1) / n });
    }
  }
  return out;
}

function pileSection(type: TensionPileType, sizeMm: number) {
  const d = sizeMm / 1000;
  const area = type.isCircular ? Math.PI / 4 * d * d : d * d;
  return { perimeterM: (type.isCircular ? Math.PI : 4) * d, areaM2: area, equivalentDiameterM: Math.sqrt(4 * area / Math.PI) };
}

/** Rekenkern: trekweerstand uit een lagenlijst. De lagen lopen van maaiveld (vóór ontgraven) omlaag. */
export function computeTensionCore(input: TensionLayer[], o: CoreOptions): TensionResult {
  const f = o.factors, type = o.pileType;
  if (!input.length) return { ok: false, error: "Geen grondlagen opgegeven." };
  if (!(o.sizeMm > 0)) return { ok: false, error: "De paalmaat moet groter dan nul zijn." };
  if (!(o.pileTopNap > o.pileToeNap)) return { ok: false, error: "De paalpunt moet onder de paalkop liggen." };
  const groundNap = o.groundNap ?? input[0].topNap;
  const excavationNap = Math.min(o.excavationNap ?? groundNap, groundNap);
  const bottomNap = input[input.length - 1].bottomNap;
  if (o.pileToeNap < bottomNap - 1e-6) return { ok: false, error: "De paalpunt ligt onder het bereik van de grondopbouw of de sondering." };
  const tensionTopNap = Math.min(o.tensionTopNap ?? excavationNap - 1, o.pileTopNap);
  if (!(tensionTopNap > o.pileToeNap)) return { ok: false, error: "De bovenkant van de trekzone ligt onder de paalpunt." };

  const { perimeterM, areaM2, equivalentDiameterM } = pileSection(type, o.sizeMm);
  const layers = splitLayers(input.filter((l) => l.topNap > o.pileToeNap + 1e-9), [o.waterNap, excavationNap, tensionTopNap, o.pileToeNap, o.pileTopNap], 1)
    .filter((l) => l.bottomNap >= o.pileToeNap - 1e-9);
  const wet = (l: TensionLayer) => (l.topNap + l.bottomNap) / 2 < o.waterNap;
  const weight = (l: TensionLayer, design: boolean) => Math.max(0, (wet(l) ? l.gammaSat : l.gamma) / (design ? f.gammaGamma : 1) - (wet(l) ? f.gammaWater : 0));
  const sand = (l: TensionLayer) => l.soil === "sand";

  // Korrelspanningen: representatief vóór en na ontgraven (voor de reductie), rekenwaarde na ontgraven (voor f2).
  let s0 = 0, sExc = 0, sDesign = 0;
  const stress = layers.map((l) => {
    const d = l.topNap - l.bottomNap, below = l.topNap <= excavationNap + 1e-9;
    const row = { mid0: s0 + weight(l, false) * d / 2, midExc: sExc + (below ? weight(l, false) * d / 2 : 0), topDesign: sDesign };
    s0 += weight(l, false) * d;
    if (below) { sExc += weight(l, false) * d; sDesign += weight(l, true) * d; }
    return row;
  });

  const excavated = excavationNap < groundNap - 1e-9 && (o.excavationReduction ?? "none") !== "none";
  const reduced = layers.map((l, i) => {
    if (!sand(l) || l.qcDesignKpa !== undefined) return l.qcMpa;
    let qc = l.qcMpa;
    if (excavated && stress[i].mid0 > 0) {
      const ratio = Math.min(1, stress[i].midExc / stress[i].mid0);
      qc *= o.excavationReduction === "linear" ? ratio : Math.sqrt(ratio);
    }
    if (o.ocr && o.ocr > 1) qc *= Math.sqrt(1 / o.ocr);
    return qc;
  });
  const applied = capQc(reduced, layers.map((l) => l.topNap - l.bottomNap), o.qcPeakCapMpa);

  const groupArea = o.group ? (o.group.areaM2 ?? o.group.spacingXM * o.group.spacingYM - areaM2) : 0;
  if (o.group && !(groupArea > 0)) return { ok: false, error: "Het invloedsoppervlak per paal moet groter dan nul zijn." };
  const f1 = o.group ? Math.max(1, o.group.f1 ?? 1) : 1;
  const divisor = f.xi * f.gammaVar * f.gammaSt;

  let pulled = 0, rSingle = 0, rGroup = 0;
  const rows: TensionLayerResult[] = layers.map((l, i) => {
    const d = l.topNap - l.bottomNap;
    const inZone = l.topNap <= tensionTopNap + 1e-9 && l.topNap <= o.pileTopNap + 1e-9 && l.topNap <= excavationNap + 1e-9;
    const cohesive = l.soil === "clay" || l.soil === "loam";
    const alphaT = !inZone ? 0
      : sand(l) ? type.alphaT
      : cohesive && (o.includeCohesive ?? true) ? (o.cohesiveAlphaT ?? (l.soil === "loam" ? 0.025 : clayAlphaT(l.qcMpa))) * (o.halveCohesive ? 0.5 : 1)
      : 0;
    const qcDesignKpa = l.qcDesignKpa ?? applied[i] * 1000 / divisor;
    const single = perimeterM * alphaT * qcDesignKpa * d;
    let f2 = 1, group = single;
    if (o.group && alphaT > 0 && sand(l)) {
      const m = f1 * perimeterM * alphaT * qcDesignKpa * d / groupArea;
      const a = 2 * stress[i].topDesign + weight(l, true) * d;
      f2 = a > 0 ? Math.max(0, Math.min(1, (-m + Math.sqrt(Math.max(0, m * m + a * (a - 2 * pulled)))) / a)) : 0;
      pulled += m * f2;
      group = m * f2 * groupArea;
    }
    rSingle += single;
    rGroup += group;
    return {
      topNap: l.topNap, bottomNap: l.bottomNap, thicknessM: d, soil: l.soil, inTensionZone: inZone,
      qcMpa: l.qcMpa, qcReducedMpa: reduced[i], qcAppliedMpa: applied[i], qcDesignKpa, alphaT,
      sigmaTopDesignKpa: stress[i].topDesign, f2, rSingleKn: single, rGroupKn: group,
    };
  });

  // Kluit: cilinder op het invloedsoppervlak met aan de paalpunt een kegel, punt omlaag.
  let group: TensionOk["group"] = null;
  if (o.group) {
    const inPile = layers.filter((l) => l.topNap <= Math.min(excavationNap, o.pileTopNap) + 1e-9);
    const meanPhi = inPile.reduce((s, l) => s + l.phi * (l.topNap - l.bottomNap), 0) / Math.max(1e-9, inPile.reduce((s, l) => s + l.topNap - l.bottomNap, 0));
    const halfAngleDeg = type.displacement === "full" ? (o.group.edge ? 30 : 45) : (o.group.edge ? 0.5 : 2 / 3) * meanPhi;
    const height = Math.min(excavationNap, o.pileTopNap) - o.pileToeNap;
    const cone = Math.min(height, 0.5 * Math.sqrt(4 * groupArea / Math.PI) / Math.tan(halfAngleDeg * Math.PI / 180));
    let rKluit = 0;
    for (const l of inPile) {
      // Hoogte boven de paalpunt; binnen de kegel groeit het oppervlak met (h/x)².
      const h1 = l.bottomNap - o.pileToeNap, h2 = l.topNap - o.pileToeNap;
      const coneVolume = groupArea * (Math.min(h2, cone) ** 3 - Math.min(h1, cone) ** 3) / (3 * cone * cone);
      const cylinderVolume = groupArea * Math.max(0, h2 - Math.max(h1, cone));
      rKluit += (coneVolume + cylinderVolume) * weight(l, true);
    }
    group = { areaM2: groupArea, coneHeightM: cone, halfAngleDeg, rKluitKn: rKluit, f1 };
  }

  // Paalgewicht telt alleen mee bij grondverdringende palen.
  let gPile = 0;
  if (type.displacement === "full" && type.pileWeightKnM3 > 0) {
    for (const part of splitLayers([{ ...input[0], topNap: o.pileTopNap, bottomNap: o.pileToeNap }], [o.waterNap])) {
      const under = (part.topNap + part.bottomNap) / 2 < o.waterNap;
      gPile += areaM2 * (part.topNap - part.bottomNap) * Math.max(0, type.pileWeightKnM3 / f.gammaGamma - (under ? f.gammaWater : 0));
    }
  }

  const rFriction = o.group ? rGroup : rSingle;
  const governing = group && group.rKluitKn < rFriction ? "kluit" : "friction";
  const rtD = Math.min(rFriction, group?.rKluitKn ?? Infinity) + gPile;
  const ftD = o.ftDKn ?? 0;
  const lengthM = o.pileTopNap - o.pileToeNap;
  const warnings: string[] = [];
  if (lengthM < 7 || lengthM > 50) warnings.push(`Paallengte ${lengthM.toFixed(1)} m ligt buiten het toepassingsgebied van 7 tot 50 m.`);
  if (lengthM / equivalentDiameterM < 13.5) warnings.push(`De slankheid L/Deq = ${(lengthM / equivalentDiameterM).toFixed(1)} is kleiner dan 13,5.`);
  if (tensionTopNap > excavationNap - 1 + 1e-6) warnings.push("De trekzone begint hoger dan 1 m onder maaiveld of ontgravingsniveau; de bovenste meter geldt als geroerd.");
  if (rows.every((r) => r.rSingleKn === 0)) warnings.push("Geen laag in de trekzone levert schachtwrijving.");
  if (o.group && f1 > 1) warnings.push("f1 groter dan 1: de verdichting moet achteraf met controlesonderingen worden aangetoond.");
  if (type.note) warnings.push(type.note);
  return {
    ok: true, pileType: type, factors: f, perimeterM, pileAreaM2: areaM2, equivalentDiameterM, tensionTopNap,
    layers: rows, rSingleKn: rSingle, rFrictionKn: rFriction, group, gPileKn: gPile, rtDKn: rtD, governing,
    unityCheck: ftD > 0 && rtD > 0 ? ftD / rtD : null, passes: ftD <= rtD + 1e-9, warnings,
  };
}

/** Grondsoort per classificatiezone van de sondering. */
const ZONE_SOIL: Record<number, TensionSoil> = { 1: "clay", 2: "peat", 3: "clay", 4: "loam", 5: "sand", 6: "sand", 7: "sand", 8: "sand", 9: "clay" };

/** Grondlagen uit de laagindeling van de sondering, met de gemiddelde qc per stuk van hoogstens 0,5 m. */
export function layersFromCpt(cpt: Cpt, soil: TensionInput["soil"] = {}, splitAt: number[] = []): TensionLayer[] {
  const ground = cpt.metadata.ground_level_nap ?? 0;
  const profile = new QcProfile(cpt);
  const zones = analyzeLayers(cpt).layers;
  const base: TensionLayer[] = zones.map((z) => {
    const kind = ZONE_SOIL[z.zone_number] ?? "clay";
    return { topNap: ground - z.depth_top, bottomNap: ground - z.depth_bottom, soil: kind, ...SOIL_DEFAULTS[kind], ...soil?.[kind], qcMpa: 0 };
  }).filter((l) => l.topNap > l.bottomNap);
  // Sluit aan op maaiveld: het voorgeboorde deel krijgt de grondsoort van de eerste laag.
  if (base.length && base[0].topNap < ground - 1e-9) base.unshift({ ...base[0], topNap: ground, bottomNap: base[0].topNap });
  return splitLayers(base, splitAt, 0.5).map((l) => ({ ...l, qcMpa: profile.average(ground - l.topNap, ground - l.bottomNap) }));
}

export function tensionFactors(input: TensionInput, xi?: number): TensionFactors {
  return {
    xi: xi ?? correlationFactors(input.cptCount, input.stiffStructure).xi3,
    gammaVar: variableLoadFactor(input.ftMaxRepKn, input.ftMinRepKn),
    gammaSt: GAMMA_ST, gammaGamma: 1.1, gammaWater: 10,
  };
}

/** Trekweerstand op één sondering. `xi` overschrijft de correlatiefactor (voor de tabel met ξ3 en ξ4). */
export function computeTension(input: TensionInput, cpt: Cpt | null, xi?: number): TensionResult {
  const type = getTensionPileType(input.pileTypeId);
  if (!type) return { ok: false, error: "Onbekend paaltype." };
  if (!cpt) return { ok: false, error: "Kies een sondering." };
  if (!cpt.points.length) return { ok: false, error: "De sondering heeft geen meetpunten." };
  const ground = cpt.metadata.ground_level_nap ?? 0;
  const excavation = Math.min(input.excavationNap ?? ground, ground);
  const tensionTop = input.tensionTopNap ?? excavation - 1;
  let layers: TensionLayer[];
  try { layers = layersFromCpt(cpt, input.soil, [input.waterNap, excavation, tensionTop, input.pileToeNap, input.pileTopNap]); }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
  return computeTensionCore(layers, {
    pileType: type, sizeMm: input.sizeMm, pileTopNap: input.pileTopNap, pileToeNap: input.pileToeNap, waterNap: input.waterNap,
    groundNap: ground, excavationNap: excavation, excavationReduction: input.excavationReduction, ocr: input.ocr, tensionTopNap: tensionTop,
    includeCohesive: input.includeCohesive, halveCohesive: input.halveCohesive, group: input.group,
    factors: tensionFactors(input, xi), ftDKn: input.ftDKn,
  });
}
