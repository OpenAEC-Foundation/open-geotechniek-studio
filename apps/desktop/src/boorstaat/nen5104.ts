// Grondsoort volgens NEN 5104 (hoofdnaam met toevoegingen en gradatie) en de tekenwijze die daarbij hoort.
// NEN 5104 legt de benaming vast (bijvoorbeeld "klei, zwak zandig", code Kz1), niet de kleur of arcering.
// De kleuren en arceringen hier volgen de in Nederland gangbare boorstaat-legenda: grind oranje met
// kiezels, zand geel met punten, leem okergeel, klei groen gearceerd, veen bruin met liggende strepen.
import { describeSoilCode, parseSoilCode } from "@bedrock-engineer/gef-parser/bore-codes";
import type { BoreLayer } from "../types/bore";

/** Hoofdgrondsoort: grind, zand, leem, klei, veen, of X voor wat daar niet onder valt. */
export type MainSoil = "G" | "Z" | "L" | "K" | "V" | "X";
/** Toevoeging: siltig, zandig, grindig, humeus, kleiig. */
export type AdmixtureLetter = "s" | "z" | "g" | "h" | "k";
/** Tekenwijze: de vijf hoofdgrondsoorten plus silt (S) en humus (H) voor de bijmengstroken. */
export type PatternKey = MainSoil | "S" | "H";

export interface SoilClass {
  main: MainSoil;
  /** Toevoegingen in de volgorde van de benaming; gradatie 1 zwak … 4 uiterst, leeg als die niet is gegeven. */
  admixtures: Array<{ letter: AdmixtureLetter; grade?: number }>;
}

export const MAIN_SOILS: Array<{ code: MainSoil; name: string }> = [
  { code: "G", name: "Grind" }, { code: "Z", name: "Zand" }, { code: "L", name: "Leem" },
  { code: "K", name: "Klei" }, { code: "V", name: "Veen" }, { code: "X", name: "Overig" },
];
export const ADMIXTURES: Array<{ letter: AdmixtureLetter; name: string; pattern: PatternKey }> = [
  { letter: "s", name: "siltig", pattern: "S" }, { letter: "z", name: "zandig", pattern: "Z" },
  { letter: "g", name: "grindig", pattern: "G" }, { letter: "h", name: "humeus", pattern: "H" },
  { letter: "k", name: "kleiig", pattern: "K" },
];
export const GRADES = [{ grade: 1, name: "zwak" }, { grade: 2, name: "matig" }, { grade: 3, name: "sterk" }, { grade: 4, name: "uiterst" }];

/** Toevoegingen die bij een hoofdgrondsoort te kiezen zijn: alles behalve de grondsoort zelf. */
export function admixturesFor(main: MainSoil): typeof ADMIXTURES {
  if (main === "X") return [];
  const own: Partial<Record<MainSoil, AdmixtureLetter>> = { Z: "z", G: "g", K: "k", L: "s" };
  return ADMIXTURES.filter((a) => a.letter !== own[main]);
}

const isMain = (v: string): v is MainSoil => "GZLKV".includes(v) && v.length === 1;
const isLetter = (v: string): v is AdmixtureLetter => "szghk".includes(v) && v.length === 1;

function fromParsed(main: string, admixtures: Array<{ letter: string; grade?: number }>): SoilClass | null {
  if (!isMain(main)) return null;
  return { main, admixtures: admixtures.filter((a) => isLetter(a.letter)).map((a) => ({ letter: a.letter as AdmixtureLetter, ...(a.grade ? { grade: a.grade } : {}) })) };
}

/** Een NEN 5104-code zoals "Kz1" of "Zs2g1". Geeft null als het geen code is. */
export function classFromCode(code: string): SoilClass | null {
  const token = code.trim().split(/\s+/)[0] ?? "";
  if (!/^[GKLVZ](?:[szghkm][1-4]?)*$/.test(token)) return null;
  const parsed = parseSoilCode(token);
  return fromParsed(parsed.main, parsed.admixtures);
}

const NOUNS: Record<string, MainSoil> = {
  grind: "G", gravel: "G", zand: "Z", sand: "Z", leem: "L", loam: "L", silt: "L", klei: "K", clay: "K", veen: "V", peat: "V",
};
const ADJECTIVES: Array<[RegExp, AdmixtureLetter]> = [
  [/^silt/, "s"], [/^zandig/, "z"], [/^sandy/, "z"], [/^grind/, "g"], [/^hum/, "h"], [/^organi/, "h"], [/^klei/, "k"], [/^venig/, "h"],
];
const GRADE_WORDS: Record<string, number> = { zwak: 1, matig: 2, sterk: 3, uiterst: 4 };

/**
 * Een benaming in woorden: "Klei, zwak zandig", maar ook de aaneengeschreven vorm uit BRO-bestanden
 * ("zwakZandigeKlei", "siltigZandMetGrind"). Het eerste zelfstandig naamwoord is de hoofdgrondsoort;
 * bijvoeglijke vormen en "met grind" zijn toevoegingen, met de gradatie die ervoor staat.
 */
export function classFromName(name: string): SoilClass {
  const words = name.replace(/([a-zà-ÿ])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-zà-ÿ]+/).filter(Boolean);
  let main: MainSoil | null = null, grade: number | undefined, after = false;
  const admixtures: SoilClass["admixtures"] = [];
  const add = (letter: AdmixtureLetter) => {
    if (!admixtures.some((a) => a.letter === letter)) admixtures.push({ letter, ...(grade ? { grade } : {}) });
    grade = undefined;
  };
  for (const word of words) {
    if (word in GRADE_WORDS) { grade = GRADE_WORDS[word]; continue; }
    if (word === "met" || word === "with") { after = true; continue; }
    if (word in NOUNS) {
      const soil = NOUNS[word];
      if (!main && !after) { main = soil; grade = undefined; }
      else if (soil !== main) add(soil === "G" ? "g" : soil === "Z" ? "z" : soil === "K" ? "k" : soil === "V" ? "h" : "s");
      continue;
    }
    const adjective = ADJECTIVES.find(([pattern]) => pattern.test(word));
    if (adjective) add(adjective[1]);
  }
  if (!main) return { main: "X", admixtures: [] };
  const own = { G: "g", Z: "z", K: "k", L: "s", V: "" }[main as Exclude<MainSoil, "X">];
  return { main, admixtures: admixtures.filter((a) => a.letter !== own) };
}

/** Woorden uit een benaming die niet in de NEN 5104-grondsoort passen, zoals "met keien" in "kleiMetKeien". */
export function unclassifiedWords(name: string): string {
  const words = name.replace(/([a-zà-ÿ])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-zà-ÿ]+/).filter(Boolean);
  const known = (w: string) => w in GRADE_WORDS || w in NOUNS || ADJECTIVES.some(([pattern]) => pattern.test(w));
  return words.filter((w, i) => !known(w) && !((w === "met" || w === "with") && known(words[i + 1] ?? ""))).join(" ");
}

/** Grondsoort van een laag: eerst de classificatie van de lezer, dan de code, dan de benaming. */
export function classifyLayer(layer: Pick<BoreLayer, "classification" | "soil_code" | "soil_name">): SoilClass {
  const given = layer.classification && fromParsed(layer.classification.main, layer.classification.admixtures);
  return given ?? (layer.soil_code ? classFromCode(layer.soil_code) : null) ?? classFromCode(layer.soil_name) ?? classFromName(layer.soil_name);
}

/** NEN 5104-code van een grondsoort ("Kz1"); leeg voor overige grond. */
export function soilCode(soil: SoilClass): string {
  return soil.main === "X" ? "" : soil.main + soil.admixtures.map((a) => a.letter + (a.grade ?? "")).join("");
}

/** Benaming volgens NEN 5104: "Klei, zwak zandig". */
export function soilName(soil: SoilClass): string {
  if (soil.main === "X") return "Overig";
  const name = describeSoilCode({ lithology: soilCode(soil), main: soil.main, admixtures: soil.admixtures, qualifiers: [] });
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** De velden van een laag die uit de gekozen grondsoort volgen, in dezelfde vorm als de GEF-lezer ze levert. */
export function layerSoilFields(soil: SoilClass): Pick<BoreLayer, "soil_name" | "soil_code" | "classification"> {
  if (soil.main === "X") return { soil_name: "Overig" };
  const code = soilCode(soil);
  return { soil_name: soilName(soil), soil_code: code, classification: { system: "NEN5104", lithology: code, main: soil.main, admixtures: soil.admixtures.map((a) => ({ ...a })), qualifiers: [] } };
}

export interface PatternStyle { key: PatternKey; name: string; fill: string; ink: string }
export const PATTERNS: Record<PatternKey, PatternStyle> = {
  G: { key: "G", name: "Grind", fill: "#F0A64B", ink: "#7A4310" },
  Z: { key: "Z", name: "Zand", fill: "#FBE36B", ink: "#8A6A12" },
  L: { key: "L", name: "Leem", fill: "#D9C27A", ink: "#6B5A22" },
  K: { key: "K", name: "Klei", fill: "#7CC47F", ink: "#1F5D1F" },
  V: { key: "V", name: "Veen", fill: "#A9744F", ink: "#4A2A12" },
  S: { key: "S", name: "Silt", fill: "#DDDDE2", ink: "#55555E" },
  H: { key: "H", name: "Humus", fill: "#8E9A5B", ink: "#3C4420" },
  X: { key: "X", name: "Overig", fill: "#E4E4E7", ink: "#71717A" },
};

/** Breedte-aandeel van een bijmengstrook in de boorkolom, naar gradatie (zonder gradatie: als matig). */
export const ADMIXTURE_WIDTH: Record<number, number> = { 1: 0.14, 2: 0.22, 3: 0.3, 4: 0.38 };

export interface LayerSymbol {
  /** Stroken van links naar rechts; de eerste is de hoofdgrondsoort, de aandelen tellen op tot 1. */
  bands: Array<{ pattern: PatternKey; share: number }>;
}

/** Tekenwijze van een laag: de hoofdgrondsoort breed links, per toevoeging een smalle strook rechts. */
export function layerSymbol(soil: SoilClass): LayerSymbol {
  const extra = soil.admixtures.map((a) => ({
    pattern: ADMIXTURES.find((x) => x.letter === a.letter)!.pattern, share: ADMIXTURE_WIDTH[a.grade ?? 2] ?? ADMIXTURE_WIDTH[2],
  }));
  const total = extra.reduce((sum, band) => sum + band.share, 0);
  // Meerdere sterke toevoegingen mogen de hoofdgrondsoort niet verdringen: die houdt minstens 40%.
  const scale = total > 0.6 ? 0.6 / total : 1;
  const bands = extra.map((band) => ({ ...band, share: band.share * scale }));
  return { bands: [{ pattern: soil.main, share: 1 - bands.reduce((sum, band) => sum + band.share, 0) }, ...bands] };
}
