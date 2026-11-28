// Pure summary and section text of a lateral pile, shared by the sheet, the chips, the advice and the PDF report (no React).
import type { LateralInput, LateralResult } from './compute';
import { extremes } from './diagram-math';
import { mobilisation } from './spring-visual';
import { numberLocale } from '../../i18n';
import { sheetProps } from './sheet-section';

type Ok = Extract<LateralResult, { ok: true }>;
export const n = (v: number, d = 1) => Number.isFinite(v) ? v.toLocaleString(numberLocale(), { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
export const KIND_LABEL: Record<string, string> = { 'concrete-square': 'Betonpaal, vierkant', 'concrete-round': 'Betonpaal, rond', 'steel-tube': 'Stalen buis, hol', 'filled-tube': 'Stalen buis, betongevuld', 'sheet-pile': 'Damwandprofiel' };

/** Samenvatting die de uitdraai, de chips en het PDF-rapport delen. */
export function lateralSummary(input: LateralInput, r: Ok) {
  const head = input.headNap ?? 0, s = r.beam.samples;
  const M = extremes(s, (p) => p.momentKnM), V = extremes(s, (p) => p.shearKn), y = extremes(s, (p) => p.yM * 1000), p = extremes(s, (q) => q.reactionKnM);
  const mob = r.springs.map((x) => ({ x, m: mobilisation(x) })).filter((v) => v.m !== null).sort((a, b) => b.m! - a.m!)[0];
  const mEd = Math.max(Math.abs(M.max.v), Math.abs(M.min.v));
  return {
    head, toe: head - input.lengthM, M, V, y, p, mEd,
    yHeadMm: r.beam.nodes[0].yM * 1000,
    mobilisation: mob ? { value: mob.m!, nap: head - mob.x.zM } : null,
    uc: r.sectionUtilization,
    // Materiaaltoetsing: hoogste u.c. van alle toetsen die meetellen, en het oordeel.
    material: r.material, ucGov: r.material?.governing?.uc ?? r.sectionUtilization,
  };
}

/** Profiel, staalsoort en rekenbreedte van een damwandprofiel; null als het profiel niet in de bibliotheek staat. */
export function sheetInfo(s: LateralInput['section']) {
  try { const p = sheetProps(s.sheet, s.steelEMpa); return { p, id: p.profile.id, grade: p.grade, single: s.sheet?.widthMode === 'single' }; } catch { return null; }
}

export function sectionText(s: LateralInput['section']): string {
  if (s.kind === 'sheet-pile') { const x = sheetInfo(s); return x ? `${KIND_LABEL[s.kind]} ${x.id}, ${x.grade}, ${x.single ? `losse plank ${n(x.p.widthM, 2)} m` : 'per m wand'}` : KIND_LABEL[s.kind]; }
  const size = s.kind === 'concrete-square' ? `□${s.diameterMm} mm` : `Ø${s.diameterMm} mm`;
  const bars = s.kind === 'steel-tube' || s.barCount < 1 ? '' : `, ${s.barCount}Ø${s.barDiameterMm} op ${s.coverToBarCentreMm} mm van de rand`;
  const wall = s.kind === 'steel-tube' || s.kind === 'filled-tube' ? `, wand ${s.wallMm} mm` : '';
  return `${KIND_LABEL[s.kind]} ${size}${wall}${bars}`;
}

