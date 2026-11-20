// Volledigheidscontrole vóór de BRO-export: wat volgens catalogus en schema verplicht is en
// ontbreekt of niet klopt. Zie broCptSpec.ts voor de versie van de specificatie.
import type { Cpt } from "../types/cpt";
import { validationOf } from "../validation/report";
import { broCptTable, type BroCptTable } from "./broCptData";
import { CLASSES_BY_STANDARD, CODE_LISTS, COLUMN_INDEX, RESULT_COLUMNS, ZERO_LOAD_PAIRS, type CodeListName } from "./broCptSpec";
import type { BroCptSupplement } from "./broCptSupplement";

export interface BroIssue {
  /** Veld van de aanvullingen, of "position", "offset", "data" voor de sondering zelf. */
  field: string;
  message: string;
  /** "error" houdt de export tegen; "warning" is een aandachtspunt. */
  severity: "error" | "warning";
}

export interface BroCheckOptions {
  /** Vandaag als jjjj-mm-dd; met deze datum wordt gecontroleerd dat datums niet in de toekomst liggen. */
  today?: string;
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** xs:dateTime met verplichte tijdzone (de catalogus vraagt een tijdstip, geen lokale kloktijd). */
export const DATE_TIME = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d+)?(Z|[+-](0\d|1[0-4]):[0-5]\d)$/;
const KVK = /^\d{8}$/;

function validDate(text: string): boolean {
  const m = DATE.exec(text);
  if (!m) return false;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return date.getUTCFullYear() === Number(m[1]) && date.getUTCMonth() === Number(m[2]) - 1 && date.getUTCDate() === Number(m[3]);
}

/** Waarden buiten het waardebereik van de catalogus, per kolom. */
export function outOfRange(table: BroCptTable): { column: number; count: number; firstRow: number }[] {
  return RESULT_COLUMNS.flatMap((c, column) => {
    const rows = table.rows.flatMap((row, index) => (row[column] != null && (row[column]! < c.min || row[column]! > c.max) ? [index] : []));
    return rows.length ? [{ column, count: rows.length, firstRow: rows[0] }] : [];
  });
}

export function checkBroCpt(cpt: Cpt, s: BroCptSupplement, options: BroCheckOptions = {}): BroIssue[] {
  const issues: BroIssue[] = [];
  const error = (field: string, message: string) => issues.push({ field, message, severity: "error" });
  const warning = (field: string, message: string) => issues.push({ field, message, severity: "warning" });

  const text = (field: keyof BroCptSupplement, label: string, max = 200) => {
    const value = s[field];
    if (typeof value !== "string" || !value.trim()) return error(field, `${label} ontbreekt.`), false;
    if (value.length > max) return error(field, `${label} is langer dan ${max} tekens.`), false;
    return true;
  };
  const code = (field: keyof BroCptSupplement & CodeListName, label: string) => {
    const value = s[field];
    if (!value) return error(field, `${label} ontbreekt.`), false;
    if (!CODE_LISTS[field].some((o) => o.value === value)) return error(field, `${label}: "${value}" is geen waarde die onder IMBRO is toegestaan.`), false;
    return true;
  };
  const kvk = (field: keyof BroCptSupplement, label: string, required: boolean) => {
    const value = s[field];
    if (!value) { if (required) error(field, `${label} ontbreekt.`); return; }
    if (typeof value !== "string" || !KVK.test(value)) error(field, `${label}: een KvK-nummer heeft acht cijfers.`);
  };
  const date = (field: keyof BroCptSupplement, label: string, notAfterReport = true): string | undefined => {
    const value = s[field];
    if (typeof value !== "string" || !value) return error(field, `${label} ontbreekt.`), undefined;
    if (!validDate(value)) return error(field, `${label}: "${value}" is geen geldige datum (jjjj-mm-dd).`), undefined;
    if (value < "1930-01-01") error(field, `${label} ligt vóór 1 januari 1930.`);
    if (options.today && value > options.today) error(field, `${label} ligt in de toekomst.`);
    if (notAfterReport && reportDate && value > reportDate) error(field, `${label} ligt na de rapportagedatum van het onderzoek.`);
    return value;
  };
  const measure = (field: keyof BroCptSupplement, label: string, min: number, max: number, required: boolean) => {
    const value = s[field];
    if (value === undefined || value === null || value === "") { if (required) error(field, `${label} ontbreekt.`); return; }
    if (typeof value !== "number" || !Number.isFinite(value)) return void error(field, `${label} is geen getal.`);
    if (value < min || value > max) error(field, `${label} moet tussen ${min} en ${max} liggen.`);
  };
  const yesNo = (field: keyof BroCptSupplement, label: string) => {
    if (s[field] !== "ja" && s[field] !== "nee") error(field, `${label}: kies ja of nee.`);
  };

  // ── Verzoek en onderzoek (catalogus 6.3.1) ─────────────────────────────
  text("requestReference", "Kenmerk van het verzoek");
  // Het schema laat de bronhouder weg toe als de dataleverancier zelf bronhouder is; meegeven mag
  // altijd, en een sondeerbedrijf levert vrijwel altijd namens een bronhouder. Daarom hier verplicht.
  kvk("deliveryAccountableParty", "KvK-nummer van de bronhouder", true);
  text("objectIdAccountableParty", "Object-ID van de bronhouder");
  code("deliveryContext", "Kader aanlevering");
  code("surveyPurpose", "Kader inwinning");
  let reportDate: string | undefined;
  reportDate = date("researchReportDate", "Rapportagedatum onderzoek", false);
  const standardOk = code("cptStandard", "Sondeernorm");
  if (code("qualityClass", "Kwaliteitsklasse") && standardOk && !CLASSES_BY_STANDARD[s.cptStandard!]?.includes(s.qualityClass!))
    error("qualityClass", `Kwaliteitsklasse ${s.qualityClass} hoort niet bij sondeernorm ${s.cptStandard} (toegestaan: ${CLASSES_BY_STANDARD[s.cptStandard!]?.join(", ")}).`);
  kvk("researchOperator", "KvK-nummer van de uitvoerder van het onderzoek", false);

  // ── Locatie in RD en hoogte in NAP (catalogus 6.3.3 en 6.3.4) ──────────
  const position = cpt.position;
  if (!position || !Number.isFinite(position.x_rd) || !Number.isFinite(position.y_rd) || (!position.x_rd && !position.y_rd))
    error("position", "De RD-coördinaten van de sondering ontbreken (vul ze aan met Coördinaten inlezen).");
  // Geldigheidsgebied van RD New (EPSG:28992); een aannemelijkheidscontrole, geen regel uit de catalogus.
  else if (position.x_rd < -7000 || position.x_rd > 300000 || position.y_rd < 289000 || position.y_rd > 629000)
    warning("position", `De coördinaten (${position.x_rd}; ${position.y_rd}) liggen buiten het gebied waar RD geldt.`);
  date("horizontalPositioningDate", "Datum locatiebepaling");
  code("horizontalPositioningMethod", "Methode locatiebepaling");
  kvk("horizontalPositioningOperator", "KvK-nummer van de uitvoerder van de locatiebepaling", false);
  const offset = position?.z_nap ?? cpt.metadata.ground_level_nap;
  if (typeof offset !== "number" || !Number.isFinite(offset)) error("offset", "De hoogte van het maaiveld of de waterbodem ten opzichte van NAP ontbreekt.");
  if (code("localVerticalReferencePoint", "Lokaal verticaal referentiepunt")) {
    if (s.localVerticalReferencePoint === "waterbodem") measure("waterDepth", "Waterdiepte (m)", 0, 100, true);
    else if (s.waterDepth !== undefined) error("waterDepth", "Waterdiepte hoort alleen bij het referentiepunt waterbodem.");
  }
  date("verticalPositioningDate", "Datum verticale positiebepaling");
  code("verticalPositioningMethod", "Methode verticale positiebepaling");
  kvk("verticalPositioningOperator", "KvK-nummer van de uitvoerder van de verticale positiebepaling", false);

  // ── Sondeonderzoek (catalogus 6.3.6 t/m 6.3.8) ─────────────────────────
  date("finalProcessingDate", "Datum laatste bewerking");
  code("cptMethod", "Sondeermethode");
  code("stopCriterion", "Stopcriterium");
  measure("sensorAzimuth", "Sensorazimuth (°)", 0, 360, false);
  measure("predrilledDepth", "Voorgeboord tot (m)", 0, 200, true);
  if (!s.startTime) error("startTime", "Starttijd van de meting ontbreekt.");
  else if (!DATE_TIME.test(s.startTime) || !validDate(s.startTime.slice(0, 10))) error("startTime", `Starttijd van de meting: "${s.startTime}" is geen tijdstip met tijdzone (jjjj-mm-ddTuu:mm:ss+01:00).`);
  else {
    if (s.startTime.slice(0, 10) < "1930-01-01") error("startTime", "Starttijd van de meting ligt vóór 1 januari 1930.");
    // Vergelijking op kalenderdatum in de opgegeven tijdzone.
    if (reportDate && s.startTime.slice(0, 10) > reportDate) error("startTime", "Starttijd van de meting ligt na de rapportagedatum van het onderzoek.");
  }
  yesNo("interruptionProcessingPerformed", "Bewerking onderbrekingen uitgevoerd");
  yesNo("expertCorrectionPerformed", "Expertcorrectie uitgevoerd");
  yesNo("signalProcessingPerformed", "Signaalbewerking uitgevoerd");

  // ── Meetreeks (catalogus 6.3.11 en 6.3.13) ─────────────────────────────
  const table = broCptTable(cpt);
  const { length, qc, fs } = COLUMN_INDEX;
  const report = validationOf(cpt);
  if (report?.diagnostics.some((d) => d.severity === "error") || report?.omittedRecords)
    error("data", "Het bronbestand heeft leesfouten of weggelaten records (zie Validatie); herstel die eerst.");
  if (!cpt.points.length) error("data", "De sondering heeft geen meetpunten.");
  else {
    const lengths = table.rows.map((r) => r[length]);
    if (lengths.some((v) => v == null)) error("data", "De sondeertrajectlengte ontbreekt bij een of meer meetpunten; die is in de BRO verplicht.");
    else if (lengths.some((v, i) => i > 0 && v! < lengths[i - 1]!)) error("data", "De sondeertrajectlengte loopt niet overal op; de meetreeks moet oplopend zijn.");
    if (!table.determined[qc]) error("data", "De conusweerstand ontbreekt; die is in de BRO verplicht.");
    const bad = outOfRange(table);
    for (const item of bad) {
      const c = RESULT_COLUMNS[item.column], at = table.rows[item.firstRow][length];
      const what = `${item.count} waarde(n) van ${c.label} buiten het BRO-bereik ${c.min} tot ${c.max} ${c.unit}${at != null ? ` (eerste op ${at} m)` : ""}`;
      if (item.column === length) error("data", `${what}.`);
      else if (s.voidOutOfRange) warning("data", `${what}: weggeschreven als geen waarde.`);
      else error("data", `${what}. Corrigeer de bron of kies ervoor deze waarden als "geen waarde" weg te schrijven.`);
    }
    const final = Math.max(...cpt.points.map((p) => p.depth));
    if (!(final >= 0 && final <= 200)) error("data", `De einddiepte (${final} m) moet tussen 0 en 200 m liggen.`);
  }
  for (const note of table.notes) warning("data", note);
  if (cpt.metadata.extra?.["ogs:bro-outliers"]) warning("data", "Records buiten de oplopende dieptereeks zijn uitgesloten en worden niet weggeschreven (zie Validatie).");
  if (cpt.metadata.quality_regime === "IMBRO/A") warning("data", "De bron is onder IMBRO/A geregistreerd; het verzoek wordt onder IMBRO geschreven en moet aan alle IMBRO-eisen voldoen.");
  if (cpt.metadata.extra?.dissipationTestPerformed === "ja" || /<(?:[\w.-]+:)?dissipationTest\b/.test(cpt.metadata.extra?.["ogs:source-bro-xml"] ?? ""))
    error("data", "Bij deze sondering zijn dissipatietests uitgevoerd. Die worden niet weggeschreven, en een verzoek zonder die tests zou onjuist zijn.");

  // ── Sondeerapparaat en nulmeting (catalogus 6.3.9 en 6.3.10) ───────────
  text("coneDescription", "Omschrijving van het sondeerapparaat");
  text("conePenetrometerType", "Conustype");
  measure("coneSurfaceArea", "Oppervlakte conuspunt (mm²)", 25, 2000, true);
  measure("coneDiameter", "Conusdiameter (mm)", 8, 51, false);
  measure("coneSurfaceQuotient", "Oppervlaktequotiënt conuspunt", -Infinity, Infinity, false);
  const friction = table.determined[fs];
  measure("coneToFrictionSleeveDistance", "Afstand conus tot midden kleefmantel (mm)", 1, 1000, friction);
  measure("frictionSleeveSurfaceArea", "Oppervlakte kleefmantel (mm²)", 230, 25000, friction);
  measure("frictionSleeveSurfaceQuotient", "Oppervlaktequotiënt kleefmantel", -Infinity, Infinity, friction);
  const zero = s.zeroLoad ?? {};
  const given = (key: keyof typeof zero) => typeof zero[key] === "number" && Number.isFinite(zero[key]);
  if (!ZERO_LOAD_PAIRS.some((p) => given(`${p.name}Before`) || given(`${p.name}After`)))
    warning("zeroLoad", "Er zijn geen nulmetingen ingevuld. De catalogus stelt hiervoor geen harde regel; de sondeernorm en de kwaliteitsklasse bepalen of ze nodig zijn.");
  else {
    if (!given("coneResistanceBefore") || !given("coneResistanceAfter")) error("zeroLoad", "Nulmeting: de conusweerstand vooraf en achteraf zijn verplicht zodra er een nulmeting is.");
    for (const p of ZERO_LOAD_PAIRS)
      if (p.name !== "coneResistance" && given(`${p.name}Before`) !== given(`${p.name}After`))
        error("zeroLoad", `Nulmeting ${p.label.toLowerCase()}: vul vooraf én achteraf in, of geen van beide.`);
  }

  // ── Aanvullend onderzoek en verwijderde lagen (catalogus 6.3.16 en 6.3.17) ──
  yesNo("additionalInvestigationPerformed", "Aanvullend onderzoek uitgevoerd");
  const layers = s.removedLayers ?? [];
  const hasDetails = !!(s.conditions?.trim() || s.surfaceDescription?.trim() || s.groundwaterLevel !== undefined || layers.length);
  if (s.additionalInvestigationPerformed === "ja") {
    date("investigationDate", "Datum aanvullend onderzoek");
    if (!hasDetails) error("additionalInvestigationPerformed", "Aanvullend onderzoek: vul ten minste omstandigheden, hoedanigheid oppervlakte, grondwaterstand of een verwijderde laag in.");
    for (const [field, label] of [["conditions", "Omstandigheden"], ["surfaceDescription", "Hoedanigheid oppervlakte"]] as const)
      if ((s[field]?.length ?? 0) > 200) error(field, `${label} is langer dan 200 tekens.`);
    measure("groundwaterLevel", "Grondwaterstand (m)", -99.99, 99.99, false);
    if (layers.length) {
      const pre = s.predrilledDepth;
      if (pre === 0) error("removedLayers", "Er zijn verwijderde lagen beschreven terwijl voorgeboord tot 0 m is.");
      layers.forEach((layer, i) => {
        const n = i + 1;
        if (!layer.description?.trim()) error("removedLayers", `Verwijderde laag ${n}: de beschrijving ontbreekt.`);
        else if (layer.description.length > 200) error("removedLayers", `Verwijderde laag ${n}: de beschrijving is langer dan 200 tekens.`);
        if (!(layer.lowerBoundary > layer.upperBoundary)) error("removedLayers", `Verwijderde laag ${n}: de ondergrens moet groter zijn dan de bovengrens.`);
        if (i === 0 ? layer.upperBoundary !== 0 : layer.upperBoundary !== layers[i - 1].lowerBoundary)
          error("removedLayers", i === 0 ? "De bovenste verwijderde laag moet op 0 m beginnen." : `Verwijderde laag ${n} sluit niet aan op de laag erboven.`);
      });
      if (pre !== undefined && pre !== 0 && layers[layers.length - 1].lowerBoundary !== pre)
        error("removedLayers", `De ondergrens van de onderste verwijderde laag moet gelijk zijn aan voorgeboord tot (${pre} m).`);
      if (layers.length > 99) error("removedLayers", "Er kunnen ten hoogste 99 verwijderde lagen worden beschreven.");
    }
  } else if (s.additionalInvestigationPerformed === "nee" && (hasDetails || s.investigationDate))
    error("additionalInvestigationPerformed", "Er zijn gegevens van aanvullend onderzoek ingevuld terwijl is gekozen dat het niet is uitgevoerd.");

  return issues;
}

export const blocking = (issues: BroIssue[]): BroIssue[] => issues.filter((i) => i.severity === "error");
