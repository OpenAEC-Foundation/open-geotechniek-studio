// PDF-uitdraai damwand, met dezelfde kop, voet en opmaak als de andere rekenbladen.
import { jsPDF } from "jspdf";
import type { ProjectContext } from "../../framework/types";
import { M, TOTAL_PAGES_TOKEN, type Cursor, formula, kv, makeCursor, nl, paragraph, sectionTitle, table } from "../pile-bearing-capacity/parts/pile-report-pdf";
import type { BlumCase } from "./blum";
import { DEFAULT_FACTORS, DEFAULT_TIE, GAMMA_WATER, anchorAngle, anchorStiffness, hasAnchor, normalizeWallInput, supportPreload, supportStiffness, wallLoads, wallSupports, type RunSample, type WallAnchor, type WallInput, type WallResult, type WallRun } from "./compute";
import { sheetContour } from "../../library/sheetPileContour";
import type { SheetPileProfile } from "../../library/sheetPiles";
import { niceTicks, wallScene } from "./scene";
import { anchorWallProfile, rodSection, tieGeometry } from "./tie-anchorage";

const NORM = "NEN 9997-1 met CUR 166; NEN-EN 1993-5";
const NORM_REVETMENT = "NEN 9997-1 met CUR 166; NEN-EN 1995-1-1";
const reportDate = (iso: string | undefined) => (iso || new Date().toISOString().slice(0, 10)).slice(0, 10).split("-").reverse().join("-");
const nap = (v: number) => nl(v, 2);
/** Tekens die de standaardletters van de PDF niet kennen, voor tekst die rechtstreeks in een figuur staat. */
const plain = (s: string) => s.replace(/′/g, "'").replace(/−/g, "-").replace(/φ/g, "phi").replace(/δ/g, "delta").replace(/γ/g, "gamma").replace(/σ/g, "sigma").replace(/β/g, "beta").replace(/√/g, "wortel").replace(/≤/g, "<=").replace(/·/g, "x");
type Rgb = [number, number, number];
const rgb = (hex: string, mix: number): Rgb => [1, 3, 5].map((o) => Math.round(parseInt(hex.slice(o, o + 2), 16) * (1 - mix) + 255 * mix)) as Rgb;

export function wallReportFileName(input: WallInput): string {
  return (input.construction ?? "sheet-pile") === "sheet-pile" ? `damwand-${input.profileId.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}` : input.construction === "posts" ? "beschoeiing-palen-met-schotten" : "beschoeiing-planken";
}

/** Detail van één dubbele plank in de plattegrond, op schaal, met de maten uit de profieltabel. */
function profileFigure(c: Cursor, p: SheetPileProfile): void {
  const doc = c.doc, contour = sheetContour(p, 2), g = contour.geometry, k = Math.min(80 / contour.widthMm, 30 / Math.max(g.heightMm, 1)), h = Math.max(g.heightMm, 24) * k + 12;
  c.reserve(h + 2);
  const x0 = M.left + 30, y0 = c.y + 5 + (Math.max(g.heightMm, 24) * k) / 2, X = (x: number) => x0 + x * k, Y = (y: number) => y0 - y * k;
  const poly = (pts: Array<{ x: number; y: number }>, fill: Rgb) => { doc.setFillColor(...fill); doc.setDrawColor(31, 41, 55); doc.setLineWidth(0.1); doc.lines(pts.slice(1).map((q, n) => [(q.x - pts[n].x) * k, -(q.y - pts[n].y) * k]), X(pts[0].x), Y(pts[0].y), [1, 1], "FD", true); };
  doc.setDrawColor(120); doc.setLineWidth(0.1); doc.setLineDashPattern([2, 0.6, 0.4, 0.6], 0); doc.line(X(0) - 3, Y(0), X(contour.widthMm) + 3, Y(0)); doc.setLineDashPattern([], 0);
  for (const pts of contour.plates) poly(pts, [91, 100, 112]);
  for (const pts of contour.locks) poly(pts, [31, 41, 55]);
  doc.setDrawColor(110); doc.line(X(0), Y(g.heightMm / 2) - 2.5, X(g.widthMm), Y(g.heightMm / 2) - 2.5); doc.line(X(0) - 3, Y(g.heightMm / 2), X(0) - 3, Y(-g.heightMm / 2));
  doc.setFontSize(6.5); doc.setTextColor(70);
  doc.text(`b = ${nl(g.widthMm, 0)}`, X(g.widthMm / 2), Y(g.heightMm / 2) - 3.2, { align: "center" }); doc.text(`h = ${nl(g.heightMm, 0)}`, X(0) - 4, Y(0) - 0.8, { align: "right" });
  const approx = g.basis === "table" ? "" : "ca. ";
  doc.text(`t = ${nl(g.flangeThicknessMm, 1)} mm; s = ${nl(g.webThicknessMm, 1)} mm${g.basis !== "drawing" && (p.shape === "Z" || p.shape === "U") ? `; flens ${approx}${nl(g.flangeMm, 0)} mm; lijfhoek ${approx}${nl(g.webAngleDeg, 1)} graden` : ""}`, X(contour.widthMm) + 6, Y(0) - 1);
  doc.text(g.basis === "drawing" ? `contour uit fabrieks-DWG (${p.manufacturer})` : g.basis === "table" ? "maten uit de profieltabel; slot schematisch" : g.basis === "derived" ? "schematisch: flensbreedte en lijfhoek afgeleid uit A en I; slot als blokje" : "schematisch: alleen b, h en de plaatdikten komen uit de tabel", X(contour.widthMm) + 6, Y(0) + 2.5);
  doc.setTextColor(0); doc.setDrawColor(0); doc.setLineWidth(0.2);
  c.y += h + 2;
}

/** Doorsnede op schaal met de druk op de wand, en ernaast verplaatsing, moment en dwarskracht. */
function sectionFigure(c: Cursor, i: WallInput, r: Extract<WallResult, { ok: true }>, run: WallRun): void {
  const doc = c.doc, s = wallScene(i, r, run), top = s.topNap + Math.max(0.3, 0.08 * (s.topNap - s.bottomNap)), bottom = s.bottomNap, half = Math.max(1.2, Math.min(7, 0.42 * (s.topNap - s.toeNap + 1))), hi = s.supports.some((x) => x.kind === "grout" || x.tie) ? Math.max(half, s.extentHighM) : half;
  const secW = 78, colW = 26, gap = 5, k = Math.min(secW / (hi + half), 105 / (top - bottom)), h = (top - bottom) * k + 9;
  c.reserve(h + 4);
  const x0 = M.left + 20 + hi * k, y0 = c.y + 4, X = (x: number) => x0 + x * k, Y = (z: number) => y0 + (top - z) * k, wallHalf = Math.max(s.wallHeightM / 2, 0.5 / k);
  doc.setLineWidth(0.12); doc.setDrawColor(150); doc.setFontSize(6);
  for (const [layers, a, b] of [[s.high.layers, -hi, 0], [s.low.layers, 0, half]] as const) for (const l of layers) {
    doc.setFillColor(...rgb(l.color, 0.6)); doc.rect(X(a), Y(l.topNap), (b - a) * k, (l.topNap - l.bottomNap) * k, "FD");
    doc.setTextColor(90); doc.text(plain(l.name), a < 0 ? X(a) + 1 : X(b) - 1, Y(l.topNap) + 2.6, { align: a < 0 ? "left" : "right" });
  }
  doc.setFillColor(191, 219, 254);
  if (s.high.waterNap > s.high.surfaceNap) doc.rect(X(-hi), Y(s.high.waterNap), hi * k, (s.high.waterNap - s.high.surfaceNap) * k, "F");
  if (s.low.waterNap > s.low.surfaceNap) doc.rect(X(0), Y(s.low.waterNap), half * k, (s.low.waterNap - s.low.surfaceNap) * k, "F");
  // Druk op de wand: korreldruk met de waterdruk erbovenop.
  const total = (row: WallRun["rows"][number], side: "high" | "low") => (side === "high" ? (row.high?.pressureKpa ?? 0) + row.uHighKpa : (row.low?.pressureKpa ?? 0) + row.uLowKpa);
  const pMax = Math.max(1, ...run.rows.map((row) => Math.max(total(row, "high"), total(row, "low")))), pScale = ((Math.min(half, 7) - wallHalf - 0.3) * k * 0.8) / pMax;
  const diagram = (side: "high" | "low", value: (row: WallRun["rows"][number]) => number, fill: Rgb, stroke: Rgb) => {
    const sign = side === "high" ? -1 : 1, xw = X(sign * wallHalf), pts: Array<[number, number]> = [[xw, Y(s.wallTopNap)]];
    for (const row of run.rows) { const x = xw + sign * value(row) * pScale; pts.push([x, Y(row.topNap)], [x, Y(row.bottomNap)]); }
    pts.push([xw, Y(s.toeNap)]);
    doc.setFillColor(...fill); doc.setDrawColor(...stroke);
    doc.lines(pts.slice(1).map((p, n) => [p[0] - pts[n][0], p[1] - pts[n][1]]), pts[0][0], pts[0][1], [1, 1], "FD", true);
  };
  for (const side of ["high", "low"] as const) {
    diagram(side, (row) => total(row, side), [191, 219, 254], [37, 99, 235]);
    diagram(side, (row) => (side === "high" ? row.high?.pressureKpa : row.low?.pressureKpa) ?? 0, [222, 184, 135], [146, 64, 14]);
  }
  doc.setDrawColor(30); doc.setLineWidth(0.35);
  // Maaiveld met het profiel van de wand af, afgekapt aan de rand van de figuur.
  const groundLine = (side: -1 | 1, pts: Array<{ xM: number; nap: number }>, reach: number) => {
    const inside = pts.filter((q) => q.xM < reach - wallHalf), last = inside[inside.length - 1] ?? pts[0];
    const line: Array<[number, number]> = [...inside.map((q): [number, number] => [X(side * (wallHalf + q.xM)), Y(q.nap)]), [X(side * reach), Y(last.nap)]];
    for (let n = 1; n < line.length; n++) doc.line(line[n - 1][0], line[n - 1][1], line[n][0], line[n][1]);
  };
  groundLine(-1, s.profileHigh, hi); groundLine(1, s.profileLow, half);
  if (s.construction === "sheet-pile") doc.setFillColor(91, 100, 112); else doc.setFillColor(138, 98, 57);
  doc.setLineWidth(0.15); doc.rect(X(-wallHalf), Y(s.wallTopNap), 2 * wallHalf * k, (s.wallTopNap - s.toeNap) * k, "FD");
  if (s.boards) { const w = Math.max(0.5, s.boards.thicknessM * k); doc.rect(X(-wallHalf) - w, Y(s.wallTopNap), w, (s.wallTopNap - s.boards.bottomNap) * k, "FD"); }
  if (s.waling) doc.rect(X(wallHalf), Y(s.waling.levelNap) - 1, 1, 2, "FD");
  const level = (z: number, text: string, color: Rgb, a: number, b: number) => {
    doc.setDrawColor(...color); doc.setTextColor(...color); doc.setLineWidth(0.15); doc.setLineDashPattern([1, 0.7], 0);
    if (b > a) doc.line(X(a), Y(z), X(b), Y(z));
    doc.setLineDashPattern([], 0); doc.text(text, X(-hi) - 1, Y(z) + 0.7, { align: "right" });
  };
  level(s.high.surfaceNap, `mv ${nap(s.high.surfaceNap)}`, [60, 60, 60], 0, 0);
  level(s.high.waterNap, `water ${nap(s.high.waterNap)}`, [37, 99, 235], -hi, -wallHalf);
  level(s.toeNap, `teen ${nap(s.toeNap)}`, [60, 60, 60], -hi, wallHalf);
  doc.setDrawColor(37, 99, 235); doc.setLineDashPattern([1, 0.7], 0); doc.line(X(wallHalf), Y(s.low.waterNap), X(half), Y(s.low.waterNap)); doc.setLineDashPattern([], 0);
  doc.setTextColor(60); doc.text(`${nap(s.low.surfaceNap)}`, X(wallHalf) + 1, Y(s.low.surfaceNap) - 0.8);
  if (s.slip) {
    doc.setDrawColor(185, 28, 28); doc.setLineWidth(0.2); doc.setLineDashPattern([0.6, 0.8], 0);
    doc.line(X(-wallHalf), Y(s.toeNap), X(-wallHalf - s.slip.reachM), Y(Math.min(s.wallTopNap, s.high.surfaceNap))); doc.setLineDashPattern([], 0);
  }
  // Passief glijvlak van een ankerschot of ankerplaat, gestippeld (paars).
  const sec = (q: { x: number; z: number }): [number, number] => [X(-(wallHalf + q.x)), Y(q.z)];
  for (const p of s.passiveSlips) {
    const run = Math.max(0, p.toNap - p.fromNap) / Math.tan((p.angleDeg * Math.PI) / 180), a0 = sec({ x: p.fromXM, z: p.fromNap }), b0 = sec({ x: p.fromXM - run, z: p.toNap });
    doc.setDrawColor(124, 58, 237); doc.setLineWidth(0.2); doc.setLineDashPattern([0.6, 0.8], 0); doc.line(a0[0], a0[1], b0[0], b0[1]); doc.setLineDashPattern([], 0);
  }
  for (const sup of s.supports) {
    const a = (sup.angleDeg * Math.PI) / 180, strut = sup.kind === "strut", dir = strut ? 1 : -1, g = sup.tie;
    const free = strut ? Math.min(half - wallHalf - 0.1, sup.freeM) : g ? Math.hypot(g.rodTo.x - g.rodFrom.x, g.rodTo.z - g.rodFrom.z) : sup.freeM;
    const at = (len: number): [number, number] => [X(dir * (wallHalf + len * Math.cos(a))), Y(sup.levelNap - len * Math.sin(a))], p1 = at(0), p2 = at(free), p3 = at(free + sup.groutM);
    doc.setDrawColor(180, 83, 9); doc.setLineWidth(sup.kind === "strut" ? 0.6 : 0.3); doc.line(p1[0], p1[1], p2[0], p2[1]);
    if (sup.groutM > 0) { doc.setDrawColor(107, 114, 128); doc.setLineWidth(Math.max(0.9, sup.groutDiameterM * k)); doc.line(p2[0], p2[1], p3[0], p3[1]); }
    if (g) {
      // Verankering op schaal: schot, plaat of blok, of de paal van kop tot punt.
      const pts = g.body.map(sec);
      if (g.type === "wall") doc.setFillColor(107, 117, 129); else doc.setFillColor(168, 162, 158);
      doc.setDrawColor(55, 65, 81); doc.setLineWidth(0.15);
      doc.lines(pts.slice(1).map((q, m) => [q[0] - pts[m][0], q[1] - pts[m][1]]), pts[0][0], pts[0][1], [1, 1], "FD", true);
      doc.setFillColor(180, 83, 9); doc.rect(p2[0] - 0.4, p2[1] - 0.8, 0.8, 1.6, "F");
    }
    if (!strut) { doc.setFillColor(180, 83, 9); doc.rect(X(wallHalf) + (s.waling ? 1 : 0), p1[1] - 0.8, 0.8, 1.6, "F"); }
    if (strut && sup.open) { doc.setDrawColor(220, 38, 38); doc.setLineWidth(0.25); doc.lines([[0.8, 1], [-0.8, 0.8], [0.8, 1], [-0.8, 0.8]], p2[0] - 0.8, p2[1] - 1.8, [1, 1], "S", false); doc.setTextColor(220, 38, 38); doc.text("overkant niet bekend", p2[0] - 1.2, p2[1] + 3.2, { align: "right" }); }
    doc.setTextColor(180, 83, 9); if (sup.forceKnPerM !== null) doc.text(`${s.supports.length > 1 ? `${sup.id} ` : ""}${nl(sup.forceKnPerM, 0)} kN/m`, p2[0], p2[1] + (strut ? -1 : 2.4), { align: strut ? "right" : "left" });
  }
  if (s.surchargeKpa > 0) { doc.setTextColor(29, 78, 216); doc.text(`q = ${nl(s.surchargeKpa, 1)} kPa`, X(-hi / 2), Y(s.high.surfaceNap) - 1.5, { align: "center" }); }
  doc.setTextColor(90); doc.text(`druk op de wand: ${nl(pMax, 0)} kPa = ${nl((pMax * pScale) / k, 2)} m`, X(0), Y(bottom) + 3, { align: "center" });
  doc.text("hoge zijde", X(-hi) + 1, Y(bottom) + 3); doc.text("lage zijde", X(half) - 1, Y(bottom) + 3, { align: "right" });

  const columns: Array<{ title: string; value: (p: RunSample) => number; color: Rgb }> = [
    { title: "verplaatsing [mm]", value: (p) => p.yM * 1000, color: [15, 118, 110] }, { title: "moment [kNm/m]", value: (p) => p.momentKnM, color: [185, 28, 28] }, { title: "dwarskracht [kN/m]", value: (p) => p.shearKn, color: [29, 78, 216] },
  ];
  columns.forEach((col, n) => {
    const cx0 = X(half) + gap + n * (colW + gap), values = run.samples.map(col.value), ticks = niceTicks(Math.min(...values), Math.max(...values), 2);
    const lo = ticks[0], span = ticks[ticks.length - 1] - lo || 1, cx = (v: number) => cx0 + 1.5 + ((v - lo) / span) * (colW - 3);
    doc.setDrawColor(190); doc.setLineWidth(0.12); doc.rect(cx0, Y(s.wallTopNap), colW, (s.wallTopNap - s.toeNap) * k, "S");
    doc.setDrawColor(110); doc.line(cx(0), Y(s.wallTopNap), cx(0), Y(s.toeNap));
    doc.setLineDashPattern([0.8, 0.8], 0); doc.line(cx0, Y(s.low.surfaceNap), cx0 + colW, Y(s.low.surfaceNap)); doc.setLineDashPattern([], 0);
    doc.setTextColor(60); doc.text(col.title, cx0 + colW / 2, Y(s.wallTopNap) - 1.5, { align: "center" });
    for (const v of ticks) doc.text(nl(v, Math.abs(v) < 10 && v % 1 !== 0 ? 1 : 0), cx(v), Y(s.toeNap) + 3, { align: "center" });
    doc.setDrawColor(...col.color); doc.setLineWidth(0.35);
    doc.lines(run.samples.slice(1).map((p, m) => [cx(col.value(p)) - cx(col.value(run.samples[m])), Y(p.nap) - Y(run.samples[m].nap)]), cx(col.value(run.samples[0])), Y(run.samples[0].nap), [1, 1], "S", false);
    const peak = run.samples.reduce((best, p) => (Math.abs(col.value(p)) > Math.abs(col.value(best)) ? p : best), run.samples[0]), px = cx(col.value(peak));
    doc.setFillColor(...col.color); doc.circle(px, Y(peak.nap), 0.6, "F");
    doc.setTextColor(...col.color); doc.text(nl(col.value(peak), 1), px > cx0 + colW / 2 ? px - 1 : px + 1, Y(peak.nap) - 1, { align: px > cx0 + colW / 2 ? "right" : "left" });
  });
  doc.setTextColor(0); doc.setDrawColor(0); doc.setLineWidth(0.2);
  c.y += h + 4;
}

export function buildWallReport(raw: WallInput, r: WallResult, ctx: ProjectContext): Uint8Array {
  if (!r.ok) throw new Error(r.error);
  const i = normalizeWallInput(raw), sheet = i.construction === "sheet-pile", posts = i.construction === "posts", anchored = hasAnchor(i), subject = sheet ? "Damwand" : "Beschoeiing";
  const meta = ctx.projectMeta, f = { ...DEFAULT_FACTORS, ...i.factors }, u = r.uls, s = r.sls, sc = u.scenario, a = i.anchor;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const c = makeCursor(doc, { number: meta.project_number || "-", description: meta.title || subject, norm: sheet ? NORM : NORM_REVETMENT, date: reportDate(meta.date), author: meta.author || "Open Geotechniek Studio", onderdeel: subject });

  sectionTitle(c, `${sheet ? "Damwand" : posts ? "Beschoeiing van palen met schotten," : "Beschoeiing van planken,"} ${r.section.label}, ${anchored ? (a.kind === "strut" ? "enkel gestempeld" : a.kind === "grout" ? "met groutankers" : "enkel verankerd") : "onverankerd"}`, sheet ? NORM : NORM_REVETMENT);
  paragraph(c, "Beta release: dit rekenblad wordt nog gecontroleerd en de uitkomsten zijn niet geschikt voor toetsing bij vergunning of uitvoering.", { italic: true, size: 7.5 });
  kv(c, "Niveaus", `maaiveld hoge zijde NAP ${nap(i.groundHighNap)} m; ${sheet ? "ontgraving" : "bodem lage zijde"} NAP ${nap(i.excavationNap)} m; kerende hoogte ${nl(i.groundHighNap - i.excavationNap)} m`);
  kv(c, "Waterstanden", `hoge zijde NAP ${nap(i.waterHighNap)} m; lage zijde NAP ${nap(i.waterLowNap)} m; γ_w = ${nl(i.gammaWater ?? GAMMA_WATER, 2)} kN/m³`);
  kv(c, "Bovenbelasting", `q = ${nl(i.surchargeKpa, 1)} kPa op de hoge zijde, gelijkmatig`);
  kv(c, sheet ? "Wand" : posts ? "Paal" : "Plank", `${sheet && r.section.profile ? `${r.section.profile.manufacturer} ` : ""}${r.section.label}; bovenkant NAP ${nap(i.wallTopNap)} m, teen NAP ${nap(i.toeNap)} m, lengte ${nl(r.lengthM)} m`);
  kv(c, "Doorsnede", `EI = ${nl(r.eiKnM2, r.eiKnM2 < 100 ? 1 : 0)} kNm² per m wand; ${r.section.properties.map(([k, v]) => `${k} = ${v}`).join("; ")}${r.section.massKgPerM2 ? `; ${nl(r.section.massKgPerM2, 1)} kg/m²` : ""}`);
  if (sheet && r.section.profile) profileFigure(c, r.section.profile);
  if (r.corrosion) {
    const co = r.corrosion, g = i.grade, arrow = (x: number | null, y: number | null, d: number) => (x === null ? "-" : `${nl(x, d)} / ${nl(y ?? 0, d)}`);
    sectionTitle(c, "Afroesting", "NEN-EN 1993-5 tabel 4-1 en 4-2");
    for (const z of co.zones) kv(c, z.label ? `Zone ${z.label}` : "Hele wand", `hoge zijde ${nl(z.lossHighMm, 2)} mm (${z.sourceHigh}); lage zijde ${nl(z.lossLowMm, 2)} mm (${z.sourceLow})`);
    table(c, [{ label: "Zone", width: 24 }, { label: "t_f [mm]", width: 17, align: "right" }, { label: "t_w [mm]", width: 17, align: "right" }, { label: "A [cm²/m]", width: 20, align: "right" }, { label: "I [cm⁴/m]", width: 24, align: "right" }, { label: "W_el [cm³/m]", width: 20, align: "right" }, { label: "W_pl [cm³/m]", width: 20, align: "right" }, { label: "klasse", width: 12, align: "right" }, { label: "bepaald", width: 18 }],
      co.zones.map((z) => { const a = z.sheet.original, b = z.sheet.profile; return [z.label || "hele wand", arrow(a.flangeMm, b.flangeMm, 2), arrow(a.webMm, b.webMm, 2), arrow(a.areaCm2PerM, b.areaCm2PerM, 1), arrow(a.iCm4PerM, b.iCm4PerM, 0), arrow(a.welCm3PerM, b.welCm3PerM, 0), arrow(a.wplCm3PerM, b.wplCm3PerM, 0), `${a.classes?.[g] ?? "-"} / ${b.classes?.[g] ?? "-"}`, z.sheet.basis === "contour" ? "uit de contour" : z.sheet.basis === "approx" ? "benadering" : "geen"]; }), { size: 7 });
    paragraph(c, `Per waarde: zonder afroesting / na afroesting. Met een exacte contour schuift elke rand van de omtrek loodrecht naar binnen over het verlies van de zijde waar hij naar toe kijkt; A, I, W_el en W_pl volgen uit de verkleinde omtrek (als verhouding op de tabelwaarden). Zonder contour zijn I en W benaderd met (t_f − Δt) / t_f en A met de gemiddelde plaatdikte. De doorsnedeklasse is bepaald met de verkleinde flensdikte. ${co.reducedStiffness ? `De krachtsverdeling is gerekend met EI na afroesting, ${nl(r.eiKnM2, 0)} kNm² per m wand (zonder afroesting ${nl(co.eiOriginalKnM2, 0)}).` : "De krachtsverdeling is gerekend met de EI zonder afroesting; de afroesting telt alleen in de toetsen van de doorsnede."} De tabelwaarden zijn de aanbevolen waarden van de norm en zijn niet tegen de normtekst of de Nederlandse bijlage gelegd.`, { italic: true, size: 7.5 });
  }
  if (posts) kv(c, "Palen en schotten", `h.o.h. ${nl(i.posts.spacingM)} m; schotten ${nl(i.posts.boardMm, 0)} mm tot NAP ${nap(i.posts.boardBottomNap)} m; onder de schotten gronddruk over ${nl(i.posts.sizeMm, 0)} mm en passieve weerstand en bedding over ${nl(i.posts.spatialFactor, 1)} × de paalbreedte (factor voor ruimtelijke werking, invoer)`);
  if (!sheet && (i.material === "timber" || posts)) kv(c, "Hout", `${i.timber.classId}: f_m;k = ${nl(i.timber.fmK, 1)} N/mm²; f_v;k = ${nl(i.timber.fvK, 1)} N/mm²; E_0;mean = ${nl(i.timber.eMeanMPa, 0)} N/mm²; k_mod = ${nl(i.timber.kmod)}; γ_M = ${nl(i.timber.gammaM)}; k_cr = ${nl(i.timber.kcr)}`);
  const supportText = (x: WallInput["anchor"]) => `${x.kind === "strut" ? "stempel" : x.kind === "grout" ? "groutanker" : "ankerstaaf naar ankerschot of ankerpaal"} op NAP ${nap(x.levelNap)} m, ${nl(anchorAngle(x), 1)}° met de horizontaal, h.o.h. ${nl(x.spacingM)} m; ${x.rigid && x.kind !== "grout" ? "star" : `veerstijfheid ${nl(anchorStiffness(x), 0)} kN/m per anker, horizontaal ${nl(supportStiffness(x), 0)} kN/m per m wand`}${supportPreload(x) > 0 ? `; voorspanning ${nl(supportPreload(x), 1)} kN/m horizontaal` : ""}`;
  const supports = wallSupports(i);
  // Ankerstaaf: type verankering met de maten, de staaf zelf en de uitkomst van de liggingcontrole.
  const tieText = (x: WallAnchor): string => {
    if (x.kind !== "tie") return "";
    const tie = { ...DEFAULT_TIE, ...x.tie }, rod = rodSection(tie), an = x.anchorage;
    const rodPart = `staaf ${tie.rodType === "plain" ? `glad, d = ${nl(rod.diameterMm, 0)} mm met gesneden draad M${nl(rod.threadDiameterMm ?? 0, 0)} × ${nl(rod.pitchMm ?? 0, 1)}` : tie.rodType === "upset" ? `d = ${nl(rod.diameterMm, 0)} mm met opgestuikte draad M${nl(rod.threadDiameterMm ?? 0, 0)} × ${nl(rod.pitchMm ?? 0, 1)}` : "met eigen doorsneden"}: A_g = ${nl(rod.grossMm2, 0)} mm², A_s = ${nl(rod.threadMm2, 0)} mm²; ${tie.gradeId ? `${tie.gradeId}, ` : ""}f_y = ${nl(tie.fyMPa, 0)} N/mm², f_u = ${nl(tie.fuMPa, 0)} N/mm²`;
    if (!an) return `${rodPart}; verankering niet opgegeven (in de tekening schematisch)`;
    const g = tieGeometry(x.levelNap, x.angleDeg, an), p = anchorWallProfile(an);
    const body = an.type === "wall" ? `ankerschot ${p ? `van ${p.id}` : `van platen ${nl(an.wallWidthM)} m breed en ${nl(an.wallThicknessM, 3)} m dik per anker`}, van NAP ${nap(an.wallTopNap)} tot ${nap(an.wallBottomNap)} m`
      : an.type === "pile" ? `ankerpaal Ø ${nl(an.pileDiameterMm, 0)} mm, ${nl(an.pileLengthM)} m lang, helling ${nl(an.pileRakeDeg, 1)}° met de verticaal, kop NAP ${nap(g.topNap)} m en punt NAP ${nap(g.bottomNap)} m`
      : `ankerplaat ${nl(an.plateWidthM)} × ${nl(an.plateHeightM)} m, ${nl(an.plateThicknessM, 2)} m dik, van NAP ${nap(g.topNap)} tot ${nap(g.bottomNap)} m`;
    const loc = r.ties.find((y) => y.id === x.id);
    const locPart = loc ? `; ligging: actief glijvlak (${nl(loc.activeAngleDeg, 1)}°) op ${nl(loc.activeXM)} m${loc.passive ? `, met het passieve glijvlak van het schot (${nl(loc.passive.angleDeg, 1)}°) minstens ${nl(loc.passive.requiredXM)} m` : ""}, aanwezig ${nl(loc.frontXM)} m: ${loc.passes ? "voldoet" : "voldoet niet"}` : "";
    return `${body}; staaf ${nl(an.lengthM)} m tot de voorkant (${nl(g.front.x)} m achter de wand, NAP ${nap(g.front.z)} m); ${rodPart}${locPart}`;
  };
  if (!anchored) kv(c, "Steun", "geen");
  else for (const x of supports) {
    kv(c, supports.length > 1 ? `Steunpunt ${x.id}` : "Steun", supportText(x));
    const tieLine = tieText(x);
    if (tieLine) kv(c, supports.length > 1 ? `Ankerstaaf ${x.id}` : "Ankerstaaf", tieLine);
  }
  if (anchored && a.kind === "grout" && a.grout) {
    const g = a.grout;
    kv(c, "Groutanker", `vrije lengte ${nl(g.freeLengthM)} m; groutlichaam ${nl(g.groutLengthM)} m, rond ${nl(g.diameterMm, 0)} mm; ${g.tendonType === "strand" ? "strengen" : "staaf"}, A = ${nl(g.areaMm2, 0)} mm², ${g.tendonType === "strand" ? "f_p0,1k" : "f_y"} = ${nl(g.fMPa, 0)} N/mm², E = ${nl(g.eMPa, 0)} N/mm²; voorspankracht ${nl(g.prestressKn, 0)} kN per anker; schachtwrijving ${nl(g.shaftFrictionKpa, 0)} kPa (invoer)`);
  }
  if (i.profileHigh?.length || i.profileLow?.length) kv(c, "Maaiveld", [["hoge zijde", i.profileHigh], ["lage zijde", i.profileLow]].filter(([, p]) => (p as unknown[] | undefined)?.length).map(([side, p]) => `${side}: ${(p as Array<{ xM: number; dzM: number }>).map((q) => `(${nl(q.xM)} m; ${q.dzM >= 0 ? "+" : ""}${nl(q.dzM)} m)`).join(" ")}`).join("; ") + " (afstand tot de wand; hoogte ten opzichte van het maaiveld bij de wand)");
  const loads = wallLoads(i);
  if (loads.length) kv(c, "Belastingen op afstand", loads.map((l) => `${l.id}: ${l.kind === "strip" ? `strook ${nl(l.value, 1)} kPa van ${nl(l.fromM)} tot ${nl(l.toM)} m` : `lijnlast ${nl(l.value, 1)} kN/m op ${nl(l.fromM)} m`} uit de wand, ${l.side === "high" ? "hoge" : "lage"} zijde`).join("; ") + "; spreiding volgens Boussinesq, gespiegeld in de wand (Poulos en Davis, 1974)");
  if (r.phases.length > 1 || i.phases?.length) {
    sectionTitle(c, "Bouwfasen");
    table(c, [{ label: "Fase", width: 26 }, { label: "Lage zijde [m NAP]", width: 18, align: "right" }, { label: "Hoge zijde [m NAP]", width: 18, align: "right" }, { label: "Water hoog / laag [m NAP]", width: 26, align: "right" }, { label: "q [kPa]", width: 12, align: "right" }, { label: "Steunpunten", width: 26 }, { label: "Belastingen", width: 18 }],
      r.phases.map((p) => [p.name, nap(p.excavationNap), nap(p.groundHighNap), `${nap(p.waterHighNap)} / ${nap(p.waterLowNap)}`, nl(p.surchargeKpa, 1), p.supports.map((x) => `${x.id}${p.installed.includes(x.id!) ? " (nieuw)" : ""}`).join(", ") || "-", p.loadIds.join(", ") || "-"]), { size: 7.5 });
    paragraph(c, "Elke fase rekent verder vanaf de vervormde wand en de grond van de vorige fase: een veer begint op zijn druk aan het eind van de vorige fase, met K0 maal de verandering van de verticale korrelspanning erbij (binnen de nieuwe actieve en passieve grens); nieuwe grond begint neutraal op de vervormde wand. Een steunpunt werkt vanaf de verplaatsing waarbij het wordt aangebracht, met zijn voorspanning.", { italic: true, size: 7.5 });
  }
  if (i.cur?.enabled) {
    sectionTitle(c, "Stappenplan", "CUR 166");
    table(c, [{ label: "Stap", width: 14 }, { label: "Grond", width: 26 }, { label: "Factor op k_h", width: 22, align: "right" }, { label: "Water lage zijde", width: 26 }, { label: "Factor op M, V, F", width: 24, align: "right" }, { label: "Gerekend", width: 18 }],
      i.cur.steps.map((x) => [x.id, x.design ? "rekenwaarden" : "representatief", nl(x.khFactor, 3), x.lowWater === "up" ? `+${nl(f.deltaWaterLowM)} m` : x.lowWater === "down" ? `−${nl(f.deltaWaterLowM)} m` : "-", nl(x.resultFactor, 2), r.cases.some((k) => k.stepId === x.id) ? "ja" : x.on ? "vervalt" : "uit"]), { size: 7.5 });
    paragraph(c, "De stappen volgen de instellingen die openbare berekeningen per stap afdrukken; ze zijn niet tegen de tekst van CUR 166 gelegd. Rekenwaarden gelden in alle fasen. Stap 6.5 levert de verplaatsingen; maal de factor telt hij ook mee voor moment, dwarskracht en ankerkracht.", { italic: true, size: 7.5 });
  }
  if ((i.eiFactor ?? 1) !== 1) kv(c, "Buigstijfheid", `reductiefactor ${nl(i.eiFactor ?? 1)} op EI: in de berekening ${nl(r.eiKnM2, 0)} kNm² per m wand`);
  kv(c, "Partiële factoren", `γ_φ' = ${nl(f.gammaPhi, 3)} (op tan φ'); γ_c' = ${nl(f.gammaC)}; γ_cu = ${nl(f.gammaCu)}; γ_γ = ${nl(f.gammaGamma)}; γ_Q = ${nl(f.gammaQ)} op q; γ_k = ${nl(f.gammaK)} op k_h; γ_M0 = ${nl(f.gammaM0)}`);
  kv(c, "Toeslagen", `kerende hoogte ${nl(f.deltaAPct, 0)} % met een maximum van ${nl(f.deltaAMaxM)} m: Δa = ${nl(sc.deltaAM)} m, ontgraving in de berekening NAP ${nap(sc.low.surfaceNap)} m; water hoge zijde +${nl(f.deltaWaterHighM)} m, lage zijde −${nl(f.deltaWaterLowM)} m`);
  paragraph(c, "De factoren en toeslagen zijn invoer van de gebruiker; de sets in het rekenblad zijn een voorstel en zijn niet tegen de normtekst gelegd.", { italic: true, size: 7.5 });

  const layerTable = (title: string, layers: WallInput["layersHigh"]) => {
    sectionTitle(c, title);
    table(c, [{ label: "Bovenkant [m NAP]", width: 15, align: "right" }, { label: "Grondsoort", width: 28 }, { label: "γ [kN/m³]", width: 11, align: "right" }, { label: "γ_sat [kN/m³]", width: 12, align: "right" }, { label: "φ' [°]", width: 9, align: "right" },
      { label: "c' [kPa]", width: 9, align: "right" }, { label: "δ [°]", width: 9, align: "right" }, { label: "c_u [kPa]", width: 10, align: "right" }, { label: "k_h1 / k_h2 / k_h3 [kN/m³]", width: 24, align: "right" }, { label: "Δu boven / onder [kPa]", width: 16, align: "right" }],
    [...layers].sort((x, y) => y.topNap - x.topNap).map((l) => [nap(l.topNap), l.name, nl(l.gamma, 1), nl(l.gammaSat, 1), nl(l.phi, 1), nl(l.c, 1), nl(l.delta, 1), l.undrained ? nl(l.cu, 1) : "-", l.kh2 && l.kh3 ? `${nl(l.kh, 0)} / ${nl(l.kh2, 0)} / ${nl(l.kh3, 0)}` : nl(l.kh, 0), `${nl(l.excessTop ?? 0, 1)} / ${nl(l.excessBottom ?? 0, 1)}`]), { size: 7 });
  };
  layerTable(i.lowSameAsHigh ? "Grondlagen, beide zijden (representatieve waarden)" : "Grondlagen hoge zijde (representatieve waarden)", i.layersHigh);
  if (!i.lowSameAsHigh) layerTable("Grondlagen lage zijde (representatieve waarden)", i.layersLow);
  paragraph(c, "De beddingsconstanten zijn invoer van de gebruiker: één waarde is één tak, drie waarden de drietakkige veer van CUR 166 (secanswaarden tot 50, 80 en 100 % van passief min actief). Δu is wateroverspanning boven op de hydrostatische druk, lineair over de laag. Een c_u staat er alleen bij lagen die ongedraineerd zijn gerekend.", { italic: true, size: 7.5 });

  sectionTitle(c, "Gronddruk", "CUR 166; NEN-EN 1997-1 bijlage C");
  formula(c, "tan φ'_d", "tan φ'_rep / γ_φ'", null, "per laag in de tabel", undefined);
  formula(c, "δ_d", "δ_rep · φ'_d / φ'_rep", null, "de wandwrijving houdt haar verhouding tot φ'");
  formula(c, "K_0", "1 − sin φ'_d", null, "neutraal (Jaky)");
  formula(c, "K_a", "cos² φ' / (1 + √(sin(φ' + δ) · sin φ' / cos δ))²", null, "actief, recht glijvlak (Coulomb, Müller-Breslau)");
  formula(c, "K_p", "cos² φ' / (1 − √(sin(φ' + δ) · sin φ' / cos δ))²", null, "passief, recht glijvlak, voor δ ≤ φ'/3");
  formula(c, "K_p", "(1 + sin φ' · sin(2·m_w + φ')) / (1 − sin φ') · e^(2·v·tan φ')", null, "passief, gekromd glijvlak, voor δ > φ'/3", "bijlage C.2");
  paragraph(c, "Met cos(2·m_w + φ' + δ) = sin δ / sin φ' en v = 45° − φ'/2 − m_w. Alle coëfficiënten geven de horizontale component. Korreldruk: σ'_a = K_a·σ'_v − 2·c'·√K_a (niet kleiner dan 0), σ'_0 = K_0·σ'_v en σ'_p = K_p·σ'_v + K_pc·c', met K_pc = 2·√K_p (recht) of (K_p − 1)·cot φ' (gekromd). Ongedraineerde lagen, in totaalspanningen: σ_h = σ_v − 2·c_u actief en σ_v + 2·c_u passief. De waterdruk komt er aan beide zijden hydrostatisch bij.", { size: 7.5 });
  table(c, [{ label: "Laag", width: 34 }, { label: "φ'_d [°]", width: 11, align: "right" }, { label: "δ_d [°]", width: 11, align: "right" }, { label: "c'_d [kPa]", width: 11, align: "right" }, { label: "K_0", width: 10, align: "right" }, { label: "K_a", width: 10, align: "right" }, { label: "K_p", width: 10, align: "right" }, { label: "Glijvlak passief", width: 18 }, { label: "k_h;d [kN/m³]", width: 14, align: "right" }],
    r.coefficients.map((k) => [`${k.name}${i.lowSameAsHigh ? "" : k.side === "high" ? " (hoog)" : " (laag)"}`, nl(k.phiD, 2), nl(k.deltaD, 2), k.undrained ? `c_u ${nl(k.cuD, 1)}` : nl(k.cD, 2), nl(k.coef.k0, 3), k.undrained ? "-" : nl(k.coef.ka, 3), k.undrained ? "-" : nl(k.coef.kp, 3), k.undrained ? "ongedraineerd" : k.coef.passive === "curved" ? "gekromd" : "recht", nl(k.khD, 0)]), { size: 7.5 });

  sectionTitle(c, "Spanningen op de kenmerkende niveaus (rekenwaarden)");
  table(c, [{ label: "NAP [m]", width: 11, align: "right" }, { label: "Net onder", width: 30 }, { label: "σ'_v hoog", width: 12, align: "right" }, { label: "u hoog", width: 10, align: "right" }, { label: "σ'_a hoog", width: 12, align: "right" }, { label: "σ'_0 hoog", width: 12, align: "right" },
    { label: "σ'_v laag", width: 12, align: "right" }, { label: "u laag", width: 10, align: "right" }, { label: "σ'_0 laag", width: 12, align: "right" }, { label: "σ'_p laag", width: 12, align: "right" }],
  r.levels.map((l) => [nap(l.nap), l.label, nl(l.high.sigmaVEff, 1), nl(l.high.u, 1), l.high.soil ? nl(l.high.soil.pa, 1) : "-", l.high.soil ? nl(l.high.soil.p0, 1) : "-", nl(l.low.sigmaVEff, 1), nl(l.low.u, 1), l.low.soil ? nl(l.low.soil.p0, 1) : "-", l.low.soil ? nl(l.low.soil.pp, 1) : "-"]), { size: 7 });
  paragraph(c, "Alle spanningen in kPa.", { italic: true, size: 7.5 });

  sectionTitle(c, "Verenmodel", "CUR 166");
  paragraph(c, "De wand is een elastisch ondersteunde ligger (EI per m wand, in het model in elementen verdeeld). Aan beide zijden werkt per laag een grondveer (één tak met k_h, of drie takken), die bij de neutrale gronddruk begint en begrensd is door de actieve en de passieve gronddruk: σ' = σ'_0 − k_h·y aan de hoge zijde en σ'_0 + k_h·y aan de lage zijde (y positief naar de lage zijde), met σ'_a ≤ σ' ≤ σ'_p. Het waterdrukverschil is belasting; het anker is een lineaire veer. De toestand van elke veer wordt iteratief bepaald tot er evenwicht is.", { size: 7.5 });
  sectionFigure(c, i, r, u);
  paragraph(c, "Figuur: doorsnede op schaal met rekenwaarden. Tegen de wand de druk op de wand: bruin de korreldruk, blauw de waterdruk erbovenop. Rechts de verplaatsing (positief naar de lage zijde), het moment en de dwarskracht; de streeplijn is het ontgravingsniveau, de stip de grootste waarde.", { italic: true, size: 7.5 });
  const pair = (label: string, unit: string, x: number, y: number, d = 1) => [label, `${nl(x, d)} ${unit}`, `${nl(y, d)} ${unit}`];
  table(c, [{ label: "Uitkomst", width: 60 }, { label: "Rekenwaarden", width: 30, align: "right" }, { label: "Representatief", width: 30, align: "right" }], [
    pair("Grootste moment", "kNm/m", Math.abs(u.maxMoment.value), Math.abs(s.maxMoment.value)), pair("Grootste dwarskracht", "kN/m", Math.abs(u.maxShear.value), Math.abs(s.maxShear.value)),
    ...(u.anchor && s.anchor ? [pair("Ankerkracht, horizontaal per m wand", "kN/m", u.anchor.horizontalKn, s.anchor.horizontalKn), pair("Ankerkracht, axiaal per m wand", "kN/m", u.anchor.axialKn, s.anchor.axialKn), pair("Ankerkracht per anker", "kN", u.anchor.perAnchorKn, s.anchor.perAnchorKn)] : []),
    pair("Verplaatsing aan de kop", "mm", u.headDisplacementM * 1000, s.headDisplacementM * 1000), pair("Grootste verplaatsing", "mm", u.maxDisplacement.value * 1000, s.maxDisplacement.value * 1000),
    pair("Aangesproken passieve weerstand", "kN/m", u.passive.mobilisedKn, s.passive.mobilisedKn), pair("Grootste passieve weerstand", "kN/m", u.passive.maxKn, s.passive.maxKn),
  ], { size: 7.5 });
  paragraph(c, `Grootste moment op NAP ${nap(u.maxMoment.nap)} m, grootste dwarskracht op NAP ${nap(u.maxShear.nap)} m (rekenwaarden). Verplaatsingen beoordeelt u met de representatieve waarden.`, { size: 7.5 });
  if (r.cases.length > 2) {
    sectionTitle(c, "Overzicht per fase en stap");
    const ids = [...new Set(r.cases.flatMap((k) => k.run.supports.map((x) => x.id)))];
    const label = (k: (typeof r.cases)[number]) => `${k.stepId === "uls" ? "rekenwaarden" : k.stepId === "sls" ? "representatief" : `stap ${k.stepId}`}${r.phases.length > 1 ? `, fase ${k.phaseName}` : ""}`;
    const rows: string[][] = [];
    for (const k of r.cases) {
      const run = k.run, anchor = (f2: number) => ids.map((id) => { const x = run.supports.find((y) => y.id === id); return x ? nl(x.axialKn * f2, 1) : "-"; });
      rows.push([label(k), nl(Math.abs(run.maxMoment.value), 1), nl(Math.abs(run.maxShear.value), 1), k.serviceability ? nl(Math.abs(run.maxDisplacement.value) * 1000, 1) : "-", ...anchor(1), nl(100 * run.passive.ratio, 0)]);
      if (k.serviceability && k.design && k.resultFactor !== 1) rows.push([`${label(k)} × ${nl(k.resultFactor, 2)}`, nl(Math.abs(run.maxMoment.value) * k.resultFactor, 1), nl(Math.abs(run.maxShear.value) * k.resultFactor, 1), "-", ...anchor(k.resultFactor), "-"]);
    }
    table(c, [{ label: "Berekening", width: 42 }, { label: "M [kNm/m]", width: 16, align: "right" }, { label: "V [kN/m]", width: 16, align: "right" }, { label: "u [mm]", width: 14, align: "right" }, ...ids.map((id) => ({ label: `${id} [kN/m]`, width: 16, align: "right" as const })), { label: "passief [%]", width: 16, align: "right" }], rows, { size: 7 });
    paragraph(c, `Omhullende voor de toetsen: moment ${nl(Math.abs(u.maxMoment.value), 1)} kNm/m, dwarskracht ${nl(Math.abs(u.maxShear.value), 1)} kN/m${u.supports.map((x) => `, ${x.id} ${nl(x.axialKn, 1)} kN/m`).join("")}; grootste verplaatsing ${nl(Math.abs(s.maxDisplacement.value) * 1000, 1)} mm (representatief). Ankerkrachten axiaal per m wand.`, { size: 7.5 });
  }

  sectionTitle(c, "Verloop over de hoogte (rekenwaarden)");
  const picks = u.rows.filter((_, k) => k % Math.max(1, Math.round(u.rows.length / 28)) === 0 || k === u.rows.length - 1);
  const at = (value: (p: RunSample) => number, level: number) => { const p = u.samples.reduce((best, q) => (Math.abs(q.nap - level) < Math.abs(best.nap - level) ? q : best), u.samples[0]); return value(p); };
  table(c, [{ label: "NAP [m]", width: 12, align: "right" }, { label: "σ' hoog [kPa]", width: 14, align: "right" }, { label: "u hoog [kPa]", width: 13, align: "right" }, { label: "σ' laag [kPa]", width: 14, align: "right" }, { label: "u laag [kPa]", width: 13, align: "right" },
    { label: "passief benut [%]", width: 14, align: "right" }, { label: "y [mm]", width: 12, align: "right" }, { label: "M [kNm/m]", width: 14, align: "right" }, { label: "V [kN/m]", width: 14, align: "right" }],
  picks.map((row) => { const mid = (row.topNap + row.bottomNap) / 2; return [nap(mid), row.high ? nl(row.high.pressureKpa, 1) : "-", nl(row.uHighKpa, 1), row.low ? nl(row.low.pressureKpa, 1) : "-", nl(row.uLowKpa, 1), row.mobilisation === null ? "-" : nl(100 * row.mobilisation, 0), nl(row.yM * 1000, 1), nl(at((p) => p.momentKnM, mid), 1), nl(at((p) => p.shearKn, mid), 1)]; }), { size: 7 });

  if (r.grout && a.grout) {
    const g = r.grout, ga = a.grout;
    sectionTitle(c, "Groutanker", "NEN 9997-1 hoofdstuk 8; CUR 166");
    paragraph(c, "In de wand is het anker een veer met de stijfheid van de vrije lengte, met de voorspankracht als beginkracht. De ankerkracht per anker is de horizontale kracht per m wand maal de hart-op-hartafstand, gedeeld door cos α; de verticale component staat als normaalkracht op de wand.", { size: 7.5 });
    formula(c, "k", "E · A / L_vrij", `${nl(ga.eMPa, 0)} N/mm² · ${nl(ga.areaMm2, 0)} mm² / ${nl(ga.freeLengthM)} m`, `${nl(g.stiffnessKnPerM, 0)} kN/m per anker`);
    formula(c, "k_h", "k · cos² α / a", `${nl(g.stiffnessKnPerM, 0)} · cos² ${nl(a.angleDeg, 1)}° / ${nl(a.spacingM)}`, `${nl(g.horizontalStiffness, 0)} kN/m per m wand`);
    if (u.anchor) formula(c, "F_A", "F_h · a / cos α", `${nl(u.anchor.horizontalKn, 1)} · ${nl(a.spacingM)} / cos ${nl(a.angleDeg, 1)}°`, `${nl(g.forceKn, 1)} kN per anker (rekenwaarden)`);
    if (u.anchor) formula(c, "N", "F_h · tan α", `${nl(u.anchor.horizontalKn, 1)} · tan ${nl(a.angleDeg, 1)}°`, `${nl(u.anchor.verticalKn, 1)} kN/m in de wand`);
    formula(c, "ΔL", "F_A / k", `${nl(g.forceKn, 1)} / ${nl(g.stiffnessKnPerM, 0)}`, `${nl(g.elongationMm, 1)} mm`);
    kv(c, "Groutlichaam", `begint ${nl(g.start.xM)} m achter de wand op NAP ${nap(g.start.nap)} m en eindigt ${nl(g.end.xM)} m achter de wand op NAP ${nap(g.end.nap)} m`);
    kv(c, "Lagen", g.layers.map((l) => `${l.name}: ${nl(l.lengthM)} m`).join("; "));
    kv(c, "Actief glijvlak", `vanaf de teen onder ${nl(g.slipAngleDeg, 1)}° met de horizontaal (45° + φ'_gem;d / 2, met φ'_gem;d = ${nl(g.phiAvgDeg)}°, gewogen naar laagdikte over de hoogte van de wand); vrije lengte minstens ${nl(g.requiredFreeM)} m`);
    paragraph(c, "De schachtwrijving, de extra factor op de ankerkracht en de factoren op staal en houdkracht zijn invoer; de voorstellen in het rekenblad zijn niet tegen de normtekst gelegd. De stabiliteit van het diepe glijvlak (Kranz), de beproeving en de kruip van het anker zitten niet in deze berekening.", { italic: true, size: 7.5 });
  }
  sectionTitle(c, "Controle met de methode van Blum (rekenwaarden)", "Blum (1931)");
  paragraph(c, "Blum rekent met volledig actieve gronddruk aan de hoge zijde en volledig passieve aan de lage zijde, en zoekt het evenwicht. Bij een ingeklemde voet ligt het theoretische voetpunt waar het moment nul is en komt er 20 % bij de lengte onder het belastingnulpunt: t = u + 1,2·x. Bij een vrij opgelegde voet volgt de inheidiepte uit het momentenevenwicht om het anker.", { size: 7.5 });
  const cases: Array<[string, BlumCase | null]> = r.blum.kind === "cantilever" ? [["Blum, onverankerd (ingeklemd)", r.blum.cantilever]] : [["Blum, vrij opgelegde voet", r.blum.free], ["Blum, ingeklemde voet", r.blum.fixed]];
  table(c, [{ label: "Methode", width: 44 }, { label: "M;max [kNm/m]", width: 18, align: "right" }, { label: "Anker horizontaal [kN/m]", width: 22, align: "right" }, { label: "Belastingnulpunt [m NAP]", width: 20, align: "right" }, { label: "Voetpunt [m NAP]", width: 18, align: "right" }, { label: "Benodigde teen [m NAP]", width: 20, align: "right" }], [
    ["Verenmodel", nl(Math.abs(u.maxMoment.value), 1), u.anchor ? nl(u.anchor.horizontalKn, 1) : "-", "-", "-", `${nap(i.toeNap)} (aanwezig)`],
    ...cases.map(([label, k]) => (k ? [label, nl(k.maxMomentKnM, 1), k.anchorKn ? nl(k.anchorKn, 1) : "-", nap(i.wallTopNap - k.zeroLoadM), nap(i.wallTopNap - k.theoreticalToeM), nap(i.wallTopNap - k.requiredToeM)] : [label, "geen evenwicht binnen het rekenbereik", "", "", "", ""])),
  ], { size: 7.5 });

  sectionTitle(c, "Overzicht van de toetsen");
  table(c, [{ label: "Toets", width: 60 }, { label: "Optredend", width: 22, align: "right" }, { label: "Weerstand", width: 22, align: "right" }, { label: "u.c.", width: 10, align: "right" }, { label: "Oordeel", width: 16 }],
    r.checks.map((k) => [k.title, `${nl(k.load, k.unit === "m" ? 2 : 1)} ${k.unit}`, `${nl(k.resistance, k.unit === "m" ? 2 : 1)} ${k.unit}`, nl(k.uc, 2), k.passes ? "voldoet" : "voldoet niet"]), { size: 7.5 });
  paragraph(c, `Maatgevend: ${r.governing.title.toLowerCase()}, u.c. ${nl(r.governing.uc, 2)}.`);
  for (const w of r.warnings) paragraph(c, `Let op: ${w}`, { italic: true, size: 7.5 });
  for (const k of r.checks) {
    sectionTitle(c, k.title, k.article);
    for (const step of k.steps) formula(c, step.symbol || " ", step.formula || " ", step.filled ?? null, step.result);
  }
  if (posts) paragraph(c, "Palen met schotten zijn per m wand gerekend: de buigstijfheid van de paal gedeeld door de hart-op-hartafstand; moment en dwarskracht per paal zijn de uitkomst per m wand maal de hart-op-hartafstand. De drukken onder de schotten in de tabellen en de figuur zijn omgerekend naar de paalbreedte.", { size: 7.5 });
  paragraph(c, "Niet in deze berekening: de stabiliteit van het diepe glijvlak (Kranz), algehele stabiliteit (Bishop), een glijvlakberekening (Culmann) met het werkelijke maaiveld en gelaagde grond, een ontlasttak van de veer, uitval van een anker, rekenwaarden alleen in de getoetste fase, een berekening van de grondwaterstroming, de sterkte en stijfheid van het ankerschot, de ankerpaal of de ankerplaat zelf, plooi van koudgevormde profielen en kruip van hout en kunststof.", { italic: true, size: 7.5 });

  if (typeof doc.putTotalPages === "function") doc.putTotalPages(TOTAL_PAGES_TOKEN);
  return new Uint8Array(doc.output("arraybuffer"));
}
