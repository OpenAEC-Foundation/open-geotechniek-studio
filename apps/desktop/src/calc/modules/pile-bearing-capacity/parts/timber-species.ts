// Houtsoorten voor de houten paal en de sterkteklasse die bij een visuele
// sorteerklasse hoort.
//
// Bron van de toewijzing: Centrum Hout, Houtwijzer "Sterktegegevens van hout"
// (Almere, 2007, artikelnummer 100016), tabel "Relaties tussen visuele
// sorteringen en de sterkteklassen van houtsoorten". Die tabel noemt per soort
// de sorteerklasse met de sorteernorm (NEN 5466, NEN 5477, NPR 5493) en de
// sterkteklasse; voor de overige soorten verwijst hij naar NEN-EN 1912.
// Dezelfde klassen staan in het houttabellenboek bij NEN-EN 1995 (2011, tabel 1,
// bron "het houtblad mei 2006"). NEN-EN 1912 en NEN 5499 zelf zijn niet
// ingezien; zie PAALSOORTEN.md.
//
// Alleen sorteerklassen waarvoor beide bronnen dezelfde klasse geven, staan er
// met een vaste klasse in. Weggelaten: sorteerklasse C van vuren, grenen en
// lariks (de Houtwijzer geeft C18, het tabellenboek ook C16). Douglas staat
// erin zonder vaste klasse: de bronnen verschillen (A/B: C22, een
// productcertificaat C24; C: C18 of C16); de gebruiker kiest de klasse.
//
// De houtsoort bepaalt alleen de sterkteklasse in de sterktetoets. De
// paalklassefactoren en het draagvermogen uit de sondering volgen uit het
// paaltype en veranderen niet.

export type TimberGroup = "softwood" | "hardwood" | "tropical";

export interface TimberGrade {
  id: string;
  /** Sorteerklasse met sorteernorm, zoals in de bron. */
  label: string;
  /** Sterkteklasse (NEN-EN 338). */
  strengthClass: string;
}

export interface TimberSpecies {
  id: string;
  /** Handelsnaam (nl). */
  name: string;
  botanical: string;
  group: TimberGroup;
  /** Leeg: geen vaste toewijzing, de gebruiker kiest de sterkteklasse. */
  grades: TimberGrade[];
}

export const TIMBER_SPECIES_SOURCE = "Centrum Hout, Houtwijzer Sterktegegevens van hout (2007)";

const nen5466: TimberGrade[] = [{ id: "AB", label: "A/B (NEN 5466)", strengthClass: "C24" }];
const npr5493 = (strengthClass: string): TimberGrade[] => [{ id: "NPR5493", label: "tropisch (NPR 5493)", strengthClass }];

export const TIMBER_SPECIES: ReadonlyArray<TimberSpecies> = [
  { id: "vuren", name: "vuren", botanical: "Picea abies", group: "softwood", grades: nen5466 },
  { id: "grenen", name: "grenen", botanical: "Pinus sylvestris", group: "softwood", grades: nen5466 },
  { id: "lariks", name: "lariks", botanical: "Larix spp.", group: "softwood", grades: nen5466 },
  { id: "douglas", name: "douglas", botanical: "Pseudotsuga menziesii", group: "softwood", grades: [] },
  { id: "eiken", name: "eiken, Midden-Europees", botanical: "Quercus petraea", group: "hardwood", grades: [{ id: "AB", label: "A/B (NEN 5477)", strengthClass: "C20" }] },
  { id: "azobe", name: "azobé", botanical: "Lophira alata", group: "tropical", grades: npr5493("D70") },
  { id: "bangkirai", name: "bangkirai", botanical: "Shorea spp.", group: "tropical", grades: npr5493("D50") },
  { id: "basralocus", name: "basralocus", botanical: "Dicorynia spp.", group: "tropical", grades: npr5493("C22") },
];

export const getTimberSpecies = (id: string | undefined) => TIMBER_SPECIES.find((s) => s.id === id);

export interface ResolvedTimber {
  species: TimberSpecies;
  /** null: geen vaste toewijzing (gebruiker kiest de klasse). */
  grade: TimberGrade | null;
}

/** Gekozen houtsoort en sorteerklasse; een onbekende sorteerklasse valt terug op de eerste. */
export function resolveTimber(sel: { id: string; gradeId?: string } | undefined): ResolvedTimber | null {
  const species = getTimberSpecies(sel?.id);
  if (!species) return null;
  const grade = species.grades.find((g) => g.id === sel?.gradeId) ?? species.grades[0] ?? null;
  return { species, grade };
}
