// In de grafiek zichtbaar maken dát en waar een sondering is bewerkt: een strook langs de linkerrand
// van het qc-vak op elk bewerkt traject en een label "bewerkt" bovenin.
import i18next from "i18next";
import type { Cpt } from "../types/cpt";
import { editLogOf, editMarksOf } from "./state";

const MARK = "#D97706";

export interface MarkArea {
  /** Linkerrand en breedte van het vak waarin de markering komt (px). */
  left: number;
  width: number;
  /** Boven- en onderkant van het tekenvlak (px). */
  top: number;
  bottom: number;
}

/** Tekent de markeringen van één sondering; doet niets als zij niet is bewerkt. */
export function drawEditMarks(ctx: CanvasRenderingContext2D, cpt: Cpt, area: MarkArea, depthToY: (depth: number) => number): void {
  const count = editLogOf(cpt).edits.length;
  if (!count) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(area.left, area.top, area.width, area.bottom - area.top);
  ctx.clip();
  for (const mark of editMarksOf(cpt)) {
    const y1 = depthToY(mark.from), y2 = depthToY(mark.to);
    if (y2 < area.top || y1 > area.bottom) continue;
    // Een enkel meetpunt blijft zichtbaar als een streepje van een paar pixels.
    const top = Math.min(y1, (y1 + y2) / 2 - 2), height = Math.max(y2 - y1, 4);
    ctx.fillStyle = MARK;
    ctx.globalAlpha = 0.1;
    ctx.fillRect(area.left, top, area.width, height);
    ctx.globalAlpha = 1;
    ctx.fillRect(area.left, top, 4, height);
  }
  const label = i18next.t("meetwaarden:chart.badge", { defaultValue: "bewerkt ({{n}})", n: count }) as string;
  ctx.font = "600 10px Inter, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const w = ctx.measureText(label).width + 10, x = area.left + area.width - w - 4, y = area.top + 4;
  if (x > area.left + 6) {
    ctx.fillStyle = MARK;
    ctx.fillRect(x, y, w, 15);
    ctx.fillStyle = "#fff";
    ctx.fillText(label, x + 5, y + 8);
  }
  ctx.restore();
}
