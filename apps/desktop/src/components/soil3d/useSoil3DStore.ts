import { create } from "zustand";
import type { SoilModel } from "./soilModel";
import { defaultLayout, type Layout } from "./layout";

/** Section box in modelcoördinaten: oost en noord t.o.v. het modelmidden [m], hoogte in m NAP. */
export interface SectionBox { e0: number; e1: number; n0: number; n1: number; z0: number; z1: number }

/** Views in de tab 3D-model; een venster toont ze als tabbladen. */
export type ViewId = "model" | "section";
export const VIEWS: ViewId[] = ["model", "section"];

export interface Soil3DSettings {
  showCpts: boolean;
  showQc: boolean;
  showModel: boolean;
  showGround: boolean;
  showBearing: boolean;
  showPileToes: boolean;
  /** Verrijking van buiten: watervoerende pakketten, GeoTOP-voxels, grondwater en peilbuizen. */
  showAquifers: boolean;
  showGeotop: boolean;
  showWater: boolean;
  showWells: boolean;
  exaggeration: number;
  opacity: number;
  /** Diameter van de sonderingskolommen in m; null = automatisch naar de modelgrootte. */
  cptDiameter: number | null;
  hiddenZones: number[];
}

export type ToggleKey = "showCpts" | "showQc" | "showModel" | "showGround" | "showBearing" | "showPileToes" | "showAquifers" | "showGeotop" | "showWater" | "showWells";

interface Soil3DState extends Soil3DSettings {
  set: (patch: Partial<Soil3DSettings & Pick<Soil3DState, "model" | "busy" | "message" | "sectionBox">>) => void;
  toggle: (key: ToggleKey) => void;
  /** Het model dat de viewer nu toont (voor de acties in het lint). */
  model: SoilModel | null;
  busy: string | null;
  message: { text: string; error: boolean } | null;
  toggleZone: (zone: number) => void;
  /** Teller die de vensters laat terugzoomen naar het hele model. */
  fitRequest: number;
  requestFit: () => void;
  /** Section box; null = nog niet gezet (de viewer zet hem bij een nieuw model). */
  sectionBox: SectionBox | null;
  /** Vensters naast elkaar met tabbladen (zie layout.ts). */
  layout: Layout;
  updateLayout: (fn: (l: Layout) => Layout) => void;
}

export const DEFAULT_SOIL3D: Soil3DSettings = {
  showCpts: true, showQc: true, showModel: true, showGround: false, showBearing: true, showPileToes: true,
  showAquifers: true, showGeotop: true, showWater: true, showWells: true,
  exaggeration: 2, opacity: 1, cptDiameter: null, hiddenZones: [],
};

/** Standaard section box: het hele model, met de voorkant (zuid) tot het midden, zodat er meteen een snede is. */
export function defaultSectionBox(model: SoilModel): SectionBox {
  const g = model.grid;
  const e0 = g.east0, e1 = g.east0 + g.nx * g.dx, n0 = g.north0, n1 = g.north0 + g.ny * g.dy;
  return { e0, e1, n0: (n0 + n1) / 2, n1, z0: g.topNap - g.nz * g.dz, z1: g.topNap + 0.5 };
}

export const useSoil3DStore = create<Soil3DState>((set) => ({
  ...DEFAULT_SOIL3D,
  fitRequest: 0,
  model: null,
  busy: null,
  message: null,
  sectionBox: null,
  layout: defaultLayout(),
  set: (patch) => set(patch),
  toggle: (key) => set((s) => ({ [key]: !s[key] }) as Partial<Soil3DState>),
  toggleZone: (zone) => set((s) => ({ hiddenZones: s.hiddenZones.includes(zone) ? s.hiddenZones.filter((z) => z !== zone) : [...s.hiddenZones, zone] })),
  requestFit: () => set((s) => ({ fitRequest: s.fitRequest + 1 })),
  updateLayout: (fn) => set((s) => ({ layout: fn(s.layout) })),
}));
