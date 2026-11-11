import { create } from "zustand";

export type SubsurfaceCamera = "iso" | "top" | "front" | "side";

interface SubsurfaceState {
  showVoxels: boolean;
  showCpts: boolean;
  showLabels: boolean;
  /** Verticale overdrijving van het model. */
  exaggeration: number;
  /** Doorsnede: fractie (0–1) van de modelbreedte in oost-west-richting die zichtbaar blijft. */
  cutX: number;
  /** Doorsnede: fractie (0–1) van de modeldiepte in noord-zuid-richting die zichtbaar blijft. */
  cutY: number;
  /** Bovenkant afsnijden: fractie (0–1) van de modelhoogte die van boven wordt weggehaald. */
  cutTop: number;
  opacity: number;
  /** Teller die de view laat terugspringen naar een standaardaanzicht. */
  cameraRequest: { view: SubsurfaceCamera; seq: number };
  exportSeq: number;
  set: (patch: Partial<Omit<SubsurfaceState, "set" | "requestCamera" | "requestExport">>) => void;
  requestCamera: (view: SubsurfaceCamera) => void;
  requestExport: () => void;
}

export const useSubsurfaceStore = create<SubsurfaceState>((set) => ({
  showVoxels: true,
  showCpts: true,
  showLabels: true,
  exaggeration: 2,
  cutX: 1,
  cutY: 1,
  cutTop: 0,
  opacity: 1,
  cameraRequest: { view: "iso", seq: 0 },
  exportSeq: 0,
  set: (patch) => set(patch),
  requestCamera: (view) =>
    set((s) => ({ cameraRequest: { view, seq: s.cameraRequest.seq + 1 } })),
  requestExport: () => set((s) => ({ exportSeq: s.exportSeq + 1 })),
}));
