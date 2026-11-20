// Aanvullende gegevens voor het BRO-registratieverzoek: wat niet in de meetgegevens zit en de
// gebruiker in het exportscherm invult. Ze worden bij de sondering bewaard (metadata.extra) en
// gaan zo mee in het projectbestand.
import type { Cpt } from "../types/cpt";
import { ZERO_LOAD_PAIRS, type ZeroLoadKey } from "./broCptSpec";

export type YesNo = "ja" | "nee";

export interface BroRemovedLayer { upperBoundary: number; lowerBoundary: number; description: string }

export interface BroCptSupplement {
  /** Eigen kenmerk van het verzoek (brocom:requestReference). */
  requestReference?: string;
  /** KvK-nummer van de bronhouder (brocom:deliveryAccountableParty). */
  deliveryAccountableParty?: string;
  objectIdAccountableParty?: string;
  deliveryContext?: string;
  surveyPurpose?: string;
  /** Datums als jjjj-mm-dd. */
  researchReportDate?: string;
  cptStandard?: string;
  qualityClass?: string;
  /** KvK-nummer van de uitvoerder van het onderzoek (optioneel). */
  researchOperator?: string;
  horizontalPositioningDate?: string;
  horizontalPositioningMethod?: string;
  horizontalPositioningOperator?: string;
  localVerticalReferencePoint?: string;
  /** Alleen bij lokaal verticaal referentiepunt waterbodem, in m. */
  waterDepth?: number;
  verticalPositioningDate?: string;
  verticalPositioningMethod?: string;
  verticalPositioningOperator?: string;
  finalProcessingDate?: string;
  cptMethod?: string;
  stopCriterion?: string;
  sensorAzimuth?: number;
  /** Voorgeboord tot, in m; 0 als er niet is voorgeboord of voorgegraven. */
  predrilledDepth?: number;
  /** Starttijd meten als xs:dateTime met tijdzone, bijv. 2026-03-12T09:30:00+01:00. */
  startTime?: string;
  interruptionProcessingPerformed?: YesNo;
  expertCorrectionPerformed?: YesNo;
  signalProcessingPerformed?: YesNo;
  coneDescription?: string;
  conePenetrometerType?: string;
  coneSurfaceArea?: number;
  coneDiameter?: number;
  coneSurfaceQuotient?: number;
  coneToFrictionSleeveDistance?: number;
  frictionSleeveSurfaceArea?: number;
  frictionSleeveSurfaceQuotient?: number;
  zeroLoad?: Partial<Record<ZeroLoadKey, number>>;
  additionalInvestigationPerformed?: YesNo;
  investigationDate?: string;
  conditions?: string;
  surfaceDescription?: string;
  groundwaterLevel?: number;
  removedLayers?: BroRemovedLayer[];
  /** Meetwaarden buiten het waardebereik van de catalogus als "geen waarde" wegschrijven. */
  voidOutOfRange?: boolean;
}

export const SUPPLEMENT_KEY = "ogs:bro-export";

/** Gegevens die gewoonlijk voor alle sonderingen van één project gelijk zijn. */
export const SHARED_FIELDS: (keyof BroCptSupplement)[] = [
  "deliveryAccountableParty", "deliveryContext", "surveyPurpose", "researchReportDate", "cptStandard", "qualityClass",
  "researchOperator", "horizontalPositioningDate", "horizontalPositioningMethod", "horizontalPositioningOperator",
  "localVerticalReferencePoint", "verticalPositioningDate", "verticalPositioningMethod", "verticalPositioningOperator",
  "finalProcessingDate", "cptMethod", "interruptionProcessingPerformed", "expertCorrectionPerformed", "signalProcessingPerformed",
];

export function readSupplement(cpt: Cpt): BroCptSupplement | undefined {
  const raw = cpt.metadata.extra?.[SUPPLEMENT_KEY];
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" ? (value as BroCptSupplement) : undefined;
  } catch { return undefined; }
}

/** Kopie van de sondering met de aanvullingen erbij; lege waarden worden niet bewaard. */
export function withSupplement(cpt: Cpt, supplement: BroCptSupplement): Cpt {
  const clean = JSON.parse(JSON.stringify(supplement, (_k, v) => (v === "" || v === null ? undefined : v)));
  return { ...cpt, metadata: { ...cpt.metadata, extra: { ...cpt.metadata.extra, [SUPPLEMENT_KEY]: JSON.stringify(clean) } } };
}

const number = (text: string | null | undefined): number | undefined => {
  const value = text == null || text.trim() === "" ? NaN : Number(text);
  return Number.isFinite(value) ? value : undefined;
};
const yesNo = (text: string | undefined): YesNo | undefined => (text === "ja" || text === "nee" ? text : undefined);

/**
 * Tijdstip in Nederland als xs:dateTime met de tijdzoneverschuiving van dat moment
 * (tijdzone Europe/Amsterdam uit de tijdzonegegevens van het platform).
 */
export function dutchDateTime(date: string, time: string): string | undefined {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date), t = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(time.trim());
  if (!d || !t) return undefined;
  const [y, mo, da, h, mi, s] = [d[1], d[2], d[3], t[1], t[2], t[3] ?? "0"].map(Number);
  const asUtc = Date.UTC(y, mo - 1, da, h, mi, s);
  if (Number.isNaN(asUtc) || h > 23 || mi > 59 || s > 59) return undefined;
  // Welke wandkloktijd hoort in Amsterdam bij dit UTC-moment? Het verschil is de verschuiving.
  const wall = (instant: number) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Amsterdam", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(new Date(instant)).map((p) => [p.type, p.value]));
    return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  };
  let offset = wall(asUtc) - asUtc;
  offset = wall(asUtc - offset) - (asUtc - offset);
  const minutes = Math.round(offset / 60000), sign = minutes < 0 ? "-" : "+", abs = Math.abs(minutes);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${d[1]}-${d[2]}-${d[3]}T${two(h)}:${two(mi)}:${two(s)}${sign}${two(Math.floor(abs / 60))}:${two(abs % 60)}`;
}

/** Aanvullingen die uit de oorspronkelijke BRO-XML van een ingelezen sondering volgen. */
function fromBroSource(xml: string): BroCptSupplement {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  if (doc.getElementsByTagName("parsererror").length) return {};
  const all = Array.from(doc.getElementsByTagName("*"));
  const element = (name: string, within?: Element) => (within ? Array.from(within.getElementsByTagName("*")) : all).find((el) => el.localName === name);
  const text = (name: string, within?: Element) => {
    const el = element(name, within);
    return el && el.children.length === 0 ? el.textContent?.trim() || undefined : undefined;
  };
  const date = (name: string, within?: Element) => { const el = element(name, within); return el ? text("date", el) : undefined; };
  const zeroLoad: Partial<Record<ZeroLoadKey, number>> = {};
  for (const pair of ZERO_LOAD_PAIRS) for (const moment of ["Before", "After"] as const) {
    const value = number(text(`${pair.name}${moment}`));
    if (value !== undefined) zeroLoad[`${pair.name}${moment}`] = value;
  }
  const penetrometer = element("conePenetrometer"), test = element("conePenetrationTest"), investigation = element("additionalInvestigation");
  const phenomenon = test ? element("phenomenonTime", test) : undefined;
  const removedLayers = all.filter((el) => el.localName === "removedLayer").map((layer) => ({
    upperBoundary: number(text("upperBoundary", layer)) ?? NaN, lowerBoundary: number(text("lowerBoundary", layer)) ?? NaN, description: text("description", layer) ?? "",
  })).filter((l) => Number.isFinite(l.upperBoundary) && Number.isFinite(l.lowerBoundary));
  return {
    deliveryAccountableParty: text("deliveryAccountableParty"),
    objectIdAccountableParty: text("objectIdAccountableParty"),
    deliveryContext: text("deliveryContext"), surveyPurpose: text("surveyPurpose"),
    researchReportDate: date("researchReportDate"), cptStandard: text("cptStandard"), qualityClass: text("qualityClass"),
    researchOperator: text("researchOperator"),
    horizontalPositioningDate: date("horizontalPositioningDate"), horizontalPositioningMethod: text("horizontalPositioningMethod"),
    horizontalPositioningOperator: text("horizontalPositioningOperator"),
    localVerticalReferencePoint: text("localVerticalReferencePoint"), waterDepth: number(text("waterDepth")),
    verticalPositioningDate: date("verticalPositioningDate"), verticalPositioningMethod: text("verticalPositioningMethod"),
    verticalPositioningOperator: text("verticalPositioningOperator"),
    finalProcessingDate: date("finalProcessingDate"), cptMethod: text("cptMethod"), stopCriterion: text("stopCriterion"),
    sensorAzimuth: number(text("sensorAzimuth")), predrilledDepth: number(text("predrilledDepth")),
    startTime: phenomenon ? text("timePosition", phenomenon) : undefined,
    interruptionProcessingPerformed: yesNo(text("interruptionProcessingPerformed")),
    expertCorrectionPerformed: yesNo(text("expertCorrectionPerformed")),
    signalProcessingPerformed: yesNo(text("signalProcessingPerformed")),
    coneDescription: penetrometer ? text("description", penetrometer) : undefined,
    conePenetrometerType: penetrometer ? text("conePenetrometerType", penetrometer) : undefined,
    coneSurfaceArea: number(text("coneSurfaceArea")), coneDiameter: number(text("coneDiameter")),
    coneSurfaceQuotient: number(text("coneSurfaceQuotient")),
    coneToFrictionSleeveDistance: number(text("coneToFrictionSleeveDistance")),
    frictionSleeveSurfaceArea: number(text("frictionSleeveSurfaceArea")),
    frictionSleeveSurfaceQuotient: number(text("frictionSleeveSurfaceQuotient")),
    zeroLoad: Object.keys(zeroLoad).length ? zeroLoad : undefined,
    additionalInvestigationPerformed: yesNo(text("additionalInvestigationPerformed")),
    investigationDate: investigation ? date("investigationDate", investigation) : undefined,
    conditions: investigation ? text("conditions", investigation) : undefined,
    surfaceDescription: investigation ? text("surfaceDescription", investigation) : undefined,
    groundwaterLevel: investigation ? number(text("groundwaterLevel", investigation)) : undefined,
    removedLayers: removedLayers.length ? removedLayers : undefined,
  };
}

/**
 * Aanvullingen die uit de kop van een GEF-bestand volgen (CUR GEF-CPT-Report 1.1.2):
 * #MEASUREMENTVAR 1-5 (conus en kleefmantel), 13 (voorgeboord), 20-35 (nulmetingen vooraf en
 * achteraf), #MEASUREMENTTEXT 4 (conustype) en #STARTDATE/#STARTTIME. Andere koppen (norm, klasse,
 * stopcriterium) zijn vrije tekst of eigen codes en worden niet geraden.
 */
function fromGefHeaders(headers: Record<string, string[]>): BroCptSupplement {
  const variable = (n: number) => {
    const line = (headers.MEASUREMENTVAR ?? []).find((v) => new RegExp(`^\\s*${n}\\s*,`).test(v));
    return line ? number(line.split(",")[1]) : undefined;
  };
  const textLine = (n: number) => {
    const line = (headers.MEASUREMENTTEXT ?? []).find((v) => new RegExp(`^\\s*${n}\\s*,`).test(v));
    return line?.split(",")[1]?.trim() || undefined;
  };
  const zeroNumbers: [ZeroLoadKey, number][] = [
    ["coneResistanceBefore", 20], ["coneResistanceAfter", 21], ["localFrictionBefore", 22], ["localFrictionAfter", 23],
    ["porePressureU1Before", 24], ["porePressureU1After", 25], ["porePressureU2Before", 26], ["porePressureU2After", 27],
    ["porePressureU3Before", 28], ["porePressureU3After", 29], ["inclinationResultantBefore", 30], ["inclinationResultantAfter", 31],
    ["inclinationNSBefore", 32], ["inclinationNSAfter", 33], ["inclinationEWBefore", 34], ["inclinationEWAfter", 35],
  ];
  const zeroLoad: Partial<Record<ZeroLoadKey, number>> = {};
  for (const [key, n] of zeroNumbers) { const value = variable(n); if (value !== undefined) zeroLoad[key] = value; }
  const parts = (name: string) => (headers[name]?.[0] ?? "").split(",").map((v) => v.trim());
  const [y, mo, d] = parts("STARTDATE"), [h, mi, s] = parts("STARTTIME");
  const startDate = y && mo && d ? `${y.padStart(4, "0")}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}` : undefined;
  const startTime = startDate && h && mi ? dutchDateTime(startDate, `${h}:${mi.padStart(2, "0")}:${String(Math.floor(Number(s) || 0)).padStart(2, "0")}`) : undefined;
  return {
    coneSurfaceArea: variable(1), frictionSleeveSurfaceArea: variable(2), coneSurfaceQuotient: variable(3),
    frictionSleeveSurfaceQuotient: variable(4), coneToFrictionSleeveDistance: variable(5), predrilledDepth: variable(13),
    conePenetrometerType: textLine(4), startTime, zeroLoad: Object.keys(zeroLoad).length ? zeroLoad : undefined,
  };
}

/**
 * Uitgangspunt voor het exportscherm: wat al is ingevuld gaat voor, daarna wat uit het bronbestand
 * volgt. Niets wordt verzonnen: wat de bron niet geeft blijft leeg en komt in de controle terug.
 */
export function prefillSupplement(cpt: Cpt, defaults: BroCptSupplement = {}): BroCptSupplement {
  const extra = cpt.metadata.extra ?? {};
  let source: BroCptSupplement = {};
  if (extra["ogs:source-bro-xml"]) source = fromBroSource(extra["ogs:source-bro-xml"]);
  else if (extra["ogs:gef-headers"]) { try { source = fromGefHeaders(JSON.parse(extra["ogs:gef-headers"])); } catch { /* geen bruikbare kop */ } }
  const general: BroCptSupplement = {
    requestReference: cpt.id, objectIdAccountableParty: cpt.id,
    predrilledDepth: cpt.metadata.predrilled_depth_m ?? cpt.metadata.pre_excavated_depth_m,
  };
  const merged: Record<string, unknown> = {};
  for (const layer of [general, defaults, source, readSupplement(cpt) ?? {}])
    for (const [key, value] of Object.entries(layer)) if (value !== undefined && value !== "") merged[key] = value;
  return merged as BroCptSupplement;
}
