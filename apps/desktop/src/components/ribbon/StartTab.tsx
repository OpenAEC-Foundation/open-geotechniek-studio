import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { loadChartZoomPreference, useChartZoomStore } from "../../store/useChartZoomStore";
import RibbonGroup from "./RibbonGroup";
import RibbonButton from "./RibbonButton";
import MagnetometerRibbonGroup from "../../magnetometer/MagnetometerRibbonGroup";


interface StartTabProps {
  onViewChange?: (view: string) => void;
  /** Hook the Home-tab's Projectinfo-knop into App.tsx's existing
   *  ProjectSettingsDialog state — bypasses the Ribbon prop-drill via
   *  a window-event the App-shell already listens for. */
  onOpenProjectSettings?: () => void;
}

export default function StartTab(props: StartTabProps = {}) {
  const { t } = useTranslation("ribbon");
  const scaleColumns = useChartZoomStore((s) => s.scaleColumns);
  const setScaleColumns = useChartZoomStore((s) => s.setScaleColumns);
  const overlay = useChartZoomStore((s) => s.overlay);
  const setOverlay = useChartZoomStore((s) => s.setOverlay);
  useEffect(() => { void loadChartZoomPreference(); }, []);
  const openProjectSettings =
    props.onOpenProjectSettings ??
    (() => window.dispatchEvent(new CustomEvent("ogs:open-project-settings")));
  return (
    <div className="ribbon-content">
      <div className="ribbon-groups">
        <RibbonGroup label={t("project", "Project")}>
          <RibbonButton
            icon="project.properties"
            label={t("projectInfo", "Projectinfo")}
            size="large"
            onClick={openProjectSettings}
          />
        </RibbonGroup>
        <RibbonGroup label={t("zoom")}>
          <RibbonButton
            icon="view.zoom-out"
            label={t("zoomOut")}
            size="large"
            onClick={() => window.dispatchEvent(new CustomEvent("ogs:zoom-out"))}
          />
          <RibbonButton
            icon="view.fit"
            label={t("zoomFit")}
            size="large"
            onClick={() => window.dispatchEvent(new CustomEvent("ogs:zoom-fit"))}
          />
          <label className="ribbon-zoom-checkbox" title={t("scaleCptColumnsHint", "Vergroot na Passend ook de kolombreedte; schuif horizontaal voor de overige sonderingen.")}>
            <input
              type="checkbox"
              checked={scaleColumns}
              disabled={overlay}
              onChange={(event) => setScaleColumns(event.target.checked)}
            />
            {t("scaleCptColumns", "Sonderingen meeschalen")}
          </label>
          <div className="ribbon-btn-stack" role="group" aria-label={t("cptLayout", "Sonderingen tonen")}>
            <RibbonButton
              icon="workspace.split-right"
              label={t("cptSideBySide", "Naast elkaar")}
              title={t("cptSideBySideHint", "Toon de sonderingen naast elkaar, elk in een eigen kolom.")}
              size="small"
              active={!overlay}
              onClick={() => setOverlay(false)}
            />
            <RibbonButton
              icon="object.layers"
              label={t("cptOverlay", "Over elkaar")}
              title={t("cptOverlayHint", "Teken alle zichtbare sonderingen over elkaar: één grafiek van qc en één van fs tegen NAP.")}
              size="small"
              active={overlay}
              onClick={() => setOverlay(true)}
            />
          </div>
        </RibbonGroup>
        <MagnetometerRibbonGroup />
      </div>
    </div>
  );
}
