// Rapportpagina per magnetometersondering: de sporen tegen de diepte, de gebruikte instellingen en
// de tabel met zones. Zelfde paginakop en accentkleur als de andere onderdelen van het sondeerrapport.
import type { Cpt } from "../types/cpt";
import { currentBrand } from "../report/reportBrand";
import { pdfText, type ReportFlow } from "../utils/browserReportSections";
import { analyseMagnetometer, magSettingsFor, type MagAnalysis, type MagSettings, type MagZone } from "./analysis";
import { magnetometerData, type MagnetometerData } from "./channels";
import { buildTracks, depthMaxOf, fmtValue, LINE_COLORS, type LineKey, type Track, type TrackKey } from "./tracks";

type Color = [number, number, number];
const INK: Color = [25, 25, 25], LABEL: Color = [95, 95, 102], RULE: Color = [226, 226, 230], GRID: Color = [232, 232, 236];
const LEFT = 15, WIDTH = 180, BOTTOM = 278;

export const MAG_REPORT_DISCLAIMER =
  "Deze pagina is een presentatie van meetgegevens. De gemarkeerde zones volgen alleen uit de ingestelde drempels; " +
  "dit is geen beoordeling en vervangt geen vrijgave of beoordeling door een deskundige.";

const TITLES: Record<TrackKey, string> = {
  qc: "qc", components: "Componenten - mediaan", total: "Totale veldsterkte", gradient: "Verticale gradiënt",
  inclination: "Inclinatie", declination: "Declinatie",
};
const LINE_LABELS: Record<LineKey, string> = {
  qc: "qc", x: "Bx", y: "By", z: "Bz", total: "|B|", gradient: "d|B|/dz", inclination: "inclinatie", declination: "declinatie",
};

const signed = (v: number, digits = 0) => (v > 0 ? "+" : "") + v.toFixed(digits);
const depthText = (v: number | null, fallback: string) => (v == null ? fallback : `${v.toFixed(2)} m`);

/** De regels onder "Instellingen": ook gebruikt door de test, zodat het rapport zegt waarmee gerekend is. */
export function settingsRows(data: MagnetometerData, analysis: MagAnalysis, settings: MagSettings): Array<[string, string]> {
  const rows: Array<[string, string]> = [
    ["Kanalen in het bestand", data.present.map((c) => ({ x: "Bx", y: "By", z: "Bz", total: "|B|", inclination: "inclinatie", declination: "declinatie" })[c]).join(", ")],
    ["Totale veldsterkte", data.totalSource === "measured" ? "gemeten kanaal" : data.totalSource === "computed" ? "berekend uit de componenten: wortel(Bx² + By² + Bz²)" : "niet beschikbaar"],
  ];
  if (!data.total) return rows;
  rows.push(
    ["Traject achtergrondveld", `${depthText(settings.backgroundFrom, "begin")} tot ${depthText(settings.backgroundTo, "einde")} onder maaiveld`],
    ["Achtergrondveld", analysis.background == null ? "geen meetwaarden in het traject" : `${analysis.background.toFixed(1)} nT (mediaan van ${analysis.backgroundCount} waarden)`],
    ["Drempel afwijking", `${fmtValue(settings.anomalyThreshold, 0.1)} nT ten opzichte van het achtergrondveld`],
    ["Drempel gradiënt", `${fmtValue(settings.gradientThreshold, 0.1)} nT/m (centrale differentie over de buurpunten)`],
    ["Zones vanaf", `${settings.analysisFrom.toFixed(2)} m onder maaiveld`],
    ["Zones samenvoegen binnen", `${settings.mergeGap.toFixed(2)} m`],
  );
  return rows;
}

/** De rijen van de zonetabel als tekst. */
export function zoneRows(zones: MagZone[]): string[][] {
  return zones.map((z, i) => [
    String(i + 1), z.top.toFixed(2), z.bottom.toFixed(2), signed(z.peakAnomaly), z.peakAnomalyDepth.toFixed(2),
    z.peakGradient == null ? "-" : signed(z.peakGradient), z.peakGradientDepth == null ? "-" : z.peakGradientDepth.toFixed(2),
    [z.byAnomaly ? "afwijking" : "", z.byGradient ? "gradiënt" : ""].filter(Boolean).join(" + "),
  ]);
}

function drawTracks(flow: ReportFlow, tracks: Track[], depth: number[], zones: MagZone[], top: number, height: number) {
  const { doc } = flow;
  const axisW = 10, gap = 2.5, headH = 13;
  const depthMax = depthMaxOf(depth);
  const plotT = top + headH, plotH = height - headH;
  const w = (WIDTH - axisW - gap * (tracks.length - 1)) / tracks.length;
  const toY = (d: number) => plotT + (Math.min(depthMax, Math.max(0, d)) / depthMax) * plotH;
  const step = [0.5, 1, 2, 5, 10, 20].find((s) => depthMax / s <= 16) ?? 50;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...LABEL);
  for (let d = 0; d <= depthMax + 1e-9; d += step) doc.text(d.toFixed(step < 1 ? 1 : 0), LEFT + axisW - 1.5, toY(d) + 0.8, { align: "right" });
  doc.text("Diepte onder maaiveld (m)", LEFT + 1.5, plotT + plotH / 2, { angle: 90, align: "center" });

  tracks.forEach((track, index) => {
    const l = LEFT + axisW + index * (w + gap);
    const toX = (v: number) => l + (Math.min(track.max, Math.max(track.min, v)) - track.min) / (track.max - track.min) * w;
    // Kop.
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.2);
    doc.setTextColor(...INK);
    doc.text(pdfText(TITLES[track.key]), l + w / 2, top + 2.5, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    if (track.lines.length > 1) {
      const slot = w / track.lines.length;
      track.lines.forEach((line, i) => {
        doc.setDrawColor(LINE_COLORS[line.key]);
        doc.setLineWidth(0.5);
        doc.line(l + i * slot + 0.5, top + 6.3, l + i * slot + 3.5, top + 6.3);
        doc.setTextColor(...INK);
        doc.text(LINE_LABELS[line.key], l + i * slot + 4.3, top + 7);
      });
    }
    doc.setTextColor(...LABEL);
    doc.text(fmtValue(track.min, track.step), l, top + 11.5);
    doc.text(fmtValue(track.max, track.step), l + w, top + 11.5, { align: "right" });
    doc.text(pdfText(track.unit), l + w / 2, top + 11.5, { align: "center" });
    // Raster.
    doc.setLineWidth(0.1);
    doc.setDrawColor(...GRID);
    for (let d = step; d < depthMax - 1e-9; d += step) doc.line(l, toY(d), l + w, toY(d));
    for (let v = track.min + track.step; v < track.max - 1e-9; v += track.step) doc.line(toX(v), plotT, toX(v), plotT + plotH);
    // Zones.
    if (track.key !== "qc")
      for (const zone of zones) {
        const y0 = toY(zone.top), h = Math.max(0.4, toY(zone.bottom) - y0);
        doc.setFillColor(250, 222, 222);
        doc.rect(l, y0, w, h, "F");
      }
    for (const guide of track.guides) {
      doc.setDrawColor(90);
      doc.setLineWidth(guide.kind === "background" ? 0.2 : 0.12);
      doc.setLineDashPattern(guide.kind === "background" ? [] : [0.8, 0.6], 0);
      doc.line(toX(guide.value), plotT, toX(guide.value), plotT + plotH);
    }
    doc.setLineDashPattern([], 0);
    for (const line of track.lines) {
      doc.setDrawColor(LINE_COLORS[line.key]);
      doc.setLineWidth(0.25);
      let previous: [number, number] | null = null;
      line.values.forEach((v, i) => {
        if (v == null || !Number.isFinite(depth[i])) { previous = null; return; }
        const point: [number, number] = [toX(v), toY(depth[i])];
        if (previous) doc.line(previous[0], previous[1], point[0], point[1]);
        previous = point;
      });
    }
    doc.setDrawColor(150);
    doc.setLineWidth(0.2);
    doc.rect(l, plotT, w, plotH);
  });
}

function heading(flow: ReportFlow, title: string, accent: Color) {
  const { doc } = flow;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...accent);
  doc.text(title, LEFT, flow.y);
  doc.setDrawColor(...accent);
  doc.setLineWidth(0.3);
  doc.line(LEFT, flow.y + 1.6, LEFT + WIDTH, flow.y + 1.6);
  flow.y += 6.5;
}

/** Voegt de pagina('s) voor één sondering toe; een sondering zonder magnetometerkanalen wordt overgeslagen. */
export function drawMagnetometerPages(flow: ReportFlow, cpt: Cpt): boolean {
  const data = magnetometerData(cpt);
  if (!data) return false;
  const { doc } = flow, accent = currentBrand().accent as Color;
  const settings = magSettingsFor(cpt), analysis = analyseMagnetometer(data, settings);
  const tracks = buildTracks(cpt, data, analysis, settings);
  const title = `Magnetometersondering ${pdfText(cpt.id)}`;
  flow.page(title);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...LABEL);
  doc.text("Magnetische veldsterkte tegen de diepte onder maaiveld. Rood gearceerd: trajecten boven een ingestelde drempel.", LEFT, flow.y - 4);
  drawTracks(flow, tracks, data.depth, analysis.zones, flow.y, 128);
  flow.y += 128 + 8;

  heading(flow, "Instellingen", accent);
  doc.setFontSize(8);
  for (const [label, value] of settingsRows(data, analysis, settings)) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...LABEL);
    doc.text(label, LEFT, flow.y);
    doc.setTextColor(...INK);
    doc.text(pdfText(value), LEFT + 50, flow.y);
    flow.y += 4;
  }
  flow.y += 4;

  if (data.total) {
    const columns = ["Nr.", "Bovenkant [m]", "Onderkant [m]", "Piek afwijking [nT]", "op diepte [m]", "Piek gradiënt [nT/m]", "op diepte [m]", "Drempel"];
    const widths = [9, 22, 22, 27, 20, 30, 20, 30];
    const header = () => {
      heading(flow, `Zones boven de drempel (${analysis.zones.length})`, accent);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(...LABEL);
      let x = LEFT;
      columns.forEach((c, i) => { doc.text(pdfText(c), x, flow.y); x += widths[i]; });
      flow.y += 1.5;
      doc.setDrawColor(...RULE);
      doc.setLineWidth(0.15);
      doc.line(LEFT, flow.y, LEFT + WIDTH, flow.y);
      flow.y += 3.5;
    };
    if (flow.y + 22 > BOTTOM) flow.page(`${title} - vervolg`);
    header();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...INK);
    if (!analysis.zones.length) {
      doc.text("Geen traject boven de ingestelde drempels.", LEFT, flow.y);
      flow.y += 4;
    }
    for (const row of zoneRows(analysis.zones)) {
      if (flow.y + 4 > BOTTOM - 14) {
        flow.page(`${title} - vervolg`);
        header();
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...INK);
      }
      let x = LEFT;
      row.forEach((cell, i) => { doc.text(pdfText(cell), x, flow.y); x += widths[i]; });
      flow.y += 4;
    }
    doc.setFontSize(7);
    doc.setTextColor(...LABEL);
    doc.text("Piek afwijking = grootste afwijking van het achtergrondveld in de zone. Diepten in m onder maaiveld.", LEFT, flow.y + 1);
    flow.y += 6;
  }

  if (flow.y + 12 > BOTTOM) flow.page(`${title} - vervolg`);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(...INK);
  const lines = doc.splitTextToSize(MAG_REPORT_DISCLAIMER, WIDTH) as string[];
  doc.text(lines, LEFT, flow.y + 2);
  flow.y += lines.length * 4 + 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  return true;
}
