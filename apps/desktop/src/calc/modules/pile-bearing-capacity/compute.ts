// apps/desktop/src/calc/modules/pile-bearing-capacity/compute.ts
import type { Cpt } from "../../../types/cpt";
import type { PileErrorCode, PileInput, PileResult } from "./types";
import { catalogText, resolvePileType } from "./catalog";
import { ct, fmtNumber } from "../../i18n";
import { computeNegKleef } from "./parts/negative-skin-friction";
import { computeBaseResistance } from "./parts/base-resistance";
import { computeShaftFriction } from "./parts/shaft-friction";
import { computeSettlement } from "./parts/settlement";
import { computeSpringStiffness } from "./parts/spring-stiffness";
import { computeSummary } from "./parts/summary";
import { pileGeometry, woodTopNap } from "./parts/geometry";
import { getStandard, usesHistoricalProcedure } from "./standards";

// E-moduli [N/mm²] voor de axiale paalstijfheid EA.
//  - Staal: 210 000 (EN 1993-1-1)
//  - Betonvulling stalen buispaal: 7 500 — lange-duur/gescheurde waarde
//    zoals in de externe referentie-berekening (EA_totaal = 1 356 065 kN
//    voor D219×8: 5303 mm² × 210 000 + 32 365 mm² × 7 500).
//  - Prefab voorgespannen beton: 36 000 (C45/55, korte-duur E_cm).
const E_STEEL = 210_000;
const E_CONCRETE_FILL = 7_500;
const E_CONCRETE_PREFAB = 36_000;

function computeEA_N(
  diameterMm: number,
  wallMm: number,
  material: "steel" | "concrete",
  isCircular: boolean,
): number {
  const D = diameterMm;
  if (material === "concrete") {
    // Massieve betonpaal — vierkant (a×a) of rond.
    const A_mm2 = isCircular ? (Math.PI / 4) * D * D : D * D;
    return E_CONCRETE_PREFAB * A_mm2;
  }
  // Stalen buis met gesloten punt — in den natte gevuld met beton:
  // EA = E_s·A_ring + E_b;vulling·A_kern.
  const innerD = Math.max(0, D - 2 * wallMm);
  const aRing_mm2 = (Math.PI / 4) * (D * D - innerD * innerD);
  const aCore_mm2 = (Math.PI / 4) * innerD * innerD;
  return E_STEEL * aRing_mm2 + E_CONCRETE_FILL * aCore_mm2;
}

/** Melding in de actieve taal (namespace calcPileCore). */
const msg = (key: string, nl: string, vars?: Record<string, unknown>) => ct("calcPileCore", key, nl, vars);

function emptyResult(error: string, errorCode?: PileErrorCode): PileResult {
  return {
    ok: false,
    error,
    ...(errorCode ? { errorCode } : {}),
    warnings: [],
    negKleef: { layers: [], fnkRep: 0, fnkD: 0, bottomNap: 0, deltaLnk: 0 },
    base: { deqMm: 0, qcIGemMpa: 0, qcIIGemMpa: 0, qcIIIGemMpa: 0, criticalDepthM: 0, qbMaxMpaRaw: 0, qbMaxMpa: 0, abMm2: 0, rbCalMax: 0 },
    shaft: { perLayer: [], rsCalMax: 0 },
    settlement: { sls: anyZero(), uls: anyZero(), curve: [] },
    spring: { kSlsKnPerM: 0, kUlsKnPerM: 0, kMinKnPerM: 0, kMaxKnPerM: 0 },
    summary: { xi3: 1.39, xi4: 1.39, rcCal: 0, rcK: 0, rcD: 0, rcNetD: 0, unityCheck: 0, passes: false },
  };
}
function anyZero() {
  return { fcTot: 0, sbMm: 0, rbMobil: 0, rsMobil: 0, fgem: 0, selMm: 0, s1Mm: 0 };
}

const napText = (v: number) => `NAP ${fmtNumber(v, 2)} m`;

/**
 * Rekent ook als de kleefniveaus buiten de paal liggen, bijvoorbeeld bij een
 * ondiepe paalpunt: die niveaus worden op de paal afgekapt, met een
 * waarschuwing. Zo kun je een paalpunt snel omhoog schuiven en direct het
 * resultaat zien, zonder eerst de kleefgrenzen te verleggen.
 */
export function computePile(input: PileInput, cpt: Cpt | null): PileResult {
  const top = input.pileTopNap, toe = input.pileToeNap;
  if ([top, toe, input.negKleefBottomNap].every(Number.isFinite) && top > toe) {
    const neg = Math.min(top, Math.max(toe, input.negKleefBottomNap));
    const posRaw = input.posKleefTopNap ?? input.negKleefBottomNap;
    const pos = Math.min(neg, Math.max(toe, posRaw));
    const notes: string[] = [];
    if (neg !== input.negKleefBottomNap) notes.push(msg("notes.negKleefClamped", "Onderkant negatieve kleef ({{given}}) ligt buiten de paal; gerekend met {{used}}.", { given: napText(input.negKleefBottomNap), used: napText(neg) }));
    if (input.posKleefTopNap !== undefined && Number.isFinite(input.posKleefTopNap) && pos !== input.posKleefTopNap) notes.push(msg("notes.posKleefClamped", "Bovenkant positieve kleef ({{given}}) ligt buiten het schachttraject; gerekend met {{used}}.", { given: napText(input.posKleefTopNap), used: napText(pos) }));
    if (notes.length) {
      const r = computePileChecked({ ...input, negKleefBottomNap: neg, posKleefTopNap: input.posKleefTopNap === undefined ? undefined : pos }, cpt);
      return { ...r, warnings: [...notes, ...r.warnings] };
    }
  }
  return computePileChecked(input, cpt);
}

function computePileChecked(input: PileInput, cpt: Cpt | null): PileResult {
  if (!cpt) return emptyResult(msg("errors.noCpt", "Geen actieve sondering"));
  if (!getStandard(input.standard)) return emptyResult(msg("errors.unknownStandard", "Onbekende normversie"));
  const historical = usesHistoricalProcedure(input.standard);
  const pileType = resolvePileType(input);
  if (!pileType) return emptyResult(msg("errors.pileTypeNotSupported", "Paaltype niet ondersteund voor deze normversie: {{id}}", { id: input.pileTypeId }));
  const taper = input.timberTaper;
  const ext = input.concreteExtension;
  if (ext && (pileType.material !== "wood" || ![ext.jointNap, ext.sizeMm].every(Number.isFinite) || ext.sizeMm <= 0 ||
      ext.jointNap >= input.pileTopNap || ext.jointNap <= input.pileToeNap || input.baseDiameterMm !== undefined)) {
    return emptyResult(msg("errors.extensionInvalid", "Een betonopzetter vereist een houten paal, een positieve opzettermaat en een las tussen paalkop en paalpunt, zonder losse voetmaat"));
  }
  if (taper && (pileType.material !== "wood" || ![taper.toeDiameterMm, taper.lengthM].every(Number.isFinite) ||
      taper.toeDiameterMm <= 0 || taper.toeDiameterMm > input.diameterMm || taper.lengthM <= 0 ||
      taper.lengthM > woodTopNap(input) - input.pileToeNap || input.baseDiameterMm !== undefined)) {
    return emptyResult(ext
      ? msg("errors.taperInvalidWithExtension", "Houttapsheid vereist een positieve puntdiameter ≤ houtdiameter bij de las en een tapse lengte binnen het houten deel onder de las")
      : msg("errors.taperInvalid", "Houttapsheid vereist een positieve puntdiameter ≤ kopdiameter en een tapse lengte binnen de paallengte, zonder losse voetmaat"));
  }
  const baseDiameterMm = taper?.toeDiameterMm ?? input.baseDiameterMm ?? input.diameterMm;
  if (!Number.isFinite(baseDiameterMm) || baseDiameterMm <= 0) return emptyResult(msg("errors.toeSizeInvalid", "Puntafmeting moet positief en eindig zijn"));
  if (pileType.id === "steel-pipe-driven-closed-2017" && baseDiameterMm - input.diameterMm > 20) return emptyResult(msg("errors.footPlateTooWide", "De voetplaat mag voor dit paaltype maximaal 10 mm per zijde uitsteken"));
  if (pileType.id === "steel-screw-grout" && input.diameterMm < 300) return emptyResult(msg("errors.groutScrewMinDiameter", "Deze groutschroefpreset vereist een schachtdiameter van ten minste 300 mm"));
  if (pileType.material === "wood" && !taper && baseDiameterMm !== input.diameterMm) return emptyResult(msg("errors.timberConstantSection", "Dit houten paaltype vereist een constante doorsnede zonder oplanger"));
  if (input.axialStiffnessKn !== undefined && (!Number.isFinite(input.axialStiffnessKn) || input.axialStiffnessKn <= 0)) return emptyResult(msg("errors.eaInvalid", "EA moet positief en eindig zijn"));
  if (pileType.requiresEA && !taper && !ext && input.axialStiffnessKn === undefined) return emptyResult(msg("errors.eaRequired", "Geef de projectspecifieke axiale stijfheid EA voor dit paaltype op"), "eaMissing");
  if (input.projectFactors) {
    const f = input.projectFactors;
    if (![f.alphaP, f.alphaS, f.alphaT, f.beta, f.s].every(Number.isFinite) ||
        f.alphaP <= 0 || f.alphaS < 0 || f.alphaT < 0 || f.beta <= 0 || f.beta > 1 || f.s <= 0 ||
        !f.source?.trim() || !(historical ? [getStandard(input.standard)!.edition] : ["2017", "2025"]).includes(f.edition)) {
      return emptyResult(msg("errors.projectFactorsInvalid", "Projectfactoren vereisen geldige waarden, een bron en een editie die bij de gekozen norm past"));
    }
  }

  const numericFields = [
    input.diameterMm, input.wallThicknessMm, input.pileTopNap, input.pileToeNap,
    input.waterNap, input.excavationNap, input.nEd, input.nEk, input.gammaM,
    input.gammaFnk, input.negKleefBottomNap, input.ksMinFactor,
    input.posKleefTopNap ?? input.negKleefBottomNap,
  ];
  if (!numericFields.every(Number.isFinite)) return emptyResult(msg("errors.nonFiniteInput", "Alle invoerwaarden moeten eindige getallen zijn"));
  if (input.diameterMm <= 0) return emptyResult(msg("errors.diameterNotPositive", "Diameter of zijlengte moet groter dan nul zijn"));
  if ((pileType.material ?? "steel") === "steel" && !pileType.requiresEA &&
      (input.wallThicknessMm <= 0 || 2 * input.wallThicknessMm >= input.diameterMm)) {
    return emptyResult(msg("errors.wallThicknessInvalid", "Wanddikte moet groter dan nul en kleiner dan de halve diameter zijn"));
  }
  if (input.pileToeNap >= input.pileTopNap) return emptyResult(msg("errors.toeAboveHead", "Paalpunt moet lager liggen dan de paalkop"));
  if (input.gammaM <= 0 || input.gammaFnk < 0 || input.ksMinFactor < 0) {
    return emptyResult(msg("errors.factorsInvalid", "γm moet groter dan nul zijn; γf,nk en K0·tan(δ) minimum mogen niet negatief zijn"));
  }
  if (input.nEd < 0 || input.nEk < 0) return emptyResult(msg("errors.negativeLoads", "Drukbelastingen mogen niet negatief zijn"));
  const posTop = input.posKleefTopNap ?? input.negKleefBottomNap;
  if (input.negKleefBottomNap < input.pileToeNap || input.negKleefBottomNap > input.pileTopNap ||
      posTop < input.pileToeNap || posTop > input.negKleefBottomNap) {
    return emptyResult(msg("errors.kleefLevels", "Kleefniveaus moeten tussen paalkop en paalpunt liggen; positieve kleef mag niet overlappen met negatieve kleef"), "kleefLevels");
  }
  for (const [index, layer] of input.soilProfile.entries()) {
    if (![layer.startNap, layer.endNap, layer.gammaK, layer.gammaW, layer.phi].every(Number.isFinite) ||
        layer.startNap <= layer.endNap || layer.gammaK <= 0 || layer.gammaW < 0 ||
        layer.gammaW > layer.gammaK || layer.phi < 0 || layer.phi >= 90) {
      return emptyResult(msg("errors.soilLayerInvalid", "Grondlagen vereisen geldige niveaus, volumegewichten en een wrijvingshoek tussen 0 en 90 graden"));
    }
    if (index > 0 && layer.startNap > input.soilProfile[index - 1].endNap + 1e-9) {
      return emptyResult(msg("errors.soilLayerOrder", "Grondlagen moeten van boven naar beneden lopen zonder overlap"));
    }
  }

  const groundNap = cpt.metadata.ground_level_nap ?? 0;
  const pileToeDepth = groundNap - input.pileToeNap;

  // Edge-case: sondering te ondiep
  const lastDepth = cpt.points[cpt.points.length - 1]?.depth ?? 0;
  const Deq = pileGeometry(baseDiameterMm, pileType.isCircular).equivalentDiameterMm / 1000;
  if (historical) {
    if (cpt.points.some((p, i) => !Number.isFinite(p.depth) || !Number.isFinite(p.qc) || p.qc! < 0 || (i > 0 && p.depth <= cpt.points[i - 1].depth))) {
      return emptyResult(msg("errors.historicalCptData", "Historische berekening vereist oplopende diepten met volledige, niet-negatieve qc-waarden"));
    }
    if (lastDepth < pileToeDepth + 4 * Deq || (cpt.points[0]?.depth ?? Infinity) > Math.max(0, pileToeDepth - 8 * Deq)) {
      return emptyResult(msg("errors.historicalCptRange", "Historische berekening vereist het volledige traject van 8 Deq boven tot 4 Deq onder de paalpunt"));
    }
    if (input.soilProfile.some(l => l.endNap < posTop && l.startNap > input.pileToeNap && l.kind !== "sand-dry" && l.kind !== "sand-wet")) {
      return emptyResult(msg("errors.historicalSandOnly", "Historische positieve schachtwrijving is alleen geverifieerd voor zand; pas het schachttraject en grondprofiel aan"));
    }
    if (!taper && baseDiameterMm !== input.diameterMm) return emptyResult(msg("errors.historicalConstantSection", "Historisch profiel ondersteunt alleen een constante paaldoorsnede of expliciete houttapsheid"));
  }
  if (lastDepth < pileToeDepth + 0.7 * Deq) {
    return emptyResult(
      msg("errors.cptTooShallow", "Sondering te ondiep (reikt tot {{reach}} m, vereist ≥ {{required}} m)", { reach: lastDepth.toFixed(1), required: (pileToeDepth + 0.7 * Deq).toFixed(1) }),
      "cptTooShort",
    );
  }

  const negKleef = computeNegKleef(input);
  const base = computeBaseResistance(cpt, {
    method: historical ? "minimum-qb" : "legacy-qci",
    pileToeDepth,
    diameterMm: baseDiameterMm,
    pileType,
  });
  // Positief schachtwrijvings-traject: van posKleefTopNap (boven, default
  // = negKleefBottomNap) tot pileToeNap (onder, ALTIJD paalpunt — geen
  // exclusion-zone bij paalpunt per gebruikers-wens). Engineer kan de
  // bovenkant onafhankelijk omlaag zetten als er een zwakke laag tussen
  // neg-kleef en pos-kleef zit.
  const posKleefTopNap = input.posKleefTopNap ?? input.negKleefBottomNap;
  const shaft = computeShaftFriction(cpt, {
    shaftGeometry: input,
    qcCapMpa: historical ? 12 : undefined,
    useSoilStressCap: !historical,
    pileType,
    diameterMm: input.diameterMm,
    negKleefBottomNap: posKleefTopNap, // = top van shaft-friction-zone
    pileToeNap: input.pileToeNap,
  }, input.soilProfile);

  const fcTotSls = input.nEk + negKleef.fnkD;
  const fcTotUls = input.nEd + negKleef.fnkD;
  const EA = input.axialStiffnessKn !== undefined ? input.axialStiffnessKn * 1000 : computeEA_N(
    input.diameterMm,
    input.wallThicknessMm,
    pileType.material === "concrete" ? "concrete" : "steel",
    pileType.isCircular,
  );
  const L = input.pileTopNap - input.pileToeNap;
  // ΔL = lengte van het positieve schachtwrijvings-traject; λ (ell) =
  // paaldeel ZONDER positieve wrijving (paalkop → bovenkant pos-kleef).
  // Conform art. 7.6.4.2: F_gem = (λ·F + ½·ΔL·(F − Rb)) / L. In de
  // referentie-uitwerking: λ = 9,34 m bij kleefniveau NAP −9,00 en
  // paalkop NAP +0,34 (NIET paalkop − ontgraving).
  const deltaL = posKleefTopNap - input.pileToeNap;
  const ell = input.pileTopNap - posKleefTopNap;

  const settlement = computeSettlement({
    fcTotSls,
    fcTotUls,
    rbCalMax: base.rbCalMax,
    rsCalMax: shaft.rsCalMax,
    deqMm: base.deqMm,
    EA_N: EA,
    ellM: ell,
    L_m: L,
    deltaL_m: deltaL,
  });

  // Taps hout en een betonopzetter geven elk een paal met wisselende EA; de
  // zakkingsformules gaan uit van één EA en zijn daarvoor niet geverifieerd.
  settlement.available = !taper && !ext && !historical && (pileType.settlementLine ?? 1) === 1;
  if (!settlement.available) {
    settlement.sls = anyZero();
    settlement.uls = anyZero();
    settlement.curve = [];
    if (taper || ext) settlement.eaKn = undefined;
  }
  const spring = settlement.available ? computeSpringStiffness(settlement) : { kSlsKnPerM: 0, kUlsKnPerM: 0, kMinKnPerM: 0, kMaxKnPerM: 0 };

  const summary = computeSummary({
    standard: input.standard,
    rbCalMax: base.rbCalMax,
    rsCalMax: shaft.rsCalMax,
    fnkD: negKleef.fnkD,
    nEd: input.nEd,
    gammaM: input.gammaM,
  });

  const warnings: string[] = [];
  warnings.push(msg("warnings.factors", "Factoren: {{edition}}; {{source}}.", {
    edition: catalogText(pileType.edition) ?? msg("warnings.existingModel", "bestaand model"),
    source: catalogText(pileType.source) ?? msg("warnings.existingCatalog", "bestaande catalogus"),
  }));
  if (pileType.conditions) warnings.push(catalogText(pileType.conditions));
  if (input.projectFactors?.edition === "2025") warnings.push(msg("warnings.projectFactors2025", "Projectfactoren 2025 toegepast; dit is geen volledige omzetting van de rekenmethode naar NEN 9997:2025."));
  if (!settlement.available) warnings.push(ext ? msg("warnings.settlementExtension", "Houten paal met betonopzetter: zakking en veerwaarden met verschillende EA voor beton en hout zijn niet geverifieerd en worden niet bepaald.") : taper ? msg("warnings.settlementTaper", "Tapse houten paal: zakking en veerwaarden met variabele EA zijn niet geverifieerd en worden niet bepaald.") : historical ? msg("warnings.settlementHistorical", "Historische zakking en veerwaarden zijn niet geverifieerd en worden niet bepaald.") : msg("warnings.settlementLineUnsupported", "Lastzakkingslijn {{line}} nog niet ondersteund: zakking en veerwaarden worden niet bepaald.", { line: pileType.settlementLine }));
  if (ext) warnings.push(msg("warnings.extension", "Betonopzetter {{size}} mm tot de las op NAP {{joint}} m: boven de las rekent de omtrek van de opzetter, eronder die van het hout; negatieve kleef met de gemiddelde omtrek over de kleefzone, positieve kleef per laag.", {
    size: `${ext.isCircular ? "Ø" : `${ext.sizeMm}×`}${ext.sizeMm}`, joint: ext.jointNap.toFixed(2),
  }));
  if (taper) warnings.push(ext
    ? msg("warnings.taperWithExtension", "Houttapsheid vanaf de las: positieve kleef met gemiddelde omtrek per laag. Geen verhoging van paalfactoren door coniciteit.")
    : msg("warnings.taper", "Houttapsheid: negatieve kleef met gemiddelde omtrek over de kleefzone; positieve kleef met gemiddelde omtrek per laag. Zonder betonoplanger of verhoging door coniciteit."));
  if (!taper && baseDiameterMm !== input.diameterMm) warnings.push(msg("warnings.deviatingToeSize", "Afwijkende puntmaat: controleer paalvoetvormfactor β en het toegestane schachtwrijvingstraject voor deze uitvoering."));
  if (base.qbMaxMpaRaw > 15) {
    warnings.push(msg("warnings.qbMaxCapped", "qb;max gecapt op 15 MPa (ruwe waarde {{raw}} MPa)", { raw: base.qbMaxMpaRaw.toFixed(2) }));
  }

  return {
    ok: true,
    warnings,
    negKleef,
    base,
    shaft,
    settlement,
    spring,
    summary,
  };
}
