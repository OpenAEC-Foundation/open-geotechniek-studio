import { useState } from "react";
import type { Cpt } from "../types/cpt";
import { validationOf } from "./report";
import { downloadBlobAsFile } from "../utils/browserSave";
import { outliersOf, withBroOutliers } from "./depthOutliers";
import { useCptStore } from "../store/useCptStore";
import { IS_TAURI } from "../utils/platform";
export default function ValidationPanel({ cpt }: { cpt: Cpt }) {
  const outliers = outliersOf(cpt);
  const report = validationOf(cpt),
    [error, setError] = useState<string | null>(null);
  if (!report)
    return (
      <p className="panel-empty">
        Dit bestand heeft nog geen validatierapport. Importeer het opnieuw met
        de actuele parser.
      </p>
    );
  const errors = report.diagnostics.filter(
      (d) => d.severity === "error",
    ).length,
    warnings = report.diagnostics.filter(
      (d) => d.severity === "warning",
    ).length;
  const save = async (format: "json" | "csv") => {
    try {
      const quote = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const text =
        format === "json"
          ? JSON.stringify(report, null, 2)
          : [
              ["severity", "code", "line", "record", "column", "message"],
              ...report.diagnostics.map((d) => [
                d.severity,
                d.code,
                d.line,
                d.record,
                d.column,
                d.message,
              ]),
            ]
              .map((row) => row.map(quote).join(","))
              .join("\r\n");
      const name = `${cpt.id}-validatie.${format}`;
      if (IS_TAURI) {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const path = await save({ defaultPath: name });
        if (path) {
          const { writeTextFile } = await import("@tauri-apps/plugin-fs");
          await writeTextFile(path, text);
        }
      } else
        await downloadBlobAsFile(
          new Blob([text], {
            type: format === "json" ? "application/json" : "text/csv",
          }),
          name,
        );
    } catch (e) {
      setError(String(e));
    }
  };
  return (
    <div className="validation-panel">
      <p>
        {errors} fouten · {warnings} waarschuwingen
      </p>
      <p>
        {cpt.points.length} meetpunten · {report.voids} voids ·{" "}
        {report.omittedRecords} weggelaten records
      </p>
      {report.depthMethod && <p>Diepte: {({'corrected-depth':'gemeten gecorrigeerde diepte','inclination-corrected':'hellingcorrectie uit sondeerlengte','penetration-length':'sondeerlengte als verticale benadering','mixed':'gemengde methoden; per record in JSON'} as Record<string,string>)[report.depthMethod]??report.depthMethod}</p>}
      {cpt.metadata.predrilled_depth_m != null && (
        <p>Voorgeboord: {cpt.metadata.predrilled_depth_m} m</p>
      )}
      {cpt.metadata.pre_excavated_depth_m != null && (
        <p>Voorontgraven: {cpt.metadata.pre_excavated_depth_m} m</p>
      )}
      {cpt.metadata.removed_layers?.map((layer, i) => (
        <p key={i}>
          Laag tot {layer.bottom_depth_m} m: {layer.description}
        </p>
      ))}
      {cpt.metadata.quality_regime && (
        <p>Regime: {cpt.metadata.quality_regime}</p>
      )}
      {cpt.metadata.measurements && cpt.metadata.measurements.length>0 && <details><summary>Meetgrootheden & eenheden ({cpt.metadata.measurements.length})</summary><dl>{cpt.metadata.measurements.map((m,i)=><div key={i}><dt>{m.name}</dt><dd>{m.value??'—'} {m.unit}</dd></div>)}</dl></details>}
      {report.measurementVariables && <details><summary>Meetvariabelen & nulmetingen</summary><dl>{Object.entries(report.measurementVariables).map(([id,m])=><div key={id}><dt>{id}: {m.description}</dt><dd>{m.value??'—'} {m.unit}</dd></div>)}</dl></details>}
      {outliers && (
        <label>
          <input
            type="checkbox"
            checked={outliers.included}
            onChange={(e) =>
              useCptStore
                .getState()
                .replaceCpt(withBroOutliers(cpt, e.target.checked))
            }
          />{" "}
          Toon {outliers.excluded.length} uitschieters (bronrecords{" "}
          {outliers.excluded.join(", ")})
        </label>
      )}
      <div className="validation-actions">
        <button onClick={() => void save("json")}>JSON</button>
        <button onClick={() => void save("csv")}>CSV</button>
        <a
          href={`https://github.com/OpenAEC-Foundation/open-geotechniek-studio/issues/new?title=${encodeURIComponent("Validatie: " + cpt.id)}`}
          target="_blank"
          rel="noreferrer"
        >
          Meld dit bestand
        </a>
      </div>
      {error && <p role="alert">{error}</p>}
      {report.diagnostics.length > 0 && (
        <details>
          <summary>Diagnostiek ({report.diagnostics.length})</summary>
          <ol>
            {report.diagnostics.slice(0, 100).map((d, i) => (
              <li key={i}>
                <strong>{d.code}</strong> {d.line != null && `regel ${d.line}`}{" "}
                {d.record != null && `record ${d.record}`}{" "}
                {d.column != null && `kolom ${d.column}`} — {d.message}
              </li>
            ))}
          </ol>
          {report.diagnostics.length > 100 && (
            <p>Exporteer het rapport voor alle meldingen.</p>
          )}
        </details>
      )}
    </div>
  );
}
