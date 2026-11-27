// Sterktetoets van de paal als constructie-element op de axiale rekenbelasting.
//
// Belasting: N_Ed;max = N_Ed + F_nk;d. De negatieve kleef loopt op tot de
// onderkant van het negatieve-kleeftraject; daar is de normaalkracht het
// grootst. Van paalkop tot dat niveau is N_Ed;max aangehouden (veilige kant),
// daaronder neemt de kracht af door positieve schachtwrijving en is niet getoetst.
//
// Staal, NEN-EN 1993-1-1 (buis):
//   doorsnedeklasse, tabel 5.2: D/t ≤ 50 ε², 70 ε², 90 ε² (klasse 1, 2, 3), ε = √(235 / f_y)
//   N_c,Rd = A · f_y / γ_M0                                              art. 6.2.4
//   klasse 4 valt buiten de toetsing; knik (art. 6.3) is niet getoetst: de
//   module kent geen vrije of slap gesteunde lengte.
// Hout, NEN-EN 1995-1-1:
//   σ_c,0,d = N_Ed;max / A ≤ f_c,0,d                                     art. 6.1.4, formule (6.2)
//   f_c,0,d = k_mod · f_c,0,k / γ_M                                      art. 2.4.1, formule (2.14)
//   k_mod = 0,50 (gezaagd hout, klimaatklasse 3, blijvend; tabel 3.1), γ_M = 1,3 (tabel 2.3): invoer
//   f_c,0,k per sterkteklasse: NEN-EN 338:2016, tabel 1 (naaldhout) en tabel 3 (loofhout)
//   sterkteklasse uit de houtsoort en sorteerklasse waar die vastligt: parts/timber-species.ts
// Beton, NEN-EN 1992-1-1:
//   N_Rd = A_c · f_cd, f_cd = α_cc · f_ck / γ_c                           art. 6.1, 3.1.6
//   wapening niet meegerekend (zit niet in de invoer).
//
// De doorsnedegrootheden van de buis, de sterkteklassen van staal en beton en
// de materiaalfactoren komen uit de materiaaltoetsing van de horizontaal
// belaste paal. Alle formules en tabelwaarden zijn uit kennis van de normen
// overgenomen; welke niet tegen de normtekst zijn gelegd staat in NUMERIEKE-VERIFICATIE.md.
import { CONCRETE_CLASSES, GAMMA_C, GAMMA_M0, STEEL_GRADES, designConcrete } from "../../laterally-loaded-pile/materials";
import { tubeProps } from "../../laterally-loaded-pile/material-steel";
import { check, noCheck, type CheckRow, type Note } from "../../laterally-loaded-pile/material-types";
import type { PileInput, PileTypeSpec } from "../types";
import { pileGeometry, shaftDiameterAtNap, woodTopNap } from "./geometry";
import { TIMBER_SPECIES_SOURCE, resolveTimber } from "./timber-species";

export type { CheckRow, Note } from "../../laterally-loaded-pile/material-types";

/** Karakteristieke druksterkte evenwijdig aan de vezel f_c,0,k [MPa], NEN-EN 338:2016. */
export const TIMBER_CLASSES: ReadonlyArray<{ id: string; fc0kMpa: number }> = [
  { id: "C14", fc0kMpa: 16 }, { id: "C16", fc0kMpa: 17 }, { id: "C18", fc0kMpa: 18 }, { id: "C20", fc0kMpa: 19 },
  { id: "C22", fc0kMpa: 20 }, { id: "C24", fc0kMpa: 21 }, { id: "C27", fc0kMpa: 22 }, { id: "C30", fc0kMpa: 24 },
  { id: "D24", fc0kMpa: 21 }, { id: "D30", fc0kMpa: 24 }, { id: "D40", fc0kMpa: 27 }, { id: "D50", fc0kMpa: 30 },
  { id: "D60", fc0kMpa: 33 }, { id: "D70", fc0kMpa: 36 },
];
export const STRENGTH_DEFAULTS = { steelGrade: "S235", timberClass: "C18", kMod: 0.5, gammaMTimber: 1.3, concreteClass: "C35/45", concreteClassInSitu: "C20/25" } as const;
export { STEEL_GRADES, CONCRETE_CLASSES };

export interface StrengthResult {
  /** N_Ed + F_nk;d [kN]. */
  nEdMaxKn: number;
  standard: string;
  rows: CheckRow[];
  /** Hoogste u.c. van de toetsen die meetellen. */
  governing: { id: string; label: string; uc: number } | null;
  /** null: geen toets met een oordeel. */
  ok: boolean | null;
  /** Een deel valt buiten de toetsing (doorsnedeklasse 4): geen oordeel "voldoet". */
  outside: boolean;
  notes: Note[];
}

const EN2 = "NEN-EN 1992-1-1", EN3 = "NEN-EN 1993-1-1", EN5 = "NEN-EN 1995-1-1";
const positive = (v: number | undefined, fallback: number) => (v !== undefined && Number.isFinite(v) && v > 0 ? v : fallback);

/** In de grond gevormde betonpaal: het programma vraagt daar een eigen EA voor. */
const inSitu = (type: PileTypeSpec) => type.material === "concrete" && !!type.requiresEA;

export function defaultConcreteClass(type: PileTypeSpec): string {
  return inSitu(type) ? STRENGTH_DEFAULTS.concreteClassInSitu : STRENGTH_DEFAULTS.concreteClass;
}

function concreteRow(id: string, label: string, areaMm2: number, classId: string, nEdKn: number, zM: number | undefined, note?: Note): CheckRow {
  const fck = CONCRETE_CLASSES.find((c) => c.id === classId)?.fckMpa;
  if (fck === undefined) return noCheck(id, label, `${EN2} art. 6.1`, "na", { key: "concreteClassUnknown", nl: "Onbekende betonsterkteklasse {{cls}}.", vars: { cls: classId } });
  const fcd = designConcrete(fck), nRd = areaMm2 * fcd / 1000;
  return check(id, label, `${EN2} art. 6.1, 3.1.6`, { s: "N_Ed;max", v: nEdKn, u: "kN" }, { s: "N_Rd", v: nRd, u: "kN" }, [
    { s: "A_c", v: areaMm2, u: "mm²", d: 0 }, { s: "f_ck", v: fck, u: "MPa", d: 0 },
    { s: "f_cd", f: `α_cc f_ck / γ_c, γ_c = ${String(GAMMA_C).replace(".", ",")}`, v: fcd, u: "MPa", d: 2 },
    { s: "N_Rd", f: "A_c f_cd", v: nRd, u: "kN" },
  ], { ...(zM === undefined ? {} : { zM }), ...(note ? { note } : {}) });
}

/**
 * Toetst de paal op N_Ed;max = N_Ed + F_nk;d. `fnkDKn` is de rekenwaarde van
 * de negatieve kleef uit de draagvermogenberekening.
 */
export function strengthCheck(input: PileInput, type: PileTypeSpec, fnkDKn: number): StrengthResult {
  const s = input.strengthCheck ?? { enabled: true };
  const nEd = input.nEd + Math.max(0, fnkDKn);
  const material = type.material ?? "steel", rows: CheckRow[] = [], notes: Note[] = [];
  const standards: string[] = [];
  const loadSteps = [{ s: "N_Ed;max", f: "N_Ed + F_nk;d", v: nEd, u: "kN" }];
  // Grootste normaalkracht: op de onderkant van de negatieve kleef; zonder negatieve kleef op de kop.
  const governingNap = fnkDKn > 0 ? Math.max(input.pileToeNap, Math.min(input.pileTopNap, input.negKleefBottomNap)) : input.pileTopNap;
  notes.push({ key: "load", nl: "N_Ed;max = N_Ed + F_nk;d, aangehouden van de paalkop tot de onderkant van de negatieve kleef. Daaronder neemt de normaalkracht af door positieve schachtwrijving; dat deel is niet getoetst." });

  if (material === "steel") {
    standards.push(`${EN3} met Nederlandse bijlage`);
    if (type.requiresEA) {
      rows.push(noCheck("steelAxial", "Normaalkracht staal", `${EN3} art. 6.2.4`, "na", { key: "steelNoSection", nl: "Niet getoetst: de stalen doorsnede (kernbuis, wanddikte) zit voor dit paalsysteem niet in de invoer." }));
    } else {
      const grade = STEEL_GRADES.find((g) => g.id === (s.steelGrade ?? STRENGTH_DEFAULTS.steelGrade)) ?? STEEL_GRADES[0];
      const p = tubeProps(input.diameterMm, input.wallThicknessMm, grade.fyMpa);
      const classRow = check("steelClass", "Doorsnedeklasse buis", `${EN3} tabel 5.2`, { s: "D/t", v: p.dt, u: "", d: 1 }, { s: "90 ε²", v: 90 * p.eps2, u: "", d: 1 }, [
        { s: "ε", f: "√(235 / f_y)", v: Math.sqrt(p.eps2), u: "", d: 3 }, { s: "50 ε²", v: 50 * p.eps2, u: "", d: 1 }, { s: "70 ε²", v: 70 * p.eps2, u: "", d: 1 }, { s: "90 ε²", v: 90 * p.eps2, u: "", d: 1 }]);
      if (p.cls === 4) {
        rows.push({ ...classRow, status: "outside", note: { key: "class4", nl: "Doorsnedeklasse 4: lokale plooi is maatgevend. Dat valt buiten deze toetsing (NEN-EN 1993-1-6); de weerstand is niet berekend." } });
        rows.push(noCheck("steelAxial", "Normaalkracht stalen buis", `${EN3} art. 6.2.4`, "outside", { key: "class4Short", nl: "Valt buiten deze toetsing (doorsnedeklasse 4)." }));
      } else {
        // De grens D/t is een voorwaarde, geen benutting: de rij telt niet mee in de maatgevende u.c.
        rows.push({ ...classRow, status: "info", note: { key: "classIs", nl: "Doorsnedeklasse {{cls}}.", vars: { cls: p.cls } } });
        rows.push(check("steelAxial", "Normaalkracht stalen buis", `${EN3} art. 6.2.4`, { s: "N_Ed;max", v: nEd, u: "kN" }, { s: "N_c,Rd", v: p.nRdKn, u: "kN" }, [
          ...loadSteps, { s: "A", f: "π (D² − d²) / 4", v: p.area, u: "mm²", d: 0 }, { s: "f_y", v: grade.fyMpa, u: "MPa", d: 0 },
          { s: "N_c,Rd", f: `A f_y / γ_M0, γ_M0 = ${String(GAMMA_M0).replace(".", ",")}`, v: p.nRdKn, u: "kN" }], { zM: input.pileTopNap - governingNap }));
      }
      notes.push({ key: "steel", nl: "Staal: alleen de buis met de ingevoerde wanddikte en f_y voor t ≤ 40 mm; een betonvulling is niet meegerekend. Niet getoetst: knik (art. 6.3; de module kent geen vrije of slap gesteunde lengte), corrosie (vul de restwanddikte in), lassen en koppelingen, en de heispanningen." });
    }
  }

  if (material === "wood") {
    standards.push(`${EN5} met Nederlandse bijlage`);
    // Houtsoort met een vaste toewijzing: die bepaalt de klasse; anders de gekozen klasse of eigen waarde.
    const timber = resolveTimber(input.timberSpecies);
    const fixed = timber?.grade ? TIMBER_CLASSES.find((c) => c.id === timber.grade!.strengthClass) : undefined;
    const cls = fixed ?? TIMBER_CLASSES.find((c) => c.id === (s.timberClass ?? STRENGTH_DEFAULTS.timberClass)) ?? TIMBER_CLASSES[2];
    const own = !fixed && s.timberFc0kMpa !== undefined && Number.isFinite(s.timberFc0kMpa) && s.timberFc0kMpa > 0;
    if (timber) {
      const species = `${timber.species.name} (${timber.species.botanical})`;
      notes.push(fixed
        ? { key: "timberSpecies", nl: "Houtsoort {{species}}, sorteerklasse {{grade}} → {{cls}} volgens {{source}}. De houtsoort bepaalt alleen de sterkteklasse; paalklassefactoren en draagvermogen volgen uit het paaltype.",
          vars: { species, grade: timber.grade!.label, cls: fixed.id, source: TIMBER_SPECIES_SOURCE } }
        : { key: "timberSpeciesOwn", nl: "Houtsoort {{species}}: de bron geeft geen eenduidige sterkteklasse; de klasse is door de gebruiker gekozen.", vars: { species } });
    }
    const fc0k = own ? s.timberFc0kMpa! : cls.fc0kMpa;
    const kMod = positive(s.kMod, STRENGTH_DEFAULTS.kMod), gammaM = positive(s.gammaMTimber, STRENGTH_DEFAULTS.gammaMTimber);
    const fc0d = kMod * fc0k / gammaM, top = woodTopNap(input);
    const section = (nap: number) => pileGeometry(shaftDiameterAtNap(input, nap), type.isCircular, input.sideBMm).areaMm2;
    const timberRow = (id: string, label: string, nap: number, extra: Partial<CheckRow>) => {
      const area = section(nap), sigma = nEd * 1000 / area;
      return check(id, label, `${EN5} art. 6.1.4, 2.4.1`, { s: "σ_c,0,d", v: sigma, u: "MPa", d: 2 }, { s: "f_c,0,d", v: fc0d, u: "MPa", d: 2 }, [
        ...loadSteps, { s: "A", v: area, u: "mm²", d: 0 }, { s: "σ_c,0,d", f: "N_Ed;max / A", v: sigma, u: "MPa", d: 2 },
        { s: "f_c,0,k", v: fc0k, u: "MPa", d: 1 }, { s: "k_mod", v: kMod, u: "", d: 2 }, { s: "γ_M", v: gammaM, u: "", d: 2 },
        { s: "f_c,0,d", f: "k_mod f_c,0,k / γ_M", v: fc0d, u: "MPa", d: 2 }], { zM: input.pileTopNap - nap, ...extra });
    };
    const woodNap = Math.min(top, governingNap);
    rows.push(timberRow("timberAxial", "Hout: druk evenwijdig aan de vezel", woodNap, {}));
    if (input.timberTaper && shaftDiameterAtNap(input, input.pileToeNap) < shaftDiameterAtNap(input, woodNap) - 1e-9) {
      rows.push(timberRow("timberToe", "Hout: kleinste doorsnede bij de punt", input.pileToeNap, { status: "info",
        note: { key: "timberToe", nl: "Ter informatie: bovengrens met de volle N_Ed;max op de puntdoorsnede. De positieve schachtwrijving boven de punt is niet afgetrokken; de werkelijke kracht bij de punt is kleiner." } }));
    }
    notes.push({ key: "timber", nl: "Hout: sterkteklasse {{cls}} met f_c,0,k = {{fc}} MPa (NEN-EN 338); k_mod en γ_M zijn invoer, standaard voor permanent nat hout en blijvende belasting. Niet getoetst: knik (art. 6.3.2), de las met een opzetter, aantasting van het hout en de heispanningen.",
      vars: { cls: own ? "eigen waarde" : cls.id, fc: String(fc0k).replace(".", ",") } });
  }

  const ext = input.concreteExtension;
  if (material === "concrete" || ext) {
    standards.push(`${EN2} met Nederlandse bijlage`);
    const classId = s.concreteClass ?? defaultConcreteClass(type);
    if (ext) rows.push(concreteRow("extensionAxial", "Betonopzetter: normaalkracht", pileGeometry(ext.sizeMm, ext.isCircular).areaMm2, classId, nEd, input.pileTopNap - Math.max(ext.jointNap, governingNap)));
    else rows.push(concreteRow("concreteAxial", "Normaalkracht betondoorsnede", pileGeometry(input.diameterMm, type.isCircular).areaMm2, classId, nEd, input.pileTopNap - governingNap));
    notes.push({ key: "concrete", nl: "Beton: N_Rd = A_c · f_cd van de schachtdoorsnede, zonder wapening (die zit niet in de invoer). Niet getoetst: de minimale excentriciteit (art. 6.1 (4)), knik, de wapening en de heispanningen." });
    if (!ext && inSitu(type)) notes.push({ key: "concreteInSitu", nl: "In de grond gevormde paal: de verkleinde rekendiameter (art. 2.3.4.2) en de verhoging van γ_c (art. 2.4.2.5) voor palen zonder blijvende buis zijn niet toegepast; reken de weerstand daarvoor zelf om." });
  }

  const counted = rows.filter((r) => (r.status === "ok" || r.status === "fail") && r.uc !== null);
  const top = counted.reduce<CheckRow | null>((a, r) => (!a || r.uc! > a.uc! ? r : a), null);
  const outside = rows.some((r) => r.status === "outside");
  return {
    nEdMaxKn: nEd, standard: standards.join("; "), rows, notes, outside,
    governing: top ? { id: top.id, label: top.label, uc: top.uc! } : null,
    ok: outside ? false : counted.length ? counted.every((r) => r.status === "ok") : null,
  };
}
