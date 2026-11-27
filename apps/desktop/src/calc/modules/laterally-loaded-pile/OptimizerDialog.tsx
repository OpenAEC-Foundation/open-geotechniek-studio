// Instelscherm en voortgang van de optimalisatie op gewicht.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '../../../components/Modal';
import { NumField } from '../../framework/views/SheetForm';
import { numberLocale } from '../../i18n';
import i18next from 'i18next';
import type { LateralInput } from './compute';
import type { SectionKind } from './section';
import { CONCRETE_CLASSES, STEEL_GRADES } from './materials';
import { SHEET_PILE_GRADES, sheetPileCatalog } from '../../library/sheetPiles';
import { BAR_SERIES, OPT_KINDS, WALL_SERIES, buildSpace, defaultSettings, recordOf, seriesOf, spaceSize, type GenerationPoint, type OptimizerProgress, type OptimizerResult, type OptimizerSettings } from './optimizer';
import { startOptimizer, type OptimizerRun } from './optimizer-client';
import { KIND_KEYS, newVariant, type LateralVariant } from './variants';

const n = (v: number, d = 0) => Number.isFinite(v) ? v.toLocaleString(numberLocale(), { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
const toggle = <T,>(list: T[], v: T) => list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

function Chips<T extends string | number>({ label, options, value, onChange, show }: { label: string; options: readonly T[]; value: T[]; onChange: (v: T[]) => void; show?: (v: T) => string }) {
  return <div className="lat-opt-chips" role="group" aria-label={label}><span>{label}</span>
    {options.map((o) => <button key={String(o)} type="button" aria-pressed={value.includes(o)} className={value.includes(o) ? 'is-on' : ''} onClick={() => onChange(toggle(value, o))}>{show ? show(o) : String(o).replace('.', ',')}</button>)}
  </div>;
}
const Field = ({ label, children }: { label: string; children: ReactNode }) => <label className="lat-opt-field"><span>{label}</span>{children}</label>;

/** Beste massa per generatie. */
export function HistoryChart({ history }: { history: GenerationPoint[] }) {
  const { t } = useTranslation('calcLateral');
  const pts = history.filter((h) => h.bestKg !== null) as Array<GenerationPoint & { bestKg: number }>;
  if (pts.length < 1) return null;
  const W = 320, H = 110, p = 34, gMax = Math.max(2, ...history.map((h) => h.generation));
  const lo = Math.min(...pts.map((h) => h.bestKg)), hi = Math.max(...pts.map((h) => h.bestKg)), span = hi - lo || Math.max(1, hi * .05);
  const x = (g: number) => p + (W - p - 8) * (g - 1) / (gMax - 1), y = (m: number) => 10 + (H - 30) * (1 - (m - lo) / span);
  return <svg className="lat-opt-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('optimizer.chartAria', 'Beste massa per generatie')}>
    <line x1={p} x2={W - 8} y1={H - 20} y2={H - 20} className="lat-opt-axis" /><line x1={p} x2={p} y1={8} y2={H - 20} className="lat-opt-axis" />
    <polyline points={pts.map((h) => `${x(h.generation)},${y(h.bestKg)}`).join(' ')} className="lat-opt-line" />
    {pts.map((h) => <circle key={h.generation} cx={x(h.generation)} cy={y(h.bestKg)} r="2" className="lat-opt-dot" />)}
    <text x={p - 3} y={y(hi) + 3} textAnchor="end">{n(hi)}</text><text x={p - 3} y={y(lo) + 3} textAnchor="end">{n(lo)}</text>
    <text x={W - 8} y={H - 6} textAnchor="end">{t('optimizer.generation', 'generatie')}</text><text x={p} y={H - 6} textAnchor="middle">1</text>
    <text x={p + 4} y={10}>kg</text>
  </svg>;
}

export function OptimizerDialog({ input, onChange, onClose, onShowVariants, forceMainThread }: { input: LateralInput; onChange: (next: LateralInput) => void; onClose: () => void; onShowVariants?: () => void; forceMainThread?: boolean }) {
  const { t } = useTranslation('calcLateral');
  const [st, setSt] = useState<OptimizerSettings>(() => ({ ...defaultSettings(input), ...input.variants?.optimizer?.settings }));
  const set = (patch: Partial<OptimizerSettings>) => setSt((s) => ({ ...s, ...patch }));
  const [progress, setProgress] = useState<OptimizerProgress | null>(null);
  const [result, setResult] = useState<OptimizerResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = useRef<OptimizerRun | null>(null), latest = useRef(input);
  latest.current = input;
  useEffect(() => () => run.current?.stop(), []);
  const size = useMemo(() => spaceSize(buildSpace(input, st)), [input, st]);
  const running = busy;
  const head = input.headNap ?? 0;
  const sizesOf = (k: SectionKind) => st.sizes[k] ?? [];
  const steelKinds = st.kinds.some((k) => k === 'steel-tube' || k === 'filled-tube'), concreteKinds = st.kinds.some((k) => k !== 'steel-tube' && k !== 'sheet-pile');
  const series = [...sheetPileCatalog(false)].flatMap(([maker, list]) => [...list.keys()].map((s) => `${maker}|${s}`));
  const walls = [...new Set([...WALL_SERIES, input.section.wallMm])].sort((a, b) => a - b), bars = [...new Set([...BAR_SERIES, input.section.barDiameterMm])].sort((a, b) => a - b);

  const start = () => {
    setResult(null); setError(null); setProgress(null); setBusy(true);
    const r = startOptimizer(input, st, setProgress, i18next.language, forceMainThread);
    run.current = r;
    r.result.then((res) => {
      setBusy(false); setResult(res);
      // De beste tien als varianten; eerdere uitkomsten van de optimalisatie gaan eruit.
      const base = latest.current, cfg = base.variants ?? { items: [] };
      const kept = cfg.items.filter((v) => v.origin !== 'optimizer');
      const added: LateralVariant[] = [];
      res.best.filter((c) => c.violation === 0).forEach((c, i) => added.push({ ...newVariant({ items: [...kept, ...added] }, c.design, undefined, 'optimizer'), name: t('optimizer.variantName', 'Opt. {{n}}', { n: i + 1 }) }));
      onChange({ ...base, variants: { ...cfg, maxDisplacementMm: cfg.maxDisplacementMm ?? st.maxDisplacementMm, items: [...kept, ...added], optimizer: recordOf(st, res) } });
    }, (e) => { setBusy(false); setError(e instanceof Error ? e.message : String(e)); });
  };
  const best = result?.best.filter((c) => c.violation === 0) ?? [];
  const reason = result ? t(`optimizer.reason.${result.reason}`, { generations: 'na het ingestelde aantal generaties', stall: 'geen verbetering meer', stopped: 'gestopt', exhausted: 'alle varianten doorgerekend' }[result.reason]) : '';

  return <Modal open onClose={onClose} title={t('optimizer.title', 'Optimaliseren op gewicht')} width={760} className="lat-variants-modal">
    <div className="lat-opt">
      <fieldset disabled={running}>
        <legend>{t('optimizer.goal', 'Doel')}</legend>
        <div className="lat-opt-row" role="radiogroup" aria-label={t('optimizer.goal', 'Doel')}>
          {(['total', 'steel'] as const).map((o) => <label key={o} className="cs-check"><input type="radio" name="lat-opt-goal" checked={st.objective === o} onChange={() => set({ objective: o })} /> {o === 'total' ? t('optimizer.goalTotal', 'Minimale massa per paal (staal + beton)') : t('optimizer.goalSteel', 'Minimaal staal per paal (buis of profiel + wapening)')}</label>)}
        </div>
        <p className="lat-opt-hint">{st.objective === 'total' ? t('optimizer.goalTotalHint', 'Doelgrootheid: kg per paal. Bij beton telt het netto betonvolume × 2400 kg/m³ mee, de wapening × 7850 kg/m³; beide staan apart in de tabel.') : t('optimizer.goalSteelHint', 'Doelgrootheid: kg staal per paal. Beton telt niet mee: een betonpaal scoort alleen op zijn wapening.')}</p>
      </fieldset>
      <fieldset disabled={running}>
        <legend>{t('optimizer.requirements', 'Eisen')}</legend>
        <p className="lat-opt-hint">{t('optimizer.allChecks', 'Alle toetsen u.c. ≤ 1 (N–M en materiaaltoetsing).')}</p>
        <div className="lat-opt-row">
          <Field label={t('table.limit', 'Grens kopverplaatsing [mm]')}><NumField aria-label={t('table.limit', 'Grens kopverplaatsing [mm]')} value={st.maxDisplacementMm ?? ''} placeholder={t('optimizer.noLimit', 'geen eis')} onChange={(e) => { const v = Number(e.target.value); set({ maxDisplacementMm: e.target.value !== '' && v > 0 ? v : undefined }); }} /></Field>
          <Field label={t('optimizer.toeHigh', 'Paalpunt hoogst [m NAP]')}><NumField aria-label={t('optimizer.toeHigh', 'Paalpunt hoogst [m NAP]')} value={st.toeHighNap} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v < head) set({ toeHighNap: v }); }} /></Field>
          <Field label={t('optimizer.toeLow', 'Paalpunt laagst [m NAP]')}><NumField aria-label={t('optimizer.toeLow', 'Paalpunt laagst [m NAP]')} value={st.toeLowNap} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v < head) set({ toeLowNap: v }); }} /></Field>
          <Field label={t('optimizer.toeStep', 'Stap [m]')}><NumField aria-label={t('optimizer.toeStep', 'Stap [m]')} value={st.toeStepM} onChange={(e) => { const v = Number(e.target.value); if (v > 0) set({ toeStepM: v }); }} /></Field>
        </div>
        <p className="lat-opt-hint">{t('optimizer.toeHint', 'Gelijke grenzen: vaste paalpunt. De grondlagen gaan mee met de paalpunt, zoals bij de invoer.')}</p>
      </fieldset>
      <fieldset disabled={running}>
        <legend>{t('optimizer.space', 'Zoekruimte')}</legend>
        <Chips label={t('optimizer.kinds', 'Paaltypen')} options={OPT_KINDS} value={st.kinds} onChange={(kinds) => set({ kinds })} show={(k) => t(`input.kinds.${KIND_KEYS[k][0]}`, KIND_KEYS[k][1])} />
        {st.kinds.filter((k) => k !== 'sheet-pile').map((k) => <Chips key={k} label={`${t(`input.kinds.${KIND_KEYS[k][0]}`, KIND_KEYS[k][1])} [mm]`} options={seriesOf(k)} value={sizesOf(k)} onChange={(v) => set({ sizes: { ...st.sizes, [k]: v } })} />)}
        {steelKinds && <><Chips label={t('optimizer.walls', 'Wand [mm]')} options={walls} value={st.wallsMm} onChange={(wallsMm) => set({ wallsMm })} />
          <Chips label={t('variants.steel', 'Staal')} options={STEEL_GRADES.map((g) => g.id)} value={st.steelGrades} onChange={(steelGrades) => set({ steelGrades })} /></>}
        {concreteKinds && <><Chips label={t('variants.concrete', 'Beton')} options={CONCRETE_CLASSES.map((c) => c.id)} value={st.concreteClasses} onChange={(concreteClasses) => set({ concreteClasses })} />
          <Chips label={t('optimizer.bars', 'Staaf Ø [mm]')} options={bars} value={st.barDiametersMm} onChange={(barDiametersMm) => set({ barDiametersMm })} /></>}
        {st.kinds.includes('sheet-pile') && <><Chips label={t('optimizer.sheetSeries', 'Damwandreeksen')} options={series} value={st.sheetSeries} onChange={(sheetSeries) => set({ sheetSeries })} show={(s) => s.replace('|', ' · ')} />
          <Chips label={t('optimizer.sheetGrades', 'Staal damwand')} options={SHEET_PILE_GRADES.map((g) => g.grade)} value={st.sheetGrades} onChange={(sheetGrades) => set({ sheetGrades })} /></>}
        <label className="cs-check"><input type="checkbox" checked={st.widthFollowsPile} onChange={(e) => set({ widthFollowsPile: e.target.checked })} /> {t('optimizer.widthFollows', 'Werkende breedte grondveren = paalbreedte')}</label>
        <p className="lat-opt-hint">{t('optimizer.spaceSize', 'Zoekruimte: {{total}} varianten. Aantal staven en de overige invoer blijven als in de huidige invoer.', { total: n(size) })}</p>
      </fieldset>
      <details className="lat-opt-algo"><summary>{t('optimizer.algorithm', 'Genetisch algoritme')}</summary>
        <fieldset disabled={running}><div className="lat-opt-row">
          {([['population', 'Populatie'], ['generations', 'Generaties'], ['stall', 'Stop na generaties zonder verbetering'], ['seed', 'Startwaarde (seed)'], ['mutation', 'Mutatiekans per gen'], ['elite', 'Elitisme (beste blijven)']] as const).map(([k, label]) =>
            <Field key={k} label={t(`optimizer.${k}`, label)}><NumField aria-label={t(`optimizer.${k}`, label)} value={st[k]} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= 0) set({ [k]: k === 'mutation' ? Math.min(1, v) : Math.round(v) } as Partial<OptimizerSettings>); }} /></Field>)}
        </div>
        <p className="lat-opt-hint">{t('optimizer.algoHint', 'Toernooiselectie, uniforme kruising, mutatie per gen; overschrijding van een eis telt als straf. Elke variant wordt één keer doorgerekend.')}</p></fieldset>
      </details>

      <div className="lat-opt-actions">
        {!running ? <button type="button" className="is-primary" disabled={size === 0} onClick={start}>{t('optimizer.start', 'Start')}</button>
          : <button type="button" onClick={() => run.current?.stop()}>{t('optimizer.stop', 'Stoppen')}</button>}
        {progress && <div className="lat-opt-progress" role="status">
          <progress max={progress.generations} value={progress.generation} />
          <span>{t('optimizer.progress', 'Generatie {{g}} van {{n}} · {{evaluated}} doorgerekend · beste {{best}}', { g: progress.generation, n: progress.generations, evaluated: progress.evaluated, best: progress.bestKg === null ? '—' : `${n(progress.bestKg)} kg` })}</span>
          {run.current && <small>{run.current.mode === 'worker' ? t('optimizer.modeWorker', 'rekent in een web worker') : t('optimizer.modeMain', 'rekent in stukjes op de hoofddraad')}</small>}
        </div>}
      </div>
      {error && <p className="lat-table-error">{error}</p>}
      {result && <div className="lat-opt-result">
        <p role="status">{t('optimizer.summary', '{{evaluated}} van {{space}} varianten doorgerekend, {{feasible}} voldoen; {{generations}} generaties, {{reason}}; {{seconds}} s.', { evaluated: result.evaluated, space: result.spaceSize, feasible: result.feasible, generations: result.generations, reason, seconds: n(result.ms / 1000, 1) })}</p>
        {best.length ? <>
          <p><strong>{t('optimizer.best', 'Beste: {{label}}, {{kg}} kg, L = {{L}} m', { label: best[0].label, kg: n(best[0].objectiveKg), L: n(best[0].design.lengthM, 2) })}</strong></p>
          <HistoryChart history={result.history} />
          <ol className="lat-opt-best">{best.map((c, i) => <li key={i}>{c.label} · L {n(c.design.lengthM, 2)} m · {n(c.objectiveKg)} kg · u.c. {n(c.outcome.uc ?? NaN, 2)}</li>)}</ol>
          <p className="lat-opt-hint">{t('optimizer.added', 'De beste {{n}} staan als varianten in de vergelijkingstabel.', { n: best.length })}</p>
          {onShowVariants && <button type="button" onClick={onShowVariants}>{t('optimizer.toVariants', 'Naar varianten')}</button>}
        </> : <p className="lat-table-error">{t('optimizer.none', 'Geen variant voldoet aan de eisen. Verruim de zoekruimte of de eisen.')}</p>}
      </div>}
    </div>
  </Modal>;
}
