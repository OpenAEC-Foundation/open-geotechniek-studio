// Opslaan van de BRO-registratieverzoeken: één bestand per sondering.
import { IS_TAURI } from "../utils/platform";
import { downloadBlobAsFile, saveBlobAsFile } from "../utils/browserSave";

export interface BroFile { filename: string; xml: string }

const MIME = "application/xml";
const blob = (xml: string) => new Blob([xml], { type: `${MIME};charset=utf-8` });

/**
 * Sla de bestanden op. Eén bestand: een gewoon opslaan-venster. Meer bestanden: in de
 * desktop-app één map kiezen, in de browser elk bestand als download.
 * Geeft het aantal opgeslagen bestanden; 0 als de gebruiker annuleert.
 */
export async function saveBroFiles(files: BroFile[]): Promise<number> {
  if (!files.length) return 0;
  if (IS_TAURI) {
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    if (files.length === 1) {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const path = await save({ defaultPath: files[0].filename, filters: [{ name: "BRO-XML", extensions: ["xml"] }] });
      if (!path) return 0;
      await writeTextFile(path, files[0].xml);
      return 1;
    }
    const { open } = await import("@tauri-apps/plugin-dialog");
    const folder = await open({ directory: true, multiple: false, title: "Map voor de BRO-XML-bestanden" });
    if (!folder || Array.isArray(folder)) return 0;
    const { join } = await import("@tauri-apps/api/path");
    for (const file of files) await writeTextFile(await join(folder, file.filename), file.xml);
    return files.length;
  }
  if (files.length === 1) return (await saveBlobAsFile(blob(files[0].xml), files[0].filename, { [MIME]: [".xml"] })) ? 1 : 0;
  for (const file of files) downloadBlobAsFile(blob(file.xml), file.filename);
  return files.length;
}
