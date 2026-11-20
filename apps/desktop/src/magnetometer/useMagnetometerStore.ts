import { create } from "zustand";

/** Of het grafiekvenster de magnetometersporen toont in plaats van de gewone sondeergrafiek. */
export const useMagnetometerStore = create<{
  show: boolean;
  setShow: (show: boolean) => void;
}>((set) => ({
  show: false,
  setShow: (show) => set({ show }),
}));
