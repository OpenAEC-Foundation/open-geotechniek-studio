import { ct } from "../i18n";
import type { CalcModule } from "./types";

/** Vertaalbare metadata van een rekenmodule. */
export type ModuleTextField = "name" | "subtitle" | "norm" | "visualLabel" | "tableLabel";

/**
 * Weergavetekst van een module-veld in de actieve taal. De Nederlandse
 * tekst uit de module is de standaard; de vertaling staat onder
 * `modules.<id>.<veld>` in de namespace `calc`. Geeft `undefined` als de
 * module het veld niet heeft (b.v. geen tabel of tekeningnaam).
 */
export function moduleText(mod: CalcModule, field: ModuleTextField): string | undefined {
  const nl = field === "tableLabel" ? mod.table?.label : mod[field];
  if (!nl) return undefined;
  return ct("calc", `modules.${mod.id}.${field}`, nl);
}

/** Naam van een module in de actieve taal. */
export function moduleName(mod: CalcModule): string {
  return moduleText(mod, "name") ?? mod.name;
}
