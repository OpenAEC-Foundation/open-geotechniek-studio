// PDF-rapport horizontale paal, met dezelfde kop, voet en opmaak als het
// paaldraagvermogenrapport en dezelfde onderdelen als de uitdraai op het scherm.
import { usesUltimate } from './spring-types';
import { jsPDF } from 'jspdf';
import type { ProjectContext } from '../../framework/types';
import type { LateralInput, LateralResult } from './compute';
import { CURVES, extremes, niceTicks, signRegions, valueAt } from './ForceDiagrams';
import { lateralSummary, sectionText } from './LateralSheet';
import { lateralReportData, type LayerRow } from './report-data';
import { computeLateral } from './compute';
import { computePileTable } from './pile-table';
import { renderMethod } from './report-method';
import { renderVariantsAppendix } from './variants-report';
import { sheetProps } from './sheet-section';
import type { MaterialResult, Quantity } from './material-types';
import {
  CONTENT_W, M, TOTAL_PAGES_TOKEN, formula, kv, makeCursor, nl, paragraph, sectionTitle, table, winAnsi, type Cursor,
} from '../pile-bearing-capacity/parts/pile-report-pdf';
import { reportPalette } from '../../../report/reportPalette';

type Ok = Extract<LateralResult, { ok: true }>;
type Sample = Ok['beam']['samples'][number];
/** Lijnkleur per grootheid, uit het gedeelde palet van de rapporten. */
const tones = (): Record<string, [number, number, number]> => { const p = reportPalette(); return { disp: p.success, moment: p.error, shear: p.info, soil: p.accentStrong }; };

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
  renderMethod(c, input, result);
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
  renderVariantsAppendix(c, input);
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
    ...(x.ok ? [nl(x.yHeadMm, 1), nl(x.mMaxKnM, 1), nl(x.mNap, 2), nl(x.vMaxKn, 1), x.ucGov === null ? '-' : ucPdf(x.ucGov), x.passes ? 'voldoet' : 'voldoet niet'] : ['-', '-', '-', '-', '-', 'niet berekend'])]), { size: 7 });
  paragraph(c, 'Zelfde grond, doorsnede en wapening als de basisinvoer. u.c.: hoogste van de materiaaltoetsing. Voldoet: u.c. ≤ 1,00 en de kopverplaatsing binnen de grens.', { italic: true, size: 7 });
}

/** De volledige uitwerking van één paal. */
export function renderCalc(c: Cursor, input: LateralInput, result: Extract<LateralResult, { ok: true }>, heading?: string) {
  const r = result, s = lateralSummary(input, r), d = lateralReportData(input, r);
  const nap = (z: number) => `NAP ${nl(s.head - z, 2)}`;
  const nonlinear = usesUltimate(r.analysisMode);
  if (heading) { c.continuationTitle = heading; sectionTitle(c, heading); }

  sectionTitle(c, '1. Uitgangspunten');
  kv(c, 'Paal', sectionText(input.section));
  kv(c, 'Paalkop / paalpunt', `${nap(0)} m / ${nap(input.lengthM)} m (lengte ${nl(input.lengthM, 2)} m)`);
  kv(c, 'Belasting op de kop', `H = ${nl(input.headForceKn, 1)} kN, M = ${nl(input.headMomentKnM, 1)} kNm, N = ${nl(input.nEdKn, 1)} kN (druk +)`);
  kv(c, 'Randvoorwaarden', `${input.headFixedRotation ? 'kop ingeklemd' : 'kop vrij draaiend'}${input.toeFixed ? ', voet ingeklemd' : ', voet vrij'}`);
  if (r.water) kv(c, 'Waterbodem', `waterbodem NAP ${nl(r.water.bedNap, 2)} m, waterpeil NAP ${nl(r.water.waterNap, 2)} m; vrije lengte in water ${nl(r.water.freeLengthM, 2)} m zonder grondveren; korrelspanning vanaf de waterbodem met γ′`);
  if (r.water?.current) { const w = r.water.current; kv(c, 'Stroming', `q = ½ · ρ · C_D · D · u² = ½ · ${nl(w.densityKgM3, 0)} · ${nl(w.cd, 2)} · ${nl(w.widthM, 3)} · ${nl(w.speedMs, 2)}² = ${nl(w.qMaxKnM, 2)} kN/m (oppervlak, ${w.profile === 'power' ? `machtsprofiel n = ${nl(w.exponent, 3)}` : 'uniform'}); γ = ${nl(w.factor, 2)}, ${w.sign === 1 ? 'met H mee' : 'tegen H in'}; resultante ${nl(w.resultantKn, 1)} kN op NAP ${nl(w.resultantNap, 2)} m. Niet meegenomen: golfbelasting (Morison) en dynamische effecten (wervelafschudding).`); }
  kv(c, 'Grondmodel', `${r.analysisMode === 'elastoplastic' ? 'elastoplastisch, p = min(k_0 · y; p_u)' : nonlinear ? 'niet-lineair, p = p_u · tanh(k_0 · y / p_u)' : 'lineair, p = k_0 · y'}${input.layerCorrection === 'georgiadis' ? '; laagcorrectie Georgiadis' : ''}; werkende breedte ${nl(input.springWidthM, 2)} m`);
  c.y += 2;

  sectionTitle(c, '2. Paaldoorsnede');
  const sec = r.section, sheet = input.section.kind === 'sheet-pile' ? sheetProps(input.section.sheet, input.section.steelEMpa) : null;
  const gross = sheet ? sec.steelAreaM2 : input.section.kind === 'concrete-square' ? (input.section.diameterMm / 1000) ** 2 : Math.PI * (input.section.diameterMm / 1000) ** 2 / 4;
  kv(c, 'Bruto oppervlak', `${nl(gross * 1e6, 0)} mm²`);
  if (sec.concreteAreaM2 > 0) kv(c, 'Beton (netto)', `${nl(sec.concreteAreaM2 * 1e6, 0)} mm²; E_c,eff = ${nl(input.section.concreteEMpa * input.section.concreteFactor / (1 + input.section.creepCoefficient), 0)} MPa`);
  if (sec.rebarAreaMm2 > 0) kv(c, 'Langswapening', `${nl(sec.rebarAreaMm2, 0)} mm²; ρ = ${nl(100 * sec.rebarAreaMm2 / (gross * 1e6), 2)} %`);
  if (sheet) kv(c, 'Profiel', `${sheet.profile.manufacturer} ${sheet.profile.id}, ${sheet.grade} (f_y = ${nl(sheet.fyMpa, 0)} MPa); I = ${nl(sheet.profile.iCm4PerM ?? 0, 0)} cm⁴/m, W_el = ${nl(sheet.profile.welCm3PerM ?? 0, 0)} cm³/m${sheet.profile.wplCm3PerM !== null ? `, W_pl = ${nl(sheet.profile.wplCm3PerM, 0)} cm³/m` : ''}; rekenbreedte ${nl(sheet.widthM, 3)} m; β_B = ${nl(sheet.betaB, 2)}, β_D = ${nl(sheet.betaD, 2)}`);
  else if (sec.steelAreaM2 > 0) kv(c, 'Buis', `${nl(sec.steelAreaM2 * 1e6, 0)} mm²; wand ${nl(input.section.wallMm, 1)} mm`);
  if (r.capacity) kv(c, 'M_Rd bij N_Ed', `${nl(r.capacity.mRdKnM, 1)} kNm (N tussen ${nl(r.capacity.nMinKn, 0)} en ${nl(r.capacity.nMaxKn, 0)} kN)`);
  if (sheet) formula(c, 'EI', 'β_D · E · I · b', null, `${nl(sec.eiKnM2, 0)} kNm²`);
  else formula(c, 'EI', 'E_c,eff · I_c + E_s · I_s + E_a · I_a', `${nl(sec.concreteEI, 0)} + ${nl(sec.rebarEI, 0)} + ${nl(sec.tubeEI, 0)}`, `${nl(sec.eiKnM2, 0)} kNm²`);

  sectionTitle(c, '3. Grondopbouw', 'CUR166 deel 1, tabel 3.3 (eerste secanttraject); kleuren: zand geel, klei groen, veen bruin');
  drawSoilTable(c, d.layers, nonlinear);
  table(c, [{ label: 'Laag', width: 8 }, { label: 'Dikte [m]', width: 12, align: 'right' }, { label: 'φ [°]', width: 10, align: 'right' }, { label: 'K_a [-]', width: 10, align: 'right' },
    { label: 'Lijnlast [kN/m]', width: 14, align: 'right' }, { label: 'z_eq [m]', width: 18, align: 'right' }, ...(nonlinear ? [{ label: '∫ p_u dz [kN]', width: 16, align: 'right' as const }] : [])],
  d.layers.map((l) => [String(l.index), nl(l.thicknessM, 2), nl(l.frictionDeg, 0), nl(l.ka, 3), nl(l.lineLoadKnM, 1), `${nl(l.zeqTop, 2)} - ${nl(l.zeqBottom, 2)}`, ...(nonlinear ? [l.cumulativeKn === null ? '-' : nl(l.cumulativeKn, 0)] : [])]), { size: 7 });
  paragraph(c, `k_0 = k_h × werkende breedte ${nl(input.springWidthM, 2)} m.${nonlinear ? ' p_u als functie van de equivalente diepte z_eq.' : ''}`, { size: 7.5, italic: true });

  sectionTitle(c, '4. Resultaten');
  const row = (name: string, e: ReturnType<typeof extremes>, dg: number) => [name, nl(e.max.v, dg), nap(e.max.z), nl(e.min.v, dg), nap(e.min.z)];
  table(c, [{ label: 'Grootheid', width: 34 }, { label: 'Maximum', width: 18, align: 'right' }, { label: 'Niveau', width: 22 }, { label: 'Minimum', width: 18, align: 'right' }, { label: 'Niveau', width: 22 }], [
    row('Verplaatsing y [mm]', s.y, 2), row('Moment M [kNm]', s.M, 1), row('Dwarskracht V [kN]', s.V, 1), row('Grondreactie p [kN/m]', s.p, 1),
  ]);
  paragraph(c, `Kopverplaatsing ${nl(s.yHeadMm, 2)} mm.${s.mobilisation ? ` Hoogste mobilisatie p/p_u ${nl(s.mobilisation.value * 100, 0)} % op NAP ${nl(s.mobilisation.nap, 2)}.` : ''}`);
  drawDiagrams(c, input, r.beam.samples, s.head);

  sectionTitle(c, '5. Grondreactie per laag');
  table(c, [{ label: 'Laag', width: 8 }, { label: 'Veren', width: 9, align: 'right' }, { label: 'y max [mm]', width: 14, align: 'right' }, { label: 'p max [kN/m]', width: 15, align: 'right' },
    { label: 'Kracht op paal [kN]', width: 18, align: 'right' }, ...(nonlinear ? [{ label: 'p/p_u max', width: 12, align: 'right' as const }, { label: 'k_sec/k_0 min', width: 13, align: 'right' as const }] : [])],
  d.layers.map((l) => [String(l.index), String(l.springs), nl(l.yMaxMm, 2), nl(l.pMaxKnM, 1), nl(l.resultantKn, 1), ...(nonlinear ? [l.mobMax === null ? '-' : `${nl(l.mobMax * 100, 0)} %`, nl(l.secantRatioMin, 2)] : [])]),
  { summaryRow: ['Som + H', '', '', '', nl(d.soilForce + input.headForceKn, 3), ...(nonlinear ? ['', ''] : [])] });

  sectionTitle(c, '6. Verloop over de diepte', `stap ${nl(d.step, 2)} m`);
  table(c, [{ label: 'm NAP', width: 14, align: 'right' }, { label: 'y [mm]', width: 14, align: 'right' }, { label: 'θ [mrad]', width: 16, align: 'right' },
    { label: 'M [kNm]', width: 14, align: 'right' }, { label: 'V [kN]', width: 14, align: 'right' }, { label: 'p [kN/m]', width: 14, align: 'right' }],
  d.depth.map((x) => [nl(x.nap, 2), nl(x.yMm, 2), nl(x.rotMrad, 3), nl(x.mKnM, 1), nl(x.vKn, 1), nl(x.pKnM, 1)]), { size: 7 });

  sectionTitle(c, '7. Doorsnedetoets N-M');
  if (r.capacity && s.uc !== null) formula(c, 'u.c.', '|M|_max / M_Rd(N_Ed)', `${nl(s.mEd, 1)} / ${nl(r.capacity.mRdKnM, 1)}`, nl(s.uc, 2));
  else paragraph(c, r.capacityError ?? 'Geen doorsnedetoets mogelijk.');
  if (d.nm.length > 1) drawNM(c, d.nm, input.nEdKn, s.mEd);

  const mat = r.material, gov = mat?.governing;
  if (mat) renderMaterial(c, mat, nap); else { sectionTitle(c, '8. Materiaaltoetsing'); paragraph(c, r.materialError ?? 'Geen materiaaltoetsing mogelijk.'); }

  sectionTitle(c, '9. Conclusie');
  paragraph(c, !mat || mat.ok === null ? 'Geen doorsnedetoets mogelijk.' : mat.outside ? 'Geen oordeel: een deel van de materiaaltoetsing valt buiten deze toetsing (zie 8).'
    : mat.ok && gov ? `De doorsnede voldoet op alle uitgevoerde toetsen. Maatgevend: ${gov.label.toLowerCase()}, u.c. ${ucPdf(gov.uc)} ≤ 1,00. Kopverplaatsing ${nl(s.yHeadMm, 1)} mm.`
      : `De doorsnede voldoet niet. Maatgevend: ${gov?.label.toLowerCase() ?? '-'}, u.c. ${ucPdf(gov?.uc ?? null)} > 1,00.`);
  // De voorbehouden als één compacte voetregel.
  if (mat) paragraph(c, `${mat.notChecked.nl} Statische, monotone belasting. Concept alpha: indicatieve berekening.`, { italic: true, size: 6.5 });

  c.continuationTitle = undefined;
}

const ucPdf = (uc: number | null) => uc === null ? '-' : uc === Infinity ? 'oneindig' : uc > 99 ? '> 99' : nl(uc, 2);
const STATUS: Record<string, string> = { ok: 'voldoet', fail: 'voldoet niet', info: 'ter informatie', na: 'niet getoetst', outside: 'buiten toetsing' };
/** Tekst van een toelichting met de ingevulde waarden. */
const noteText = (n: { nl: string; vars?: Record<string, string | number> }) => n.nl.replace(/\{\{(\w+)\}\}/g, (_, k: string) => { const v = n.vars?.[k]; return typeof v === 'number' ? String(v).replace('.', ',') : String(v ?? ''); });
const qty = (q: Quantity | undefined) => !q ? '-' : Number.isFinite(q.v) ? `${q.s} = ${nl(q.v, q.d ?? 1)}${q.u ? ` ${q.u}` : ''}` : q.s;

/** Materiaaltoetsing: het overzicht als tabel, daaronder per toets de tussenstappen op één regel. */
function renderMaterial(c: Cursor, m: MaterialResult, nap: (z: number) => string) {
  sectionTitle(c, '8. Materiaaltoetsing', m.standard);
  table(c, [{ label: 'Toets', width: 40 }, { label: 'Artikel', width: 36 }, { label: 'Rekenwaarde', width: 26, align: 'right' }, { label: 'Weerstand', width: 28, align: 'right' }, { label: 'u.c.', width: 9, align: 'right' }, { label: 'Oordeel', width: 18 }, { label: 'Snede', width: 15 }],
    m.rows.map((r) => [r.label, r.article.replace(/^NEN-/, ''), qty(r.demand), qty(r.resistance), ucPdf(r.uc), STATUS[r.status], r.zM === undefined ? '' : nap(r.zM)]), { size: 7 });
  for (const r of m.rows) {
    if (!r.steps.length && !r.note) continue;
    const steps = r.steps.map((x) => `${x.s}${x.f ? ` = ${x.f}` : ''} = ${nl(x.v, x.d ?? 1)}${x.u ? ` ${x.u}` : ''}`).join('; ');
    paragraph(c, `${r.label}: ${steps}${steps && r.note ? '. ' : ''}${r.note ? noteText(r.note) : ''}`, { size: 7, indent: 2 });
  }
  for (const n of m.notes) paragraph(c, noteText(n), { italic: true, size: 7 });
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
  c.reserve(H + 26);
  const doc = c.doc, samples = [...samplesIn].sort((a, b) => a.zM - b.zM), L = input.lengthM;
  const top = c.y + 8, bottom = top + H, axisW = 14, gap = 5, W = (CONTENT_W - axisW - 3 * gap) / 4;
  const y = (z: number) => top + H * z / L, TONES = tones();
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
    doc.setDrawColor(150); doc.setLineWidth(.15); doc.line(left, bottom, left + W, bottom);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(90);
    ticks.forEach((t) => { doc.setDrawColor(150); doc.line(x(t), bottom, x(t), bottom + 1); doc.text(nl(dir * t === 0 ? 0 : dir * t, Math.abs(ticks[1] - ticks[0]) < 1 ? 1 : 0), x(t), bottom + 3.5, { align: 'center' }); });
    doc.text(cv.mirror ? `${cv.unit} (getrokken zijde)` : cv.unit, left + W / 2, bottom + 7, { align: 'center' });
    // Rustig vlak: lichte vulling met een fijne arcering haaks op de paal, in de kleur van de grootheid.
    const pts = samples.map((p) => [x(drawn(p)), y(p.zM)] as const), tint = (f: number) => tone.map((v) => Math.round(255 - (255 - v) * f)) as [number, number, number];
    const outline = [[x0, pts[0][1]] as const, ...pts, [x0, pts[pts.length - 1][1]] as const];
    doc.setFillColor(...tint(.1));
    doc.lines(outline.slice(1).map((p, k) => [p[0] - outline[k][0], p[1] - outline[k][1]]), outline[0][0], outline[0][1], [1, 1], 'F', true);
    doc.setDrawColor(...tint(.35)); doc.setLineWidth(.1);
    for (let py = y(samples[0].zM); py <= y(samples[samples.length - 1].zM); py += 2.2) doc.line(x0, py, x(valueAt(samples, drawn, (py - top) * L / H)), py);
    doc.setDrawColor(40); doc.setLineWidth(.3); doc.line(x0, pts[0][1], x0, pts[pts.length - 1][1]);
    doc.setDrawColor(tone[0], tone[1], tone[2]); doc.setLineWidth(.45);
    for (let k = 1; k < pts.length; k++) doc.line(pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1]);
    const e = extremes(samples, cv.value);
    // Eén teken per gebied tussen twee nuldoorgangen, gelijk aan het scherm.
    const absMax = Math.max(Math.abs(e.max.v), Math.abs(e.min.v)) || 1;
    if (cv.sign) for (const g of signRegions(samples, cv.value)) {
      if (Math.abs(g.peak.v) <= .04 * absMax || y(g.zBottom) - y(g.zTop) < 7) continue;
      const far = g.peak.z - g.zTop > g.zBottom - g.peak.z ? g.zTop : g.zBottom, cy = Math.min(y(g.zBottom) - 3.5, Math.max(y(g.zTop) + 3.5, y((g.peak.z + far) / 2))), cx = (x0 + x(valueAt(samples, drawn, (cy - top) * L / H))) / 2;
      // Dwarskracht: plus als zij op het bovenvlak met een positieve H meewijst (de rekenkern geeft V = -H aan de kop).
      drawSign(c, cv.sign === 'bend' ? 'bend' : 'plain', cx, cy, cv.sign === 'bend' ? (Math.sign(dir * g.sign) || 1) : cv.sign === 'shear' ? -g.sign : g.sign);
    }
    doc.setFontSize(6); doc.setTextColor(0);
    // Labels van max en min nooit over elkaar.
    const sideOf = (v: { v: number }) => x(dir * v.v) > left + W * .55;
    const labelY = { max: Math.min(bottom - 4, Math.max(top + 3, y(e.max.z) - 2)), min: Math.min(bottom - 4, Math.max(top + 3, y(e.min.z) + 3.5)) };
    if (sideOf(e.max) === sideOf(e.min) && Math.abs(labelY.max - labelY.min) < 6) {
      const upper = labelY.max <= labelY.min ? 'max' : 'min', lower = upper === 'max' ? 'min' : 'max';
      labelY[lower] = Math.min(bottom - 4, labelY[upper] + 6); labelY[upper] = Math.min(labelY[upper], labelY[lower] - 6);
    }
    for (const [kind, v] of [['max', e.max], ['min', e.min]] as const) {
      const px = x(dir * v.v), py = y(v.z), right = sideOf(v);
      doc.setDrawColor(0); doc.setFillColor(255, 255, 255); doc.circle(px, py, .7, 'FD');
      const ty = labelY[kind];
      doc.text(winAnsi(`${kind} ${nl(v.v, cv.digits)} ${cv.unit}`), right ? px - 1.5 : px + 1.5, ty, { align: right ? 'right' : 'left' });
      doc.setTextColor(110); doc.text(`NAP ${nl(head - v.z, 2)}`, right ? px - 1.5 : px + 1.5, ty + 2.4, { align: right ? 'right' : 'left' }); doc.setTextColor(0);
    }
  });
  doc.setFont('helvetica', 'italic'); doc.setFontSize(6.5); doc.setTextColor(90);
  doc.text(winAnsi('Moment aan de getrokken zijde (streeplijn = trek); dwarskracht + met H mee op het bovenvlak.'), M.left, bottom + 11);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(0);
  c.y = bottom + 15;
}

/** Teken in een diagramvlak: buigteken (boogje, trekzijde gestreept), afschuifteken (blokje met twee pijltjes) of plus/min. */
function drawSign(c: Cursor, kind: 'bend' | 'shear' | 'plain', x: number, y: number, s: number) {
  const doc = c.doc;
  doc.setDrawColor(20); doc.setFillColor(20, 20, 20); doc.setLineWidth(.22);
  if (kind === 'bend') {
    // Kwadratische boog door drie punten, bol naar de getrokken zijde.
    const arc = (dx: number, bulge: number) => { let px = x + dx, py = y - 2.6; for (let i = 1; i <= 10; i++) { const t = i / 10, nx = x + dx + bulge * 4 * t * (1 - t), ny = y - 2.6 + 5.2 * t; doc.line(px, py, nx, ny); px = nx; py = ny; } };
    arc(-s * .6, s * 1.5);
    doc.setLineDashPattern([.5, .4], 0); doc.setLineWidth(.15); arc(s * .1, s * 1.5); doc.setLineDashPattern([], 0);
  } else if (kind === 'shear') {
    doc.setFillColor(255, 255, 255); doc.rect(x - 1.1, y - 1.3, 2.2, 2.6, 'FD'); doc.setFillColor(20, 20, 20);
    const arrow = (ay: number, d: number) => { doc.line(x - d * 1.7, ay, x + d * 1.7, ay); doc.triangle(x + d * 1.7, ay, x + d * 1.0, ay - .5, x + d * 1.0, ay + .5, 'F'); };
    arrow(y - 2.1, s); arrow(y + 2.1, -s);
  } else {
    doc.setFillColor(255, 255, 255); doc.circle(x, y, 1.5, 'FD');
    doc.line(x - .8, y, x + .8, y); if (s > 0) doc.line(x, y - .8, x, y + .8);
  }
  doc.setLineWidth(.2); doc.setDrawColor(0);
}

/** N-M-interactiekromme met het ontwerppunt. */
function drawNM(c: Cursor, pts: Array<{ n: number; m: number }>, nEd: number, mEd: number) {
  const W = 90, H = 55, doc = c.doc;
  c.reserve(H + 12);
  const left = M.left + 14, top = c.y + 2, nLo = Math.min(...pts.map((p) => p.n), nEd), nHi = Math.max(...pts.map((p) => p.n), nEd), mHi = Math.max(...pts.map((p) => p.m), mEd) * 1.08 || 1;
  const x = (m: number) => left + W * m / mHi, y = (v: number) => top + H - H * (v - nLo) / ((nHi - nLo) || 1);
  doc.setDrawColor(120); doc.setLineWidth(.2); doc.line(left, top, left, top + H); doc.line(left, y(0), left + W, y(0));
  const pal = reportPalette();
  doc.setDrawColor(...pal.secondary); doc.setLineWidth(.45);
  for (let k = 1; k < pts.length; k++) doc.line(x(pts[k - 1].m), y(pts[k - 1].n), x(pts[k].m), y(pts[k].n));
  doc.setFillColor(...pal.accentStrong); doc.circle(x(mEd), y(nEd), 1, 'F');
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
