// Een gedigitaliseerde sondering bewaren: in het actieve project, als bijgewerkte sondering van een los
// tabblad, of als nieuw los tabblad.
import { loadCptSnapshot, useCptStore } from "../store/useCptStore";
import type { Cpt } from "../types/cpt";

export const OPEN_DIGITIZER_EVENT = "ogs:open-digitizer";
/** Open het scherm: met een sonderingnummer om die bij te werken, zonder voor een nieuwe sondering. */
export const openDigitizer = (cptId?: string) => window.dispatchEvent(new CustomEvent(OPEN_DIGITIZER_EVENT, { detail: { cptId } }));

/**
 * Bewaart de sondering. `previousId` is het nummer waaronder zij stond; bij een ander nummer verhuist
 * zij. Geeft terug waar zij terechtkwam.
 */
export function saveDigitizedCpt(cpt: Cpt, previousId?: string): "project" | "updated" | "document" {
  const state = useCptStore.getState();
  const active = state.documents.find((d) => d.id === state.activeDocId);
  if (active?.kind === "project") {
    // Volgorde behouden: een bijgewerkte sondering blijft op haar plek in de lijst.
    const cpts = new Map<string, Cpt>();
    let placed = false;
    for (const [id, existing] of active.cpts) {
      if (id === (previousId ?? cpt.id)) { cpts.set(cpt.id, cpt); placed = true; } else if (id !== cpt.id) cpts.set(id, existing);
    }
    if (!placed) cpts.set(cpt.id, cpt);
    useCptStore.setState((s) => ({ documents: s.documents.map((d) => d.id === active.id && d.kind === "project" ? { ...d, cpts, activeCptId: cpt.id } : d) }));
    // Werkt de afgeleide toestand bij en maakt de voorvertoning opnieuw.
    useCptStore.getState().replaceCpt(cpt);
    return "project";
  }
  if (active?.kind === "cpt" && previousId !== undefined && active.cpt.id === previousId) {
    useCptStore.setState((s) => ({ documents: s.documents.map((d) => d.id === active.id && d.kind === "cpt" ? { ...d, cpt, title: d.title === previousId ? cpt.id : d.title } : d) }));
    useCptStore.getState().replaceCpt(cpt);
    return "updated";
  }
  loadCptSnapshot(cpt, cpt.id);
  return "document";
}
