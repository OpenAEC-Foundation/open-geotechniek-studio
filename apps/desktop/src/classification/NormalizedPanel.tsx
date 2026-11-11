import { useState } from "react";
import { useTranslation } from "react-i18next";
import { numberLocale } from "../calc/i18n";
import { normalizeCpt, type NormalizedInput } from "./normalized";
const fields = [
  ["qcMpa", "qc [MPa]", null],
  ["fsMpa", "fs [MPa]", null],
  ["u2Mpa", "u2 [MPa]", null],
  ["areaRatio", "Conusoppervlakteverhouding a", "normalized.field.areaRatio"],
  ["totalStressKpa", "Totale spanning σv0 [kPa]", "normalized.field.totalStress"],
  ["waterPressureKpa", "Hydrostatische druk u0 [kPa]", "normalized.field.waterPressure"],
] as const;
export default function NormalizedPanel() {
  const { t } = useTranslation("panels");
  const [input, setInput] = useState<NormalizedInput>({
    qcMpa: 10.1,
    fsMpa: 0.1,
    u2Mpa: 0,
    areaRatio: 0.8,
    totalStressKpa: 100,
    waterPressureKpa: 0,
  });
  const result = normalizeCpt(input),
    f = (n: number) => n.toLocaleString(numberLocale(), { maximumFractionDigits: 3 });
  return (
    <details className="normalized-panel">
      <summary>{t("normalized.title", "Genormaliseerde SBTn-puntanalyse")}</summary>
      <p>
        {t("normalized.intro", "Puntanalyse Qt / Fr / Bq / Ic met opgegeven spanningen, volgens Robertson–Wride (vaste exponent n = 1).")}
      </p>
      {fields.map(([key, source, i18nKey]) => {
        const label = i18nKey ? t(i18nKey, source) : source;
        return (
        <label key={key}>
          {label}
          <input
            type="number"
            step="any"
            aria-label={label}
            value={Number.isFinite(input[key]) ? input[key] : ""}
            onChange={(e) =>
              setInput({ ...input, [key]: e.target.valueAsNumber })
            }
          />
        </label>
        );
      })}
      {result.ok ? (
        <dl>
          <dt>qt</dt>
          <dd>{f(result.qtMpa)} MPa</dd>
          <dt>σ′v0</dt>
          <dd>{f(result.effectiveStressKpa)} kPa</dd>
          <dt>Qt / Fr / Bq</dt>
          <dd>
            {f(result.Qt)} / {f(result.Fr)}% / {f(result.Bq)}
          </dd>
          <dt>{t("normalized.icZone", "Ic / zone")}</dt>
          <dd>
            {f(result.Ic)} · {result.zone.number}: {t(`normalized.zones.z${result.zone.number}`, { defaultValue: result.zone.name })}
          </dd>
        </dl>
      ) : (
        <p role="alert">{result.error}</p>
      )}
      <p>
        {t("normalized.note", "Gevoelige en gecementeerde gronden (zones 1, 8, 9) volgen niet uit Ic alleen. Geen omzetting naar een NEN-grondbeschrijving.")}
      </p>
      <a
        href="https://www.cpt-robertson.com/PublicationsPDF/In-Situ-Testing-Guide-2024.pdf"
        target="_blank"
        rel="noreferrer"
      >
        {t("normalized.reference", "Robertson & Cabal, 2022, figuur 16")}
      </a>
    </details>
  );
}
