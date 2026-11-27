// Omschrijving van een aanpassing van de grondlaaginterpretatie met de
// grondsoorten van de paalberekening. De tekst zelf is gedeeld met de andere
// modules: calc/shared/interpretation/text.ts.
import type { AppliedOverride } from "../types";
import { soilLabel } from "../catalog";
import { overrideChanges as sharedChanges } from "../../../shared/interpretation/text";

export { overrideRange } from "../../../shared/interpretation/text";

/**
 * Wat er is gewijzigd, als oude → nieuwe waarde; één regel per onderdeel.
 * `qcSymbol`: "qc" op het scherm, "q_c" in de uitdraai (subscript).
 */
export function overrideChanges(a: AppliedOverride, qcSymbol = "qc"): string[] {
  return sharedChanges(a, soilLabel, qcSymbol);
}
