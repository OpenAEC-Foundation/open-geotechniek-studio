// Beoordeling kalendering zonder schermen; gedeeld door de app (module.tsx) en de headless rekenkern.
import type { HeadlessCalcModule } from "../../framework/types";
import { ct, fmtNumber } from "../../i18n";
import { computeDriving, defaultDrivingInput, type Comparison, type DrivingInput, type DrivingResult } from "./compute";

const NS = "calcDriving";
export const pct = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v * 100)} %`;
export const isComparison = (t: DrivingResult["final"]): t is Comparison => !!t && "blows" in t;

export const drivingHeadless: HeadlessCalcModule<DrivingInput, DrivingResult> = {
  id: "driving-assessment",
  name: "Beoordeling kalendering",
  subtitle: "Verwachte kalender uit de sondering, naast de getelde",
  category: "pile",
  icon: "🔨",
  norm: "Vuistregel N = tocht · D² · qc / E",
  status: "experimental",
  visualLabel: "Kalender",
  defaultInput: (ctx) => defaultDrivingInput(ctx),
  compute: (input, ctx) => computeDriving(input, ctx),
  statusLine: (r) => {
    if (!r.ok) return { text: r.error ?? "–", ok: false, pending: r.pending };
    const fin = r.final;
    if (isComparison(fin) && fin.deviation !== null)
      return { text: ct(NS, "status.compared", "verwacht {{expected}} · geteld {{counted}} ({{dev}})", { expected: fin.expected, counted: fin.blows, dev: pct(fin.deviation) }), ok: r.outside === 0 };
    return { text: ct(NS, "status.expected", "verwacht {{expected}} slagen per tocht", { expected: fin?.expected ?? "–" }), ok: true };
  },
  checks: (input, r) => {
    if (!r.ok || !r.final) return [];
    const fin = r.final, tocht = `${input.tochtMm} mm`;
    const out = [{ label: ct(NS, "checks.expected", "verwacht"), value: `${fin.expected ?? "–"} / ${tocht}` }];
    if (isComparison(fin) && fin.deviation !== null)
      out.push({ label: ct(NS, "checks.counted", "geteld"), value: `${fin.blows} / ${tocht}` }, { label: ct(NS, "checks.deviation", "afwijking"), value: pct(fin.deviation), ...{ uc: Math.abs(fin.deviation) / (input.tolerancePct / 100) } });
    out.push({ label: ct(NS, "checks.energy", "slagenergie"), value: `${fmtNumber(r.energyKnm, 1)} kNm` });
    return out;
  },
};
