/**
 * Browser-zijdige BRO CPT XML-parser — pure TypeScript port van de
 * Rust parser in crates-warehouse/cpt-core/src/bro/mod.rs.
 *
 * Bedoeld als fallback voor de webversie zodat een gebruiker een
 * BRO sondering kan openen ("Open in viewer" knop op de Kaart, of
 * "Maak project + voeg toe") zonder dat invoke('open_cpt') hoeft.
 *
 * Verwacht een `dispatchDataResponse` payload zoals geserveerd door
 * https://publiek.broservices.nl/sr/cpt/v1/objects/{broId}. De
 * Dezelfde parser wordt gebruikt door browser en desktop. Diagnostiek blijft
 * bij het CPT bewaard; afnemende diepterecords worden afzonderlijk bewaard.
 *
 * Sync met:
 *   - crates-warehouse/cpt-core/src/bro/mod.rs
 *   - crates-warehouse/cpt-core/src/bro/columns.rs
 */

import { BRO_CHANNELS, maskPreExcavation } from "./bedrockCompatibility";
import type { Cpt, MeasurementPoint } from "./cpt";
import { attachValidation, type ValidationReport } from "../validation/report";
import { excludeDepthOutliers } from "../validation/depthOutliers";

/** BRO 25-koloms data-array — vaste volgorde per BRO IMBRO/A standaard. */
const COLUMN_ORDER = [
  "length",
  "depth",
  "elapsedTime",
  "qc",
  "correctedQc",
  "netQc",
  "magX",
  "magY",
  "magZ",
  "magTotal",
  "electricCond",
  "inclEw",
  "inclNs",
  "inclX",
  "inclY",
  "inclination",
  "magInclination",
  "magDeclination",
  "fs",
  "poreRatio",
  "temp",
  "u1",
  "u2",
  "u3",
  "rf",
] as const;

const VOID_VALUE = -999999.0;

/** Sniff — is dit XML waarschijnlijk een BRO CPT dispatch-document? */
export function looksLikeBroCptXml(xml: string): boolean {
  const head = xml.slice(0, 4096);
  return (
    /<\s*CPT_O\b/.test(head) ||
    /<\s*[\w-]+:CPT_O\b/.test(head) ||
    head.includes("xsd/dscpt/") ||
    head.includes("xsd/cptcommon/")
  );
}

/**
 * Parse een BRO CPT XML naar onze Cpt-struct. Throws met een uitleg-
 * string als verplichte velden ontbreken (broId of cptResult/values).
 */
export function parseBroCptXml(xml: string, filename: string): Cpt {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const errs = doc.getElementsByTagName("parsererror");
  if (errs.length > 0) {
    throw new Error(`BRO CPT XML parse-fout: ${errs[0].textContent ?? ""}`);
  }

  const objects = Array.from(doc.getElementsByTagName("*")).filter(el => el.localName === "CPT_O");
  if(objects.length > 1) throw new Error("BRO XML bevat meerdere CPT-objecten. Splits het document per CPT om stil gegevensverlies te voorkomen.");
  const report:ValidationReport={format:"BRO-CPT",diagnostics:[],records:0,points:0,voids:0,omittedRecords:0,depthMethod:"corrected-depth"};
  const broId = textByLocalName(doc.documentElement, "broId");
  if (!broId) throw new Error("BRO CPT: ontbrekende broId");

  // ── RD-coordinaten ───────────────────────────────────────────
  // deliveredLocation/pos = RD (EPSG:28992). standardizedLocation
  // gebruiken we niet (die is WGS84) want we willen RD in Position.
  let xRd: number | undefined;
  let yRd: number | undefined;
  const deliveredLoc = findByLocalName(doc.documentElement, "deliveredLocation");
  if (deliveredLoc) {
    const pos = textByLocalName(deliveredLoc, "pos");
    if (pos) {
      const posEl=findByLocalName(deliveredLoc,"pos");
      const srs=posEl?.getAttribute("srsName") || deliveredLoc.getAttribute("srsName") || "";
      const rd=/(?:EPSG(?::|\/|::)|\/EPSG\/0\/)28992$/i.test(srs);
      if(!rd)report.diagnostics.push({severity:"warning",code:"UNKNOWN_XY_CRS",message:`Locatiestelsel '${srs || "ontbreekt"}' is niet expliciet RD/EPSG:28992; locatie niet op kaart gezet.`});
      const parts = rd ? pos.trim().split(/\s+/).map(Number) : [];
      if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        xRd = parts[0];
        yRd = parts[1];
      }
    }
  }

  // ── Verticale offset (Z-NAP) ────────────────────────────────
  let zNap: number | undefined;
  const verticalPos = findByLocalName(doc.documentElement, "deliveredVerticalPosition");
  if (verticalPos) {
    const offset = textByLocalName(verticalPos, "offset");
    if (offset) {
      const el=findByLocalName(verticalPos,"offset"),unit=el?.getAttribute("uom")||"m",v=Number(offset);
      const factor:Record<string,number>={m:1,cm:0.01,mm:0.001};
      if(Number.isFinite(v) && factor[unit]!=null){zNap=v*factor[unit];if(unit!=="m")report.diagnostics.push({severity:"warning",code:"UNIT_CONVERSION",message:`Verticale offset van ${unit} naar m omgerekend; broneenheid bewaard.`});}
      else report.diagnostics.push({severity:"warning",code:"UNKNOWN_HEIGHT_UNIT",message:`Verticale offset '${offset}' met eenheid '${unit}' is niet als NAP-hoogte gebruikt.`});
    }
  }

  const verticalDatum=textByLocalName(verticalPos??doc.documentElement,"verticalDatum");
  if(zNap!==undefined && verticalDatum?.toUpperCase()!=="NAP"){
    report.diagnostics.push({severity:"warning",code:"UNKNOWN_Z_DATUM",message:`Verticaal datum '${verticalDatum??"ontbreekt"}' is niet expliciet NAP; offset blijft als brongrootheid bewaard.`});zNap=undefined;
  }

  // ── Rapportdatum ────────────────────────────────────────────
  let date: string | undefined;
  const reportDateEl = findByLocalName(doc.documentElement, "researchReportDate");
  if (reportDateEl) {
    const d = textByLocalName(reportDateEl, "date");
    if (d) date = d;
  }

  // ── Extras (curated whitelist) ─────────────────────────────
  const EXTRA_FIELDS = [
    "objectIdAccountableParty",
    "qualityRegime",
    "qualityClass",
    "accuracyClass",
    "deliveryContext",
    "surveyPurpose",
    "cptStandard",
    "researchOperator",
    "researchReportSubmittedBy",
    "stopCriterion",
    "cptMethod",
    "predrilledDepth",
    "finalDepth",
    "finalDepthBoring",
    "groundwaterLevel",
    "conePenetrometerType",
    "conePenetrometerName",
    "conePenetrometerDescription",
    "coneSurfaceArea",
    "coneSurfaceQuotient",
    "frictionSleeveSurfaceArea",
    "frictionSleeveSurfaceQuotient",
    "frictionSleeveDistance",
    "conePresentationLength",
    "linearSlopeDetected",
    "verticalDatum",
    "localVerticalReferencePoint",
    "horizontalPositioningMethod",
    "deliveredVerticalPositioningMethod",
    "calibrationOperator",
    "calibrationDate",
    "dissipationTestPerformed",
    "sondageIdAccountableParty",
    "sondageId",
  ];
  const extra: Record<string, string> = {};
  const measurements:Array<{name:string;value:number|null;unit:string}>=[];
  for(const el of Array.from(doc.getElementsByTagName("*"))){
    const unit=el.getAttribute("uom");if(unit && el.children.length===0){const raw=el.textContent?.trim()??"",value=Number(raw);measurements.push({name:el.localName,value:raw&&Number.isFinite(value)?value:null,unit});}
  }
  for (const name of EXTRA_FIELDS) {
    const v = textByLocalName(doc.documentElement, name);
    if (v) extra[name] = v;
  }

  // Preserve leaf metadata, including vocabulary values unknown to this version.
  for(const el of Array.from(doc.getElementsByTagName("*"))){
    if(el.children.length===0 && !["values","pos"].includes(el.localName)){
      const value=el.textContent?.trim();if(value && !(el.localName in extra))extra[el.localName]=value;
    }
  }
  const regime=extra.qualityRegime;
  for(const field of ["qualityClass","cptStandard","researchOperator"]){
    if(!extra[field])report.diagnostics.push({severity:"info",code:"MISSING_REGIME_FIELD",message:`${field}: ${regime === "IMBRO/A" ? "ontbreekt volgens regime IMBRO/A" : "ontbreekt; controleer de bron"}.`});
  }

  // ── Data-block uit cptResult/values ────────────────────────
  // Let op: we wíllen specifiek cptResult/values, NIET
  // dissipationTest/values. We zoeken dus eerst cptResult en
  // pakken daaruit values.
  const cptResult = findByLocalName(doc.documentElement, "cptResult");
  const dataBlock = cptResult ? textByLocalName(cptResult, "values") : undefined;
  if (!dataBlock) {
    throw new Error("BRO CPT: ontbrekend cptResult/values data-block");
  }

  // ── Parse data-block ───────────────────────────────────────
  const encoding=findByLocalName(cptResult!,"TextEncoding");
  const tokenSeparator=encoding?.getAttribute("tokenSeparator")||",",blockSeparator=encoding?.getAttribute("blockSeparator")||";",decimalSeparator=encoding?.getAttribute("decimalSeparator")||".";
  if(tokenSeparator===blockSeparator || tokenSeparator===decimalSeparator || decimalSeparator.length!==1)throw new Error("BRO TextEncoding bevat dubbelzinnige scheidingstekens.");
  if(decimalSeparator!==".")report.diagnostics.push({severity:"warning",code:"DECIMAL_SEPARATOR",message:`BRO decimaalteken '${decimalSeparator}' wordt expliciet naar punt omgerekend.`});
  const parameters=findByLocalName(doc.documentElement,"parameters");
  const flags=parameters?Array.from(parameters.children):[];
  const columns=flags.length?flags.map(el=>BRO_CHANNELS[el.localName]??el.localName):[...COLUMN_ORDER];
  const enabled=flags.length?flags.map((el,i)=>{
    const value=el.textContent?.trim().toLowerCase();
    if(value!=="ja"&&value!=="nee")report.diagnostics.push({severity:"warning",code:"UNKNOWN_CHANNEL_FLAG",message:`Onbekende kanaalvlag '${value}' voor ${el.localName}; kanaal wordt niet geïnterpreteerd.`,column:i+1});
    if(!BRO_CHANNELS[el.localName])report.diagnostics.push({severity:"warning",code:"UNKNOWN_BRO_COLUMN",message:`Kanaal ${el.localName} blijft als oorspronkelijke parameter bewaard.`,column:i+1});
    return value==="ja";
  }):columns.map(()=>true);
  const rawParsed=parseDataBlock(dataBlock,zNap,report,{columns,enabled,tokenSeparator,blockSeparator,decimalSeparator});
  const predrill=measurements.find(m=>m.name==='predrilledDepth');
  const predrillFactor:Record<string,number>={m:1,cm:0.01,mm:0.001};
  const predrilledDepth=predrill?predrill.value==null||predrillFactor[predrill.unit]==null?undefined:predrill.value*predrillFactor[predrill.unit]:extra.predrilledDepth!=null&&Number.isFinite(Number(extra.predrilledDepth))?Number(extra.predrilledDepth):undefined;
  if(predrill&&predrilledDepth===undefined)report.diagnostics.push({severity:"warning",code:"UNKNOWN_PREDRILL_UNIT",message:`Voorgeboorde diepte met eenheid '${predrill.unit}' niet als meters gebruikt.`});
  const masked=maskPreExcavation(rawParsed,predrilledDepth);
  for(const record of masked.masked)report.diagnostics.push({severity:"info",code:"PRE_EXCAVATED",message:"Kanalen boven voorgeboorde diepte gemaskeerd; bronwaarden blijven bewaard.",record});
  const parsed=masked.points;
  const {points,excluded}=excludeDepthOutliers(parsed);
  if(excluded.length){
    extra["ogs:bro-outliers"]=JSON.stringify({all:parsed,excluded,included:false});
    report.diagnostics.push({severity:"warning",code:"DEPTH_OUTLIERS",message:`${excluded.length} records buiten de langste niet-afnemende dieptereeks standaard uitgesloten. Bronrecords: ${excluded.join(", ")}. Schakel ze desgewenst in bij Validatie.`});
  }
  report.points=points.length;

  return attachValidation({
    id: broId,
    metadata: {
      measurements,
      predrilled_depth_m: predrilledDepth,
      quality_regime: regime,
      project_name: undefined,
      project_number: undefined,
      date,
      equipment: undefined,
      ground_level_nap: zNap,
      source_file: filename,
      extra: Object.keys(extra).length > 0 ? extra : undefined,
    },
    position:
      typeof xRd === "number" && typeof yRd === "number"
        ? { x_rd: xRd, y_rd: yRd, z_nap: zNap }
        : undefined,
    points,
  },report);
}

// ── Data parsing ──────────────────────────────────────────────────

function parseDataBlock(block: string, zNap: number | undefined, report:ValidationReport,options:{columns:string[];enabled:boolean[];tokenSeparator:string;blockSeparator:string;decimalSeparator:string}): MeasurementPoint[] {
  const out:MeasurementPoint[]=[];
  for(const rec of block.split(options.blockSeparator)){
    if(!rec.trim())continue;
    report.records++;const record=report.records;
    const tokens=rec.trim().split(options.tokenSeparator);
    if(tokens.length!==options.columns.length)report.diagnostics.push({severity:"error",code:"COLUMN_COUNT",message:`Verwacht ${options.columns.length} kolommen, ontvangen ${tokens.length}.`,record});
    const nums=tokens.map((token,i)=>{
      const raw=token.trim().split(options.decimalSeparator).join("."),v=Number(raw);
      if(raw === "" || !/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/.test(raw) || !Number.isFinite(v)){
        report.diagnostics.push({severity:"warning",code:"INVALID_NUMBER",message:`Ongeldig getal '${raw}' wordt void; kolom blijft behouden.`,record,column:i+1});return undefined;
      }
      if(v===VOID_VALUE){report.voids++;return undefined;}return v;
    });
    const pt=buildPoint(nums,zNap,options.columns,options.enabled);
    if(!pt || pt.depth<0){report.omittedRecords++;report.diagnostics.push({severity:"error",code:"MISSING_DEPTH",message:"Record zonder geldige niet-negatieve diepte weggelaten.",record});continue;}
    pt.parameters=Object.fromEntries(options.columns.map((key,i)=>[key,nums[i]??null]));
    // Source record is kept for the outlier report and persists through snapshots.
    pt.parameters["source_record"]=record;
    out.push(pt);
  }
  return out;
}

function buildPoint(
  nums: (number | undefined)[],
  zNap: number | undefined,
  columns:string[],enabled:boolean[],
): MeasurementPoint | null {
  const p: MeasurementPoint = { depth: 0 };
  let haveDepth = false;

  for (let i = 0; i < columns.length; i++) {
    const v = nums[i];
    const field = columns[i];
    if(!enabled[i])continue;
    switch (field) {
      case "depth":
        if (v !== undefined) {
          p.depth = v;
          haveDepth = true;
        }
        break;
      case "length":
        // Length is alleen fallback als er geen Depth-kolom is.
        if (!haveDepth && v !== undefined) {
          p.depth = v;
          haveDepth = true;
        }
        break;
      case "qc":
        p.qc = v;
        break;
      case "fs":
        p.fs = v;
        break;
      case "rf":
        p.rf = v;
        break;
      case "u2":
        p.u2 = v;
        break;
      case "inclination":
        p.inclination = v;
        break;
      default:
        // Andere kolommen (magX/Y/Z, elapsedTime, electricCond, …)
        // worden niet opgeslagen in MeasurementPoint.
        break;
    }
  }
  if (!haveDepth) return null;

  // Derive Rf = 100 * fs / qc als de kolom ontbreekt.
  if (p.rf === undefined && p.qc !== undefined && p.fs !== undefined && p.qc > 0) {
    p.rf = (100 * p.fs) / p.qc;
  }

  if (typeof zNap === "number") {
    p.depth_nap = zNap - p.depth;
  }

  return p;
}

// ── DOM helpers ──────────────────────────────────────────────────

function findByLocalName(root: Element, name: string): Element | null {
  const all = root.getElementsByTagName("*");
  for (let i = 0; i < all.length; i++) {
    if (all[i].localName === name) return all[i];
  }
  return null;
}

function textByLocalName(root: Element, name: string): string | undefined {
  const el = findByLocalName(root, name);
  return el?.textContent?.trim() || undefined;
}

/** Open every CPT object explicitly; namespace declarations are retained by XMLSerializer. */
export function parseBroCptXmlMany(xml:string,filename:string):Cpt[] {
 const doc=new DOMParser().parseFromString(xml,"text/xml");
 if(doc.getElementsByTagName("parsererror").length)throw new Error("BRO CPT XML parse-fout");
 const objects=Array.from(doc.getElementsByTagName("*")).filter(el=>el.localName==="CPT_O");
 if(objects.length<=1)return [parseBroCptXml(xml,filename)];
 const cpts=objects.map(object=>parseBroCptXml(new XMLSerializer().serializeToString(object),filename));
 if(new Set(cpts.map(c=>c.id)).size!==cpts.length)throw new Error("BRO document bevat dubbele CPT-identificaties; geen gegevens overschreven.");
 return cpts;
}
