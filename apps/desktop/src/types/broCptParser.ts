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
      const v = parseFloat(offset);
      if (!isNaN(v)) zNap = v;
    }
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
  const parsed = parseDataBlock(dataBlock, zNap, report);
  const {points,excluded}=excludeDepthOutliers(parsed);
  if(excluded.length){
    extra["ogs:bro-outliers"]=JSON.stringify({all:parsed,excluded,included:false});
    report.diagnostics.push({severity:"warning",code:"DEPTH_OUTLIERS",message:`${excluded.length} records buiten de langste niet-afnemende dieptereeks standaard uitgesloten. Bronrecords: ${excluded.join(", ")}. Schakel ze desgewenst in bij Validatie.`});
  }
  report.points=points.length;

  return attachValidation({
    id: broId,
    metadata: {
      predrilled_depth_m: Number.isFinite(Number(extra.predrilledDepth)) ? Number(extra.predrilledDepth) : undefined,
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

function parseDataBlock(block: string, zNap: number | undefined, report:ValidationReport): MeasurementPoint[] {
  const out:MeasurementPoint[]=[];
  for(const rec of block.split(";")){
    if(!rec.trim())continue;
    report.records++;const record=report.records;
    const tokens=rec.trim().split(",");
    if(tokens.length!==COLUMN_ORDER.length)report.diagnostics.push({severity:"error",code:"COLUMN_COUNT",message:`Verwacht 25 kolommen, ontvangen ${tokens.length}.`,record});
    const nums=tokens.map((token,i)=>{
      const raw=token.trim(),v=Number(raw);
      if(raw === "" || !/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/.test(raw) || !Number.isFinite(v)){
        report.diagnostics.push({severity:"warning",code:"INVALID_NUMBER",message:`Ongeldig getal '${raw}' wordt void; kolom blijft behouden.`,record,column:i+1});return undefined;
      }
      if(v===VOID_VALUE){report.voids++;return undefined;}return v;
    });
    const pt=buildPoint(nums,zNap);
    if(!pt || pt.depth<0){report.omittedRecords++;report.diagnostics.push({severity:"error",code:"MISSING_DEPTH",message:"Record zonder geldige niet-negatieve diepte weggelaten.",record});continue;}
    pt.parameters=Object.fromEntries(COLUMN_ORDER.map((key,i)=>[key,nums[i]??null]));
    // Source record is kept for the outlier report and persists through snapshots.
    pt.parameters["source_record"]=record;
    out.push(pt);
  }
  return out;
}

function buildPoint(
  nums: (number | undefined)[],
  zNap: number | undefined,
): MeasurementPoint | null {
  const p: MeasurementPoint = { depth: 0 };
  let haveDepth = false;

  for (let i = 0; i < COLUMN_ORDER.length; i++) {
    const v = nums[i];
    const field = COLUMN_ORDER[i];
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
