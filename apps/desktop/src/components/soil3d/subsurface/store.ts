// Ondergrondgegevens per project: watervoerende pakketten (REGIS II), voxelmodel (GeoTOP), peilbuizen (BRO) en de
// grondwaterstanden die de gebruiker vastlegt. Gaat mee in het projectbestand onder `subsurface`.
import { create } from "zustand";
import type { Bbox, RegisGrid } from "./regis";
import type { GeoTopBlock } from "./geotop";
import type { Well } from "./groundwater";

export interface GroundwaterLevels {
  /** Freatische grondwaterstand [m NAP]; null = niet vastgelegd. */
  phreaticNap: number | null;
  /** Stijghoogte per watervoerend pakket [m NAP], index 0 = eerste pakket. */
  heads: (number | null)[];
  /** Herkomst, voor het rapport: handmatig of afgeleid uit metingen. */
  source: "handmatig" | "metingen" | null;
}

export interface SubsurfaceData {
  schema: "ogs.subsurface/1";
  area: Bbox | null;
  regis: RegisGrid | null;
  geotop: GeoTopBlock | null;
  wells: Well[] | null;
  groundwater: GroundwaterLevels;
  fetched: { regis?: string; geotop?: string; wells?: string };
}

export const emptySubsurface = (): SubsurfaceData => ({
  schema: "ogs.subsurface/1", area: null, regis: null, geotop: null, wells: null,
  groundwater: { phreaticNap: null, heads: [], source: null }, fetched: {},
});

interface SubsurfaceState {
  byDoc: Map<string, SubsurfaceData>;
  get: (docId: string | null) => SubsurfaceData;
  update: (docId: string, patch: Partial<SubsurfaceData>) => void;
  setGroundwater: (docId: string, patch: Partial<GroundwaterLevels>) => void;
  load: (docId: string, data: unknown) => void;
  remove: (docId: string) => void;
}

/** Leest een bewaard `subsurface`-blok; onbekend of beschadigd geeft een leeg model. */
export function parseSubsurface(data: unknown): SubsurfaceData {
  const d = data as Partial<SubsurfaceData> | null;
  if (!d || d.schema !== "ogs.subsurface/1") return emptySubsurface();
  return { ...emptySubsurface(), ...d, groundwater: { ...emptySubsurface().groundwater, ...(d.groundwater ?? {}) }, fetched: { ...(d.fetched ?? {}) } };
}

export const useSubsurfaceStore = create<SubsurfaceState>((set, get) => ({
  byDoc: new Map(),
  get: (docId) => (docId && get().byDoc.get(docId)) || emptySubsurface(),
  update: (docId, patch) => set((s) => {
    const byDoc = new Map(s.byDoc);
    byDoc.set(docId, { ...(s.byDoc.get(docId) ?? emptySubsurface()), ...patch });
    return { byDoc };
  }),
  setGroundwater: (docId, patch) => set((s) => {
    const cur = s.byDoc.get(docId) ?? emptySubsurface();
    const byDoc = new Map(s.byDoc);
    byDoc.set(docId, { ...cur, groundwater: { ...cur.groundwater, ...patch } });
    return { byDoc };
  }),
  load: (docId, data) => set((s) => { const byDoc = new Map(s.byDoc); byDoc.set(docId, parseSubsurface(data)); return { byDoc }; }),
  remove: (docId) => set((s) => { const byDoc = new Map(s.byDoc); byDoc.delete(docId); return { byDoc }; }),
}));

/** Het blok voor het projectbestand; null als er niets is opgehaald of vastgelegd. */
export function subsurfaceForProject(docId: string): SubsurfaceData | null {
  const d = useSubsurfaceStore.getState().byDoc.get(docId);
  if (!d) return null;
  const empty = !d.regis && !d.geotop && !d.wells && d.groundwater.phreaticNap === null && !d.groundwater.heads.some((h) => h !== null);
  return empty ? null : d;
}
