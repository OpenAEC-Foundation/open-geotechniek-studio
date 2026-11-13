import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCptStore } from "../../store/useCptStore";
import { useCalculationsStore } from "../../calc/framework/store";
import { pileToes, type PileToe } from "./scene";
import { defaultSectionBox, useSoil3DStore, type Soil3DSettings } from "./useSoil3DStore";
import { useSubsurfaceStore } from "./subsurface/store";
import { loadMissing } from "./subsurface/actions";
import { LayerBrowser } from "./LayerBrowser";
import type { Selection } from "./selection";
import { SelectionPanel } from "./SelectionPanel";
import { Viewport3D } from "./Viewport3D";
import { Workspace } from "./Workspace";
import { criterionFor, projectSoilModel } from "./projectModel";
import "./soil3d.css";

function cssVar(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** Tab 3D-model: lagenpaneel links, één of twee vensters met views als tabbladen, eigenschappen van de selectie. */
export default function Soil3DView() {
  const { t } = useTranslation("ribbon");
  const { i18n } = useTranslation("panels");
  const cpts = useCptStore((s) => s.cpts);
  const activeCptId = useCptStore((s) => s.activeCptId);
  const setActive = useCptStore((s) => s.setActive);
  const activeDocId = useCptStore((s) => s.activeDocId);
  const byDoc = useCalculationsStore((s) => s.byDoc);
  const subsurface = useSubsurfaceStore((s) => (activeDocId ? s.byDoc.get(activeDocId) ?? null : null));
  const store = useSoil3DStore();
  const [selection, setSelection] = useState<Selection | null>(null);

  const calcs = useMemo(() => (activeDocId ? byDoc.get(activeDocId) : undefined) ?? [], [activeDocId, byDoc]);
  const criterion = useMemo(() => criterionFor(calcs), [calcs]);
  const toes = useMemo<PileToe[]>(() => pileToes(calcs), [calcs]);
  // De taal is een afhankelijkheid: de waarschuwingen in het model zijn vertaald.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { model, error } = useMemo(() => projectSoilModel(cpts, criterion), [cpts, criterion, i18n.language]);

  // Alleen de weergave-instellingen; zo bouwt een venster niet opnieuw op bij elke statuswijziging.
  const { showCpts, showQc, showModel, showGround, showBearing, showPileToes, showAquifers, showGeotop, showWater, showWells, showLabels, exaggeration, opacity, cptDiameter, hiddenZones } = store;
  const settings = useMemo<Soil3DSettings>(() => ({ showCpts, showQc, showModel, showGround, showBearing, showPileToes, showAquifers, showGeotop, showWater, showWells, showLabels, exaggeration, opacity, cptDiameter, hiddenZones }),
    [showCpts, showQc, showModel, showGround, showBearing, showPileToes, showAquifers, showGeotop, showWater, showWells, showLabels, exaggeration, opacity, cptDiameter, hiddenZones]);
  const textColor = useMemo(() => cssVar("--theme-text", "#1f2933"), []);

  // Het lint werkt op het model dat hier getoond wordt; een nieuw model krijgt een nieuwe section box.
  useEffect(() => {
    useSoil3DStore.getState().set({ model, sectionBox: model ? defaultSectionBox(model) : null });
    setSelection(null);
    // Pakketten, GeoTOP en grondwater staan standaard aan: ophalen wat nog ontbreekt.
    if (model && activeDocId) void loadMissing(activeDocId, model);
  }, [model, activeDocId]);

  const select = (sel: Selection | null) => {
    setSelection(sel);
    if (sel?.kind === "cpt") setActive(sel.cptId);
  };
  return (
    <div className="soil3d-view">
      {model && <LayerBrowser model={model} docId={activeDocId} criterion={criterion} toeCount={toes.length} />}
      <div className="soil3d-stage">
        {!model && <div className="soil3d-empty">{error ?? t("model3d.empty", "Voeg sonderingen toe om het grondmodel op te bouwen.")}</div>}
        {model && (
          <Workspace render={(view, _tabId, visible, focused) => (
            <Viewport3D
              model={model} settings={settings} toes={toes} activeCptId={activeCptId} subsurface={subsurface} textColor={textColor}
              mode={view} sectionBox={store.sectionBox} onSectionBox={(b) => store.set({ sectionBox: b })}
              selection={selection} onSelect={select} active={visible && focused} cameraRequest={store.cameraRequest} exportRequest={store.exportRequest}
            />
          )} />
        )}
        {store.busy && <div className="soil3d-busy">{store.busy}…</div>}
      </div>
      {model && <SelectionPanel selection={selection} model={model} subsurface={subsurface} onClose={() => setSelection(null)} />}
    </div>
  );
}
