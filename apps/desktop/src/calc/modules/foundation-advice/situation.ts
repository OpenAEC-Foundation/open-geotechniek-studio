// Situatietekening uit de RD-coördinaten van de sonderingen: op schaal, met
// RD-raster, noordpijl en schaalbalk. Eén indeling voor scherm en PDF.
import type { jsPDF } from 'jspdf';
import type { CptSummary } from './analysis';

export interface SituationLayout {
  points: Array<{ id: string; x: number; y: number; px: number; py: number; bearingTopNap: number | null }>;
  missing: string[];
  minX: number; minY: number; span: number;
  grid: number[]; gridStep: number;
  /** Lengte van de schaalbalk in m en in tekeningeenheden. */
  bar: { m: number; units: number };
}

const NICE = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000];

/** Indeling in een vierkant van `size` eenheden. */
export function situationLayout(cpts: CptSummary[], size: number): SituationLayout {
  const located = cpts.filter((c) => Number.isFinite(c.x) && Number.isFinite(c.y));
  const missing = cpts.filter((c) => !located.includes(c)).map((c) => c.id);
  const xs = located.map((c) => c.x!), ys = located.map((c) => c.y!);
  const cx = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0, cy = ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0;
  const raw = xs.length ? Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) : 0;
  const span = Math.max(40, raw * 1.35);
  const minX = cx - span / 2, minY = cy - span / 2;
  const gridStep = NICE.find((s) => span / s <= 6) ?? 5000;
  const grid: number[] = [];
  for (let g = Math.ceil(Math.min(minX, minY) / gridStep) * gridStep; g <= Math.max(minX, minY) + span; g += gridStep) grid.push(g);
  const barM = NICE.find((s) => s >= span / 5) ?? gridStep;
  return {
    points: located.map((c) => ({ id: c.id, x: c.x!, y: c.y!, px: (c.x! - minX) / span * size, py: size - (c.y! - minY) / span * size, bearingTopNap: c.bearingTopNap })),
    missing, minX, minY, span, grid, gridStep, bar: { m: barM, units: barM / span * size },
  };
}

/** Situatietekening in een PDF, in een vierkant vak (mm) linksboven op (x0, y0). */
export function drawSituationPdf(doc: jsPDF, cpts: CptSummary[], x0: number, y0: number, size: number): void {
  const L = situationLayout(cpts, size);
  doc.setDrawColor(40); doc.setLineWidth(0.3); doc.rect(x0, y0, size, size);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(140);
  doc.setLineWidth(0.1); doc.setDrawColor(215);
  for (const g of L.grid) {
    const gx = x0 + (g - L.minX) / L.span * size, gy = y0 + size - (g - L.minY) / L.span * size;
    if (gx > x0 && gx < x0 + size) { doc.line(gx, y0, gx, y0 + size); doc.text(`X ${Math.round(g)}`, gx + 0.8, y0 + size - 1.2); }
    if (gy > y0 && gy < y0 + size) { doc.line(x0, gy, x0 + size, gy); doc.text(`Y ${Math.round(g)}`, x0 + 1, gy - 0.8); }
  }
  doc.setTextColor(0);
  for (const p of L.points) {
    const px = x0 + p.px, py = y0 + p.py, r = 2;
    doc.setFillColor(217, 119, 6); doc.setDrawColor(60); doc.setLineWidth(0.25);
    doc.triangle(px, py - r, px - r * 0.9, py + r * 0.6, px + r * 0.9, py + r * 0.6, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.text(p.id, px + 2.6, py - 0.6);
    if (p.bearingTopNap !== null) { doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(90); doc.text(`dkl NAP ${p.bearingTopNap.toFixed(1).replace('.', ',')}`, px + 2.6, py + 2.2); doc.setTextColor(0); }
  }
  // Noordpijl en schaalbalk rechtsonder.
  const nx = x0 + size - 10, ny = y0 + 12;
  doc.setFillColor(40, 40, 40); doc.triangle(nx, ny - 7, nx - 3, ny + 2, nx + 3, ny + 2, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.text('N', nx, ny - 8.5, { align: 'center' });
  const bx = x0 + 6, by = y0 + size - 7;
  doc.setFillColor(40, 40, 40); doc.rect(bx, by, L.bar.units / 2, 1.4, 'F'); doc.setFillColor(255, 255, 255); doc.rect(bx + L.bar.units / 2, by, L.bar.units / 2, 1.4, 'FD');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5);
  doc.text('0', bx, by - 1); doc.text(`${L.bar.m} m`, bx + L.bar.units, by - 1, { align: 'center' });
  if (L.missing.length) { doc.setFontSize(6.5); doc.setTextColor(150, 60, 0); doc.text(`Zonder coördinaten: ${L.missing.join(', ')}`, x0 + 2, y0 + 4); doc.setTextColor(0); }
}
