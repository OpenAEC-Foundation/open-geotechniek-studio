// Uitklapblok "Verificatie" bij de afroesting: de verificatiegevallen live doorgerekend met de huidige code, met per
// regel de verwachte waarde, de waarde van de module, het verschil en groen of rood.
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { numberLocale } from "../i18n";
import { rowDiff, rowOk, sheetVerification, type VerificationRow } from "./corrosion-verification";
import { tubeVerification } from "../modules/laterally-loaded-pile/corrosion-verification";

const num = (v: number) => v.toLocaleString(numberLocale(), { maximumFractionDigits: Math.abs(v) >= 100 ? 1 : 3 });

export function CorrosionVerification({ set }: { set: "sheet" | "tube" }) {
  const { t } = useTranslation("calc");
  const rows: VerificationRow[] = useMemo(() => { try { return set === "tube" ? tubeVerification() : sheetVerification(); } catch { return []; } }, [set]);
  const good = rows.filter(rowOk).length;
  return <details className="cs-verification">
    <summary>{t("corrosion.verification", "Verificatie")} · {good}/{rows.length} {t("corrosion.verificationOk", "in orde")}</summary>
    <div className="cs-table-wrap"><table className="cs-layer-table" aria-label={t("corrosion.verification", "Verificatie")}>
      <thead><tr><th>{t("corrosion.vCase", "Geval")}</th><th>{t("corrosion.vInput", "Invoer")}</th><th>{t("corrosion.vQuantity", "Grootheid")}</th><th>{t("corrosion.vExpected", "Verwacht")}</th><th>{t("corrosion.vModule", "Module")}</th><th>{t("corrosion.vDiff", "Verschil")}</th><th /></tr></thead>
      <tbody>{rows.map((r, k) => { const ok = rowOk(r), d = rowDiff(r); return <tr key={k} title={r.basis}>
        <td>{r.id}</td><td>{r.input}</td><td>{r.quantity}</td><td>{num(r.expected)}</td><td>{num(r.actual)}</td>
        <td>{r.tolerance === 0 ? (ok ? "0" : "≠") : `${(100 * d).toLocaleString(numberLocale(), { maximumFractionDigits: 2 })} %`}</td>
        <td style={{ color: ok ? "var(--oa-success, #15803d)" : "var(--oa-danger, #b91c1c)" }}>{ok ? "✓" : "✗"}</td></tr>; })}</tbody>
    </table></div>
  </details>;
}
