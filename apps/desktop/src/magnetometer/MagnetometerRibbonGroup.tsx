// Lintgroep: schakelt het grafiekvenster tussen de sondeergrafiek en de magnetometersporen.
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import RibbonButton from "../components/ribbon/RibbonButton";
import RibbonGroup from "../components/ribbon/RibbonGroup";
import { useCptStore } from "../store/useCptStore";
import { hasMagnetometer } from "./channels";
import { useMagnetometerStore } from "./useMagnetometerStore";

/** Alleen zichtbaar als een geopende sondering magnetometerkanalen heeft. */
export default function MagnetometerRibbonGroup() {
  const { t } = useTranslation("magnetometer");
  const cpts = useCptStore((s) => s.cpts);
  const show = useMagnetometerStore((s) => s.show);
  const setShow = useMagnetometerStore((s) => s.setShow);
  const available = useMemo(() => Array.from(cpts.values()).some(hasMagnetometer), [cpts]);
  if (!available) return null;
  return (
    <RibbonGroup label={t("ribbon.group", "Magnetometer")}>
      <RibbonButton
        icon="geo.sondering"
        label={t("ribbon.show", "Magneto-\nmeter")}
        title={t("ribbon.showHint", "Toon de magnetometerkanalen van de sondering tegen de diepte, naast qc.")}
        size="large"
        active={show}
        onClick={() => setShow(!show)}
      />
    </RibbonGroup>
  );
}
