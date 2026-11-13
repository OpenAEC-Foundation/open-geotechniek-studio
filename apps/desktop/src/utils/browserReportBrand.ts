import type { jsPDF } from "jspdf";
import type { Cpt, ProjectMeta } from "../types/cpt";
import { currentBrand, DEFAULT_BRAND, type ReportBrand } from "../report/reportBrand";

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

interface Palette { dark: Color; a: Color; b: Color; c: Color; /** Tekstkleur van naam en website op het donkere vlak. */ onDark: Color }

const lum = (c: Color) => {
  const [r, g, b] = c.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** WCAG-contrastverhouding tussen twee kleuren. */
export const contrast = (x: Color, y: Color) => { const [a, b] = [lum(x), lum(y)].sort((p, q) => q - p); return (a + 0.05) / (b + 0.05); };

/** Kleuren van het voorblad: de standaard OpenAEC-reeks, of afgeleid van de huisstijl. */
export function coverPalette(brand: ReportBrand): Palette {
  const accent = brand.accent as Color;
  const standard = !brand.secondary && accent.every((v, i) => v === AMBER[i]);
  return {
    dark: (brand.dark as Color | undefined) ?? FORGE,
    a: accent,
    b: standard ? GOLD : (brand.secondary as Color | undefined) ?? blend(accent, WHITE, .35),
    c: standard ? ORANGE : blend(accent, [0, 0, 0], .18),
    onDark: contrast(accent, (brand.dark as Color | undefined) ?? FORGE) >= 3 ? accent : WHITE,
  };
}

function gradient(doc: jsPDF, y: number, h: number, p: Palette) {
  for (let i = 0; i < 24; i++) {
    const t = i / 23;
    const color = t <= .4 ? blend(p.a, p.b, t / .4) : blend(p.b, p.c, (t - .4) / .6);
    rect(doc, i * 210 / 24, y, 210 / 24 + .1, h, color);
  }
}

/** Branded single-CPT cover, with the native palette and page geometry. */
export function drawCover(doc: jsPDF, cpt: Cpt | null, project: ProjectMeta, brand: ReportBrand = currentBrand(), kind = "Sonderingsrapport") {
  if (brand.coverImage) { drawTemplateCover(doc, cpt, project, brand.coverImage, kind, (brand.dark as Color | undefined) ?? FORGE); return; }
  doc.saveGraphicsState();
  const accent = brand.accent as Color;
  const p = coverPalette(brand);
  const boundary = HEIGHT * .3;
  rect(doc, 0, boundary, 210, HEIGHT - boundary, p.dark);
  const patternY = boundary + (HEIGHT - boundary) * .55;
  const patternHeight = HEIGHT - patternY;
  doc.setDrawColor(...blend(p.dark, p.b, .4));
  doc.setLineWidth(.3 * 25.4 / 72);
  for (let x = -patternHeight; x < 210; x += 12) {
    doc.line(x, HEIGHT - patternY, x + patternHeight * 1.4, 0);
  }
  const heights = [6, 9, 4.5, 7.5, 12, 5.5, 10, 8, 6.5, 11, 4, 9.5, 7, 5, 13, 8.5, 6, 10.5, 5.5, 8];
  heights.forEach((h, i) => rect(doc, 8 + i * 10, boundary + 22, 9, h, blend(p.dark, p.b, .25)));
  gradient(doc, boundary - 1.6, 1.6, p);
  const logo = brand.logoOnDarkDataUrl ?? brand.logoDataUrl;
  if (logo) {
    // Logo in een kader van maximaal 40 x 12 mm linksboven, naam erachter.
    const props = doc.getImageProperties(logo), h = 12, w = Math.min(40, h * props.width / props.height);
    doc.addImage(logo, 13, 11, w, h);
    text(doc, brand.organization, 13 + w + 4, HEIGHT - 17, 14, p.onDark, true);
  } else {
    text(doc, brand.organization, 20, HEIGHT - 17, 14, p.onDark, true);
    rect(doc, 13, HEIGHT - 22, 4.5, 7.5, accent);
  }
  if (brand.tagline) text(doc, brand.tagline, 20, HEIGHT - 25.5, 9, GRAY);
  if (brand.website) text(doc, brand.website, 196, HEIGHT - 17, 11, p.onDark, true, "right");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  let right = 192;
  // Labels van rechts naar links; het eerste label krijgt de accentkleur.
  for (const [label, color] of brand.badges.map((b, i) => [b, i === 0 ? accent : [42, 42, 50]] as [string, Color]).reverse()) {
    const width = doc.getTextWidth(label) + 14;
    rect(doc, right - width, boundary + 8, width, 8.5, color);
    text(doc, label, right - width / 2, boundary + 11, 8.5, WHITE, true, "center");
    right -= width + 3;
  }

  // Wrap long titles and reserve a separate line for metadata to avoid overlap.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(30);
  const title = project.title.trim() || (cpt ? `Sondering ${cpt.id}` : kind);
  const lines = doc.splitTextToSize(title, 172) as string[];
  const titleLines = lines.slice(0, 3);
  if (lines.length > 3) titleLines[2] = `${titleLines[2].slice(0, -3)}...`;
  text(doc, titleLines.join("\n"), 20, 69, 30, p.dark, true);
  const subtitleY = 69 - titleLines.length * 12;
  text(doc, `${kind} · ${project.location || (cpt ? `sondering ${cpt.id}` : project.project_number || "")}`, 20, subtitleY, 12, GRAY);
  const date = project.date.slice(0, 10).split("-").reverse().join("-");
  const metadata = [project.client && `Opdrachtgever: ${project.client}`, project.project_number && `Projectnr: ${project.project_number}`, `Datum: ${date}`].filter(Boolean).join(" · ");
  doc.setFontSize(8.5);
  const metaLines = doc.splitTextToSize(metadata, 172) as string[];
  text(doc, metaLines.slice(0, 2).join("\n"), 20, Math.min(subtitleY - 9, 23), 8.5, GRAY);
  gradient(doc, 0, 2.5, p);
  if (brand.contact) {
    const contact = doc.splitTextToSize(brand.contact, 172) as string[];
    text(doc, contact[0], 20, 14, 7.5, GRAY);
  }
  text(doc, "Open Geotechniek Studio", 20, 7.5, 9, p.dark, true);
  text(doc, `${kind} · pagina 1`, 192, 8, 7.5, GRAY, false, "right");
  doc.restoreGraphicsState();
}

/**
 * Voorblad op een eigen sjabloon (PDF van de gebruiker of het briefpapier uit de SuperCloud): de afbeelding vult de
 * pagina; daarop alleen titel, soort rapport en projectgegevens, in het onderste deel van de pagina.
 */
function drawTemplateCover(doc: jsPDF, cpt: Cpt | null, project: ProjectMeta, image: string, kind: string, ink: Color) {
  doc.saveGraphicsState();
  doc.addImage(image, 0, 0, 210, HEIGHT, "huisstijl-voorblad");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  const title = project.title.trim() || (cpt ? `Sondering ${cpt.id}` : kind);
  const lines = (doc.splitTextToSize(title, 170) as string[]).slice(0, 3);
  text(doc, lines.join("\n"), 20, 110, 26, ink, true);
  const subtitleY = 110 - lines.length * 10.5;
  text(doc, `${kind}${project.location ? ` · ${project.location}` : ""}`, 20, subtitleY, 12, ink);
  const date = project.date.slice(0, 10).split("-").reverse().join("-");
  const metadata = [project.client && `Opdrachtgever: ${project.client}`, project.project_number && `Projectnr: ${project.project_number}`, `Datum: ${date}`].filter(Boolean).join(" · ");
  text(doc, (doc.splitTextToSize(metadata, 170) as string[]).slice(0, 2).join("\n"), 20, subtitleY - 8, 9, ink);
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
  gradient(doc, 4, 4, coverPalette(DEFAULT_BRAND));
  doc.restoreGraphicsState();
}
