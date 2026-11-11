import { useTranslation } from "react-i18next";
import RibbonGroup from "./RibbonGroup";
import RibbonButton from "./RibbonButton";
import RibbonButtonStack from "./RibbonButtonStack";
import { viewerFitIcon, viewerLoadIcon, viewerSectionIcon, viewerMeasureIcon, ifcStatsIcon, ifcTreeIcon, viewerWireframeIcon } from "./icons";
import { useSoil3DStore, type CutAxis } from "../soil3d/useSoil3DStore";

/** Lint voor het 3D-grondmodel: wat is zichtbaar, overhoogte en doorsnede. */
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
        </RibbonGroup>
        <RibbonGroup label={t("model3d.viewGroup", "Beeld")}>
          <RibbonButton icon={viewerFitIcon} label={t("model3d.fit", "Passend")} onClick={s.requestFit} />
        </RibbonGroup>
      </div>
    </div>
  );
}
