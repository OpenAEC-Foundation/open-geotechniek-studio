import { useTranslation } from "react-i18next";
import RibbonGroup from "./RibbonGroup";
import RibbonButton from "./RibbonButton";
import {
  viewerFitIcon,
  viewerLoadIcon,
  viewerOrbitIcon,
  viewerSectionIcon,
  viewerWireframeIcon,
  imageIcon,
} from "./icons";
import { useSubsurfaceStore } from "../../store/useSubsurfaceStore";

const cptIcon = `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 2v16M9 18l3 4 3-4M8 6h8M8 10h8M8 14h8"/></svg>`;
const labelIcon = `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5a2 2 0 011.41.59l7 7a2 2 0 010 2.82l-7 7a2 2 0 01-2.82 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z"/></svg>`;
const topIcon = `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="1" stroke-width="2"/><circle cx="12" cy="12" r="2" stroke-width="2"/></svg>`;
const frontIcon = `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 6h18M3 10h18M3 14h18M3 18h18"/></svg>`;

export default function Ondergrond3dTab() {
  const { t } = useTranslation("ribbon");
  const s = useSubsurfaceStore();
  return (
    <div className="ribbon-content">
      <div className="ribbon-groups">
        <RibbonGroup label={t("model3d.show", "Weergave")}>
          <RibbonButton
            icon={viewerLoadIcon}
            label={t("model3d.voxels", "Grond-\nmodel")}
            active={s.showVoxels}
            onClick={() => s.set({ showVoxels: !s.showVoxels })}
          />
          <RibbonButton
            icon={cptIcon}
            label={t("model3d.cpts", "Sonde-\nringen")}
            active={s.showCpts}
            onClick={() => s.set({ showCpts: !s.showCpts })}
          />
          <RibbonButton
            icon={labelIcon}
            label={t("model3d.labels", "Labels")}
            active={s.showLabels}
            onClick={() => s.set({ showLabels: !s.showLabels })}
          />
          <RibbonButton
            icon={viewerWireframeIcon}
            label={t("model3d.transparent", "Transparant")}
            active={s.opacity < 1}
            onClick={() => s.set({ opacity: s.opacity < 1 ? 1 : 0.35 })}
          />
        </RibbonGroup>
        <RibbonGroup label={t("model3d.camera", "Aanzicht")}>
          <RibbonButton
            icon={viewerOrbitIcon}
            label={t("model3d.iso", "3D")}
            onClick={() => s.requestCamera("iso")}
          />
          <RibbonButton
            icon={topIcon}
            label={t("model3d.top", "Boven")}
            onClick={() => s.requestCamera("top")}
          />
          <RibbonButton
            icon={frontIcon}
            label={t("model3d.front", "Voor")}
            onClick={() => s.requestCamera("front")}
          />
          <RibbonButton
            icon={viewerFitIcon}
            label={t("model3d.side", "Zij")}
            onClick={() => s.requestCamera("side")}
          />
        </RibbonGroup>
        <RibbonGroup label={t("model3d.section", "Doorsnede")}>
          <RibbonButton
            icon={viewerSectionIcon}
            label={t("model3d.cutCorner", "Hoek\nuitsnijden")}
            active={s.cutX < 1 || s.cutY < 1}
            onClick={() =>
              s.cutX < 1 || s.cutY < 1
                ? s.set({ cutX: 1, cutY: 1 })
                : s.set({ cutX: 0.5, cutY: 0.5 })
            }
          />
        </RibbonGroup>
        <RibbonGroup label={t("model3d.export", "Exporteren")}>
          <RibbonButton
            icon={imageIcon}
            label={t("model3d.png", "Afbeelding\n(PNG)")}
            onClick={() => s.requestExport()}
          />
        </RibbonGroup>
      </div>
    </div>
  );
}
