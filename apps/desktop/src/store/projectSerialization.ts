import {
  getLatestTekening,
  tekeningStateToIfcgis,
  titleBlockToIfcgis,
  buildDeliverable,
  getAllLayerLive,
  getEnabledLayerIds,
} from "./tekeningState";
import { catalogToIfcgisLayers } from "../utils/gisLayerCatalog";
import { useCalculationsStore } from "../calc/framework/store";
import { toIfcxArray } from "../calc/framework/persistence";
import { useCptStore } from "./useCptStore";
import { IS_TAURI } from "../utils/platform";
import { invoke } from "@tauri-apps/api/core";

export function activeProjectPayload() {
  const state = useCptStore.getState();
  const doc = state.documents.find(d => d.id === state.activeDocId);
  if (!doc || doc.kind !== "project") throw new Error("Geen project actief.");
  const tek = getLatestTekening(doc.id);
  const calcs = useCalculationsStore.getState().byDoc.get(doc.id) ?? [];
  return {
    ...doc.savedLayout,
    header: {
      schema: "ifcgis-0.4",
      originating_system: "Open Geotechniek Studio",
      timestamp: new Date().toISOString(),
    },
    project: { type: "OpenGeoProject", ...doc.meta, date: doc.meta.date.slice(0, 10) },
    cpts: Array.from(doc.cpts.values()),
    bores: Array.from(doc.bores.values()),
    crs: { epsg: 28992, name: "Amersfoort / RD New" },
    gis: doc.savedLayout?.gis ?? {
      epsg: 28992, name: "Amersfoort / RD New",
      center: tek?.center ?? state.lastMapView,
      layers: catalogToIfcgisLayers(getAllLayerLive()),
    },
    ...(tek ? {
      tekening: tekeningStateToIfcgis(tek),
      title_block: titleBlockToIfcgis(tek.titleBlock),
      deliverable: buildDeliverable({
        projectName: doc.meta.title, projectNumber: doc.meta.project_number,
        tek, activeLayerIds: getEnabledLayerIds(),
      }),
    } : {}),
    calculations: toIfcxArray(calcs),
  };
}

export async function serializeActiveProject(): Promise<string> {
  const payload = activeProjectPayload();
  return IS_TAURI ? invoke<string>("preview_project_ifcx", { payload }) : JSON.stringify(payload, null, 2);
}
