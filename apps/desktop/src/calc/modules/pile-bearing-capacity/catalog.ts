// apps/desktop/src/calc/modules/pile-bearing-capacity/catalog.ts
import type { PileInput, PileTypeSpec, SoilKind, SoilLayer } from "./types";
import { applyStandard, HISTORICAL_TEXT, SOURCE_2025 } from "./standards";
import { ct } from "../../i18n";

const SOURCE_2017 = "NEN 9997-1:2016+C2:2017, tabel 7.c (zand/zand-grind)";
const NO_TABLE_ROW = "Geen rij in NEN 9997-1:2016+C2:2017, tabel 7.c";
const NO_ROW_CONDITIONS = "Geen eigen rij in tabel 7.c van de editie 2017: reken met de paalklassefactoren uit de zelfverklaring van het paalsysteem of uit een proefbelasting.";
const normativeType =(spec: PileTypeSpec): PileTypeSpec => ({
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
  // Tabel 7.c:2017, rij stalen paal, constante dwarsafmeting, open buis, geheid: αp 0,70, αs 0,006, αt 0,004, lastzakkingslijn 1.
  normativeType({ id: "steel-pipe-driven-open", name: "Stalen buispaal — open punt (tabel 2017)", alphaP: .7, alphaS: .006, alphaT: .004, beta: 1, s: 1, isCircular: true, material: "steel", openEnd: true, conditions: "Open buis zonder voetplaat. Punt: staalring, of met prop de staalring plus een door u onderbouwd deel van de binnendoorsnede (art. 7.6.2.3(d) en 7.6.2.1(13)). Schachtwrijving alleen aan de buitenzijde; de stijfheid EA rekent alleen met de staalring." }),
  normativeType({ id: "concrete-driven-casing-hammered", name: "Betonpaal — mantelbuis terugheiend getrokken", alphaP: .7, alphaS: .014, alphaT: .012, beta: 1, s: 1, isCircular: true, requiresEA: true, conditions: "Beton drukt direct tegen de grond; mantelbuis terugheiend en statisch getrokken." }),
  normativeType({ id: "concrete-driven-casing-vibrated", name: "Betonpaal — mantelbuis trillend getrokken", alphaP: .7, alphaS: .012, alphaT: .010, beta: 1, s: 1, isCircular: true, requiresEA: true, conditions: "Beton drukt direct tegen de grond; mantelbuis trillend en statisch getrokken." }),
  normativeType({ id: "concrete-screw-displacement", name: "Betonschroefpaal — verloren punt", alphaP: .63, alphaS: .009, alphaT: .009, beta: 1, s: 1, isCircular: true, requiresEA: true, conditions: "Gladde mantelbuis teruggetrokken; beton drukt direct tegen de grond." }),
  normativeType({ id: "steel-screw-grout", name: "Stalen schroefpaal — groutinjectie", alphaP: .63, alphaS: .009, alphaT: .009, beta: 1, s: 1, isCircular: true, material: "steel", requiresEA: true, conditions: "Groutschacht ≥ 300 mm; tijdens aanbrengen niet op en neer halen. EA betreft staal/kern, niet het grout-schachtoppervlak." }),
  normativeType({ id: "concrete-auger", name: "Avegaarpaal — beton", alphaP: .56, alphaS: .006, alphaT: .0045, beta: 1, s: 1, isCircular: true, requiresEA: true, settlementLine: 2, qcIIIStartCapMpa: 2, conditions: "Editie 2017: start qc;III begrensd op 2 MPa; geen vrijstelling op basis van nasonderingen toegepast." }),
  normativeType({ id: "concrete-bored", name: "Boorpaal — met steunvloeistof", alphaP: .35, alphaS: .006, alphaT: .0045, beta: 1, s: 1, isCircular: true, requiresEA: true, settlementLine: 3 }),
  normativeType({ id: "steel-screw-permanent-casing", name: "Schroefpaal — verloren punt, blijvende stalen buis", alphaP: .56, alphaS: .006, alphaT: .0045, beta: 1, s: 1, isCircular: true, material: "steel", conditions: "Tabelrij stalen paal, geschroefd, met constante dwarsafmeting boven de schroefpunt (zonder groutinjectie). De buismaat bepaalt de schachtomtrek; geef de schroefpunt op als puntafmeting. Betongevulde buis." }),
  // Geen eigen rij in tabel 7.c:2017: alleen te rekenen met projectfactoren (zelfverklaring of proefbelasting).
  normativeType({ id: "concrete-screw-soil-displacing", name: "Grondverdringende schroefpaal — in de grond gevormd", alphaP: 0, alphaS: 0, alphaT: 0, beta: 1, s: 1, isCircular: true, requiresEA: true, factorsMissing: true, source: NO_TABLE_ROW, conditions: NO_ROW_CONDITIONS }),
  normativeType({ id: "concrete-auger-cased", name: "DPA-paal — verbuisde avegaarpaal", alphaP: 0, alphaS: 0, alphaT: 0, beta: 1, s: 1, isCircular: true, requiresEA: true, factorsMissing: true, source: NO_TABLE_ROW, conditions: NO_ROW_CONDITIONS }),
  normativeType({ id: "timber-uniform", name: "Houten heipaal — rond, met of zonder betonopzetter", alphaP: .7, alphaS: .010, alphaT: .007, beta: 1, s: 1, isCircular: true, material: "wood", requiresEA: true, conditions: "Ronde houten doorsnede, constant of lineair taps vanaf de bovenkant van het hout; optioneel met betonopzetter tot de las. Geen verhoging van paalfactoren wegens coniciteit." }),
  // Gezaagd hout: dezelfde tabelrij als de ronde houten paal, met een vierkante of rechthoekige doorsnede a × b.
  normativeType({ id: "timber-square", name: "Houten heipaal — vierkant of rechthoekig, met of zonder betonopzetter", alphaP: .7, alphaS: .010, alphaT: .007, beta: 1, s: 1, isCircular: false, material: "wood", requiresEA: true, conditions: "Gezaagde houten doorsnede a × b, constant over de lengte; optioneel met betonopzetter tot de las. Paalklassefactoren als de ronde houten paal. De vormfactor s voor een rechthoekige paalvoet (a ≠ b) bepaalt het programma niet." }),
];

export function getPileType(id: string): PileTypeSpec | undefined {
  return PILE_TYPE_CATALOG.find((p) => p.id === id);
}

/* ------------------------------------------------------------------ */
/* Vertaling van catalogusteksten.                                     */
/* De catalogus houdt de Nederlandse brontekst (rapport, opslag); de   */
/* weergave vertaalt bij het tonen, zodat een taalwissel direct werkt. */
/* ------------------------------------------------------------------ */

let catalogKeys: Map<string, string> | undefined;
function catalogTextKeys(): Map<string, string> {
  if (catalogKeys) return catalogKeys;
  const keys = new Map<string, string>([[SOURCE_2017, "sources.table2017"], [SOURCE_2025, "sources.table2025"], [NO_TABLE_ROW, "sources.noTableRow2017"], [NO_ROW_CONDITIONS, "sources.noTableRowConditions"]]);
  for (const t of PILE_TYPE_CATALOG) {
    keys.set(t.name, `pileTypes.${t.id}.name`);
    // Bij historische normversies valt de editie-aanduiding uit de naam weg (zie applyStandard).
    const short = t.name.replace(" (tabel 2017)", "").replace(" (bestaand projectmodel)", "");
    if (short !== t.name) keys.set(short, `pileTypes.${t.id}.shortName`);
    if (t.conditions && !keys.has(t.conditions)) keys.set(t.conditions, `pileTypes.${t.id}.conditions`);
    if (t.source && !keys.has(t.source)) keys.set(t.source, `pileTypes.${t.id}.source`);
    if (t.edition && !/^\d{4}$/.test(t.edition)) keys.set(t.edition, `pileTypes.${t.id}.edition`);
  }
  for (const h of Object.values(HISTORICAL_TEXT)) keys.set(h.nl, h.key);
  return (catalogKeys = keys);
}

/**
 * Catalogustekst (naam, bron, editie, voorwaarden) in de actieve taal.
 * Onbekende tekst — b.v. een door de gebruiker ingevulde bron van
 * projectfactoren — komt ongewijzigd terug.
 */
export function catalogText(nl: string): string;
export function catalogText(nl: string | undefined): string | undefined;
export function catalogText(nl: string | undefined): string | undefined {
  if (nl === undefined) return undefined;
  const key = catalogTextKeys().get(nl);
  return key ? ct("calcPileCore", key, nl) : nl;
}

/** Naam van een paaltype in de actieve taal. */
export function pileTypeName(type: Pick<PileTypeSpec, "name">): string {
  return catalogText(type.name);
}

/** Projectfactoren zijn onderdeel van de opgeslagen invoer, nooit globale catalogusmutaties. */
export function resolvePileType(input: PileInput): PileTypeSpec | undefined {
  const catalogType = getPileType(input.pileTypeId);
  if (!catalogType) return undefined;
  const type = applyStandard(catalogType, input.standard);
  if (!type) return undefined;
  if (!input.projectFactors) return type;
  return { ...type, ...input.projectFactors, factorsMissing: false,
    // Zonder tabelregel is er geen lastzakkingslijn uit de tabel; projectfactoren zeggen daar niets over.
    settlementLineUnknown: !!type.factorsMissing,
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

/** Naam van een grondsoort in de actieve taal. */
export function soilLabel(kind: SoilKind): string {
  return ct("calcPileCore", `soil.${kind}`, SOIL_DEFAULTS[kind].label);
}

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
