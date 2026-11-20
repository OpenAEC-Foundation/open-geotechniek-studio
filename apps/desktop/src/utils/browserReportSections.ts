// Twee tekstonderdelen van het sondeerrapport: de vrije teksten na het voorblad en het testrapport per
// sondering. Beide gebruiken de paginakop van het rapport en de accentkleur van de huisstijl.
import type { jsPDF } from "jspdf";
import type { Cpt, ProjectMeta } from "../types/cpt";
import { currentBrand } from "../report/reportBrand";
import { buildTestReport, MISSING_TEXT, TEST_REPORT_STANDARD } from "./cptTestReport";

/** De lopende pagina van het rapport: `page` begint een nieuwe pagina met kop en zet `y` onder die kop. */
export interface ReportFlow {
  doc: jsPDF;
  y: number;
  page: (title: string) => void;
}

type Color = [number, number, number];
const INK: Color = [25, 25, 25];
const LABEL: Color = [95, 95, 102];
/** Rustige kleur voor wat ontbreekt: valt op naast de inkt, zonder te schreeuwen. */
const MISSING: Color = [150, 128, 96];
const RULE: Color = [226, 226, 230];
const LEFT = 15, WIDTH = 180, BOTTOM = 278;

/** Helvetica in de PDF kent alleen West-Europese tekens; vervang wat anders onleesbaar wordt. */
export function pdfText(value: string): string {
  return value
    .replace(/[‘’‚]/g, "'").replace(/[“”„]/g, '"').replace(/[–—−]/g, "-")
    .replace(/…/g, "...").replace(/≥/g, ">=").replace(/≤/g, "<=").replace(/→/g, "->")
    .replace(/[   ]/g, " ").replace(/\t/g, "    ")
    .replace(/[^\n\x20-\x7E¡-ÿ€]/g, "?");
}

function heading(flow: ReportFlow, title: string, accent: Color) {
  const { doc } = flow;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...accent);
  doc.text(title, LEFT, flow.y);
  doc.setDrawColor(...accent);
  doc.setLineWidth(0.35);
  doc.line(LEFT, flow.y + 1.8, LEFT + WIDTH, flow.y + 1.8);
  flow.y += 7.5;
}

/**
 * De vrije teksten als één hoofdstuk: per tekst een kop in de accentkleur en de tekst eronder.
 * Regels lopen door op de paginabreedte; een volle pagina gaat verder op een vervolgpagina.
 */
export function drawTextChapters(flow: ReportFlow, chapters: Array<{ title: string; body: string }>, pageTitle = "Toelichting") {
  if (!chapters.length) return;
  const { doc } = flow, accent = currentBrand().accent as Color, lineHeight = 5;
  flow.page(pageTitle);
  flow.y += 2;
  chapters.forEach((chapter, index) => {
    if (index) flow.y += 6;
    // Een kop blijft bij zijn eerste regels: anders begint hij op de volgende pagina.
    if (flow.y + 7.5 + 2 * lineHeight > BOTTOM) { flow.page(`${pageTitle} - vervolg`); flow.y += 2; }
    heading(flow, chapter.title, accent);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    for (const paragraph of pdfText(chapter.body).split("\n")) {
      if (!paragraph.trim()) { flow.y += lineHeight * 0.6; continue; }
      for (const row of doc.splitTextToSize(paragraph, WIDTH) as string[]) {
        if (flow.y > BOTTOM) {
          flow.page(`${pageTitle} - vervolg`);
          flow.y += 2;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(10);
          doc.setTextColor(...INK);
        }
        doc.text(row, LEFT, flow.y);
        flow.y += lineHeight;
      }
    }
  });
  doc.setFontSize(9);
  doc.setTextColor(...INK);
}

/** Eén pagina per sondering met de gegevens die een testrapport hoort te bevatten. */
export function drawTestReport(flow: ReportFlow, cpt: Cpt, project: ProjectMeta) {
  const { doc } = flow, accent = currentBrand().accent as Color;
  const title = `Testrapport sondering ${pdfText(cpt.id)}`;
  const labelWidth = 62, valueX = LEFT + labelWidth + 3, valueWidth = WIDTH - labelWidth - 3, rowHeight = 3.9;
  flow.page(title);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...LABEL);
  doc.text(`Gegevens volgens ${TEST_REPORT_STANDARD}, overgenomen uit het sondeerbestand en de projectgegevens.`, LEFT, flow.y - 4);
  doc.setTextColor(...MISSING);
  doc.setFont("helvetica", "italic");
  doc.text(`Wat ontbreekt, staat er als "${MISSING_TEXT}" en moet nog worden aangevuld.`, LEFT, flow.y);
  flow.y += 7;

  for (const group of buildTestReport(cpt, project)) {
    if (flow.y + 7.5 + rowHeight * 2 > BOTTOM) flow.page(`${title} - vervolg`);
    heading(flow, group.title, accent);
    flow.y -= 2;
    for (const row of group.rows) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      const value = row.value == null ? [] : doc.splitTextToSize(pdfText(row.value), valueWidth) as string[];
      doc.setFont("helvetica", "italic");
      const missing = row.value == null ? [MISSING_TEXT] : row.missingPart ? doc.splitTextToSize(pdfText(row.missingPart), valueWidth) as string[] : [];
      const height = (value.length + missing.length) * rowHeight + 1;
      if (flow.y + height > BOTTOM) { flow.page(`${title} - vervolg`); flow.y += 2; doc.setFontSize(8); }
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...LABEL);
      doc.text(row.label, LEFT, flow.y);
      if (value.length) {
        doc.setTextColor(...INK);
        doc.text(value, valueX, flow.y, { lineHeightFactor: rowHeight / (8 * 25.4 / 72) });
      }
      if (missing.length) {
        doc.setFont("helvetica", "italic");
        doc.setTextColor(...MISSING);
        doc.text(missing, valueX, flow.y + value.length * rowHeight, { lineHeightFactor: rowHeight / (8 * 25.4 / 72) });
      }
      flow.y += height;
      doc.setDrawColor(...RULE);
      doc.setLineWidth(0.15);
      doc.line(LEFT, flow.y - rowHeight + 0.4, LEFT + WIDTH, flow.y - rowHeight + 0.4);
    }
    flow.y += 3.5;
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...INK);
}
