// PDF-rapport horizontale paal, met dezelfde kop, voet en opmaak als het
// paaldraagvermogenrapport en dezelfde onderdelen als de uitdraai op het scherm.
import { jsPDF } from 'jspdf';
import type { ProjectContext } from '../../framework/types';
import type { LateralInput, LateralResult } from './compute';
import { CURVES, extremes, niceTicks, valueAt } from './ForceDiagrams';
import { lateralSummary, sectionText } from './LateralSheet';
import { lateralReportData, type LayerRow } from './report-data';
import { computeLateral } from './compute';
import { computePileTable } from './pile-table';
import {
  CONTENT_W, M, TOTAL_PAGES_TOKEN, formula, kv, makeCursor, nl, paragraph, sectionTitle, table, winAnsi, type Cursor,
} from '../pile-bearing-capacity/parts/pile-report-pdf';

type Ok = Extract<LateralResult, { ok: true }>;
type Sample = Ok['beam']['samples'][number];
const TONES: Record<string, [number, number, number]> = { disp: [21, 128, 61], moment: [220, 38, 38], shear: [37, 99, 235], soil: [180, 83, 9] };

const reportDate = (iso: string | undefined) => (iso || new Date().toISOString().slice(0, 10)).slice(0, 10).split('-').reverse().join('-');

export function buildLateralReport(input: LateralInput, result: LateralResult, ctx: ProjectContext): Uint8Array {
  if (!result.ok) throw new Error(result.error);
  const meta = ctx.projectMeta;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const c = makeCursor(doc, {
    number: meta.project_number || '-', description: meta.title || 'Horizontaal belaste paal',
    norm: 'CUR166 initiele bedding; projectveerwet', date: reportDate(meta.date),
    author: meta.author || 'Open Geotechniek Studio', onderdeel: 'Horizontale paalbelasting',
  });
  const table = input.pileTable;
  if (!table) renderCalc(c, input, result);
  else {
    // Paaltabel: de aangevinkte palen volledig uitgewerkt, daarna het overzicht.
    const rows = computePileTable(input), picks = rows.filter((x) => table.examples?.includes(x.row.id));
    if (!picks.length) renderCalc(c, input, result);
    picks.forEach((x, i) => {
      const rr = computeLateral(x.input);
      if (!rr.ok) throw new Error(`${x.row.name} is niet berekenbaar: ${rr.error}`);
      if (i > 0) c.newPage();
      renderCalc(c, x.input, rr, `Paal ${x.row.name}`);
    });
    renderTableAppendix(c, input, rows);
  }
  if (typeof doc.putTotalPages === 'function') doc.putTotalPages(TOTAL_PAGES_TOKEN);
  return new Uint8Array(doc.output('arraybuffer'));
}

/** Overzicht van alle palen uit de paaltabel. */
function renderTableAppendix(c: Cursor, input: LateralInput, rows: ReturnType<typeof computePileTable>) {
  c.newPage();
  sectionTitle(c, 'Overzicht palen', `${rows.length} palen; grens kopverplaatsing ${input.pileTable?.maxDisplacementMm ? `${nl(input.pileTable.maxDisplacementMm, 0)} mm` : 'niet opgegeven'}`);
  table(c, [
    { label: 'Paal', width: 20 }, { label: 'Aantal', width: 9, align: 'right' }, { label: 'H [kN]', width: 11, align: 'right' }, { label: 'M [kNm]', width: 11, align: 'right' },
    { label: 'N [kN]', width: 11, align: 'right' }, { label: 'L [m]', width: 10, align: 'right' }, { label: 'Maat [mm]', width: 12, align: 'right' },
    { label: 'y kop [mm]', width: 13, align: 'right' }, { label: 'M max [kNm]', width: 14, align: 'right' }, { label: 'op NAP', width: 12, align: 'right' },
    { label: 'V max [kN]', width: 13, align: 'right' }, { label: 'u.c.', width: 9, align: 'right' }, { label: 'Oordeel', width: 14 },
  ], rows.map(({ row, input: ri, summary: x }) => [row.name, String(row.count ?? 1), nl(row.headForceKn, 1), nl(row.headMomentKnM, 1), nl(row.nEdKn, 1),
    nl(ri.lengthM, 2), String(ri.section.diameterMm),
    ...(x.ok ? [nl(x.yHeadMm, 1), nl(x.mMaxKnM, 1), nl(x.mNap, 2), nl(x.vMaxKn, 1), x.uc === null ? '-' : nl(x.uc, 2), x.passes ? 'voldoet' : 'voldoet niet'] : ['-', '-', '-', '-', '-', 'niet berekend'])]), { size: 7 });
  paragraph(c, 'Alle palen met dezelfde grondopbouw, doorsnedetype en wapening als de basisinvoer; per paal een eigen kopbelasting en zo nodig een eigen lengte of maat. Voldoet: u.c. <= 1,00 en, als opgegeven, de kopverplaatsing binnen de grens.', { italic: true, size: 7.5 });
}

/** De volledige uitwerking van één paal. */
function renderCalc(c: Cursor, input: LateralInput, result: Extract<LateralResult, { ok: true }>, heading?: string) {
  const r = result, s = lateralSummary(input, r), d = lateralReportData(input, r);
  const nap = (z: number) => `NAP ${nl(s.head - z, 2)}`;
  const nonlinear = r.analysisMode === 'nonlinear';
  if (heading) { c.continuationTitle = heading; sectionTitle(c, heading); }

  sectionTitle(c, '1. Uitgangspunten');
  kv(c, 'Paal', sectionText(input.section));
  kv(c, 'Paalkop / paalpunt', `${nap(0)} m / ${nap(input.lengthM)} m (lengte ${nl(input.lengthM, 2)} m)`);
  kv(c, 'Belasting op de kop', `H = ${nl(input.headForceKn, 1)} kN, M = ${nl(input.headMomentKnM, 1)} kNm, N = ${nl(input.nEdKn, 1)} kN (druk +)`);
  kv(c, 'Randvoorwaarden', `${input.headFixedRotation ? 'kop ingeklemd' : 'kop vrij draaiend'}${input.toeFixed ? ', voet ingeklemd' : ', voet vrij'}`);
  kv(c, 'Grondmodel', `${nonlinear ? 'niet-lineair, p = pu tanh(k0 y / pu)' : 'lineair, p = k0 y'}${input.layerCorrection === 'georgiadis' ? '; laagcorrectie Georgiadis' : ''}; werkende breedte ${nl(input.springWidthM, 2)} m`);
  c.y += 2;

  sectionTitle(c, '2. Paaldoorsnede');
  const sec = r.section, gross = input.section.kind === 'concrete-square' ? (input.section.diameterMm / 1000) ** 2 : Math.PI * (input.section.diameterMm / 1000) ** 2 / 4;
  kv(c, 'Bruto oppervlak', `${nl(gross * 1e6, 0)} mm2`);
  if (sec.concreteAreaM2 > 0) kv(c, 'Beton (netto)', `${nl(sec.concreteAreaM2 * 1e6, 0)} mm2; Ec,eff = ${nl(input.section.concreteEMpa * input.section.concreteFactor / (1 + input.section.creepCoefficient), 0)} MPa`);
  if (sec.rebarAreaMm2 > 0) kv(c, 'Langswapening', `${nl(sec.rebarAreaMm2, 0)} mm2; rho = ${nl(100 * sec.rebarAreaMm2 / (gross * 1e6), 2)} %`);
  if (sec.steelAreaM2 > 0) kv(c, 'Buis', `${nl(sec.steelAreaM2 * 1e6, 0)} mm2; wand ${nl(input.section.wallMm, 1)} mm`);
  if (r.capacity) kv(c, 'MRd bij NEd', `${nl(r.capacity.mRdKnM, 1)} kNm (N tussen ${nl(r.capacity.nMinKn, 0)} en ${nl(r.capacity.nMaxKn, 0)} kN)`);
  formula(c, 'EI', 'Ec,eff Ic + Es Is + Ea Ia', `${nl(sec.concreteEI, 0)} + ${nl(sec.rebarEI, 0)} + ${nl(sec.tubeEI, 0)}`, `${nl(sec.eiKnM2, 0)} kNm2`);

  sectionTitle(c, '3. Grondopbouw', 'CUR166 deel 1, tabel 3.3 (eerste secanttraject); kleuren: zand geel, klei groen, veen bruin');
  drawSoilTable(c, d.layers, nonlinear);
  table(c, [{ label: 'Laag', width: 8 }, { label: 'Dikte [m]', width: 12, align: 'right' }, { label: 'phi [gr]', width: 10, align: 'right' }, { label: 'Ka [-]', width: 10, align: 'right' },
    { label: 'Lijnlast [kN/m]', width: 14, align: 'right' }, { label: 'zeq [m]', width: 18, align: 'right' }, ...(nonlinear ? [{ label: 'int pu dz [kN]', width: 16, align: 'right' as const }] : [])],
  d.layers.map((l) => [String(l.index), nl(l.thicknessM, 2), nl(l.frictionDeg, 0), nl(l.ka, 3), nl(l.lineLoadKnM, 1), `${nl(l.zeqTop, 2)} - ${nl(l.zeqBottom, 2)}`, ...(nonlinear ? [l.cumulativeKn === null ? '-' : nl(l.cumulativeKn, 0)] : [])]), { size: 7 });
  paragraph(c, `k0 = kh x werkende breedte ${nl(input.springWidthM, 2)} m.${nonlinear ? ' pu als functie van de equivalente diepte zeq.' : ''}`, { size: 7.5, italic: true });

  sectionTitle(c, '4. Resultaten');
  const row = (name: string, e: ReturnType<typeof extremes>, dg: number) => [name, nl(e.max.v, dg), nap(e.max.z), nl(e.min.v, dg), nap(e.min.z)];
  table(c, [{ label: 'Grootheid', width: 34 }, { label: 'Maximum', width: 18, align: 'right' }, { label: 'Niveau', width: 22 }, { label: 'Minimum', width: 18, align: 'right' }, { label: 'Niveau', width: 22 }], [
    row('Verplaatsing y [mm]', s.y, 2), row('Moment M [kNm]', s.M, 1), row('Dwarskracht V [kN]', s.V, 1), row('Grondreactie p [kN/m]', s.p, 1),
  ]);
  paragraph(c, `Kopverplaatsing ${nl(s.yHeadMm, 2)} mm.${s.mobilisation ? ` Hoogste mobilisatie p/pu ${nl(s.mobilisation.value * 100, 0)} % op NAP ${nl(s.mobilisation.nap, 2)}.` : ''}`);
  drawDiagrams(c, input, r.beam.samples, s.head);

  sectionTitle(c, '5. Grondreactie per laag');
  table(c, [{ label: 'Laag', width: 8 }, { label: 'Veren', width: 9, align: 'right' }, { label: 'y max [mm]', width: 14, align: 'right' }, { label: 'p max [kN/m]', width: 15, align: 'right' },
    { label: 'Kracht op paal [kN]', width: 18, align: 'right' }, ...(nonlinear ? [{ label: 'p/pu max', width: 12, align: 'right' as const }, { label: 'ksec/k0 min', width: 13, align: 'right' as const }] : [])],
  d.layers.map((l) => [String(l.index), String(l.springs), nl(l.yMaxMm, 2), nl(l.pMaxKnM, 1), nl(l.resultantKn, 1), ...(nonlinear ? [l.mobMax === null ? '-' : `${nl(l.mobMax * 100, 0)} %`, nl(l.secantRatioMin, 2)] : [])]),
  { summaryRow: ['Som + H', '', '', '', nl(d.soilForce + input.headForceKn, 3), ...(nonlinear ? ['', ''] : [])] });

  sectionTitle(c, '6. Verloop over de diepte', `stap ${nl(d.step, 2)} m`);
  table(c, [{ label: 'm NAP', width: 14, align: 'right' }, { label: 'y [mm]', width: 14, align: 'right' }, { label: 'theta [mrad]', width: 16, align: 'right' },
    { label: 'M [kNm]', width: 14, align: 'right' }, { label: 'V [kN]', width: 14, align: 'right' }, { label: 'p [kN/m]', width: 14, align: 'right' }],
  d.depth.map((x) => [nl(x.nap, 2), nl(x.yMm, 2), nl(x.rotMrad, 3), nl(x.mKnM, 1), nl(x.vKn, 1), nl(x.pKnM, 1)]), { size: 7 });

  sectionTitle(c, '7. Doorsnedetoets N-M');
  if (r.capacity && s.uc !== null) formula(c, 'u.c.', '|M|max / MRd(NEd)', `${nl(s.mEd, 1)} / ${nl(r.capacity.mRdKnM, 1)}`, nl(s.uc, 2));
  else paragraph(c, r.capacityError ?? 'Geen doorsnedetoets mogelijk.');
  if (d.nm.length > 1) drawNM(c, d.nm, input.nEdKn, s.mEd);

  sectionTitle(c, '8. Conclusie');
  paragraph(c, s.uc === null ? 'Geen doorsnedetoets mogelijk.' : s.uc <= 1
    ? `De doorsnede voldoet voor buiging met normaalkracht: u.c. ${nl(s.uc, 2)} <= 1,00. Kopverplaatsing ${nl(s.yHeadMm, 1)} mm.`
    : `De doorsnede voldoet niet: u.c. ${nl(s.uc, 2)} > 1,00.`);
  paragraph(c, 'Niet getoetst: dwarskracht, scheurwijdte, minimumwapening, verankering, lokale buisplooi, P-delta en een gescheurde EI. Statische, monotone belasting. Concept: indicatieve berekening.', { italic: true, size: 7.5 });

  c.continuationTitle = undefined;
}

/** Gekleurde grondkolom links, met de laagtabel ernaast. */
function drawSoilTable(c: Cursor, layers: LayerRow[], nonlinear: boolean) {
  const doc = c.doc, rowH = 9, colW = 16, x0 = M.left;
  c.reserve(8 + layers.length * rowH + 4);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
  const cols: Array<[string, number]> = [['Laag', 10], ['m NAP', 26], ['Grond', 62], ['kh [kN/m3]', 20], ['k0 [kN/m2]', 20], ...(nonlinear ? [['pu boven - onder [kN/m]', 34] as [string, number]] : [])];
  let x = x0 + colW + 2;
  for (const [label, w] of cols) { doc.text(winAnsi(label), x, c.y); x += w; }
  c.y += 3;
  for (const l of layers) {
    doc.setFillColor(...l.rgb); doc.setDrawColor(90); doc.setLineWidth(.15); doc.rect(x0, c.y, colW, rowH, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(40); doc.text(String(l.index), x0 + colW / 2, c.y + rowH / 2 + 1.2, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(0);
    const cells = [String(l.index), `${nl(l.topNap, 2)} - ${nl(l.bottomNap, 2)}`, l.label, nl(l.khKnM3, 0), nl(l.k0KnM2, 0), ...(nonlinear ? [l.puTop === null ? '-' : `${nl(l.puTop, 0)} - ${nl(l.puBottom!, 0)}`] : [])];
    x = x0 + colW + 2;
    cells.forEach((v, k) => { doc.text((doc.splitTextToSize(winAnsi(v), cols[k][1] - 2) as string[])[0], x, c.y + 3.6); x += cols[k][1]; });
    doc.setTextColor(110); doc.setFontSize(6);
    doc.text(winAnsi(l.source), x0 + colW + 2 + cols[0][1] + cols[1][1], c.y + 7.2);
    if (l.ultimate && nonlinear) doc.text(winAnsi(l.ultimate.replace('·', ' ')), x0 + colW + 2 + cols.slice(0, 5).reduce((a, cc) => a + cc[1], 0), c.y + 7.2);
    doc.setTextColor(0);
    c.y += rowH;
  }
  c.y += 4;
}

/** Vier lijnen naast elkaar: diepte in m NAP, eigen schaal, arcering haaks op de paal, max en min. */
function drawDiagrams(c: Cursor, input: LateralInput, samplesIn: Sample[], head: number) {
  const H = 110;
  c.reserve(H + 22);
  const doc = c.doc, samples = [...samplesIn].sort((a, b) => a.zM - b.zM), L = input.lengthM;
  const top = c.y + 8, bottom = top + H, axisW = 14, gap = 5, W = (CONTENT_W - axisW - 3 * gap) / 4;
  const y = (z: number) => top + H * z / L;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(90);
  doc.text('m NAP', M.left, top - 2);
  const step = L <= 6 ? .5 : L <= 15 ? 1 : L <= 30 ? 2 : 5;
  for (let n = Math.floor(head / step) * step; n >= head - L - 1e-9; n -= step) {
    if (n > head + 1e-9) continue;
    doc.text(nl(n, step < 1 ? 1 : 0), M.left + axisW - 2, y(head - n) + 1, { align: 'right' });
  }
  CURVES.forEach((cv, i) => {
    const left = M.left + axisW + i * (W + gap), dir = cv.mirror ? -1 : 1, drawn = (p: Sample) => dir * cv.value(p);
    const vals = samples.map(drawn), ticks = niceTicks(Math.min(...vals), Math.max(...vals));
    const lo = ticks[0], hi = ticks[ticks.length - 1], x = (v: number) => left + 2 + (W - 4) * (v - lo) / ((hi - lo) || 1), x0 = x(0);
    const tone = TONES[cv.tone];
    doc.setTextColor(0); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
    doc.text(winAnsi(`${cv.title} [${cv.unit}]`), left + W / 2, top - 3, { align: 'center' });
    doc.setDrawColor(200); doc.setLineWidth(.15); doc.rect(left, top, W, H);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(90);
    ticks.forEach((t) => { doc.setDrawColor(225); doc.line(x(t), top, x(t), bottom); doc.text(nl(dir * t === 0 ? 0 : dir * t, Math.abs(ticks[1] - ticks[0]) < 1 ? 1 : 0), x(t), bottom + 3.5, { align: 'center' }); });
    doc.text(cv.mirror ? `${cv.unit} (getrokken zijde)` : cv.unit, left + W / 2, bottom + 7, { align: 'center' });
    // Arcering haaks op de paal, in de kleur van de grootheid.
    doc.setDrawColor(tone[0], tone[1], tone[2]); doc.setLineWidth(.12);
    for (let py = y(samples[0].zM); py <= y(samples[samples.length - 1].zM); py += 1.2) doc.line(x0, py, x(valueAt(samples, drawn, (py - top) * L / H)), py);
    doc.setDrawColor(40); doc.setLineWidth(.3); doc.line(x0, top, x0, bottom);
    doc.setDrawColor(tone[0], tone[1], tone[2]); doc.setLineWidth(.45);
    const pts = samples.map((p) => [x(drawn(p)), y(p.zM)] as const);
    for (let k = 1; k < pts.length; k++) doc.line(pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1]);
    const e = extremes(samples, cv.value);
    doc.setFontSize(6); doc.setTextColor(0);
    for (const [kind, v] of [['max', e.max], ['min', e.min]] as const) {
      const px = x(dir * v.v), py = y(v.z), right = px > left + W * .55;
      doc.setDrawColor(0); doc.setFillColor(255, 255, 255); doc.circle(px, py, .7, 'FD');
      const ty = Math.min(bottom - 1, Math.max(top + 3, py + (kind === 'max' ? -2 : 3.5)));
      doc.text(winAnsi(`${kind} ${nl(v.v, cv.digits)} ${cv.unit}`), right ? px - 1.5 : px + 1.5, ty, { align: right ? 'right' : 'left' });
      doc.setTextColor(110); doc.text(`NAP ${nl(head - v.z, 2)}`, right ? px - 1.5 : px + 1.5, ty + 2.4, { align: right ? 'right' : 'left' }); doc.setTextColor(0);
    }
  });
  doc.setTextColor(0);
  c.y = bottom + 11;
}

/** N-M-interactiekromme met het ontwerppunt. */
function drawNM(c: Cursor, pts: Array<{ n: number; m: number }>, nEd: number, mEd: number) {
  const W = 90, H = 55, doc = c.doc;
  c.reserve(H + 12);
  const left = M.left + 14, top = c.y + 2, nLo = Math.min(...pts.map((p) => p.n), nEd), nHi = Math.max(...pts.map((p) => p.n), nEd), mHi = Math.max(...pts.map((p) => p.m), mEd) * 1.08 || 1;
  const x = (m: number) => left + W * m / mHi, y = (v: number) => top + H - H * (v - nLo) / ((nHi - nLo) || 1);
  doc.setDrawColor(120); doc.setLineWidth(.2); doc.line(left, top, left, top + H); doc.line(left, y(0), left + W, y(0));
  doc.setDrawColor(37, 99, 235); doc.setLineWidth(.45);
  for (let k = 1; k < pts.length; k++) doc.line(x(pts[k - 1].m), y(pts[k - 1].n), x(pts[k].m), y(pts[k].n));
  doc.setFillColor(220, 38, 38); doc.circle(x(mEd), y(nEd), 1, 'F');
  doc.setFontSize(6.5); doc.setTextColor(60); doc.setFont('helvetica', 'normal');
  doc.text(`(${nl(mEd, 0)}; ${nl(nEd, 0)})`, x(mEd) + 2, y(nEd) - 1.5);
  doc.text('N [kN]', left - 2, top - 1, { align: 'right' }); doc.text('MRd [kNm]', left + W, y(0) + 4, { align: 'right' });
  doc.text(nl(nHi, 0), left - 1.5, y(nHi) + 1, { align: 'right' }); doc.text(nl(nLo, 0), left - 1.5, y(nLo) + 1, { align: 'right' });
  doc.setTextColor(0);
  c.y = top + H + 8;
}

export function lateralReportFileName(): string {
  return `horizontale-paal-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
}
