import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { zoneInfo, type SoilModel } from "./soilModel";
import { useSoil3DStore, type ToggleKey } from "./useSoil3DStore";
import type { Criterion } from "./scene";
import { useSubsurfaceStore } from "./subsurface/store";
import { loadAquifers, loadGeotop, loadGroundwater } from "./subsurface/actions";
import { AquiferList, GeotopLegend, GroundwaterLevels, WellList } from "./subsurface/GroundwaterPanel";
import { OaIcon } from "../icons/oaIcon";

interface RowProps {
  label: string;
  checked: boolean;
  onChange: () => void;
  hint?: string;
  status?: string;
  onRefresh?: () => void;
  disabled?: boolean;
  children?: ReactNode;
  defaultOpen?: boolean;
}

/** Eén laag in de lagenboom: vinkje, naam, en uitklapbare details. */
function LayerRow({ label, checked, onChange, hint, status, onRefresh, disabled, children, defaultOpen = false }: RowProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="soil3d-layer">
      <div className="soil3d-layer-row">
        <button type="button" className={`soil3d-twisty${children ? "" : " empty"}`} aria-label={open ? "Inklappen" : "Uitklappen"} onClick={() => setOpen(!open)} disabled={!children}>
          {children && <OaIcon id="tree.collapse" className={open ? undefined : "soil3d-closed"} />}
        </button>
        <label title={hint}>
          <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} />
          <span>{label}</span>
        </label>
        {status && <span className="soil3d-layer-status">{status}</span>}
        {onRefresh && <button type="button" className="soil3d-icon" title="Opnieuw ophalen" aria-label="Opnieuw ophalen" onClick={onRefresh} disabled={disabled}><OaIcon id="ui.refresh" /></button>}
      </div>
      {open && children && <div className="soil3d-layer-children">{children}</div>}
    </div>
  );
}

/** Lagenpaneel links van het 3D-model: wat er te zien is, en wat er van buiten bij kan. */
export function LayerBrowser({ model, docId, criterion, toeCount }: { model: SoilModel; docId: string | null; criterion: Criterion; toeCount: number }) {
  const { t } = useTranslation("ribbon");
  const s = useSoil3DStore();
  const sub = useSubsurfaceStore((st) => (docId ? st.byDoc.get(docId) ?? null : null));
  const placed = model.columns.filter((c) => c.placed);
  const tops = placed.map((c) => c.bearingTopNap).filter((v): v is number => v !== null);
  const toggle = (key: ToggleKey) => () => s.toggle(key);
  const busy = !!s.busy;

  // Van buiten: eerste vinkje haalt de gegevens op, daarna aan/uit.
  const external = (have: boolean, key: ToggleKey, load: typeof loadAquifers) => () => {
    if (!docId || busy) return;
    if (!have) { void load(docId, model); return; }
    s.toggle(key);
  };
  const status = (label: string, have: boolean) => (s.busy === label ? t("model3d.fetching", "ophalen…") : have ? "" : t("model3d.notLoaded", "niet geladen"));

  return (
    <aside className="soil3d-browser" aria-label={t("model3d.layers", "Lagen")}>
      <div className="soil3d-browser-head">{t("model3d.layers", "Lagen")}</div>

      <LayerRow label={t("model3d.cpts", "Sonderingen")} checked={s.showCpts} onChange={toggle("showCpts")}>
        <LayerRow label={t("model3d.qc", "Conusweerstand")} checked={s.showQc} onChange={toggle("showQc")} />
        <div className="soil3d-note soil3d-muted">{placed.length} {t("model3d.cptsPlaced", "sonderingen op RD-coördinaten")}</div>
      </LayerRow>

      <LayerRow label={t("model3d.model", "Grondmodel")} hint={t("model3d.modelHint", "Geïnterpoleerd uit de sonderingen")} checked={s.showModel}
        onChange={toggle("showModel")} defaultOpen>
        {model.zonesPresent.map((z) => {
          const info = zoneInfo(z);
          return (
            <label key={z} className="soil3d-zone">
              <input type="checkbox" checked={!s.hiddenZones.includes(z)} onChange={() => s.toggleZone(z)} />
              <span className="soil3d-swatch" style={{ background: info?.color }} />
              {info?.name ?? `Zone ${z}`}
            </label>
          );
        })}
        <div className="soil3d-note soil3d-muted">
          {model.grid.nx} × {model.grid.ny} × {model.grid.nz} {t("model3d.cells", "cellen")} ({model.grid.dx.toFixed(1)} × {model.grid.dy.toFixed(1)} × {model.grid.dz.toFixed(1)} m), IDW
        </div>
      </LayerRow>

      <LayerRow label={t("model3d.ground", "Maaiveld")} checked={s.showGround} onChange={toggle("showGround")} />

      <LayerRow label={t("model3d.bearing", "Draagkrachtige laag")} checked={s.showBearing} onChange={toggle("showBearing")}>
        <div className="soil3d-note">
          qc ≥ {criterion.qcMpa} MPa {t("model3d.over", "over")} ≥ {criterion.thicknessM} m
          <br />
          {criterion.source ? `${t("model3d.from", "uit")} ${criterion.source}` : t("model3d.defaultCriterion", "standaard; stel in via een funderingsadvies")}
          {tops.length > 0 && <><br />NAP {Math.max(...tops).toFixed(2)} {t("model3d.to", "tot")} {Math.min(...tops).toFixed(2)} m ({tops.length}/{placed.length})</>}
        </div>
      </LayerRow>

      <LayerRow label={t("model3d.toes", "Paalpunten")} checked={s.showPileToes} onChange={toggle("showPileToes")}
        status={toeCount ? String(toeCount) : t("model3d.none", "geen")} />

      <LayerRow label={t("model3d.waterLevels", "Grondwaterstanden")} checked={s.showWater} onChange={toggle("showWater")} defaultOpen={!!sub?.wells}>
        {docId && <GroundwaterLevels docId={docId} />}
      </LayerRow>

      <div className="soil3d-browser-head">{t("model3d.external", "Van buiten")}</div>

      <LayerRow label={t("model3d.aquifers", "Watervoerende pakketten")} hint={t("model3d.aquifersHint", "REGIS II (TNO): pakketten en scheidende lagen per 100 m")}
        checked={!!sub?.regis && s.showAquifers} onChange={external(!!sub?.regis, "showAquifers", loadAquifers)} disabled={busy || !docId}
        status={status("Pakketten ophalen", !!sub?.regis)} onRefresh={sub?.regis && docId ? () => void loadAquifers(docId, model) : undefined}>
        {docId && sub?.regis && <AquiferList docId={docId} />}
      </LayerRow>

      <LayerRow label={t("model3d.geotop", "Voxelmodel GeoTOP")} hint={t("model3d.geotopHint", "GeoTOP (TNO): lithoklasse per 100 × 100 × 0,5 m")}
        checked={!!sub?.geotop && s.showGeotop} onChange={external(!!sub?.geotop, "showGeotop", loadGeotop)} disabled={busy || !docId}
        status={status("GeoTOP ophalen", !!sub?.geotop)} onRefresh={sub?.geotop && docId ? () => void loadGeotop(docId, model) : undefined}>
        {docId && sub?.geotop && <GeotopLegend docId={docId} />}
      </LayerRow>

      <LayerRow label={t("model3d.wells", "Peilbuizen")} hint={t("model3d.groundwaterHint", "Peilbuizen en meetreeksen uit de BRO, binnen 500 m")}
        checked={!!sub?.wells && s.showWells} onChange={external(!!sub?.wells, "showWells", loadGroundwater)} disabled={busy || !docId}
        status={status("Grondwater ophalen", !!sub?.wells)} onRefresh={sub?.wells && docId ? () => void loadGroundwater(docId, model) : undefined}>
        {docId && sub?.wells && <WellList docId={docId} />}
      </LayerRow>

      <div className="soil3d-browser-foot">
        {model.warnings.map((w) => <div key={w} className="soil3d-note soil3d-warn">{w}</div>)}
        {s.message && <div className={`soil3d-note ${s.message.error ? "soil3d-warn" : "soil3d-muted"}`}>{s.message.text}</div>}
      </div>
    </aside>
  );
}
