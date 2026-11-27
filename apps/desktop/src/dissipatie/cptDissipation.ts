// Dissipatietests bij een sondering bewaren: toevoegen, instellingen wijzigen en verwijderen.
// Elke functie geeft een nieuwe sondering terug; het veld ontbreekt als er geen tests zijn.
import type { Cpt } from "../types/cpt";
import { validationOf } from "../validation/report";
import type { DissipationSettings, DissipationTest } from "./types";

const withTests = (cpt: Cpt, tests: DissipationTest[]): Cpt => {
  const { dissipation_tests: _old, ...rest } = cpt;
  return tests.length ? { ...rest, dissipation_tests: [...tests].sort((a, b) => a.depth - b.depth) } : rest;
};

const sameFile = (a: string | undefined, b: string | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/**
 * Voegt een test toe. Een test met hetzelfde kenmerk wordt vervangen, en ook een eerdere test uit
 * hetzelfde GEF-bestand (een GEF-dissipatiebestand bevat één test); de keuzes van de gebruiker bij die
 * eerdere test blijven dan staan.
 */
export function withDissipationTest(cpt: Cpt, test: DissipationTest): Cpt {
  const replaces = (t: DissipationTest) => t.id === test.id || (t.source === "gef" && test.source === "gef" && sameFile(t.source_file, test.source_file));
  const previous = (cpt.dissipation_tests ?? []).find(replaces);
  const added = previous?.settings && !test.settings ? { ...test, settings: previous.settings } : test;
  return withTests(cpt, [...(cpt.dissipation_tests ?? []).filter((t) => !replaces(t)), added]);
}

const stem = (name: string) => (name.split(/[\\/]/).pop() ?? name).toLowerCase().replace(/\.(gef|xml|ifcgeo)$/i, "");
const compact = (id: string) => id.toLowerCase().replace(/\s+/g, "");

/** Hoort deze test bij de sondering? Op bestandsnaam uit #PARENT, anders op test-id of het begin van de bestandsnaam. */
export function belongsToCpt(test: DissipationTest, cpt: Cpt): boolean {
  const cptFile = stem(cpt.metadata.source_file ?? "");
  if (test.parent_file && cptFile && stem(test.parent_file) === cptFile) return true;
  if (test.test_id && compact(test.test_id) === compact(cpt.id)) return true;
  const own = stem(test.source_file ?? "");
  return !!cptFile && own.startsWith(cptFile) && /^[\s_.-]/.test(own.slice(cptFile.length));
}

/** Bestandsnaam die op een dissipatietest wijst, zoals `S01_DIS_01.gef`. */
export const isDissipationName = (name: string) => /(^|[\s_.-])diss?([\s_.\d-]|$)/i.test(name.split(/[\\/]/).pop() ?? name);

/** Dissipatietests achteraan, zodat ze bij het openen van meerdere bestanden de sondering al vinden. */
export function dissipationLast<T>(items: T[], name: (item: T) => string): T[] {
  return [...items].sort((a, b) => Number(isDissipationName(name(a))) - Number(isDissipationName(name(b))));
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
