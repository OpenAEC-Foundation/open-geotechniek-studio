import { useEffect, useMemo } from "react";
import type { CalculationInstance } from "../calc/framework/types";
import type { SoilModel } from "../components/soil3d/soilModel";
import type { Selection } from "../components/soil3d/selection";
import { useCptStore } from "../store/useCptStore";
import { buildPlacedScene, placedItems, placedPoint, type PlacedScene } from "./scene3d";
import { projectContext, usePlacementStore } from "./store";

/** Plaatsingen van het project voor de 3D-weergave, en de selectie die "Toon in 3D-model" vraagt. */
export function usePlacedScene(model: SoilModel | null, calcs: CalculationInstance[], textColor: string): { scene: PlacedScene | null; focus: Selection | null } {
  const layers = usePlacementStore((s) => s.layers);
  const focusReq = usePlacementStore((s) => s.focus);
  const cpts = useCptStore((s) => s.cpts);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const items = useMemo(() => placedItems(calcs, projectContext(calcs)), [calcs, cpts]);
  const scene = useMemo(() => (model && items.length ? buildPlacedScene(model, items, layers, textColor, calcs) : null), [model, items, layers, textColor, calcs]);
  const focus = useMemo<Selection | null>(() => {
    if (!focusReq || !model) return null;
    const it = items.find((x) => x.calc.id === focusReq.calcId);
    return it ? { kind: "placed", calcId: it.calc.id, name: it.calc.name, point: placedPoint(model, it) } : null;
  }, [focusReq, model, items]);
  useEffect(() => { if (focusReq && model) usePlacementStore.getState().clearFocus(); }, [focusReq, model]);
  return { scene, focus };
}
