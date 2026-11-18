import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { loadChartZoomPreference, useChartZoomStore } from "../../store/useChartZoomStore";
import RibbonGroup from "./RibbonGroup";
import RibbonButton from "./RibbonButton";


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
              onChange={(event) => setScaleColumns(event.target.checked)}
            />
            {t("scaleCptColumns", "Sonderingen meeschalen")}
          </label>
        </RibbonGroup>
      </div>
    </div>
  );
}
