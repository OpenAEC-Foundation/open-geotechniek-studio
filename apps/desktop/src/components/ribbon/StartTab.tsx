import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { loadChartZoomPreference, useChartZoomStore } from "../../store/useChartZoomStore";
import RibbonGroup from "./RibbonGroup";
import RibbonButton from "./RibbonButton";


const scanIcon = `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7l2 3-1 3 4 2-2 3"/></svg>`;

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
        <RibbonGroup label={t("cptGroup", "Sondering")}>
          <RibbonButton
            icon={scanIcon}
            label={t("cptFromScan", "Uit scan")}
            size="large"
            onClick={() => window.dispatchEvent(new CustomEvent("ogs:open-scan-cpt"))}
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
