import { useEffect, useMemo, useState } from 'react';
import { useCalculationsStore } from '../store';
import { getCalcModule } from '../registry';
import { useCptStore } from '../../../store/useCptStore';
import { ProjectTreePanel } from './ProjectTreePanel';
import { NewCalculationDialog } from './NewCalculationDialog';
import './CalculationsView.css';
import './Worksheet.css';

/** One worksheet, with a project explorer and a scrollable working area. */
export function CalculationsView() {
  const activeCalcId = useCalculationsStore((s) => s.activeCalcId);
  const byDoc = useCalculationsStore((s) => s.byDoc);
  const activeDocId = useCptStore((s) => s.activeDocId);
  const cpts = useCptStore((s) => s.cpts);
  const activeCptId = useCptStore((s) => s.activeCptId);
  const projectMeta = useCptStore((s) => s.projectMeta);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const active = useMemo(() => (activeDocId ? byDoc.get(activeDocId) : [])?.find((c) => c.id === activeCalcId), [activeDocId, activeCalcId, byDoc]);
  useEffect(() => {
    const open = () => setShowNewDialog(true);
    window.addEventListener('ogs:open-new-calc', open);
    return () => window.removeEventListener('ogs:open-new-calc', open);
  }, []);
  const mod = active ? getCalcModule(active.moduleId) : undefined;
  const ctx = { cpts, activeCptId, projectMeta };
  const input = active?.input as never;
  const result = mod?.compute(input, ctx) as never;
  const onChange = (next: unknown) => {
    if (active && activeDocId) useCalculationsStore.getState().updateCalculation(activeDocId, active.id, { input: next });
  };
  return <div className="calc-workspace">
    <aside className="worksheet-explorer">
      <div className="worksheet-panel-heading">Berekeningen</div>
      <ProjectTreePanel onAddClick={() => setShowNewDialog(true)} />
    </aside>
    <main className="worksheet-scroll">
      {mod && active ? <article className="worksheet">
        <header className="worksheet-header">
          <div><p className="worksheet-eyebrow">Geotechniek / Zetting</p><h1>{active.name}</h1><p>{mod.subtitle}</p></div>
          <span className="worksheet-badge">Concept</span>
        </header>
        <div className="worksheet-notice" role="note"><span aria-hidden="true">△</span><p>Indicatieve berekening. Controleer de grondparameters voor toepassing in een ontwerp.</p></div>
        <div className="worksheet-columns">
          <section className="worksheet-input" aria-label="Invoer">
            <mod.InputPanel input={input} result={result} onChange={onChange} />
            <mod.VisualPanel input={input} result={result} />
          </section>
          <section className="worksheet-results" aria-label="Resultaten"><mod.ResultPanel input={input} result={result} /></section>
        </div>
      </article> : <div className="worksheet-empty">
        <svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M12 6h17l8 8v28H12zM29 6v9h8M18 24h13M18 30h13M18 36h8"/></svg>
        <h1>Een nieuwe zettingsberekening</h1><p>Bereken de zetting van één grondlaag met drie invoerwaarden.<br/>De formule en tussenstappen blijven zichtbaar naast de invoer.</p>
        <button className="worksheet-primary" disabled={!activeDocId} onClick={() => setShowNewDialog(true)}>Nieuwe berekening</button>
        {!activeDocId && <p>Maak of open eerst een project via Bestand.</p>}
      </div>}
    </main>
    <NewCalculationDialog open={showNewDialog} onClose={() => setShowNewDialog(false)} />
  </div>;
}
