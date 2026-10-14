// apps/desktop/src/calc/framework/registry.ts
import type { CalcModule } from "./types";
import { pileBearingCapacityModule } from "../modules/pile-bearing-capacity/module";
import { kalenderingModule } from "../modules/kalendering/module";
import { spreadFoundationDrainedModule } from "../modules/spread-foundation-drained/module";
import { spreadFoundationUndrainedModule } from "../modules/spread-foundation-undrained/module";
import { laterallyLoadedPileModule } from "../modules/laterally-loaded-pile/module";
import { sheetPileWallModule } from "../modules/sheet-pile-wall/module";
import { groundAnchorModule } from "../modules/ground-anchor/module";

/** De publieke demo bevat alleen expliciet vrijgegeven rekenmodules. */
const PUBLIC_MODULES: CalcModule[] = [];

/** Conceptmodules zijn beschikbaar in desktop, ontwikkeling en het
 *  ingesloten platform. De publieke demo bevat deze modules niet. */
const DEV_ONLY_MODULES: CalcModule[] = [
  pileBearingCapacityModule,
  kalenderingModule,
  laterallyLoadedPileModule,
  spreadFoundationDrainedModule,
  spreadFoundationUndrainedModule,
  sheetPileWallModule,
  groundAnchorModule,
];

/** live.yml zet VITE_PUBLIC_WEB="1"; Vite vervangt dit statisch waardoor
 *  Rollup de niet-genomen tak (incl. DEV_ONLY_MODULES en al hun imports)
 *  volledig elimineert in de publieke build. */
const IS_PUBLIC_WEB = import.meta.env.VITE_PUBLIC_WEB === "1" && import.meta.env.VITE_PLATFORM !== "1";

export const CALC_REGISTRY: CalcModule[] = IS_PUBLIC_WEB
  ? PUBLIC_MODULES
  : [...PUBLIC_MODULES, ...DEV_ONLY_MODULES];

export function getCalcModule(id: string): CalcModule | undefined {
  return CALC_REGISTRY.find((m) => m.id === id);
}
