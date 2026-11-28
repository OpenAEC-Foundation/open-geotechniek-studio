// Horizontale paalbelasting zonder schermen: invoer, rekenen, toetsen en rapport.
// De app (module.tsx) en de headless rekenkern (packages/core) delen dit object.
import type { HeadlessCalcModule } from '../../framework/types';
import { computeLateral, lateralExample, type LateralInput, type LateralResult } from './compute';
import { lateralSummary } from './lateral-summary';
import { buildLateralReport, lateralReportFileName } from './report-pdf';
import { ct, numberLocale } from '../../i18n';

const f = (v: number, n = 2) => Number.isFinite(v) ? v.toLocaleString(numberLocale(), { maximumFractionDigits: n }) : '—';

export const lateralHeadless: HeadlessCalcModule<LateralInput, LateralResult> = {
  id: 'laterally-loaded-pile', name: 'Horizontale paalbelasting', subtitle: 'Grondveren, kopkracht, kopmoment en N–M-doorsnedetoets', category: 'pile', icon: '↔', visualLabel: 'Paal- en veermodel', wideVisual: true,
  norm: 'CUR166 initiële bedding · Georgiadis-laagcorrectie · projectveerwet', status: 'experimental',
  defaultInput: () => structuredClone(lateralExample), compute: (input) => computeLateral(input),
  // Statusregel: de maatgevende u.c. van de materiaaltoetsing met de naam van die toets.
  statusLine: r => {
    if (!r.ok) return { text: r.error, ok: false, pending: true };
    const m = r.material, g = m?.governing;
    if (m?.outside) return { text: ct('calcLateral', 'module.statusOutside', 'Valt buiten de materiaaltoetsing'), ok: false };
    if (m && g && m.ok !== null) return { text: `u.c. ${g.uc === Infinity ? '∞' : f(g.uc)} · ${ct('calcLateral', `material.rows.${g.id}`, g.label)}`, ok: m.ok };
    if (r.sectionUtilization !== null) return { text: `u.c. ${f(r.sectionUtilization)}`, ok: r.sectionUtilization <= 1 };
    return { text: ct('calcLateral', 'module.statusConcept', 'Concept · y {{y}} mm', { y: f(r.maxDisplacementMm) }), ok: false, pending: true };
  },
  buildReport: (input, r, ctx) => buildLateralReport(input, r, ctx), reportFileName: () => lateralReportFileName(),
  checks: (input, r) => {
    if (!r.ok) return [];
    const s = lateralSummary(input, r);
    return [
      { label: ct('calcLateral', 'module.checks.yHead', 'y kop'), value: `${f(s.yHeadMm)} mm` }, { label: 'M max', value: `${f(s.mEd)} kNm` }, { label: 'V max', value: `${f(Math.max(Math.abs(s.V.max.v), Math.abs(s.V.min.v)))} kN` },
      ...(s.uc !== null && r.capacity ? [{ label: ct('calcLateral', 'module.checks.section', 'doorsnede'), value: `MRd ${f(r.capacity.mRdKnM)} kNm`, uc: s.uc }] : []),
      ...(r.material?.governing && !r.material.outside ? [{ label: ct('calcLateral', 'module.checks.material', 'materiaal'), value: ct('calcLateral', `material.rows.${r.material.governing.id}`, r.material.governing.label), uc: r.material.governing.uc }] : [])];
  },
};
