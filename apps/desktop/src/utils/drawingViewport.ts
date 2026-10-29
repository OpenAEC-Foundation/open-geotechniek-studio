export interface MapViewport { lat: number; lon: number; zoom: number }
/** A newly selected address wins over an automatic drawing snapshot; explicit file opens retain their viewport. */
export function drawingViewport(saved: MapViewport, selected: MapViewport | null, explicit: boolean, soundingOpen: boolean): MapViewport {
  return !explicit && !soundingOpen && selected ? selected : saved;
}
export function parseDrawingScale(value: string): number | null {
  const match = /^(?:1\s*:\s*)?(\d+)$/.exec(value.trim());
  const n = match ? Number(match[1]) : NaN;
  return Number.isInteger(n) && n >= 50 && n <= 100000 ? n : null;
}
