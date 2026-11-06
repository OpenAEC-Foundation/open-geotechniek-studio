import { create } from "zustand";

export type CutAxis = "east" | "north";

export interface Soil3DSettings {
  showCpts: boolean;
  showQc: boolean;
  showModel: boolean;
  showGround: boolean;
  showBearing: boolean;
  showPileToes: boolean;
  exaggeration: number;
  opacity: number;
  cutAxis: CutAxis;
  /** 0–1: deel van het model dat blijft staan langs de snede-as. */
  cut: number;
  hiddenZones: number[];
}

interface Soil3DState extends Soil3DSettings {
  set: (patch: Partial<Soil3DSettings>) => void;
  toggle: (key: "showCpts" | "showQc" | "showModel" | "showGround" | "showBearing" | "showPileToes") => void;
  toggleZone: (zone: number) => void;
  /** Teller die de viewer laat terugzoomen naar het hele model. */
  fitRequest: number;
  requestFit: () => void;
}

export const DEFAULT_SOIL3D: Soil3DSettings = {
  showCpts: true, showQc: true, showModel: true, showGround: false, showBearing: true, showPileToes: true,
  exaggeration: 2, opacity: 1, cutAxis: "east", cut: 1, hiddenZones: [],
};

export const useSoil3DStore = create<Soil3DState>((set) => ({
  ...DEFAULT_SOIL3D,
  fitRequest: 0,
  set: (patch) => set(patch),
  toggle: (key) => set((s) => ({ [key]: !s[key] }) as Partial<Soil3DState>),
  toggleZone: (zone) => set((s) => ({ hiddenZones: s.hiddenZones.includes(zone) ? s.hiddenZones.filter((z) => z !== zone) : [...s.hiddenZones, zone] })),
  requestFit: () => set((s) => ({ fitRequest: s.fitRequest + 1 })),
}));
