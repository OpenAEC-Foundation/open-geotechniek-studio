// Damwand volgens NEN 9997-1 met CUR 166: verenmodel met de methode van Blum als controle. De rekenregels, de
// bronnen en de controleberekeningen staan in VERIFICATIE.md; de module is een concept tot de normtekst zelf
// is nagelopen.
// Invoer, rekenen, toetsen en rapport staan in headless.ts; hier komen de schermen bij.
import type { CalcModule } from "../../framework/types";
import type { WallInput, WallResult } from "./compute";
import { wallHeadless } from "./headless";
import { InputPanel, ResultPanel, VisualPanel } from "./panels";

const wallModuleTyped: CalcModule<WallInput, WallResult> = { ...wallHeadless, InputPanel, VisualPanel, ResultPanel };

export const sheetPileWallModule = wallModuleTyped as unknown as CalcModule;
