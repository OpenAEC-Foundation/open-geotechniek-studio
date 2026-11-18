import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCalculationsStore, type SheetView } from '../store';
import { getCalcModule } from '../registry';
import { useCptStore } from '../../../store/useCptStore';
import { downloadPdf } from '../../../utils/downloadPdf';
import type { CalcCheck, CalcModule, ProjectContext } from '../types';
import { ProjectTreePanel } from './ProjectTreePanel';
import { NewCalculationDialog } from './NewCalculationDialog';
import { moduleName, moduleText } from '../moduleText';
import './CalculationsView.css';
import './Worksheet.css';
import './CalcSheet.css';
import { OaIcon } from '../../../components/icons/oaIcon';

/**
 * Werkbalk voor één berekening, opgezet als rekenblad: links het
 * invoerscherm met de sondering ernaast, rechts de uitdraai zoals hij
 * op papier komt. Wat je links wijzigt rekent rechts direct door.
 */
/** Naam van de tekening midden in een tablabel ("Invoer + situatie").
 *  Kleine beginletter, behalve in het Duits: daar houden zelfstandige
 *  naamwoorden hun hoofdletter ("Eingabe + Lageplan"). */
function tabNoun(label: string, lang: string): string {
  return lang.startsWith('de') ? label : label.charAt(0).toLowerCase() + label.slice(1);
}

export function CalculationsView() {
  // Een taalwissel rendert opnieuw, zodat compute en statusLine de nieuwe taal volgen.
  const { t, i18n } = useTranslation('calc');
  const activeCalcId = useCalculationsStore((s) => s.activeCalcId);
  const byDoc = useCalculationsStore((s) => s.byDoc);
  const activeDocId = useCptStore((s) => s.activeDocId);
  const cpts = useCptStore((s) => s.cpts);
  const activeCptId = useCptStore((s) => s.activeCptId);
  const projectMeta = useCptStore((s) => s.projectMeta);
  const [showNewDialog, setShowNewDialog] = useState(false);
  // De weergave hoort bij één berekening en wordt gedeeld met de projectboom:
  // wissel je van berekening, dan begin je weer bij invoer + uitdraai.
  const nav = useCalculationsStore((s) => s.sheetNav);
  const navigate = useCalculationsStore((s) => s.navigate);
  const active = useMemo(() => (activeDocId ? byDoc.get(activeDocId) : [])?.find((c) => c.id === activeCalcId), [activeDocId, activeCalcId, byDoc]);
  useEffect(() => {
    const open = () => setShowNewDialog(true);
    window.addEventListener('ogs:open-new-calc', open);
    return () => window.removeEventListener('ogs:open-new-calc', open);
  }, []);
  const mod = active ? getCalcModule(active.moduleId) : undefined;
  const calculations = useMemo(() => (activeDocId ? byDoc.get(activeDocId) : undefined) ?? [], [activeDocId, byDoc]);
  const ctx: ProjectContext = { cpts, activeCptId, projectMeta, calculations };
  const input = active?.input as never;
  const result = mod?.compute(input, ctx) as never;
  const onChange = (next: unknown) => {
    if (active && activeDocId) useCalculationsStore.getState().updateCalculation(activeDocId, active.id, { input: next });
  };
  // De draagvermogentabel bestaat alleen voor de axiale paal; een module
  // zonder rapport heeft geen afdrukvoorbeeld.
  const hasTable = !!mod?.table;
  const requested = nav.calcId === active?.id ? nav.view : 'sheet';
  const focusCpt = nav.calcId === active?.id ? nav.cptId : null;
  const shownView: SheetView = requested === 'table' && !hasTable ? 'sheet' : requested === 'print' && !mod?.buildReport ? 'sheet' : requested === 'settings' && !mod?.SettingsPanel ? 'sheet' : requested;
  const setView = (view: SheetView) => { if (active) navigate(active.id, view); };

  return <div className="calc-workspace">
    <aside className="worksheet-explorer">
      <div className="worksheet-panel-heading">{t('view.heading', 'Berekeningen')}</div>
      <ProjectTreePanel onAddClick={() => setShowNewDialog(true)} />
    </aside>
    <main className="cs-main">
      {mod && active ? <>
        <div className="cs-viewbar">
          <div role="tablist" aria-label={t('view.tabs.label', 'Weergave')} className="cs-viewtabs">
            <button role="tab" aria-selected={shownView === 'sheet'} className={shownView === 'sheet' ? 'active' : ''} onClick={() => setView('sheet')}>{t('view.tabs.sheet', 'Invoer + uitdraai')}</button>
            <button role="tab" aria-selected={shownView === 'model'} className={shownView === 'model' ? 'active' : ''} onClick={() => setView('model')} title={t('view.tabs.modelTitle', 'Verberg de uitdraai zodat de tekening de volle breedte krijgt')}>{mod.visualLabel ? t('view.tabs.model', 'Invoer + {{visual}}', { visual: tabNoun(moduleText(mod, 'visualLabel')!, i18n.language) }) : t('view.tabs.modelCpt', 'Invoer + sondering')}</button>
            {hasTable && <button role="tab" aria-selected={shownView === 'table'} className={shownView === 'table' ? 'active' : ''} onClick={() => setView('table')}>{moduleText(mod, 'tableLabel')}</button>}
            {mod.buildReport && <button role="tab" aria-selected={shownView === 'print'} className={shownView === 'print' ? 'active' : ''} onClick={() => setView('print')}>{t('view.tabs.print', 'Afdrukvoorbeeld')}</button>}
            {mod.SettingsPanel && <button role="tab" aria-selected={shownView === 'settings'} className={shownView === 'settings' ? 'active' : ''} onClick={() => setView('settings')}>{t('view.tabs.settings', 'Instellingen')}</button>}
          </div>
          <span className="cs-viewbar-status"><span className="cs-dot" aria-hidden="true" />{t('view.draft', 'Concept')}</span>
        </div>
        {(shownView === 'sheet' || shownView === 'model') && <SheetPanes mod={mod} name={active.name} input={input} result={result} ctx={ctx} onChange={onChange} showOutput={shownView === 'sheet'} />}
        {shownView === 'table' && <div className="cs-table-view">
          <section className="cs-param-form" aria-label={t('view.input', 'Invoer')}><mod.InputPanel input={input} result={result} onChange={onChange} /></section>
          <div className="cs-table-view-main">
            {mod.table && <mod.table.Panel key={active.id} input={input} ctx={ctx} onChange={onChange} onOpen={() => setView('sheet')}
              focus={focusCpt} onFocus={(id) => navigate(active.id, 'table', id)} />}
          </div>
        </div>}
        {shownView === 'print' && <PrintPreview mod={mod} input={input} result={result} ctx={ctx} />}
        {shownView === 'settings' && mod.SettingsPanel && <section className="cs-settings-view" aria-label={t('view.tabs.settings', 'Instellingen')}><header><h1>{t('view.settings.title', 'Instellingen · {{name}}', { name: active.name })}</h1><p>{t('view.settings.intro', 'Parameters en standaardreeksen van deze berekening. Wijzigingen rekenen direct door.')}</p></header><mod.SettingsPanel input={input} result={result} onChange={onChange} /></section>}
      </> : <div className="worksheet-empty">
        <svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M12 6h17l8 8v28H12zM29 6v9h8M18 24h13M18 30h13M18 36h8"/></svg>
        <h1>{t('empty.title', 'Een nieuwe paalberekening')}</h1><p>{t('empty.choose', 'Kies paaldraagvermogen of horizontale paalbelasting.')}<br/>{t('empty.layout', 'De invoer staat naast de uitgewerkte uitdraai.')}</p>
        <button className="worksheet-primary" disabled={!activeDocId} onClick={() => setShowNewDialog(true)}>{t('empty.new', 'Nieuwe berekening')}</button>
        {!activeDocId && <p>{t('empty.noProject', 'Maak of open eerst een project via Bestand.')}</p>}
      </div>}
    </main>
    <NewCalculationDialog open={showNewDialog} onClose={() => setShowNewDialog(false)} />
  </div>;
}

interface PaneProps {
  mod: CalcModule;
  input: never;
  result: never;
  ctx: ProjectContext;
}

function SheetPanes({ mod, name, input, result, ctx, onChange, showOutput }: PaneProps & { name: string; onChange: (next: unknown) => void; showOutput: boolean }) {
  const { t } = useTranslation('calc');
  const status = mod.statusLine?.(result);
  const checks = mod.checks?.(input, result) ?? [];
  const governing = checks.filter((c) => c.uc !== undefined).reduce<CalcCheck | null>((max, c) => (!max || c.uc! > max.uc! ? c : max), null);
  return <div className={`cs-panes${showOutput ? '' : ' no-output'}${mod.wideVisual ? ' wide-visual' : ''}`}>
    <section className="cs-pane cs-pane-input" aria-label={t('view.input', 'Invoer')}>
      <div className="cs-pane-label">{t('view.input', 'Invoer')}</div>
      <header className="cs-param-header">
        <div>
          <p className="worksheet-eyebrow">{t('sheet.eyebrow', 'Geotechniek / {{module}}', { module: moduleName(mod) })}</p>
          <h1>{name}</h1>
          <p className="cs-param-subtitle">{moduleText(mod, 'subtitle')}</p>
        </div>
        {status && <span className={`cs-uc-badge ${status.pending ? 'pending' : status.ok ? 'ok' : 'fail'}`}>{!status.pending && <OaIcon id={status.ok ? 'status.success' : 'status.error'} />}{status.text}</span>}
      </header>
      <div className="cs-param-notice" role="note">{t('sheet.notice', 'Indicatieve berekening. Controleer de grondparameters voor toepassing in een ontwerp.')}</div>
      <div className="cs-param-body">
        <div className="cs-param-form"><mod.InputPanel input={input} result={result} onChange={onChange} /></div>
        <section className="cs-param-visual" aria-label={moduleText(mod, 'visualLabel') ?? t('view.defaultVisual', 'Sondering')}><mod.VisualPanel input={input} result={result} onChange={onChange} /></section>
      </div>
      {checks.length > 0 && <footer className="cs-chips" aria-label={t('sheet.keyResults', 'Kernuitkomsten')}>
        {checks.map((c) => <span key={c.label} className={`cs-chip${c.uc === undefined ? '' : c.uc <= 1 ? ' ok' : ' fail'}`}>
          <span className="cs-chip-label">{c.label}</span> {c.uc === undefined ? c.value : <>{c.uc.toFixed(2)} <span className="cs-chip-sub">{c.value}</span></>}
        </span>)}
      </footer>}
    </section>
    {showOutput && <section className="cs-pane cs-pane-output" aria-label={t('sheet.output', 'Uitdraai')}>
      <div className="cs-pane-label">
        <span>{t('sheet.output', 'Uitdraai')}</span>
        <span className="cs-pane-label-meta">
          {governing ? (governing.uc! <= 1
            ? t('sheet.governingPass', 'Maatgevende u.c. {{uc}} — voldoet', { uc: governing.uc!.toFixed(2) })
            : t('sheet.governingFail', 'Maatgevende u.c. {{uc}} — voldoet niet', { uc: governing.uc!.toFixed(2) }))
            : t('sheet.noDesignCheck', 'Geen toets met ontwerpbelasting')}
        </span>
        {mod.buildReport && <ExportButton mod={mod} input={input} result={result} ctx={ctx} />}
      </div>
      <div className="cs-paper-scroll">
        <article className="cs-paper"><mod.ResultPanel input={input} result={result} /></article>
      </div>
    </section>}
  </div>;
}

/** Bouwt het rapport, of meldt waarom dat niet lukt. */
function useReport({ mod, input, result, ctx }: PaneProps, enabled = true) {
  return useMemo(() => {
    if (!enabled || !mod.buildReport) return { bytes: null, error: null };
    try {
      return { bytes: mod.buildReport(input, result, ctx), error: null };
    } catch (err) {
      return { bytes: null, error: err instanceof Error ? err.message : String(err) };
    }
    // ctx is per render een nieuw object; de inhoud volgt uit de store-velden.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, mod, input, result, ctx.cpts, ctx.projectMeta, ctx.calculations]);
}

function ExportButton(props: PaneProps) {
  const { t } = useTranslation('calc');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Een oude foutmelding hoort niet bij nieuwe invoer.
  useEffect(() => setError(null), [props.input]);
  const run = async () => {
    if (busy || !props.mod.buildReport) return;
    setBusy(true);
    setError(null);
    try {
      const bytes = props.mod.buildReport(props.input, props.result, props.ctx);
      const name = props.mod.reportFileName?.(props.input) ?? props.mod.id;
      await downloadPdf(`${name}.pdf`, bytes);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  return <>
    {error && <span className="cs-export-error" role="alert">{t('export.failed', 'Export mislukt: {{error}}', { error })}</span>}
    <button type="button" className="cs-export" onClick={run} disabled={busy}>{busy ? t('export.busy', 'Bezig…') : t('export.pdf', 'PDF exporteren')}</button>
  </>;
}

function PrintPreview(props: PaneProps) {
  const { t } = useTranslation('calc');
  const { bytes, error } = useReport(props);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!bytes) { setUrl(null); return; }
    const blobUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
    setUrl(blobUrl);
    return () => URL.revokeObjectURL(blobUrl);
  }, [bytes]);
  const fileName = `${props.mod.reportFileName?.(props.input) ?? props.mod.id}.pdf`;
  return <section className="cs-print" aria-label={t('view.tabs.print', 'Afdrukvoorbeeld')}>
    <div className="cs-print-bar">
      <span className="cs-print-name">{fileName}</span>
      {props.mod.buildReport && <ExportButton {...props} />}
    </div>
    {error ? <p className="cs-print-error">{t('print.failed', 'Het rapport kan niet worden opgemaakt: {{error}}', { error })}</p>
      : url ? <iframe title={t('view.tabs.print', 'Afdrukvoorbeeld')} src={`${url}#toolbar=0&navpanes=0&view=FitH`} />
      : <p className="cs-print-error">{t('print.loading', 'Rapport opmaken…')}</p>}
  </section>;
}
