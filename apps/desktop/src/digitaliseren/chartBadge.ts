// In de grafiek zichtbaar maken dat een sondering gedigitaliseerd is: een label linksboven in het qc-vak.
import type { Cpt } from "../types/cpt";
import { digitizedLabel } from "./record";

const BADGE = "#6D28D9";

/** Tekent het label van één sondering; doet niets bij een gemeten bestand. */
export function drawDigitizedBadge(ctx: CanvasRenderingContext2D, cpt: Cpt, area: { left: number; width: number; top: number }): void {
  const label = digitizedLabel(cpt);
  if (!label) return;
  ctx.save();
  ctx.font = "600 10px Inter, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  // Past het hele label niet, dan blijft het woord zonder de toevoeging over.
  const short = label.split(" (")[0], text = ctx.measureText(label).width + 14 <= area.width ? label : short;
  const w = Math.min(ctx.measureText(text).width + 10, area.width - 4), x = area.left + 4, y = area.top + 22;
  ctx.fillStyle = BADGE;
  ctx.fillRect(x, y, w, 15);
  ctx.fillStyle = "#fff";
  ctx.fillText(text, x + 5, y + 8, w - 8);
  ctx.restore();
}
