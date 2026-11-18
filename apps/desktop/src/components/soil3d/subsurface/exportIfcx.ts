// Ondergrondmodel als .ifcx opslaan (Tauri: opslaan-dialoog; browser: download).
import type { SoilModel } from "../soilModel";
import { isTauriRuntime } from "../../../utils/downloadPdf";
import { useCptStore } from "../../../store/useCptStore";
import { useSoil3DStore } from "../useSoil3DStore";
import { buildSubsurfaceIfcx } from "./ifcx";
import { useSubsurfaceStore } from "./store";

export async function exportSubsurfaceIfcx(docId: string, model: SoilModel): Promise<void> {
  const ui = useSoil3DStore.getState();
  try {
    const meta = useCptStore.getState().projectMeta;
    const ifcx = buildSubsurfaceIfcx({
      model, subsurface: useSubsurfaceStore.getState().get(docId),
      project: { title: meta.title || "Project", number: meta.project_number, author: meta.author },
    });
    const text = JSON.stringify(ifcx);
    const name = `ondergrond-${(meta.project_number || meta.title || "project").replace(/[^\w-]+/g, "-")}.ifcx`;
    if (isTauriRuntime()) {
      const dialog = await import("@tauri-apps/plugin-dialog");
      const fs = await import("@tauri-apps/plugin-fs");
      const path = await dialog.save({ defaultPath: name, filters: [{ name: "IFCX", extensions: ["ifcx"] }] });
      if (!path) return;
      await fs.writeTextFile(path, text);
    } else {
      const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: name });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 200);
    }
    const strata = ifcx.data.filter((e) => (e.attributes?.["bsi::ifc::class"] as { code?: string } | undefined)?.code === "IfcGeotechnicalStratum").length;
    ui.set({ message: { text: `IFCX opgeslagen: ${strata} strata, ${model.columns.length} sonderingen, ${(text.length / 1024 / 1024).toFixed(1)} MB.`, error: false } });
  } catch (e) {
    ui.set({ message: { text: `IFCX-export mislukt: ${e instanceof Error ? e.message : String(e)}`, error: true } });
  }
}
