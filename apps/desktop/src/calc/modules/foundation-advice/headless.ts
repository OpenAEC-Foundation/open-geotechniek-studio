// Funderingsadvies zonder schermen; gedeeld door de app (module.tsx) en de headless rekenkern.
import type { HeadlessCalcModule } from '../../framework/types';
import { adviceSummary, type AdviceSummary } from './analysis';
import { buildAdviceReport } from './report';
import { ct } from '../../i18n';
import { DEFAULT_ADVICE, type AdviceInput } from './types';

export const adviceHeadless: HeadlessCalcModule<AdviceInput, AdviceSummary> = {
  id: 'foundation-advice', name: 'Funderingsadvies', subtitle: 'Rapport met grondonderzoek, situatie, paaladvies en bijlagen',
  category: 'report', icon: '📄', norm: 'NEN 9997-1', status: 'experimental', visualLabel: 'Situatie',
  defaultInput: () => ({ ...DEFAULT_ADVICE }),
  compute: (input, ctx) => adviceSummary(input, ctx),
  buildReport: (input, _r, ctx) => buildAdviceReport(input, ctx),
  reportFileName: (input) => `funderingsadvies-${input.reference || new Date().toISOString().slice(0, 10)}`,
  statusLine: (s) => {
    const n = s.vertical.length + s.lateral.length, c = s.cpts.length;
    const cpts = c === 1 ? ct('calcAdvice', 'statusLine.cptOne', '{{count}} sondering', { count: c }) : ct('calcAdvice', 'statusLine.cptMany', '{{count}} sonderingen', { count: c });
    const calcs = n === 1 ? ct('calcAdvice', 'statusLine.calcOne', '{{count}} berekening', { count: n }) : ct('calcAdvice', 'statusLine.calcMany', '{{count}} berekeningen', { count: n });
    return { text: `${cpts} · ${calcs}`, ok: true, pending: true };
  },
};
