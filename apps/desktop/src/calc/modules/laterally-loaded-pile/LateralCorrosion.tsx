// Invoerblok "Afroesting" van de horizontaal belaste paal: stalen buis (1 kant buiten of 2 kanten) en damwandprofiel
// (1 of 2 zijden), met de tabelkeuze van NEN-EN 1993-5, het vinkje "EI na afroesting" en de verificatie.
import { useTranslation } from 'react-i18next';
import { Hint, More, Row } from '../../framework/views/SheetForm';
import { numberLocale } from '../../i18n';
import { CorrosionFaceInput } from '../../shared/CorrosionFace';
import { CorrosionVerification } from '../../shared/CorrosionVerification';
import type { LateralInput, LateralResult } from './compute';
import { DEFAULT_PILE_CORROSION, type PileCorrosion } from './corrosion-section';

const nl = (v: number, d = 2) => v.toLocaleString(numberLocale(), { minimumFractionDigits: d, maximumFractionDigits: d });

export function LateralCorrosion({ input: i, result: r, onChange }: { input: LateralInput; result?: LateralResult; onChange?: (next: LateralInput) => void }) {
  const { t } = useTranslation('calcLateral');
  const kind = i.section.kind, sheet = kind === 'sheet-pile', hollow = kind === 'steel-tube';
  if (kind !== 'steel-tube' && kind !== 'filled-tube' && !sheet) return null;
  // Een open buis staat ook binnen in de grond: zolang er nog niets is ingevuld, stelt het blok 2 kanten voor.
  const c = { ...DEFAULT_PILE_CORROSION, ...(i.openEnd && hollow && !i.corrosion ? { sides: 2 as const } : {}), ...i.corrosion }, set = (patch: Partial<PileCorrosion>) => onChange?.({ ...i, corrosion: { ...c, ...patch } });
  const two = c.sides === 2 && (hollow || sheet), info = r?.ok ? r.corrosion : null;
  return <More title={t('corrosion.title', 'Afroesting')}>
    {(hollow || sheet) && <Row label={t('corrosion.sides', 'Aangetast')}><select aria-label={t('corrosion.sides', 'Aangetast')} value={c.sides} onChange={(e) => set({ sides: Number(e.target.value) as 1 | 2 })}>
      <option value={1}>{sheet ? t('corrosion.oneSide', '1 zijde') : t('corrosion.oneTube', '1 kant (buiten)')}</option>
      <option value={2}>{sheet ? t('corrosion.twoSides', '2 zijden') : t('corrosion.twoTube', '2 kanten (buiten en binnen)')}</option></select></Row>}
    <CorrosionFaceInput label={sheet ? t('corrosion.side1Label', 'Zijde 1') : t('corrosion.outerLabel', 'Buitenzijde')} face={c.outer} onChange={(outer) => set({ outer })} />
    {two && <CorrosionFaceInput label={sheet ? t('corrosion.side2Label', 'Zijde 2') : t('corrosion.innerLabel', 'Binnenzijde')} face={c.inner} onChange={(inner) => set({ inner })} />}
    <label className="cs-check"><input type="checkbox" checked={c.reducedStiffness} onChange={(e) => set({ reducedStiffness: e.target.checked })} /> {t('corrosion.reducedStiffness', 'EI na afroesting')}</label>
    {sheet && <Row label={t('corrosion.classChoice', 'Klasse na afroesting')}><select aria-label={t('corrosion.classChoice', 'Klasse na afroesting')} value={c.classChoice ?? ''} onChange={(e) => set({ classChoice: e.target.value ? Number(e.target.value) as 2 | 3 | 4 : undefined })}>
      <option value="">{t('corrosion.classAuto', 'Uit de catalogus (bij twijfel de ongunstigste)')}</option>{[2, 3, 4].map((k) => <option key={k} value={k}>{t('corrosion.classN', 'Klasse {{cls}}', { cls: k })}</option>)}</select></Row>}
    {info?.tube && <Hint>{t('corrosion.tubeSummary', 'Na afroesting: D {{d0}} → {{d1}} mm, t {{t0}} → {{t1}} mm.', { d0: nl(info.tube.diameterMm, 1), d1: nl(info.tube.reducedDiameterMm, 1), t0: nl(info.tube.wallMm), t1: nl(info.tube.reducedWallMm) })}</Hint>}
    {info?.sheet && <Hint>{t('corrosion.sheetSummary', 'Na afroesting: t {{t0}} → {{t1}} mm, s {{s0}} → {{s1}} mm, W_el {{w0}} → {{w1}} cm³/m.', { t0: nl(info.sheet.original.flangeMm ?? 0, 1), t1: nl(info.sheet.profile.flangeMm ?? 0), s0: nl(info.sheet.original.webMm ?? 0, 1), s1: nl(info.sheet.profile.webMm ?? 0), w0: nl(info.sheet.original.welCm3PerM ?? 0, 0), w1: nl(info.sheet.profile.welCm3PerM ?? 0, 0) })}</Hint>}
    <Hint>{t('corrosion.hint', 'Vul bij afroesting de nominale wanddikte in. Dikteverlies per kant; de tabelwaarden zijn de aanbevolen waarden van NEN-EN 1993-5 tabel 4-1 en 4-2 en zijn niet tegen de normtekst of de Nederlandse bijlage gelegd. De afroesting telt in de materiaaltoetsing en de N–M-toets, ook in de doorsnedeklasse en D/t; in de krachtsverdeling alleen met het vinkje. Bij een gevulde buis roest alleen de buitenzijde.')}</Hint>
    <CorrosionVerification set={sheet ? 'sheet' : 'tube'} />
  </More>;
}
