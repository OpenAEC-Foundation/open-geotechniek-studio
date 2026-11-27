// De sporen van de magnetometergrafiek: wat er per spoor getekend wordt en op welke schaal.
// Scherm (mag-renderer.ts) en rapport (magnetometerReport.ts) tekenen dezelfde sporen.
import type { Cpt } from "../types/cpt";
import type { MagAnalysis, MagSettings } from "./analysis";
import { median } from "./analysis";
import type { MagnetometerData, Series } from "./channels";

export type TrackKey = "qc" | "components" | "total" | "gradient" | "inclination" | "declination";
export type LineKey = "qc" | "x" | "y" | "z" | "total" | "gradient" | "inclination" | "declination";

export const LINE_COLORS: Record<LineKey, string> = {
  qc: "#D97706", x: "#2563EB", y: "#16A34A", z: "#DC2626", total: "#7C3AED",
  gradient: "#0F766E", inclination: "#B45309", declination: "#BE185D",
};

export interface TrackLine {
  key: LineKey;
  values: Series;
  /** Waarde die van de reeks is afgetrokken (mediaan van de component), voor de legenda. */
  offset?: number;
}

export interface Track {
  key: TrackKey;
  unit: string;
  min: number;
  max: number;
  step: number;
  lines: TrackLine[];
  /** Verticale hulplijnen: het achtergrondveld (doorgetrokken) en de drempels (gestreept). */
  guides: Array<{ value: number; kind: "background" | "threshold" }>;
}

/** Ronde schaal rond [lo, hi] met ongeveer `target` verdelingen. */
export function niceRange(lo: number, hi: number, target = 4): { min: number; max: number; step: number } {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { min: 0, max: 1, step: 0.5 };
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  const raw = (hi - lo) / target, pow = 10 ** Math.floor(Math.log10(raw)), n = raw / pow;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
  return { min: Math.floor(lo / step + 1e-9) * step, max: Math.ceil(hi / step - 1e-9) * step, step };
}

const extent = (series: Series[], extra: number[] = []) => {
  const values = [...series.flat().filter((v): v is number => v != null), ...extra];
  return values.length ? [Math.min(...values), Math.max(...values)] as const : null;
};

const minusMedian = (values: Series): { values: Series; offset: number } => {
  const offset = median(values.filter((v): v is number => v != null)) ?? 0;
  return { values: values.map((v) => (v == null ? null : v - offset)), offset };
};

/** Diepte-as zoals de sondeergrafiek: 0 tot de naar boven afgeronde einddiepte. */
export function depthMaxOf(depth: number[]): number {
  const deepest = depth.reduce((m, d) => (Number.isFinite(d) ? Math.max(m, Math.abs(d)) : m), 0);
  return deepest > 0 ? Math.ceil(deepest * 1.02 + 0.5) : 30;
}

/** Zichtbaar dieptevenster bij een zoom en verschuiving, gelijk aan de sondeergrafiek. */
export function depthWindow(depthMax: number, zoom: number, panY: number): { top: number; bottom: number } {
  const visible = depthMax / Math.max(0.05, zoom), center = depthMax / 2 + panY;
  return { top: center - visible / 2, bottom: center + visible / 2 };
}

export function buildTracks(cpt: Cpt, data: MagnetometerData, analysis: MagAnalysis, settings: MagSettings, withQc = true): Track[] {
  const tracks: Track[] = [];
  const qc: Series = cpt.points.map((p) => p.qc ?? null);
  if (withQc && qc.some((v) => v != null)) {
    const peak = Math.max(0, ...qc.filter((v): v is number => v != null));
    tracks.push({ key: "qc", unit: "MPa", min: 0, max: peak > 30 ? niceRange(0, peak).max : 30, step: peak > 30 ? niceRange(0, peak).step : 10, lines: [{ key: "qc", values: qc }], guides: [] });
  }
  const components: TrackLine[] = (["x", "y", "z"] as const).filter((c) => data.channels[c])
    .map((c) => ({ key: c, ...minusMedian(data.channels[c]!) }));
  if (components.length) {
    const e = extent(components.map((l) => l.values))!, half = Math.max(Math.abs(e[0]), Math.abs(e[1]), 1);
    tracks.push({ key: "components", unit: "nT", ...niceRange(-half, half), lines: components, guides: [] });
  }
  if (data.total) {
    const bg = analysis.background;
    const guides: Track["guides"] = bg == null ? [] : [
      { value: bg, kind: "background" },
      { value: bg - settings.anomalyThreshold, kind: "threshold" },
      { value: bg + settings.anomalyThreshold, kind: "threshold" },
    ];
    const e = extent([data.total], guides.map((g) => g.value));
    if (e) tracks.push({ key: "total", unit: "nT", ...niceRange(e[0], e[1]), lines: [{ key: "total", values: data.total }], guides });
    const g = extent([analysis.gradient], [-settings.gradientThreshold, settings.gradientThreshold]);
    if (g) {
      const half = Math.max(Math.abs(g[0]), Math.abs(g[1]));
      tracks.push({
        key: "gradient", unit: "nT/m", ...niceRange(-half, half), lines: [{ key: "gradient", values: analysis.gradient }],
        guides: [{ value: -settings.gradientThreshold, kind: "threshold" }, { value: settings.gradientThreshold, kind: "threshold" }],
      });
    }
  }
  for (const key of ["inclination", "declination"] as const) {
    const values = data.channels[key];
    if (!values) continue;
    const e = extent([values])!;
    tracks.push({ key, unit: "°", ...niceRange(e[0], e[1]), lines: [{ key, values }], guides: [] });
  }
  return tracks;
}

/** Getal voor aslabels en tabellen: zonder overbodige decimalen. */
export function fmtValue(v: number, step = 1): string {
  const digits = step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step) - 1e-9));
  return (Math.abs(v) < 1e-9 ? 0 : v).toFixed(digits);
}
