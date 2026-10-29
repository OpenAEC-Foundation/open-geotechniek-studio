import { useState } from "react";
import { normalizeCpt, type NormalizedInput } from "./normalized";
const fields = [
  ["qcMpa", "qc [MPa]"],
  ["fsMpa", "fs [MPa]"],
  ["u2Mpa", "u2 [MPa]"],
  ["areaRatio", "Conusoppervlakteverhouding a"],
  ["totalStressKpa", "Totale spanning σv0 [kPa]"],
  ["waterPressureKpa", "Hydrostatische druk u0 [kPa]"],
] as const;
export default function NormalizedPanel() {
  const [input, setInput] = useState<NormalizedInput>({
    qcMpa: 10.1,
    fsMpa: 0.1,
    u2Mpa: 0,
    areaRatio: 0.8,
    totalStressKpa: 100,
    waterPressureKpa: 0,
  });
  const result = normalizeCpt(input),
    f = (n: number) => n.toLocaleString("nl-NL", { maximumFractionDigits: 3 });
  return (
    <details className="normalized-panel">
      <summary>Genormaliseerde SBTn-puntanalyse</summary>
      <p>
        Puntanalyse Qt / Fr / Bq / Ic met opgegeven spanningen, volgens
        Robertson–Wride (vaste exponent n = 1).
      </p>
      {fields.map(([key, label]) => (
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
      ))}
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
          <dt>Ic / zone</dt>
          <dd>
            {f(result.Ic)} · {result.zone.number}: {result.zone.name}
          </dd>
        </dl>
      ) : (
        <p role="alert">{result.error}</p>
      )}
      <p>
        Gevoelige en gecementeerde gronden (zones 1, 8, 9) volgen niet uit Ic
        alleen. Geen omzetting naar een NEN-grondbeschrijving.
      </p>
      <a
        href="https://www.cpt-robertson.com/PublicationsPDF/In-Situ-Testing-Guide-2024.pdf"
        target="_blank"
        rel="noreferrer"
      >
        Robertson & Cabal, 2022, figuur 16
      </a>
    </details>
  );
}
