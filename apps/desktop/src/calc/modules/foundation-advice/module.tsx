// Funderingsadvies: bundelt het grondonderzoek en alle paalberekeningen van
// het project tot één rapport met voorblad, inhoudsopgave, vaste hoofdstukken,
// situatietekening en bijlagen.
import type { CalcModule, PanelProps } from '../../framework/types';
import { catalogText } from '../pile-bearing-capacity/catalog';
import { useCalculationsStore } from '../../framework/store';
import { useCptStore } from '../../../store/useCptStore';
import { Hint, NumberInput, Row, Section } from '../../framework/views/SheetForm';
import { adviceSummary, type AdviceSummary } from './analysis';
import { situationLayout } from './situation';
import { buildAdviceReport } from './report';
import { useTranslation } from 'react-i18next';
import { ct, fmtNumber } from '../../i18n';
import { DEFAULT_ADVICE, type AdviceInput } from './types';
import './advice.css';

type Props = PanelProps<AdviceInput, AdviceSummary>;

/** Getal in de notatie van de actieve taal; '-' als het geen getal is. */
const fmt = (v: number, d = 2) => (Number.isFinite(v) ? fmtNumber(v, d) : '-');

function useProject() {
  const cpts = useCptStore((s) => s.cpts), docId = useCptStore((s) => s.activeDocId);
  const calcs = useCalculationsStore((s) => (docId ? s.byDoc.get(docId) : undefined)) ?? [];
  return { cpts, calcs: calcs.filter((c) => c.moduleId !== 'foundation-advice') };
}

function InputPanel({ input: i, onChange }: Props) {
  const { t } = useTranslation('calcAdvice');
  const set = (patch: Partial<AdviceInput>) => onChange?.({ ...i, ...patch });
  const { cpts, calcs } = useProject();
  const text = (key: keyof AdviceInput, label: string) => <Row label={label}><input aria-label={label} value={String(i[key] ?? '')} onChange={(e) => set({ [key]: e.target.value } as Partial<AdviceInput>)} /></Row>;
  const toggle = (list: string[] | undefined, all: string[], id: string, on: boolean) => { const cur = list ?? all; const next = on ? [...new Set([...cur, id])] : cur.filter((x) => x !== id); return next.length === all.length ? undefined : next; };
  const cptIds = [...cpts.keys()], calcIds = calcs.map((c) => c.id);
  return <div className="advice-input">
    <Section title={t('input.document', 'Document')}>
      {text('reference', t('input.reference', 'Kenmerk'))}
      {text('version', t('input.version', 'Versie'))}
      <Row label={t('input.status', 'Status')}><select aria-label={t('input.status', 'Status')} value={i.status} onChange={(e) => set({ status: e.target.value as AdviceInput['status'] })}><option value="concept">{t('status.concept', 'Concept')}</option><option value="definitief">{t('status.definitief', 'Definitief')}</option></select></Row>
      {text('advisor', t('input.advisor', 'Adviseur'))}
      {text('checker', t('input.checker', 'Controle'))}
      <Hint>{t('input.projectHint', 'Projectnaam, -nummer, opdrachtgever en locatie komen uit de projectgegevens.')}</Hint>
    </Section>
    <Section title={t('input.basis', 'Uitgangspunten')}>
      <Row label={t('input.consequenceClass', 'Gevolgklasse')}><select aria-label={t('input.consequenceClass', 'Gevolgklasse')} value={i.consequenceClass} onChange={(e) => set({ consequenceClass: e.target.value as AdviceInput['consequenceClass'] })}><option>CC1</option><option>CC2</option><option>CC3</option></select></Row>
      <Row label={t('input.designLife', 'Ontwerplevensduur')} unit={t('input.years', 'jaar')}><NumberInput label={t('input.designLifeAria', 'Ontwerplevensduur [jaar]')} value={i.designLifeYears} onChange={(v) => set({ designLifeYears: v })} /></Row>
      <Row label={t('input.floorLevel', 'Peil (bovenkant vloer)')} unit="m NAP"><NumberInput label={t('input.floorLevelAria', 'Peil [m NAP]')} value={i.floorLevelNap} onChange={(v) => set({ floorLevelNap: v })} /></Row>
      <Row label={t('input.groundwater', 'Grondwater')} unit="m NAP"><NumberInput label={t('input.groundwaterAria', 'Grondwater ontwerp [m NAP]')} value={i.groundwaterNap} onChange={(v) => set({ groundwaterNap: v })} /></Row>
      <label className="advice-area">{t('input.structure', 'Bouwwerk en belastingen')}<textarea aria-label={t('input.structure', 'Bouwwerk en belastingen')} rows={3} value={i.structure} onChange={(e) => set({ structure: e.target.value })} placeholder={t('input.structurePlaceholder', 'Bijvoorbeeld: bedrijfshal van staal, 40 × 60 m, kolombelasting tot 600 kN')} /></label>
    </Section>
    <Section title={t('input.bearingLayer', 'Draagkrachtige laag (indicatief)')}>
      <Row label={t('input.qcMin', 'qc minimaal')} unit="MPa"><NumberInput label={t('input.qcMinAria', 'qc draagkrachtige laag [MPa]')} value={i.bearingQcMpa} onChange={(v) => set({ bearingQcMpa: v })} /></Row>
      <Row label={t('input.overAtLeast', 'Over minstens')} unit="m"><NumberInput label={t('input.minThicknessAria', 'Minimale dikte [m]')} value={i.bearingMinThicknessM} onChange={(v) => set({ bearingMinThicknessM: v })} /></Row>
    </Section>
    <Section title={t('input.include', 'Opnemen')}>
      <div className="advice-pick" aria-label={t('input.cptsInAdvice', 'Sonderingen in het advies')}>{cptIds.length ? cptIds.map((id) => <label key={id} className="cs-check"><input type="checkbox" checked={!i.cptIds || i.cptIds.includes(id)} onChange={(e) => set({ cptIds: toggle(i.cptIds, cptIds, id, e.target.checked) })} />{t('input.cptItem', 'Sondering {{id}}', { id })}</label>) : <Hint>{t('input.noCpts', 'Nog geen sonderingen in het project.')}</Hint>}</div>
      <div className="advice-pick" aria-label={t('input.calcsInAdvice', 'Berekeningen in het advies')}>{calcs.length ? calcs.map((c) => <label key={c.id} className="cs-check"><input type="checkbox" checked={!i.calcIds || i.calcIds.includes(c.id)} onChange={(e) => set({ calcIds: toggle(i.calcIds, calcIds, c.id, e.target.checked) })} />{c.name}</label>) : <Hint>{t('input.noCalcs', 'Nog geen paalberekeningen in het project.')}</Hint>}</div>
      <label className="cs-check"><input type="checkbox" checked={i.appendixCpts} onChange={(e) => set({ appendixCpts: e.target.checked })} /> {t('input.appendixCpts', 'Bijlage sonderingen')}</label>
      <label className="cs-check"><input type="checkbox" checked={i.appendixCalcs} onChange={(e) => set({ appendixCalcs: e.target.checked })} /> {t('input.appendixCalcs', 'Bijlage rekenbladen')}</label>
    </Section>
    <Section title={t('input.ownText', 'Eigen tekst')}>
      <label className="advice-area">{t('input.introNote', 'Aanvulling inleiding')}<textarea aria-label={t('input.introNote', 'Aanvulling inleiding')} rows={3} value={i.introNote} onChange={(e) => set({ introNote: e.target.value })} /></label>
      <label className="advice-area">{t('input.remarks', 'Opmerkingen bij de conclusie')}<textarea aria-label={t('input.remarks', 'Opmerkingen bij de conclusie')} rows={3} value={i.remarks} onChange={(e) => set({ remarks: e.target.value })} /></label>
    </Section>
  </div>;
}

/** Situatietekening en de draagkrachtige laag per sondering. */
function VisualPanel({ result: s }: Props) {
  const { t } = useTranslation('calcAdvice');
  const size = 420, L = situationLayout(s.cpts, size);
  return <div className="advice-visual">
    <svg viewBox={`-10 -10 ${size + 20} ${size + 20}`} role="img" aria-label={t('visual.aria', 'Situatietekening met sonderingen')}>
      <rect x="0" y="0" width={size} height={size} className="advice-frame" />
      {L.grid.map((g) => { const gx = (g - L.minX) / L.span * size, gy = size - (g - L.minY) / L.span * size; return <g key={g}>
        {gx > 0 && gx < size && <><line x1={gx} x2={gx} y1="0" y2={size} className="advice-grid" /><text x={gx + 2} y={size - 3} className="advice-gridlabel">X {Math.round(g)}</text></>}
        {gy > 0 && gy < size && <><line x1="0" x2={size} y1={gy} y2={gy} className="advice-grid" /><text x="3" y={gy - 2} className="advice-gridlabel">Y {Math.round(g)}</text></>}
      </g>; })}
      {L.points.map((p) => <g key={p.id} className="advice-cpt">
        <polygon points={`${p.px},${p.py - 6} ${p.px - 5.4},${p.py + 3.6} ${p.px + 5.4},${p.py + 3.6}`} />
        <text x={p.px + 8} y={p.py - 1} className="advice-cptlabel">{p.id}</text>
        {p.bearingTopNap !== null && <text x={p.px + 8} y={p.py + 9} className="advice-gridlabel">{t('visual.bearingTop', 'dkl NAP {{value}}', { value: fmt(p.bearingTopNap, 1) })}</text>}
      </g>)}
      <g transform={`translate(${size - 24},30)`}><polygon points="0,-20 -8,6 8,6" className="advice-north" /><text x="0" y="-24" textAnchor="middle" className="advice-cptlabel">N</text></g>
      <g transform={`translate(14,${size - 18})`}><rect width={L.bar.units / 2} height="4" className="advice-north" /><rect x={L.bar.units / 2} width={L.bar.units / 2} height="4" className="advice-bar" />
        <text x="0" y="-3" className="advice-gridlabel">0</text><text x={L.bar.units} y="-3" textAnchor="middle" className="advice-gridlabel">{L.bar.m} m</text></g>
    </svg>
    {L.missing.length > 0 && <p className="cs-hint cs-hint--warn">{t('visual.missing', 'Zonder coördinaten (niet getekend): {{ids}}.', { ids: L.missing.join(', ') })}</p>}
    <p className="cs-hint">{t('visual.legend', 'Driehoek: sondering; dkl = bovenkant draagkrachtige laag (indicatief). Op schaal, coördinaten in RD.')}</p>
  </div>;
}

/** De opbouw van het advies, als uitdraai op papier. */
function ResultPanel({ input: i, result: s }: Props) {
  const { t } = useTranslation('calcAdvice');
  return <div className="pile-result advice-sheet">
    <header className="pile-sheet-title"><h2>{t('result.title', 'Funderingsadvies')}</h2><p>{t('result.header', '{{reference}} · versie {{version}} · {{status}}', { reference: i.reference || t('result.noReference', 'zonder kenmerk'), version: i.version, status: i.status === 'definitief' ? t('status.definitiefLower', 'definitief') : t('status.conceptLower', 'concept') })}</p></header>
    <section><h3>{t('result.toc.title', 'Inhoud van het rapport')}</h3>
      <ol className="advice-toc">
        <li>{t('result.toc.intro', 'Inleiding: aanleiding, doel en projectgegevens')}</li><li>{t('result.toc.basis', 'Uitgangspunten')}</li>
        <li>{t('result.toc.investigation', 'Grondonderzoek: {{count}} sonderingen met situatietekening', { count: s.cpts.length })}</li><li>{t('result.toc.soil', 'Bodemopbouw en draagkrachtige laag')}</li>
        {s.vertical.length > 0 && <li>{t('result.toc.vertical', 'Palen op druk: {{names}}', { names: s.vertical.map((v) => v.name).join(', ') })}</li>}
        {s.lateral.length > 0 && <li>{t('result.toc.lateral', 'Horizontaal belaste palen: {{names}}', { names: s.lateral.map((l) => l.name).join(', ') })}</li>}
        <li>{t('result.toc.execution', 'Negatieve kleef en uitvoering')}</li><li>{t('result.toc.conclusions', 'Conclusies en aanbevelingen')}</li>
        {i.appendixCpts && <li>{t('result.toc.appendixCpts', 'Bijlage A: sonderingen')}</li>}{i.appendixCalcs && (s.vertical.length + s.lateral.length > 0) && <li>{t('result.toc.appendixCalcs', 'Bijlage B: rekenbladen')}</li>}
      </ol>
    </section>
    <section><h3>{t('result.bearing.title', 'Draagkrachtige laag')}</h3>
      <p>{t('result.bearing.text', 'Als draagkrachtige laag is indicatief aangehouden: het eerste traject waarin de conusweerstand over minstens {{thickness}} m boven {{qc}} MPa blijft. Dit is een hulpmiddel voor het overzicht; het puntniveau volgt uit de draagvermogenberekening.', { thickness: fmt(i.bearingMinThicknessM, 1), qc: fmt(i.bearingQcMpa, 0) })}</p>
      <table className="pile-sheet-checks" aria-label={t('result.bearing.tableAria', 'Draagkrachtige laag per sondering')}><thead><tr><th>{t('result.bearing.cpt', 'Sondering')}</th><th>{t('result.bearing.ground', 'Maaiveld [m NAP]')}</th><th>{t('result.bearing.end', 'Einde [m NAP]')}</th><th>qc max [MPa]</th><th>{t('result.bearing.top', 'Dkl [m NAP]')}</th></tr></thead>
        <tbody>{s.cpts.map((c) => <tr key={c.id}><td>{c.id}</td><td className="num">{c.groundNap === null ? '—' : fmt(c.groundNap)}</td><td className="num">{c.endNap === null ? '—' : fmt(c.endNap)}</td><td className="num">{fmt(c.maxQc, 1)}</td><td className="num">{c.bearingTopNap === null ? t('result.bearing.notFound', 'niet gevonden') : fmt(c.bearingTopNap)}</td></tr>)}</tbody></table>
      {s.bearing && <p className="pile-sheet-conclusion">{t('result.bearing.conclusion', 'Bovenkant draagkrachtige laag tussen NAP {{highest}} m en NAP {{lowest}} m; spreiding {{spread}} m.', { highest: fmt(s.bearing.highest), lowest: fmt(s.bearing.lowest), spread: fmt(s.bearing.highest - s.bearing.lowest) })}</p>}
    </section>
    <section><h3>{t('result.calcs.title', 'Berekeningen in het advies')}</h3>
      {s.vertical.length + s.lateral.length === 0 ? <p>{t('result.calcs.none', 'Nog geen paalberekeningen opgenomen.')}</p> : <ul>
        {s.vertical.map((v) => <li key={v.id}>{t('result.calcs.vertical', '{{name}}: {{pileType}}, {{shape}}{{size}} mm, punt NAP {{toe}} m', { name: v.name, pileType: catalogText(v.pileType), shape: v.isCircular ? 'Ø' : '□', size: v.sizeMm, toe: fmt(v.toeNap) })}{v.ok ? `, Rc;net;d ${fmt(v.rcNetD, 0)} kN` : ` ${t('result.calcs.notComputed', '(niet berekend)')}`}</li>)}
        {s.lateral.map((l) => <li key={l.id}>{t('result.calcs.lateral', '{{name}}: {{count}} palen, {{passing}} voldoen', { name: l.name, count: l.rows.length, passing: l.rows.filter((r) => r.passes).length })}</li>)}
      </ul>}
    </section>
  </div>;
}

const adviceModule: CalcModule<AdviceInput, AdviceSummary> = {
  id: 'foundation-advice', name: 'Funderingsadvies', subtitle: 'Rapport met grondonderzoek, situatie, paaladvies en bijlagen',
  category: 'report', icon: '📄', norm: 'NEN 9997-1', status: 'experimental', visualLabel: 'Situatie',
  defaultInput: () => ({ ...DEFAULT_ADVICE }),
  compute: (input, ctx) => adviceSummary(input, ctx),
  InputPanel, VisualPanel, ResultPanel,
  buildReport: (input, _r, ctx) => buildAdviceReport(input, ctx),
  reportFileName: (input) => `funderingsadvies-${input.reference || new Date().toISOString().slice(0, 10)}`,
  statusLine: (s) => {
    const n = s.vertical.length + s.lateral.length, c = s.cpts.length;
    const cpts = c === 1 ? ct('calcAdvice', 'statusLine.cptOne', '{{count}} sondering', { count: c }) : ct('calcAdvice', 'statusLine.cptMany', '{{count}} sonderingen', { count: c });
    const calcs = n === 1 ? ct('calcAdvice', 'statusLine.calcOne', '{{count}} berekening', { count: n }) : ct('calcAdvice', 'statusLine.calcMany', '{{count}} berekeningen', { count: n });
    return { text: `${cpts} · ${calcs}`, ok: true, pending: true };
  },
};
export const foundationAdviceModule = adviceModule as unknown as CalcModule;
