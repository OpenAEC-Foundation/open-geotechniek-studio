// Zetting van één laag zonder schermen; gedeeld door de app (module.tsx) en de headless rekenkern.
import type { HeadlessCalcModule } from "../../framework/types";
import { computeSettlement, type SettlementInput, type SettlementResult } from "./compute";

const format = (value: number, digits = 2) => value.toLocaleString("nl-NL", { maximumFractionDigits: digits });
export const settlementExample: SettlementInput = { thicknessM: 2, stressIncreaseKpa: 50, constrainedModulusMpa: 5 };

export const settlementHeadless: HeadlessCalcModule<SettlementInput, SettlementResult> = {
  id: "settlement", name: "Zetting van één laag", subtitle: "Eendimensionale zetting met een constante samendrukkingsmodulus",
  category: "spread", icon: "↓", norm: "1D-compressie · USACE EM 1110-1-1905 (2025), §7–7",
  status: "experimental", defaultInput: () => ({ ...settlementExample }),
  compute: computeSettlement,
  statusLine: (result) => ({ text: result.ok ? `${format(result.settlementMm)} mm zetting` : result.error, ok: result.ok }),
  checks: (_input, r) => (r.ok ? [{ label: "s", value: `${format(r.settlementMm)} mm` }, { label: "ε", value: `${format(r.strain * 100, 4)} %` }] : []),
};
