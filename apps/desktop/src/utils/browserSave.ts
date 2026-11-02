/**
 * Browser-fallback voor `@tauri-apps/plugin-dialog`'s `save()` —
 * gebruikt de File System Access API als die beschikbaar is
 * (Chrome/Edge/Opera), valt anders terug op een verborgen
 * `<a download>` zodat álle moderne browsers iets kunnen opslaan.
 *
 * API:
 *   saveBlobAsFile(blob, suggestedName, mimeAccept?) → Promise<string | null>
 *
 * `mimeAccept` is een object zoals dat aan showSaveFilePicker wordt
 * gegeven: `{ "application/json": [".ifcgeo", ".json"] }`. Wordt
 * genegeerd in de `<a download>`-fallback want browsers laten daar
 * geen filter-keuze toe.
 */

export type MimeAcceptMap = Record<string, string[]>;

/** True als de moderne File System Access API (showSaveFilePicker)
 *  beschikbaar is — dan krijgt de gebruiker een echte save-dialog met
 *  pad-keuze. Anders gaan we via een download-link in de Downloads-map. */
function hasFileSystemAccess(): boolean {
  return (
    typeof window !== "undefined" &&
    "showSaveFilePicker" in window &&
    typeof (window as unknown as { showSaveFilePicker: unknown }).showSaveFilePicker === "function"
  );
}

interface ShowSaveOptions {
  suggestedName?: string;
  types?: Array<{ description?: string; accept: MimeAcceptMap }>;
}
interface FileSystemFileHandle {
  name: string;
  createWritable(): Promise<FileSystemWritableFileStream>;
}
interface FileSystemWritableFileStream {
  write(data: Blob | ArrayBuffer | string): Promise<void>;
  close(): Promise<void>;
}

export async function saveBlobAsFile(
  blob: Blob | ((filename: string) => Blob),
  suggestedName: string,
  mimeAccept?: MimeAcceptMap,
): Promise<string | null> {
  const contents = (filename: string) => typeof blob === "function" ? blob(filename) : blob;
  if (hasFileSystemAccess()) {
    const picker = (
      window as unknown as {
        showSaveFilePicker: (opts: ShowSaveOptions) => Promise<FileSystemFileHandle>;
      }
    ).showSaveFilePicker;
    let handle: FileSystemFileHandle | undefined;
    try {
      handle = await picker({
        suggestedName,
        types: mimeAccept
          ? [{ description: "Open Geotechniek Studio", accept: mimeAccept }]
          : undefined,
      });
    } catch (err) {
      // AbortError = user cancel, stop silently. Anders: log + fall
      // back op anchor-download zodat we tóch íets opslaan.
      const name = (err as { name?: string } | null)?.name;
      if (name === "AbortError") return null;
      console.warn("showSaveFilePicker failed, fallback to <a download>:", err);
    }
    if (handle) {
      const writable = await handle.createWritable();
      const filename = handle.name || suggestedName;
      await writable.write(contents(filename));
      await writable.close();
      return filename;
    }
  }
  downloadBlobAsFile(contents(suggestedName), suggestedName);
  return suggestedName;
}

/** Deterministic browser download, also supported by embedded browser hosts. */
export function downloadBlobAsFile(blob: Blob, suggestedName: string): void {
  // Fallback: anchor-download. Werkt overal maar geen save-dialog —
  // bestand belandt direct in de Downloads-map.
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedName;
  a.style.position = "fixed";
  a.style.left = "-9999px";
  document.body.appendChild(a);
  a.click();
  // Cleanup met kleine vertraging zodat de browser tijd heeft om de
  // download te initiëren voordat we de URL revoken.
  setTimeout(() => {
    URL.revokeObjectURL(url);
    if (a.parentNode) a.parentNode.removeChild(a);
  }, 1000);
}

/** Convenience: serialiseer een object naar JSON-blob en sla op. */
export async function saveJsonAsFile<T>(
  data: T | ((filename: string) => T),
  suggestedName: string,
): Promise<string | null> {
  return saveBlobAsFile(filename => {
    const value = typeof data === "function" ? (data as (filename: string) => T)(filename) : data;
    return new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  }, suggestedName, {
    "application/json": [".ifcgeo", ".json"],
  });
}

/** Convenience: serialiseer plain text en sla op. */
export async function saveTextAsFile(
  text: string,
  suggestedName: string,
  mime: string = "text/plain",
): Promise<void> {
  const blob = new Blob([text], { type: mime });
  const extension = "." + (suggestedName.split(".").pop() ?? "txt");
  await saveBlobAsFile(blob, suggestedName, { [mime]: [extension] });
}
