import { useEffect, useState } from "react";
import type { Layer } from "../../types/cpt";
import { useCptStore } from "../../store/useCptStore";
import {
  analyzeLayers,
  withLayerInterpretation,
} from "../../utils/layerAnalysis";
import { zones } from "../../utils/soilZones";
import { IS_TAURI } from "../../utils/platform";
import { downloadBlobAsFile } from "../../utils/browserSave";
import "./LayerPanel.css";
export default function LayerPanel({ cptId }: { cptId: string | null }) {
  const cpt = useCptStore((state) => state.cpts.get(cptId ?? ""));
  const [editing, setEditing] = useState(false),
    [draft, setDraft] = useState<Layer[]>([]),
    [minimum, setMinimum] = useState("0.1"),
    [hysteresis, setHysteresis] = useState("0.1"),
    [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setEditing(false);
    setError(null);
  }, [cptId]);
  if (!cpt) return <p className="panel-empty">Geen sondering geselecteerd.</p>;
  const report = analyzeLayers(cpt);
  const begin = () => {
    setDraft(report.layers.map((layer) => ({ ...layer })));
    setMinimum(String(report.provenance.settings.minimumThicknessM));
    setHysteresis(String(report.provenance.settings.hysteresisM));
    setEditing(true);
    setError(null);
  };
  const save = (manual: boolean) => {
    try {
      if (!minimum.trim() || !hysteresis.trim())
        throw new Error("Vul minimumdikte en hysterese in.");
      useCptStore
        .getState()
        .replaceCpt(
          withLayerInterpretation(
            cpt,
            {
              minimumThicknessM: Number(minimum),
              hysteresisM: Number(hysteresis),
            },
            manual ? draft : undefined,
          ),
        );
      setEditing(false);
      setError(null);
    } catch (error) {
      setError(String(error));
    }
  };
  const exportReport = async () => {
    try {
      const filename = `${cpt.id.replace(/[\\/:*?"<>|]/g, "_")}.layers.json`;
      const value = {
        ...report.provenance,
        warnings: report.warnings,
        interpretation:
          "Indicatieve qc/Rf-zones; handmatige grenzen zijn eigen interpretatie, geen grondsoortverificatie.",
      };
      if (IS_TAURI) {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const path = await save({
          defaultPath: filename,
          filters: [{ name: "Laaginterpretatie JSON", extensions: ["json"] }],
        });
        if (path) {
          const { writeTextFile } = await import("@tauri-apps/plugin-fs");
          await writeTextFile(path, JSON.stringify(value, null, 2));
        }
      } else
        downloadBlobAsFile(
          new Blob([JSON.stringify(value, null, 2)], {
            type: "application/json",
          }),
          filename,
        );
    } catch (error) {
      setError(String(error));
    }
  };
  const split = () =>
    setDraft((current) => {
      const last = current[current.length - 1];
      if (!last) {
        const zone = zones[0];
        return [
          {
            depth_top: 0,
            depth_bottom: cpt.points.reduce(
              (max, p) => Math.max(max, p.depth),
              0,
            ),
            zone_number: zone.number,
            zone_name: zone.name,
            zone_color: zone.color,
          },
        ];
      }
      const mid = (last.depth_top + last.depth_bottom) / 2;
      return [
        ...current.slice(0, -1),
        { ...last, depth_bottom: mid },
        { ...last, depth_top: mid },
      ];
    });
  return (
    <div className="layer-panel">
      <p className="layer-provenance">
        {report.provenance.method === "manual"
          ? "Handmatige laaginterpretatie"
          : "Indicatieve qc/Rf-laaginterpretatie"}{" "}
        · minimum {report.provenance.settings.minimumThicknessM} m · hysterese{" "}
        {report.provenance.settings.hysteresisM} m
      </p>
      {error && (
        <p role="alert" className="panel-error">
          {error}
        </p>
      )}
      {report.warnings.map((warning, i) => (
        <p className="panel-error" key={i}>
          {warning}
        </p>
      ))}
      {editing ? (
        <>
          <div className="layer-options">
            <label>
              Minimumdikte (m)
              <input
                type="number"
                min="0"
                step="0.05"
                value={minimum}
                onChange={(event) => setMinimum(event.target.value)}
              />
            </label>
            <label>
              Hysterese (m)
              <input
                type="number"
                min="0"
                step="0.05"
                value={hysteresis}
                onChange={(event) => setHysteresis(event.target.value)}
              />
            </label>
          </div>
          <div className="layer-draft-list">
            {draft.map((layer, index) => (
              <fieldset key={index}>
                <legend>Laag {index + 1}</legend>
                <label>
                  Bovenkant (m)
                  <input
                    aria-label={`Bovenkant laag ${index + 1}`}
                    type="number"
                    step="0.01"
                    value={Number.isNaN(layer.depth_top) ? "" : layer.depth_top}
                    onChange={(event) =>
                      setDraft((rows) =>
                        rows.map((row, i) =>
                          i === index
                            ? {
                                ...row,
                                depth_top:
                                  event.target.value === ""
                                    ? NaN
                                    : Number(event.target.value),
                              }
                            : row,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Onderkant (m)
                  <input
                    aria-label={`Onderkant laag ${index + 1}`}
                    type="number"
                    step="0.01"
                    value={
                      Number.isNaN(layer.depth_bottom) ? "" : layer.depth_bottom
                    }
                    onChange={(event) =>
                      setDraft((rows) =>
                        rows.map((row, i) =>
                          i === index
                            ? {
                                ...row,
                                depth_bottom:
                                  event.target.value === ""
                                    ? NaN
                                    : Number(event.target.value),
                              }
                            : row,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Indicatieve zone
                  <select
                    aria-label={`Zone laag ${index + 1}`}
                    value={layer.zone_number}
                    onChange={(event) =>
                      setDraft((rows) =>
                        rows.map((row, i) =>
                          i === index
                            ? {
                                ...row,
                                zone_number: Number(event.target.value),
                              }
                            : row,
                        ),
                      )
                    }
                  >
                    {zones.map((zone) => (
                      <option key={zone.number} value={zone.number}>
                        {zone.number}. {zone.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setDraft((rows) => rows.filter((_, i) => i !== index))
                  }
                >
                  Verwijder laag {index + 1}
                </button>
              </fieldset>
            ))}
          </div>
          <div className="layer-actions">
            <button type="button" onClick={split}>
              {draft.length ? "Splits laatste laag" : "Voeg laag toe"}
            </button>
            <button type="button" onClick={() => save(true)}>
              Handmatige lagen opslaan
            </button>
            <button type="button" onClick={() => save(false)}>
              Automatisch herberekenen
            </button>
            <button type="button" onClick={() => setEditing(false)}>
              Annuleren
            </button>
          </div>
        </>
      ) : (
        <>
          {report.layers.length ? (
            <table className="layers-table">
              <thead>
                <tr>
                  <th>Top</th>
                  <th>Onderkant</th>
                  <th>Zone</th>
                </tr>
              </thead>
              <tbody>
                {report.layers.map((layer, index) => (
                  <tr key={index}>
                    <td>{layer.depth_top.toFixed(2)}</td>
                    <td>{layer.depth_bottom.toFixed(2)}</td>
                    <td>
                      <span
                        className="layer-swatch"
                        style={{ background: layer.zone_color }}
                      />
                      {layer.zone_number}. {layer.zone_name}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="panel-empty">Geen laaginterpretatie beschikbaar.</p>
          )}
          <div className="layer-actions">
            <button type="button" onClick={begin}>
              Laaginterpretatie bewerken
            </button>
            <button type="button" onClick={() => void exportReport()}>
              Exporteer lagen JSON
            </button>
          </div>
        </>
      )}
      <p className="layer-provenance">
        Bron: {cpt.metadata.source_file}. Hysterese bevestigt een nieuwe zone
        met twee opeenvolgende punten. Grenzen worden apart bewaard; meetpunten
        blijven behouden. Meetcurves tonen de indicatieve puntindeling.
      </p>
    </div>
  );
}
