// Ophalen van de verrijking voor het actieve project en afleiden van de grondwaterstanden.
import type { SoilModel } from "../soilModel";
import { useSoil3DStore } from "../useSoil3DStore";
import { aquifers, cellValue, fetchRegis, type Bbox, type RegisGrid } from "./regis";
import { fetchGeotop } from "./geotop";
import { expand, fetchWells, wellAquifer, type Well } from "./groundwater";
import { useSubsurfaceStore, type GroundwaterLevels } from "./store";

/** Modelgebied in RD. */
export function modelArea(model: SoilModel): Bbox {
  const g = model.grid, o = model.origin;
  return { xmin: o.x + g.east0, ymin: o.y + g.north0, xmax: o.x + g.east0 + g.nx * g.dx, ymax: o.y + g.north0 + g.ny * g.dy };
}

/** Pakket van elke peilbuis, met de REGIS-cel op de plek van de buis (of de dichtstbijzijnde cel). */
export function assignAquifers(wells: Well[], regis: RegisGrid | null): Well[] {
  if (!regis) return wells;
  const packs = aquifers(regis);
  return wells.map((w) => {
    const x = Math.min(Math.max(w.x, regis.x0 + 1), regis.x0 + regis.nx * regis.cell - 1);
    const y = Math.min(Math.max(w.y, regis.y0 + 1), regis.y0 + regis.ny * regis.cell - 1);
    const mid = w.screenTop !== null && w.screenBottom !== null ? (w.screenTop + w.screenBottom) / 2 : null;
    return { ...w, aquifer: wellAquifer(mid, packs.map((p) => ({ index: p.index, top: cellValue(regis, p.top, x, y), bottom: cellValue(regis, p.bottom, x, y) }))) };
  });
}

/**
 * Grondwaterstanden uit de metingen: freatisch uit filters in de deklaag, stijghoogte per pakket uit filters in dat
 * pakket; telkens het gemiddelde van de laatste vijf meetjaren. Alleen gevulde waarden komen terug.
 */
export function levelsFromWells(wells: Well[], packs: number): Partial<GroundwaterLevels> {
  const avg = (ws: Well[]) => { const v = ws.map((w) => w.stats?.recentMean).filter((x): x is number => x !== undefined); return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100 : null; };
  const phreatic = avg(wells.filter((w) => w.aquifer === 0));
  const heads = Array.from({ length: packs }, (_, i) => avg(wells.filter((w) => w.aquifer === i + 1)));
  if (phreatic === null && heads.every((h) => h === null)) return {};
  return { phreaticNap: phreatic, heads, source: "metingen" };
}

async function run(label: string, job: () => Promise<string>) {
  const ui = useSoil3DStore.getState();
  ui.set({ busy: label, message: null });
  try { ui.set({ message: { text: await job(), error: false } }); }
  catch (e) { ui.set({ message: { text: `${label}: ${e instanceof Error ? e.message : String(e)}`, error: true } }); }
  finally { ui.set({ busy: null }); }
}

const now = () => new Date().toISOString();

export function loadAquifers(docId: string, model: SoilModel) {
  return run("Pakketten ophalen", async () => {
    const area = modelArea(model);
    const regis = await fetchRegis(area);
    const store = useSubsurfaceStore.getState();
    const cur = store.get(docId);
    store.update(docId, { area, regis, wells: cur.wells ? assignAquifers(cur.wells, regis) : null, fetched: { ...cur.fetched, regis: now() } });
    useSoil3DStore.getState().set({ showAquifers: true });
    return `REGIS II: ${aquifers(regis).length} watervoerende pakketten, ${regis.nx}×${regis.ny} cellen van 100 m.`;
  });
}

export function loadGeotop(docId: string, model: SoilModel) {
  return run("GeoTOP ophalen", async () => {
    const area = modelArea(model);
    const g = model.grid;
    // Tot NAP −50 m (de onderkant van GeoTOP): onder de sonderingen vult GeoTOP het model verder aan.
    const geotop = await fetchGeotop(area, Math.min(g.topNap - g.nz * g.dz - 1, -50), g.topNap + 1);
    const store = useSubsurfaceStore.getState();
    store.update(docId, { area, geotop, fetched: { ...store.get(docId).fetched, geotop: now() } });
    useSoil3DStore.getState().set({ showGeotop: true });
    return `GeoTOP: ${geotop.xs.length}×${geotop.ys.length} kolommen van 100 m, ${geotop.zs.length} lagen van 0,5 m.`;
  });
}

export function loadGroundwater(docId: string, model: SoilModel) {
  return run("Grondwater ophalen", async () => {
    const area = modelArea(model);
    const store = useSubsurfaceStore.getState();
    const cur = store.get(docId);
    const center = { x: (area.xmin + area.xmax) / 2, y: (area.ymin + area.ymax) / 2 };
    // Geen peilbuis met meetreeks dichtbij? Dan verder weg zoeken, tot 5 km.
    let wells: Well[] = [], radius = 0;
    for (radius of WELL_RADII) {
      wells = await fetchWells(expand(area, radius), center);
      if (wells.some((w) => w.stats)) break;
    }
    wells = assignAquifers(wells, cur.regis);
    const levels = cur.groundwater.source === "handmatig" ? {} : levelsFromWells(wells, cur.regis ? aquifers(cur.regis).length : 2);
    store.update(docId, { area, wells, groundwater: { ...cur.groundwater, ...levels }, fetched: { ...cur.fetched, wells: now() } });
    useSoil3DStore.getState().set({ showWater: true, showWells: true });
    const measured = wells.filter((w) => w.stats).length;
    return `${wells.length} peilbuisfilters binnen ${radius >= 1000 ? `${radius / 1000} km` : `${radius} m`}, ${measured} met meetreeks${cur.regis ? "" : "; haal de pakketten op om de filters aan een pakket toe te kennen"}.`;
  });
}

/** Zoekstralen rond het modelgebied voor peilbuizen; de eerste met een meetreeks wint. */
export const WELL_RADII = [500, 1500, 5000];

/** Of het model echte RD-coördinaten heeft (anders is er niets op te halen). */
export function hasRd(model: SoilModel) {
  return model.origin.x !== 0 || model.origin.y !== 0;
}

const autoLoaded = new Set<string>();

/**
 * Haalt de verrijking van buiten op die nog ontbreekt voor dit modelgebied: eerst de pakketten (de peilbuizen
 * worden daaraan toegekend), dan GeoTOP en het grondwater. Eén keer per document en gebied.
 */
export async function loadMissing(docId: string, model: SoilModel) {
  if (!hasRd(model)) return;
  const area = modelArea(model);
  const key = `${docId}:${[area.xmin, area.ymin, area.xmax, area.ymax].map((v) => Math.round(v)).join(",")}`;
  if (autoLoaded.has(key)) return;
  autoLoaded.add(key);
  const get = () => useSubsurfaceStore.getState().get(docId);
  const same = (b: Bbox | null) => !!b && Math.abs(b.xmin - area.xmin) < 1 && Math.abs(b.ymin - area.ymin) < 1 && Math.abs(b.xmax - area.xmax) < 1 && Math.abs(b.ymax - area.ymax) < 1;
  const fresh = same(get().area);
  if (!fresh || !get().regis) await loadAquifers(docId, model);
  if (!fresh || !get().geotop) await loadGeotop(docId, model);
  if (!fresh || !get().wells) await loadGroundwater(docId, model);
}
