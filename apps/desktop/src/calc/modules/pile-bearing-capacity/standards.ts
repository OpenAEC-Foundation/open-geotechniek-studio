import type { PileInput, PileTypeSpec } from "./types";

export type PileStandard = NonNullable<PileInput["standard"]>;
export const PILE_STANDARDS = [
  { id: "nen-6743-1991", label: "NEN 6743:1991 — historisch referentieprofiel", edition: "1991", gammaM: 1.25, xi: .75 },
  { id: "nen-6743-2006", label: "NEN 6743-1:2006 — historisch", edition: "2006", gammaM: 1.2, xi: .72 },
  { id: "nen-9997-2012", label: "NEN 9997-1:2011 + C1:2012 — oorspronkelijke factoren", edition: "2012", gammaM: 1.2 },
  { id: "nen-9997-2017", label: "NEN 9997-1:2016 + C2:2017 — bestaand rekenmodel", edition: "2017", gammaM: 1.2 },
] as const;

export function getStandard(id: PileInput["standard"]) {
  return PILE_STANDARDS.find(s => s.id === (id ?? "nen-9997-2017"));
}

export function isHistorical(id: PileInput["standard"]) {
  return id === "nen-6743-1991" || id === "nen-6743-2006";
}

export function usesHistoricalProcedure(id: PileInput["standard"]) {
  return isHistorical(id) || id === "nen-9997-2012";
}

export function historicalXi(id: PileInput["standard"]): number | undefined {
  return id === "nen-6743-1991" ? .75 : id === "nen-6743-2006" ? .72 : undefined;
}

// αp/αs: NEN 6743-1:2006 tabel 2 en NEN 9997-1:2011+C1:2012 tabel 7.c.
const HISTORICAL_FACTORS: Record<string, readonly [number, number]> = {
  "concrete-prefab-prestressed-driven": [1, .010],
  "concrete-prefab-round": [1, .010],
  "steel-pipe-driven-closed": [1, .010],
  "steel-pipe-driven-closed-2017": [1, .010],
  "concrete-driven-casing-hammered": [1, .014],
  "concrete-driven-casing-vibrated": [1, .012],
  "concrete-screw-displacement": [.9, .009],
  "steel-screw-grout": [.9, .009],
  "concrete-auger": [.8, .006],
  "concrete-bored": [.5, .006],
  "timber-uniform": [1, .010],
};

export function applyStandard(type: PileTypeSpec, standard: PileInput["standard"]): PileTypeSpec | undefined {
  if (!usesHistoricalProcedure(standard)) return type;
  // 1991 is uitsluitend onderbouwd voor de vierkante prefab referentiepaal.
  if (standard === "nen-6743-1991" && type.id !== "concrete-prefab-prestressed-driven") return undefined;
  const factors = HISTORICAL_FACTORS[type.id];
  if (!factors) return undefined;
  const spec = getStandard(standard)!;
  return { ...type, name: type.name.replace(" (tabel 2017)", "").replace(" (bestaand projectmodel)", ""), alphaP: factors[0], alphaS: factors[1],
    alphaT: isHistorical(standard) ? 0 : type.alphaT,
    edition: spec.edition,
    source: standard === "nen-6743-1991" ? "NEN 6743:1991 / NEN 6740:1991; openbare referentie 05290 p.31–32 (alleenstaande prefab paal)" :
      standard === "nen-6743-2006" ? "NEN 6743-1:2006 tabel 2; NEN 6740:2006 tabel 3" : "NEN 9997-1:2011+C1:2012 tabel 7.c; oorspronkelijke factoren vóór verlaging",
    conditions: "Historisch drukpaalmodel: zand; geen paalgroep, OCR-, korrelgrootte- of ontgravingscorrectie. Schachtpieken conservatief begrensd op 12 MPa. Zakking niet geverifieerd.",
  };
}

export function changeStandard(input: PileInput, standard: PileStandard): PileInput {
  return { ...input, standard, gammaM: getStandard(standard)!.gammaM,
    projectFactors: undefined,
    timberTaper: standard === "nen-6743-1991" ? undefined : input.timberTaper,
    pileTypeId: standard === "nen-6743-1991" ? "concrete-prefab-prestressed-driven" : input.pileTypeId,
    baseDiameterMm: undefined, axialStiffnessKn: undefined,
  };
}
