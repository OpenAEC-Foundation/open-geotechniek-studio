import { useTranslation } from "react-i18next";
import RibbonGroup from "./RibbonGroup";
import RibbonButton from "./RibbonButton";
import { openView, splitRight } from "../soil3d/layout";
import { defaultSectionBox, useSoil3DStore } from "../soil3d/useSoil3DStore";

/** Lint voor het 3D-grondmodel: vensters en section box. Lagen staan links, overhoogte en dekking rechts, export bij IFC. */
export default function Model3DTab() {
  const { t } = useTranslation("ribbon");
  const s = useSoil3DStore();
  return (
    <div className="ribbon-content">
      <div className="ribbon-groups">
        <RibbonGroup label={t("model3d.windowsGroup", "Vensters")}>
          <RibbonButton icon="view.model-3d" label={t("model3d.viewModel", "3D-model")} title={t("model3d.openModelHint", "3D-model openen als tabblad in het actieve venster")} onClick={() => s.updateLayout((l) => openView(l, "model"))} />
          <RibbonButton icon="section.box" label={t("model3d.viewSection", "Sectiebox")} title={t("model3d.openSectionHint", "Sectiebox openen als tabblad in het actieve venster")} onClick={() => s.updateLayout((l) => openView(l, "section"))} />
          <RibbonButton icon="workspace.split-right" label={t("model3d.split", "Naast elkaar")} title={t("model3d.splitRight", "Naast elkaar: actief tabblad in een nieuw venster rechts")} disabled={!s.layout.panes.length} onClick={() => s.updateLayout((l) => splitRight(l, l.focus))} />
        </RibbonGroup>
        <RibbonGroup label={t("model3d.viewGroup", "Beeld")}>
          <RibbonButton icon="view.fit" label={t("model3d.fit", "Passend")} onClick={s.requestFit} />
          <RibbonButton icon="section.reset-box" label={t("model3d.resetBox", "Sectiebox herstellen")} disabled={!s.model} onClick={() => { if (s.model) s.set({ sectionBox: defaultSectionBox(s.model) }); }} />
        </RibbonGroup>
      </div>
    </div>
  );
}
