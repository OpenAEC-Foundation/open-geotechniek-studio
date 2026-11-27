// Rapportpagina per dissipatietest: de grafiek van de waterspanning tegen de tijd en de kerngetallen.
// Zelfde paginakop, marges en kleuren als de andere tekstpagina's van het sondeerrapport.
import type { jsPDF } from "jspdf";
import type { Cpt } from "../types/cpt";
import { currentBrand } from "../report/reportBrand";
import { richText, richWrap } from "../report/reportText";
import type { ReportFlow } from "../utils/browserReportSections";
import { analyseDissipation, type DissipationResult } from "./analysis";
import { buildChartModel, type TimeAxis } from "./chart";
import { coneAreaFromFile } from "./cptDissipation";
import { FORMULA, FORMULA_SOURCE, INDICATIVE_NOTE, summaryRows, WARNING_NL } from "./summary";
import type { DissipationTest } from "./types";

type Color = [number, number, number];
const INK: Color = [25, 25, 25];
const LABEL: Color = [95, 95, 102];
const RULE: Color = [226, 226, 230];
const GRID: Color = [214, 214, 220];
const NOTE: Color = [150, 128, 96];
const LEFT = 15, WIDTH = 180, BOTTOM = 278;

/** Tekst zonder tekens die de PDF-letter niet heeft (bestandsnamen, kenmerken). */
const plain = (value: string) => value.replace(/[^\x20-\x7E¡-ÿ]/g, "?");

function drawChart(doc: jsPDF, result: DissipationResult, axis: TimeAxis, top: number, height: number, accent: Color) {
  const model = buildChartModel(result, axis);
  const x0 = LEFT + 14, x1 = LEFT + WIDTH - 12, y0 = top + height, w = x1 - x0;
  const px = (v: number) => x0 + v * w, py = (v: number) => y0 - v * height;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  if (!model) {
    doc.setTextColor(...LABEL);
    doc.text("Te weinig meetwaarden voor een grafiek.", LEFT, top + 6);
    return;
  }
  // Raster en assen.
  doc.setLineWidth(0.12);
  for (const tick of model.xTicks) {
    doc.setDrawColor(...(tick.minor ? RULE : GRID));
    doc.line(px(tick.at), top, px(tick.at), y0);
    if (tick.label) { doc.setTextColor(...LABEL); doc.text(tick.label, px(tick.at), y0 + 3.6, { align: "center" }); }
  }
  for (const tick of model.yTicks) {
    doc.setDrawColor(...GRID);
    doc.line(x0, py(tick.at), x1, py(tick.at));
    doc.setTextColor(...LABEL);
    doc.text(tick.label, x0 - 1.5, py(tick.at) + 1, { align: "right" });
  }
  for (const tick of model.uTicks) {
    doc.setDrawColor(...LABEL);
    doc.line(x1, py(tick.at), x1 + 1.2, py(tick.at));
    doc.text(tick.label, x1 + 2, py(tick.at) + 1);
  }
  doc.setDrawColor(...LABEL);
  doc.setLineWidth(0.25);
  doc.rect(x0, top, w, height);
  doc.setTextColor(...INK);
  doc.setFontSize(8);
  richText(doc, axis === "log" ? "Tijd t [s] (logaritmisch)" : "Wortel van de tijd √t [√s]", (x0 + x1) / 2, y0 + 8, { size: 8, align: "center" });
  // Gedraaide tekst loopt omhoog vanaf het ankerpunt: zelf centreren op de as.
  const vertical = (text: string, x: number) => doc.text(text, x, top + height / 2 + doc.getTextWidth(text) / 2, { angle: 90 });
  vertical("Waterspanning u [kPa]", LEFT + 3);
  vertical("U [-]", x1 + 11);

  // Hulplijnen: u_i, u_0, u bij U = 0,5 en t50.
  const dashed = (ax: number, ay: number, bx: number, by: number, color: Color) => {
    doc.setDrawColor(...color); doc.setLineWidth(0.25); doc.setLineDashPattern([1.2, 1], 0);
    doc.line(ax, ay, bx, by); doc.setLineDashPattern([], 0);
  };
  // u_i rechts (de lijn begint linksboven), u_0 links (de lijn eindigt rechtsonder).
  const tag = (text: string, y: number, right: boolean) => { doc.setTextColor(...LABEL); richText(doc, text, right ? x1 - 1.5 : x0 + 1.5, y - 1, { size: 7.5, align: right ? "right" : "left" }); };
  if (model.uiY != null) { dashed(x0, py(model.uiY), x1, py(model.uiY), LABEL); tag(`u_i = ${result.ui!.toFixed(1)} kPa`, py(model.uiY) + (model.uiY > 0.93 ? 4.2 : 0), true); }
  if (model.u0Y != null) { dashed(x0, py(model.u0Y), x1, py(model.u0Y), LABEL); tag(`u_0 = ${result.u0!.toFixed(1)} kPa`, py(model.u0Y), false); }
  if (model.startX != null) dashed(px(model.startX), top, px(model.startX), y0, LABEL);
  if (model.t50X != null && model.u50Y != null) {
    dashed(x0, py(model.u50Y), px(model.t50X), py(model.u50Y), accent);
    dashed(px(model.t50X), py(model.u50Y), px(model.t50X), y0, accent);
  }
  // Meetlijn.
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.45);
  for (let i = 1; i < model.line.length; i++) doc.line(px(model.line[i - 1].x), py(model.line[i - 1].y), px(model.line[i].x), py(model.line[i].y));
  if (model.line.length <= 60) { doc.setFillColor(...INK); for (const p of model.line) doc.circle(px(p.x), py(p.y), 0.45, "F"); }
  if (model.t50X != null && model.u50Y != null) {
    doc.setFillColor(...accent);
    doc.circle(px(model.t50X), py(model.u50Y), 1.1, "F");
    doc.setTextColor(...accent);
    const right = model.t50X < 0.75;
    richText(doc, `t_50 = ${result.t50! >= 100 ? result.t50!.toFixed(0) : result.t50!.toPrecision(3)} s`, px(model.t50X) + (right ? 2 : -2), py(model.u50Y) - 1.6, { size: 8, bold: true, align: right ? "left" : "right" });
  }
}

function drawTest(flow: ReportFlow, cpt: Cpt, test: DissipationTest) {
  const { doc } = flow, accent = currentBrand().accent as Color;
  const result = analyseDissipation(test, coneAreaFromFile(cpt));
  const title = `Dissipatietest ${plain(cpt.id)} - ${test.depth.toFixed(2)} m`;
  flow.page(title);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...LABEL);
  const origin = [test.source === "bro" ? "BRO-XML" : "GEF", test.source_file ? plain(test.source_file) : "", test.start_time ? `begin ${plain(test.start_time)}` : ""].filter(Boolean).join(", ");
  doc.text(`Waterspanning ${result.channel} tegen de tijd bij stilstaande conus. Bron: ${origin}.`, LEFT, flow.y - 4);
  drawChart(doc, result, test.settings?.timeAxis ?? "log", flow.y + 1, 92, accent);
  flow.y += 92 + 16;

  // Kop en tabel met kerngetallen, in twee kolommen.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...accent);
  doc.text("Kerngetallen", LEFT, flow.y);
  doc.setDrawColor(...accent);
  doc.setLineWidth(0.35);
  doc.line(LEFT, flow.y + 1.8, LEFT + WIDTH, flow.y + 1.8);
  flow.y += 7;
  const rows = summaryRows(test, result), half = Math.ceil(rows.length / 2), rowHeight = 4.6, columnWidth = WIDTH / 2 - 4;
  rows.forEach((row, index) => {
    const x = LEFT + (index < half ? 0 : WIDTH / 2 + 4), y = flow.y + (index % half) * rowHeight;
    doc.setTextColor(...LABEL);
    richText(doc, row.nl, x, y, { size: 8 });
    doc.setTextColor(...INK);
    richText(doc, row.value, x + columnWidth, y, { size: 8, align: "right", bold: row.key === "ch" || row.key === "t50" || row.key === "t50Peak" });
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.15);
    doc.line(x, y + 1.3, x + columnWidth, y + 1.3);
  });
  flow.y += half * rowHeight + 4;

  doc.setTextColor(...INK);
  richText(doc, `${FORMULA}   (${FORMULA_SOURCE})`, LEFT, flow.y, { size: 9 });
  flow.y += 6;
  const notes = [...result.warnings.map((warning) => WARNING_NL[warning]), ...(test.notes ?? []).map(plain), INDICATIVE_NOTE];
  doc.setTextColor(...NOTE);
  for (const note of notes)
    for (const line of richWrap(doc, note, WIDTH, { size: 8 })) {
      if (flow.y > BOTTOM) { flow.page(`${title} - vervolg`); doc.setTextColor(...NOTE); }
      richText(doc, line, LEFT, flow.y, { size: 8 });
      flow.y += 3.9;
    }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...INK);
}

/** Eén pagina per dissipatietest van de sondering; zonder tests gebeurt er niets. */
export function drawDissipationPages(flow: ReportFlow, cpt: Cpt) {
  for (const test of cpt.dissipation_tests ?? []) drawTest(flow, cpt, test);
}
