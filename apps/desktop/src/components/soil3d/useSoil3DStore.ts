import { create } from "zustand";

export type CutAxis = "east" | "north";
export type CameraView = "iso" | "top" | "front" | "side";

export interface Soil3DSettings {
  showCpts: boolean;
  showQc: boolean;
  showModel: boolean;
  showGround: boolean;
  showBearing: boolean;
  showPileToes: boolean;
  showLabels: boolean;
  exaggeration: number;
  opacity: number;
  cutAxis: CutAxis;
  /** 0–1: deel van het model dat blijft staan langs de snede-as. */
  cut: number;
  /** 0–1: deel van de modelhoogte dat van boven wordt weggehaald. */
  cutTop: number;
  hiddenZones: number[];
}

interface Soil3DState extends Soil3DSettings {
  set: (patch: Partial<Soil3DSettings>) => void;
  toggle: (key: "showCpts" | "showQc" | "showModel" | "showGround" | "showBearing" | "showPileToes" | "showLabels") => void;
  toggleZone: (zone: number) => void;
  /** Verzoek om de camera naar een standaardaanzicht te zetten (passend in beeld). */
  cameraRequest: { view: CameraView; seq: number };
  requestFit: (view?: CameraView) => void;
  /** Teller die de viewer een PNG laat exporteren. */
  exportRequest: number;
  requestExport: () => void;
}

export const DEFAULT_SOIL3D: Soil3DSettings = {
  showCpts: true, showQc: true, showModel: true, showGround: false, showBearing: true, showPileToes: true, showLabels: true,
  exaggeration: 2, opacity: 1, cutAxis: "east", cut: 1, cutTop: 0, hiddenZones: [],
};

export const useSoil3DStore = create<Soil3DState>((set) => ({
  ...DEFAULT_SOIL3D,
  cameraRequest: { view: "iso", seq: 0 },
  exportRequest: 0,
  set: (patch) => set(patch),
  toggle: (key) => set((s) => ({ [key]: !s[key] }) as Partial<Soil3DState>),
  toggleZone: (zone) => set((s) => ({ hiddenZones: s.hiddenZones.includes(zone) ? s.hiddenZones.filter((z) => z !== zone) : [...s.hiddenZones, zone] })),
  requestFit: (view = "iso") => set((s) => ({ cameraRequest: { view, seq: s.cameraRequest.seq + 1 } })),
  requestExport: () => set((s) => ({ exportRequest: s.exportRequest + 1 })),
}));
