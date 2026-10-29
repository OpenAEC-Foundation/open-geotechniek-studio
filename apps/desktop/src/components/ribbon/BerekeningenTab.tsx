import { useCalculationsStore } from '../../calc/framework/store';
import { useCptStore } from '../../store/useCptStore';
import { getCalcModule } from '../../calc/framework/registry';
import RibbonGroup from './RibbonGroup';
import RibbonButton from './RibbonButton';
import { infoIcon } from './icons';
const newIcon = '<svg fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M5 3h9l5 5v13H5zM14 3v6h5M8 15h8m-4-4v8"/></svg>';
export function BerekeningenTab() {
  const activeDocId = useCptStore((s) => s.activeDocId);
  const activeCalcId = useCalculationsStore((s) => s.activeCalcId);
  const byDoc = useCalculationsStore((s) => s.byDoc);
  const active = (activeDocId ? byDoc.get(activeDocId) : [])?.find((c) => c.id === activeCalcId && getCalcModule(c.moduleId));
  return <div className="ribbon-content ribbon-berekeningen">
    <RibbonGroup label="Berekening"><RibbonButton icon={newIcon} label="Nieuw" title="Nieuwe zettingsberekening" disabled={!activeDocId} onClick={() => window.dispatchEvent(new Event('ogs:open-new-calc'))} /></RibbonGroup>
    <RibbonGroup label="Methode"><RibbonButton icon={infoIcon} label="Toelichting" disabled={!active} onClick={() => {
      const reference = document.querySelector<HTMLDetailsElement>('.settlement-reference');
      if (reference) { reference.open = true; reference.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    }} /></RibbonGroup>
    <div className="ribbon-calculation-context"><strong>{active?.name ?? 'Zetting van één laag'}</strong><span>1D-compressie · constante modulus</span><span>Conceptberekening</span></div>
  </div>;
}
