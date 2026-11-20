// Maatvoering van de dissipatiegrafiek (waterspanning tegen de tijd), gedeeld door het scherm en het
// rapport. Alle posities zijn fracties 0..1 van het tekenvlak; y loopt omhoog.
import type { DissipationResult } from "./analysis";

export type TimeAxis = "log" | "sqrt";

export interface ChartTick { at: number; label: string; minor?: boolean }
export interface DissipationChartModel {
  axis: TimeAxis;
  xTicks: ChartTick[];
  yTicks: ChartTick[];
  /** Genormaliseerde overspanning U op de rechteras. */
  uTicks: ChartTick[];
  line: Array<{ x: number; y: number }>;
  u0Y: number | null;
  uiY: number | null;
  u50Y: number | null;
  /** Begin van de telling (de piek bij een verloop dat eerst oploopt). */
  startX: number | null;
  t50X: number | null;
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));

/** Ronde stapgrootte (1, 2 of 5 maal een macht van tien) voor ongeveer `count` stappen. */
export function niceStep(range: number, count: number): number {
  const raw = range / Math.max(1, count), power = 10 ** Math.floor(Math.log10(raw)), f = raw / power;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * power;
}

const label = (v: number) => String(Number(v.toPrecision(6)));

export function buildChartModel(result: DissipationResult, axis: TimeAxis): DissipationChartModel | null {
  const { series } = result;
  if (series.length < 2) return null;
  const tMax = series[series.length - 1].time;
  const positive = series.filter((p) => p.time > 0).map((p) => p.time);
  if (!positive.length || !(tMax > 0)) return null;

  let x: (t: number) => number;
  const xTicks: ChartTick[] = [];
  if (axis === "log") {
    const lo = Math.floor(Math.log10(Math.min(...positive))), hi = Math.max(lo + 1, Math.ceil(Math.log10(tMax) - 1e-9));
    // Een meting op t = 0 past niet op een log-as en staat op de linkerrand.
    x = (t) => clamp((Math.log10(Math.max(t, 10 ** lo)) - lo) / (hi - lo));
    for (let decade = lo; decade <= hi; decade++) {
      xTicks.push({ at: x(10 ** decade), label: label(10 ** decade) });
      if (decade < hi) for (let k = 2; k <= 9; k++) xTicks.push({ at: x(k * 10 ** decade), label: "", minor: true });
    }
  } else {
    const rootMax = Math.sqrt(tMax), step = niceStep(rootMax, 6), top = Math.ceil(rootMax / step - 1e-9) * step;
    x = (t) => clamp(Math.sqrt(Math.max(0, t)) / top);
    for (let v = 0; v <= top + step / 2; v += step) xTicks.push({ at: clamp(v / top), label: label(v) });
  }

  const values = [...series.map((p) => p.u), ...(result.u0 != null ? [result.u0] : []), ...(result.ui != null ? [result.ui] : [])];
  const min = Math.min(...values), max = Math.max(...values);
  const step = niceStep(Math.max(max - min, 1), 6);
  const bottom = Math.floor(min / step + 1e-9) * step, top = Math.max(bottom + step, Math.ceil(max / step - 1e-9) * step);
  const y = (u: number) => clamp((u - bottom) / (top - bottom));
  const yTicks: ChartTick[] = [];
  for (let v = bottom; v <= top + step / 2; v += step) yTicks.push({ at: y(v), label: label(v) });

  const uTicks: ChartTick[] = [];
  if (result.ui != null && result.u0 != null && result.ui !== result.u0)
    for (const U of [0, 0.25, 0.5, 0.75, 1]) uTicks.push({ at: y(result.u0 + U * (result.ui - result.u0)), label: label(U) });

  return {
    axis, xTicks, yTicks, uTicks,
    line: series.map((p) => ({ x: x(p.time), y: y(p.u) })),
    u0Y: result.u0 != null ? y(result.u0) : null,
    uiY: result.ui != null ? y(result.ui) : null,
    u50Y: result.u50 != null ? y(result.u50) : null,
    startX: result.tStart > 0 ? x(result.tStart) : null,
    t50X: result.t50 != null ? x(result.tStart + result.t50) : null,
  };
}
