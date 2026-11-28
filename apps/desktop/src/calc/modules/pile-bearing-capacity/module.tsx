// apps/desktop/src/calc/modules/pile-bearing-capacity/module.tsx
//
// ⚠ ALPHA — nog in ontwikkeling. De berekening werkt, maar getallen zijn
//   nog NIET productie-geverifieerd. Niet gebruiken voor toetsing bij
//   vergunning of uitvoering. CalculationsView toont een
//   prominente amber tussenstand-banner zodra deze module actief is.
//
// Invoer, rekenen, toetsen en rapport staan in headless.ts; hier komen de schermen bij.
import type { CalcModule } from "../../framework/types";
import type { PileInput, PileResult } from "./types";
import { pileHeadless } from "./headless";
import { InputPanel } from "./ui/InputPanel";
import { DrawingPanel } from "./ui/DrawingPanel";
import { ResultPanel } from "./ui/ResultPanel";
import { SettingsPanel } from "./ui/SettingsPanel";
import { CapacityTable } from "./ui/CapacityTable";
import { ct } from "../../i18n";

const pileModuleTyped: CalcModule<PileInput, PileResult> = {
  ...pileHeadless,
  InputPanel,
  VisualPanel: DrawingPanel,
  ResultPanel,
  SettingsPanel,
  table: {
    label: "Draagvermogentabel",
    Panel: ({ input, ctx, onChange, onOpen, focus, onFocus }) =>
      <CapacityTable input={input} cpts={ctx.cpts} onChange={onChange} onOpen={onOpen} cptId={focus} onFocusCpt={onFocus} />,
    items: (input, ctx) => (input.capacityTable?.cptIds ?? [...ctx.cpts.keys()]).map((id) => ({ id, label: ct("calcPileCore", "module.cptItem", "Sondering {{id}}", { id }) })),
  },
};

/** Geëxporteerd als unknown-getypeerde CalcModule zodat hij in
 *  CALC_REGISTRY (CalcModule[]) past — de generieke parameters zijn
 *  contravariant in `compute`/`defaultInput` waardoor TS de strakke
 *  PileInput-versie anders niet accepteert. */
export const pileBearingCapacityModule = pileModuleTyped as unknown as CalcModule;
