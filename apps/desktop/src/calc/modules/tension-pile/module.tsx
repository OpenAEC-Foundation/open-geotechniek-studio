// Trekpalen volgens NEN 9997-1 art. 7.6.3. De rekenregels en de controleberekeningen
// staan in VERIFICATIE.md; de module is experimenteel tot de normtekst zelf is nagelopen.
import type { CalcModule, ProjectContext } from "../../framework/types";
import { computeTension, type TensionInput, type TensionResult } from "./compute";
import { InputPanel, ResultPanel, VisualPanel, fmt } from "./panels";
import { TensionTable } from "./TensionTable";
import { defaultTableConfig } from "./table";
import { buildTensionReport, tensionReportFileName } from "./report";

const r2 = (v: number) => Math.round(v * 100) / 100;

function defaultInput(ctx: ProjectContext): TensionInput {
  const cpt = ctx.activeCptId ? ctx.cpts.get(ctx.activeCptId) : null;
  const ground = cpt?.metadata.ground_level_nap ?? 0;
  const lastDepth = cpt?.points.length ? Math.max(...cpt.points.map((p) => Math.abs(p.depth)).filter(Number.isFinite)) : Infinity;
  const length = Math.max(7, Math.min(15, Math.floor((lastDepth - 0.5) * 2) / 2));
  return {
    cptId: ctx.activeCptId, pileTypeId: "prefab-concrete", sizeMm: 290,
    pileTopNap: r2(ground - 0.5), pileToeNap: r2(ground - 0.5 - length), waterNap: r2(ground - 1),
    excavationReduction: "sqrt", ftMaxRepKn: 0, ftMinRepKn: 0, ftDKn: 0,
    cptCount: Math.max(1, ctx.cpts.size), stiffStructure: false, includeCohesive: true, halveCohesive: true,
  };
}

const tensionModuleTyped: CalcModule<TensionInput, TensionResult> = {
  id: "tension-pile",
  name: "Trekpalen",
  subtitle: "Trekweerstand van een paal uit de sondering, alleenstaand of in een groep",
  category: "pile",
  icon: "▲",
  norm: "NEN 9997-1 art. 7.6.3",
  status: "experimental",
  defaultInput,
  compute: (input, ctx) => computeTension(input, input.cptId ? ctx.cpts.get(input.cptId) ?? null : null),
  InputPanel, VisualPanel, ResultPanel,
  table: {
    label: "Trekweerstandtabel",
    Panel: TensionTable,
    items: (input, ctx) => defaultTableConfig(input, [...ctx.cpts.keys()]).cptIds.map((id) => ({ id, label: `Sondering ${id}` })),
  },
  statusLine: (r) => r.ok
    ? { text: r.unityCheck === null ? `Rt;d ${fmt(r.rtDKn, 0)} kN` : `u.c. ${fmt(r.unityCheck, 2)}`, ok: r.passes, pending: r.unityCheck === null }
    : { text: r.error, ok: false, pending: true },
  checks: (input, r) => {
    if (!r.ok) return [];
    const kn = (v: number) => `${fmt(v, 0)} kN`;
    return [
      { label: "Rt;wrijving;d", value: kn(r.rFrictionKn) },
      ...(r.group ? [{ label: "Rt;kluit;d", value: kn(r.group.rKluitKn) }] : []),
      { label: "G′paal;d", value: kn(r.gPileKn) },
      { label: "Rt;d", value: kn(r.rtDKn) },
      ...(input.ftDKn > 0 && r.unityCheck !== null ? [{ label: "trek", value: `Ft;d ${kn(input.ftDKn)}`, uc: r.unityCheck }] : []),
    ];
  },
  buildReport: buildTensionReport,
  reportFileName: tensionReportFileName,
};

export const tensionPileModule = tensionModuleTyped as unknown as CalcModule;
