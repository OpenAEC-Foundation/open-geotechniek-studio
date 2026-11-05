import { useEffect, useMemo, useState } from 'react';
import { useCalculationsStore } from '../store';
import { getCalcModule } from '../registry';
import { useCptStore } from '../../../store/useCptStore';
import { downloadPdf } from '../../../utils/downloadPdf';
import type { CalcCheck, CalcModule, ProjectContext } from '../types';
import { ProjectTreePanel } from './ProjectTreePanel';
import { NewCalculationDialog } from './NewCalculationDialog';
import { CapacityTable } from '../../modules/pile-bearing-capacity/ui/CapacityTable';
import type { PileInput } from '../../modules/pile-bearing-capacity/types';
import './CalculationsView.css';
import './Worksheet.css';
import './CalcSheet.css';

type SheetView = 'sheet' | 'model' | 'table' | 'print';

/**
 * Werkbalk voor één berekening, opgezet als rekenblad: links het
 * invoerscherm met de sondering ernaast, rechts de uitdraai zoals hij
 * op papier komt. Wat je links wijzigt rekent rechts direct door.
 */
export function CalculationsView() {
  const activeCalcId = useCalculationsStore((s) => s.activeCalcId);
  const byDoc = useCalculationsStore((s) => s.byDoc);
  const activeDocId = useCptStore((s) => s.activeDocId);
  const cpts = useCptStore((s) => s.cpts);
  const activeCptId = useCptStore((s) => s.activeCptId);
  const projectMeta = useCptStore((s) => s.projectMeta);
  const [showNewDialog, setShowNewDialog] = useState(false);
  // De weergave hoort bij één berekening: wissel je van berekening, dan
  // begin je weer bij invoer + uitdraai.
  const [viewState, setViewState] = useState<{ calcId: string | null; view: SheetView }>({ calcId: null, view: 'sheet' });
  const active = useMemo(() => (activeDocId ? byDoc.get(activeDocId) : [])?.find((c) => c.id === activeCalcId), [activeDocId, activeCalcId, byDoc]);
  useEffect(() => {
    const open = () => setShowNewDialog(true);
    window.addEventListener('ogs:open-new-calc', open);
    return () => window.removeEventListener('ogs:open-new-calc', open);
  }, []);
  const mod = active ? getCalcModule(active.moduleId) : undefined;
  const ctx: ProjectContext = { cpts, activeCptId, projectMeta };
  const input = active?.input as never;
  const result = mod?.compute(input, ctx) as never;
  const onChange = (next: unknown) => {
    if (active && activeDocId) useCalculationsStore.getState().updateCalculation(activeDocId, active.id, { input: next });
  };
  // De draagvermogentabel bestaat alleen voor de axiale paal; een module
  // zonder rapport heeft geen afdrukvoorbeeld.
  const hasTable = mod?.id === 'pile-bearing-capacity';
  const requested = viewState.calcId === active?.id ? viewState.view : 'sheet';
  const shownView: SheetView = requested === 'table' && !hasTable ? 'sheet' : requested === 'print' && !mod?.buildReport ? 'sheet' : requested;
  const setView = (view: SheetView) => setViewState({ calcId: active?.id ?? null, view });

  return <div className="calc-workspace">
    <aside className="worksheet-explorer">
      <div className="worksheet-panel-heading">Berekeningen</div>
      <ProjectTreePanel onAddClick={() => setShowNewDialog(true)} />
    </aside>
    <main className="cs-main">
      {mod && active ? <>
        <div className="cs-viewbar">
          <div role="tablist" aria-label="Weergave" className="cs-viewtabs">
            <button role="tab" aria-selected={shownView === 'sheet'} className={shownView === 'sheet' ? 'active' : ''} onClick={() => setView('sheet')}>Invoer + uitdraai</button>
            <button role="tab" aria-selected={shownView === 'model'} className={shownView === 'model' ? 'active' : ''} onClick={() => setView('model')} title="Verberg de uitdraai zodat de tekening de volle breedte krijgt">Invoer + {(mod.visualLabel ?? 'Sondering').toLowerCase()}</button>
            {hasTable && <button role="tab" aria-selected={shownView === 'table'} className={shownView === 'table' ? 'active' : ''} onClick={() => setView('table')}>Draagvermogentabel</button>}
            {mod.buildReport && <button role="tab" aria-selected={shownView === 'print'} className={shownView === 'print' ? 'active' : ''} onClick={() => setView('print')}>Afdrukvoorbeeld</button>}
          </div>
          <span className="cs-viewbar-status"><span className="cs-dot" aria-hidden="true" />Concept</span>
        </div>
        {(shownView === 'sheet' || shownView === 'model') && <SheetPanes mod={mod} name={active.name} input={input} result={result} ctx={ctx} onChange={onChange} showOutput={shownView === 'sheet'} />}
        {shownView === 'table' && <div className="cs-table-view">
          <section className="cs-param-form" aria-label="Invoer"><mod.InputPanel input={input} result={result} onChange={onChange} /></section>
          <div className="cs-table-view-main">
            <CapacityTable key={active.id} input={input as PileInput} cpts={cpts} onChange={onChange} onOpen={() => setView('sheet')} />
          </div>
        </div>}
        {shownView === 'print' && <PrintPreview mod={mod} input={input} result={result} ctx={ctx} />}
      </> : <div className="worksheet-empty">
        <svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M12 6h17l8 8v28H12zM29 6v9h8M18 24h13M18 30h13M18 36h8"/></svg>
        <h1>Een nieuwe paalberekening</h1><p>Kies paaldraagvermogen of horizontale paalbelasting.<br/>De invoer staat naast de uitgewerkte uitdraai.</p>
        <button className="worksheet-primary" disabled={!activeDocId} onClick={() => setShowNewDialog(true)}>Nieuwe berekening</button>
        {!activeDocId && <p>Maak of open eerst een project via Bestand.</p>}
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
  const status = mod.statusLine?.(result);
  const checks = mod.checks?.(input, result) ?? [];
  const governing = checks.filter((c) => c.uc !== undefined).reduce<CalcCheck | null>((max, c) => (!max || c.uc! > max.uc! ? c : max), null);
  return <div className={`cs-panes${showOutput ? '' : ' no-output'}${mod.wideVisual ? ' wide-visual' : ''}`}>
    <section className="cs-pane cs-pane-input" aria-label="Invoer">
      <div className="cs-pane-label">Invoer</div>
      <header className="cs-param-header">
        <div>
          <p className="worksheet-eyebrow">Geotechniek / {mod.name}</p>
          <h1>{name}</h1>
          <p className="cs-param-subtitle">{mod.subtitle}</p>
        </div>
        {status && <span className={`cs-uc-badge ${status.pending ? 'pending' : status.ok ? 'ok' : 'fail'}`}>{status.text}</span>}
      </header>
      <div className="cs-param-notice" role="note">Indicatieve berekening. Controleer de grondparameters voor toepassing in een ontwerp.</div>
      <div className="cs-param-body">
        <div className="cs-param-form"><mod.InputPanel input={input} result={result} onChange={onChange} /></div>
        <section className="cs-param-visual" aria-label={mod.visualLabel ?? 'Sondering'}><mod.VisualPanel input={input} result={result} onChange={onChange} /></section>
      </div>
      {checks.length > 0 && <footer className="cs-chips" aria-label="Kernuitkomsten">
        {checks.map((c) => <span key={c.label} className={`cs-chip${c.uc === undefined ? '' : c.uc <= 1 ? ' ok' : ' fail'}`}>
          <span className="cs-chip-label">{c.label}</span> {c.uc === undefined ? c.value : <>{c.uc.toFixed(2)} <span className="cs-chip-sub">{c.value}</span></>}
        </span>)}
      </footer>}
    </section>
    {showOutput && <section className="cs-pane cs-pane-output" aria-label="Uitdraai">
      <div className="cs-pane-label">
        <span>Uitdraai</span>
        <span className="cs-pane-label-meta">
          {governing ? <>Maatgevende u.c. {governing.uc!.toFixed(2)} — {governing.uc! <= 1 ? 'voldoet' : 'voldoet niet'}</> : 'Geen toets met ontwerpbelasting'}
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
  }, [enabled, mod, input, result, ctx.cpts, ctx.projectMeta]);
}

function ExportButton(props: PaneProps) {
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
    {error && <span className="cs-export-error" role="alert">Export mislukt: {error}</span>}
    <button type="button" className="cs-export" onClick={run} disabled={busy}>{busy ? 'Bezig…' : 'PDF exporteren'}</button>
  </>;
}

function PrintPreview(props: PaneProps) {
  const { bytes, error } = useReport(props);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!bytes) { setUrl(null); return; }
    const blobUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
    setUrl(blobUrl);
    return () => URL.revokeObjectURL(blobUrl);
  }, [bytes]);
  return <section className="cs-print" aria-label="Afdrukvoorbeeld">
    {error ? <p className="cs-print-error">Het rapport kan niet worden opgemaakt: {error}</p>
      : url ? <iframe title="Afdrukvoorbeeld" src={`${url}#toolbar=0&navpanes=0&view=FitH`} />
      : <p className="cs-print-error">Rapport opmaken…</p>}
  </section>;
}
