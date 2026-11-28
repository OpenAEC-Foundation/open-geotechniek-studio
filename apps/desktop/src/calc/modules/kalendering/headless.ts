// apps/desktop/src/calc/modules/kalendering/module.tsx
//
// ⚠ ALPHA — nog in ontwikkeling. De formule is rechtstreeks uit het
//   project-template overgenomen en is een empirische benadering, géén
//   norm-formule. De berekening is NIET productie-geverifieerd. Niet
//   gebruiken voor toetsing bij vergunning of uitvoering. CalculationsView
//   toont een prominente amber tussenstand-banner zodra deze module actief
//   is. Voor projectberekeningen blijft de Funderingspaal-module leidend.
//
// Zonder schermen; gedeeld door de app (module.tsx) en de headless rekenkern.
import type { HeadlessCalcModule, ProjectContext } from "../../framework/types";
import type { KalenderingInput, KalenderingResult } from "./types";
import { computeKalendering } from "./compute";
import { DEFAULT_VALBLOK_ID } from "./catalog";

function defaultInput(_ctx: ProjectContext): KalenderingInput {
  void _ctx;
  return {
    valblokId: DEFAULT_VALBLOK_ID,
    customMassaKg: 3000,
    customValhoogteM: 1.2,
    paalSoort: "rond",
    diameterMm: 350,
    zijdeBMm: 350,
    conusweerstandMpa: 15,
    slagSetMm: 400,
  };
}

export const kalenderingHeadless: HeadlessCalcModule<KalenderingInput, KalenderingResult> = {
  id: "kalendering",
  name: "Kalendering",
  subtitle: "Verwacht aantal heislagen per set",
  category: "pile",
  icon: "🔨",
  norm: "Empirische projectformule (≠ norm)",
  status: "experimental",
  defaultInput,
  compute: (input) => computeKalendering(input),
  statusLine: (r) => ({
    text: r.ok
      ? `${r.slagenPerSet} slagen / set`
      : `Fout: ${r.error ?? "—"}`,
    ok: r.ok,
  }),
  checks: (_input, r) => (r.ok ? [
    { label: "E", value: `${r.eBlokKnm.toFixed(1)} kNm` },
    { label: "N", value: `${r.slagenPerSet} / ${_input.slagSetMm} mm` },
  ] : []),
};
