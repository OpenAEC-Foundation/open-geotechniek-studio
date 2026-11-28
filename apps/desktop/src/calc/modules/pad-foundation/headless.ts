// Poer op staal zonder schermen; gedeeld door de app (module.tsx) en de headless rekenkern.
import type { HeadlessCalcModule } from "../../framework/types";
import { computePad, padExample, type PadInput, type PadResult } from "./compute";

const f = (value: number, digits = 2) => value.toLocaleString("nl-NL", { maximumFractionDigits: digits });

export const padHeadless: HeadlessCalcModule<PadInput, PadResult> = {
  id: "pad-foundation",
  name: "Poer op staal",
  subtitle: "Gedraineerde draagkracht van een centrisch belaste rechthoekige poer",
  category: "spread",
  icon: "▰",
  norm: "EN 1997-1 · Annex D · ontwerpwaarden als invoer",
  status: "experimental",
  defaultInput: () => ({ ...padExample }),
  compute: computePad,
  statusLine: (r: PadResult) => ({
    text: r.ok ? `Vd/Rd = ${f(r.utilization, 3)}` : r.error,
    ok: r.ok && r.passes,
  }),
  checks: (input, r) => (r.ok ? [
    { label: "Rd", value: `${f(r.resistanceKn, 0)} kN` },
    { label: "Vd/Rd", value: `Vd ${f(input.verticalDesignLoadKn, 0)} kN`, uc: r.utilization },
  ] : []),
};
