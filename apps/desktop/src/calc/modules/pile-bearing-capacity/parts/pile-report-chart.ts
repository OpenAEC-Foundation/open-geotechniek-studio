// apps/desktop/src/calc/modules/pile-bearing-capacity/parts/pile-report-chart.ts
//
// Per-sondering visual-blad voor het paaldraagvermogen-rapport, in de
// stijl van blad 2 van het externe referentierapport (984.pdf):
//
//   - qc-grafiek (0–30 MPa) met de meetcurve in donkergrijs
//   - Rf-paneel rechts (10% → 0%, geïnverteerd)
//   - grondlagen-kolom met kleur per grondsoort
//   - paal-balk links met NEd/Nk-pijl (belasting, omlaag) en Rb-pijl (weerstand, omhoog)
//   - kleef-balk in de grafiek (neg. kleef / pos. wrijving)
//   - NAP-niveaulijnen (ontgraving, paalkop, water, kleef-grens, paalpunt)
//   - 4D/8D-zones + afgeknotte qc-curve (running-min) + qc;I/II/III-legend
//
// Alle tekenwerk is jsPDF-vector (geen rasterafbeeldingen) zodat de
// PDF klein blijft en scherp print. Kleuren uit report/reportPalette:
// belasting in de foutkleur, weerstand in de succeskleur, de afgeknotte
// curve en de qc-zones in de accentkleur van de huisstijl; alleen de
// grondsoorten en het paalmateriaal houden hun eigen vaste kleur.

import type { jsPDF } from "jspdf";
import type { Cpt } from "../../../../types/cpt";
import type { AppliedOverride, PileInput, PileResult, SoilKind } from "../types";
import { getPileType } from "../catalog";
import { MATERIAL_COLORS, materialColor } from "./material-colors";
import { reportPalette } from "../../../../report/reportPalette";
import { drawSheetTitle } from "../../../../report/reportTitle";

const SOIL_FILL: Record<SoilKind, [number, number, number]> = {
  "sand-dry": [247, 228, 99],
  "sand-wet": [247, 228, 99],
  clay: [143, 191, 111],
  peat: [169, 113, 75],
};
const SOIL_SHORT: Record<SoilKind, string> = {
  "sand-dry": "Z",
  "sand-wet": "Z",
  clay: "K",
  peat: "V",
};

export interface ChartPageArgs {
  doc: jsPDF;
  /** Y-positie [mm] waar de chart-zone begint (na de header). */
  startY: number;
  name: string;
  input: PileInput;
  result: PileResult;
  /** De sondering zoals gemeten. */
  cpt: Cpt;
  /** De sondering waarmee is gerekend, als de conusweerstand is aangepast. */
  adjustedCpt?: Cpt;
  /** Aanpassingen van de grondlaaginterpretatie; de toegepaste krijgen een markering. */
  adjustments?: AppliedOverride[];
}

function fmtNap(v: number): string {
  return `NAP ${v >= 0 ? "+" : ""}${v.toFixed(2).replace(".", ",")} m`;
}

/** Render het visual-blad. Gaat uit van een verse pagina met chrome. */
export function renderSonderingChart(args: ChartPageArgs): void {
  const { doc, startY, name, input, result, cpt, adjustedCpt, adjustments } = args;
  const D_m = result.base.deqMm / 1000;

  // ─── Kleuren ───────────────────────────────────────────────────
  const pal = reportPalette();
  const COL_QC = pal.secondary;      // meetcurve
  const COL_GRID = pal.rule;
  const COL_NEG = pal.error;         // belasting en neg. kleef
  const COL_POS = pal.success;       // weerstand en pos. wrijving
  const COL_CLIP = pal.accentStrong; // afgeknotte qc

  // ─── Layout [mm] ───────────────────────────────────────────────
  const pileX = 22;        // hart van de losse paal-balk links
  const plotL = 40;        // qc-plot links
  const plotR = 130;       // qc-plot rechts (0–30 MPa)
  const soilL = 133;       // grondkolom
  const soilR = 143;
  const rfL = 150;         // Rf-paneel
  const rfR = 190;
  const plotT = startY + 14;
  const plotB = 268;       // onderkant chart-zone

  const qcMax = 30;        // MPa volledig bereik
  const rfMax = 10;        // %

  // Verticaal bereik [m NAP]
  const groundNap = cpt.metadata.ground_level_nap ?? 0;
  const deepestNap = Math.min(
    ...cpt.points.map((p) => p.depth_nap ?? groundNap - p.depth),
  );
  const topNap = Math.ceil(Math.max(groundNap, input.pileTopNap, input.excavationNap) + 0.6);
  const bottomNap = Math.floor(Math.max(deepestNap, input.pileToeNap - 8 * D_m - 3));
  const yOf = (nap: number): number =>
    plotT + ((topNap - nap) / (topNap - bottomNap)) * (plotB - plotT);
  const xOfQc = (qc: number): number =>
    plotL + (Math.min(qc, qcMax) / qcMax) * (plotR - plotL);
  const xOfRf = (rf: number): number =>
    rfR - (Math.min(rf, rfMax) / rfMax) * (rfR - rfL);

  // ─── Titel ─────────────────────────────────────────────────────
  drawSheetTitle(doc, `Sondering: ${name}`, 14, startY + 6, 182);

  // ─── Grid + assen ──────────────────────────────────────────────
  doc.setLineWidth(0.15);
  doc.setDrawColor(...COL_GRID);
  // Horizontale gridlijnen elke 5 m + NAP-labels
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(60);
  for (let nap = Math.floor(topNap / 5) * 5; nap >= bottomNap; nap -= 5) {
    if (nap > topNap) continue;
    const y = yOf(nap);
    doc.line(plotL, y, plotR, y);
    doc.line(rfL, y, rfR, y);
    doc.text(`${nap.toFixed(2).replace(".", ",")}`, plotL - 2, y + 1, { align: "right" });
  }
  // Verticale gridlijnen qc elke 10 MPa + toplabels
  for (let q = 0; q <= qcMax; q += 10) {
    const x = xOfQc(q);
    doc.line(x, plotT, x, plotB);
    doc.text(`${q} MPa`, x, plotT - 1.5, { align: q === 0 ? "left" : "center" });
  }
  // Rf-paneel rand + labels (10% links, 0% rechts)
  for (let r = 0; r <= rfMax; r += 5) {
    const x = xOfRf(r);
    doc.line(x, plotT, x, plotB);
  }
  doc.text("10 %", xOfRf(10), plotT - 1.5, { align: "center" });
  doc.text("0 %", xOfRf(0), plotT - 1.5, { align: "center" });
  // Plot-kaders
  doc.setDrawColor(120);
  doc.setLineWidth(0.25);
  doc.rect(plotL, plotT, plotR - plotL, plotB - plotT);
  doc.rect(rfL, plotT, rfR - rfL, plotB - plotT);

  // ─── 4D/8D zones (vóór de curve zodat de curve eroverheen tekent) ──
  const toe = input.pileToeNap;
  const critBelow = result.base.criticalDepthM; // m onder paalpunt (0,7D..4D)
  // qc;I/II-zone: paalpunt → kritische diepte eronder (lichte accenttint,
  // matcht de qc;II-legend; qc;I doorloopt dezelfde zone omlaag)
  doc.setFillColor(...pal.accentTint);
  doc.rect(plotL, yOf(toe), plotR - plotL, yOf(toe - critBelow) - yOf(toe), "F");
  // qc;III-zone: paalpunt → 8D erboven (lichtgrijze vulling, matcht qc;III-legend)
  doc.setFillColor(...pal.neutralTint);
  doc.rect(plotL, yOf(toe + 8 * D_m), plotR - plotL, yOf(toe) - yOf(toe + 8 * D_m), "F");
  // 4D-grens (accent, gestreept) + 8D-grens (grijs, gestreept)
  doc.setLineDashPattern([2, 1], 0);
  doc.setDrawColor(...pal.accentStrong);
  doc.setLineWidth(0.25);
  doc.line(plotL, yOf(toe - 4 * D_m), plotR, yOf(toe - 4 * D_m));
  doc.setDrawColor(...pal.ruleStrong);
  doc.line(plotL, yOf(toe + 8 * D_m), plotR, yOf(toe + 8 * D_m));
  doc.setLineDashPattern([], 0);
  // Brackets "8D" (boven paalpunt) en "4D" (onder paalpunt), links van plot
  doc.setFontSize(7);
  doc.setTextColor(0);
  const brX = plotL - 9;
  doc.setDrawColor(0);
  doc.setLineWidth(0.2);
  doc.line(brX, yOf(toe), brX, yOf(toe + 8 * D_m));
  doc.line(brX - 1, yOf(toe), brX + 1, yOf(toe));
  doc.line(brX - 1, yOf(toe + 8 * D_m), brX + 1, yOf(toe + 8 * D_m));
  doc.text("8D", brX - 1.5, (yOf(toe) + yOf(toe + 8 * D_m)) / 2 + 1, { align: "right" });
  doc.line(brX, yOf(toe), brX, yOf(toe - 4 * D_m));
  doc.line(brX - 1, yOf(toe - 4 * D_m), brX + 1, yOf(toe - 4 * D_m));
  doc.text("4D", brX - 1.5, (yOf(toe) + yOf(toe - 4 * D_m)) / 2 + 2.5, { align: "right" });

  // ─── qc-meetcurve ──────────────────────────────────────────────
  doc.saveGraphicsState();
  doc.rect(plotL,plotT,plotR-plotL,plotB-plotT,null);
  doc.clip(); doc.discardPath();
  doc.setDrawColor(...COL_QC);
  doc.setLineWidth(0.3);
  let prev: { x: number; y: number } | null = null;
  for (const p of cpt.points) {
    const nap = p.depth_nap ?? groundNap - p.depth;
    if (nap > topNap || nap < bottomNap) { prev = null; continue; }
    const pt = { x: xOfQc(p.qc ?? 0), y: yOf(nap) };
    if (prev) doc.line(prev.x, prev.y, pt.x, pt.y);
    prev = pt;
  }

  // ─── Aangepaste trajecten: de meting hierboven blijft dun staan, de
  //     lijn waarmee is gerekend komt er dikker overheen. ──────────
  const marks = (adjustments ?? []).map((a, i) => ({ a, nr: `A${i + 1}` })).filter((m) => m.a.status === "applied");
  for (const { a } of marks) {
    const yT = yOf(Math.min(a.topNap, topNap)), yB = yOf(Math.max(a.bottomNap, bottomNap));
    if (yB <= yT) continue;
    doc.setFillColor(...pal.errorTint);
    doc.rect(plotL, yT, plotR - plotL, yB - yT, "F");
    if (!a.qc || !adjustedCpt) continue;
    doc.setDrawColor(...COL_NEG);
    doc.setLineWidth(0.5);
    let pa: { x: number; y: number } | null = null;
    for (const p of adjustedCpt.points) {
      const nap = groundNap - p.depth;
      if (nap > a.topNap + 1e-6 || nap < a.bottomNap - 1e-6 || nap > topNap || nap < bottomNap) { pa = null; continue; }
      const pt = { x: xOfQc(p.qc ?? 0), y: yOf(nap) };
      if (pa) doc.line(pa.x, pa.y, pt.x, pt.y);
      pa = pt;
    }
  }
  // De meting opnieuw over de band, zodat hij binnen het traject zichtbaar blijft.
  if (marks.length) {
    doc.setDrawColor(...COL_QC);
    doc.setLineWidth(0.2);
    for (const { a } of marks) {
      let pm: { x: number; y: number } | null = null;
      for (const p of cpt.points) {
        const nap = groundNap - p.depth;
        if (nap > a.topNap || nap < a.bottomNap || nap > topNap || nap < bottomNap) { pm = null; continue; }
        const pt = { x: xOfQc(p.qc ?? 0), y: yOf(nap) };
        if (pm) doc.line(pm.x, pm.y, pt.x, pt.y);
        pm = pt;
      }
    }
  }

  // ─── Afgeknotte qc-curve (running-min, donker accent) ──────────
  if (result.base.clippedQcCurve && result.base.clippedQcCurve.length > 1) {
    doc.setDrawColor(...COL_CLIP);
    doc.setLineWidth(0.4);
    let pc: { x: number; y: number } | null = null;
    for (const p of result.base.clippedQcCurve) {
      const nap = groundNap - p.depth;
      if (nap > topNap || nap < bottomNap) { pc = null; continue; }
      const pt = { x: xOfQc(p.qcClipped), y: yOf(nap) };
      if (pc) doc.line(pc.x, pc.y, pt.x, pt.y);
      pc = pt;
    }
  }

  // ─── Rf-curve ──────────────────────────────────────────────────
  doc.restoreGraphicsState();
  doc.saveGraphicsState();
  doc.rect(rfL,plotT,rfR-rfL,plotB-plotT,null);
  doc.clip(); doc.discardPath();
  doc.setDrawColor(...COL_QC);
  doc.setLineWidth(0.3);
  let prevRf: { x: number; y: number } | null = null;
  for (const p of cpt.points) {
    const nap = p.depth_nap ?? groundNap - p.depth;
    if (nap > topNap || nap < bottomNap) { prevRf = null; continue; }
    const rf = p.rf ?? (p.fs !== undefined && p.qc ? (p.fs / p.qc) * 100 : undefined);
    if (rf === undefined) { prevRf = null; continue; }
    const pt = { x: xOfRf(rf), y: yOf(nap) };
    if (prevRf) doc.line(prevRf.x, prevRf.y, pt.x, pt.y);
    prevRf = pt;
  }

  doc.restoreGraphicsState();

  // ─── Grondlagen-kolom ──────────────────────────────────────────
  doc.setLineWidth(0.15);
  for (const l of input.soilProfile) {
    const yT = yOf(Math.min(l.startNap, topNap));
    const yB = yOf(Math.max(l.endNap, bottomNap));
    if (yB <= yT) continue;
    doc.setFillColor(...SOIL_FILL[l.kind]);
    doc.setDrawColor(110);
    doc.rect(soilL, yT, soilR - soilL, yB - yT, "FD");
    if (yB - yT > 4) {
      doc.setFontSize(6.5);
      doc.setTextColor(40);
      doc.text(SOIL_SHORT[l.kind], (soilL + soilR) / 2, (yT + yB) / 2 + 1, { align: "center" });
    }
  }

  // Nummer van elk aangepast traject, rechts in de grafiek.
  doc.setFontSize(6.5);
  doc.setTextColor(...COL_NEG);
  for (const { a, nr } of marks) {
    const yT = yOf(Math.min(a.topNap, topNap)), yB = yOf(Math.max(a.bottomNap, bottomNap));
    if (yB > yT) doc.text(nr, plotR - 1, Math.min(yB - 0.6, yT + 2.6), { align: "right" });
  }
  doc.setTextColor(0);

  // ─── NAP-niveaulijnen + labels ─────────────────────────────────
  interface Level { nap: number; label: string; color: [number, number, number]; dash?: boolean }
  const levels: Level[] = [
    { nap: input.excavationNap, label: fmtNap(input.excavationNap), color: pal.secondary },
    { nap: input.pileTopNap, label: fmtNap(input.pileTopNap), color: [0, 0, 0] },
    { nap: input.waterNap, label: fmtNap(input.waterNap), color: pal.info, dash: true },
    { nap: input.negKleefBottomNap, label: fmtNap(input.negKleefBottomNap), color: [0, 0, 0] },
    { nap: input.pileToeNap, label: fmtNap(input.pileToeNap), color: [0, 0, 0] },
  ];
  doc.setFontSize(7);
  // Stagger labels om overlap te voorkomen (sorteer op nap, alterneer x).
  const sorted = [...levels].sort((a, b) => b.nap - a.nap);
  sorted.forEach((lv, i) => {
    const y = yOf(lv.nap);
    doc.setDrawColor(...lv.color);
    doc.setLineWidth(0.25);
    if (lv.dash) doc.setLineDashPattern([2.2, 1.2], 0);
    doc.line(plotL, y, plotR, y);
    doc.setLineDashPattern([], 0);
    doc.setTextColor(...lv.color);
    const lx = plotL + 22 + (i % 3) * 26;
    doc.text(lv.label, lx, y - 0.8);
  });
  doc.setTextColor(0);

  // ─── Paal-balk links + belasting-pijlen ────────────────────────
  const pTopY = yOf(input.pileTopNap);
  const pToeY = yOf(input.pileToeNap);
  const pileRgb = materialColor(getPileType(input.pileTypeId)?.material).rgb;
  doc.setFillColor(...pileRgb);
  doc.setDrawColor(60);
  doc.setLineWidth(0.3);
  const ext = input.concreteExtension;
  // Bij een betonopzetter begint het hout pas bij de las.
  const woodTopY = ext ? yOf(ext.jointNap) : pTopY;
  if (ext) {
    // Opzetter in betonkleur, op dezelfde schaal als het hout eronder.
    const wExt = Math.min(2.6, 1.6 * ext.sizeMm / input.diameterMm);
    doc.setFillColor(...MATERIAL_COLORS.concrete.rgb);
    doc.rect(pileX - wExt, pTopY, 2 * wExt, woodTopY - pTopY, "FD");
    doc.setFillColor(...pileRgb);
  }
  if (input.timberTaper) {
    const wToe = 1.6 * input.timberTaper.toeDiameterMm / input.diameterMm;
    const transitionY = yOf((ext?.jointNap ?? input.pileTopNap) - input.timberTaper.lengthM);
    doc.lines([
      [1.6 - wToe, transitionY - woodTopY], [0, pToeY - transitionY],
      [2 * wToe, 0], [0, transitionY - pToeY], [1.6 - wToe, woodTopY - transitionY], [-3.2, 0],
    ], pileX - 1.6, woodTopY, [1, 1], "FD", true);
  } else if (ext) {
    doc.rect(pileX - 1.6, woodTopY, 3.2, pToeY - woodTopY, "FD");
  } else {
    doc.rect(pileX - 1.6, pTopY, 3.2, pToeY - pTopY, "FD");
  }
  // NEd/Nk-pijl boven de paal (belasting, omlaag)
  doc.setDrawColor(...COL_NEG);
  doc.setFillColor(...COL_NEG);
  doc.setLineWidth(0.6);
  doc.line(pileX, pTopY - 9, pileX, pTopY - 2.5);
  doc.triangle(pileX - 1.3, pTopY - 3, pileX + 1.3, pTopY - 3, pileX, pTopY - 0.5, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(0);
  doc.text(`NEd=${input.nEd} kN`, pileX - 4, pTopY - 12.5);
  doc.text(`Nk=${input.nEk} kN`, pileX - 4, pTopY - 9.5);
  // Rb-pijl onder paalpunt (weerstand, omhoog)
  doc.setDrawColor(...COL_POS);
  doc.setFillColor(...COL_POS);
  doc.line(pileX, pToeY + 9, pileX, pToeY + 2.5);
  doc.triangle(pileX - 1.3, pToeY + 3, pileX + 1.3, pToeY + 3, pileX, pToeY + 0.5, "F");
  doc.setTextColor(0);
  doc.text(`${result.base.rbCalMax.toFixed(0)} kN`, pileX - 4, pToeY + 13);

  // ─── Kleef-balk in de grafiek (neg. kleef en pos. wrijving) ────
  const kleefX = plotR + 1.2;
  const kleefY = yOf(input.negKleefBottomNap);
  doc.setFillColor(...COL_NEG);
  doc.rect(kleefX, pTopY, 1.8, kleefY - pTopY, "F");
  doc.setFillColor(...COL_POS);
  doc.rect(kleefX, kleefY, 1.8, pToeY - kleefY, "F");
  // Labels + pijlen: Fnk (omlaag, halverwege neg-zone) en Rs (omhoog)
  const negMidY = (pTopY + kleefY) / 2;
  doc.setDrawColor(...COL_NEG);
  doc.setFillColor(...COL_NEG);
  doc.setLineWidth(0.6);
  doc.line(plotR - 8, negMidY - 5, plotR - 8, negMidY + 1);
  doc.triangle(plotR - 9.2, negMidY + 0.6, plotR - 6.8, negMidY + 0.6, plotR - 8, negMidY + 2.6, "F");
  doc.setTextColor(0);
  doc.text(`${result.negKleef.fnkD.toFixed(0)} kN`, plotR - 11, negMidY - 6.5, { align: "right" });
  const posMidY = (kleefY + pToeY) / 2;
  doc.setDrawColor(...COL_POS);
  doc.setFillColor(...COL_POS);
  doc.line(plotR - 8, posMidY + 5, plotR - 8, posMidY - 1);
  doc.triangle(plotR - 9.2, posMidY - 0.6, plotR - 6.8, posMidY - 0.6, plotR - 8, posMidY - 2.6, "F");
  doc.text(`${result.shaft.rsCalMax.toFixed(0)} kN`, plotR - 11, posMidY + 8, { align: "right" });

  // ─── qc;I/II/III legend (zoals referentie, midden-links) ───────
  const legX = plotL + 14;
  const legY = yOf((topNap + input.negKleefBottomNap) / 2) - 6;
  const legend: Array<{ sw: [number, number, number]; txt: string }> = [
    { sw: pal.neutralTint, txt: `qc;III;gem = ${result.base.qcIIIGemMpa.toFixed(2).replace(".", ",")} MPa` },
    { sw: pal.accentTint, txt: `qc;II;gem = ${result.base.qcIIGemMpa.toFixed(2).replace(".", ",")} MPa` },
    { sw: pal.accentTintStrong, txt: `qc;I;gem = ${result.base.qcIGemMpa.toFixed(2).replace(".", ",")} MPa` },
  ];
  doc.setFontSize(7.5);
  legend.forEach((l, i) => {
    const y = legY + i * 5;
    doc.setFillColor(...l.sw);
    doc.setDrawColor(120);
    doc.setLineWidth(0.15);
    doc.rect(legX, y - 2.6, 6, 3.4, "FD");
    doc.setTextColor(0);
    doc.text(l.txt, legX + 7.5, y);
  });
}
