// Trekweerstand per paalmaat en puntniveau over meerdere sonderingen.
// Per cel: elke sondering gerekend met ξ3 en met ξ4, daarna
//   R_t;d = min( gemiddelde over de sonderingen met ξ3 , laagste sondering met ξ4 ).
import type { Cpt } from "../../../types/cpt";
import { computeTension, correlationFactors, type TensionInput, type TensionResult, type TensionTableConfig } from "./compute";
import { getTensionPileType } from "./catalog";

export interface TensionCellCpt { cptId: string; mean: TensionResult; min: TensionResult }
export interface TensionCell {
  sizeMm: number;
  toeNap: number;
  perCpt: TensionCellCpt[];
  /** Gemiddelde van R_t;d met ξ3 [kN]; null als geen sondering berekend kon worden. */
  meanKn: number | null;
  /** Laagste R_t;d met ξ4 [kN]. */
  minKn: number | null;
  rtDKn: number | null;
  governing: "mean" | "min" | null;
  /** Aantal sonderingen dat op dit niveau gerekend kon worden. */
  computed: number;
  unityCheck: number | null;
}
export interface TensionTable {
  config: Required<TensionTableConfig>;
  xi3: number;
  xi4: number;
  /** [maat][niveau] */
  cells: TensionCell[][];
  missing: string[];
}

/** Standaardtabel: alle sonderingen, de maat van het rekenblad en vijf niveaus rond de paalpunt. */
export function defaultTableConfig(input: TensionInput, cptIds: string[]): Required<TensionTableConfig> {
  const t = input.table;
  const toe = Math.round(input.pileToeNap * 2) / 2;
  return {
    cptIds: t?.cptIds ?? cptIds,
    toeNaps: t?.toeNaps?.length ? t.toeNaps : [toe + 2, toe + 1, toe, toe - 1, toe - 2],
    sizesMm: t?.sizesMm?.length ? t.sizesMm : [input.sizeMm],
    examples: t?.examples ?? [],
  };
}

export function cellInput(input: TensionInput, cptId: string, sizeMm: number, toeNap: number): TensionInput {
  return { ...input, cptId, sizeMm, pileToeNap: toeNap };
}

export function computeTensionTable(input: TensionInput, cpts: Map<string, Cpt>): TensionTable {
  const config = defaultTableConfig(input, [...cpts.keys()]);
  const present = config.cptIds.filter((id) => cpts.has(id));
  const { xi3, xi4 } = correlationFactors(Math.max(1, present.length), input.stiffStructure);
  const cells = config.sizesMm.map((sizeMm) => config.toeNaps.map((toeNap): TensionCell => {
    const perCpt = present.map((cptId) => {
      const cell = cellInput(input, cptId, sizeMm, toeNap), cpt = cpts.get(cptId)!;
      return { cptId, mean: computeTension(cell, cpt, xi3), min: computeTension(cell, cpt, xi4) };
    });
    const means = perCpt.flatMap((p) => (p.mean.ok ? [p.mean.rtDKn] : []));
    const mins = perCpt.flatMap((p) => (p.min.ok ? [p.min.rtDKn] : []));
    // Eén ontbrekende sondering maakt het gemiddelde onbetrouwbaar: dan geen uitkomst voor de cel.
    const complete = perCpt.length > 0 && means.length === perCpt.length;
    const meanKn = means.length ? means.reduce((a, b) => a + b, 0) / means.length : null;
    const minKn = mins.length ? Math.min(...mins) : null;
    const rtDKn = complete && meanKn !== null && minKn !== null ? Math.min(meanKn, minKn) : null;
    return {
      sizeMm, toeNap, perCpt, meanKn, minKn, rtDKn, computed: means.length,
      governing: rtDKn === null ? null : meanKn! <= minKn! ? "mean" : "min",
      unityCheck: rtDKn && input.ftDKn > 0 ? input.ftDKn / rtDKn : null,
    };
  }));
  return { config, xi3, xi4, cells, missing: config.cptIds.filter((id) => !cpts.has(id)) };
}

export function sizeLabel(input: TensionInput, sizeMm: number): string {
  return `${getTensionPileType(input.pileTypeId)?.isCircular ?? true ? "Ø" : "□"}${sizeMm}`;
}
