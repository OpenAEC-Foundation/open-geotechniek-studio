import { useTranslation } from "react-i18next";
import RibbonGroup from "./RibbonGroup";
import RibbonButton from "./RibbonButton";
import RibbonButtonStack from "./RibbonButtonStack";
import { viewerFitIcon, viewerLoadIcon, viewerSectionIcon, viewerMeasureIcon, ifcStatsIcon, ifcTreeIcon, viewerWireframeIcon, imageIcon } from "./icons";
import { useSoil3DStore, type CutAxis } from "../soil3d/useSoil3DStore";

const labelIcon = `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5a2 2 0 011.41.59l7 7a2 2 0 010 2.82l-7 7a2 2 0 01-2.82 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z"/></svg>`;
const topIcon = `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="1" stroke-width="2"/><circle cx="12" cy="12" r="2" stroke-width="2"/></svg>`;
const frontIcon = `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 6h18M3 10h18M3 14h18M3 18h18"/></svg>`;
const sideIcon = `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 3v18M10 3v18M14 3v18M18 3v18"/></svg>`;

/** Lint voor het 3D-grondmodel: wat is zichtbaar, overhoogte, doorsnede, aanzicht en export. */
export default function Model3DTab() {
  const { t } = useTranslation("ribbon");
  const s = useSoil3DStore();
  return (
    <div className="ribbon-content">
      <div className="ribbon-groups">
        <RibbonGroup label={t("model3d.showGroup", "Weergave")}>
          <RibbonButtonStack>
            <RibbonButton icon={ifcTreeIcon} label={t("model3d.cpts", "Sonderingen")} size="small" active={s.showCpts} onClick={() => s.toggle("showCpts")} />
            <RibbonButton icon={ifcStatsIcon} label={t("model3d.qc", "Conusweerstand")} size="small" active={s.showQc} onClick={() => s.toggle("showQc")} />
            <RibbonButton icon={viewerLoadIcon} label={t("model3d.model", "Grondmodel")} size="small" active={s.showModel} onClick={() => s.toggle("showModel")} />
          </RibbonButtonStack>
          <RibbonButtonStack>
            <RibbonButton icon={viewerWireframeIcon} label={t("model3d.ground", "Maaiveld")} size="small" active={s.showGround} onClick={() => s.toggle("showGround")} />
            <RibbonButton icon={viewerSectionIcon} label={t("model3d.bearing", "Draagkrachtige laag")} size="small" active={s.showBearing} onClick={() => s.toggle("showBearing")} />
            <RibbonButton icon={viewerMeasureIcon} label={t("model3d.toes", "Paalpunten")} size="small" active={s.showPileToes} onClick={() => s.toggle("showPileToes")} />
          </RibbonButtonStack>
          <RibbonButtonStack>
            <RibbonButton icon={labelIcon} label={t("model3d.labels", "Labels")} size="small" active={s.showLabels} onClick={() => s.toggle("showLabels")} />
          </RibbonButtonStack>
        </RibbonGroup>
        <RibbonGroup label={t("model3d.modelGroup", "Model")}>
          <label className="soil3d-ribbon-field">
            {t("model3d.exaggeration", "Overhoogte")}
            <select value={s.exaggeration} onChange={(e) => s.set({ exaggeration: Number(e.target.value) })}>
              {[1, 2, 3, 5, 10].map((v) => <option key={v} value={v}>{v}×</option>)}
            </select>
          </label>
          <label className="soil3d-ribbon-field">
            {t("model3d.opacity", "Dekking")} {Math.round(s.opacity * 100)}%
            <input type="range" min={0.2} max={1} step={0.05} value={s.opacity} onChange={(e) => s.set({ opacity: Number(e.target.value) })} />
          </label>
        </RibbonGroup>
        <RibbonGroup label={t("model3d.cutGroup", "Doorsnede")}>
          <label className="soil3d-ribbon-field">
            {t("model3d.cutAxis", "Richting")}
            <select value={s.cutAxis} onChange={(e) => s.set({ cutAxis: e.target.value as CutAxis })}>
              <option value="east">{t("model3d.cutEast", "West → oost")}</option>
              <option value="north">{t("model3d.cutNorth", "Zuid → noord")}</option>
            </select>
          </label>
          <label className="soil3d-ribbon-field">
            {t("model3d.cut", "Snede")} {Math.round(s.cut * 100)}%
            <input type="range" min={0.05} max={1} step={0.05} value={s.cut} onChange={(e) => s.set({ cut: Number(e.target.value) })} />
          </label>
          <label className="soil3d-ribbon-field">
            {t("model3d.cutTop", "Van boven")} {Math.round(s.cutTop * 100)}%
            <input type="range" min={0} max={0.95} step={0.05} value={s.cutTop} onChange={(e) => s.set({ cutTop: Number(e.target.value) })} />
          </label>
        </RibbonGroup>
        <RibbonGroup label={t("model3d.viewGroup", "Beeld")}>
          <RibbonButton icon={viewerFitIcon} label={t("model3d.fit", "Passend")} onClick={() => s.requestFit("iso")} />
          <RibbonButtonStack>
            <RibbonButton icon={topIcon} label={t("model3d.top", "Boven")} size="small" onClick={() => s.requestFit("top")} />
            <RibbonButton icon={frontIcon} label={t("model3d.front", "Voor")} size="small" onClick={() => s.requestFit("front")} />
            <RibbonButton icon={sideIcon} label={t("model3d.side", "Zij")} size="small" onClick={() => s.requestFit("side")} />
          </RibbonButtonStack>
        </RibbonGroup>
        <RibbonGroup label={t("model3d.exportGroup", "Exporteren")}>
          <RibbonButton icon={imageIcon} label={t("model3d.png", "Afbeelding\n(PNG)")} onClick={s.requestExport} />
        </RibbonGroup>
      </div>
    </div>
  );
}
