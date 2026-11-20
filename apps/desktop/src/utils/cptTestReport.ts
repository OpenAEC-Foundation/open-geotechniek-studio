// Gegevens voor het testrapport per sondering, in de rubrieken die NEN-EN-ISO 22476-1 voor de
// rapportage vraagt: algemeen, locatie, apparatuur, uitvoering, referentiemetingen en resultaten.
// Alles komt uit het bronbestand (GEF-kopregels of BRO-velden) en uit de projectgegevens. Wat daar
// niet staat, blijft leeg (`value: null`) en wordt in het rapport als ontbrekend getoond.
import type { Cpt, ProjectMeta } from "../types/cpt";
import { validationOf } from "../validation/report";
import { editReportGroup } from "../meetwaarden/logbook";

export const MISSING_TEXT = "niet in het bestand";
export const TEST_REPORT_STANDARD = "NEN-EN-ISO 22476-1";

export interface TestReportRow {
  label: string;
  /** `null` = niet in het bestand of het project. */
  value: string | null;
  /** Deel van de regel dat ontbreekt terwijl de rest er wel is (bijvoorbeeld het nulpunt na de proef). */
  missingPart?: string;
}
export interface TestReportGroup {
  title: string;
  rows: TestReportRow[];
}

interface Quantity { value: number | null; unit: string }

const filled = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
/** Getal zonder overbodige nullen, hooguit drie decimalen. */
export const fmt = (v: number, decimals = 3) => String(Number(v.toFixed(decimals)));
const nlDate = (iso?: string) => (iso && /^\d{4}-\d{1,2}-\d{1,2}/.test(iso) ? iso.slice(0, 10).split("-").reverse().join("-") : iso);
const withUnit = (q: Quantity | undefined, fallbackUnit = "", decimals = 3): string | null => {
  if (!q || q.value == null) return null;
  const unit = q.unit && q.unit !== "-" ? q.unit : fallbackUnit;
  return `${fmt(q.value, decimals)}${unit ? ` ${unit}` : ""}`;
};

/** De kopregels van een GEF, per sleutel; oudere snapshots hebben alleen de samengevoegde tekst. */
function gefHeaders(extra: Record<string, string>): Record<string, string[]> | null {
  try {
    const parsed = JSON.parse(extra["ogs:gef-headers"] ?? "null");
    if (parsed && typeof parsed === "object") return parsed as Record<string, string[]>;
  } catch { /* val terug op de samengevoegde kopregels */ }
  const keys = ["MEASUREMENTTEXT", "MEASUREMENTVAR", "COLUMNINFO"].filter((key) => filled(extra[key]));
  return keys.length ? Object.fromEntries(keys.map((key) => [key, extra[key].split(" | ")])) : null;
}

/** Splitst een GEF-regel op komma's; `\,` is een komma in de tekst zelf. */
const gefParts = (line: string) => line.split(/(?<!\\),/).map((part) => part.replace(/\\,/g, ",").trim());

interface Source {
  /** Meettekst van de GEF (nummer volgens de GEF-CPT-definitie). */
  text: (id: number) => string | undefined;
  /** Meetvariabele van de GEF. */
  variable: (id: number) => Quantity | undefined;
  /** Veld uit een BRO-bestand. */
  field: (name: string) => string | undefined;
  /** BRO-veld met eenheid. */
  measure: (name: string) => Quantity | undefined;
}

function sourceOf(cpt: Cpt): Source {
  const extra = cpt.metadata.extra ?? {};
  const headers = gefHeaders(extra);
  const texts = new Map<number, string>(), variables = new Map<number, Quantity>();
  for (const line of headers?.MEASUREMENTTEXT ?? []) {
    const [id, value] = gefParts(line);
    if (/^\d+$/.test(id) && filled(value) && !texts.has(Number(id))) texts.set(Number(id), value);
  }
  for (const line of headers?.MEASUREMENTVAR ?? []) {
    const [id, value, unit] = gefParts(line);
    const number = Number((value ?? "").replace(",", "."));
    if (/^\d+$/.test(id)) variables.set(Number(id), { value: filled(value) && Number.isFinite(number) ? number : null, unit: unit ?? "" });
  }
  // Zonder bewaarde kopregels: de meetvariabelen uit het validatierapport van de GEF.
  if (!variables.size) for (const [id, v] of Object.entries(validationOf(cpt)?.measurementVariables ?? {}))
    if (/^\d+$/.test(id)) variables.set(Number(id), { value: v.value, unit: v.unit ?? "" });
  const measurements = new Map((cpt.metadata.measurements ?? []).map((item) => [item.name, item]));
  return {
    text: (id) => texts.get(id),
    variable: (id) => variables.get(id),
    field: (name) => (headers ? undefined : filled(extra[name]) ? extra[name].trim() : undefined),
    measure: (name) => {
      const item = headers ? undefined : measurements.get(name);
      return item ? { value: item.value, unit: item.unit } : undefined;
    },
  };
}

/** Grondwaterstand uit het bestand, voor zover vastgelegd (GEF-meetvariabele 14 of het BRO-veld). */
export function groundwaterFromFile(cpt: Cpt): string | null {
  const s = sourceOf(cpt);
  return withUnit(s.variable(14), "m") ?? withUnit(s.measure("groundwaterLevel"), "m") ?? s.field("groundwaterLevel") ?? null;
}

/** De norm die het bestand zelf noemt, met de klasse als die apart is vastgelegd. */
export function standardFromFile(cpt: Cpt): string | null {
  const s = sourceOf(cpt);
  const standard = s.text(6) ?? s.field("cptStandard"), quality = s.field("qualityClass");
  if (!standard) return null;
  return quality && !/klasse/i.test(standard) ? `${standard}, ${/klasse/i.test(quality) ? quality : `klasse ${quality}`}` : standard;
}

function measuredQuantities(cpt: Cpt): string[] {
  const has = (key: "qc" | "fs" | "u2" | "inclination") => cpt.points.some((p) => p[key] != null);
  const parameter = (...keys: string[]) => cpt.points.some((p) => keys.some((key) => p.parameters?.[key] != null));
  return [
    has("qc") && "conusweerstand qc",
    has("fs") && "plaatselijke wrijving fs",
    parameter("5", "u1") && "waterspanning u1",
    has("u2") && "waterspanning u2",
    parameter("7", "u3") && "waterspanning u3",
    has("inclination") && "helling",
  ].filter(filled);
}

/** Nulpunt voor en na de proef, met het verschil als beide bekend zijn. */
function zeroRow(label: string, before: Quantity | undefined, after: Quantity | undefined, unit: string): TestReportRow {
  const b = withUnit(before, unit, 4), a = withUnit(after, unit, 4);
  if (!b && !a) return { label, value: null };
  if (b && a) {
    const drift = Number((after!.value! - before!.value!).toFixed(4)), u = (after!.unit && after!.unit !== "-" ? after!.unit : unit);
    return { label, value: `voor ${b}; na ${a}; verschil ${drift > 0 ? "+" : ""}${fmt(drift, 4)}${u ? ` ${u}` : ""}` };
  }
  return b ? { label, value: `voor ${b}`, missingPart: `na: ${MISSING_TEXT}` } : { label, value: `na ${a}`, missingPart: `voor: ${MISSING_TEXT}` };
}

/**
 * De regels van het testrapport voor één sondering.
 * Projectgegevens gaan voor op wat het bestand over opdrachtgever, project en locatie zegt.
 */
export function buildTestReport(cpt: Cpt, project: ProjectMeta): TestReportGroup[] {
  const meta = cpt.metadata, extra = meta.extra ?? {}, s = sourceOf(cpt);
  const validation = validationOf(cpt);
  const first = (...values: Array<string | null | undefined>) => values.find(filled)?.trim() ?? null;

  const date = nlDate(meta.date);
  const startTime = filled(extra.STARTTIME) ? gefParts(extra.STARTTIME).slice(0, 2).map((v) => v.padStart(2, "0")).join(":") : "";

  // Locatie: de positie staat alleen in RD als het bestand dat stelsel noemt; anders de ruwe opgave.
  const xyid = filled(extra.XYID) ? gefParts(extra.XYID) : null;
  const zid = filled(extra.ZID) ? gefParts(extra.ZID) : null;
  const coordinates = cpt.position
    ? `X ${cpt.position.x_rd.toFixed(2)} m; Y ${cpt.position.y_rd.toFixed(2)} m (RD, EPSG:28992)`
    : xyid && filled(xyid[1]) && filled(xyid[2]) ? `${xyid[1]}; ${xyid[2]} (stelselcode ${xyid[0]} in het bestand)`
    : filled(extra["deliveredLocation position"]) ? `${extra["deliveredLocation position"]} (${extra["deliveredLocation CRS"] ?? "stelsel onbekend"})` : null;
  const ground = meta.ground_level_nap ?? cpt.position?.z_nap;
  const groundLevel = ground != null ? `NAP ${ground >= 0 ? "+" : ""}${ground.toFixed(2)} m`
    : zid && filled(zid[1]) ? `${zid[1]} m (referentiecode ${zid[0]} in het bestand)` : null;

  const predrilled = meta.predrilled_depth_m ?? meta.pre_excavated_depth_m;
  const maxDepth = cpt.points.reduce((value, p) => Math.max(value, p.depth), 0);
  const finalDepth = withUnit(s.variable(16), "m") ?? withUnit(s.measure("finalDepth"), "m")
    ?? (cpt.points.length ? `${maxDepth.toFixed(2)} m (laatste meetpunt)` : null);
  const stopCode = s.variable(17)?.value;
  const methodCode = s.variable(12)?.value;

  const measured = measuredQuantities(cpt);
  const steepest = cpt.points.reduce<{ angle: number; depth: number } | null>((best, p) =>
    p.inclination != null && (!best || Math.abs(p.inclination) > best.angle) ? { angle: Math.abs(p.inclination), depth: p.depth } : best, null);
  const depthMethod = ({
    "corrected-depth": "gecorrigeerde diepte uit het bestand",
    "inclination-corrected": "sondeerlengte, gecorrigeerd voor de gemeten helling",
    "penetration-length": "sondeerlengte, niet gecorrigeerd voor helling",
    mixed: "wisselend per meetpunt (zie validatie)",
  } as Record<string, string>)[validation?.depthMethod ?? ""] ?? null;

  const zero: TestReportRow[] = [
    zeroRow("Conusweerstand", s.variable(20) ?? s.measure("coneResistanceBefore"), s.variable(21) ?? s.measure("coneResistanceAfter"), "MPa"),
    zeroRow("Plaatselijke wrijving", s.variable(22) ?? s.measure("localFrictionBefore"), s.variable(23) ?? s.measure("localFrictionAfter"), "MPa"),
  ];
  const optionalZero: Array<[string, boolean, Quantity | undefined, Quantity | undefined, string]> = [
    ["Waterspanning u1", measured.includes("waterspanning u1"), s.variable(24) ?? s.measure("porePressureU1Before"), s.variable(25) ?? s.measure("porePressureU1After"), "MPa"],
    ["Waterspanning u2", measured.includes("waterspanning u2"), s.variable(26) ?? s.measure("porePressureU2Before"), s.variable(27) ?? s.measure("porePressureU2After"), "MPa"],
    ["Waterspanning u3", measured.includes("waterspanning u3"), s.variable(28) ?? s.measure("porePressureU3Before"), s.variable(29) ?? s.measure("porePressureU3After"), "MPa"],
    ["Helling", measured.includes("helling"), s.variable(30) ?? s.measure("inclinationResultantBefore"), s.variable(31) ?? s.measure("inclinationResultantAfter"), "graden"],
    ["Helling noord-zuid", false, s.variable(32) ?? s.measure("inclinationNSBefore"), s.variable(33) ?? s.measure("inclinationNSAfter"), "graden"],
    ["Helling oost-west", false, s.variable(34) ?? s.measure("inclinationEWBefore"), s.variable(35) ?? s.measure("inclinationEWAfter"), "graden"],
  ];
  // Een nulpunt hoort erbij als het kanaal gemeten is of als het bestand er een waarde voor geeft.
  for (const [label, isMeasured, before, after, unit] of optionalZero)
    if (isMeasured || before?.value != null || after?.value != null) zero.push(zeroRow(label, before, after, unit));

  return [
    { title: "Algemeen", rows: [
      { label: "Norm en klasse", value: standardFromFile(cpt) },
      { label: "Sondering", value: cpt.id },
      // Een BRO-bestand geeft de rapportdatum van het onderzoek, niet het tijdstip van de proef.
      { label: "Datum sondering", value: date ? `${date}${startTime ? `, ${startTime} uur` : ""}${filled(extra.researchReportDate) || validation?.format === "BRO-CPT" ? " (rapportdatum)" : ""}` : null },
      { label: "Uitvoerend bedrijf", value: first(meta.equipment, filled(extra.COMPANYID) ? gefParts(extra.COMPANYID)[0] : null) },
      { label: "Opdrachtgever", value: first(project.client, s.text(1)) },
      { label: "Project", value: first(project.title, meta.project_name, s.text(2)) },
      { label: "Projectnummer", value: first(project.project_number, meta.project_number) },
      { label: "Locatie project", value: first(project.location, s.text(3)) },
      { label: "Bronbestand", value: first(meta.source_file) },
    ] },
    { title: "Locatie", rows: [
      { label: "Coördinaten", value: coordinates },
      { label: "Maaiveldhoogte", value: groundLevel },
      { label: "Referentievlak diepte", value: first(s.text(9), s.field("localVerticalReferencePoint")) },
    ] },
    { title: "Apparatuur", rows: [
      { label: "Conustype", value: first(s.text(4), s.field("conePenetrometerType")) },
      { label: "Oppervlak conuspunt", value: withUnit(s.variable(1)) ?? withUnit(s.measure("coneSurfaceArea")) },
      { label: "Oppervlak wrijvingsmantel", value: withUnit(s.variable(2)) ?? withUnit(s.measure("frictionSleeveSurfaceArea")) },
      { label: "Netto oppervlakteverhouding conus (a)", value: withUnit(s.variable(3)) ?? first(s.field("coneSurfaceQuotient")) },
      { label: "Netto oppervlakteverhouding mantel (b)", value: withUnit(s.variable(4)) ?? first(s.field("frictionSleeveSurfaceQuotient")) },
      { label: "Afstand conus tot midden mantel", value: withUnit(s.variable(5)) ?? withUnit(s.measure("frictionSleeveDistance")) },
      { label: "Sondeerapparaat of meetsysteem", value: first(s.text(5)) },
      { label: "Laatste kalibratie", value: first(nlDate(s.field("calibrationDate"))) },
    ] },
    { title: "Uitvoering", rows: [
      { label: "Sondeermethode", value: first(s.field("cptMethod"), methodCode != null ? `code ${fmt(methodCode)} (GEF-meetvariabele 12)` : null) },
      { label: "Voorboordiepte", value: predrilled != null ? `${predrilled.toFixed(2)} m` : null },
      { label: "Einddiepte", value: finalDepth },
      { label: "Stopcriterium", value: first(s.field("stopCriterion"), stopCode != null ? `code ${fmt(stopCode)} (GEF-meetvariabele 17)` : null) },
      { label: "Grondwaterstand", value: groundwaterFromFile(cpt) },
      { label: "Bijzonderheden", value: first(s.text(11), s.text(22)) },
    ] },
    { title: "Referentiemetingen (nulpunten voor en na de proef)", rows: zero },
    { title: "Resultaten", rows: [
      { label: "Gemeten grootheden", value: measured.length ? measured.join(", ") : null },
      { label: "Aantal meetpunten", value: cpt.points.length ? String(cpt.points.length) : null },
      { label: "Dieptebereik", value: cpt.points.length ? `${cpt.points.reduce((value, p) => Math.min(value, p.depth), Infinity).toFixed(2)} tot ${maxDepth.toFixed(2)} m` : null },
      { label: "Dieptebepaling", value: depthMethod },
      { label: "Grootste helling", value: steepest ? `${fmt(steepest.angle, 1)} graden op ${steepest.depth.toFixed(2)} m` : null },
    ] },
    // Nabewerkte meetwaarden: het logboek van de bewerkingen, alleen als die er zijn.
    ...[editReportGroup(cpt)].filter((group) => group !== null),
  ];
}
