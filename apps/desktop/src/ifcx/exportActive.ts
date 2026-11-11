// IFCX-export van het actieve document: gedeeld door de ribbonknoppen
// (IFC-tab en 3D-model) en de MCP-tool `studio_export_ifcx`.
import i18next from "i18next";
import { useCptStore } from "../store/useCptStore";
import { saveBlobAsFile } from "../utils/browserSave";
import { documentIfcxText, type IfcxSource } from "./documentIfcx";

/** Bron voor de IFCX van het actieve document; null zonder sonderingen. */
export function activeIfcxSource(): IfcxSource | null {
  const state = useCptStore.getState();
  const doc = state.documents.find((d) => d.id === state.activeDocId);
  if (!doc) return null;
  if (doc.kind === "project") return doc.cpts.size ? { id: doc.id, meta: doc.meta, cpts: [...doc.cpts.values()] } : null;
  if (doc.kind === "cpt") return { id: doc.id, meta: { ...state.projectMeta, title: doc.title || doc.cpt.id }, cpts: [doc.cpt] };
  return null;
}

/** Bestandsnaam zonder tekens die Windows of macOS weigeren. */
export function ifcxFileName(title: string): string {
  return `${(title || "project").replace(/[\\/:*?"<>|]+/g, "_").trim() || "project"}.ifcx`;
}

/** Vraagt een opslaglocatie en schrijft de IFCX; geeft het pad/de naam terug, of null bij annuleren. */
export async function exportActiveIfcx(): Promise<string | null> {
  const source = activeIfcxSource();
  if (!source) {
    window.alert(i18next.t("ribbon:ifc.exportNothing", { defaultValue: "Open eerst een project of sondering met RD-coördinaten." }));
    return null;
  }
  const text = documentIfcxText(source);
  return saveBlobAsFile(new Blob([text], { type: "application/json" }), ifcxFileName(source.meta.title), { "application/json": [".ifcx"] });
}
