/**
 * BRO-registratieverzoek voor een sondering (CPT, kwaliteitsregime IMBRO) als XML-tekst.
 *
 * Geschreven tegen isCPT 1.1 (iscpt-messages.xsd 1.1.0 met cptcommon 1.1.0 en brocommon 3.0.8) en
 * de Catalogus Geotechnisch Sondeeronderzoek van 1 september 2022; zie broCptSpec.ts voor de
 * bronnen. Elementvolgorde en naamruimten volgen de schema's.
 *
 * Wat wordt geschreven: het verzoek met brondocument CPT, de aangeleverde locatie in RD
 * (EPSG:28992), de verticale positie in NAP, het sondeonderzoek met traject, sondeerapparaat,
 * nulmeting, de meetreeks in 25 vaste kolommen, bewerking en bepaalde parameters, en aanvullend
 * onderzoek met verwijderde lagen.
 *
 * Wat niet wordt geschreven:
 *  - dissipatietests (de app leest ze niet in; een sondering met dissipatietests wordt geweigerd);
 *  - locaties op zee (ETRS89/WGS84, LAT/MSL) en het kwaliteitsregime IMBRO/A;
 *  - correctieverzoeken (correctionRequest).
 *
 * Keuzes die niet uit schema of catalogus volgen, zijn als zodanig gemarkeerd.
 */
import type { Cpt } from "../types/cpt";
import { blocking, checkBroCpt, outOfRange, type BroCheckOptions, type BroIssue } from "./broCptCheck";
import { broCptTable, formatMeasure } from "./broCptData";
import { BRO_CPT_SPEC, BRO_VOID, NS, RESULT_COLUMNS, RESULT_RECORD_URL, SRS_RD, TEXT_ENCODING, ZERO_LOAD_PAIRS } from "./broCptSpec";
import type { BroCptSupplement } from "./broCptSupplement";

export class BroExportError extends Error {
  constructor(public readonly cptId: string, public readonly issues: BroIssue[]) {
    super(`BRO-export van ${cptId} gestopt: ${issues.map((i) => i.message).join(" ")}`);
    this.name = "BroExportError";
  }
}

export interface BroCptXml {
  xml: string;
  /** Voorstel voor de bestandsnaam. */
  filename: string;
  /** Aandachtspunten die de export niet tegenhouden. */
  warnings: string[];
}

const escape = (value: string | number) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type Node = string | undefined | false;
/** Element met inhoud; onderdelen die undefined of false zijn vallen weg. */
function el(name: string, attributes: Record<string, string | number> | null, ...children: Node[]): string {
  const attrs = Object.entries(attributes ?? {}).map(([k, v]) => ` ${k}="${escape(v)}"`).join("");
  const body = children.filter((c): c is string => typeof c === "string");
  if (!body.length) return `<${name}${attrs}/>`;
  if (body.length === 1 && !body[0].startsWith("<")) return `<${name}${attrs}>${body[0]}</${name}>`;
  return `<${name}${attrs}>\n${body.map((c) => c.split("\n").map((line) => `  ${line}`).join("\n")).join("\n")}\n</${name}>`;
}
const leaf = (name: string, value: string | number | undefined, attributes: Record<string, string> | null = null): Node =>
  value === undefined || value === "" ? undefined : el(name, attributes, escape(value));
const c = (name: string) => `cptcommon:${name}`;
const coded = (name: string, list: string, value: string | undefined) => leaf(name, value, { codeSpace: `urn:bro:cpt:${list}` });
const dated = (name: string, value: string | undefined) => (value ? el(name, null, leaf("brocom:date", value)) : undefined);
const measured = (name: string, value: number | undefined, uom: string) => (value === undefined ? undefined : leaf(name, value, { uom }));

const safeName = (id: string) => id.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "sondering";

/**
 * Schrijf het registratieverzoek. Gooit een BroExportError met de lijst van wat ontbreekt of
 * niet klopt als de verplichte gegevens niet volledig zijn.
 */
export function writeBroCptXml(cpt: Cpt, s: BroCptSupplement, options: BroCheckOptions = {}): BroCptXml {
  const issues = checkBroCpt(cpt, s, options), errors = blocking(issues);
  if (errors.length) throw new BroExportError(cpt.id, errors);

  const table = broCptTable(cpt);
  if (s.voidOutOfRange) for (const item of outOfRange(table)) {
    const { min, max } = RESULT_COLUMNS[item.column];
    for (const row of table.rows) if (row[item.column] != null && (row[item.column]! < min || row[item.column]! > max)) row[item.column] = null;
  }
  const determined = RESULT_COLUMNS.map((_, i) => table.rows.some((r) => r[i] != null));
  const values = table.rows
    .map((row) => row.map((v, i) => (v == null ? BRO_VOID : formatMeasure(v, RESULT_COLUMNS[i].decimals))).join(TEXT_ENCODING.tokenSeparator))
    .join(TEXT_ENCODING.blockSeparator);
  const finalDepth = Math.max(...cpt.points.map((p) => p.depth));
  const offset = (cpt.position?.z_nap ?? cpt.metadata.ground_level_nap)!;
  const zero = s.zeroLoad ?? {};
  const zeroLoad = ZERO_LOAD_PAIRS.flatMap((p) => (["Before", "After"] as const).map((moment) => measured(c(`${p.name}${moment}`), zero[`${p.name}${moment}`], p.unit)));
  const nil = { "xsi:nil": "true" };
  const instant = (id: string) => el("gml:TimeInstant", { "gml:id": id }, leaf("gml:timePosition", s.startTime));
  const investigated = s.additionalInvestigationPerformed === "ja";

  const survey = el("conePenetrometerSurvey", { "gml:id": "ogs_survey" },
    el("sampling:sampledFeature", nil),
    leaf(c("dissipationTestPerformed"), "nee"),
    dated(c("finalProcessingDate"), s.finalProcessingDate),
    coded(c("cptMethod"), "CPTMethod", s.cptMethod),
    coded(c("qualityClass"), "QualityClass", s.qualityClass),
    coded(c("stopCriterion"), "StopCriterion", s.stopCriterion),
    measured(c("sensorAzimuth"), s.sensorAzimuth, "deg"),
    el(c("trajectory"), null,
      leaf(c("predrilledDepth"), formatMeasure(s.predrilledDepth!, 2), { uom: "m" }),
      leaf(c("finalDepth"), formatMeasure(finalDepth, 3), { uom: "m" })),
    el(c("conePenetrometer"), null,
      leaf(c("description"), s.coneDescription),
      leaf(c("conePenetrometerType"), s.conePenetrometerType),
      measured(c("coneSurfaceArea"), s.coneSurfaceArea, "mm2"),
      measured(c("coneDiameter"), s.coneDiameter, "mm"),
      measured(c("coneSurfaceQuotient"), s.coneSurfaceQuotient, "1"),
      measured(c("coneToFrictionSleeveDistance"), s.coneToFrictionSleeveDistance, "mm"),
      measured(c("frictionSleeveSurfaceArea"), s.frictionSleeveSurfaceArea, "mm2"),
      measured(c("frictionSleeveSurfaceQuotient"), s.frictionSleeveSurfaceQuotient, "1"),
      zeroLoad.some(Boolean) && el(c("zeroLoadMeasurement"), null, ...zeroLoad)),
    el(c("conePenetrationTest"), { "gml:id": "ogs_test" },
      el("om:phenomenonTime", null, instant("ogs_start")),
      // De catalogus kent alleen de starttijd van de meting; het schema vraagt daarnaast om:resultTime.
      // Net als de uitgifteservice van de BRO krijgt die hetzelfde tijdstip.
      el("om:resultTime", null, instant("ogs_result")),
      el("om:procedure", nil),
      el("om:observedProperty", nil),
      el("om:featureOfInterest", nil),
      el(c("cptResult"), null,
        el("swe:elementCount", null, el("swe:Count", null, leaf("swe:value", table.rows.length))),
        el("swe:elementType", { name: "ConePenetrationTestResultRecord", "xlink:href": RESULT_RECORD_URL }),
        el("swe:encoding", null, el("swe:TextEncoding", { ...TEXT_ENCODING })),
        leaf(c("values"), values))),
    el(c("procedure"), null,
      leaf(c("interruptionProcessingPerformed"), s.interruptionProcessingPerformed),
      leaf(c("expertCorrectionPerformed"), s.expertCorrectionPerformed),
      leaf(c("signalProcessingPerformed"), s.signalProcessingPerformed)),
    el(c("parameters"), null, ...RESULT_COLUMNS.map((column, i) => leaf(c(column.name), determined[i] ? "ja" : "nee"))));

  const document = el("CPT", null,
    leaf("objectIdAccountableParty", s.objectIdAccountableParty),
    coded("deliveryContext", "DeliveryContext", s.deliveryContext),
    coded("surveyPurpose", "SurveyPurpose", s.surveyPurpose),
    dated("researchReportDate", s.researchReportDate),
    coded("cptStandard", "CPTStandard", s.cptStandard),
    leaf("additionalInvestigationPerformed", s.additionalInvestigationPerformed),
    leaf("researchOperator", s.researchOperator),
    el("deliveredLocation", null,
      el(c("location"), { "gml:id": "ogs_location", srsName: SRS_RD },
        leaf("gml:pos", `${formatMeasure(cpt.position!.x_rd, 3)} ${formatMeasure(cpt.position!.y_rd, 3)}`)),
      dated(c("horizontalPositioningDate"), s.horizontalPositioningDate),
      coded(c("horizontalPositioningMethod"), "HorizontalPositioningMethod", s.horizontalPositioningMethod),
      leaf(c("horizontalPositioningOperator"), s.horizontalPositioningOperator)),
    el("deliveredVerticalPosition", null,
      coded(c("localVerticalReferencePoint"), "LocalVerticalReferencePoint", s.localVerticalReferencePoint),
      leaf(c("offset"), formatMeasure(offset, 3), { uom: "m" }),
      s.localVerticalReferencePoint === "waterbodem" && measured(c("waterDepth"), s.waterDepth, "m"),
      coded(c("verticalDatum"), "VerticalDatum", "NAP"),
      dated(c("verticalPositioningDate"), s.verticalPositioningDate),
      coded(c("verticalPositioningMethod"), "VerticalPositioningMethod", s.verticalPositioningMethod),
      leaf(c("verticalPositioningOperator"), s.verticalPositioningOperator)),
    investigated && el("additionalInvestigation", null,
      dated(c("investigationDate"), s.investigationDate),
      leaf(c("conditions"), s.conditions?.trim()),
      leaf(c("surfaceDescription"), s.surfaceDescription?.trim()),
      s.groundwaterLevel !== undefined && leaf(c("groundwaterLevel"), formatMeasure(s.groundwaterLevel, 2), { uom: "m" }),
      ...(s.removedLayers ?? []).map((layer, i) => el(c("removedLayer"), null,
        leaf(c("sequenceNumber"), i + 1),
        leaf(c("upperBoundary"), formatMeasure(layer.upperBoundary, 2), { uom: "m" }),
        leaf(c("lowerBoundary"), formatMeasure(layer.lowerBoundary, 2), { uom: "m" }),
        leaf(c("description"), layer.description.trim())))),
    survey);

  const namespaces = {
    xmlns: NS.iscpt, "xmlns:brocom": NS.brocom, "xmlns:cptcommon": NS.cptcommon, "xmlns:gml": NS.gml, "xmlns:om": NS.om,
    "xmlns:sampling": NS.sampling, "xmlns:swe": NS.swe, "xmlns:xlink": NS.xlink, "xmlns:xsi": NS.xsi,
  };
  const request = el("registrationRequest", namespaces,
    leaf("brocom:requestReference", s.requestReference),
    leaf("brocom:deliveryAccountableParty", s.deliveryAccountableParty),
    leaf("brocom:qualityRegime", BRO_CPT_SPEC.qualityRegime),
    el("sourceDocument", null, document));

  return {
    xml: `<?xml version="1.0" encoding="UTF-8"?>\n<!-- Registratieverzoek geotechnisch sondeeronderzoek, ${BRO_CPT_SPEC.messageSchema} -->\n${request}\n`,
    filename: `${safeName(cpt.id)}-bro-registratieverzoek.xml`,
    warnings: issues.filter((i) => i.severity === "warning").map((i) => i.message),
  };
}
