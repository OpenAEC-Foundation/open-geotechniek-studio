import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseGef } from "../types/gefParser";
import { parseBroCptXml } from "../types/broCptParser";
import type { Cpt } from "../types/cpt";
import { validationOf } from "../validation/report";
import { blocking, checkBroCpt } from "./broCptCheck";
import { broCptTable } from "./broCptData";
import { BRO_VOID, NS, RESULT_COLUMNS } from "./broCptSpec";
import { dutchDateTime, prefillSupplement, readSupplement, withSupplement, type BroCptSupplement } from "./broCptSupplement";
import { BroExportError, writeBroCptXml } from "./broCptWriter";

const gefSource = readFileSync("../../tests/fixtures/gef/synthetic-cpt.gef", "utf8");
const broSource = readFileSync("../../tests/fixtures/bro/bedrock-example.xml", "utf8");

/** Alles wat een GEF-sondering niet zelf meebrengt, volledig en geldig ingevuld. */
const complete: BroCptSupplement = {
  requestReference: "verzoek-1", deliveryAccountableParty: "12345678", objectIdAccountableParty: "S01",
  deliveryContext: "publiekeTaak", surveyPurpose: "bouwwerkConstructie", researchReportDate: "2026-11-02",
  cptStandard: "ISO22476D1", qualityClass: "klasse2", researchOperator: "87654321",
  horizontalPositioningDate: "2026-10-29", horizontalPositioningMethod: "RTKGPS0tot2cm",
  localVerticalReferencePoint: "maaiveld", verticalPositioningDate: "2026-10-29", verticalPositioningMethod: "RTKGPS0tot4cm",
  finalProcessingDate: "2026-10-30", cptMethod: "elektrischContinu", stopCriterion: "einddiepte", predrilledDepth: 0,
  startTime: "2026-10-29T09:30:00+01:00",
  interruptionProcessingPerformed: "nee", expertCorrectionPerformed: "nee", signalProcessingPerformed: "ja",
  coneDescription: "Sondeerrups 20 ton", conePenetrometerType: "S15-CFIIP.1234", coneSurfaceArea: 1500,
  coneToFrictionSleeveDistance: 100, frictionSleeveSurfaceArea: 22500, frictionSleeveSurfaceQuotient: 1,
  zeroLoad: { coneResistanceBefore: 0.01, coneResistanceAfter: 0.02, localFrictionBefore: 0.001, localFrictionAfter: 0.002 },
  additionalInvestigationPerformed: "nee",
};
const gef = () => parseGef(gefSource, "synthetic.gef");
const parse = (xml: string) => new DOMParser().parseFromString(xml, "text/xml");
const children = (el: Element) => Array.from(el.children).map((c) => c.localName);
const find = (doc: Document, name: string) => Array.from(doc.getElementsByTagName("*")).find((e) => e.localName === name)!;
const core = (cpt: Cpt) => cpt.points.map((p) => [p.depth, p.qc, p.fs, p.rf, p.u2, p.inclination]);
const errorsOf = (cpt: Cpt, s: BroCptSupplement, today?: string) => blocking(checkBroCpt(cpt, s, { today })).map((i) => i.field);

describe("BRO-registratieverzoek voor een sondering uit GEF", () => {
  it("schrijft een verzoek dat de bestaande lezer met dezelfde meetpunten en kerngegevens terugleest", () => {
    const cpt = gef(), out = writeBroCptXml(cpt, complete), read = parseBroCptXml(out.xml, "terug.xml");
    expect(core(read)).toEqual(core(cpt));
    expect(read.points.map((p) => p.parameters?.length)).toEqual([1, 2, 3]);
    expect(read.id).toBe("S01");
    expect(read.position).toEqual({ x_rd: 155000, y_rd: 463000, z_nap: 2 });
    expect(read.metadata).toMatchObject({ date: "2026-11-02", ground_level_nap: 2, predrilled_depth_m: 0 });
    expect(read.metadata.extra).toMatchObject({ qualityClass: "klasse2", cptStandard: "ISO22476D1", conePenetrometerType: "S15-CFIIP.1234", coneSurfaceArea: "1500" });
    expect(validationOf(read)?.diagnostics.filter((d) => d.severity !== "info")).toEqual([]);
    expect(out.filename).toBe("SYNTHETIC-CPT-bro-registratieverzoek.xml");
  });

  it("volgt naamruimten en elementvolgorde van isCPT 1.1, cptcommon 1.1 en brocommon 3.0", () => {
    const doc = parse(writeBroCptXml(gef(), { ...complete, sensorAzimuth: 90, coneDiameter: 44, coneSurfaceQuotient: 0.8 }).xml);
    expect(doc.getElementsByTagName("parsererror").length).toBe(0);
    const root = doc.documentElement;
    expect([root.localName, root.namespaceURI]).toEqual(["registrationRequest", NS.iscpt]);
    expect(Array.from(root.children).map((c) => [c.localName, c.namespaceURI])).toEqual([
      ["requestReference", NS.brocom], ["deliveryAccountableParty", NS.brocom], ["qualityRegime", NS.brocom], ["sourceDocument", NS.iscpt],
    ]);
    expect(find(doc, "qualityRegime").textContent).toBe("IMBRO");
    const cpt = find(doc, "CPT");
    expect(cpt.namespaceURI).toBe(NS.iscpt);
    expect(children(cpt)).toEqual(["objectIdAccountableParty", "deliveryContext", "surveyPurpose", "researchReportDate", "cptStandard",
      "additionalInvestigationPerformed", "researchOperator", "deliveredLocation", "deliveredVerticalPosition", "conePenetrometerSurvey"]);
    expect(Array.from(cpt.children).every((c) => c.namespaceURI === NS.iscpt)).toBe(true);
    expect(children(find(doc, "deliveredLocation"))).toEqual(["location", "horizontalPositioningDate", "horizontalPositioningMethod"]);
    const location = find(doc, "location");
    expect([location.namespaceURI, location.getAttribute("srsName"), location.getAttributeNS(NS.gml, "id")]).toEqual([NS.cptcommon, "urn:ogc:def:crs:EPSG::28992", "ogs_location"]);
    expect(find(doc, "pos").textContent).toBe("155000.000 463000.000");
    expect(children(find(doc, "deliveredVerticalPosition"))).toEqual(["localVerticalReferencePoint", "offset", "verticalDatum", "verticalPositioningDate", "verticalPositioningMethod"]);
    expect(find(doc, "verticalDatum").textContent).toBe("NAP");
    expect(find(doc, "offset").getAttribute("uom")).toBe("m");
    const survey = find(doc, "conePenetrometerSurvey");
    expect(children(survey)).toEqual(["sampledFeature", "dissipationTestPerformed", "finalProcessingDate", "cptMethod", "qualityClass", "stopCriterion",
      "sensorAzimuth", "trajectory", "conePenetrometer", "conePenetrationTest", "procedure", "parameters"]);
    expect(survey.children[0].namespaceURI).toBe(NS.sampling);
    expect(Array.from(survey.children).slice(1).every((c) => c.namespaceURI === NS.cptcommon)).toBe(true);
    expect(children(find(doc, "conePenetrometer"))).toEqual(["description", "conePenetrometerType", "coneSurfaceArea", "coneDiameter", "coneSurfaceQuotient",
      "coneToFrictionSleeveDistance", "frictionSleeveSurfaceArea", "frictionSleeveSurfaceQuotient", "zeroLoadMeasurement"]);
    expect(children(find(doc, "zeroLoadMeasurement"))).toEqual(["coneResistanceBefore", "coneResistanceAfter", "localFrictionBefore", "localFrictionAfter"]);
    const test = find(doc, "conePenetrationTest");
    expect(Array.from(test.children).map((c) => [c.localName, c.namespaceURI])).toEqual([
      ["phenomenonTime", NS.om], ["resultTime", NS.om], ["procedure", NS.om], ["observedProperty", NS.om], ["featureOfInterest", NS.om], ["cptResult", NS.cptcommon],
    ]);
    expect(find(doc, "timePosition").textContent).toBe("2026-10-29T09:30:00+01:00");
    const result = find(doc, "cptResult");
    expect(Array.from(result.children).map((c) => [c.localName, c.namespaceURI])).toEqual([
      ["elementCount", NS.swe], ["elementType", NS.swe], ["encoding", NS.swe], ["values", NS.cptcommon],
    ]);
    const encoding = find(doc, "TextEncoding");
    expect([encoding.getAttribute("decimalSeparator"), encoding.getAttribute("tokenSeparator"), encoding.getAttribute("blockSeparator")]).toEqual([".", ",", ";"]);
    expect(children(find(doc, "parameters"))).toEqual(RESULT_COLUMNS.map((c) => c.name));
    for (const [name, space] of [["deliveryContext", "DeliveryContext"], ["cptStandard", "CPTStandard"], ["qualityClass", "QualityClass"], ["stopCriterion", "StopCriterion"]])
      expect(find(doc, name).getAttribute("codeSpace")).toBe(`urn:bro:cpt:${space}`);
    const ids = Array.from(doc.getElementsByTagName("*")).map((e) => e.getAttributeNS(NS.gml, "id")).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("schrijft 25 kolommen in vaste volgorde, met -999999 voor ontbrekende waarden en nee voor ontbrekende kanalen", () => {
    const cpt = gef();
    cpt.points[1].fs = undefined;
    const doc = parse(writeBroCptXml(cpt, complete).xml);
    const rows = find(doc, "values").textContent!.split(";").map((r) => r.split(","));
    expect(rows.length).toBe(3);
    expect(rows.every((r) => r.length === 25)).toBe(true);
    // sondeerlengte, diepte, -, conusweerstand ... plaatselijke wrijving (19), u2 (23), wrijvingsgetal (25)
    expect(rows[0]).toEqual(["1.000", "0.980", BRO_VOID, "2.000", ...Array(14).fill(BRO_VOID), "0.020", BRO_VOID, BRO_VOID, BRO_VOID, "0.050", BRO_VOID, "1.0"]);
    expect(rows[1][18]).toBe(BRO_VOID);
    const flags = Object.fromEntries(Array.from(find(doc, "parameters").children).map((c) => [c.localName, c.textContent]));
    expect(Object.entries(flags).filter(([, v]) => v === "ja").map(([k]) => k)).toEqual(["penetrationLength", "depth", "coneResistance", "localFriction", "porePressureU2", "frictionRatio"]);
    expect(find(doc, "Count").textContent?.trim()).toBe("3");
    expect(find(doc, "finalDepth").textContent).toBe("2.950");
  });

  it("laat een kanaal zonder waarden weg en eist dan geen kleefmantelgegevens", () => {
    const cpt = gef();
    for (const p of cpt.points) { p.fs = undefined; p.rf = undefined; }
    const s: BroCptSupplement = { ...complete, coneToFrictionSleeveDistance: undefined, frictionSleeveSurfaceArea: undefined, frictionSleeveSurfaceQuotient: undefined };
    const doc = parse(writeBroCptXml(cpt, s).xml);
    expect(find(doc, "localFriction").textContent).toBe("nee");
    expect(find(doc, "frictionRatio").textContent).toBe("nee");
    expect(children(find(doc, "conePenetrometer"))).not.toContain("frictionSleeveSurfaceArea");
    expect(parseBroCptXml(writeBroCptXml(cpt, s).xml, "terug.xml").points.every((p) => p.fs === undefined)).toBe(true);
  });

  it("neemt uit de GEF-kop over wat daar eenduidig staat en verzint de rest niet", () => {
    const source = gefSource.replace("#EOH=", "#MEASUREMENTVAR= 1, 1000, mm2, oppervlakte conuspunt\n#MEASUREMENTVAR= 20, 0.012, MPa, nulpunt conus voor\n#MEASUREMENTVAR= 21, 0.015, MPa, nulpunt conus na\n#MEASUREMENTTEXT= 4, C10CFIIP.99, conustype\n#STARTTIME= 9, 5, 0\n#EOH=");
    const s = prefillSupplement(parseGef(source, "kop.gef"), { researchOperator: "87654321" });
    expect(s).toMatchObject({ requestReference: "SYNTHETIC-CPT", objectIdAccountableParty: "SYNTHETIC-CPT", coneSurfaceArea: 1000, predrilledDepth: 0,
      conePenetrometerType: "C10CFIIP.99", zeroLoad: { coneResistanceBefore: 0.012, coneResistanceAfter: 0.015 }, startTime: "2026-10-29T09:05:00+01:00", researchOperator: "87654321" });
    expect(s.cptStandard).toBeUndefined();
    expect(s.qualityClass).toBeUndefined();
    expect(s.stopCriterion).toBeUndefined();
  });
});

describe("volledigheidscontrole", () => {
  it("geeft voor een kale GEF-sondering de lijst van wat nog ontbreekt en houdt de export tegen", () => {
    const cpt = gef(), s = prefillSupplement(cpt);
    const fields = errorsOf(cpt, s);
    for (const field of ["deliveryAccountableParty", "deliveryContext", "surveyPurpose", "researchReportDate", "cptStandard", "qualityClass",
      "horizontalPositioningDate", "horizontalPositioningMethod", "localVerticalReferencePoint", "verticalPositioningDate", "verticalPositioningMethod",
      "finalProcessingDate", "cptMethod", "stopCriterion", "interruptionProcessingPerformed", "coneDescription", "conePenetrometerType",
      "coneSurfaceArea", "frictionSleeveSurfaceArea", "additionalInvestigationPerformed"]) expect(fields).toContain(field);
    expect(fields).not.toContain("requestReference");
    expect(fields).not.toContain("predrilledDepth");
    let thrown: unknown;
    try { writeBroCptXml(cpt, s); } catch (e) { thrown = e; }
    expect(thrown).toBeInstanceOf(BroExportError);
    expect((thrown as BroExportError).issues.length).toBe(fields.length);
    expect((thrown as BroExportError).message).toContain("KvK-nummer van de bronhouder ontbreekt.");
  });

  it("is leeg voor een volledig ingevulde sondering, op de aandachtspunten na", () => {
    expect(errorsOf(gef(), complete, "2026-11-20")).toEqual([]);
    const withoutZero = checkBroCpt(gef(), { ...complete, zeroLoad: undefined });
    expect(withoutZero.map((i) => [i.field, i.severity])).toEqual([["zeroLoad", "warning"]]);
  });

  it("keurt ongeldige waarden af", () => {
    const cpt = gef();
    expect(errorsOf(cpt, { ...complete, deliveryAccountableParty: "1234" })).toEqual(["deliveryAccountableParty"]);
    expect(errorsOf(cpt, { ...complete, researchOperator: "abc" })).toEqual(["researchOperator"]);
    // Catalogus 6.3.6.4: klasse 5 t/m 7 horen bij ISO 22476 deel 12, niet bij deel 1.
    expect(errorsOf(cpt, { ...complete, qualityClass: "klasse5" })).toEqual(["qualityClass"]);
    expect(errorsOf(cpt, { ...complete, cptStandard: "ISO22476D12", qualityClass: "klasse5" })).toEqual([]);
    // Waarden die alleen onder IMBRO/A mogen.
    expect(errorsOf(cpt, { ...complete, cptStandard: "NEN3680" })).toEqual(["cptStandard"]);
    expect(errorsOf(cpt, { ...complete, stopCriterion: "onbekend" })).toEqual(["stopCriterion"]);
    expect(errorsOf(cpt, { ...complete, researchReportDate: "2026-02-30" })).toEqual(["researchReportDate"]);
    expect(errorsOf(cpt, complete, "2026-11-01")).toEqual(["researchReportDate"]);
    expect(errorsOf(cpt, { ...complete, horizontalPositioningDate: "2026-11-03" })).toEqual(["horizontalPositioningDate"]);
    expect(errorsOf(cpt, { ...complete, startTime: "2026-10-29T09:30:00" })).toEqual(["startTime"]);
    expect(errorsOf(cpt, { ...complete, coneSurfaceArea: 10 })).toEqual(["coneSurfaceArea"]);
    expect(errorsOf(cpt, { ...complete, localVerticalReferencePoint: "waterbodem" })).toEqual(["waterDepth"]);
    expect(errorsOf(cpt, { ...complete, zeroLoad: { coneResistanceBefore: 0.01 } })).toEqual(["zeroLoad"]);
    expect(errorsOf(cpt, { ...complete, zeroLoad: { ...complete.zeroLoad, porePressureU2Before: 0.001 } })).toEqual(["zeroLoad"]);
  });

  it("eist RD-coördinaten, NAP-hoogte, een oplopende sondeerlengte en conusweerstand", () => {
    expect(errorsOf({ ...gef(), position: undefined, metadata: { ...gef().metadata, ground_level_nap: undefined } }, complete)).toEqual(["position", "offset"]);
    const reversed = gef();
    reversed.points.reverse();
    expect(errorsOf(reversed, complete)).toEqual(["data"]);
    const noQc = gef();
    for (const p of noQc.points) p.qc = undefined;
    expect(errorsOf(noQc, complete)).toEqual(["data"]);
    const noLength: Cpt = { ...gef(), points: gef().points.map((p) => ({ depth: p.depth, qc: p.qc })) };
    expect(blocking(checkBroCpt(noLength, complete)).map((i) => i.message).join(" ")).toContain("sondeertrajectlengte ontbreekt");
  });

  it("weigert waarden buiten het BRO-bereik, tenzij ze bewust als geen waarde worden weggeschreven", () => {
    const cpt = gef();
    cpt.points[2].rf = 140; // catalogus 6.3.13.25: wrijvingsgetal 0 tot 100 %
    const issues = blocking(checkBroCpt(cpt, complete));
    expect(issues.map((i) => i.field)).toEqual(["data"]);
    expect(issues[0].message).toContain("1 waarde(n) van wrijvingsgetal buiten het BRO-bereik 0 tot 100 %");
    const s = { ...complete, voidOutOfRange: true }, out = writeBroCptXml(cpt, s);
    expect(out.warnings.join(" ")).toContain("weggeschreven als geen waarde");
    expect(find(parse(out.xml), "values").textContent!.split(";")[2].split(",")[24]).toBe(BRO_VOID);
  });

  it("controleert aanvullend onderzoek en verwijderde lagen", () => {
    const cpt = gef(), base: BroCptSupplement = { ...complete, additionalInvestigationPerformed: "ja", investigationDate: "2026-10-29", predrilledDepth: 1.5 };
    expect(errorsOf(cpt, base)).toEqual(["additionalInvestigationPerformed"]);
    const layers = [{ upperBoundary: 0, lowerBoundary: 0.5, description: "klinkers" }, { upperBoundary: 0.5, lowerBoundary: 1.5, description: "zand, puinhoudend" }];
    expect(errorsOf(cpt, { ...base, removedLayers: layers })).toEqual([]);
    expect(errorsOf(cpt, { ...base, removedLayers: [layers[1]] })).toEqual(["removedLayers"]);
    expect(errorsOf(cpt, { ...base, removedLayers: [layers[0]] })).toEqual(["removedLayers"]);
    expect(errorsOf(cpt, { ...base, predrilledDepth: 0, removedLayers: layers })).toContain("removedLayers");
    expect(errorsOf(cpt, { ...complete, conditions: "regen" })).toEqual(["additionalInvestigationPerformed"]);
    const doc = parse(writeBroCptXml(cpt, { ...base, removedLayers: layers, groundwaterLevel: 1.2, conditions: "regen" }).xml);
    expect(children(find(doc, "CPT")).slice(-2)).toEqual(["additionalInvestigation", "conePenetrometerSurvey"]);
    expect(children(find(doc, "additionalInvestigation"))).toEqual(["investigationDate", "conditions", "groundwaterLevel", "removedLayer", "removedLayer"]);
    expect(Array.from(find(doc, "removedLayer").children).map((c) => c.textContent)).toEqual(["1", "0.00", "0.50", "klinkers"]);
    expect(find(doc, "predrilledDepth").textContent).toBe("1.50");
  });
});

describe("BRO-sondering opnieuw als registratieverzoek", () => {
  const cpt = parseBroCptXml(broSource, "bedrock-example.xml");
  const s = prefillSupplement(cpt);

  it("vult de aanvullingen uit de oorspronkelijke BRO-XML en is daarmee volledig", () => {
    expect(s).toMatchObject({ deliveryAccountableParty: "32164140", deliveryContext: "publiekeTaak", surveyPurpose: "infrastructuurLand",
      researchReportDate: "2019-04-23", cptStandard: "ISO22476D1", qualityClass: "klasse2", horizontalPositioningMethod: "RTKGPS5tot10cm",
      verticalPositioningMethod: "RTKGPS4tot10cm", cptMethod: "elektrischContinu", stopCriterion: "einddiepte", predrilledDepth: 0,
      startTime: "2019-04-17T13:25:00+02:00", coneDescription: "Hyson", conePenetrometerType: "I-CFXY-15/190206", coneSurfaceArea: 1500, coneDiameter: 44,
      coneSurfaceQuotient: 0.67, frictionSleeveSurfaceArea: 22530, additionalInvestigationPerformed: "nee",
      zeroLoad: { coneResistanceBefore: 0.173, coneResistanceAfter: 0.109, inclinationEWBefore: -2, inclinationEWAfter: -1 } });
    expect(blocking(checkBroCpt(cpt, s, { today: "2026-11-20" }))).toEqual([]);
  });

  it("geeft na schrijven en lezen dezelfde meetpunten, bronkolommen en kerngegevens", () => {
    const read = parseBroCptXml(writeBroCptXml(cpt, s).xml, "terug.xml");
    expect(read.points.length).toBe(cpt.points.length);
    expect(core(read)).toEqual(core(cpt));
    const columns = (c: Cpt) => c.points.map((p) => RESULT_COLUMNS.map((col) => p.parameters?.[col.key] ?? null));
    expect(columns(read)).toEqual(columns(cpt));
    expect(read.position).toEqual(cpt.position);
    expect(read.metadata).toMatchObject({ date: cpt.metadata.date, ground_level_nap: cpt.metadata.ground_level_nap, predrilled_depth_m: 0, quality_regime: "IMBRO" });
    for (const key of ["deliveryContext", "surveyPurpose", "cptStandard", "qualityClass", "cptMethod", "stopCriterion", "conePenetrometerType",
      "coneSurfaceArea", "coneSurfaceQuotient", "frictionSleeveSurfaceArea", "horizontalPositioningMethod", "finalDepth"])
      expect(read.metadata.extra?.[key], key).toBe(cpt.metadata.extra?.[key]);
    expect(broCptTable(read).determined).toEqual(broCptTable(cpt).determined);
  });

  it("weigert een sondering waarbij dissipatietests zijn uitgevoerd", () => {
    const withTest = parseBroCptXml(broSource.replace("<cptcommon:dissipationTestPerformed>nee<", "<cptcommon:dissipationTestPerformed>ja<"), "dis.xml");
    expect(blocking(checkBroCpt(withTest, prefillSupplement(withTest))).map((i) => i.message).join(" ")).toContain("dissipatietests");
  });
});

describe("aanvullingen bij de sondering", () => {
  it("blijven bij de sondering bewaard en gaan vóór het bronbestand", () => {
    const stored = withSupplement(gef(), { ...complete, coneDescription: "" });
    expect(readSupplement(stored)).toEqual({ ...complete, coneDescription: undefined });
    expect(readSupplement(JSON.parse(JSON.stringify(stored)))?.qualityClass).toBe("klasse2");
    expect(prefillSupplement(stored).requestReference).toBe("verzoek-1");
    expect(readSupplement(gef())).toBeUndefined();
  });

  it("zet datum en tijd om naar een tijdstip met de Nederlandse tijdzone van dat moment", () => {
    expect(dutchDateTime("2026-01-15", "09:30")).toBe("2026-01-15T09:30:00+01:00");
    expect(dutchDateTime("2026-07-15", "9:30:15")).toBe("2026-07-15T09:30:15+02:00");
    expect(dutchDateTime("2026-07-15", "25:00")).toBeUndefined();
  });
});
