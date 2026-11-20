// Title of a report sheet: bold text with a rule in the accent of the house
// style underneath. Shared by the calculation sheets and the chart sheets.
import type { jsPDF } from "jspdf";
import { reportPalette } from "./reportPalette";
import { richText } from "./reportText";

/** Draws the title with its baseline on `y`; returns the y just below the rule. */
export function drawSheetTitle(doc: jsPDF, text: string, x: number, y: number, width: number): number {
  const p = reportPalette();
  doc.setTextColor(...p.ink);
  richText(doc, text, x, y, { size: 11.5, bold: true });
  doc.setDrawColor(...p.accent);
  doc.setLineWidth(0.6);
  doc.line(x, y + 2, x + width, y + 2);
  doc.setFont("helvetica", "normal");
  return y + 2;
}
