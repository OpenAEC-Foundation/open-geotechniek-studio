// Fundering op staal volgens NEN 9997-1 art. 6.5. De rekenregels, de bronnen en de
// controleberekeningen staan in VERIFICATIE.md; de module is experimenteel tot de
// normtekst zelf is nagelopen.
import type { CalcModule, ProjectContext } from "../../framework/types";
import { DEFAULT_FACTORS, getSoilType } from "./catalog";
import { computeSpread, layersFromCpt, type SpreadInput, type SpreadLayer, type SpreadResult } from "./compute";
import { InputPanel, ResultPanel, VisualPanel, fmt } from "./panels";
import { buildSpreadReport, spreadReportFileName } from "./report";

const r2 = (v: number) => Math.round(v * 100) / 100;

function defaultInput(ctx: ProjectContext): SpreadInput {
  const cpt = ctx.activeCptId ? ctx.cpts.get(ctx.activeCptId) : null;
  const ground = cpt?.metadata.ground_level_nap ?? 0;
  const sand = getSoilType("sand-medium")!;
  let layers: SpreadLayer[] = [];
  try { if (cpt) layers = layersFromCpt(cpt); } catch { layers = []; }
  if (!layers.length) layers = [{ topNap: r2(ground), name: sand.name, gamma: sand.gamma, gammaSat: sand.gammaSat, phi: sand.phi, c: sand.c, cu: sand.cu, soilId: sand.id }];
  return {
    cptId: ctx.activeCptId, shape: "strip", widthM: 1, lengthM: 2, foundationNap: r2(ground - 0.8), groundNap: r2(ground), waterNap: r2(ground - 1.5),
    vDKn: 150, hDKn: 0, hDirection: "B", hArmM: 0, eccBM: 0, eccLM: 0, momentDKnm: 0, slopeDeg: 0, baseTiltDeg: 0,
    castInPlace: true, passiveDKn: 0, gapPossible: false, factors: { ...DEFAULT_FACTORS }, layers,
  };
}

const spreadModuleTyped: CalcModule<SpreadInput, SpreadResult> = {
  id: "spread-foundation",
  name: "Fundering op staal",
  subtitle: "Strook of poer: draagvermogen, doorponsen, afschuiven en kantelen",
  category: "spread",
  icon: "▭",
  norm: "NEN 9997-1 art. 6.5",
  status: "experimental",
  defaultInput,
  compute: (input) => computeSpread(input),
  InputPanel, VisualPanel, ResultPanel,
  visualLabel: "Doorsnede",
  statusLine: (r) => r.ok
    ? { text: `u.c. ${fmt(r.governing.uc, 2)} (${r.governing.label})`, ok: r.passes }
    : { text: r.error, ok: false, pending: true },
  checks: (_input, r) => (r.ok ? r.checks.map((c) => ({ label: c.label, value: `${fmt(c.resistanceKn, c.unit === "m" ? 2 : 0)} ${c.unit}`, uc: c.uc })) : []),
  buildReport: buildSpreadReport,
  reportFileName: spreadReportFileName,
};

export const spreadFoundationModule = spreadModuleTyped as unknown as CalcModule;
