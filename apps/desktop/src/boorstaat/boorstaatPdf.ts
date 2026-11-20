// De boorstaat in het rapport: dezelfde tekenopdrachten als op het scherm, als vectoren in de PDF.
import type { jsPDF } from "jspdf";
import type { Bore } from "../types/bore";
import { pdfText, type ReportFlow } from "../utils/browserReportSections";
import { buildBoorstaat, type BoorstaatLayout, type BoorstaatOptions } from "./boorstaat";
import type { Scene } from "./scene";

/** Tekent de tekenopdrachten op de huidige pagina, met de linkerbovenhoek op (ox, oy) in mm. */
export function drawScene(doc: jsPDF, scene: Scene, ox: number, oy: number): void {
  for (const p of scene.items) {
    if (p.t === "rect") {
      if (p.fill) doc.setFillColor(p.fill);
      if (p.stroke) { doc.setDrawColor(p.stroke); doc.setLineWidth(p.lw ?? 0.2); }
      doc.rect(ox + p.x, oy + p.y, p.w, p.h, p.fill && p.stroke ? "FD" : p.fill ? "F" : "S");
    } else if (p.t === "line") {
      doc.setDrawColor(p.stroke); doc.setLineWidth(p.lw);
      doc.line(ox + p.x1, oy + p.y1, ox + p.x2, oy + p.y2);
    } else if (p.t === "circle") {
      if (p.fill) doc.setFillColor(p.fill);
      if (p.stroke) { doc.setDrawColor(p.stroke); doc.setLineWidth(p.lw ?? 0.15); }
      doc.circle(ox + p.cx, oy + p.cy, p.r, p.fill ? "F" : "S");
    } else if (p.t === "poly") {
      const [a, b, c] = p.points;
      doc.setFillColor(p.fill);
      doc.triangle(ox + a[0], oy + a[1], ox + b[0], oy + b[1], ox + c[0], oy + c[1], "F");
    } else {
      doc.setFont("helvetica", p.bold ? (p.italic ? "bolditalic" : "bold") : p.italic ? "italic" : "normal");
      doc.setFontSize(p.size);
      doc.setTextColor(p.color ?? "#191919");
      doc.text(pdfText(p.text), ox + p.x, oy + p.y, { align: p.align ?? "left" });
    }
  }
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(25); doc.setDrawColor(0); doc.setLineWidth(0.2);
}

/** Eén rapportpagina per boring: paginakop van het rapport met daaronder de boorstaat. */
export function drawBoorstaatPage(flow: ReportFlow, bore: Bore, options: BoorstaatOptions = {}): BoorstaatLayout {
  flow.page(`Boorstaat ${pdfText(bore.id)}`);
  const top = flow.y - 5;
  const layout = buildBoorstaat(bore, { width: 180, height: 283 - top, ...options });
  drawScene(flow.doc, layout.scene, 15, top);
  flow.y = top + layout.scene.height;
  return layout;
}
