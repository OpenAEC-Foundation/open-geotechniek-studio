// Draagvermogentabellen als bijlage van het paalrapport: eerst de keuzetabel
// (hoogste puntniveau per maat en sondering, met spreiding), daarna per
// sondering Rc;net;d per puntniveau en maat. Het gekozen niveau krijgt een *.
import type { CapacityMatrix, MapBand, SizeChoice } from "../capacity-table";
import { governingCount, governingLevels, invalidReason, levelMin, mapBand } from "../capacity-table";
import type { Cpt } from "../../../../types/cpt";
import { type Cursor, M, nl, nlNap, paragraph, sectionTitle, table, winAnsi } from "./pile-report-pdf";

/** Maximaal zoveel sonderingen naast elkaar in één keuzetabel op A4. */
const CPT_COLUMNS = 7;

export function renderCapacityAppendix(c: Cursor, m: CapacityMatrix, choices: SizeChoice[], sizeLabel: (s: number) => string): void {
  c.newPage();
  sectionTitle(c, "Draagvermogentabellen");
  paragraph(c, `Netto ontwerpweerstand Rc;net;d na aftrek van negatieve kleef, per sondering, paalmaat en puntniveau. Gezocht: ${nl(m.target.minKn, 0)} tot ${nl(m.target.maxKn, 0)} kN. De keuzetabel geeft per maat het hoogste puntniveau dat de ondergrens haalt (de kortste paal die voldoet) en de spreiding van dat niveau over de sonderingen.`);

  sectionTitle(c, "Keuzetabel: puntniveau [m NAP] per maat en sondering");
  for (let start = 0; start < m.cpts.length; start += CPT_COLUMNS) {
    const ids = m.cpts.slice(start, start + CPT_COLUMNS).map((x) => x.cptId);
    const last = start + CPT_COLUMNS >= m.cpts.length;
    const cols = [{ label: "Maat [mm]", width: 14 }, ...ids.map((id) => ({ label: id, width: 16, align: "right" as const })),
      ...(last ? [{ label: "Hoogste", width: 14, align: "right" as const }, { label: "Laagste", width: 14, align: "right" as const }, { label: "Spreiding [m]", width: 15, align: "right" as const }, { label: "Gehaald", width: 12, align: "right" as const }] : [])];
    const rows = choices.map((ch) => [sizeLabel(ch.sizeMm), ...ch.perCpt.slice(start, start + CPT_COLUMNS).map((p) => p.toeNap === null ? (p.cptTooShort ? "buiten bereik" : "niet gehaald") : `${nlNapShort(p.toeNap)}${p.aboveMax ? " (ruim)" : ""}`),
      ...(last ? [ch.highestNap === null ? "-" : nlNapShort(ch.highestNap), ch.lowestNap === null ? "-" : nlNapShort(ch.lowestNap), ch.spreadM === null ? "-" : nl(ch.spreadM, 2), `${ch.reached}/${m.cpts.length}`] : [])]);
    table(c, cols, rows, { size: 7 });
  }
  paragraph(c, "(ruim): ook de kortste paal die voldoet zit boven de bovengrens; een kleinere maat ligt voor de hand.", { italic: true, size: 7.5 });

  for (const cpt of m.cpts) {
    sectionTitle(c, `Sondering ${cpt.cptId}: Rc;net;d [kN]`);
    if (cpt.missing) { paragraph(c, "Sondering ontbreekt in het project."); continue; }
    if (cpt.profileNote) paragraph(c, cpt.profileNote, { italic: true, size: 7.5 });
    const chosen = choices.map((ch) => ch.perCpt.find((p) => p.cptId === cpt.cptId)?.toeNap ?? null);
    const cols = [{ label: "Punt [m NAP]", width: 16 }, ...m.sizesMm.map((s) => ({ label: sizeLabel(s), width: 14, align: "right" as const }))];
    const rows = m.toeNaps.map((t, li) => [nlNapShort(t), ...m.sizesMm.map((_, si) => {
      const r = cpt.cells[si][li].result;
      if (!r.ok) return invalidReason(r.error, r.errorCode);
      return `${nl(r.summary.rcNetD, 0)}${chosen[si] === t ? "*" : ""}`;
    })]);
    table(c, cols, rows, { size: 7 });
  }
  paragraph(c, "* gekozen puntniveau: hoogste niveau waarop de ondergrens wordt gehaald.", { italic: true, size: 7.5 });
}

/** NAP-niveau als getal met twee decimalen, zonder voorvoegsel. */
function nlNapShort(v: number): string {
  return nlNap(v).replace(/^NAP\s*/i, "").replace(/\s*m$/, "");
}

/* ------------------------------------------------------------------ */
/* Maatgevend overzicht met plattegrond van de sonderingen.            */
/* ------------------------------------------------------------------ */

/** Eén paaltype in het overzicht: naam, doorsnedevorm en de gerekende matrix. */
export interface ReportSystem { name: string; circular: boolean; m: CapacityMatrix }

const BAND_RGB: Record<MapBand, [number, number, number]> = {
  low: [185, 28, 28], short: [224, 138, 30], ok: [124, 192, 138], ample: [22, 101, 52], none: [235, 235, 235],
};
const sizeText = (s: ReportSystem, size: number) => `${s.circular ? "Ø" : "□"}${size}`;

/**
 * Per gezocht draagvermogen, paaltype en paalmaat het hoogste puntniveau
 * waarop alle sonderingen voldoen, gevolgd door één plattegrond per
 * draagvermogen op het eerste niveau dat voldoet.
 */
export function renderGoverningAppendix(c: Cursor, systems: ReportSystem[], targetsKn: number[], cpts: Map<string, Cpt>): void {
  if (!targetsKn.length || !systems.length) return;
  const many = systems.length > 1;
  const perSystem = systems.map((s) => governingLevels(s.m, targetsKn));
  c.newPage();
  sectionTitle(c, "Maatgevend overzicht");
  paragraph(c, "Per gezocht draagvermogen en paalmaat het hoogste puntniveau waarop alle gekozen sonderingen Rc;net;d halen, met de sondering die daar de laagste waarde geeft. Niet gehaald: het niveau met de hoogste laagste waarde en de sonderingen die daar tekortkomen.");
  const cols = [{ label: "Rc;net;d ≥ [kN]", width: 15, align: "right" as const }, ...(many ? [{ label: "Paaltype", width: 40 }] : []), { label: "Maat [mm]", width: 13 },
    { label: "Punt [m NAP]", width: 15, align: "right" as const }, { label: "Maatgevend", width: 18 }, { label: "Rc;net;d [kN]", width: 15, align: "right" as const }, { label: "Opmerking", width: 46 }];
  const rows: string[][] = [];
  targetsKn.forEach((target, ti) => systems.forEach((s, si) => perSystem[si][ti].cells.forEach((cell) => rows.push([
    nl(target, 0), ...(many ? [s.name] : []), sizeText(s, cell.sizeMm),
    cell.reached ? nlNapShort(cell.toeNap!) : "niet gehaald",
    cell.governingCptId ?? "-", cell.rcMinD === null ? "-" : nl(cell.rcMinD, 0),
    cell.reached ? "" : cell.toeNap === null ? "geen uitkomst" : `hoogstens op ${nlNapShort(cell.toeNap)}; tekort: ${cell.failing.join(", ")}`,
  ]))));
  table(c, cols, rows, { size: 7 });
  const counts = governingCount(perSystem.flat());
  const total = perSystem.flat().reduce((a, r) => a + r.cells.filter((x) => x.governingCptId).length, 0);
  if (counts.length && systems[0].m.cpts.length > 1)
    paragraph(c, `Vaakst maatgevend: ${counts.slice(0, 3).map((x) => `${x.cptId} (${x.count} van ${total})`).join(", ")}.`, { size: 8 });

  targetsKn.forEach((target, ti) => {
    for (let si = 0; si < systems.length; si++) {
      const cell = perSystem[si][ti].cells.find((x) => x.reached);
      if (!cell) continue;
      const s = systems[si];
      renderPlan(c, s, s.m.sizesMm.indexOf(cell.sizeMm), s.m.toeNaps.indexOf(cell.toeNap!), target, cpts, many);
      return;
    }
    paragraph(c, `Geen plattegrond voor ${nl(target, 0)} kN: met geen van de maten gehaald op alle sonderingen.`, { italic: true, size: 8 });
  });
}

function renderPlan(c: Cursor, s: ReportSystem, si: number, li: number, target: number, cpts: Map<string, Cpt>, many: boolean): void {
  const W = 112, H = 78, PAD = 9;
  c.reserve(H + 26);
  sectionTitle(c, `Plattegrond: ${nl(target, 0)} kN, ${many ? `${s.name} ` : ""}${sizeText(s, s.m.sizesMm[si])} op ${nlNap(s.m.toeNaps[li])}`);
  const points = s.m.cpts.map((x) => {
    const r = x.cells[si][li].result, pos = cpts.get(x.cptId)?.position, rc = r.ok ? r.summary.rcNetD : null;
    return { id: x.cptId, rc, band: mapBand(rc, target), x: pos && Number.isFinite(pos.x_rd) ? pos.x_rd : null, y: pos && Number.isFinite(pos.y_rd) ? pos.y_rd : null };
  });
  const placed = points.filter((p) => p.x !== null && p.y !== null) as Array<typeof points[number] & { x: number; y: number }>;
  const loose = points.filter((p) => p.x === null || p.y === null);
  const min = levelMin(s.m, si, li);
  const doc = c.doc, left = M.left, top = c.y;
  if (placed.length) {
    doc.setDrawColor(190); doc.setLineWidth(.2); doc.rect(left, top, W, H);
    const xs = placed.map((p) => p.x), ys = placed.map((p) => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const span = Math.max(x1 - x0, y1 - y0, 1);
    const k = Math.min((W - 2 * PAD) / Math.max(x1 - x0, span * .05), (H - 2 * PAD) / Math.max(y1 - y0, span * .05));
    for (const p of placed) {
      const px = left + W / 2 + (p.x - (x0 + x1) / 2) * k, py = top + H / 2 - (p.y - (y0 + y1) / 2) * k;
      const governing = p.id === min.cptId;
      doc.setFillColor(...BAND_RGB[p.band]); doc.setDrawColor(30); doc.setLineWidth(governing ? .7 : .2);
      doc.circle(px, py, governing ? 2.4 : 2, "FD");
      doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(0);
      doc.text(winAnsi(p.id), px, py - 3.2, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.text(p.rc === null ? "-" : nl(p.rc, 0), px, py + 5, { align: "center" });
    }
    if (placed.length > 1) {
      const raw = span / 4, pw = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-6)));
      const bar = [1, 2, 5, 10].map((v) => v * pw).reduce((a, b) => Math.abs(b - raw) < Math.abs(a - raw) ? b : a);
      doc.setDrawColor(0); doc.setLineWidth(.5); doc.line(left + W - 4 - bar * k, top + H - 3, left + W - 4, top + H - 3);
      doc.setFontSize(6); doc.text(`${bar} m`, left + W - 4 - bar * k / 2, top + H - 4.2, { align: "center" });
    }
    doc.setFontSize(7); doc.text("N", left + 4, top + 9, { align: "center" });
    doc.setFillColor(90, 90, 90); doc.triangle(left + 4, top + 2, left + 5.3, top + 6, left + 2.7, top + 6, "F");
  } else {
    doc.setFont("helvetica", "italic"); doc.setFontSize(8);
    doc.text(winAnsi("Geen van de sonderingen heeft een positie; de plattegrond kan niet worden getekend."), left, top + 4);
  }
  // legenda rechts van de plattegrond
  const lx = left + W + 6;
  const legend: Array<[MapBand, string]> = [["low", `< ${nl(.8 * target, 0)} kN`], ["short", `${nl(.8 * target, 0)}-${nl(target, 0)} kN`],
    ["ok", `${nl(target, 0)}-${nl(1.25 * target, 0)} kN`], ["ample", `> ${nl(1.25 * target, 0)} kN`], ["none", "geen uitkomst"]];
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(0);
  legend.forEach(([band, text], i) => {
    doc.setFillColor(...BAND_RGB[band]); doc.setDrawColor(30); doc.setLineWidth(.2); doc.circle(lx + 1.5, top + 4 + i * 5.5, 1.5, "FD");
    doc.text(winAnsi(text), lx + 5, top + 5 + i * 5.5);
  });
  doc.text(winAnsi("Dikke rand: laagste waarde"), lx, top + 5 + legend.length * 5.5 + 2);
  doc.text(winAnsi("Getal: Rc;net;d [kN]"), lx, top + 5 + legend.length * 5.5 + 6.5);
  c.y = top + (placed.length ? H : 6) + 5;
  if (min.cptId && min.rcMinD !== null) paragraph(c, `Laagste op dit niveau: ${min.cptId} met ${nl(min.rcMinD, 0)} kN.`, { size: 8 });
  if (loose.length) paragraph(c, `Zonder positie, niet getekend: ${loose.map((p) => `${p.id}${p.rc === null ? "" : ` (${nl(p.rc, 0)} kN)`}`).join(", ")}.`, { size: 8 });
}
