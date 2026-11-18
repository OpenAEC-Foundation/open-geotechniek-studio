import { useTranslation } from "react-i18next";
import RibbonGroup from "./RibbonGroup";
import RibbonButton from "./RibbonButton";

// Ruler icon — for the measurement-tool button.

// Camera/image icon — voor de "Exporteer als afbeelding" knop.

/**
 * Kaart ribbon — minimal toolset. BRO archive reloads automatically when
 * the map view changes (moveend), so "Laad gebied" is gone. Resterende
 * knoppen zijn modal/snapshot-interacties die op afstand vanuit deze
 * ribbon-tab worden getriggerd via CustomEvents naar MapView.
 */
export default function KaartTab() {
  const { t } = useTranslation("ribbon");
  return (
    <div className="ribbon-content">
      <div className="ribbon-groups">
        <RibbonGroup label={t("map", "Kaart")}>
          <RibbonButton
            icon="measure.distance"
            label={t("measure", "Meten")}
            size="large"
            onClick={() => window.dispatchEvent(new CustomEvent("ogs:measure-toggle"))}
          />
          <RibbonButton
            icon="map.export-image"
            label={t("exportImage", "Exporteer\nals afbeelding")}
            size="large"
            onClick={() => window.dispatchEvent(new CustomEvent("ogs:export-map"))}
          />
        </RibbonGroup>
      </div>
    </div>
  );
}
