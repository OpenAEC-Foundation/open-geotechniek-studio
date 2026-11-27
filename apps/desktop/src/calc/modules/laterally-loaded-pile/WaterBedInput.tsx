// Invoer "Waterbodem": de paal staat van de kop tot de waterbodem vrij in het water, met optioneel een stroming.
import { useTranslation } from 'react-i18next';
import { Hint, NumberInput, Row } from '../../framework/views/SheetForm';
import { numberLocale } from '../../i18n';
import type { LateralInput, LateralResult } from './compute';
import { DEFAULT_CURRENT, type CurrentLoad, type WaterBed } from './water';

const nl = (v: number, d = 2) => v.toLocaleString(numberLocale(), { minimumFractionDigits: d, maximumFractionDigits: d });

export function WaterBedInput({ input: i, result, onChange }: { input: LateralInput; result?: LateralResult; onChange?: (next: LateralInput) => void }) {
  const { t } = useTranslation('calcLateral');
  const head = i.headNap ?? 0, firstTop = Math.min(...i.layers.map((l) => l.topM));
  const w: WaterBed = i.waterBed ?? { enabled: false, bedNap: Math.round((head - firstTop) * 1000) / 1000, waterNap: head };
  const set = (patch: Partial<WaterBed>) => onChange?.({ ...i, waterBed: { ...w, ...patch } });
  const c: CurrentLoad = { ...DEFAULT_CURRENT, ...w.current }, setC = (patch: Partial<CurrentLoad>) => set({ current: { ...c, ...patch } });
  const info = result?.ok ? result.water?.current : null;
  return <>
    <label className="cs-check"><input type="checkbox" checked={w.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> {t('water.enabled', 'Waterbodem (paal vrij in water)')}</label>
    {w.enabled && <>
      <Row label={t('water.bed', 'Waterbodem')} unit="m NAP"><NumberInput label={t('water.bedLabel', 'Waterbodem [m NAP]')} value={w.bedNap} onChange={(v) => set({ bedNap: v })} /></Row>
      <Row label={t('water.level', 'Waterpeil')} unit="m NAP"><NumberInput label={t('water.levelLabel', 'Waterpeil [m NAP]')} value={w.waterNap} onChange={(v) => set({ waterNap: v })} /></Row>
      <Hint>{t('water.hint', 'Tussen paalkop en waterbodem geen grondveren (vrije lengte {{free}} m). De grond begint op de waterbodem; de korrelspanning (Brinch Hansen) rekent vanaf de bodem met γ′, zonder bovenbelasting door het water.', { free: nl(head - w.bedNap) })}</Hint>
      <Row label={t('water.speed', 'Stroomsnelheid u')} unit="m/s"><NumberInput label={t('water.speedLabel', 'Stroomsnelheid [m/s]')} value={c.speedMs} onChange={(v) => setC({ speedMs: v })} /></Row>
      {c.speedMs > 0 && <>
        <Row label={t('water.profile', 'Snelheidsprofiel')}><select aria-label={t('water.profile', 'Snelheidsprofiel')} value={c.profile} onChange={(e) => setC({ profile: e.target.value as CurrentLoad['profile'] })}>
          <option value="uniform">{t('water.uniform', 'Uniform over de diepte')}</option><option value="power">{t('water.power', 'Machtsprofiel u·(h/d)ⁿ')}</option></select></Row>
        {c.profile === 'power' && <Row label={t('water.exponent', 'Exponent n')} unit="—"><NumberInput label={t('water.exponent', 'Exponent n')} value={c.exponent} onChange={(v) => setC({ exponent: v })} /></Row>}
        <Row label={t('water.density', 'Dichtheid water')} unit="kg/m³"><select aria-label={t('water.density', 'Dichtheid water')} value={String(c.densityKgM3)} onChange={(e) => setC({ densityKgM3: Number(e.target.value) })}>
          <option value="1000">{t('water.fresh', 'Zoet (1000)')}</option><option value="1025">{t('water.salt', 'Zout (1025)')}</option></select></Row>
        <Row label={<>C<sub>D</sub></>} unit="—"><NumberInput label={t('water.cdLabel', 'Weerstandscoëfficiënt C_D')} value={c.cd ?? undefined} onChange={(v) => setC({ cd: Number.isFinite(v) ? v : null })} /></Row>
        <Row label={t('water.direction', 'Richting')}><select aria-label={t('water.direction', 'Richting')} value={String(c.sign)} onChange={(e) => setC({ sign: Number(e.target.value) as 1 | -1 })}>
          <option value="1">{t('water.withH', 'Met H mee')}</option><option value="-1">{t('water.againstH', 'Tegen H in')}</option></select></Row>
        <Row label={t('water.factor', 'Partiële factor γ')} unit="—"><NumberInput label={t('water.factor', 'Partiële factor γ')} value={c.factor} onChange={(v) => setC({ factor: v })} /></Row>
        <Hint>{t('water.formula', 'q = ½·ρ·C_D·D·u² per meter, van de waterbodem tot het waterpeil; rekenwaarde γ·q, net als H. C_D hangt af van het getal van Reynolds, de ruwheid en aangroei: vul een onderbouwde waarde in (er is geen standaardwaarde). Niet meegenomen: golfbelasting (Morison, traagheidsterm) en dynamische effecten (wervelafschudding).')}</Hint>
        {info && <Hint>{t('water.result', 'C_D {{cd}}: q aan het oppervlak {{q}} kN/m (representatief); resultante {{F}} kN (rekenwaarde) op NAP {{z}} m.', { cd: nl(info.cd), q: nl(info.qMaxKnM), F: nl(info.resultantKn, 1), z: nl(info.resultantNap) })}</Hint>}
      </>}
    </>}
  </>;
}
