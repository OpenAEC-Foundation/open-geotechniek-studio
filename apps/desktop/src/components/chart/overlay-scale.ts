/**
 * Pure helpers for the overlay view: every visible CPT in one qc chart and
 * one fs chart against a shared level axis (NAP).
 *
 * No canvas, no DOM, no store — only numbers in, numbers out, so the scale
 * and style choices can be tested on their own.
 */
import type { Cpt } from "../../types/cpt";

// ─────────────────────────────────────────────────────────────
// Line colour and dash per CPT
// ─────────────────────────────────────────────────────────────

/** Mid-luminance hues: readable on both the light and the dark panel background. */
export const SERIES_COLORS = [
  "#2F6FDE", // blue
  "#D9382E", // red
  "#1E9E5A", // green
  "#E07B00", // orange
  "#8B4FD9", // violet
  "#0E9AB8", // cyan
  "#D6409F", // magenta
  "#7A9A12", // olive
  "#A0613A", // brown
  "#6B7A90", // slate
] as const;

/** Canvas dash patterns; the first (solid) serves the first round of colours. */
export const SERIES_DASHES: readonly number[][] = [[], [7, 4], [2, 3], [9, 3, 2, 3]];

export interface SeriesStyle {
  color: string;
  /** Empty = solid line. */
  dash: number[];
}

/**
 * Colour and dash for the CPT at `index`. The colours repeat after one round;
 * each new round switches to the next dash pattern, so the combination stays
 * unique for the first 40 CPTs.
 */
export function seriesStyle(index: number): SeriesStyle {
  const i = Math.max(0, Math.floor(index));
  const round = Math.floor(i / SERIES_COLORS.length);
  return {
    color: SERIES_COLORS[i % SERIES_COLORS.length],
    dash: SERIES_DASHES[round % SERIES_DASHES.length].slice(),
  };
}

// ─────────────────────────────────────────────────────────────
// Series
// ─────────────────────────────────────────────────────────────

export type OverlayKey = "qc" | "fs";

export interface OverlaySeries {
  id: string;
  /** False: no ground level known, `levels` are metres below ground (negative). */
  hasNap: boolean;
  /** Level per point: m NAP, or minus the depth below ground without NAP. */
  levels: number[];
  qc: Array<number | null>;
  fs: Array<number | null>;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function buildSeries(cpt: Cpt): OverlaySeries {
  const ground = num(cpt.metadata.ground_level_nap);
  const levels: number[] = [];
  const qc: Array<number | null> = [];
  const fs: Array<number | null> = [];
  for (const p of cpt.points) {
    const depth = num(p.depth);
    if (depth === null) continue;
    levels.push((ground ?? 0) - Math.abs(depth));
    qc.push(num(p.qc));
    fs.push(num(p.fs));
  }
  return { id: cpt.id, hasNap: ground !== null, levels, qc, fs };
}

// ─────────────────────────────────────────────────────────────
// Scales
// ─────────────────────────────────────────────────────────────

/**
 * Axis caps; higher values are held at the edge. qc keeps the 30 MPa of the
 * side-by-side chart. fs gets more room than there: with many lines on one
 * axis a low cap turns every sand layer into one flat band at the edge.
 */
export const QC_AXIS_CAP = 30;
export const FS_AXIS_CAP = 0.5;
const QC_AXIS_FLOOR = 5;
const FS_AXIS_FLOOR = 0.01;

export interface OverlayScales {
  /** Highest level on the axis (m). */
  levelTop: number;
  /** Lowest level on the axis (m). */
  levelBottom: number;
  qcMax: number;
  fsMax: number;
  /** At least one series is on NAP: the axis is a NAP axis. */
  anyNap: boolean;
}

/** Round up to 1 / 1.5 / 2 / 3 / 5 / 10 times a power of ten. */
export function niceCeil(v: number): number {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  for (const m of [1, 1.5, 2, 3, 5]) if (n <= m + 1e-9) return +(m * p).toPrecision(6);
  return +(10 * p).toPrecision(6);
}

/**
 * The 99th percentile of all positive values together: the level the data
 * really reaches, without letting a single spike stretch the axis.
 */
export function robustPeak(series: OverlaySeries[], key: OverlayKey): number {
  const values: number[] = [];
  for (const s of series) for (const v of s[key]) if (v !== null && v > 0) values.push(v);
  if (values.length === 0) return 0;
  values.sort((a, b) => a - b);
  return values[Math.ceil(values.length * 0.99) - 1];
}

/**
 * One shared level range over all series (whole metres, half a metre of air)
 * and one qc and fs axis. The axes follow the data (see `robustPeak`), with
 * a floor for very soft profiles and a cap for very dense ones.
 */
export function computeOverlayScales(series: OverlaySeries[]): OverlayScales {
  let hi = -Infinity;
  let lo = Infinity;
  for (const s of series) {
    for (const level of s.levels) {
      if (level > hi) hi = level;
      if (level < lo) lo = level;
    }
  }
  const empty = hi === -Infinity;
  return {
    levelTop: empty ? 0 : Math.ceil(hi + 0.5),
    levelBottom: empty ? -30 : Math.floor(lo - 0.5),
    qcMax: Math.min(QC_AXIS_CAP, Math.max(QC_AXIS_FLOOR, niceCeil(robustPeak(series, "qc")))),
    fsMax: Math.min(FS_AXIS_CAP, Math.max(FS_AXIS_FLOOR, niceCeil(robustPeak(series, "fs")))),
    anyNap: series.some((s) => s.hasNap),
  };
}

/**
 * The finest step of `ladder` (ordered coarse to fine) that puts at most
 * `maxTicks` divisions on an axis from 0 to `max`.
 */
export function tickStep(max: number, ladder: readonly number[], maxTicks = 10): number {
  for (let i = ladder.length - 1; i >= 0; i--) {
    if (max / ladder[i] <= maxTicks + 1e-9) return ladder[i];
  }
  return ladder[0];
}

/** Tick label with exactly the decimals the step needs (step 0.005 → "0.015"). */
export function tickLabel(v: number, step: number): string {
  if (Math.abs(v) < 1e-12) return "0";
  return v.toFixed(Math.max(0, -Math.floor(Math.log10(step) + 1e-9)));
}

export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 8;
export const clampZoom = (z: number): number => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));

export interface LevelWindow {
  top: number;
  bottom: number;
}

/**
 * Visible level window. `zoom` 1 shows the full range, higher zooms in around
 * the middle; `pan` (m) shifts the window down (positive = deeper).
 */
export function levelWindow(scales: OverlayScales, zoom: number, pan: number): LevelWindow {
  const range = (scales.levelTop - scales.levelBottom) / clampZoom(zoom);
  const center = (scales.levelTop + scales.levelBottom) / 2 - pan;
  return { top: center + range / 2, bottom: center - range / 2 };
}

// ─────────────────────────────────────────────────────────────
// Layout and projection
// ─────────────────────────────────────────────────────────────

export interface PanelBox {
  l: number;
  w: number;
}

export interface OverlayLayout {
  axisW: number;
  headerH: number;
  plotT: number;
  plotB: number;
  plotH: number;
  qc: PanelBox;
  fs: PanelBox;
}

/** Level axis on the left, then a wide qc panel and a wide fs panel (3 : 2). */
export function overlayLayout(width: number, height: number): OverlayLayout {
  const axisW = 58;
  const headerH = 28;
  const gap = 14;
  const padR = 8;
  const plotT = headerH;
  const plotB = Math.max(plotT + 1, height - 6);
  const avail = Math.max(2, width - axisW - gap - padR);
  const qcW = Math.round(avail * 0.6);
  return {
    axisW,
    headerH,
    plotT,
    plotB,
    plotH: plotB - plotT,
    qc: { l: axisW, w: qcW },
    fs: { l: axisW + qcW + gap, w: avail - qcW },
  };
}

export function levelToY(level: number, win: LevelWindow, layout: OverlayLayout): number {
  return layout.plotT + ((win.top - level) / (win.top - win.bottom)) * layout.plotH;
}

export function yToLevel(y: number, win: LevelWindow, layout: OverlayLayout): number {
  return win.top - ((y - layout.plotT) / layout.plotH) * (win.top - win.bottom);
}

/** Value → x inside a panel; values beyond the axis are held at the edge. */
export function valueToX(v: number, panel: PanelBox, max: number): number {
  return panel.l + (Math.max(0, Math.min(max, v)) / max) * panel.w;
}

/** Which panel is under x, if any. */
export function panelAt(x: number, layout: OverlayLayout): OverlayKey | null {
  if (x >= layout.qc.l && x <= layout.qc.l + layout.qc.w) return "qc";
  if (x >= layout.fs.l && x <= layout.fs.l + layout.fs.w) return "fs";
  return null;
}

// ─────────────────────────────────────────────────────────────
// Reading values and picking a line
// ─────────────────────────────────────────────────────────────

/**
 * The measured value at `level`, linearly interpolated between the two
 * neighbouring points. Null outside the CPT or across a gap in the data.
 */
export function valueAtLevel(series: OverlaySeries, key: OverlayKey, level: number): number | null {
  const { levels } = series;
  const values = series[key];
  for (let i = 0; i + 1 < levels.length; i++) {
    const a = levels[i];
    const b = levels[i + 1];
    if ((level - a) * (level - b) > 0) continue;
    const va = values[i];
    const vb = values[i + 1];
    if (va === null || vb === null) return null;
    return a === b ? va : va + ((level - a) / (b - a)) * (vb - va);
  }
  if (levels.length === 1 && levels[0] === level) return values[0];
  return null;
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * The series whose drawn line passes closest to the pointer, within
 * `tolerance` pixels. `toX` and `toY` are the projections of the panel
 * under the pointer.
 */
export function pickSeries(
  series: OverlaySeries[],
  key: OverlayKey,
  px: number,
  py: number,
  toX: (value: number) => number,
  toY: (level: number) => number,
  tolerance = 6,
): string | null {
  let best: string | null = null;
  let bestDist = tolerance;
  for (const s of series) {
    const values = s[key];
    for (let i = 0; i + 1 < s.levels.length; i++) {
      const va = values[i];
      const vb = values[i + 1];
      if (va === null || vb === null) continue;
      const ay = toY(s.levels[i]);
      const by = toY(s.levels[i + 1]);
      if (Math.min(ay, by) > py + tolerance || Math.max(ay, by) < py - tolerance) continue;
      const d = distToSegment(px, py, toX(va), ay, toX(vb), by);
      if (d <= bestDist) {
        bestDist = d;
        best = s.id;
      }
    }
  }
  return best;
}
