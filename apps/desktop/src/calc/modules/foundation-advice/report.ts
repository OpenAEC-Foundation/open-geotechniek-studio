// PDF van het funderingsadvies: voorblad, inhoudsopgave, hoofdstukken en
// bijlagen (sonderingen en berekeningen). Kop en voet gelijk aan de
// paalrapporten; het voorblad in de huisstijl van het rapport.
import { jsPDF } from 'jspdf';
import type { ProjectContext } from '../../framework/types';
import { drawCover } from '../../../utils/browserReportBrand';
import {
  CONTENT_W, HEADER_BOTTOM, M, TOTAL_PAGES_TOKEN, kv, makeCursor, nl, paragraph, renderBerekeningBlad, sectionTitle, table, winAnsi, type Cursor,
} from '../pile-bearing-capacity/parts/pile-report-pdf';
import { renderSonderingChart } from '../pile-bearing-capacity/parts/pile-report-chart';
import { resolvePileType } from '../pile-bearing-capacity/catalog';
import { computePile } from '../pile-bearing-capacity/compute';
import type { PileInput } from '../pile-bearing-capacity/types';
import { computeLateral, type LateralInput } from '../laterally-loaded-pile/compute';
import { renderCalc } from '../laterally-loaded-pile/report-pdf';
import { adviceSummary, type AdviceSummary, type CptSummary } from './analysis';
import { GENERAL, fmt, systemTexts } from './texts';
import { drawSituationPdf } from './situation';
import type { AdviceInput } from './types';
import { buildSoilModel, zoneInfo } from '../../../components/soil3d/soilModel';
import { pileToes, renderSoilModelImage } from '../../../components/soil3d/scene';
import { DEFAULT_SOIL3D, useSoil3DStore } from '../../../components/soil3d/useSoil3DStore';

interface TocEntry { label: string; page: number; level: 1 | 2 }

const reportDate = (iso: string | undefined) => (iso || new Date().toISOString().slice(0, 10)).slice(0, 10).split('-').reverse().join('-');

export function buildAdviceReport(input: AdviceInput, ctx: ProjectContext): Uint8Array {
  const s = adviceSummary(input, ctx), meta = ctx.projectMeta;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  drawCover(doc, null, meta, undefined, 'Funderingsadvies');
  doc.addPage();
  const c = makeCursor(doc, {
    number: meta.project_number || '-', description: meta.title || 'Funderingsadvies', norm: 'NEN 9997-1',
    date: reportDate(meta.date), author: meta.author || input.advisor || 'Open Geotechniek Studio',
    onderdeel: 'Funderingsadvies', berekeningsnummer: input.reference || '-', revisie: input.version,
  }, 2);
  const tocPage = c.pageNo, toc: TocEntry[] = [];
  let chapterNo = 0, subNo = 0;
  const chapter = (title: string, numbered = true) => {
    c.newPage(); if (numbered) chapterNo += 1; subNo = 0;
    const label = numbered ? `${chapterNo}  ${title}` : title;
    toc.push({ label, page: c.pageNo, level: 1 });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(0);
    doc.text(winAnsi(label), M.left, c.y); c.y += 8;
  };
  const sub = (title: string) => {
    subNo += 1; const label = `${chapterNo}.${subNo}  ${title}`;
    c.y += 2; c.reserve(14); toc.push({ label, page: c.pageNo, level: 2 }); sectionTitle(c, label);
  };
  const bullets = (items: string[]) => items.forEach((t) => paragraph(c, `-  ${t}`, { indent: 2 }));

  // 1 Inleiding
  chapter('Inleiding');
  sub('Aanleiding en doel');
  paragraph(c, GENERAL.purpose(input.structure));
  if (input.introNote.trim()) paragraph(c, input.introNote.trim());
  sub('Projectgegevens');
  kv(c, 'Project', meta.title || '-'); kv(c, 'Projectnummer', meta.project_number || '-'); kv(c, 'Opdrachtgever', meta.client || '-');
  kv(c, 'Locatie', meta.location || '-'); kv(c, 'Kenmerk / versie', `${input.reference || '-'} / ${input.version} (${input.status})`);
  kv(c, 'Adviseur / controle', `${input.advisor || '-'} / ${input.checker || '-'}`); kv(c, 'Datum', reportDate(meta.date));

  // 2 Uitgangspunten
  chapter('Uitgangspunten');
  bullets(GENERAL.basis(input));
  if (input.structure.trim()) { sub('Bouwwerk en belastingen'); paragraph(c, input.structure.trim()); }

  // 3 Grondonderzoek
  chapter('Grondonderzoek');
  paragraph(c, GENERAL.investigation);
  sub('Sonderingen');
  cptTable(c, s.cpts);
  sub('Situatietekening');
  c.reserve(160);
  const size = Math.min(CONTENT_W, 165);
  drawSituationPdf(doc, s.cpts, M.left + (CONTENT_W - size) / 2, c.y, size);
  c.y += size + 4;
  paragraph(c, 'Driehoek: sondering; dkl: bovenkant draagkrachtige laag (indicatief). Coördinaten in RD.', { italic: true, size: 7.5 });

  // 4 Bodemopbouw
  chapter('Bodemopbouw');
  paragraph(c, GENERAL.bearing(input));
  if (s.bearing) paragraph(c, `De bovenkant van de draagkrachtige laag ligt tussen NAP ${fmt(s.bearing.highest)} m en NAP ${fmt(s.bearing.lowest)} m (gemiddeld NAP ${fmt(s.bearing.mean)} m; gevonden in ${s.bearing.found} van ${s.cpts.length} sonderingen). Het verschil tussen hoogste en laagste niveau is ${fmt(s.bearing.highest - s.bearing.lowest)} m.`);
  else paragraph(c, 'In de sonderingen is met dit criterium geen draagkrachtige laag gevonden. Beoordeel de opbouw per sondering.');
  if (input.soilModel3d !== false) soilModelSection(c, sub, input, ctx, s);
  for (const cpt of s.cpts) {
    sub(`Sondering ${cpt.id}`);
    if (cpt.groundNap === null) { paragraph(c, 'Maaiveldhoogte onbekend; niveaus niet in NAP te geven.'); continue; }
    table(c, [{ label: 'Van [m NAP]', width: 16, align: 'right' }, { label: 'Tot [m NAP]', width: 16, align: 'right' }, { label: 'Grondsoort (indicatief)', width: 50 }],
      mergeLayers(cpt).map((l) => [fmt(cpt.groundNap! - l.top), fmt(cpt.groundNap! - l.bottom), l.name]), { size: 7 });
  }

  // 5 Verticaal draagvermogen
  if (s.vertical.length) {
    chapter('Funderingsadvies: palen op druk');
    for (const v of s.vertical) {
      sub(v.name);
      kv(c, 'Paalsysteem', `${v.pileType}, ${v.isCircular ? 'Ø' : '□'}${v.sizeMm} mm${v.extension ? `, ${v.extension}` : ''}`);
      kv(c, 'Norm', v.standard);
      kv(c, 'Paalkop / paalpunt', `NAP ${fmt(v.topNap)} m / NAP ${fmt(v.toeNap)} m (sondering ${v.cptId ?? '-'})`);
      if (v.ok) {
        kv(c, 'Netto draagvermogen', `Rc;net;d = ${nl(v.rcNetD, 0)} kN (negatieve kleef Fnk;d = ${nl(v.fnkD, 0)} kN)`);
        if (v.nEd > 0) kv(c, 'Toets', `NEd = ${nl(v.nEd, 0)} kN, u.c. = ${nl(v.uc, 2)}: ${v.uc <= 1 ? 'voldoet' : 'voldoet niet'}`);
      } else paragraph(c, `Niet berekend: ${v.error}`);
      if (v.choices.length && v.target) {
        paragraph(c, `Paalpuntniveau per maat waarop Rc;net;d >= ${nl(v.target.minKn, 0)} kN wordt gehaald (hoogste niveau per sondering) en de spreiding over de sonderingen:`);
        table(c, [{ label: 'Maat [mm]', width: 14 }, { label: 'Hoogste [m NAP]', width: 18, align: 'right' }, { label: 'Laagste [m NAP]', width: 18, align: 'right' }, { label: 'Spreiding [m]', width: 16, align: 'right' }, { label: 'Gehaald', width: 12, align: 'right' }],
          v.choices.map((ch) => [String(ch.sizeMm), ch.highestNap === null ? '-' : fmt(ch.highestNap), ch.lowestNap === null ? '-' : fmt(ch.lowestNap), ch.spreadM === null ? '-' : fmt(ch.spreadM), `${ch.reached}/${v.tableCpts.length}`]), { size: 7 });
      }
    }
    sub('Paalsysteem');
    const seen = new Set<string>();
    for (const v of s.vertical) {
      const t = systemTexts((ctx.calculations?.find((x) => x.id === v.id)?.input as PileInput)?.pileTypeId ?? '', v.material, !!v.extension);
      if (seen.has(t.title)) continue; seen.add(t.title);
      paragraph(c, t.title, { size: 9 }); bullets(t.paragraphs);
    }
  }

  // 6 Horizontaal belaste palen
  if (s.lateral.length) {
    chapter('Horizontaal belaste palen');
    for (const l of s.lateral) {
      sub(l.name);
      kv(c, 'Paal', l.section); kv(c, 'Paalkop', `NAP ${fmt(l.headNap)} m`);
      if (l.maxDisplacementMm) kv(c, 'Grens kopverplaatsing', `${nl(l.maxDisplacementMm, 0)} mm`);
      table(c, [{ label: 'Paal', width: 22 }, { label: 'Aantal', width: 9, align: 'right' }, { label: 'H [kN]', width: 11, align: 'right' }, { label: 'M [kNm]', width: 11, align: 'right' },
        { label: 'L [m]', width: 10, align: 'right' }, { label: 'Maat [mm]', width: 12, align: 'right' }, { label: 'y kop [mm]', width: 12, align: 'right' }, { label: 'M max [kNm]', width: 13, align: 'right' }, { label: 'u.c.', width: 9, align: 'right' }, { label: 'Oordeel', width: 14 }],
      l.rows.map((r) => [r.name, String(r.count), nl(r.h, 0), nl(r.m, 0), nl(r.lengthM, 1), String(r.sizeMm), r.ok ? nl(r.yHeadMm, 1) : '-', r.ok ? nl(r.mMax, 0) : '-', r.uc === null ? '-' : nl(r.uc, 2), r.passes ? 'voldoet' : 'voldoet niet']), { size: 7 });
    }
  }

  // 7 Negatieve kleef en uitvoering
  chapter('Negatieve kleef en uitvoering');
  sub('Negatieve kleef'); paragraph(c, GENERAL.negativeFriction);
  sub('Aandachtspunten bij de uitvoering'); bullets(GENERAL.execution);

  // 8 Conclusies
  chapter('Conclusies en aanbevelingen');
  bullets(conclusions(s));
  if (input.remarks.trim()) paragraph(c, input.remarks.trim());
  sub('Geldigheid'); bullets(GENERAL.limits);

  // Bijlagen
  if (input.appendixCpts && s.cpts.length) {
    chapter('Bijlage A: sonderingen', false);
    s.cpts.forEach((cpt, i) => { if (i > 0) c.newPage(); toc.push({ label: `     Sondering ${cpt.id}`, page: c.pageNo, level: 2 }); drawCptPage(c, ctx.cpts.get(cpt.id)!, cpt, input); });
  }
  if (input.appendixCalcs && (s.vertical.length || s.lateral.length)) {
    chapter('Bijlage B: berekeningen', false);
    paragraph(c, 'De rekenbladen van de opgenomen berekeningen volgen hierna, elk met de uitgangspunten, de tussenstappen en de uitkomst.');
    for (const v of s.vertical) {
      const calc = ctx.calculations?.find((x) => x.id === v.id); if (!calc) continue;
      const pin = calc.input as PileInput, cpt = pin.cptId ? ctx.cpts.get(pin.cptId) : undefined, r = computePile(pin, cpt ?? null);
      if (!r.ok) continue;
      if (cpt) { c.newPage(); toc.push({ label: `     ${v.name}`, page: c.pageNo, level: 2 }); renderSonderingChart({ doc, startY: HEADER_BOTTOM, name: v.name, input: pin, result: r, cpt }); }
      const type = resolvePileType(pin);
      renderBerekeningBlad(c, { name: v.name, input: pin, result: r, cpt }, { alphaP: type?.alphaP ?? 0.7, alphaS: type?.alphaS ?? 0.008, alphaT: type?.alphaT ?? 0.006 });
      c.continuationTitle = undefined;
    }
    for (const l of s.lateral) {
      const calc = ctx.calculations?.find((x) => x.id === l.id); if (!calc) continue;
      const lin = calc.input as LateralInput, r = computeLateral(lin);
      if (!r.ok) continue;
      c.newPage(); toc.push({ label: `     ${l.name}`, page: c.pageNo, level: 2 });
      renderCalc(c, lin, r, l.name);
    }
  }

  // Inhoudsopgave terugschrijven op blad 2.
  doc.setPage(tocPage);
  let y = HEADER_BOTTOM + 6;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text('Inhoud', M.left, y); y += 9;
  for (const e of toc) {
    if (y > 280) break;
    doc.setFont('helvetica', e.level === 1 ? 'bold' : 'normal'); doc.setFontSize(e.level === 1 ? 9.5 : 8.5);
    const x = M.left + (e.level === 1 ? 0 : 6), text = winAnsi(e.label.trim());
    doc.text(text, x, y);
    const w = doc.getTextWidth(text), right = M.left + CONTENT_W;
    doc.setDrawColor(190); doc.setLineDashPattern([0.4, 1], 0); doc.line(x + w + 2, y - 0.6, right - 8, y - 0.6); doc.setLineDashPattern([], 0);
    doc.text(String(e.page), right, y, { align: 'right' });
    y += e.level === 1 ? 6.5 : 5;
  }
  if (typeof doc.putTotalPages === 'function') doc.putTotalPages(TOTAL_PAGES_TOKEN);
  return new Uint8Array(doc.output('arraybuffer'));
}

function cptTable(c: Cursor, cpts: CptSummary[]) {
  table(c, [{ label: 'Sondering', width: 18 }, { label: 'X [m]', width: 14, align: 'right' }, { label: 'Y [m]', width: 14, align: 'right' }, { label: 'Maaiveld [m NAP]', width: 16, align: 'right' },
    { label: 'Einde [m NAP]', width: 15, align: 'right' }, { label: 'qc max [MPa]', width: 13, align: 'right' }, { label: 'Dkl [m NAP]', width: 14, align: 'right' }],
  cpts.map((s) => [s.id, s.x === undefined ? '-' : nl(s.x, 1), s.y === undefined ? '-' : nl(s.y, 1), s.groundNap === null ? '-' : fmt(s.groundNap), s.endNap === null ? '-' : fmt(s.endNap), nl(s.maxQc, 1), s.bearingTopNap === null ? '-' : fmt(s.bearingTopNap)]), { size: 7 });
}

/** Aaneengesloten lagen met dezelfde grondsoort samenvoegen. */
function mergeLayers(cpt: CptSummary) {
  const out: Array<{ top: number; bottom: number; name: string }> = [];
  for (const l of cpt.layers) {
    const last = out[out.length - 1];
    if (last && last.name === l.zone_name && Math.abs(last.bottom - l.depth_top) < 1e-6) last.bottom = l.depth_bottom;
    else out.push({ top: l.depth_top, bottom: l.depth_bottom, name: l.zone_name });
  }
  return out;
}

function conclusions(s: AdviceSummary): string[] {
  const out: string[] = [];
  if (s.bearing) out.push(`De draagkrachtige laag ligt indicatief tussen NAP ${fmt(s.bearing.highest)} m en NAP ${fmt(s.bearing.lowest)} m.`);
  for (const v of s.vertical) {
    if (!v.ok) { out.push(`${v.name}: niet berekend (${v.error}).`); continue; }
    out.push(`${v.name}: ${v.pileType} ${v.isCircular ? 'Ø' : '□'}${v.sizeMm} mm met de punt op NAP ${fmt(v.toeNap)} m geeft Rc;net;d = ${nl(v.rcNetD, 0)} kN${v.nEd > 0 ? ` (u.c. ${nl(v.uc, 2)}, ${v.uc <= 1 ? 'voldoet' : 'voldoet niet'})` : ''}.`);
    const best = v.choices.filter((ch) => ch.reached === v.tableCpts.length && ch.spreadM !== null).sort((a, b) => a.spreadM! - b.spreadM!)[0];
    if (best) out.push(`Uit de draagvermogentabel: maat ${best.sizeMm} mm haalt de zoekband op alle sonderingen met puntniveaus tussen NAP ${fmt(best.highestNap!)} m en NAP ${fmt(best.lowestNap!)} m.`);
  }
  for (const l of s.lateral) {
    const pass = l.rows.filter((r) => r.passes).length;
    out.push(`${l.name}: ${pass} van ${l.rows.length} paaltypen voldoen aan de horizontale belasting${pass < l.rows.length ? '; de overige vragen een grotere maat of een andere opzet' : ''}.`);
  }
  if (!out.length) out.push('Er zijn geen paalberekeningen opgenomen; dit advies beschrijft alleen het grondonderzoek en de bodemopbouw.');
  return out;
}

/** Eenvoudig sonderingsblad: qc en Rf tegen NAP, laagkleuren en de draagkrachtige laag. */
function drawCptPage(c: Cursor, cpt: import('../../../types/cpt').Cpt, sum: CptSummary, input: AdviceInput) {
  const doc = c.doc, top = c.y + 2, H = 215, x0 = M.left + 16, wQc = 105, wRf = 40, gap = 6, strip = 8;
  const ground = sum.groundNap ?? 0, end = sum.endDepthM || 1, y = (d: number) => top + H * d / end;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text(winAnsi(`Sondering ${cpt.id}`), M.left, c.y - 2);
  // Laagstrook
  for (const l of sum.layers) { const rgb = hex(l.zone_color); doc.setFillColor(rgb[0], rgb[1], rgb[2]); doc.rect(M.left, y(l.depth_top), strip, Math.max(0.2, y(l.depth_bottom) - y(l.depth_top)), 'F'); }
  doc.setDrawColor(120); doc.setLineWidth(0.2); doc.rect(x0, top, wQc, H); doc.rect(x0 + wQc + gap, top, wRf, H);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(90);
  const step = end > 20 ? 2 : 1;
  for (let d = 0; d <= end + 1e-9; d += step) { doc.setDrawColor(225); doc.line(x0, y(d), x0 + wQc, y(d)); doc.line(x0 + wQc + gap, y(d), x0 + wQc + gap + wRf, y(d)); doc.text(fmt(ground - d, 1), x0 - 1.5, y(d) + 1, { align: 'right' }); }
  for (let q = 0; q <= 30; q += 5) { const x = x0 + wQc * q / 30; doc.setDrawColor(225); doc.line(x, top, x, top + H); doc.text(String(q), x, top + H + 3.5, { align: 'center' }); }
  for (let r = 0; r <= 10; r += 2) { const x = x0 + wQc + gap + wRf * r / 10; doc.line(x, top, x, top + H); doc.text(String(r), x, top + H + 3.5, { align: 'center' }); }
  doc.text('qc [MPa]', x0 + wQc / 2, top + H + 7.5, { align: 'center' }); doc.text('Rf [%]', x0 + wQc + gap + wRf / 2, top + H + 7.5, { align: 'center' }); doc.text('m NAP', M.left, top - 1.5);
  doc.setTextColor(0);
  const pts = cpt.points.filter((p) => Number.isFinite(p.depth)).sort((a, b) => a.depth - b.depth);
  doc.setDrawColor(200, 90, 20); doc.setLineWidth(0.3);
  for (let k = 1; k < pts.length; k++) { const a = pts[k - 1], b = pts[k]; if (a.qc === undefined || b.qc === undefined) continue; doc.line(x0 + wQc * Math.min(a.qc, 30) / 30, y(a.depth), x0 + wQc * Math.min(b.qc, 30) / 30, y(b.depth)); }
  doc.setDrawColor(40, 90, 200);
  for (let k = 1; k < pts.length; k++) { const a = pts[k - 1], b = pts[k]; if (a.rf === undefined || b.rf === undefined) continue; doc.line(x0 + wQc + gap + wRf * Math.min(a.rf, 10) / 10, y(a.depth), x0 + wQc + gap + wRf * Math.min(b.rf, 10) / 10, y(b.depth)); }
  if (sum.bearingTopNap !== null) {
    const d = ground - sum.bearingTopNap; doc.setDrawColor(21, 128, 61); doc.setLineWidth(0.5); doc.setLineDashPattern([2, 1], 0);
    doc.line(x0, y(d), x0 + wQc, y(d)); doc.setLineDashPattern([], 0);
    doc.setFontSize(7); doc.setTextColor(21, 128, 61); doc.text(winAnsi(`draagkrachtige laag NAP ${fmt(sum.bearingTopNap)} m (qc >= ${fmt(input.bearingQcMpa, 0)} MPa over ${fmt(input.bearingMinThicknessM, 1)} m)`), x0 + 2, y(d) - 1); doc.setTextColor(0);
  }
  c.y = top + H + 12;
}

function hex(color: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return [200, 200, 200];
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** Het grondmodel in twee aanzichten: geheel en opengesneden tot het midden. */
function soilModelSection(c: Cursor, sub: (t: string) => void, input: AdviceInput, ctx: ProjectContext, s: AdviceSummary) {
  const images = soilModelImages(input, ctx, s);
  if (!images) return;
  const { doc } = c;
  sub('Ruimtelijk grondmodel');
  paragraph(c, `Uit de sonderingen is een ruimtelijk grondmodel afgeleid. Tussen de sonderingen is de grondsoort per cel van ${fmt(images.cell, 1)} m bepaald door inverse-afstandsweging: elke sondering die op dat niveau een laag heeft, telt mee met een gewicht dat kwadratisch afneemt met de afstand. Het model volgt alleen de sonderingen en is indicatief; tussen en buiten de sonderingen kan de opbouw afwijken. Verticale schaal ${images.exaggeration}× overdreven.`);
  const w = CONTENT_W, h = w * 0.58;
  for (const [img, caption] of [[images.whole, 'Figuur: grondmodel, gezien vanuit het zuidoosten.'], [images.cut, 'Figuur: grondmodel opengesneden tot het midden, met de sonderingen, de conusweerstand (rood) en de bovenkant van de draagkrachtige laag (oranje vlak).']] as const) {
    c.reserve(h + 10);
    doc.addImage(img, 'JPEG', M.left, c.y, w, h);
    doc.setDrawColor(200); doc.setLineWidth(0.2); doc.rect(M.left, c.y, w, h);
    c.y += h + 2;
    paragraph(c, caption, { italic: true, size: 7.5 });
  }
  // Legenda met de grondsoorten in het model.
  c.reserve(10);
  doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(0);
  let x = M.left;
  for (const z of images.zones) {
    const info = zoneInfo(z); if (!info) continue;
    const label = winAnsi(info.name), tw = doc.getTextWidth(label) + 9;
    if (x + tw > M.left + CONTENT_W) { x = M.left; c.y += 5; c.reserve(6); }
    doc.setFillColor(...hex(info.color)); doc.rect(x, c.y - 2.6, 3.2, 3.2, 'F');
    doc.text(label, x + 4.4, c.y); x += tw;
  }
  c.y += 6;
}

let imageCache: { key: string; value: ReturnType<typeof renderImages> } | null = null;

function soilModelImages(input: AdviceInput, ctx: ProjectContext, s: AdviceSummary) {
  const cpts = s.cpts.map((x) => ctx.cpts.get(x.id)).filter((x): x is NonNullable<typeof x> => !!x);
  if (!cpts.length) return null;
  const view = useSoil3DStore.getState();
  const toes = pileToes((ctx.calculations ?? []).filter((x) => !input.calcIds || input.calcIds.includes(x.id)));
  const key = JSON.stringify([cpts.map((x) => [x.id, x.points.length, x.metadata.ground_level_nap]), input.bearingQcMpa, input.bearingMinThicknessM, view.exaggeration, view.hiddenZones, view.cptDiameter, toes]);
  if (imageCache?.key !== key) imageCache = { key, value: renderImages(cpts, input, toes, view.exaggeration, view.hiddenZones, view.cptDiameter) };
  return imageCache.value;
}

function renderImages(cpts: import('../../../types/cpt').Cpt[], input: AdviceInput, toes: ReturnType<typeof pileToes>, exaggeration: number, hiddenZones: number[], cptDiameter: number | null) {
  const model = buildSoilModel(cpts, { bearingQcMpa: input.bearingQcMpa, bearingMinThicknessM: input.bearingMinThicknessM });
  const base = { ...DEFAULT_SOIL3D, exaggeration, hiddenZones, cptDiameter, opacity: 1 };
  const whole = renderSoilModelImage(model, { ...base, showQc: false, showBearing: false, showPileToes: false }, toes);
  const g = model.grid, half = g.east0 + (g.nx * g.dx) / 2;
  const cut = renderSoilModelImage(model, base, toes, 1600, 1000, { e0: -1e5, e1: half, n0: -1e5, n1: 1e5, z0: -1e4, z1: 1e4 });
  if (!whole || !cut) return null;
  return { whole, cut, exaggeration, cell: model.grid.dx, zones: model.zonesPresent.filter((z) => !hiddenZones.includes(z)) };
}
