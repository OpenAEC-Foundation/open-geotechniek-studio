// Tekent de sporen van een magnetometersondering op een canvas, tegen de diepte onder maaiveld.
import { niceStep, readColors } from "../components/chart/chart-renderer";
import type { MagZone } from "./analysis";
import { fmtValue, LINE_COLORS, type LineKey, type Track, type TrackKey } from "./tracks";

export interface MagLayout {
  plotT: number;
  plotB: number;
  plotH: number;
  axisW: number;
  panels: Array<{ l: number; w: number }>;
}

export const HEADER_H = 46;
const AXIS_W = 52;

export function magLayout(width: number, height: number, trackCount: number): MagLayout {
  const plotT = HEADER_H, plotB = height - 6, gap = 6;
  const w = Math.max(20, (width - AXIS_W - gap * trackCount) / Math.max(1, trackCount));
  return {
    plotT, plotB, plotH: Math.max(1, plotB - plotT), axisW: AXIS_W,
    panels: Array.from({ length: trackCount }, (_, i) => ({ l: AXIS_W + i * (w + gap), w })),
  };
}

export const depthToY = (d: number, win: { top: number; bottom: number }, layout: MagLayout) =>
  layout.plotT + ((d - win.top) / (win.bottom - win.top)) * layout.plotH;
export const yToDepth = (y: number, win: { top: number; bottom: number }, layout: MagLayout) =>
  win.top + ((y - layout.plotT) / layout.plotH) * (win.bottom - win.top);

export interface MagRenderOptions {
  width: number;
  height: number;
  win: { top: number; bottom: number };
  depth: number[];
  zones: MagZone[];
  /** Traject van het achtergrondveld, als band langs de diepte-as. */
  backgroundRange: { from: number; to: number } | null;
  hoverDepth: number | null;
  titles: Record<TrackKey, string>;
  lineLabels: Record<LineKey, string>;
  depthAxis: string;
}

const ZONE_FILL = "rgba(220, 38, 38, 0.13)";
const ZONE_EDGE = "rgba(220, 38, 38, 0.55)";

export function renderMagnetometer(ctx: CanvasRenderingContext2D, tracks: Track[], opts: MagRenderOptions): void {
  const colors = readColors();
  const { width, height, win, depth } = opts;
  const layout = magLayout(width, height, tracks.length);
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, width, height);

  const step = niceStep(win.bottom - win.top, 10);
  const ticks: number[] = [];
  for (let d = Math.ceil(win.top / step) * step; d <= win.bottom + 1e-9; d += step) ticks.push(+d.toFixed(6));

  // Diepte-as.
  ctx.font = '9px "JetBrains Mono", monospace';
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillStyle = colors.text;
  for (const d of ticks) {
    const y = depthToY(d, win, layout);
    if (y < layout.plotT - 1 || y > layout.plotB + 1) continue;
    ctx.fillText(d.toFixed(step < 1 ? 1 : 0), layout.axisW - 8, y);
  }
  ctx.save();
  ctx.translate(10, layout.plotT + layout.plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.font = "600 10px Inter, system-ui, sans-serif";
  ctx.fillText(opts.depthAxis, 0, 0);
  ctx.restore();
  if (opts.backgroundRange) {
    const y0 = Math.max(layout.plotT, depthToY(opts.backgroundRange.from, win, layout));
    const y1 = Math.min(layout.plotB, depthToY(opts.backgroundRange.to, win, layout));
    if (y1 > y0) { ctx.fillStyle = LINE_COLORS.total; ctx.fillRect(layout.axisW - 4, y0, 3, y1 - y0); }
  }

  tracks.forEach((track, index) => {
    const panel = layout.panels[index];
    const toX = (v: number) => panel.l + ((v - track.min) / (track.max - track.min)) * panel.w;
    ctx.fillStyle = colors.panelBg;
    ctx.fillRect(panel.l, layout.plotT, panel.w, layout.plotH);

    ctx.save();
    ctx.beginPath();
    ctx.rect(panel.l, layout.plotT, panel.w, layout.plotH);
    ctx.clip();
    // Raster.
    ctx.lineWidth = 1;
    for (const d of ticks) {
      const y = Math.round(depthToY(d, win, layout)) + 0.5;
      ctx.strokeStyle = Math.abs(d - Math.round(d)) < 1e-6 ? colors.gridMajor : colors.grid;
      ctx.beginPath(); ctx.moveTo(panel.l, y); ctx.lineTo(panel.l + panel.w, y); ctx.stroke();
    }
    for (let v = track.min + track.step; v < track.max - 1e-9; v += track.step) {
      const x = Math.round(toX(v)) + 0.5;
      ctx.strokeStyle = Math.abs(v) < 1e-9 ? colors.gridMajor : colors.grid;
      ctx.beginPath(); ctx.moveTo(x, layout.plotT); ctx.lineTo(x, layout.plotB); ctx.stroke();
    }
    // Zones: alleen in de sporen van het veld, niet over qc.
    if (track.key !== "qc")
      for (const zone of opts.zones) {
        const y0 = depthToY(zone.top, win, layout), y1 = depthToY(zone.bottom, win, layout);
        ctx.fillStyle = ZONE_FILL;
        ctx.fillRect(panel.l, y0, panel.w, Math.max(2, y1 - y0));
        ctx.strokeStyle = ZONE_EDGE;
        ctx.beginPath();
        ctx.moveTo(panel.l, Math.round(y0) + 0.5); ctx.lineTo(panel.l + panel.w, Math.round(y0) + 0.5);
        ctx.moveTo(panel.l, Math.round(y0 + Math.max(2, y1 - y0)) + 0.5); ctx.lineTo(panel.l + panel.w, Math.round(y0 + Math.max(2, y1 - y0)) + 0.5);
        ctx.stroke();
      }
    for (const guide of track.guides) {
      const x = Math.round(toX(guide.value)) + 0.5;
      ctx.strokeStyle = colors.text;
      ctx.globalAlpha = guide.kind === "background" ? 0.75 : 0.5;
      ctx.setLineDash(guide.kind === "background" ? [] : [4, 3]);
      ctx.beginPath(); ctx.moveTo(x, layout.plotT); ctx.lineTo(x, layout.plotB); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    // Lijnen; een ontbrekende waarde onderbreekt de lijn.
    for (const line of track.lines) {
      ctx.strokeStyle = LINE_COLORS[line.key];
      ctx.lineWidth = 1.4;
      ctx.lineJoin = "round";
      ctx.beginPath();
      let pen = false;
      line.values.forEach((v, i) => {
        if (v == null || !Number.isFinite(depth[i])) { pen = false; return; }
        const x = toX(v), y = depthToY(depth[i], win, layout);
        if (pen) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        pen = true;
      });
      ctx.stroke();
    }
    if (opts.hoverDepth != null) {
      const y = Math.round(depthToY(opts.hoverDepth, win, layout)) + 0.5;
      ctx.strokeStyle = colors.text;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.6;
      ctx.beginPath(); ctx.moveTo(panel.l, y); ctx.lineTo(panel.l + panel.w, y); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // Kop: titel, legenda en schaal.
    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    ctx.font = "600 10px Inter, system-ui, sans-serif";
    ctx.fillStyle = colors.textBright;
    ctx.fillText(fit(ctx, opts.titles[track.key], panel.w - 4), panel.l + panel.w / 2, 3);
    if (track.lines.length > 1) {
      ctx.font = "10px Inter, system-ui, sans-serif";
      const labels = track.lines.map((l) => opts.lineLabels[l.key]);
      const total = labels.reduce((sum, text) => sum + ctx.measureText(text).width + 22, -8);
      let x = panel.l + Math.max(2, (panel.w - total) / 2);
      ctx.textAlign = "left";
      track.lines.forEach((line, i) => {
        ctx.fillStyle = LINE_COLORS[line.key];
        ctx.fillRect(x, 21, 10, 2);
        ctx.fillStyle = colors.text;
        ctx.fillText(labels[i], x + 13, 16);
        x += ctx.measureText(labels[i]).width + 22;
      });
    }
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillStyle = colors.text;
    const lo = fmtValue(track.min, track.step), hi = fmtValue(track.max, track.step);
    ctx.textAlign = "left"; ctx.fillText(lo, panel.l + 1, 33);
    ctx.textAlign = "right"; ctx.fillText(hi, panel.l + panel.w - 1, 33);
    // De eenheid staat tussen de uiterste schaalwaarden.
    ctx.textAlign = "center";
    if (ctx.measureText(`${lo} ${track.unit} ${hi}`).width + 8 < panel.w) ctx.fillText(track.unit, panel.l + panel.w / 2, 33);

    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(panel.l + 0.5, layout.plotT + 0.5, panel.w - 1, layout.plotH - 1);
  });
}

function fit(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1);
  return `${cut}…`;
}
