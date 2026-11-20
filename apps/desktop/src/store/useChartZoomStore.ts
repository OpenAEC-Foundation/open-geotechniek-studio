import { create } from 'zustand';
import { getSetting, setSetting } from '../store';

const SETTING_KEY = 'chart.scaleColumns';
const OVERLAY_KEY = 'chart.overlay';
let edited = false;
let overlayEdited = false;
let loading: Promise<void> | undefined;

export const useChartZoomStore = create<{
  scaleColumns: boolean;
  setScaleColumns: (enabled: boolean) => void;
  /** Alle zichtbare sonderingen over elkaar in plaats van naast elkaar. */
  overlay: boolean;
  setOverlay: (enabled: boolean) => void;
}>((set) => ({
  scaleColumns: false,
  setScaleColumns: (enabled) => {
    edited = true;
    set({ scaleColumns: enabled });
    void setSetting(SETTING_KEY, enabled);
  },
  overlay: false,
  setOverlay: (enabled) => {
    overlayEdited = true;
    set({ overlay: enabled });
    void setSetting(OVERLAY_KEY, enabled);
  },
}));

/** Een late voorkeur mag een zojuist gekozen waarde niet overschrijven. */
export function loadChartZoomPreference(): Promise<void> {
  return loading ??= Promise.all([
    getSetting<unknown>(SETTING_KEY, false),
    getSetting<unknown>(OVERLAY_KEY, false),
  ]).then(([scaleColumns, overlay]) => {
    if (!edited) useChartZoomStore.setState({ scaleColumns: scaleColumns === true });
    if (!overlayEdited) useChartZoomStore.setState({ overlay: overlay === true });
  });
}
