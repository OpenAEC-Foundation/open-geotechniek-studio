// Koppeling met de verticale paalberekening op het scherm:
// - AddLateralCalculation: knop in het resultaat van het paaldraagvermogen die een
//   horizontale berekening met dezelfde gegevens toevoegt;
// - InheritedNote: regel in de horizontale invoer die zegt waar de gegevens
//   vandaan komen, met "opnieuw overnemen".
import { useTranslation } from 'react-i18next';
import { useCalculationsStore } from '../../framework/store';
import type { PileInput } from '../pile-bearing-capacity/types';
import type { LateralInput } from './compute';
import { applyPile, lateralInputFromPile } from './pile-link';
import { numberLocale } from '../../i18n';
import './lateral-input.css';

const PILE_MODULE = 'pile-bearing-capacity', LATERAL_MODULE = 'laterally-loaded-pile';
const nl = (v: number) => v.toLocaleString(numberLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function findCalc(id: string) {
  for (const [docId, list] of useCalculationsStore.getState().byDoc) { const instance = list.find((c) => c.id === id); if (instance) return { docId, instance }; }
  return null;
}

/** Knop bij een paaldraagvermogenberekening: voegt een horizontale berekening toe die de gegevens overneemt. */
export function AddLateralCalculation({ input }: { input: PileInput }) {
  const { t } = useTranslation('calcLateral');
  const link = lateralInputFromPile(input, { calcId: '', name: '' });
  const add = () => {
    const store = useCalculationsStore.getState(), active = store.getActive();
    if (!active || active.instance.moduleId !== PILE_MODULE) return;
    const made = lateralInputFromPile(input, { calcId: active.instance.id, name: active.instance.name });
    if (!made.ok) return;
    const id = store.addCalculation(active.docId, LATERAL_MODULE, t('link.newName', '{{name}} · horizontaal', { name: active.instance.name }), made.input);
    store.navigate(id, 'sheet');
  };
  return <button type="button" className="lat-link-add" disabled={!link.ok} onClick={add}
    title={link.ok ? t('link.addTitle', 'Nieuwe berekening met dezelfde sondering, paal, niveaus en grondlagen') : t(`link.reason.${link.reason}`, link.reason === 'timber' ? 'Voor houten palen heeft de horizontale berekening nog geen doorsnedetoets.' : 'De paalgegevens zijn niet over te nemen.')}>
    {t('link.add', 'Horizontale paalbelasting toevoegen')}</button>;
}

/** Herkomst van een overgenomen berekening, met de niveaus die de horizontale berekening alleen vermeldt. */
export function InheritedNote({ input, onChange }: { input: LateralInput; onChange?: (next: LateralInput) => void }) {
  const { t } = useTranslation('calcLateral');
  const from = input.inherited;
  if (!from) return null;
  const source = findCalc(from.calcId);
  const again = () => {
    const now = findCalc(from.calcId);
    if (!now || now.instance.moduleId !== PILE_MODULE) return;
    const made = applyPile(input, now.instance.input as PileInput, { calcId: now.instance.id, name: now.instance.name });
    if (made.ok) onChange?.(made.input);
  };
  return <p className="lat-inherited" role="note">
    <span>{t('link.from', 'Overgenomen uit {{name}}', { name: source?.instance.name ?? from.name })}{from.cptId ? ` · ${from.cptId}` : ''} · {t('link.levels', 'maaiveld NAP {{surface}}, grondwater NAP {{water}}', { surface: nl(from.surfaceNap), water: nl(from.waterNap) })}</span>
    {source && onChange && <button type="button" className="lat-mini" onClick={again} title={t('link.againTitle', 'Paal, niveaus, grondlagen en N opnieuw uit de verticale berekening halen; H, M en de wapening blijven staan')}>{t('link.again', 'Opnieuw overnemen')}</button>}
  </p>;
}
