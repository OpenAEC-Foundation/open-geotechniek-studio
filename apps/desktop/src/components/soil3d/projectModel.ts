// Het 3D-grondmodel van het actieve project, los van de viewer: ook de IFC-tab en de export gebruiken het.
import type { Cpt } from "../../types/cpt";
import type { CalculationInstance } from "../../calc/framework/types";
import { useCptStore } from "../../store/useCptStore";
import { useCalculationsStore } from "../../calc/framework/store";
import { buildSoilModel, type SoilModel } from "./soilModel";
import type { Criterion } from "./scene";

/** Criterium voor de draagkrachtige laag: uit het funderingsadvies van het project, anders 10 MPa over 1 m. */
export function criterionFor(calcs: CalculationInstance[]): Criterion {
  const advice = calcs.find((c) => c.moduleId === "foundation-advice");
  const input = advice?.input as { bearingQcMpa?: number; bearingMinThicknessM?: number } | undefined;
  return {
    qcMpa: Number.isFinite(input?.bearingQcMpa) ? input!.bearingQcMpa! : 10,
    thicknessM: Number.isFinite(input?.bearingMinThicknessM) ? input!.bearingMinThicknessM! : 1,
    source: advice?.name ?? null,
  };
}

export function projectSoilModel(cpts: Map<string, Cpt>, criterion: Criterion): { model: SoilModel | null; error: string | null } {
  const list = [...cpts.values()];
  if (!list.length) return { model: null, error: null };
  try { return { model: buildSoilModel(list, { bearingQcMpa: criterion.qcMpa, bearingMinThicknessM: criterion.thicknessM }), error: null }; }
  catch (e) { return { model: null, error: String(e) }; }
}

/** Model van het actieve project op dit moment (voor acties buiten de viewer). */
export function activeSoilModel(): SoilModel | null {
  const { cpts, activeDocId } = useCptStore.getState();
  const calcs = (activeDocId ? useCalculationsStore.getState().byDoc.get(activeDocId) : undefined) ?? [];
  return projectSoilModel(cpts, criterionFor(calcs)).model;
}
