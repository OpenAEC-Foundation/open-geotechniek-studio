// apps/desktop/src/calc/modules/pile-bearing-capacity/parts/pile-report-pdf.ts
//
// Multi-sondering paaldraagvermogen-rapport in de stijl van het externe
// referentierapport (984.pdf). Opbouw:
//
//   blad 1            — projectblad (ALGEMEEN + FUNDERINGSPAAL + grondsoorten)
//   per sondering     — visual-blad (CPT + paal + zones)
//                       berekening-blad (neg. kleef → puntdraag → schacht →
//                                        Rc;cal → zakking → veerwaarde)
//                       lastzakkingsdiagram-blad
//   slotblad          — statistische eindanalyse (§7.6.2.3 (5) + Tabel A.10b)
//
// Alle pagina's krijgen de referentie-stijl header (Berekeningsnummer /
// Revisie / Blad N van M / Projectnummer / Datum / Projectomschrijving /
// Onderdeel) en een footer met eigen branding. Output: jsPDF → Uint8Array.

import { jsPDF } from "jspdf";
import { currentBrand, DEFAULT_BRAND } from "../../../../report/reportBrand";
import { reportPalette } from "../../../../report/reportPalette";
import { richText, richWidth, richWrap } from "../../../../report/reportText";
import { drawSheetTitle } from "../../../../report/reportTitle";
import type { Cpt } from "../../../../types/cpt";
import type { AppliedOverride, PileInput, PileResult } from "../types";
import type { MultiCptSummary } from "./multi-cpt-summary";
import { overrideChanges } from "../../../shared/interpretation/text";
import type { AppliedOverride as SharedAppliedOverride } from "../../../shared/interpretation/overrides";
import { ct } from "../../../i18n";
import { renderSonderingChart } from "./pile-report-chart";
import { renderZakkingDiagram } from "./pile-report-zakking";
import { resolvePileType, soilLabel } from "../catalog";
import { pileGeometry } from "./geometry";
import { getStandard, isHistorical, usesHistoricalProcedure } from "../standards";

export interface PileReportProject {
  /** Projectnummer (bv. "2705"). */
  number: string;
  /** Beschrijving (bv. "Funderingsherstel"). */
  description: string;
  /** Norm-referentie (bv. "NEN 9997-1:2025+C1:2025 nl"). */
  norm: string;
  /** Datum (bv. "26-05-2026"). */
  date: string;
  /** Bedrijfsnaam / opsteller. */
  author: string;
  /** Berekeningsnummer (header; bv. "5.2"). */
  berekeningsnummer?: string;
  /** Revisie (header; default "0"). */
  revisie?: string;
  /** Onderdeel (header; bv. "Wapening en funderingspalen"). */
  onderdeel?: string;
  /** Ontwerplevensduur in jaren (projectblad; default 50). */
  ontwerplevensduur?: number;
  /** Gevolgklasse (projectblad; bv. "CC1"). */
  gevolgklasse?: string;
}

export interface PileReportSondering {
  /** Naam zoals "S1", "S3". */
  name: string;
  /** PileInput zoals gebruikt bij de berekening. */
  input: PileInput;
  /** Complete berekenings-resultaat van computePile(). */
  result: PileResult;
  /** CPT-data voor het visual-blad. Zonder cpt wordt dat blad overgeslagen. */
  cpt?: Cpt;
  /** De sondering waarmee is gerekend, als de conusweerstand is aangepast. */
  adjustedCpt?: Cpt;
  /** Aanpassingen van de grondlaaginterpretatie voor deze sondering. */
  adjustments?: AppliedOverride[];
}

export interface PileReportInputs {
  project: PileReportProject;
  sonderingen: PileReportSondering[];
  /** Multi-CPT statistische eindanalyse. */
  summary: MultiCptSummary;
  /** Aanpassingen van de grondlaaginterpretatie, met hun nummer per sondering (A1, A2, ...). */
  interpretation?: Array<{ nr: string; applied: AppliedOverride }>;
  /** Paaltype-naam voor het projectblad. */
  pileTypeName: string;
  /** Factoren αp, αs, αt uit de pile-catalog. */
  factors: { alphaP: number; alphaS: number; alphaT: number };
  /** Statistische eindanalyse; uit bij voorbeelden met verschillende maat of puntniveau. */
  endAnalysis?: boolean;
  /** Extra bladen na de berekeningen, bijvoorbeeld de draagvermogentabellen. */
  appendix?: (c: Cursor) => void;
}

// ─── PDF layout constants ────────────────────────────────────────
export const PAGE_W = 210;
export const PAGE_H = 297;
export const M = { top: 14, right: 14, bottom: 18, left: 14 };
export const CONTENT_W = PAGE_W - M.left - M.right;
export const FOOTER_Y = PAGE_H - 8;
export const HEADER_BOTTOM = 43;
export const TOTAL_PAGES_TOKEN = "{tp}";

// ─── Getal-notatie (NL: decimaal-komma) ──────────────────────────
export function nl(v: number, dec = 2): string {
  return v.toFixed(dec).replace(".", ",");
}
export function nlNap(v: number): string {
  return `NAP ${v >= 0 ? "+" : ""}${nl(v, 2)} m`;
}

// ─── WinAnsi-sanitizer ───────────────────────────────────────────
// De standaard-14 PDF-fonts (helvetica/courier) ondersteunen alleen
// WinAnsi (CP1252). Griekse letters en wiskundige tekens buiten die
// codepage worden door jsPDF verminkt (codepoint & 0xFF) én forceren
// 16-bit rendering met kapotte letterspatiëring.
//
// De hulpfuncties hieronder (sectionTitle, kv, formula, table, paragraph)
// hebben dit niet meer nodig: die zetten Griekse letters, wiskundetekens en
// sub- en superscript als echte tekst via report/reportText. `winAnsi` blijft
// voor wie zelf met `doc.text` in het standaardfont schrijft en translitereert
// formule-symbolen dan naar WinAnsi-veilige namen, zoals alpha en gamma.
const WINANSI_MAP: Array<[RegExp, string]> = [
  [/α/g, "alpha"],
  [/β/g, "beta"],
  [/γ/g, "gamma"],
  [/δ/g, "delta"],
  [/λ/g, "lambda"],
  [/σ/g, "sigma"],
  [/ξ/g, "xi"],
  [/Σ/g, "S"],
  [/Δ/g, "D"],
  [/φ/g, "phi"],
  [/→/g, "->"],
  [/−/g, "-"],
  [/≥/g, ">="],
  [/≤/g, "<="],
  [/√/g, "sqrt"],
  [/⁻/g, "-"],
  [/□\s?/g, ""],
  [/₀/g, "0"],
];
export function winAnsi(s: string): string {
  let out = s;
  for (const [re, repl] of WINANSI_MAP) out = out.replace(re, repl);
  return out;
}

// ─── Cursor + chrome ─────────────────────────────────────────────
export interface Cursor {
  doc: jsPDF;
  y: number;
  pageNo: number;
  newPage: () => void;
  reserve: (h: number) => void;
  continuationTitle?: string;
}

export function makeCursor(doc: jsPDF, project: PileReportProject, startPage = 1): Cursor {
  let pageNo = startPage;
  const printChrome = () => {
    // Logo van de huisstijl linksboven (hoogte 6 mm), de opsteller erachter.
    const brand = currentBrand();
    const p = reportPalette(brand);
    // Briefpapier van de huisstijl als achtergrond; het logo staat daar dan al op.
    if (brand.pageImage) {
      try { doc.addImage(brand.pageImage, 0, 0, PAGE_W, 297, "huisstijl-briefpapier"); } catch { /* onleesbaar: zonder */ }
    }
    let authorX = M.left;
    if (brand.logoDataUrl && !brand.pageImage) {
      try {
        const props = doc.getImageProperties(brand.logoDataUrl), h = 6, w = Math.min(30, (h * props.width) / props.height);
        doc.addImage(brand.logoDataUrl, M.left, 4.2, w, h, "huisstijl-logo");
        authorX = M.left + w + 3;
      } catch { /* onleesbaar logo: alleen tekst */ }
    }
    doc.setTextColor(...p.ink);
    richText(doc, richWrap(doc, project.author, 130 - (authorX - M.left), { size: 9.5, bold: true })[0] ?? "", authorX, 9, { size: 9.5, bold: true });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...p.accentStrong);
    doc.text("CONCEPT", PAGE_W - M.right, 9, { align: "right" });

    const small = { size: 8 };
    const rows: Array<[string, string, number]> = [
      ["Berekeningsnummer", project.berekeningsnummer ?? "-", 15.5],
      ["Projectnummer", project.number, 20],
      ["Projectomschrijving", project.description, 25],
      ["Onderdeel", project.onderdeel ?? "Funderingspalen", 34],
    ];
    const label = (text: string, x: number, y: number) => { doc.setTextColor(...p.secondary); richText(doc, text, x, y, small); doc.setTextColor(...p.ink); };
    for (const [name, value, y] of rows) {
      label(name, M.left, y);
      const lines = richWrap(doc, `: ${value}`, y < 25 ? 45 : CONTENT_W - 33, small);
      lines.slice(0, y === 25 ? 2 : 1).forEach((line, i) => richText(doc, line, M.left + 33, y + i * 3.4, small));
    }
    label("Revisie", 98, 15.5);
    richText(doc, `: ${project.revisie ?? "0"}`, 115, 15.5, small);
    label("Datum", 98, 20);
    richText(doc, `: ${project.date}`, 115, 20, small);
    // In het standaardfont, zodat het totaal achteraf kan worden ingevuld.
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`Blad ${pageNo} van ${TOTAL_PAGES_TOKEN}`, PAGE_W - M.right, 15.5, { align: "right" });

    doc.setDrawColor(...p.accent);
    doc.setLineWidth(0.5);
    doc.line(M.left, 38, PAGE_W - M.right, 38);

    // Footer — eigen branding.
    doc.setTextColor(...p.muted);
    const own = brand.organization !== DEFAULT_BRAND.organization && !brand.pageImage ? `${brand.organization} · ` : "";
    richText(doc, `${own}Open Geotechniek Studio`, PAGE_W - M.right, FOOTER_Y, { size: 7.5, align: "right" });
    richText(doc, "CONCEPT - Indicatieve berekening", M.left, FOOTER_Y, { size: 7.5 });
    doc.setTextColor(...p.ink);
    doc.setFont("helvetica", "normal");
  };
  printChrome();
  const cursor: Cursor = {
    doc,
    y: HEADER_BOTTOM + 4,
    pageNo,
    newPage: () => {
      doc.addPage();
      pageNo += 1;
      cursor.pageNo = pageNo;
      cursor.y = HEADER_BOTTOM + 4;
      printChrome();
      if (cursor.continuationTitle) {
        doc.setTextColor(...reportPalette().secondary);
        richText(doc, cursor.continuationTitle, M.left, cursor.y, { size: 10, bold: true });
        doc.setTextColor(...reportPalette().ink);
        doc.setFont("helvetica", "normal");
        cursor.y += 8;
      }
    },
    reserve: (h: number) => {
      if (cursor.y + h > FOOTER_Y - 5) cursor.newPage();
    },
  };
  return cursor;
}

// ─── Render helpers ──────────────────────────────────────────────
//
// Alle kleuren komen uit report/reportPalette (accent van de huisstijl,
// verder zwart en grijs). Alle tekst loopt via report/reportText, dat
// "R_c;cal;max", "10^-3" en Griekse letters als echte tekst zet.

/** Titel van een blad: groter, met een accentlijn over de volle breedte. */
export function sheetTitle(c: Cursor, title: string): void {
  c.y = drawSheetTitle(c.doc, title, M.left, c.y, CONTENT_W) + 6;
}

/** Sectiekop met optionele norm-artikel-referentie rechts uitgelijnd. */
export function sectionTitle(c: Cursor, title: string, artRef?: string): void {
  c.reserve(15);
  // Lucht boven de kop, behalve bovenaan een blad.
  if (c.y > HEADER_BOTTOM + 6) c.y += 1.5;
  const p = reportPalette(), head = { size: 10, bold: true }, small = { size: 8 };
  c.doc.setTextColor(...p.ink);
  const titleW = richText(c.doc, title, M.left, c.y, head);
  if (artRef) {
    c.doc.setTextColor(...p.muted);
    if (titleW + richWidth(c.doc, artRef, small) + 6 <= CONTENT_W) richText(c.doc, artRef, PAGE_W - M.right, c.y, { ...small, align: "right" });
    else {
      // Te lang voor naast de kop: eronder, zo nodig over meer regels.
      for (const line of richWrap(c.doc, artRef, CONTENT_W, small)) { c.y += 3.8; richText(c.doc, line, M.left, c.y, small); }
    }
    c.doc.setTextColor(...p.ink);
  }
  c.y += 1.5;
  c.doc.setDrawColor(...p.accent);
  c.doc.setLineWidth(0.3);
  c.doc.line(M.left, c.y, PAGE_W - M.right, c.y);
  c.y += 5;
  c.doc.setFont("helvetica", "normal");
}

export function paragraph(c: Cursor, text: string, opts: { italic?: boolean; size?: number; indent?: number } = {}): void {
  const size = opts.size ?? 8.5;
  const lineH = size * 0.45;
  const style = { size, italic: opts.italic };
  const p = reportPalette();
  const lines = richWrap(c.doc, text, CONTENT_W - (opts.indent ?? 0), style);
  c.reserve(lines.length * lineH + 1);
  // Een cursieve regel is een toelichting: die staat iets terug in grijs.
  c.doc.setTextColor(...(opts.italic ? p.secondary : p.ink));
  for (const line of lines) {
    richText(c.doc, line, M.left + (opts.indent ?? 0), c.y, style);
    c.y += lineH;
  }
  c.y += 1;
  c.doc.setTextColor(...p.ink);
  c.doc.setFont("helvetica", "normal");
}

/** Formule in drie regels, uitgelijnd op het gelijkteken:
 *
 *      symbool  =  formule                 (verwijzing)
 *               =  ingevulde getallen
 *               =  uitkomst met eenheid
 *
 *  Sub- en superscript en Griekse letters schrijf je in de tekst zelf
 *  ("R_b;cal;max", "α_p", "10^-3"); zie report/reportText. De verwijzing
 *  (bv. "...(7.6)") staat rechts op de eerste regel. */
export function formula(
  c: Cursor,
  lhs: string,
  symbolic: string,
  filled: string | null,
  result: string,
  ref?: string,
): void {
  const p = reportPalette();
  const normal = { size: 9 }, strong = { size: 9, bold: true }, small = { size: 7.5 };
  const indent = 3, lhsW = 30, eqW = 5, lineH = 4.5;
  const xLhs = M.left + indent, xEq = xLhs + lhsW, xRhs = xEq + eqW;
  const refW = ref ? richWidth(c.doc, ref, small) + 4 : 0;
  const rhsW = PAGE_W - M.right - xRhs;
  const lhsLines = richWrap(c.doc, lhs, lhsW - 2, normal);
  const symbolicLines = richWrap(c.doc, symbolic, rhsW - refW, normal);
  const filledLines = filled ? richWrap(c.doc, filled, rhsW, normal) : [];
  const resultLines = richWrap(c.doc, result, rhsW, strong);
  const firstBlock = Math.max(lhsLines.length, symbolicLines.length);
  c.reserve((firstBlock + filledLines.length + resultLines.length) * lineH + 2.5);

  const row = (lines: string[], style: { size: number; bold?: boolean }, color: [number, number, number]) => {
    c.doc.setTextColor(...p.muted);
    richText(c.doc, "=", xEq, c.y, normal);
    c.doc.setTextColor(...color);
    lines.forEach((line, i) => richText(c.doc, line, xRhs, c.y + i * lineH, style));
    c.y += lines.length * lineH;
  };
  c.doc.setTextColor(...p.ink);
  lhsLines.forEach((line, i) => richText(c.doc, line, xLhs, c.y + i * lineH, normal));
  if (ref) {
    c.doc.setTextColor(...p.muted);
    richText(c.doc, ref, PAGE_W - M.right, c.y, { ...small, align: "right" });
  }
  row(symbolicLines, normal, p.ink);
  c.y += (firstBlock - symbolicLines.length) * lineH;
  if (filledLines.length) row(filledLines, normal, p.secondary);
  row(resultLines, strong, p.ink);
  c.y += 2.5;
  c.doc.setTextColor(...p.ink);
  c.doc.setFont("helvetica", "normal");
}

export interface TableCol {
  label: string;
  width: number;
  align?: "left" | "right";
}

export function table(
  c: Cursor,
  cols: TableCol[],
  rows: string[][],
  opts: { summaryRow?: string[]; size?: number } = {},
): void {
  const p = reportPalette();
  const size = opts.size ?? 7.5;
  const scale = CONTENT_W / cols.reduce((sum,col) => sum + col.width,0);
  const widths = cols.map(col => col.width * scale);
  const lineH = size * .45;
  const wrap = (row: string[], bold: boolean) => cols.map((_,i) => richWrap(c.doc, row[i] ?? "", widths[i]-3, { size, bold }));
  const height = (cells: string[][]) => Math.max(...cells.map(cell => cell.length),1)*lineH + 3;
  const header = cols.map(col => col.label);
  const headerH = height(wrap(header,true));
  // kind: kop (grijs vlak, lijn eronder), rij (om en om licht getint) of som (lijn erboven, vet).
  const draw = (row: string[], kind: "head" | "body" | "sum", shade?: [number,number,number]) => {
    const bold = kind !== "body", cells = wrap(row,bold), h=height(cells);
    // Kop en somregel krijgen wat lucht tussen de tekst en hun lijn.
    const pad = kind === "body" ? 0 : .8;
    if (shade) { c.doc.setFillColor(...shade); c.doc.rect(M.left,c.y-2,CONTENT_W,h+pad,"F"); }
    if (kind === "sum") { c.doc.setDrawColor(...p.ruleStrong); c.doc.setLineWidth(.25); c.doc.line(M.left,c.y-2,PAGE_W-M.right,c.y-2); }
    c.y += pad;
    c.doc.setTextColor(...p.ink);
    let x=M.left;
    cells.forEach((lines,i) => {
      const right=cols[i].align === "right";
      lines.forEach((line,j) => richText(c.doc,line,right ? x+widths[i]-1.5 : x+1.5,c.y+j*lineH,{size,bold,align:right ? "right" : "left"}));
      x += widths[i];
    });
    c.y += h;
    if (kind === "head") { c.doc.setDrawColor(...p.ruleStrong); c.doc.setLineWidth(.25); }
    else { c.doc.setDrawColor(...p.rule); c.doc.setLineWidth(.1); }
    c.doc.line(M.left,c.y-2,PAGE_W-M.right,c.y-2);
    if (kind === "head") c.y += .8;
  };
  c.reserve(headerH + 1.6 + (rows.length ? height(wrap(rows[0],false)) : 0));
  draw(header,"head",p.surface);
  const bodyRow = (row: string[], kind: "body" | "sum", shade?: [number,number,number]) => {
    if (c.y + height(wrap(row,kind === "sum")) > FOOTER_Y-10) { c.newPage(); draw(header,"head",p.surface); }
    draw(row,kind,shade);
  };
  rows.forEach((row,i) => bodyRow(row,"body",i%2 ? p.zebra : undefined));
  if (opts.summaryRow) bodyRow(opts.summaryRow,"sum");
  c.y += 2;
  c.doc.setFont("helvetica", "normal");
}

export function kv(c: Cursor, label: string, value: string): void {
  const p = reportPalette(), style = { size: 8.5 };
  const lines = richWrap(c.doc, value, CONTENT_W - 52, style);
  c.reserve(lines.length * 4.2 + 1);
  c.doc.setTextColor(...p.secondary);
  richText(c.doc, label, M.left, c.y, style);
  c.doc.setTextColor(...p.ink);
  lines.forEach((line,i) => richText(c.doc, line, M.left + 52, c.y + i * 4.2, style));
  c.y += lines.length * 4.2;
  c.doc.setFont("helvetica", "normal");
}

/** Uitkomstvak: grijs vlak met een balk in de accentkleur en de kerngetallen
 *  naast elkaar. `tone` kleurt één waarde als "voldoet" of "voldoet niet". */
export function resultBox(c: Cursor, title: string, items: Array<{ label: string; value: string; tone?: "pass" | "fail" }>): void {
  const p = reportPalette(), h = 27;
  c.reserve(h + 4);
  const top = c.y - 3;
  c.doc.setFillColor(...p.surface);
  c.doc.rect(M.left, top, CONTENT_W, h, "F");
  c.doc.setFillColor(...p.accent);
  c.doc.rect(M.left, top, 1.4, h, "F");
  c.doc.setTextColor(...p.ink);
  richText(c.doc, title, M.left + 5, c.y + 2.5, { size: 10, bold: true });
  items.forEach((item, i) => {
    const x = M.left + 5 + i * (CONTENT_W - 10) / items.length;
    c.doc.setTextColor(...p.secondary);
    richText(c.doc, item.label, x, c.y + 10.5, { size: 8 });
    c.doc.setTextColor(...(item.tone === "pass" ? p.success : item.tone === "fail" ? p.error : p.ink));
    richText(c.doc, item.value, x, c.y + 17.5, { size: 13, bold: true });
  });
  c.doc.setTextColor(...p.ink);
  c.doc.setFont("helvetica", "normal");
  c.y = top + h + 5;
}

/** Eindoordeel: tekst in de succes- of foutkleur met een balk in dezelfde kleur. */
export function verdict(c: Cursor, text: string, passes: boolean): void {
  const p = reportPalette(), color = passes ? p.success : p.error;
  c.reserve(14);
  c.doc.setFillColor(...(passes ? p.successTint : p.errorTint));
  c.doc.rect(M.left, c.y - 6, CONTENT_W, 10, "F");
  c.doc.setFillColor(...color);
  c.doc.rect(M.left, c.y - 6, 1.4, 10, "F");
  c.doc.setTextColor(...color);
  richText(c.doc, text, M.left + 5, c.y + 0.4, { size: 11, bold: true });
  c.doc.setTextColor(...p.ink);
  c.doc.setFont("helvetica", "normal");
  c.y += 9;
}

// ─── Blad 1 — projectblad ────────────────────────────────────────

function renderProjectBlad(c: Cursor, inputs: PileReportInputs): void {
  const p = inputs.project;
  const first = inputs.sonderingen[0];

  const summary = usesHistoricalProcedure(first?.input.standard) && first ? first.result.summary : inputs.summary;
  resultBox(c, "SAMENVATTING", [
    { label: "Belasting N_Ed", value: `${nl(first?.input.nEd ?? 0,1)} kN` },
    { label: "Netto draagvermogen R_c;net;d", value: `${nl(summary.rcNetD,1)} kN` },
    { label: "Benutting N_Ed / R_c;net;d", value: nl(summary.unityCheck,2), tone: summary.unityCheck <= 1 ? "pass" : "fail" },
  ]);
  paragraph(c,"CONCEPT - Resultaten zijn indicatief; niet gebruiken voor vergunning of uitvoering.",{size:8});
  c.y += 3;

  sectionTitle(c, "ALGEMEEN");
  kv(c, "Projectomschrijving", `: ${p.description}`);
  kv(c, "Ontwerplevensduur", `: ${p.ontwerplevensduur === undefined ? "Niet opgegeven" : `${p.ontwerplevensduur} jaren`}`);
  kv(c, "Gevolgklasse", `: ${p.gevolgklasse ?? "Niet opgegeven"}`);
  c.y += 3;

  sectionTitle(c, "FUNDERINGSPAAL");
  kv(c, "Gehanteerde normen", `: ${p.norm}`);
  c.y += 2;

  if (first) {
    const inp = first.input;
    const L = inp.pileTopNap - inp.pileToeNap;
    kv(c, "Type paal", `: ${inputs.pileTypeName}`);
    kv(c, "Normbasis", `: ${resolvePileType(inp)?.edition ?? "bestaand model"}`);
    paragraph(c, `Bron: ${resolvePileType(inp)?.source ?? "bestaande catalogus"}`);
    for (const warning of first.result.warnings) paragraph(c, warning, { size: 7.5 });
    kv(c, "Puntafmeting", `: ${inp.timberTaper?.toeDiameterMm ?? inp.baseDiameterMm ?? inp.diameterMm} mm`);
    const ext = inp.concreteExtension;
    if (ext) kv(c, "Betonopzetter", `: ${ext.isCircular ? "Ø" : `${ext.sizeMm} × `}${ext.sizeMm} mm, paalkop tot las op ${nlNap(ext.jointNap)}`);
    if (inp.timberTaper) kv(c, ext ? "Tapse lengte vanaf las" : "Tapse lengte vanaf kop", `: ${nl(inp.timberTaper.lengthM, 2)} m; daaronder constant`);
    if (!usesHistoricalProcedure(inp.standard) && !inp.timberTaper && !ext) kv(c, "EA", `: ${nl(first.result.settlement.eaKn ?? 0, 0)} kN`);
    kv(c, "Paallengte", `: ${nl(L, 2)} m`);
    kv(
      c,
      "Factoren",
      `: α_p = ${nl(inputs.factors.alphaP, 3)}   α_s = ${nl(inputs.factors.alphaS, 4)}   α_t = ${nl(inputs.factors.alphaT, 4)}   Lastzakkingslijn: ${resolvePileType(inp)?.settlementLine ?? 1}`,
    );
    const isCircular = resolvePileType(inp)?.isCircular ?? true;
    kv(c, inp.concreteExtension ? "Hout bij de las" : inp.timberTaper ? "Kopdiameter" : isCircular ? "Diameter" : "Zijlengte", `: ${isCircular ? "D" : "a"} = ${inp.diameterMm} mm  (D_eq = ${nl(first.result.base.deqMm, 1)} mm)`);
    if (resolvePileType(inp)?.material === "steel" && !resolvePileType(inp)?.requiresEA) kv(c, "Wanddikte", `: ${nl(inp.wallThicknessMm, 1)} mm`);
    kv(c, "Paalkopniveau", `: ${nlNap(inp.pileTopNap)}`);
    kv(c, "Paalpuntniveau", `: ${nlNap(inp.pileToeNap)}`);
    kv(c, "Waterniveau", `: ${nlNap(inp.waterNap)}`);
    kv(c, "Ontgravingsniveau", `: ${nlNap(inp.excavationNap)}`);
    kv(c, "Belasting", `: N_Ed = ${inp.nEd} kN   N_k = ${inp.nEk} kN`);
    kv(c, "Partiële factoren", `: γ_m = ${nl(inp.gammaM, 2)}   γ_f,nk = ${nl(inp.gammaFnk, 2)}`);
    kv(c, "Paalgroep", `: geen paalgroep`);
    c.y += 3;

    // Grondsoorten-tabel: unieke kinds over alle sonderingen.
    sectionTitle(c, "Grondsoorten");
    const seen = new Map<string, { gammaK: number; gammaW: number; phi: number }>();
    for (const s of inputs.sonderingen) {
      for (const l of s.input.soilProfile) {
        const key = `${l.kind}|${l.gammaK}|${l.gammaW}|${l.phi}`;
        if (!seen.has(key)) seen.set(key, { gammaK: l.gammaK, gammaW: l.gammaW, phi: l.phi });
      }
    }
    const KIND_LABEL: Record<string, string> = {
      "sand-dry": "Zand",
      "sand-wet": "Zand",
      clay: "Klei",
      peat: "Veen",
    };
    table(
      c,
      [
        { label: "Grondsoort", width: 60 },
        { label: "γ_k [kN/m³]", width: 35, align: "right" },
        { label: "γ_w-aandeel [kN/m³]", width: 45, align: "right" },
        { label: "φ [°]", width: 30, align: "right" },
      ],
      Array.from(seen.entries()).map(([key, v]) => {
        const kind = key.split("|")[0];
        const base = KIND_LABEL[kind] ?? kind;
        // gammaW = 0 → laag (deel) boven GWS gemodelleerd.
        const suffix = v.gammaW === 0 ? " (boven GWS)" : " (onder GWS)";
        return [base + suffix, nl(v.gammaK, 0), nl(v.gammaW, 0), nl(v.phi, 1)];
      }),
    );

    if (inputs.interpretation?.length) renderInterpretation(c, inputs.interpretation);

    c.y += 2;
    sectionTitle(c, "Berekening");
    paragraph(c, `D_eq = ${nl(first.result.base.deqMm, 1)} mm`);
    paragraph(
      c,
      `Aantal sonderingen in deze analyse: ${inputs.sonderingen.length} (${inputs.sonderingen.map((s) => s.name).join(", ")})`,
    );
  }
}

// ─── Aanpassingen aan de grondlaaginterpretatie ──────────────────

/**
 * Per aanpassing: sondering, traject, oude → nieuwe waarde en de toelichting.
 * Ook voor andere modules: die geven de naam van hun eigen grondsoorten mee,
 * en zo nodig een eigen inleiding (bijvoorbeeld als de uitdraai geen grafiek heeft).
 */
export function renderInterpretation(c: Cursor, items: NonNullable<PileReportInputs["interpretation"]>): void;
export function renderInterpretation<K extends string>(c: Cursor, items: Array<{ nr: string; applied: SharedAppliedOverride<K> }>, soilLabelOf: (kind: K) => string, intro?: string): void;
export function renderInterpretation(c: Cursor, items: Array<{ nr: string; applied: SharedAppliedOverride }>, soilLabelOf: (kind: string) => string = soilLabel as (kind: string) => string, intro?: string): void {
  const tr = (key: string, text: string) => ct("calcPile", `interp.report.${key}`, text);
  // Kop, inleiding en de eerste regels van de tabel blijven bij elkaar.
  c.reserve(48);
  c.y += 2;
  sectionTitle(c, tr("title", "Aanpassingen aan de grondlaaginterpretatie"));
  paragraph(c, intro ?? tr("intro", "In deze berekening wijken de onderstaande trajecten af van de gemeten sondering. De sondering zelf is niet gewijzigd; een aanpassing geldt alleen voor deze berekening en voor de genoemde sondering. In de grafiek van de sondering staat de meting dun en het aangepaste traject gemarkeerd."), { size: 8 });
  const level = (v: number) => (Number.isFinite(v) ? nl(v, 2) : "-");
  table(
    c,
    [
      { label: tr("colNr", "Nr."), width: 11 },
      { label: tr("colCpt", "Sondering"), width: 28 },
      { label: tr("colRange", "Traject [m NAP]"), width: 32 },
      { label: tr("colChange", "Wijziging (oud → nieuw)"), width: 72 },
      { label: tr("colComment", "Toelichting"), width: 47 },
    ],
    items.map(({ nr, applied: a }) => {
      const range = a.status === "applied" ? a : a.override;
      return [nr, a.override.cptId, `${level(Math.max(range.topNap, range.bottomNap))} / ${level(Math.min(range.topNap, range.bottomNap))}`, overrideChanges(a, soilLabelOf, "q_c").join("; "), a.override.comment || "-"];
    }),
  );
}

// ─── Berekening-blad per sondering ───────────────────────────────

export function renderBerekeningBlad(c: Cursor, s: PileReportSondering, factors: PileReportInputs["factors"]): void {
  const { input, result } = s;
  const Os = result.negKleef.meanPerimeterM ?? pileGeometry(input.diameterMm, resolvePileType(input)?.isCircular ?? true).perimeterM;
  const wp = result.settlement.sls;
  const L = result.settlement.lM ?? input.pileTopNap - input.pileToeNap;
  const ell = result.settlement.ellM ?? input.pileTopNap - input.negKleefBottomNap;
  const deltaL = result.settlement.deltaLM ?? input.negKleefBottomNap - input.pileToeNap;
  const eaKn = result.settlement.eaKn ?? 0;

  c.newPage();
  sheetTitle(c, `Berekening — sondering ${s.name}`);
  c.continuationTitle = `Berekening - sondering ${s.name} (vervolg)`;

  // ─── Negatieve kleef ───────────────────────────────────────────
  sectionTitle(c, "Negatieve kleef", isHistorical(input.standard) ? (input.standard === "nen-6743-1991" ? "NEN 6740:1991 art. 11.5.1" : "NEN 6743-1:2006 art. 7.2") : "art. 7.3.2.2 (d)");
  paragraph(c, `Niv. negatieve/positieve kleef: ${nlNap(input.negKleefBottomNap)}`);
  paragraph(c, `ΔL_nk = ${nl(result.negKleef.deltaLnk, 2)} m`);

  const nk = result.negKleef;
  const k0tdUniform =
    nk.layers.length > 0 && nk.layers.every((l) => Math.abs(l.k0TanDelta - nk.layers[0].k0TanDelta) < 1e-9 && Math.abs((l.perimeterM ?? Os) - Os) < 1e-9)
      ? nk.layers[0].k0TanDelta
      : null;
  const sigmaSum = k0tdUniform !== null && k0tdUniform > 0 && Os > 0
    ? nk.fnkRep / (Os * k0tdUniform)
    : null;
  formula(
    c,
    "F_nk;rep",
    sigmaSum !== null ? "O_s;gem · K_0 · tan δ · Σ ((σ_{v;i-1} + σ_v;i) / 2 · h_i)" : "Σ (O_s;i · K_0 · tan δ_i · (σ_{v;i-1} + σ_v;i) / 2 · h_i)",
    sigmaSum !== null
      ? `${nl(Os, 2)} × ${nl(k0tdUniform!, 2)} × ${nl(sigmaSum, 0)}`
      : nk.layers.map((l) => nl(l.fsNkRep, 1)).join(" + ") || "0",
    `${nl(nk.fnkRep, 0)} kN`,
  );
  formula(
    c,
    "F_nk;d",
    "γ_f,nk · F_nk;rep",
    `${nl(input.gammaFnk, 2)} × ${nl(nk.fnkRep, 0)}`,
    `${nl(nk.fnkD, 0)} kN`,
  );
  if (nk.layers.length > 0) {
    table(
      c,
      [
        { label: "Laag", width: 24 },
        { label: "h [m]", width: 16, align: "right" },
        { label: "O_s [m]", width: 18, align: "right" },
        { label: "σ_top [kPa]", width: 22, align: "right" },
        { label: "σ_bot [kPa]", width: 22, align: "right" },
        { label: "σ_gem·h", width: 20, align: "right" },
        { label: "K_0·tan δ", width: 20, align: "right" },
        { label: "F_s;nk [kN]", width: 24, align: "right" },
      ],
      nk.layers.map((l) => [
        l.layer.kind,
        nl(l.thickness, 2),
        nl(l.perimeterM ?? Os, 3),
        nl(l.sigmaRepTop, 1),
        nl(l.sigmaRepBottom, 1),
        nl(l.sigmaGemRep, 1),
        nl(l.k0TanDelta, 3),
        nl(l.fsNkRep, 1),
      ]),
      { summaryRow: ["Σ", "", "", "", "", "", "", nl(nk.fnkRep, 1)], size: 7 },
    );
  }

  // ─── Puntdraagvermogen ─────────────────────────────────────────
  sectionTitle(c, "Puntdraagvermogen", isHistorical(input.standard) ? (input.standard === "nen-6743-1991" ? "art. 5.3.3.1" : "art. 5.4.2.2") : "art. 7.6.2.3 (e)");
  const capNote = result.base.qbMaxMpaRaw > 15 ? `${nl(result.base.qbMaxMpa, 2)} MPa (afgekapt op 15,00 MPa)` : `${nl(result.base.qbMaxMpa, 2)} MPa < 15,00 MPa`;
  formula(
    c,
    "q_b;max",
    "½ · α_p · β · s · ((q_c;I;gem + q_c;II;gem) / 2 + q_c;III;gem)",
    `½ × ${nl(factors.alphaP, 2)} × ${nl(resolvePileType(input)?.beta ?? 1, 2)} × ${nl(resolvePileType(input)?.s ?? 1, 2)} × ((${nl(result.base.qcIGemMpa, 2)} + ${nl(result.base.qcIIGemMpa, 2)})/2 + ${nl(result.base.qcIIIGemMpa, 2)})`,
    capNote,
  );
  formula(
    c,
    "R_b;cal;max",
    "A_b · q_b;max",
    `${result.base.abMm2.toFixed(0)} mm² × ${nl(result.base.qbMaxMpa, 2)} MPa × 10^-3`,
    `${result.base.rbCalMax.toFixed(0)} kN`,
  );

  // ─── Maximumschachtwrijving ────────────────────────────────────
  sectionTitle(c, "Maximumschachtwrijving", isHistorical(input.standard) ? (input.standard === "nen-6743-1991" ? "art. 5.3.3.2" : "art. 5.4.2.3") : "art. 7.6.2.3 (c)");
  paragraph(c, `ΔL = ${nl(deltaL, 1)} m`);
  const shaftSum = Os > 0 ? result.shaft.rsCalMax / Os : 0;
  formula(
    c,
    "R_s;cal;max",
    input.timberTaper || input.concreteExtension ? "Σ (O_s;gem;j · q_s;j · h_j)" : "O_s;gem · Σ (α_s · q_c;j;gem · h_j)",
    input.timberTaper || input.concreteExtension ? result.shaft.perLayer.map(l => nl(l.rsLayer, 1)).join(" + ") : `${nl(Os, 3)} × ${nl(shaftSum, 0)}`,
    `${result.shaft.rsCalMax.toFixed(0)} kN`,
  );
  if (result.shaft.perLayer.length > 0) {
    table(
      c,
      [
        { label: "Laag", width: 24 },
        { label: "Van NAP", width: 22, align: "right" },
        { label: "Tot NAP", width: 22, align: "right" },
        { label: "q_c;gem [MPa]", width: 28, align: "right" },
        { label: "q_s [MPa]", width: 24, align: "right" },
        { label: "R_s [kN]", width: 24, align: "right" },
      ],
      result.shaft.perLayer.map((l) => [
        l.layer.kind,
        nl(Math.min(l.layer.startNap, input.posKleefTopNap ?? input.negKleefBottomNap), 2),
        nl(Math.max(l.layer.endNap, input.pileToeNap), 2),
        nl(l.qcGemMpa, 2),
        nl(l.qsMpa, 3),
        nl(l.rsLayer, 1),
      ]),
      { summaryRow: ["Σ", "", "", "", "", nl(result.shaft.rsCalMax, 1)], size: 7 },
    );
  }

  // ─── Maximum gronddraagvermogen ────────────────────────────────
  sectionTitle(c, "Maximum gronddraagvermogen van de paal", isHistorical(input.standard) ? "NEN 6743" : "art. 7.6.2.3 (3)");
  formula(
    c,
    "R_c;cal",
    "R_b;cal;max + R_s;cal;max",
    `${result.base.rbCalMax.toFixed(0)} + ${result.shaft.rsCalMax.toFixed(0)}`,
    `${(result.base.rbCalMax + result.shaft.rsCalMax).toFixed(0)} kN`,
    isHistorical(input.standard) ? undefined : "...(7.6)",
  );

  if (result.settlement.available === false) {
    paragraph(c, input.concreteExtension ? "Zakking en veerwaarden voor een houten paal met betonopzetter (verschillende EA voor beton en hout) zijn niet geverifieerd en worden niet bepaald." : input.timberTaper ? "Zakking en veerwaarden voor taps hout met variabele EA zijn niet geverifieerd en worden niet bepaald." : usesHistoricalProcedure(input.standard) ? "Historische zakking en veerwaarden zijn nog niet geverifieerd en worden niet bepaald." : "Zakking en veerwaarden niet bepaald: de vereiste lastzakkingslijn is nog niet ondersteund.");
    return;
  }

  // ─── Zakking ───────────────────────────────────────────────────
  c.reserve(65);
  sectionTitle(c, "Berekening van de zakking van de paal", "art. 7.6.4.2 (4)");
  formula(
    c,
    "F_c;tot",
    "N_k + F_nk",
    `${input.nEk} + ${nl(nk.fnkD, 0)}`,
    `${wp.fcTot.toFixed(0)} kN`,
  );
  paragraph(c, "Lastzakkingslijn 1:", { italic: true });
  const rbPct = result.base.rbCalMax > 0 ? (wp.rbMobil / result.base.rbCalMax) * 100 : 0;
  const rsPct = result.shaft.rsCalMax > 0 ? (wp.rsMobil / result.shaft.rsCalMax) * 100 : 0;
  formula(
    c,
    "s_b/D_eq · 100",
    `${nl(wp.sbMm, 1)} / ${nl(result.base.deqMm, 1)} · 100 = ${nl((wp.sbMm / result.base.deqMm) * 100, 1)} %`,
    `→ R_b;1 = ${rbPct.toFixed(0)}% · R_b;cal;max = ${rbPct.toFixed(0)}/100 × ${result.base.rbCalMax.toFixed(0)}`,
    `${wp.rbMobil.toFixed(0)} kN`,
    "...(Figuur 7.n)",
  );
  formula(
    c,
    "s_b",
    `${nl(wp.sbMm, 1)} mm`,
    `→ R_s;1 = ${rsPct.toFixed(0)}% · R_s;cal;max = ${rsPct.toFixed(0)}/100 × ${result.shaft.rsCalMax.toFixed(0)}`,
    `${wp.rsMobil.toFixed(0)} kN`,
    "...(Figuur 7.o)",
  );
  formula(
    c,
    "F_gem",
    "(λ·F_c;tot + 0,5·ΔL·(F_c;tot − R_b;1)) / L",
    `(${nl(ell, 1)} × ${wp.fcTot.toFixed(0)} + 0,5 × ${nl(deltaL, 1)} × (${wp.fcTot.toFixed(0)} − ${wp.rbMobil.toFixed(0)})) / ${nl(L, 1)}`,
    `${wp.fgem.toFixed(0)} kN`,
  );
  formula(
    c,
    "s_el",
    "L · F_gem / EA",
    `${nl(L, 1)} × ${wp.fgem.toFixed(0)} × 10³ / ${eaKn.toFixed(0)}`,
    `${nl(wp.selMm, 1)} mm`,
  );
  formula(
    c,
    "s_1",
    "s_b + s_el",
    `${nl(wp.sbMm, 1)} + ${nl(wp.selMm, 1)}`,
    `${nl(wp.s1Mm, 1)} mm`,
    "art. 7.6.4.2 (j)",
  );

  // ─── Veerwaarde ────────────────────────────────────────────────
  sectionTitle(c, "Veerwaarde");
  formula(
    c,
    "k_1",
    "F_c;tot / s_1",
    `${wp.fcTot.toFixed(0)} × 10³ / ${nl(wp.s1Mm, 1)}`,
    `${result.spring.kSlsKnPerM.toFixed(0)} kN/m`,
  );
  formula(
    c,
    "k_min",
    "k_1 / √2",
    `${result.spring.kSlsKnPerM.toFixed(0)} / 1,414`,
    `${result.spring.kMinKnPerM.toFixed(0)} kN/m`,
  );
  formula(
    c,
    "k_max",
    "k_1 · √2",
    `${result.spring.kSlsKnPerM.toFixed(0)} × 1,414`,
    `${result.spring.kMaxKnPerM.toFixed(0)} kN/m`,
  );
  paragraph(
    c,
    `ULS-werkpunt: F_c;tot = ${result.settlement.uls.fcTot.toFixed(0)} kN → s_b = ${nl(result.settlement.uls.sbMm, 1)} mm, s_1 = ${nl(result.settlement.uls.s1Mm, 1)} mm.`,
    { italic: true, size: 7.5 },
  );
}

// ─── Slotblad — statistische eindanalyse ─────────────────────────

function renderEndAnalysis(
  c: Cursor,
  sonderingen: PileReportSondering[],
  summary: MultiCptSummary,
  totalNEd: number,
): void {
  c.newPage();
  sectionTitle(c, "Berekening netto maatgevend paaldraagvermogen", "art. 7.6.2.3 (5)");
  paragraph(c, `Aantal sonderingen n = ${summary.n}`);

  table(
    c,
    [
      { label: "Sondering", width: 36 },
      { label: "R_b;cal [kN]", width: 32, align: "right" },
      { label: "R_s;cal [kN]", width: 32, align: "right" },
      { label: "R_c;cal [kN]", width: 32, align: "right" },
      { label: "F_nk;d [kN]", width: 30, align: "right" },
    ],
    sonderingen.map((s) => [
      s.name,
      s.result.base.rbCalMax.toFixed(0),
      s.result.shaft.rsCalMax.toFixed(0),
      (s.result.base.rbCalMax + s.result.shaft.rsCalMax).toFixed(0),
      s.result.negKleef.fnkD.toFixed(0),
    ]),
    {
      summaryRow: [
        "Gem. / max",
        (sonderingen.reduce((a, s) => a + s.result.base.rbCalMax, 0) / sonderingen.length).toFixed(0),
        (sonderingen.reduce((a, s) => a + s.result.shaft.rsCalMax, 0) / sonderingen.length).toFixed(0),
        summary.rcCalMean.toFixed(0),
        summary.fnkDMean.toFixed(0),
      ],
    },
  );

  paragraph(c, "Type bouwwerk: Niet-stijf");
  formula(
    c,
    "VC",
    "σ / (R_c;cal)_gem · 100%",
    `${summary.stdDev.toFixed(0)} / ${summary.rcCalMean.toFixed(0)} × 100% = ${nl(summary.variatieCoeffPct, 1)}%`,
    `${nl(summary.variatieCoeffPct, 1)}% ${summary.variatieCoeffPct < 12 ? "< 12%" : "≥ 12%"} → n = ${summary.n}`,
  );
  formula(
    c,
    "ξ_3 ; ξ_4",
    "Tabel A.10b (niet-stijf)",
    null,
    `ξ_3 = ${nl(summary.xi3, 2)}   ξ_4 = ${nl(summary.xi4, 2)}`,
    "...(tabel A.10)",
  );
  formula(
    c,
    "(R_c;k)_gem",
    "(R_c;cal)_gem / ξ_3",
    `${summary.rcCalMean.toFixed(0)} / ${nl(summary.xi3, 2)}`,
    `${summary.rcKGem.toFixed(0)} kN`,
  );
  formula(
    c,
    "(R_c;k)_min",
    "(R_c;cal)_min / ξ_4",
    `${summary.rcCalMin.toFixed(0)} / ${nl(summary.xi4, 2)}`,
    `${summary.rcKMin.toFixed(0)} kN`,
  );
  const gammaM = sonderingen[0]?.input.gammaM ?? 1.2;
  formula(
    c,
    "R_c;d",
    "min((R_c;k)_gem ; (R_c;k)_min) / γ_m",
    `min(${summary.rcKGem.toFixed(0)} ; ${summary.rcKMin.toFixed(0)}) / ${nl(gammaM, 2)}`,
    `${summary.rcD.toFixed(0)} kN`,
    "...(7.8)",
  );
  formula(
    c,
    "R_c;net;d",
    "R_c;d − F_nk;d",
    `${summary.rcD.toFixed(0)} − ${summary.fnkDMean.toFixed(0)}`,
    `${summary.rcNetD.toFixed(0)} kN`,
  );
  formula(
    c,
    "N_Ed / R_c;net;d",
    `${totalNEd} / ${summary.rcNetD.toFixed(0)}`,
    null,
    `${nl(summary.unityCheck, 2)} ${summary.unityCheck <= 1 ? "≤ 1,0 → rekentoets voldoet" : "> 1,0 → rekentoets voldoet niet"}`,
  );

  c.y += 6;
  verdict(c, `Indicatieve rekentoets: ${summary.passes ? "voldoet" : "voldoet niet"}`, summary.passes);
}

// ─── Hoofd-export ────────────────────────────────────────────────

export function generatePileReport(inputs: PileReportInputs): Uint8Array {
  const first = inputs.sonderingen[0];
  if (inputs.sonderingen.some(s => (s.input.standard ?? "nen-9997-2017") !== (first?.input.standard ?? "nen-9997-2017"))) {
    throw new Error("Een rapport mag geen verschillende normversies combineren");
  }
  const historical = usesHistoricalProcedure(first?.input.standard);
  if (historical && inputs.sonderingen.length !== 1) throw new Error("Historische paalgroepanalyse is nog niet geverifieerd");
  if (historical) inputs = { ...inputs, project: { ...inputs.project, norm: getStandard(first.input.standard)!.label } };
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const c = makeCursor(doc, inputs.project);

  // Blad 1 — projectblad
  renderProjectBlad(c, inputs);

  // Per sondering: visual → berekening → lastzakkingsdiagram
  for (const s of inputs.sonderingen) {
    if (s.cpt) {
      c.newPage();
      renderSonderingChart({
        doc,
        startY: HEADER_BOTTOM,
        name: s.name,
        input: s.input,
        result: s.result,
        cpt: s.cpt,
        adjustedCpt: s.adjustedCpt,
        adjustments: s.adjustments,
      });
    }
    renderBerekeningBlad(c, s, inputs.factors);
    c.continuationTitle = undefined;
    if (s.result.settlement.available !== false) {
      c.newPage();
      renderZakkingDiagram({
        doc,
        startY: HEADER_BOTTOM,
        name: s.name,
        input: s.input,
        result: s.result,
      });
    }
  }

  // Slotblad — statistische eindanalyse
  const totalNEd = inputs.sonderingen[0]?.input.nEd ?? 0;
  if (historical) {
    c.newPage();
    sectionTitle(c, "Historische draagkracht");
    paragraph(c, getStandard(first.input.standard)!.label);
    const r = first.result.summary;
    const xi = r.historicalXi;
    formula(c, "R_c;cal", "R_b + R_s", `${first.result.base.rbCalMax.toFixed(1)} + ${first.result.shaft.rsCalMax.toFixed(1)}`, `${nl(r.rcCal, 1)} kN`);
    formula(c, "R_c;rep/k", xi === undefined ? "R_c;cal / ξ_3" : "ξ × R_c;cal", xi === undefined ? `${nl(r.rcCal, 1)} / ${nl(r.xi3, 2)}` : `${nl(xi, 2)} × ${nl(r.rcCal, 1)}`, `${nl(r.rcK, 1)} kN`);
    formula(c, "R_c;d", "R_c;rep/k / γ_m", `${nl(r.rcK, 1)} / ${nl(first.input.gammaM, 2)}`, `${nl(r.rcD, 1)} kN`);
    formula(c, "R_c;net;d", "R_c;d − F_nk;d", `${nl(r.rcD, 1)} − ${nl(first.result.negKleef.fnkD, 1)}`, `${nl(r.rcNetD, 1)} kN`);
    formula(c, "U.C.", "N_Ed / R_c;net;d", `${nl(first.input.nEd, 1)} / ${nl(r.rcNetD, 1)}`, `${nl(r.unityCheck, 2)}`);
    paragraph(c, "Alleenstaande drukpaal bij een sondering. Historische zakking en paalgroepwerking niet geverifieerd.");
  } else if (inputs.endAnalysis !== false) renderEndAnalysis(c, inputs.sonderingen, inputs.summary, totalNEd);
  inputs.appendix?.(c);

  // Vervang het {tp}-token door het werkelijke paginatotaal.
  if (typeof doc.putTotalPages === "function") {
    doc.putTotalPages(TOTAL_PAGES_TOKEN);
  }

  return new Uint8Array(doc.output("arraybuffer"));
}
