// De rekenmodules zonder schermen. De app (registry.ts) bouwt haar modules uit
// deze objecten; de headless rekenkern (packages/core) gebruikt ze rechtstreeks.
// Dit bestand en alles wat het importeert mag geen React, stores of Tauri laden.
import type { HeadlessCalcModule } from "./types";
import { pileHeadless } from "../modules/pile-bearing-capacity/headless";
import { tensionHeadless } from "../modules/tension-pile/headless";
import { lateralHeadless } from "../modules/laterally-loaded-pile/headless";
import { drivingHeadless } from "../modules/driving-assessment/headless";
import { spreadHeadless } from "../modules/spread-foundation/headless";
import { wallHeadless } from "../modules/sheet-pile-wall/headless";
import { adviceHeadless } from "../modules/foundation-advice/headless";
import { padHeadless } from "../modules/pad-foundation/headless";
import { settlementHeadless } from "../modules/settlement/headless";
import { kalenderingHeadless } from "../modules/kalendering/headless";

const asUnknown = (m: unknown) => m as HeadlessCalcModule;

/** De modules van de app, in de volgorde van CALC_REGISTRY. */
export const APP_HEADLESS_MODULES: HeadlessCalcModule[] = [
  pileHeadless, tensionHeadless, lateralHeadless, drivingHeadless, spreadHeadless, wallHeadless, adviceHeadless,
].map(asUnknown);

/** Losse rekenbladen die de app niet (meer) in de keuzelijst toont, maar die wel rekenen. */
export const EXTRA_HEADLESS_MODULES: HeadlessCalcModule[] = [padHeadless, settlementHeadless, kalenderingHeadless].map(asUnknown);

export const HEADLESS_REGISTRY: HeadlessCalcModule[] = [...APP_HEADLESS_MODULES, ...EXTRA_HEADLESS_MODULES];

export function getHeadlessModule(id: string): HeadlessCalcModule | undefined {
  return HEADLESS_REGISTRY.find((m) => m.id === id);
}
