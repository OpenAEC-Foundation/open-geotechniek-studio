import { useCalculationsStore } from '../../calc/framework/store';
import { useCptStore } from '../../store/useCptStore';
import { getCalcModule } from '../../calc/framework/registry';
import RibbonGroup from './RibbonGroup';
import RibbonButton from './RibbonButton';
export function BerekeningenTab() {
  const activeDocId = useCptStore((s) => s.activeDocId);
  const activeCalcId = useCalculationsStore((s) => s.activeCalcId);
  const byDoc = useCalculationsStore((s) => s.byDoc);
  const active = (activeDocId ? byDoc.get(activeDocId) : [])?.find((c) => c.id === activeCalcId && getCalcModule(c.moduleId));
  const module = active ? getCalcModule(active.moduleId) : undefined;
  return <div className="ribbon-content ribbon-berekeningen">
    <RibbonGroup label="Berekening"><RibbonButton icon="calc.new" label="Nieuw" title="Nieuwe geotechnische berekening" disabled={!activeDocId} onClick={() => window.dispatchEvent(new Event('ogs:open-new-calc'))} /></RibbonGroup>
    <RibbonGroup label="Methode"><RibbonButton icon="calc.method-notes" label="Toelichting" disabled={!active} onClick={() => {
      const reference = document.querySelector<HTMLDetailsElement>('.settlement-reference');
      if (reference) { reference.open = true; reference.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    }} /></RibbonGroup>
    <div className="ribbon-calculation-context"><strong>{active?.name ?? 'Geotechnische berekeningen'}</strong><span>{module?.norm ?? 'Zetting · Poer op staal'}</span><span>Conceptberekening</span></div>
  </div>;
}
