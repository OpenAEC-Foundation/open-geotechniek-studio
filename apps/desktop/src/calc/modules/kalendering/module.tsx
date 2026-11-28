// apps/desktop/src/calc/modules/kalendering/module.tsx
//
// ⚠ ALPHA — nog in ontwikkeling. De formule is rechtstreeks uit het
//   project-template overgenomen en is een empirische benadering, géén
//   norm-formule. De berekening is NIET productie-geverifieerd. Niet
//   gebruiken voor toetsing bij vergunning of uitvoering. CalculationsView
//   toont een prominente amber tussenstand-banner zodra deze module actief
//   is. Voor projectberekeningen blijft de Funderingspaal-module leidend.
//
import type { CalcModule } from "../../framework/types";
import type { KalenderingInput, KalenderingResult } from "./types";
import { kalenderingHeadless } from "./headless";
import { InputPanel } from "./ui/InputPanel";
import { VisualPanel } from "./ui/VisualPanel";
import { ResultPanel } from "./ui/ResultPanel";

const kalenderingModuleTyped: CalcModule<KalenderingInput, KalenderingResult> = { ...kalenderingHeadless, InputPanel, VisualPanel, ResultPanel };

/** Geëxporteerd als unknown-getypeerde CalcModule zodat hij in
 *  CALC_REGISTRY (CalcModule[]) past — generieke parameters zijn
 *  contravariant in compute/defaultInput. Zie pile-bearing-capacity
 *  module.tsx voor dezelfde pattern. */
export const kalenderingModule = kalenderingModuleTyped as unknown as CalcModule;
