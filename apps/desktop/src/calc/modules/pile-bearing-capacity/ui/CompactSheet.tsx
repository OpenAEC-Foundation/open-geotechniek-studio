// Beknopt rekenblad: tussenwaarden per laag en de uitkomsten als tabellen,
// met de formule één keer per grootheid. Ook de tabel van de sterktetoets.
import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { fmtNumber } from "../../../i18n";
import { Rich } from "../../laterally-loaded-pile/MaterialTable";
import { soilLabel } from "../catalog";
import { compactArticle, compactLayerTables, compactRows, ucString, type CompactGroup, type LayerTable } from "../parts/compact-sheet";
import type { CheckRow, Note, StrengthResult } from "../parts/strength-check";
import type { PileInput, PileResult } from "../types";

const GROUP_KEY: Record<CompactGroup, [string, string]> = {
  negSkin: ["result.negSkin.title", "Negatieve kleef"], base: ["result.base.title", "Puntdraagvermogen"], shaft: ["result.shaft.title", "Maximumschachtwrijving"],
  capacity: ["result.compact.capacity", "Draagvermogen"], settlement: ["result.compact.settlement", "Zakking"], spring: ["result.spring.title", "Veerwaarde"],
};

function Layers({ title, table }: { title: string; table: LayerTable }) {
  if (!table.rows.length) return null;
  return (
    <div className="pile-formula-scroll">
      <table className="pile-compact-table" aria-label={title}>
        <caption>{title} · <Rich text={table.formula} /></caption>
        <thead><tr>{table.head.map((h, i) => <th key={i} className={i ? "num" : undefined}><Rich text={h} /></th>)}</tr></thead>
        <tbody>
          {table.rows.map((row, i) => <tr key={i}>{row.map((cell, k) => <td key={k} className={k ? "num" : undefined}>{cell}</td>)}</tr>)}
          {table.rows.length > 1 && <tr className="pile-compact-sum">{table.sum.map((cell, k) => <td key={k} className={k ? "num" : undefined}>{cell}</td>)}</tr>}
        </tbody>
      </table>
    </div>
  );
}

export function CompactSheet({ input, result }: { input: PileInput; result: PileResult }) {
  const { t } = useTranslation("calcPile");
  const tables = compactLayerTables(input, result, fmtNumber, soilLabel);
  const rows = compactRows(input, result, fmtNumber);
  return (
    <>
      <section>
        <h3>{t("result.compact.layers", "Tussenwaarden per laag")}</h3>
        <Layers title={t("result.negSkin.title", "Negatieve kleef")} table={tables.neg} />
        <Layers title={t("result.shaft.title", "Maximumschachtwrijving")} table={tables.shaft} />
      </section>
      <section>
        <h3>{t("result.compact.results", "Uitkomsten")}</h3>
        <table className="pile-compact-table pile-compact-results" aria-label={t("result.compact.results", "Uitkomsten")}>
          <thead><tr><th>{t("result.summary.quantity", "Grootheid")}</th><th>{t("result.compact.formula", "Formule")}</th><th className="num">{t("result.compact.value", "Waarde")}</th></tr></thead>
          <tbody>
            {rows.map((row, i) => (
              <Fragment key={i}>
                {(i === 0 || rows[i - 1].group !== row.group) && <tr className="pile-compact-group"><th colSpan={3}>{t(GROUP_KEY[row.group][0], GROUP_KEY[row.group][1])} <small>{compactArticle(row.group, input.standard)}</small></th></tr>}
                <tr><td><Rich text={row.s} /></td><td><Rich text={row.f} /></td><td className="num"><strong>{row.v}</strong></td></tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

/** Tabel "Sterkte van de paal": toets, artikel, rekenwaarde, weerstand, u.c. en oordeel, met de tussenwaarden eronder. */
export function StrengthTable({ strength, pileTopNap }: { strength: StrengthResult; pileTopNap: number }) {
  const { t } = useTranslation("calcPile");
  const note = (n: Note) => t(`strength.notes.${n.key}`, n.nl, n.vars ?? {});
  const verdict = (r: CheckRow) => t(`strength.status.${r.status}`, { ok: "voldoet", fail: "voldoet niet", outside: "valt buiten deze toetsing", na: "niet getoetst", info: "ter informatie" }[r.status]);
  const quantity = (q: CheckRow["demand"]) => !q ? "—" : <><Rich text={q.s} />{Number.isFinite(q.v) ? <> = {fmtNumber(q.v, q.d ?? 1)}{q.u ? ` ${q.u}` : ""}</> : null}</>;
  return (
    <section>
      <h3>{t("strength.title", "Sterkte van de paal")}</h3>
      <p className="pile-result-pending-note">{strength.standard} · N<sub>Ed;max</sub> = N<sub>Ed</sub> + F<sub>nk;d</sub> = {fmtNumber(strength.nEdMaxKn, 0)} kN</p>
      <table className="pile-compact-table pile-strength-table" aria-label={t("strength.title", "Sterkte van de paal")}>
        <thead><tr><th>{t("result.summary.check", "Toets")}</th><th>{t("strength.col.article", "Artikel")}</th><th className="num">{t("strength.col.demand", "Rekenwaarde")}</th><th className="num">{t("strength.col.resistance", "Weerstand")}</th><th className="num">u.c.</th><th>{t("result.summary.result", "Resultaat")}</th></tr></thead>
        <tbody>{strength.rows.map((r) => (
          <Fragment key={r.id}>
            <tr className={`pile-strength-${r.status}`}>
              <td>{t(`strength.rows.${r.id}`, r.label)}{r.zM !== undefined && <><br /><small>NAP {fmtNumber(pileTopNap - r.zM, 2)} m</small></>}</td>
              <td><small>{r.article.replace(/NEN-EN /g, "EN ")}</small></td>
              <td className="num">{quantity(r.demand)}</td><td className="num">{quantity(r.resistance)}</td>
              <td className="num"><strong>{ucString(r.uc, fmtNumber)}</strong></td><td>{verdict(r)}</td>
            </tr>
            {(r.steps.length > 0 || r.note) && <tr className="pile-strength-steps"><td colSpan={6}>
              {r.steps.map((s, k) => <span key={k}><Rich text={s.s} />{s.f ? <> = <Rich text={s.f} /></> : null} = <strong>{fmtNumber(s.v, s.d ?? 1)}{s.u ? ` ${s.u}` : ""}</strong>{k < r.steps.length - 1 ? "; " : ""}</span>)}
              {r.note && <em>{r.steps.length ? " " : ""}{note(r.note)}</em>}
            </td></tr>}
          </Fragment>
        ))}</tbody>
      </table>
      <details className="pile-strength-notes"><summary>{t("strength.notesTitle", "Uitgangspunten en wat niet is getoetst")}</summary>{strength.notes.map((n) => <p key={n.key}>{note(n)}</p>)}</details>
    </section>
  );
}
