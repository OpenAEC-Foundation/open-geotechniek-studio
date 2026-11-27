// Varianten naast elkaar: bij dezelfde grond en belasting per variant een
// eigen paaltype, maat, wand of wapening, sterkteklasse en paalpunt, met in
// één tabel het gewicht, de verplaatsing, het moment en de maatgevende toets.
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '../../../components/Modal';
import { NumField, NumberInput } from '../../framework/views/SheetForm';
import { OaIcon } from '../../../components/icons/oaIcon';
import { numberLocale } from '../../i18n';
import type { LateralInput } from './compute';
import type { SectionKind } from './section';
import { CONCRETE_CLASSES, STEEL_GRADES, concreteClassOf, designConcrete, steelGradeOf } from './materials';
import { SHEET_PILE_GRADES, findSheetPile, sheetPileCatalog } from '../../library/sheetPiles';
import { defaultSheet } from './sheet-section';
import { nearest } from '../pile-bearing-capacity/standard-sizes';
import { KIND_KEYS, designOf, evaluateVariant, newVariant, reshape, systemFor, withSystem, applyDesign, type LateralVariant, type VariantDesign, type VariantOutcome, type VariantsConfig } from './variants';
import { OPT_KINDS, seriesOf } from './optimizer';
import { OptimizerDialog } from './OptimizerDialog';
import './variants.css';

const n = (v: number, d = 1) => Number.isFinite(v) ? v.toLocaleString(numberLocale(), { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const same = (a: VariantDesign, b: VariantDesign) => JSON.stringify(a) === JSON.stringify(b);

/** Knoppen boven de invoer: Varianten en Optimaliseren. */
export function VariantsBar({ input, onChange }: { input: LateralInput; onChange?: (next: LateralInput) => void }) {
  const { t } = useTranslation('calcLateral');
  const [open, setOpen] = useState<'variants' | 'optimizer' | null>(null);
  const count = input.variants?.items.length ?? 0;
  if (!onChange) return null;
  return <div className="lat-variants-bar">
    <button type="button" onClick={() => setOpen('variants')}>{t('variants.button', 'Varianten')}{count ? ` (${count})` : ''}</button>
    <button type="button" onClick={() => setOpen('optimizer')}>{t('optimizer.button', 'Optimaliseren')}</button>
    {open === 'variants' && <VariantsPanel input={input} onChange={onChange} onClose={() => setOpen(null)} onOptimize={() => setOpen('optimizer')} />}
    {open === 'optimizer' && <OptimizerDialog input={input} onChange={onChange} onClose={() => setOpen(null)} onShowVariants={() => setOpen('variants')} />}
  </div>;
}

export function VariantsPanel({ input, onChange, onClose, onOptimize }: { input: LateralInput; onChange: (next: LateralInput) => void; onClose: () => void; onOptimize?: () => void }) {
  const { t } = useTranslation('calcLateral');
  const cfg: VariantsConfig = input.variants ?? { items: [] };
  const update = (patch: Partial<VariantsConfig>) => onChange({ ...input, variants: { ...cfg, ...patch } });
  const setItems = (items: LateralVariant[]) => update({ items });
  const setDesign = (id: string, d: VariantDesign) => setItems(cfg.items.map((v) => v.id === id ? { ...v, design: d } : v));
  const current = designOf(input), head = input.headNap ?? 0;
  const key = JSON.stringify({ ...input, variants: { items: cfg.items, maxDisplacementMm: cfg.maxDisplacementMm } });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const outcomes = useMemo(() => new Map(cfg.items.map((v) => [v.id, evaluateVariant(input, v.design, cfg.maxDisplacementMm)])), [key]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const currentOutcome = useMemo(() => evaluateVariant(input, current, cfg.maxDisplacementMm), [key]);
  const lightest = Math.min(...[...outcomes.values()].filter((o) => o.passes).map((o) => o.mass.totalKg));
  const add = (d: VariantDesign) => setItems([...cfg.items, newVariant(cfg, d)]);

  const row = (v: LateralVariant | null, d: VariantDesign, o: VariantOutcome) => {
    const s = d.section, tube = s.kind === 'steel-tube' || s.kind === 'filled-tube', sheet = s.kind === 'sheet-pile', bars = !sheet && s.kind !== 'steel-tube';
    const edit = (next: VariantDesign) => v && setDesign(v.id, next), ro = !v, name = v?.name ?? t('variants.current', 'Huidige invoer');
    const series = seriesOf(s.kind), sheetCfg = s.sheet ?? defaultSheet();
    const kindChange = (kind: SectionKind) => {
      const toTube = kind === 'steel-tube' || kind === 'filled-tube';
      const patch = kind === 'sheet-pile' ? { kind, sheet: s.sheet ?? defaultSheet(), diameterMm: findSheetPile((s.sheet ?? defaultSheet()).profileId)?.wallHeightMm ?? s.diameterMm }
        : { kind, diameterMm: nearest(seriesOf(kind), s.diameterMm), barCount: kind === 'concrete-square' ? Math.max(4, Math.round(s.barCount / 4) * 4) : s.barCount, ...(toTube ? { wallMm: Math.max(s.wallMm, 8) } : {}) };
      edit(withSystem(reshape(d, patch), systemFor(kind, d.pileSystemId)));
    };
    const active = same(d, current);
    return <tr key={v?.id ?? 'current'} className={`${o.ok ? (o.passes ? 'is-pass' : 'is-fail') : 'is-error'}${active ? ' is-active' : ''}${ro ? ' is-current' : ''}`}>
      <td>{ro ? <span className="lat-var-name">{name}</span> : <input aria-label={t('variants.nameAria', 'Naam {{name}}', { name })} value={name} onChange={(e) => setItems(cfg.items.map((x) => x.id === v!.id ? { ...x, name: e.target.value } : x))} />}</td>
      <td><select aria-label={t('variants.kindAria', 'Paaltype {{name}}', { name })} disabled={ro} value={s.kind} onChange={(e) => kindChange(e.target.value as SectionKind)}>
        {OPT_KINDS.map((k) => <option key={k} value={k}>{t(`input.kinds.${KIND_KEYS[k][0]}`, KIND_KEYS[k][1])}</option>)}</select></td>
      <td>{sheet
        ? <select aria-label={t('variants.sizeAria', 'Maat {{name}}', { name })} disabled={ro} value={`${sheetCfg.manufacturer ?? ''}|${sheetCfg.profileId}`} onChange={(e) => { const [manufacturer, profileId] = e.target.value.split('|'); edit(reshape(d, { sheet: { ...sheetCfg, manufacturer, profileId }, diameterMm: findSheetPile(profileId, manufacturer)?.wallHeightMm ?? s.diameterMm })); }}>
          {[...sheetPileCatalog()].flatMap(([maker, list]) => [...list].map(([sname, ps]) => <optgroup key={maker + sname} label={`${maker} · ${sname}`}>{ps.filter((p) => p.iCm4PerM !== null).map((p) => <option key={p.id} value={`${p.manufacturer}|${p.id}`}>{p.id}</option>)}</optgroup>))}</select>
        : <select aria-label={t('variants.sizeAria', 'Maat {{name}}', { name })} disabled={ro} value={s.diameterMm} onChange={(e) => edit(reshape(d, { diameterMm: Number(e.target.value) }))}>
          {!series.includes(s.diameterMm) && <option value={s.diameterMm}>{n(s.diameterMm, 1)}</option>}{series.map((x) => <option key={x} value={x}>{s.kind === 'concrete-square' ? '□' : 'Ø'}{String(x).replace('.', ',')}</option>)}</select>}</td>
      <td className="lat-var-detail">{tube && <label>{t('variants.wallShort', 't')} <NumField aria-label={t('variants.wallAria', 'Wand {{name}} [mm]', { name })} disabled={ro} value={s.wallMm} onChange={(e) => { const x = Number(e.target.value); if (x > 0) edit(reshape(d, { wallMm: x })); }} /></label>}
        {bars && <><NumField aria-label={t('variants.barsAria', 'Staven {{name}}', { name })} disabled={ro} value={s.barCount} onChange={(e) => { const x = Math.round(Number(e.target.value)); if (x >= 0) edit(reshape(d, { barCount: x })); }} />×Ø<NumField aria-label={t('variants.barDiaAria', 'Staafdiameter {{name}} [mm]', { name })} disabled={ro} value={s.barDiameterMm} onChange={(e) => { const x = Number(e.target.value); if (x > 0) edit(reshape(d, { barDiameterMm: x })); }} /></>}</td>
      <td>{sheet ? <select aria-label={t('variants.steelAria', 'Staalsoort {{name}}', { name })} disabled={ro} value={sheetCfg.grade} onChange={(e) => edit(reshape(d, { sheet: { ...sheetCfg, grade: e.target.value } }))}>{SHEET_PILE_GRADES.map((g) => <option key={g.grade}>{g.grade}</option>)}</select>
        : tube ? <select aria-label={t('variants.steelAria', 'Staalsoort {{name}}', { name })} disabled={ro} value={steelGradeOf(s.tubeFydMpa)} onChange={(e) => edit(reshape(d, { tubeFydMpa: STEEL_GRADES.find((g) => g.id === e.target.value)!.fyMpa }))}>{!steelGradeOf(s.tubeFydMpa) && <option value="">{n(s.tubeFydMpa, 0)}</option>}{STEEL_GRADES.map((g) => <option key={g.id}>{g.id}</option>)}</select> : '—'}</td>
      <td>{bars ? <select aria-label={t('variants.concreteAria', 'Betonklasse {{name}}', { name })} disabled={ro} value={concreteClassOf(s.fckMpa, s.fcdMpa)} onChange={(e) => { const c = CONCRETE_CLASSES.find((x) => x.id === e.target.value)!; edit(reshape(d, { fckMpa: c.fckMpa, fcdMpa: designConcrete(c.fckMpa) })); }}>{!concreteClassOf(s.fckMpa, s.fcdMpa) && <option value="">{n(s.fckMpa, 0)}</option>}{CONCRETE_CLASSES.map((c) => <option key={c.id}>{c.id}</option>)}</select> : '—'}</td>
      <td><NumField aria-label={t('variants.toeAria', 'Paalpunt {{name}} [m NAP]', { name })} disabled={ro} value={r3(head - d.lengthM)} onChange={(e) => { const x = Number(e.target.value); if (head - x > 0) edit({ ...d, lengthM: r3(head - x) }); }} /></td>
      <td className="num lat-var-res">{n(o.mass.totalKg, 0)}</td><td className="num lat-var-res">{n(o.mass.steelKg, 0)}</td><td className="num lat-var-res">{o.mass.concreteM3 > 0 ? n(o.mass.concreteM3, 2) : '—'}</td>
      <td className="num lat-var-res">{n(o.lengthM, 2)}</td>
      {o.ok ? <>
        <td className={`num lat-var-res${cfg.maxDisplacementMm ? (Math.abs(o.yHeadMm) <= cfg.maxDisplacementMm ? ' is-ok' : ' is-bad') : ''}`}>{n(o.yHeadMm, 1)}</td><td className="num lat-var-res">{n(o.mMaxKnM, 1)}</td>
        <td className={`num lat-var-res ${o.uc !== null && o.uc <= 1 ? 'is-ok' : 'is-bad'}`}>{o.uc === null ? '—' : o.uc === Infinity ? '∞' : n(o.uc, 2)}</td>
        <td className="lat-var-res lat-var-check">{o.checkId === 'nm' ? t('variants.nmCheck', 'N–M-toets') : o.checkId ? t(`material.rows.${o.checkId}`, o.checkLabel ?? '') : '—'}</td>
        <td className={`lat-var-res ${o.passes ? 'is-ok' : 'is-bad'}`}>{o.passes ? t('variants.pass', 'voldoet') : o.outside ? t('variants.outside', 'buiten toetsing') : t('variants.fail', 'voldoet niet')}{o.passes && o.mass.totalKg === lightest ? ` · ${t('variants.lightest', 'lichtste')}` : ''}</td>
      </> : <td colSpan={5} className="lat-var-res lat-table-error" title={o.error}>{o.error}</td>}
      <td className="lat-table-actions">
        {v ? <>
          <button type="button" className="lat-mini" disabled={active} onClick={() => { onChange(applyDesign(input, d)); }} title={t('variants.chooseTitle', 'Als actieve invoer zetten')}>{active ? t('variants.active', 'actief') : t('variants.choose', 'Kiezen')}</button>
          <button type="button" className="lat-mini" aria-label={t('variants.copyAria', 'Kopieer {{name}}', { name })} onClick={() => setItems([...cfg.items, { ...newVariant(cfg, d), name: t('variants.copyName', '{{name}} (kopie)', { name }) }])}>⎘</button>
          <button type="button" className="lat-mini" aria-label={t('variants.removeAria', 'Verwijder {{name}}', { name })} onClick={() => setItems(cfg.items.filter((x) => x.id !== v.id))}><OaIcon id="edit.delete" /></button>
        </> : <button type="button" className="lat-mini" onClick={() => add(current)}>{t('variants.add', '+ Als variant')}</button>}
      </td>
    </tr>;
  };

  return <Modal open onClose={onClose} title={t('variants.title', 'Varianten')} width={1180} className="lat-variants-modal">
    <section className="lat-table lat-variants" aria-label={t('variants.title', 'Varianten')}>
      <p className="lat-table-intro">{t('variants.intro', 'Zelfde grond en belasting, per variant een eigen paal. Kopieer een variant en wijzig één veld; "Kiezen" zet de variant als invoer.')}</p>
      <div className="lat-table-settings">
        <label>{t('table.limit', 'Grens kopverplaatsing [mm]')}
          <NumberInput label={t('table.limit', 'Grens kopverplaatsing [mm]')} value={cfg.maxDisplacementMm} onChange={(x) => update({ maxDisplacementMm: x > 0 ? x : undefined })} /></label>
        <label className="lat-var-check-in"><span><input type="checkbox" checked={!!cfg.inReport} onChange={(e) => update({ inReport: e.target.checked || undefined })} /> {t('variants.inReport', 'Blad "Varianten" in de uitdraai')}</span></label>
        {onOptimize && <button type="button" onClick={onOptimize}>{t('optimizer.button', 'Optimaliseren')}…</button>}
        {cfg.items.length > 0 && <button type="button" onClick={() => setItems([])}>{t('variants.clear', 'Alle varianten wissen')}</button>}
      </div>
      <div className="lat-table-scroll"><table aria-label={t('variants.tableAria', 'Vergelijking van varianten')}>
        <thead>
          <tr><th colSpan={7}>{t('variants.design', 'Paal')}</th><th colSpan={4} className="lat-table-res">{t('variants.weight', 'Gewicht en lengte')}</th><th colSpan={5} className="lat-table-res">{t('table.result', 'Resultaat')}</th><th /></tr>
          <tr><th>{t('table.name', 'Naam')}</th><th>{t('variants.kind', 'Paaltype')}</th><th>{t('variants.size', 'Maat')} [mm]</th><th>{t('variants.wallBars', 'Wand / wapening')}</th><th>{t('variants.steel', 'Staal')}</th><th>{t('variants.concrete', 'Beton')}</th><th>{t('variants.toe', 'Paalpunt')} [m NAP]</th>
            <th className="lat-table-res">{t('variants.massPile', 'kg/paal')}</th><th className="lat-table-res">{t('variants.massSteel', 'kg staal')}</th><th className="lat-table-res">{t('variants.volume', 'beton')} [m³]</th><th className="lat-table-res">L [m]</th>
            <th className="lat-table-res">{t('table.yHead', 'y kop')} [mm]</th><th className="lat-table-res">M max [kNm]</th><th className="lat-table-res">u.c.</th><th className="lat-table-res">{t('variants.check', 'Toets')}</th><th className="lat-table-res">{t('variants.verdict', 'Oordeel')}</th><th /></tr>
        </thead>
        <tbody>
          {row(null, current, currentOutcome)}
          {cfg.items.map((v) => row(v, v.design, outcomes.get(v.id)!))}
        </tbody>
      </table></div>
      {!cfg.items.length && <p className="lat-table-note">{t('variants.empty', 'Nog geen varianten. Zet de huidige invoer als variant, of laat de optimalisatie varianten zoeken.')}</p>}
      <p className="lat-table-note">{t('variants.note', 'Gewicht: staal 7850 kg/m³, beton 2400 kg/m³ over het netto betonoppervlak; langswapening over de hele lengte, beugels niet meegeteld. Toets: de hoogste u.c. van de N–M-toets en de materiaaltoetsing.')}</p>
    </section>
  </Modal>;
}
