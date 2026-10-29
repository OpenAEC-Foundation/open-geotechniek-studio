/**
 * Eén centrale plek voor alle desktop-vs-web platform-checks.
 *
 * - `IS_TAURI` is een **constante**, één keer berekend op module-load.
 *   Geen runtime races meer met Tauri-injectie-timing.
 * - Voor élke operatie die anders werkt in desktop vs web staat hier
 *   één wrapper-functie. Aanroepers checken NOOIT zelf `isTauri()` —
 *   ze roepen `openFilesDialog()`, `bro.fetchCpts()`, `cpt.parse()`
 *   enz. en de juiste implementatie wordt gekozen.
 *
 * Voordeel boven try/catch-fallback (zoals eerder): geen verwarring
 * tussen "Rust gaf een echte parser-fout" en "Rust bestaat hier
 * helemaal niet". Een echte parser-fout kan netjes propageren in
 * Tauri zonder dat we 'm in een browser-TS-parser proberen.
 */

import { invoke } from "@tauri-apps/api/core";
import type { Cpt, Layer, ProjectMeta } from "../types/cpt";

// ════════════════════════════════════════════════════════════════
// Detectie — éénmalig op module-load
// ════════════════════════════════════════════════════════════════

/**
 * True als we in een Tauri webview draaien. Tauri 2 zet
 * `globalThis.isTauri = true` voordat any user code runt; dat is wat
 * `@tauri-apps/api/core`'s eigen `isTauri()` ook checkt. We
 * ondersteunen ook de oudere `__TAURI_*` window-flags als fallback.
 */
export const IS_TAURI: boolean = (() => {
  if (typeof window === "undefined") return false;
  const g = globalThis as unknown as { isTauri?: boolean };
  if (g.isTauri === true) return true;
  return (
    "__TAURI_INTERNALS__" in window ||
    "__TAURI__" in window ||
    "__TAURI_METADATA__" in window
  );
})();

// Debug — log de detectie 1x zodat het in console te checken is.
if (typeof window !== "undefined") {
  // eslint-disable-next-line no-console
  console.info(`[platform] IS_TAURI = ${IS_TAURI}`);
}

// ════════════════════════════════════════════════════════════════
// BRO REST API (sonderingen + boringen)
// ════════════════════════════════════════════════════════════════
//
// In Tauri: via Rust-commands (sneller XML-parser via quick-xml).
// In web:   directe fetch op publiek.broservices.nl (CORS-headers
//           matchen onze deploy-URL sinds 2024).

interface BBox {
  min_lat: number;
  min_lon: number;
  max_lat: number;
  max_lon: number;
}

interface BroFeature {
  id: string;
  lat: number;
  lon: number;
  depth?: number;
  kind: "cpt" | "bore";
  registration_date?: string;
  extra: Record<string, string>;
}

export const bro = {
  /** Zoek alle CPT-objecten in de bbox (gebruikt door MapView). */
  async fetchCpts(bbox: BBox): Promise<BroFeature[]> {
    if (IS_TAURI) {
      return invoke<BroFeature[]>("fetch_bro_area", { bbox });
    }
    const { fetchBroCpts } = await import("./broApiClient");
    return fetchBroCpts(bbox);
  },

  /** Zoek alle BHR-GT (boring) objecten in de bbox. */
  async fetchBores(bbox: BBox): Promise<BroFeature[]> {
    if (IS_TAURI) {
      return invoke<BroFeature[]>("fetch_bro_bores", { bbox });
    }
    const { fetchBroBores } = await import("./broApiClient");
    return fetchBroBores(bbox);
  },

  /** Get full CPT dispatch XML voor één broId. */
  async fetchCptXml(broId: string): Promise<string> {
    if (IS_TAURI) {
      return invoke<string>("fetch_bro_cpt", { broId });
    }
    const { fetchBroCptXml } = await import("./broApiClient");
    return fetchBroCptXml(broId);
  },

  /** Get full BHR-GT dispatch XML voor één broId. */
  async fetchBoreXml(broId: string): Promise<string> {
    if (IS_TAURI) {
      return invoke<string>("fetch_bro_bore", { broId });
    }
    const { fetchBroBoreXml } = await import("./broApiClient");
    return fetchBroBoreXml(broId);
  },
};

// ════════════════════════════════════════════════════════════════
// CPT parsing (GEF + BRO CPT XML)
// ════════════════════════════════════════════════════════════════
//
// In Tauri: invoke('open_cpt') — autoritair, kent meer edge cases.
// In web:   pure-TS parsers (gefParser + broCptParser).

export const cpt = {
 async detectLayers(value:Cpt):Promise<Layer[]> {
 const {detectLayers}=await import('./browserCore');return detectLayers(value);
 },
  async parse(content: string, filename: string): Promise<Cpt> {
    // GEF uses the same diagnostic parser in desktop, browser and the headless package.
    const { looksLikeGef, parseGef } = await import('../types/gefParser');
    if (looksLikeGef(content)) {
      const parsed = parseGef(content, filename);
      if (IS_TAURI) await invoke('open_cpt', { content: JSON.stringify(parsed), filename: filename + '.ifcgeo' });
      return parsed;
    }
    if (/\.(ifcgeo|ifcx)$/i.test(filename)) {const {parseCptSnapshot}=await import('../types/projectFile');return parseCptSnapshot(content);}
    const { looksLikeBroCptXml, parseBroCptXml } = await import("../types/broCptParser");
    if (looksLikeBroCptXml(content)) {
      const parsed=parseBroCptXml(content,filename);
      if(IS_TAURI)await invoke('open_cpt',{content:JSON.stringify(parsed),filename:filename+'.ifcgeo'});
      return parsed;
    }
    throw new Error(
      `Onbekend CPT-formaat (${filename}). Verwacht GEF of BRO CPT XML.`,
    );
  },
};

// ════════════════════════════════════════════════════════════════
// File picker
// ════════════════════════════════════════════════════════════════
//
// In Tauri: native OS-dialog via plugin-dialog, retourneert paden.
// In web:   HTML <input type="file">, retourneert {name, text}.
//
// Beide flows geven dezelfde shape terug zodat de caller één enkele
// for-loop kan draaien — `path` is undefined in web, gevuld in
// Tauri.

export interface PickedFile {
  name: string;
  /** Volledige inhoud als UTF-8 string. */
  text: string;
  /** Pad op disk — alleen gezet in Tauri-modus. */
  path?: string;
}

export const files = {
  /**
   * Open een file-picker voor de standaard ondersteunde formats
   * (GEF, XML, .ifcgeo, .ifcgis, .ifcx) en lees de gekozen
   * bestand(en) als string in.
   */
  async pickAndRead(multiple: boolean = true): Promise<PickedFile[]> {
    if (IS_TAURI) {
      const { open: openDialog } = await import("@tauri-apps/plugin-dialog");
      const { readTextFile } = await import("@tauri-apps/plugin-fs");
      const selected = await openDialog({
        multiple,
        filters: [
          {
            name: "Open Geotechniek Studio",
            extensions: ["gef", "GEF", "xml", "XML", "ifcgeo", "ifcgis", "ifcx"],
          },
        ],
      });
      if (!selected) return [];
      const paths = Array.isArray(selected) ? selected : [selected];
      return Promise.all(
        paths.map(async (p) => ({
          name: p.split(/[\\/]/).pop() ?? p,
          text: await readTextFile(p),
          path: p,
        })),
      );
    }
    const { pickFiles } = await import("./browserFilePicker");
    const picked = await pickFiles({
      multiple,
      accept: ".gef,.xml,.ifcgeo,.ifcgis,.ifcx",
    });
    return picked.map((f) => ({ name: f.name, text: f.text }));
  },
};

export const reports = {
    async preview(cpts: Cpt[], project: ProjectMeta, sections?: import('../store/reportSectionsState').ReportSections): Promise<Uint8Array> {
        // Both interfaces render the supplied snapshots through the same engine.
        const { generateBrowserReport } = await import('./browserReport');
        return generateBrowserReport(cpts, project, sections);
    },
    async save(cpts: Cpt[], project: ProjectMeta, sections?: import('../store/reportSectionsState').ReportSections): Promise<void> {
        if (IS_TAURI) {
            const { save } = await import('@tauri-apps/plugin-dialog');
            const outputPath = await save({ defaultPath: project.title + '.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }] });
            if (outputPath) {
                const bytes = await reports.preview(cpts, project, sections);
                const { writeFile } = await import('@tauri-apps/plugin-fs');
                await writeFile(outputPath, bytes);
            }
            return;
        }
        const { downloadPdf } = await import('./downloadPdf');
        await downloadPdf((project.title || 'rapport') + '.pdf', await reports.preview(cpts, project, sections));
    },
    /** Reserve the browser window while the click still grants popup permission. */
    async generateAndOpen(cpts: Cpt[], project: ProjectMeta, sections?: import('../store/reportSectionsState').ReportSections): Promise<void> {
        if (IS_TAURI) {
            await reports.open(await reports.preview(cpts, project, sections));
            return;
        }
        const opened = window.open('about:blank', '_blank');
        if (!opened) throw new Error('Sta pop-ups toe of gebruik Genereer PDF om te downloaden.');
        let url: string | undefined;
        try {
            opened.opener = null;
            const bytes = await reports.preview(cpts, project, sections);
            if (opened.closed) throw new Error('Het PDF-venster is gesloten. Open het rapport opnieuw.');
            url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }));
            opened.location.href = url;
            const documentUrl = url;
            setTimeout(() => URL.revokeObjectURL(documentUrl), 60000);
        } catch (error) {
            if (url) URL.revokeObjectURL(url);
            opened.close();
            throw error;
        }
    },
    async open(bytes: Uint8Array): Promise<void> {
        if (IS_TAURI)
            return invoke('open_report_pdf', { bytes: Array.from(bytes) });
        const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }));
        const opened = window.open(url, '_blank');
        if (!opened) {
            URL.revokeObjectURL(url);
            throw new Error('Sta pop-ups toe of gebruik Genereer PDF om te downloaden.');
        }
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
};
