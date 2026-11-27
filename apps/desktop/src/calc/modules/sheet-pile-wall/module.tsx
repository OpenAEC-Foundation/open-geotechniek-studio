// Damwand volgens NEN 9997-1 met CUR 166: verenmodel met de methode van Blum als controle. De rekenregels, de
// bronnen en de controleberekeningen staan in VERIFICATIE.md; de module is een concept tot de normtekst zelf
// is nagelopen.
import type { CalcModule, ProjectContext } from "../../framework/types";
import { ct } from "../../i18n";
import { computeWall, wallExample, wallLayersFromCpt, type WallInput, type WallResult } from "./compute";
import { InputPanel, ResultPanel, VisualPanel, fmt } from "./panels";
import { buildWallReport, wallReportFileName } from "./report";

function defaultInput(ctx: ProjectContext): WallInput {
  const cpt = ctx.activeCptId ? ctx.cpts.get(ctx.activeCptId) : null;
  const input = wallExample(cpt?.metadata.ground_level_nap ?? 0);
  if (!cpt) return input;
  // Met een sondering: haar laagindeling als voorstel. Met de waarden van tabel 2.b en tabel 3.3 (cpt-layers.ts).
  try { const layers = wallLayersFromCpt(cpt, { waterNap: input.waterHighNap }); if (layers.length) return { ...input, cptId: ctx.activeCptId, layersHigh: layers }; } catch { /* het voorbeeld blijft staan */ }
  return input;
}

const wallModuleTyped: CalcModule<WallInput, WallResult> = {
  id: "sheet-pile-wall",
  name: "Damwand en beschoeiing",
  subtitle: "Stalen damwand of beschoeiing van hout, kunststof of beton: verenmodel, Blum als controle, toets van doorsnede en inheidiepte",
  category: "wall",
  icon: "▌",
  norm: "NEN 9997-1 met CUR 166 · NEN-EN 1993-5 · NEN-EN 1995-1-1",
  status: "experimental",
  defaultInput,
  compute: (input) => computeWall(input),
  InputPanel, VisualPanel, ResultPanel,
  visualLabel: "Doorsnede",
  wideVisual: true,
  statusLine: (r) => (r.ok
    ? { text: `u.c. ${fmt(r.governing.uc, 2)} (${r.governing.label})`, ok: r.passes }
    : { text: r.error, ok: false, pending: true }),
  checks: (_input, r) => (r.ok ? [
    { label: "M max", value: `${fmt(Math.abs(r.uls.maxMoment.value), 0)} kNm/m` },
    ...(r.uls.anchor ? [{ label: ct("calcWall", "module.anchor", "anker"), value: `${fmt(r.uls.anchor.perAnchorKn, 0)} kN` }] : []),
    { label: ct("calcWall", "module.head", "y kop"), value: `${fmt(r.sls.headDisplacementM * 1000, 1)} mm` },
    ...r.checks.map((c) => ({ label: c.label, value: `${fmt(c.resistance, c.unit === "m" ? 2 : 0)} ${c.unit}`, uc: c.uc })),
  ] : []),
  buildReport: buildWallReport,
  reportFileName: wallReportFileName,
};

export const sheetPileWallModule = wallModuleTyped as unknown as CalcModule;
