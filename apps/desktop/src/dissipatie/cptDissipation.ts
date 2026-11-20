// Dissipatietests bij een sondering bewaren: toevoegen, instellingen wijzigen en verwijderen.
// Elke functie geeft een nieuwe sondering terug; het veld ontbreekt als er geen tests zijn.
import type { Cpt } from "../types/cpt";
import { validationOf } from "../validation/report";
import type { DissipationSettings, DissipationTest } from "./types";

const withTests = (cpt: Cpt, tests: DissipationTest[]): Cpt => {
  const { dissipation_tests: _old, ...rest } = cpt;
  return tests.length ? { ...rest, dissipation_tests: [...tests].sort((a, b) => a.depth - b.depth) } : rest;
};

/** Voegt een test toe; een test met hetzelfde kenmerk (zelfde bestand en diepte) wordt vervangen. */
export function withDissipationTest(cpt: Cpt, test: DissipationTest): Cpt {
  return withTests(cpt, [...(cpt.dissipation_tests ?? []).filter((t) => t.id !== test.id), test]);
}

export function withoutDissipationTest(cpt: Cpt, testId: string): Cpt {
  return withTests(cpt, (cpt.dissipation_tests ?? []).filter((t) => t.id !== testId));
}

/** Wijzigt de keuzes bij een test (of de diepte, als het bestand die niet gaf). */
export function withTestChange(cpt: Cpt, testId: string, change: { settings?: Partial<DissipationSettings>; depth?: number }): Cpt {
  return withTests(cpt, (cpt.dissipation_tests ?? []).map((t) => t.id !== testId ? t : {
    ...t,
    ...(change.depth != null ? { depth: change.depth } : {}),
    settings: { ...t.settings, ...change.settings },
  }));
}

/** Oppervlakte van de conuspunt [mm²] uit het sondeerbestand: het BRO-veld of GEF-meetvariabele 1. */
export function coneAreaFromFile(cpt: Cpt): number | undefined {
  const bro = cpt.metadata.measurements?.find((item) => item.name === "coneSurfaceArea");
  if (bro?.value != null && bro.value > 0 && /^mm\^?2$|^mm²$/i.test(bro.unit)) return bro.value;
  const gef = validationOf(cpt)?.measurementVariables?.["1"];
  if (gef?.value != null && gef.value > 0 && (!gef.unit || /^mm\^?2$|^mm²$|^-$/i.test(gef.unit))) return gef.value;
  return undefined;
}

/** Aantal dissipatietests in een reeks sonderingen. */
export const dissipationTestCount = (cpts: Cpt[]) => cpts.reduce((count, cpt) => count + (cpt.dissipation_tests?.length ?? 0), 0);
