// Blad "Varianten" in het PDF-rapport: de vergelijkingstabel en, na een
// optimalisatie, de instellingen en het verloop van de beste massa.
import type { LateralInput } from './compute';
import { CONTENT_W, M, nl, paragraph, sectionTitle, table, kv, type Cursor } from '../pile-bearing-capacity/parts/pile-report-pdf';
import { designLabel, evaluateVariant, KIND_KEYS } from './variants';
import type { OptimizerRecord } from './optimizer';

const ucPdf = (v: number | null) => v === null ? '-' : v === Infinity ? 'oneindig' : nl(v, 2);

export function renderVariantsAppendix(c: Cursor, input: LateralInput) {
  const cfg = input.variants;
  if (!cfg?.inReport || !cfg.items.length) return;
  c.newPage();
  c.continuationTitle = 'Varianten';
  const maxY = cfg.maxDisplacementMm;
  sectionTitle(c, 'Varianten', `${cfg.items.length} varianten bij dezelfde grond en belasting; grens kopverplaatsing ${maxY ? `${nl(maxY, 0)} mm` : 'niet opgegeven'}`);
  const head = input.headNap ?? 0;
  const rows = cfg.items.map((v) => ({ v, o: evaluateVariant(input, v.design, maxY) }));
  table(c, [
    { label: 'Variant', width: 18 }, { label: 'Paal', width: 34 }, { label: 'Punt [m NAP]', width: 13, align: 'right' }, { label: 'kg/paal', width: 12, align: 'right' },
    { label: 'kg staal', width: 12, align: 'right' }, { label: 'Beton [m³]', width: 12, align: 'right' }, { label: 'y kop [mm]', width: 12, align: 'right' },
    { label: 'M max [kNm]', width: 13, align: 'right' }, { label: 'u.c.', width: 9, align: 'right' }, { label: 'Toets', width: 25 }, { label: 'Oordeel', width: 14 },
  ], rows.map(({ v, o }) => [v.name, `${KIND_KEYS[v.design.section.kind][1]} ${designLabel(v.design)}`, nl(head - v.design.lengthM, 2),
    nl(o.mass.totalKg, 0), nl(o.mass.steelKg, 0), o.mass.concreteM3 > 0 ? nl(o.mass.concreteM3, 2) : '-',
    ...(o.ok ? [nl(o.yHeadMm, 1), nl(o.mMaxKnM, 1), ucPdf(o.uc), o.checkLabel ?? '-', o.passes ? 'voldoet' : 'voldoet niet'] : ['-', '-', '-', o.error ?? '-', 'niet berekend'])]), { size: 6.5 });
  paragraph(c, 'Gewicht: staal 7850 kg/m³ (NEN-EN 1993-1-1 art. 3.2.6), beton 2400 kg/m³ (aangenomen) over het netto betonoppervlak; langswapening over de hele paallengte, beugels en spiraal niet meegeteld. u.c.: de hoogste van de N–M-toets en de materiaaltoetsing. Voldoet: alle toetsen u.c. ≤ 1,00 en de kopverplaatsing binnen de grens.', { italic: true, size: 7 });
  if (cfg.optimizer) renderOptimizer(c, cfg.optimizer);
}

function renderOptimizer(c: Cursor, r: OptimizerRecord) {
  const st = r.settings;
  sectionTitle(c, 'Optimalisatie op gewicht', 'genetisch algoritme');
  kv(c, 'Doel', st.objective === 'steel' ? 'minimaal staal per paal (buis of profiel en wapening)' : 'minimale massa per paal (staal en beton)');
  kv(c, 'Eisen', `alle toetsen u.c. ≤ 1,00${st.maxDisplacementMm ? `; kopverplaatsing ≤ ${nl(st.maxDisplacementMm, 0)} mm` : ''}; paalpunt ${st.toeHighNap === st.toeLowNap ? `vast op NAP ${nl(st.toeHighNap, 2)} m` : `tussen NAP ${nl(st.toeHighNap, 2)} en ${nl(st.toeLowNap, 2)} m, stap ${nl(st.toeStepM, 2)} m`}`);
  kv(c, 'Paaltypen', st.kinds.map((k) => KIND_KEYS[k][1]).join(', '));
  const sizes = st.kinds.filter((k) => k !== 'sheet-pile').map((k) => `${KIND_KEYS[k][1]}: ${(st.sizes[k] ?? []).map((v) => nl(v, v % 1 ? 1 : 0)).join(', ')}`);
  if (sizes.length) kv(c, 'Maten [mm]', sizes.join('; '));
  if (st.kinds.some((k) => k === 'steel-tube' || k === 'filled-tube')) kv(c, 'Wand / staal', `${st.wallsMm.map((v) => nl(v, v % 1 ? 1 : 0)).join(', ')} mm; ${st.steelGrades.join(', ')}`);
  if (st.kinds.some((k) => k !== 'steel-tube' && k !== 'sheet-pile')) kv(c, 'Beton / staven', `${st.concreteClasses.join(', ')}; Ø ${st.barDiametersMm.join(', ')} mm`);
  if (st.kinds.includes('sheet-pile')) kv(c, 'Damwand', `${st.sheetSeries.map((s) => s.replace('|', ' ')).join(', ')}; ${st.sheetGrades.join(', ')}`);
  kv(c, 'Algoritme', `populatie ${st.population}, max. ${st.generations} generaties, stop na ${st.stall} zonder verbetering, toernooi ${st.tournament}, mutatiekans ${nl(st.mutation, 2)}, elitisme ${st.elite}, seed ${st.seed}, strafgewicht ${nl(st.penalty, 0)}`);
  const reason = { generations: 'ingesteld aantal generaties bereikt', stall: 'geen verbetering meer', stopped: 'door de gebruiker gestopt', exhausted: 'alle varianten doorgerekend' }[r.reason];
  kv(c, 'Verloop', `${r.evaluated} van ${r.spaceSize} varianten doorgerekend, ${r.feasible} voldoen; ${r.generations} generaties (${reason})`);
  if (r.bestLabel && r.bestKg !== null) kv(c, 'Beste', `${r.bestLabel}: ${nl(r.bestKg, 0)} kg`);
  drawHistory(c, r);
  paragraph(c, 'Een genetisch algoritme vindt een goede, maar niet gegarandeerd de lichtste variant. Overschrijding van een eis telt als straf in de doelfunctie; elke variant is één keer doorgerekend.', { italic: true, size: 7 });
}

function drawHistory(c: Cursor, r: OptimizerRecord) {
  const pts = r.history.filter((h) => h.bestKg !== null) as Array<{ generation: number; bestKg: number }>;
  if (!pts.length) return;
  const H = 34, W = Math.min(110, CONTENT_W), left = M.left + 14;
  c.reserve(H + 12);
  const doc = c.doc, top = c.y + 4, gMax = Math.max(2, ...r.history.map((h) => h.generation));
  const lo = Math.min(...pts.map((p) => p.bestKg)), hi = Math.max(...pts.map((p) => p.bestKg)), span = hi - lo || Math.max(1, hi * .05);
  const x = (g: number) => left + W * (g - 1) / (gMax - 1), y = (m: number) => top + H * (1 - (m - lo) / span);
  doc.setDrawColor(150); doc.setLineWidth(.2);
  doc.line(left, top + H, left + W, top + H); doc.line(left, top, left, top + H);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(90);
  doc.text(nl(hi, 0), left - 1.5, y(hi) + 1, { align: 'right' }); doc.text(nl(lo, 0), left - 1.5, y(lo) + 1, { align: 'right' });
  doc.text('kg', left - 1.5, top - 1.5, { align: 'right' }); doc.text('generatie', left + W, top + H + 4, { align: 'right' });
  doc.setDrawColor(40, 90, 160); doc.setLineWidth(.5);
  for (let i = 1; i < pts.length; i++) doc.line(x(pts[i - 1].generation), y(pts[i - 1].bestKg), x(pts[i].generation), y(pts[i].bestKg));
  doc.setTextColor(0); doc.setDrawColor(0);
  c.y = top + H + 8;
}
