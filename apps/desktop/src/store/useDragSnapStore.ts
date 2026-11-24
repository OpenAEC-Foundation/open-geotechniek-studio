// Snapafstand bij het slepen van niveaus in de sondeergrafiek van de paalberekeningen (druk en trek).
// Een app-instelling: bewaard in de voorkeuren, standaard 0,25 m. 0 = niet snappen (op hele centimeters).
import { create } from "zustand";
import { getSetting, setSetting } from "../store";

export const DEFAULT_DRAG_SNAP_M = 0.25;
export const DRAG_SNAP_KEY = "dragSnapM";
const MAX_SNAP_M = 5;

/** Geldige snapafstand: 0 tot 5 m op hele millimeters; iets anders geeft de standaard. */
export function normalizeSnap(value: unknown): number {
  const n = typeof value === "string" ? Number(value.replace(",", ".")) : Number(value);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_DRAG_SNAP_M;
  return Math.min(MAX_SNAP_M, Math.round(n * 1000) / 1000);
}

/** Niveau op het snapraster rond NAP 0; bij 0 op hele centimeters. Zonder drijvendekommastaart. */
export function snapNap(nap: number, step: number): number {
  const s = step > 0 ? step : 0.01;
  return Number((Math.round(nap / s) * s).toFixed(3));
}

interface DragSnapState {
  snapM: number;
  setSnapM: (value: number) => void;
}

export const useDragSnapStore = create<DragSnapState>((set) => ({
  snapM: DEFAULT_DRAG_SNAP_M,
  setSnapM: (value) => {
    const snapM = normalizeSnap(value);
    set({ snapM });
    void setSetting(DRAG_SNAP_KEY, snapM);
  },
}));

let loaded = false;
/** Leest de bewaarde snapafstand één keer in. */
export function loadDragSnap(): Promise<void> {
  if (loaded) return Promise.resolve();
  loaded = true;
  return getSetting<number>(DRAG_SNAP_KEY, DEFAULT_DRAG_SNAP_M).then((v) => useDragSnapStore.setState({ snapM: normalizeSnap(v) }));
}
void loadDragSnap();
