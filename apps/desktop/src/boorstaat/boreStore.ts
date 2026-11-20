// Boringen van het actieve document lezen en bijwerken. Een project bewaart zijn boringen in het
// projectbestand; zonder project staat een boring als los tabblad open.
import { useCptStore, type AppDocument, type BoreDocument } from "../store/useCptStore";
import type { Bore } from "../types/bore";

function activeDoc(): AppDocument | undefined {
  const state = useCptStore.getState();
  return state.documents.find((d) => d.id === state.activeDocId);
}

/** Boringen van een document: die van het project, of de ene boring van een los tabblad. */
export function boresOf(doc: AppDocument | undefined): Bore[] {
  return doc?.kind === "project" ? Array.from(doc.bores.values()) : doc?.kind === "bore" ? [doc.bore] : [];
}

export const activeBores = (): Bore[] => boresOf(activeDoc());

/**
 * Bewaart een nieuwe of gewijzigde boring. `previousId` is het nummer waaronder hij stond; bij een
 * ander nummer verhuist hij. In een project komt hij bij de projectboringen, een los boortabblad
 * wordt bijgewerkt, en anders opent hij als nieuw los tabblad.
 */
export function saveBore(bore: Bore, previousId?: string): void {
  useCptStore.setState((s) => {
    const active = s.documents.find((d) => d.id === s.activeDocId);
    const dropPdf = (id: string) => { if (!s.pdfCache.has(id)) return s.pdfCache; const next = new Map(s.pdfCache); next.delete(id); return next; };
    if (active?.kind === "project") {
      // Volgorde behouden: een gewijzigde boring blijft op zijn plek in de lijst.
      const bores = new Map<string, Bore>();
      let placed = false;
      for (const [id, existing] of active.bores) {
        if (id === (previousId ?? bore.id)) { bores.set(bore.id, bore); placed = true; } else if (id !== bore.id) bores.set(id, existing);
      }
      if (!placed) bores.set(bore.id, bore);
      return { documents: s.documents.map((d) => d.id === active.id ? { ...active, bores } : d), pdfCache: dropPdf(active.id) };
    }
    if (active?.kind === "bore" && previousId !== undefined && active.bore.id === previousId) {
      return { documents: s.documents.map((d) => d.id === active.id ? { ...active, bore, title: active.title === previousId ? bore.id : active.title } : d), pdfCache: dropPdf(active.id) };
    }
    const doc: BoreDocument = { kind: "bore", id: `bore-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, title: bore.id, bore };
    // Zelfde afgeleide toestand als bij het openen van een boorbestand: geen sonderingen in beeld.
    return { documents: [...s.documents, doc], activeDocId: doc.id, cpts: new Map(), activeCptId: null, projectMeta: { ...s.projectMeta, title: bore.id } };
  });
}

/** Verwijdert een boring uit het actieve project. */
export function removeBore(id: string): void {
  useCptStore.setState((s) => {
    const active = s.documents.find((d) => d.id === s.activeDocId);
    if (active?.kind !== "project" || !active.bores.has(id)) return s;
    const bores = new Map(active.bores);
    bores.delete(id);
    return { documents: s.documents.map((d) => d.id === active.id ? { ...active, bores } : d) };
  });
}

/** Open de boorstaat-editor: met een boornummer om te bewerken, zonder voor een nieuwe boring. */
export const OPEN_BORE_EDITOR_EVENT = "ogs:open-bore-editor";
export const openBoreEditor = (boreId?: string) => window.dispatchEvent(new CustomEvent(OPEN_BORE_EDITOR_EVENT, { detail: { boreId } }));
