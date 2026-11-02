import { create } from 'zustand';
import { getSetting, setSetting } from '../store';

const SETTING_KEY = 'chart.scaleColumns';
let edited = false;
let loading: Promise<void> | undefined;

export const useChartZoomStore = create<{
  scaleColumns: boolean;
  setScaleColumns: (enabled: boolean) => void;
}>((set) => ({
  scaleColumns: false,
  setScaleColumns: (enabled) => {
    edited = true;
    set({ scaleColumns: enabled });
    void setSetting(SETTING_KEY, enabled);
  },
}));

/** Een late voorkeur mag een zojuist gekozen waarde niet overschrijven. */
export function loadChartZoomPreference(): Promise<void> {
  return loading ??= getSetting<unknown>(SETTING_KEY, false).then((value) => {
    if (!edited) useChartZoomStore.setState({ scaleColumns: value === true });
  });
}
