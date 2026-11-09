import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { autoCptRadius } from "./scene";
import type { SoilModel } from "./soilModel";
import type { SubsurfaceData } from "./subsurface/store";
import { describeSelection, type Selection } from "./selection";
import { useSoil3DStore } from "./useSoil3DStore";
import { OaIcon } from "../icons/oaIcon";

/** Diameter van de sonderingskolommen in m; leeg = automatisch (meeschalen met het model). */
function CptDiameterField({ model }: { model: SoilModel }) {
  const { t, i18n } = useTranslation("ribbon");
  const value = useSoil3DStore((s) => s.cptDiameter);
  const set = useSoil3DStore((s) => s.set);
  const fmt = (v: number | null) => (v === null ? "" : v.toLocaleString(i18n.language, { maximumFractionDigits: 2, useGrouping: false }));
  const [text, setText] = useState(fmt(value));
  // Alleen van buitenaf bijwerken; tijdens het typen ("1," of "1.") de tekst laten staan.
  useEffect(() => setText((cur) => {
    const parsed = Number(cur.replace(",", "."));
    if (value === null) return parsed > 0 ? "" : cur;
    return parsed === value ? cur : fmt(value);
  }), [value]);
  const auto = (2 * autoCptRadius(model)).toLocaleString(i18n.language, { maximumFractionDigits: 1 });
  const commit = (raw: string) => {
    const v = Number(raw.replace(",", "."));
    if (!raw.trim() || !(v > 0)) { set({ cptDiameter: null }); setText(""); return; }
    const d = Math.min(50, Math.round(v * 100) / 100);
    set({ cptDiameter: d });
    setText(fmt(d));
  };
  return (
    <label>
      <span>{t("model3d.cptDiameter", "Diameter")}</span>
      <input type="text" inputMode="decimal" value={text} placeholder={`${t("model3d.auto", "Automatisch")} (${auto})`}
        onChange={(e) => { setText(e.target.value); const v = Number(e.target.value.replace(",", ".")); if (v > 0) set({ cptDiameter: Math.min(50, v) }); }}
        onBlur={(e) => commit(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") commit((e.target as HTMLInputElement).value); }} />
      <output>m</output>
    </label>
  );
}

/** Vaste kolom rechts van de vensters: weergave-instellingen van het model en de eigenschappen van de selectie. */
export function SelectionPanel({ selection, model, subsurface, onClose }: { selection: Selection | null; model: SoilModel; subsurface: SubsurfaceData | null; onClose: () => void }) {
  const { t } = useTranslation("ribbon");
  const exaggeration = useSoil3DStore((s) => s.exaggeration);
  const opacity = useSoil3DStore((s) => s.opacity);
  const set = useSoil3DStore((s) => s.set);
  const groups = selection ? describeSelection(selection, model, subsurface) : [];
  return (
    <aside className="soil3d-props" aria-label="Eigenschappen">
      <header><span>{t("model3d.modelGroup", "Model")}</span></header>
      <div className="soil3d-props-view">
        <label>
          <span>{t("model3d.exaggeration", "Overhoogte")}</span>
          <select value={exaggeration} onChange={(e) => set({ exaggeration: Number(e.target.value) })}>
            {[1, 2, 3, 5, 10].map((v) => <option key={v} value={v}>{v}×</option>)}
          </select>
        </label>
        <label>
          <span>{t("model3d.opacity", "Dekking")}</span>
          <input type="range" min={0.2} max={1} step={0.05} value={opacity} onChange={(e) => set({ opacity: Number(e.target.value) })} />
          <output>{Math.round(opacity * 100)}%</output>
        </label>
        <CptDiameterField model={model} />
      </div>
      <header>
        <span>Eigenschappen</span>
        {selection && <button type="button" className="soil3d-icon" aria-label="Selectie opheffen" title="Selectie opheffen (Esc)" onClick={onClose}><OaIcon id="edit.deselect" /></button>}
      </header>
      {!groups.length && <p className="soil3d-props-empty">Klik een object in het 3D-model: een sondering, een cel, een pakket, een peilbuis of het grondwater.</p>}
      {groups.map((g) => (
        <section key={g.title}>
          <h4>{g.title}</h4>
          {g.subtitle && <div className="soil3d-props-sub">{g.subtitle}</div>}
          <table>
            <tbody>
              {g.rows.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}
            </tbody>
          </table>
        </section>
      ))}
    </aside>
  );
}
