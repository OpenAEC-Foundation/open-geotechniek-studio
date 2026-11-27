// Blok "Materiaaltoetsing" van de uitdraai: per toets het artikel, de
// rekenwaarde, de weerstand, de u.c. en het oordeel, met de tussenstappen
// uitklapbaar eronder.
import { Fragment, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { numberLocale } from '../../i18n';
import type { CheckRow, MaterialResult, Note, Quantity } from './material-types';

const num = (v: number, d = 1) => Number.isFinite(v) ? v.toLocaleString(numberLocale(), { minimumFractionDigits: d, maximumFractionDigits: d }) : v === Infinity ? '∞' : '—';
export const ucText = (uc: number | null) => uc === null ? '—' : uc === Infinity ? '∞' : uc > 99 ? '> 99' : num(uc, 2);

const SCRIPT = /_(\{[^}]*\}|[A-Za-zΑ-ω0-9']+(?:[;,][A-Za-zΑ-ω0-9']+)*)|\^(\{[^}]*\}|[-+−]?\d+)/g;
const bare = (s: string) => s.startsWith('{') ? s.slice(1, -1) : s;
/** Rapportnotatie (V_Rd,c, k^{3/2}) als tekst met sub- en superscript. */
export function Rich({ text }: { text: string }): ReactNode {
  const out: ReactNode[] = []; let last = 0, k = 0;
  for (const m of text.matchAll(SCRIPT)) {
    out.push(text.slice(last, m.index));
    out.push(m[1] !== undefined ? <sub key={k++}>{bare(m[1])}</sub> : <sup key={k++}>{bare(m[2])}</sup>);
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return <>{out}</>;
}

const quantity = (q: Quantity | undefined) => !q ? '—' : <><Rich text={q.s} />{Number.isFinite(q.v) ? <> = {num(q.v, q.d ?? 1)}{q.u ? ` ${q.u}` : ''}</> : null}</>;

export function MaterialTable({ material, nap }: { material: MaterialResult; nap: (zM: number) => string }) {
  const { t } = useTranslation('calcLateral');
  const note = (n: Note) => t(`material.notes.${n.key}`, n.nl, n.vars ?? {});
  const label = (r: CheckRow) => t(`material.rows.${r.id}`, r.label);
  const verdict = (r: CheckRow) => r.status === 'ok' ? t('material.status.ok', 'voldoet') : r.status === 'fail' ? t('material.status.fail', 'voldoet niet')
    : r.status === 'outside' ? t('material.status.outside', 'valt buiten deze toetsing') : r.status === 'na' ? t('material.status.na', 'niet getoetst') : t('material.status.info', 'ter informatie');
  return <div className="lateral-material">
    <p className="pile-result-pending-note">{material.standard}</p>
    <table className="pile-sheet-checks lateral-material-table" aria-label={t('material.title', 'Materiaaltoetsing')}>
      <thead><tr><th>{t('material.col.check', 'Toets')}</th><th>{t('material.col.article', 'Artikel')}</th><th>{t('material.col.demand', 'Rekenwaarde')}</th><th>{t('material.col.resistance', 'Weerstand')}</th><th>u.c.</th><th>{t('material.col.verdict', 'Oordeel')}</th></tr></thead>
      <tbody>{material.rows.map((r) => <Fragment key={r.id}>
        <tr className={`lateral-material-${r.status}`}>
          <td>{label(r)}{r.zM !== undefined && <><br /><small>{nap(r.zM)}</small></>}</td>
          <td><small>{r.article.replace(/NEN-EN /g, 'EN ')}</small></td>
          <td className="num">{quantity(r.demand)}</td><td className="num">{quantity(r.resistance)}</td>
          <td className="num"><strong>{ucText(r.uc)}</strong></td><td>{verdict(r)}</td>
        </tr>
        {(r.steps.length > 0 || r.note) && <tr className="lateral-material-steps"><td colSpan={6}>
          {r.steps.length > 0 && <details><summary>{t('material.steps', 'Tussenstappen')}</summary>
            <ul>{r.steps.map((s, k) => <li key={k}><Rich text={s.s} />{s.f ? <> = <Rich text={s.f} /></> : null} = <strong>{num(s.v, s.d ?? 1)}{s.u ? ` ${s.u}` : ''}</strong></li>)}</ul>{r.note && <p>{note(r.note)}</p>}</details>}
          {r.note && r.steps.length === 0 && <small>{note(r.note)}</small>}
        </td></tr>}
      </Fragment>)}</tbody>
    </table>
    <details className="lateral-sheet-more"><summary>{t('material.notesTitle', 'Uitgangspunten van de toetsing')}</summary>{material.notes.map((n) => <p key={n.key}>{note(n)}</p>)}</details>
  </div>;
}
