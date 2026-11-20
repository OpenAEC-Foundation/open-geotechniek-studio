/**
 * Vaste gegevens van het BRO-registratieverzoek voor geotechnisch sondeeronderzoek (CPT).
 *
 * Bronnen (openbaar, geraadpleegd op 2026-11-20):
 *  - Catalogus Geotechnisch Sondeeronderzoek (CPT), vastgestelde versie 1 september 2022,
 *    https://docs.geostandaarden.nl/bro/def-im-CPT-20220901/ (hierna "catalogus").
 *  - Berichtschema isCPT 1.1: https://schema.broservices.nl/xsd/iscpt/1.1/iscpt-messages.xsd
 *    (version 1.1.0), met cptcommon 1.1 (version 1.1.0), brocommon 3.0 (version 3.0.8) en de
 *    BRO-profielen van gml, om, sampling en swe (profile/.../1.0).
 *  - Recorddefinitie van de meetreeks:
 *    https://schema.broservices.nl/xsd/cptcommon/1.1/cpttestresult_record.xml
 *    (vaste volgorde van de 25 kolommen en -999999 als waarde voor "geen waarde").
 *
 * Alleen het kwaliteitsregime IMBRO wordt geschreven; de waarden die de catalogus alleen
 * voor IMBRO/A toestaat staan hier dus niet in.
 */

export const BRO_CPT_SPEC = {
  catalogue: "Catalogus Geotechnisch Sondeeronderzoek (CPT), vastgestelde versie 1 september 2022",
  catalogueUrl: "https://docs.geostandaarden.nl/bro/def-im-CPT-20220901/",
  messageSchema: "isCPT 1.1 (iscpt-messages.xsd 1.1.0, cptcommon.xsd 1.1.0, brocommon.xsd 3.0.8)",
  qualityRegime: "IMBRO",
} as const;

export const NS = {
  iscpt: "http://www.broservices.nl/xsd/iscpt/1.1",
  brocom: "http://www.broservices.nl/xsd/brocommon/3.0",
  cptcommon: "http://www.broservices.nl/xsd/cptcommon/1.1",
  gml: "http://www.opengis.net/gml/3.2",
  om: "http://www.opengis.net/om/2.0",
  sampling: "http://www.opengis.net/sampling/2.0",
  swe: "http://www.opengis.net/swe/2.0",
  xlink: "http://www.w3.org/1999/xlink",
  xsi: "http://www.w3.org/2001/XMLSchema-instance",
} as const;

/** RD New; dezelfde schrijfwijze als de uitgifteservice van de BRO gebruikt. */
export const SRS_RD = "urn:ogc:def:crs:EPSG::28992";
export const RESULT_RECORD_URL = "https://schema.broservices.nl/xsd/cptcommon/1.1/cpttestresult_record.xml";
/** Waarde voor "geen waarde" in de meetreeks (cpttestresult_record.xml, swe:nilValue). */
export const BRO_VOID = "-999999";
/**
 * Scheidingstekens van de meetreeks. Het schema eist alleen dát ze in swe:TextEncoding staan;
 * deze keuze is die van de uitgifteservice van de BRO zelf.
 */
export const TEXT_ENCODING = { decimalSeparator: ".", tokenSeparator: ",", blockSeparator: ";" } as const;

export interface CodeOption { value: string; label: string }
const codes = (list: Record<string, string>): CodeOption[] => Object.entries(list).map(([value, label]) => ({ value, label }));

/** Catalogus hoofdstuk 7, alleen de waarden met een vinkje onder IMBRO. */
export const CODE_LISTS = {
  deliveryContext: codes({ publiekeTaak: "Publieke taakuitvoering", MBW: "Mijnbouwwet", WW: "Waterwet" }),
  surveyPurpose: codes({
    bouwwerkConstructie: "Bouwwerken en constructies", controleOnderzoek: "Controle na werkzaamheden",
    infrastructuurLand: "Wegen, spoor, fiets- en voetpaden", infrastructuurWater: "Waterwegen",
    milieuonderzoek: "Milieuonderzoek", overigOnderzoek: "Overig onderzoek", vergunning: "Onderbouwing vergunning", waterkering: "Waterkeringen",
  }),
  cptStandard: codes({
    ISO22476D1: "NEN-EN-ISO 22476 deel 1", ISO22476D12: "NEN-EN-ISO 22476 deel 12", NEN5140: "NEN 5140",
    ISO19901d8v2014: "ISO 19901-8:2014 (op zee)",
  }),
  qualityClass: codes({ klasse1: "Klasse 1", klasse2: "Klasse 2", klasse3: "Klasse 3", klasse4: "Klasse 4", klasse5: "Klasse 5", klasse6: "Klasse 6", klasse7: "Klasse 7" }),
  localVerticalReferencePoint: codes({ maaiveld: "Maaiveld", waterbodem: "Waterbodem" }),
  horizontalPositioningMethod: codes({
    RTKGPS0tot2cm: "RTK-GPS, kleiner dan 2 cm", RTKGPS2tot5cm: "RTK-GPS, 2 tot 5 cm", RTKGPS5tot10cm: "RTK-GPS, 5 tot 10 cm",
    RTKGPS10tot50cm: "RTK-GPS zonder fix, 10 tot 50 cm", DGPS50tot200cm: "DGPS, 50 tot 200 cm", GPS200tot1000cm: "GPS, 200 tot 1000 cm",
    tachymetrie0tot10cm: "Tachymetrie, kleiner dan 10 cm", tachymetrie10tot50cm: "Tachymetrie, 10 tot 50 cm",
  }),
  verticalPositioningMethod: codes({
    RTKGPS0tot4cm: "RTK-GPS, kleiner dan 4 cm", RTKGPS4tot10cm: "RTK-GPS, 4 tot 10 cm", RTKGPS10tot20cm: "RTK-GPS zonder fix, 10 tot 20 cm",
    RTKGPS20tot100cm: "RTK-GPS zonder fix, 20 tot 100 cm", tachymetrie0tot10cm: "Tachymetrie, kleiner dan 10 cm",
    tachymetrie10tot50cm: "Tachymetrie, 10 tot 50 cm", waterpassing0tot2cm: "Waterpassing, kleiner dan 2 cm",
    waterpassing2tot4cm: "Waterpassing, 2 tot 4 cm", waterpassing4tot10cm: "Waterpassing, 4 tot 10 cm",
    AHN2: "AHN2 (2007-2012)", AHN3: "AHN3 (2014-2019)",
  }),
  cptMethod: codes({
    elektrischContinu: "Elektrisch, continu", elektrischDiscontinu: "Elektrisch, discontinu",
    mechanischContinu: "Mechanisch, continu", mechanischDiscontinu: "Mechanisch, discontinu",
  }),
  stopCriterion: codes({
    einddiepte: "Einddiepte bereikt", conusweerstand: "Maximale conusweerstand", wegdrukkracht: "Maximale wegdrukkracht",
    wrijvingsweerstand: "Maximale wrijvingsweerstand", waterspanning: "Maximale waterspanning", hellingshoek: "Maximale hellingshoek",
    obstakel: "Obstakel geraakt", bezwijkrisico: "Risico op bezwijken of knikken", storing: "Storing",
  }),
} as const;
export type CodeListName = keyof typeof CODE_LISTS;

/** Catalogus 6.3.6.4: welke kwaliteitsklassen bij welke sondeernorm horen. */
export const CLASSES_BY_STANDARD: Record<string, string[]> = {
  NEN5140: ["klasse1", "klasse2", "klasse3", "klasse4"],
  ISO22476D1: ["klasse1", "klasse2", "klasse3", "klasse4"],
  ISO22476D12: ["klasse5", "klasse6", "klasse7"],
  ISO19901d8v2014: ["klasse1", "klasse2", "klasse3"],
};

export interface ResultColumn {
  /** Elementnaam in cptcommon:parameters en veldnaam in de recorddefinitie. */
  name: string;
  /** Sleutel waaronder de BRO-lezer de bronwaarde in `MeasurementPoint.parameters` bewaart. */
  key: string;
  label: string;
  unit: string;
  /** Cijfers achter het scheidingsteken (catalogus 6.3.13, "Meetwaarde N.N"). */
  decimals: number;
  /** Waardebereik (catalogus 6.3.13). */
  min: number;
  max: number;
}
const col = (name: string, key: string, label: string, unit: string, decimals: number, min: number, max: number): ResultColumn => ({ name, key, label, unit, decimals, min, max });

/** De 25 kolommen van de meetreeks, in de vaste volgorde van cpttestresult_record.xml. */
export const RESULT_COLUMNS: readonly ResultColumn[] = [
  col("penetrationLength", "length", "sondeertrajectlengte", "m", 3, 0, 200),
  col("depth", "depth", "diepte", "m", 3, 0, 200),
  col("elapsedTime", "elapsedTime", "verlopen tijd", "s", 1, 0, 68400),
  col("coneResistance", "qc", "conusweerstand", "MPa", 3, -1, 200),
  col("correctedConeResistance", "correctedQc", "gecorrigeerde conusweerstand", "MPa", 3, -1, 200),
  col("netConeResistance", "netQc", "netto conusweerstand", "MPa", 3, -1, 200),
  col("magneticFieldStrengthX", "magX", "magnetische veldsterkte x", "nT", 0, -300000, 300000),
  col("magneticFieldStrengthY", "magY", "magnetische veldsterkte y", "nT", 0, -300000, 300000),
  col("magneticFieldStrengthZ", "magZ", "magnetische veldsterkte z", "nT", 0, -300000, 300000),
  col("magneticFieldStrengthTotal", "magTotal", "totale magnetische veldsterkte", "nT", 0, -300000, 300000),
  col("electricalConductivity", "electricCond", "elektrische geleidbaarheid", "S/m", 3, 0, 10),
  col("inclinationEW", "inclEw", "helling oost-west", "°", 0, -20, 20),
  col("inclinationNS", "inclNs", "helling noord-zuid", "°", 0, -20, 20),
  col("inclinationX", "inclX", "helling x", "°", 0, -20, 20),
  col("inclinationY", "inclY", "helling y", "°", 0, -20, 20),
  col("inclinationResultant", "inclination", "hellingresultante", "°", 0, 0, 20),
  col("magneticInclination", "magInclination", "magnetische inclinatie", "°", 0, -20, 20),
  col("magneticDeclination", "magDeclination", "magnetische declinatie", "°", 0, -20, 20),
  col("localFriction", "fs", "plaatselijke wrijving", "MPa", 3, -0.1, 2),
  col("poreRatio", "poreRatio", "poriënratio", "-", 3, -1, 20),
  col("temperature", "temp", "temperatuur", "°C", 1, -20, 160),
  col("porePressureU1", "u1", "waterspanning u1", "MPa", 3, -1, 10),
  col("porePressureU2", "u2", "waterspanning u2", "MPa", 3, -1, 10),
  col("porePressureU3", "u3", "waterspanning u3", "MPa", 3, -1, 10),
  col("frictionRatio", "rf", "wrijvingsgetal", "%", 1, 0, 100),
];
export const COLUMN_INDEX: Record<string, number> = Object.fromEntries(RESULT_COLUMNS.map((c, i) => [c.key, i]));

/** Nulmeting (cptcommon:ZeroLoadMeasurementType), in schemavolgorde; steeds een paar vooraf/achteraf. */
export const ZERO_LOAD_PAIRS = [
  { name: "coneResistance", label: "Conusweerstand", unit: "MPa" },
  { name: "electricalConductivity", label: "Elektrische geleidbaarheid", unit: "S/m" },
  { name: "inclinationEW", label: "Helling oost-west", unit: "deg" },
  { name: "inclinationNS", label: "Helling noord-zuid", unit: "deg" },
  { name: "inclinationResultant", label: "Hellingresultante", unit: "deg" },
  { name: "localFriction", label: "Plaatselijke wrijving", unit: "MPa" },
  { name: "porePressureU1", label: "Waterspanning u1", unit: "MPa" },
  { name: "porePressureU2", label: "Waterspanning u2", unit: "MPa" },
  { name: "porePressureU3", label: "Waterspanning u3", unit: "MPa" },
] as const;
export type ZeroLoadName = (typeof ZERO_LOAD_PAIRS)[number]["name"];
export type ZeroLoadKey = `${ZeroLoadName}Before` | `${ZeroLoadName}After`;
