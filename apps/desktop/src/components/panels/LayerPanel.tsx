import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Layer } from "../../types/cpt";
import { useCptStore } from "../../store/useCptStore";
import {
  analyzeLayers,
  withLayerInterpretation,
} from "../../utils/layerAnalysis";
import { zones, zoneName } from "../../utils/soilZones";
import { IS_TAURI } from "../../utils/platform";
import { downloadBlobAsFile } from "../../utils/browserSave";
import "./LayerPanel.css";
export default function LayerPanel({ cptId }: { cptId: string | null }) {
  const { t } = useTranslation("panels");
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
  if (!cpt) return <p className="panel-empty">{t("layers.noCpt", "Geen sondering geselecteerd.")}</p>;
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
        throw new Error(t("layers.fillSettings", "Vul minimumdikte en hysterese in."));
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
          filters: [{ name: t("layers.jsonFilter", "Laaginterpretatie JSON"), extensions: ["json"] }],
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
          ? t("layers.provenanceManual", "Handmatige laaginterpretatie · minimum {{min}} m · hysterese {{hyst}} m", { min: report.provenance.settings.minimumThicknessM, hyst: report.provenance.settings.hysteresisM })
          : t("layers.provenanceAuto", "Indicatieve qc/Rf-laaginterpretatie · minimum {{min}} m · hysterese {{hyst}} m", { min: report.provenance.settings.minimumThicknessM, hyst: report.provenance.settings.hysteresisM })}
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
              {t("layers.minThickness", "Minimumdikte (m)")}
              <input
                type="number"
                min="0"
                step="0.05"
                value={minimum}
                onChange={(event) => setMinimum(event.target.value)}
              />
            </label>
            <label>
              {t("layers.hysteresis", "Hysterese (m)")}
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
                <legend>{t("layers.layerN", "Laag {{n}}", { n: index + 1 })}</legend>
                <label>
                  {t("layers.top", "Bovenkant (m)")}
                  <input
                    aria-label={t("layers.topAria", "Bovenkant laag {{n}}", { n: index + 1 })}
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
                  {t("layers.bottom", "Onderkant (m)")}
                  <input
                    aria-label={t("layers.bottomAria", "Onderkant laag {{n}}", { n: index + 1 })}
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
                  {t("layers.zone", "Indicatieve zone")}
                  <select
                    aria-label={t("layers.zoneAria", "Zone laag {{n}}", { n: index + 1 })}
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
                        {zone.number}. {zoneName(zone.number, zone.name)}
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
                  {t("layers.remove", "Verwijder laag {{n}}", { n: index + 1 })}
                </button>
              </fieldset>
            ))}
          </div>
          <div className="layer-actions">
            <button type="button" onClick={split}>
              {draft.length ? t("layers.splitLast", "Splits laatste laag") : t("layers.add", "Voeg laag toe")}
            </button>
            <button type="button" onClick={() => save(true)}>
              {t("layers.saveManual", "Handmatige lagen opslaan")}
            </button>
            <button type="button" onClick={() => save(false)}>
              {t("layers.recalculate", "Automatisch herberekenen")}
            </button>
            <button type="button" onClick={() => setEditing(false)}>
              {t("layers.cancel", "Annuleren")}
            </button>
          </div>
        </>
      ) : (
        <>
          {report.layers.length ? (
            <table className="layers-table">
              <thead>
                <tr>
                  <th>{t("layers.colTop", "Top")}</th>
                  <th>{t("layers.colBottom", "Onderkant")}</th>
                  <th>{t("layers.colZone", "Zone")}</th>
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
                      {layer.zone_number}. {zoneName(layer.zone_number, layer.zone_name)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="panel-empty">{t("layers.none", "Geen laaginterpretatie beschikbaar.")}</p>
          )}
          <div className="layer-actions">
            <button type="button" onClick={begin}>
              {t("layers.edit", "Laaginterpretatie bewerken")}
            </button>
            <button type="button" onClick={() => void exportReport()}>
              {t("layers.export", "Exporteer lagen JSON")}
            </button>
          </div>
        </>
      )}
      <p className="layer-provenance">
        {t("layers.footer", "Bron: {{source}}. Hysterese bevestigt een nieuwe zone met twee opeenvolgende punten. Grenzen worden apart bewaard; meetpunten blijven behouden. Meetcurves tonen de indicatieve puntindeling.", { source: cpt.metadata.source_file })}
      </p>
    </div>
  );
}
