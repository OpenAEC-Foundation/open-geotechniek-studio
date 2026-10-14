import type { jsPDF } from "jspdf";
import type { Cpt, ProjectMeta } from "../types/cpt";

type Color = [number, number, number];
const FORGE: Color = [54, 54, 62];
const AMBER: Color = [217, 119, 6];
const GOLD: Color = [245, 158, 11];
const ORANGE: Color = [234, 88, 12];
const GRAY: Color = [161, 161, 170];
const WHITE: Color = [250, 250, 249];
const HEIGHT = 297;

const blend = (a: Color, b: Color, t: number): Color =>
  a.map((v, i) => Math.round(v + (b[i] - v) * t)) as Color;

/** The native report uses millimetres measured from the bottom edge. */
function rect(doc: jsPDF, x: number, y: number, w: number, h: number, color: Color) {
  doc.setFillColor(...color);
  doc.rect(x, HEIGHT - y - h, w, h, "F");
}

function text(doc: jsPDF, value: string, x: number, y: number, size: number, color: Color, bold = false, align: "left" | "center" | "right" = "left") {
  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.setFontSize(size);
  doc.setTextColor(...color);
  doc.text(value, x, HEIGHT - y, { align });
}

function gradient(doc: jsPDF, y: number, h: number) {
  for (let i = 0; i < 24; i++) {
    const t = i / 23;
    const color = t <= .4 ? blend(AMBER, GOLD, t / .4) : blend(GOLD, ORANGE, (t - .4) / .6);
    rect(doc, i * 210 / 24, y, 210 / 24 + .1, h, color);
  }
}

/** Branded single-CPT cover, with the native palette and page geometry. */
export function drawCover(doc: jsPDF, cpt: Cpt, project: ProjectMeta) {
  doc.saveGraphicsState();
  const boundary = HEIGHT * .3;
  rect(doc, 0, boundary, 210, HEIGHT - boundary, FORGE);
  const patternY = boundary + (HEIGHT - boundary) * .55;
  const patternHeight = HEIGHT - patternY;
  doc.setDrawColor(...blend(FORGE, GOLD, .4));
  doc.setLineWidth(.3 * 25.4 / 72);
  for (let x = -patternHeight; x < 210; x += 12) {
    doc.line(x, HEIGHT - patternY, x + patternHeight * 1.4, 0);
  }
  const heights = [6, 9, 4.5, 7.5, 12, 5.5, 10, 8, 6.5, 11, 4, 9.5, 7, 5, 13, 8.5, 6, 10.5, 5.5, 8];
  heights.forEach((h, i) => rect(doc, 8 + i * 10, boundary + 22, 9, h, blend(FORGE, GOLD, .25)));
  gradient(doc, boundary - 1.6, 1.6);
  text(doc, "OpenAEC", 20, HEIGHT - 17, 14, AMBER, true);
  text(doc, "Build free. Build together.", 20, HEIGHT - 25.5, 9, GRAY);
  rect(doc, 13, HEIGHT - 22, 4.5, 7.5, AMBER);
  text(doc, "openaec.org", 196, HEIGHT - 17, 11, AMBER, true, "right");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  let right = 192;
  for (const [label, color] of [["ENGINEERING", [42, 42, 50]], ["OPEN SOURCE", AMBER]] as [string, Color][]) {
    const width = doc.getTextWidth(label) + 14;
    rect(doc, right - width, boundary + 8, width, 8.5, color);
    text(doc, label, right - width / 2, boundary + 11, 8.5, WHITE, true, "center");
    right -= width + 3;
  }

  // Wrap long titles and reserve a separate line for metadata to avoid overlap.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(30);
  const title = project.title.trim() || `Sondering ${cpt.id}`;
  const lines = doc.splitTextToSize(title, 172) as string[];
  const titleLines = lines.slice(0, 3);
  if (lines.length > 3) titleLines[2] = `${titleLines[2].slice(0, -3)}...`;
  text(doc, titleLines.join("\n"), 20, 69, 30, FORGE, true);
  const subtitleY = 69 - titleLines.length * 12;
  text(doc, `Sonderingsrapport · ${project.location || `sondering ${cpt.id}`}`, 20, subtitleY, 12, GRAY);
  const date = project.date.slice(0, 10).split("-").reverse().join("-");
  const metadata = [project.client && `Opdrachtgever: ${project.client}`, project.project_number && `Projectnr: ${project.project_number}`, `Datum: ${date}`].filter(Boolean).join(" · ");
  doc.setFontSize(8.5);
  const metaLines = doc.splitTextToSize(metadata, 172) as string[];
  text(doc, metaLines.slice(0, 2).join("\n"), 20, Math.min(subtitleY - 9, 23), 8.5, GRAY);
  gradient(doc, 0, 2.5);
  text(doc, "Open Geotechniek Studio", 20, 7.5, 9, FORGE, true);
  text(doc, "Sonderingsrapport · pagina 1", 192, 8, 7.5, GRAY, false, "right");
  doc.restoreGraphicsState();
}

export function drawBackCover(doc: jsPDF) {
  doc.saveGraphicsState();
  rect(doc, 0, 0, 210, HEIGHT, FORGE);
  const cy = HEIGHT / 2 + 30 + 18 * .45;
  const back = [105, cy + 9], left = [87, cy], right = [123, cy], front = [105, cy - 9];
  const bottomLeft = [87, cy - 16.2], bottomRight = [123, cy - 16.2], bottomFront = [105, cy - 25.2];
  doc.setDrawColor(...AMBER);
  doc.setLineWidth(1.6 * 25.4 / 72);
  for (const [points, tint] of [
    [[left, front, bottomFront, bottomLeft], .18],
    [[right, front, bottomFront, bottomRight], .34],
    [[back, left, front, right], .55],
  ] as [number[][], number][]) {
    doc.setFillColor(...blend(FORGE, AMBER, tint));
    const [first, ...rest] = points;
    doc.moveTo(first[0], HEIGHT - first[1]);
    rest.forEach(p => doc.lineTo(p[0], HEIGHT - p[1]));
    doc.close().fillStroke();
  }
  text(doc, "Open Geotechniek Studio", 105, HEIGHT / 2 - 4, 22, WHITE, true, "center");
  text(doc, "Build free. Build together.", 105, HEIGHT / 2 - 30, 12, AMBER, false, "center");
  text(doc, "https://github.com/OpenAEC-Foundation", 105, 16, 9, [153, 153, 158], false, "center");
  gradient(doc, 4, 4);
  doc.restoreGraphicsState();
}
