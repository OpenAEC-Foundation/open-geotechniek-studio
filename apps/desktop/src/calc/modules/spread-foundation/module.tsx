// Fundering op staal volgens NEN 9997-1 art. 6.5. De rekenregels, de bronnen en de
// controleberekeningen staan in VERIFICATIE.md; de module is experimenteel tot de
// normtekst zelf is nagelopen.
// Invoer, rekenen, toetsen en rapport staan in headless.ts; hier komen de schermen bij.
import type { CalcModule } from "../../framework/types";
import type { SpreadInput, SpreadResult } from "./compute";
import { spreadHeadless } from "./headless";
import { InputPanel, ResultPanel, VisualPanel } from "./panels";

const spreadModuleTyped: CalcModule<SpreadInput, SpreadResult> = { ...spreadHeadless, InputPanel, VisualPanel, ResultPanel };

export const spreadFoundationModule = spreadModuleTyped as unknown as CalcModule;
