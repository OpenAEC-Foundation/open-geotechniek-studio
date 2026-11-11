// Paaltabel horizontale paal: alle palen in één overzicht, met per rij de
// kernuitkomsten, de lichtste maat die voldoet en de keuze voor de uitdraai.
import { useMemo, useState } from 'react';
import type { TablePanelProps } from '../../framework/types';
import { NumField, NumberInput } from '../../framework/views/SheetForm';
import type { LateralInput } from './compute';
import { computePileTable, defaultRows, lightestSize, rowInput, type LateralRow, type LateralTableConfig, type RowSummary } from './pile-table';
import './pile-table.css';
import { useTranslation } from 'react-i18next';
import { numberLocale } from '../../i18n';

const n = (v: number, d = 1) => Number.isFinite(v) ? v.toLocaleString(numberLocale(), { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
const newId = () => `p${Math.random().toString(36).slice(2, 8)}`;

export function LateralTable({ input, onChange, onOpen, focus, onFocus }: TablePanelProps<LateralInput>) {
  const { t } = useTranslation('calcLateral');
  const config: LateralTableConfig = input.pileTable ?? { rows: defaultRows(input) };
  const rows = config.rows.length ? config.rows : defaultRows(input);
  const update = (patch: Partial<LateralTableConfig>) => onChange({ ...input, pileTable: { ...config, rows, ...patch } });
  const setRow = (id: string, patch: Partial<LateralRow>) => update({ rows: rows.map((r) => r.id === id ? { ...r, ...patch } : r) });
  const key = JSON.stringify({ ...input, pileTable: { ...config, examples: undefined } });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const results = useMemo(() => computePileTable({ ...input, pileTable: { ...config, rows } }), [key]);
  const [lightest, setLightest] = useState<Record<string, { sizeMm: number; summary: RowSummary } | null> | null>(null);
  const examples = new Set(config.examples ?? []);
  const kind = input.section.kind, sizeWord = kind === 'concrete-square' ? t('table.side', 'Zijde') : t('table.diameter', 'Diameter');
  const worstUc = Math.max(...results.map((x) => x.summary.uc ?? 0)), worstY = Math.max(...results.map((x) => Math.abs(x.summary.yHeadMm) || 0));
  const passing = results.filter((x) => x.summary.passes).length;
  const open = (row: LateralRow) => { onChange({ ...rowInput(input, row), pileTable: { ...config, rows } }); onOpen(); };

  return <section className="lat-table" aria-label={t('table.title', 'Paaltabel')}>
    <h2>{t('table.title', 'Paaltabel')}</h2>
    <p className="lat-table-intro">{t('table.intro', 'Alle palen met dezelfde grond en doorsnede, elk met een eigen kopbelasting en zo nodig een eigen lengte of maat. Grond, doorsnede en wapening stel je links in.')}</p>

    <div className="lat-table-settings">
      <label>{t('table.limit', 'Grens kopverplaatsing [mm]')}
        <NumberInput label={t('table.limit', 'Grens kopverplaatsing [mm]')} value={config.maxDisplacementMm} onChange={(v) => update({ maxDisplacementMm: v > 0 ? v : undefined })} />
      </label>
      <span className="lat-table-score" role="status">{t('table.score', '{{passing}} van {{total}} voldoen · max. u.c. {{uc}} · max. y kop {{y}} mm', { passing, total: results.length, uc: n(worstUc, 2), y: n(worstY) })}</span>
      <button type="button" onClick={() => setLightest(Object.fromEntries(rows.map((r) => [r.id, lightestSize(input, r)])))}>{t('table.findLightest', 'Lichtste maat zoeken')}</button>
    </div>

    <div className="lat-table-scroll"><table aria-label={t('table.tableAria', 'Palen met kopbelasting en resultaten')}>
      <thead>
        <tr><th colSpan={4}>{t('table.pileAndLoad', 'Paal en belasting')}</th><th colSpan={6} className="lat-table-res">{t('table.result', 'Resultaat')}</th>{lightest && <th className="lat-table-res">{t('table.lightest', 'Lichtste {{size}}', { size: sizeWord.toLowerCase() })}</th>}<th colSpan={3}>{t('table.deviating', 'Afwijkend van basis')}</th><th colSpan={2} /></tr>
        <tr><th>{t('table.name', 'Naam')}</th><th>H [kN]</th><th>M [kNm]</th><th>N [kN]</th>
          <th className="lat-table-res">u.c.</th><th className="lat-table-res">{t('table.yHead', 'y kop')} [mm]</th><th className="lat-table-res">M max [kNm]</th><th className="lat-table-res">{t('table.atNap', 'op NAP')}</th><th className="lat-table-res">V max [kN]</th><th className="lat-table-res">p/pu</th>
          {lightest && <th className="lat-table-res">[mm]</th>}<th>{t('table.count', 'Aantal')}</th><th>{t('table.length', 'Lengte')} [m]</th><th>{sizeWord} [mm]</th><th>{t('table.report', 'Rapport')}</th><th /></tr>
      </thead>
      <tbody>{results.map(({ row, summary: s }) => <tr key={row.id} className={`${s.ok ? (s.passes ? 'is-pass' : 'is-fail') : 'is-error'}${focus === row.id ? ' is-focus' : ''}`} onClick={() => onFocus(row.id)}>
        <td><input aria-label={t('table.nameAria', 'Naam {{name}}', { name: row.name })} value={row.name} onChange={(e) => setRow(row.id, { name: e.target.value })} /></td>
        <td><NumberInput label={`H ${row.name} [kN]`} value={row.headForceKn} onChange={(v) => setRow(row.id, { headForceKn: v })} /></td>
        <td><NumberInput label={`M ${row.name} [kNm]`} value={row.headMomentKnM} onChange={(v) => setRow(row.id, { headMomentKnM: v })} /></td>
        <td><NumberInput label={`N ${row.name} [kN]`} value={row.nEdKn} onChange={(v) => setRow(row.id, { nEdKn: v })} /></td>
        {s.ok ? <>
          <td className={`num ${s.uc !== null && s.uc <= 1 ? 'is-ok' : 'is-bad'}`}>{s.uc === null ? '—' : n(s.uc, 2)}</td>
          <td className={`num${config.maxDisplacementMm ? (Math.abs(s.yHeadMm) <= config.maxDisplacementMm ? ' is-ok' : ' is-bad') : ''}`}>{n(s.yHeadMm, 1)}</td><td className="num">{n(s.mMaxKnM)}</td><td className="num">{n(s.mNap, 2)}</td><td className="num">{n(s.vMaxKn)}</td>
          <td className="num">{s.mobMax === null ? '—' : `${n(s.mobMax * 100, 0)} %`}</td>
        </> : <td colSpan={6} className="lat-table-error" title={s.error}>{s.error}</td>}
        {lightest && <td className="num">{lightest[row.id] ? <button type="button" className="lat-mini" onClick={(e) => { e.stopPropagation(); setRow(row.id, { diameterMm: lightest[row.id]!.sizeMm }); }} title={`u.c. ${n(lightest[row.id]!.summary.uc ?? NaN, 2)} · y ${n(lightest[row.id]!.summary.yHeadMm)} mm`}>{t('table.adopt', '{{size}} overnemen', { size: lightest[row.id]!.sizeMm })}</button> : t('table.none', 'geen')}</td>}
        <td><NumberInput label={t('table.countAria', 'Aantal {{name}}', { name: row.name })} value={row.count ?? 1} onChange={(v) => setRow(row.id, { count: Math.max(1, Math.round(v)) })} /></td>
        <td><NumField aria-label={t('table.lengthAria', 'Lengte {{name}} [m]', { name: row.name })} placeholder={n(input.lengthM, 2)} value={row.lengthM ?? ''} onChange={(e) => setRow(row.id, { lengthM: e.target.value === '' ? undefined : Number(e.target.value) })} /></td>
        <td><NumField aria-label={`${sizeWord} ${row.name} [mm]`} placeholder={String(input.section.diameterMm)} value={row.diameterMm ?? ''} onChange={(e) => setRow(row.id, { diameterMm: e.target.value === '' ? undefined : Number(e.target.value) })} /></td>
        <td><input type="checkbox" aria-label={t('table.inPrintout', '{{name}} in de uitdraai', { name: row.name })} checked={examples.has(row.id)} onChange={(e) => update({ examples: e.target.checked ? [...examples, row.id] : [...examples].filter((x) => x !== row.id) })} /></td>
        <td className="lat-table-actions">
          <button type="button" className="lat-mini" onClick={(e) => { e.stopPropagation(); open(row); }} aria-label={t('table.sheetAria', 'Rekenblad {{name}}', { name: row.name })}>{t('table.sheet', 'Rekenblad')}</button>
          <button type="button" className="lat-mini" onClick={(e) => { e.stopPropagation(); update({ rows: [...rows, { ...row, id: newId(), name: t('table.copyName', '{{name}} (kopie)', { name: row.name }) }] }); }} aria-label={t('table.duplicate', 'Dupliceer {{name}}', { name: row.name })}>⎘</button>
          <button type="button" className="lat-mini" disabled={rows.length < 2} onClick={(e) => { e.stopPropagation(); update({ rows: rows.filter((r) => r.id !== row.id), examples: [...examples].filter((x) => x !== row.id) }); }} aria-label={t('table.remove', 'Verwijder {{name}}', { name: row.name })}>×</button>
        </td>
      </tr>)}</tbody>
    </table></div>
    <button type="button" className="lat-add" onClick={() => update({ rows: [...rows, { id: newId(), name: t('table.pileName', 'Paal {{n}}', { n: rows.length + 1 }), count: 1, headForceKn: input.headForceKn, headMomentKnM: input.headMomentKnM, nEdKn: input.nEdKn }] })}>{t('table.addPile', '+ Paal')}</button>
    <p className="lat-table-note">{t('table.green', 'Groen: u.c. ≤ {{one}}', { one: n(1, 2) })}{config.maxDisplacementMm ? t('table.greenY', ' en y kop ≤ {{y}} mm', { y: n(config.maxDisplacementMm, 0) }) : ''}. {t('table.note', 'Een lege lengte of maat neemt de waarde van de basisinvoer. De uitdraai bevat de aangevinkte palen volledig uitgewerkt en daarna deze tabel.')}</p>
  </section>;
}
