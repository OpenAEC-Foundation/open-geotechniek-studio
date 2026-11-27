/**
 * Chooses a scale bar with round values: a total length from the 1-2-2.5-5
 * series, split into four or five equal parts, as close as possible to the
 * wanted length on paper without exceeding the available room.
 */

export interface ScaleBarSpec {
  totalM: number;
  segments: number;
  segmentM: number;
  /** Tick values in metres, 0 first. */
  ticks: number[];
  /** Length on screen in px. */
  lengthPx: number;
}

const MANTISSAS = [1, 2, 2.5, 5] as const;

/** Parts per mantissa so that every tick is a round number. */
const segmentsFor = (mantissa: number): number => (mantissa === 2 ? 4 : 5);

export function pickScaleBar(mPerPx: number, targetPx: number, maxPx = Infinity): ScaleBarSpec | null {
  if (!Number.isFinite(mPerPx) || mPerPx <= 0 || !Number.isFinite(targetPx) || targetPx <= 0) return null;
  const targetM = targetPx * mPerPx;
  const exp = Math.floor(Math.log10(targetM));
  let best: { totalM: number; mantissa: number } | null = null;
  for (let e = exp - 1; e <= exp + 1; e++) {
    for (const m of MANTISSAS) {
      const totalM = m * 10 ** e;
      if (totalM / mPerPx > maxPx) continue;
      if (!best || Math.abs(Math.log(totalM / targetM)) < Math.abs(Math.log(best.totalM / targetM)))
        best = { totalM, mantissa: m };
    }
  }
  if (!best) return null;
  const totalM = Number(best.totalM.toPrecision(6));
  const segments = segmentsFor(best.mantissa);
  const segmentM = Number((totalM / segments).toPrecision(6));
  const ticks = Array.from({ length: segments + 1 }, (_, i) => Number((i * segmentM).toPrecision(6)));
  return { totalM, segments, segmentM, ticks, lengthPx: totalM / mPerPx };
}

/** Tick text: whole metres without decimals, otherwise as short as possible. */
export function formatScaleTick(m: number): string {
  return Number.isInteger(m) ? String(m) : String(Number(m.toFixed(2)));
}
