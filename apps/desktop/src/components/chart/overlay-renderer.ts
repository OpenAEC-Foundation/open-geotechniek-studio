/**
 * Overlay chart — pure canvas drawing of every visible CPT in one qc panel
 * and one fs panel against a shared level axis.
 *
 * Scales, layout and line styles come from `overlay-scale.ts`; surface
 * colours, tick ladders and number formatting are shared with
 * `chart-renderer.ts`.
 */
import {
  readColors,
  niceStep,
  formatNap,
  QC_LADDER,
  FS_LADDER,
} from "./chart-renderer";
import {
  levelToY,
  levelWindow,
  overlayLayout,
  tickLabel,
  tickStep,
  valueAtLevel,
  valueToX,
  type LevelWindow,
  type OverlayKey,
  type OverlayLayout,
  type OverlayScales,
  type OverlaySeries,
  type PanelBox,
  type SeriesStyle,
} from "./overlay-scale";

type Colors = ReturnType<typeof readColors>;

export interface OverlayRenderOptions {
  width: number;
  height: number;
  zoom: number;
  /** Vertical pan in metres (positive = deeper). */
  panY: number;
  /** Drawn thicker and on top. */
  activeCptId?: string | null;
  /** Level under the pointer: a horizontal line with a dot on every curve. */
  hoverLevel?: number | null;
  /** Style per series id. */
  styles: Map<string, SeriesStyle>;
  labels: { qc: string; fs: string; levelAxis: string };
}

const LINE_WIDTH = 1.2;
const ACTIVE_LINE_WIDTH = 2.8;

/** Level ticks on whole multiples of a nice step, top to bottom. */
function levelTicks(win: LevelWindow): number[] {
  const step = niceStep(win.top - win.bottom, 8);
  const ticks: number[] = [];
  for (let n = Math.floor(win.top / step) * step; n >= win.bottom - 1e-9; n = +(n - step).toFixed(6)) {
    ticks.push(n);
  }
  return ticks;
}

function formatLevel(level: number, anyNap: boolean): string {
  return anyNap ? formatNap(level) : level.toFixed(1);
}

function drawPanelFrame(
  ctx: CanvasRenderingContext2D,
  colors: Colors,
  layout: OverlayLayout,
  win: LevelWindow,
  panel: PanelBox,
  max: number,
  ladder: number[],
  label: string,
) {
  ctx.fillStyle = colors.panelBg;
  ctx.fillRect(panel.l, layout.plotT, panel.w, layout.plotH);

  // Horizontal grid on the level ticks.
  ctx.lineWidth = 1;
  for (const n of levelTicks(win)) {
    const y = Math.round(levelToY(n, win, layout)) + 0.5;
    if (y < layout.plotT || y > layout.plotB) continue;
    ctx.strokeStyle = Math.abs(n - Math.round(n)) < 1e-3 ? colors.gridMajor : colors.grid;
    ctx.beginPath();
    ctx.moveTo(panel.l, y);
    ctx.lineTo(panel.l + panel.w, y);
    ctx.stroke();
  }

  // Vertical grid and tick labels on the value ladder.
  const step = tickStep(max, ladder);
  ctx.font = '9px "JetBrains Mono", monospace';
  ctx.textBaseline = "top";
  const labelW = ctx.measureText(tickLabel(max, step)).width + 10;
  const stride = Math.max(1, Math.ceil(labelW / ((step / max) * panel.w)));
  let idx = 0;
  for (let v = 0; v <= max + 1e-9; v = +(v + step).toFixed(6), idx++) {
    const x = Math.round(valueToX(v, panel, max));
    if (v > 0 && v < max - 1e-9) {
      ctx.strokeStyle = idx % 2 === 0 ? colors.gridMajor : colors.grid;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, layout.plotT);
      ctx.lineTo(x + 0.5, layout.plotB);
      ctx.stroke();
    }
    if (idx % stride !== 0) continue;
    const text = tickLabel(v, step);
    const half = ctx.measureText(text).width / 2;
    ctx.fillStyle = colors.text;
    ctx.textAlign = "center";
    ctx.fillText(text, Math.max(panel.l + half + 1, Math.min(panel.l + panel.w - half - 1, x)), 15);
  }

  ctx.font = "600 10px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = colors.textBright;
  ctx.fillText(label, panel.l + panel.w / 2, 3);

  ctx.strokeStyle = colors.border;
  ctx.strokeRect(panel.l + 0.5, layout.plotT + 0.5, panel.w - 1, layout.plotH - 1);
}

function drawLevelAxis(
  ctx: CanvasRenderingContext2D,
  colors: Colors,
  layout: OverlayLayout,
  win: LevelWindow,
  anyNap: boolean,
  title: string,
) {
  ctx.font = '9px "JetBrains Mono", monospace';
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillStyle = colors.text;
  for (const n of levelTicks(win)) {
    const y = levelToY(n, win, layout);
    if (y < layout.plotT + 6 || y > layout.plotB - 3) continue;
    ctx.fillText(formatLevel(n, anyNap), layout.axisW - 4, y);
  }
  ctx.save();
  ctx.translate(10, layout.plotT + layout.plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.font = "600 9px Inter, system-ui, sans-serif";
  ctx.fillText(title, 0, 0);
  ctx.restore();
}

function drawSeries(
  ctx: CanvasRenderingContext2D,
  layout: OverlayLayout,
  win: LevelWindow,
  panel: PanelBox,
  max: number,
  key: OverlayKey,
  series: OverlaySeries,
  style: SeriesStyle,
  lineWidth: number,
) {
  const values = series[key];
  ctx.strokeStyle = style.color;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = "round";
  ctx.setLineDash(style.dash);
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < series.levels.length; i++) {
    const v = values[i];
    if (v === null) {
      started = false;
      continue;
    }
    const x = valueToX(v, panel, max);
    const y = levelToY(series.levels[i], win, layout);
    if (started) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
    started = true;
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

export function renderOverlay(
  ctx: CanvasRenderingContext2D,
  series: OverlaySeries[],
  scales: OverlayScales,
  opts: OverlayRenderOptions,
): void {
  if (opts.width <= 0 || opts.height <= 0) return;
  const colors = readColors();
  const layout = overlayLayout(opts.width, opts.height);
  const win = levelWindow(scales, opts.zoom, opts.panY);
  const fallback: SeriesStyle = { color: colors.text, dash: [] };

  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, opts.width, opts.height);
  ctx.fillStyle = colors.headerBg;
  ctx.fillRect(0, 0, opts.width, layout.headerH);

  const panels: Array<{ key: OverlayKey; panel: PanelBox; max: number; ladder: number[]; label: string }> = [
    { key: "qc", panel: layout.qc, max: scales.qcMax, ladder: QC_LADDER, label: opts.labels.qc },
    { key: "fs", panel: layout.fs, max: scales.fsMax, ladder: FS_LADDER, label: opts.labels.fs },
  ];
  // The active CPT last, so its thicker line lies on top.
  const ordered = [...series].sort(
    (a, b) => Number(a.id === opts.activeCptId) - Number(b.id === opts.activeCptId),
  );
  const hover = opts.hoverLevel;
  const hoverY = hover != null ? levelToY(hover, win, layout) : null;
  const hoverVisible = hoverY !== null && hoverY >= layout.plotT && hoverY <= layout.plotB;

  for (const p of panels) {
    drawPanelFrame(ctx, colors, layout, win, p.panel, p.max, p.ladder, p.label);
    ctx.save();
    ctx.beginPath();
    ctx.rect(p.panel.l, layout.plotT, p.panel.w, layout.plotH);
    ctx.clip();
    for (const s of ordered) {
      const active = s.id === opts.activeCptId;
      drawSeries(ctx, layout, win, p.panel, p.max, p.key, s, opts.styles.get(s.id) ?? fallback, active ? ACTIVE_LINE_WIDTH : LINE_WIDTH);
    }
    if (hoverVisible && hover != null) {
      const y = Math.round(hoverY!) + 0.5;
      ctx.strokeStyle = colors.text;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(p.panel.l, y);
      ctx.lineTo(p.panel.l + p.panel.w, y);
      ctx.stroke();
      ctx.setLineDash([]);
      for (const s of ordered) {
        const v = valueAtLevel(s, p.key, hover);
        if (v === null) continue;
        ctx.fillStyle = (opts.styles.get(s.id) ?? fallback).color;
        ctx.beginPath();
        ctx.arc(valueToX(v, p.panel, p.max), hoverY!, s.id === opts.activeCptId ? 4 : 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawLevelAxis(ctx, colors, layout, win, scales.anyNap, opts.labels.levelAxis);

  // Hovered level as a tag on the axis.
  if (hoverVisible && hover != null) {
    const text = formatLevel(hover, scales.anyNap);
    ctx.font = '600 9px "JetBrains Mono", monospace';
    const w = ctx.measureText(text).width + 8;
    const y = Math.max(layout.plotT + 7, Math.min(layout.plotB - 7, hoverY!));
    ctx.fillStyle = colors.text;
    ctx.fillRect(layout.axisW - w - 1, y - 7, w, 14);
    ctx.fillStyle = colors.panelBg;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(text, layout.axisW - 5, y);
  }
}
