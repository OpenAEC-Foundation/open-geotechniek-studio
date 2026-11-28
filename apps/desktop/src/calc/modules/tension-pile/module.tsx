// Trekpalen volgens NEN 9997-1 art. 7.6.3. De rekenregels en de controleberekeningen
// staan in VERIFICATIE.md; de module is experimenteel tot de normtekst zelf is nagelopen.
// Invoer, rekenen, toetsen en rapport staan in headless.ts; hier komen de schermen bij.
import type { CalcModule } from "../../framework/types";
import type { TensionInput, TensionResult } from "./compute";
import { tensionHeadless } from "./headless";
import { InputPanel, ResultPanel, VisualPanel } from "./panels";
import { TensionTable } from "./TensionTable";
import { defaultTableConfig } from "./table";

const tensionModuleTyped: CalcModule<TensionInput, TensionResult> = {
  ...tensionHeadless,
  InputPanel, VisualPanel, ResultPanel,
  table: {
    label: "Trekweerstandtabel",
    Panel: TensionTable,
    items: (input, ctx) => defaultTableConfig(input, [...ctx.cpts.keys()]).cptIds.map((id) => ({ id, label: `Sondering ${id}` })),
  },
};

export const tensionPileModule = tensionModuleTyped as unknown as CalcModule;
