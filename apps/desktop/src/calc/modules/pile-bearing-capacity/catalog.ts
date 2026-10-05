// apps/desktop/src/calc/modules/pile-bearing-capacity/catalog.ts
import type { PileInput, PileTypeSpec, SoilKind, SoilLayer } from "./types";
import { applyStandard } from "./standards";

const SOURCE_2017 = "NEN 9997-1:2016+C2:2017, tabel 7.c (zand/zand-grind)";
const normativeType = (spec: PileTypeSpec): PileTypeSpec => ({
  material: "concrete", settlementLine: 1,
  edition: "2017", source: SOURCE_2017, ...spec,
});

/** Bestaande projecttypen blijven ongewijzigd; nieuwe presets zijn expliciet gedateerd. */
export const PILE_TYPE_CATALOG: PileTypeSpec[] = [
  {
    id: "steel-pipe-driven-closed",
    name: "Stalen buispaal — geheid (bestaand projectmodel)",
    alphaP: 0.7,
    alphaS: 0.008,
    alphaT: 0.006,
    beta: 1.0,
    s: 1.0,
    isCircular: true,
    material: "steel",
    edition: "2017/2019 — bestaand projectmodel",
    source: "Bestaand rekenmodel en referentie-rapport 984.pdf",
    conditions: "Bestaande factorenset behouden; wijkt af van tabel 7.c:2017 voor gesloten stalen buispalen.",
  },
  {
    id: "concrete-prefab-prestressed-driven",
    name: "Prefab voorgespannen betonpaal — geheid",
    alphaP: 0.7,
    alphaS: 0.010,    // Tabel 7.c — voorgespannen geheide betonpaal
    alphaT: 0.007,
    beta: 1.0,        // s=β=1 voor zowel rond als vierkant met a=b
    s: 1.0,
    isCircular: false, // vierkante doorsnede — diameterMm = zijlengte a
    material: "concrete",
    edition: "2017", source: SOURCE_2017,
  },
  normativeType({ id: "concrete-prefab-round", name: "Prefab betonpaal — rond, geheid", alphaP: .7, alphaS: .010, alphaT: .007, beta: 1, s: 1, isCircular: true }),
  normativeType({ id: "steel-pipe-driven-closed-2017", name: "Stalen buispaal — gesloten punt (tabel 2017)", alphaP: .7, alphaS: .010, alphaT: .007, beta: 1, s: 1, isCircular: true, material: "steel", conditions: "Voetplaat steekt maximaal 10 mm buiten de buis uit; betongevulde buis." }),
  normativeType({ id: "concrete-driven-casing-hammered", name: "Betonpaal — mantelbuis terugheiend getrokken", alphaP: .7, alphaS: .014, alphaT: .012, beta: 1, s: 1, isCircular: true, requiresEA: true, conditions: "Beton drukt direct tegen de grond; mantelbuis terugheiend en statisch getrokken." }),
  normativeType({ id: "concrete-driven-casing-vibrated", name: "Betonpaal — mantelbuis trillend getrokken", alphaP: .7, alphaS: .012, alphaT: .010, beta: 1, s: 1, isCircular: true, requiresEA: true, conditions: "Beton drukt direct tegen de grond; mantelbuis trillend en statisch getrokken." }),
  normativeType({ id: "concrete-screw-displacement", name: "Betonschroefpaal — verloren punt", alphaP: .63, alphaS: .009, alphaT: .009, beta: 1, s: 1, isCircular: true, requiresEA: true, conditions: "Gladde mantelbuis teruggetrokken; beton drukt direct tegen de grond." }),
  normativeType({ id: "steel-screw-grout", name: "Stalen schroefpaal — groutinjectie", alphaP: .63, alphaS: .009, alphaT: .009, beta: 1, s: 1, isCircular: true, material: "steel", requiresEA: true, conditions: "Groutschacht ≥ 300 mm; tijdens aanbrengen niet op en neer halen. EA betreft staal/kern, niet het grout-schachtoppervlak." }),
  normativeType({ id: "concrete-auger", name: "Avegaarpaal — beton", alphaP: .56, alphaS: .006, alphaT: .0045, beta: 1, s: 1, isCircular: true, requiresEA: true, settlementLine: 2, qcIIIStartCapMpa: 2, conditions: "Editie 2017: start qc;III begrensd op 2 MPa; geen vrijstelling op basis van nasonderingen toegepast." }),
  normativeType({ id: "concrete-bored", name: "Boorpaal — met steunvloeistof", alphaP: .35, alphaS: .006, alphaT: .0045, beta: 1, s: 1, isCircular: true, requiresEA: true, settlementLine: 3 }),
  normativeType({ id: "timber-uniform", name: "Houten heipaal — constante doorsnede", alphaP: .7, alphaS: .010, alphaT: .007, beta: 1, s: 1, isCircular: true, material: "wood", requiresEA: true, conditions: "Constante ronde doorsnede; tapsheid en betonoplanger zijn niet in dit type opgenomen." }),
];

export function getPileType(id: string): PileTypeSpec | undefined {
  return PILE_TYPE_CATALOG.find((p) => p.id === id);
}

/** Projectfactoren zijn onderdeel van de opgeslagen invoer, nooit globale catalogusmutaties. */
export function resolvePileType(input: PileInput): PileTypeSpec | undefined {
  const catalogType = getPileType(input.pileTypeId);
  if (!catalogType) return undefined;
  const type = applyStandard(catalogType, input.standard);
  if (!type) return undefined;
  if (!input.projectFactors) return type;
  return { ...type, ...input.projectFactors,
    qcIIIStartCapMpa: input.projectFactors.edition === "2025" ? undefined : type.qcIIIStartCapMpa,
  };
}

/** Default Φ/γ per grondsoort. γ-waarden afgestemd op de grondsoorten-
 *  tabel van de externe referentie-berekening (NEN 9997-1 Tabel 2.b-
 *  range): zand verzadigd 20 kN/m³ (schoon, matig), zand droog 18,
 *  klei zwak zandig matig 18, veen 13. */
export const SOIL_DEFAULTS: Record<SoilKind, { gammaK: number; gammaW: number; phi: number; label: string }> = {
  "sand-dry": { gammaK: 18, gammaW: 0,  phi: 32.5, label: "Zand droog" },
  "sand-wet": { gammaK: 20, gammaW: 10, phi: 32.5, label: "Zand nat" },
  "clay":     { gammaK: 18, gammaW: 10, phi: 22.5, label: "Klei nat" },
  "peat":     { gammaK: 13, gammaW: 10, phi: 15.0, label: "Veen nat" },
};

/** qs;max per grondsoort in MPa — Tabel 7.d caps. */
export const QS_MAX_PER_SOIL: Record<SoilKind, number> = {
  "sand-dry": 0.15,
  "sand-wet": 0.15,
  "clay":     0.10,
  "peat":     0.02,
};

export function buildDefaultSoilLayers(
  pileTopNap: number,
  pileToeNap: number,
  waterNap: number,
): SoilLayer[] {
  // Conservatieve default: alles tussen paalkop en paalpunt als "klei nat".
  // SPLITS op het waterniveau zodat het effectieve gewicht klopt:
  //   - Boven GWS: gammaW = 0 (geen waterspanning-aftrek)
  //   - Onder GWS: gammaW = SOIL_DEFAULTS.clay.gammaW (=10) — effectief
  //     gewicht γ' = γ_k − γ_w wordt correct toegepast door computeNegKleef
  //     en computeShaftFriction.
  // Zonder deze split gaf de oude implementatie (gammaW = 0 als pileTop
  // > waterNap) voor een paal met paalkop boven water EN paalpunt onder
  // water een veel te grote overburden-stress → enorm overschatte Fnk.
  const clayDef = SOIL_DEFAULTS.clay;
  const layers: SoilLayer[] = [];
  if (waterNap > pileToeNap && waterNap < pileTopNap) {
    // Water doorkruist het profiel → twee lagen.
    layers.push({
      kind: "clay",
      startNap: pileTopNap,
      endNap: waterNap,
      gammaK: clayDef.gammaK,
      gammaW: 0,
      phi: clayDef.phi,
    });
    layers.push({
      kind: "clay",
      startNap: waterNap,
      endNap: pileToeNap,
      gammaK: clayDef.gammaK,
      gammaW: clayDef.gammaW,
      phi: clayDef.phi,
    });
  } else {
    // Volledig boven (paalpunt boven water) of volledig onder.
    const fullyDry = pileToeNap >= waterNap;
    layers.push({
      kind: "clay",
      startNap: pileTopNap,
      endNap: pileToeNap,
      gammaK: clayDef.gammaK,
      gammaW: fullyDry ? 0 : clayDef.gammaW,
      phi: clayDef.phi,
    });
  }
  return layers;
}
