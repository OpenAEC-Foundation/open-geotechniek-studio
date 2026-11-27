// Geplaatste berekeningen in de DWG/DXF-export van de situatietekening: in RD [m], op eigen lagen.
import type { CalculationInstance } from "../calc/framework/types";
import { calcSpec } from "./calcGeometry";
import { circlePoints, rectangleCorners, wallHatch } from "./geometry";
import { activeCalcs } from "./store";
import { hasGeometry } from "./types";

export interface PlacementDwgEntity {
  layer: string;
  type: "line" | "polyline" | "point" | "text" | "hatch";
  points: [number, number][];
  text?: string;
  closed?: boolean;
  height?: number;
}

/** ACI-kleuren van de lagen: palen magenta, damwanden rood, funderingen cyaan. */
export const PLACEMENT_DWG_COLORS: Record<string, number> = { PALEN: 6, DAMWANDEN: 1, DAMWANDEN_ARCERING: 1, FUNDERINGEN: 4 };

const LABEL_H = 1.2;

/** CAD-objecten van de plaatsingen. Paal: cirkel op ware grootte (minimaal 0,2 m) met een kruis en de naam. */
export function placementEntities(calcs: CalculationInstance[]): PlacementDwgEntity[] {
  const out: PlacementDwgEntity[] = [];
  for (const c of calcs) {
    const p = c.placement;
    if (!hasGeometry(p)) continue;
    const spec = calcSpec(c);
    if (p.kind === "piles") {
      const r = Math.max(0.1, spec?.kind === "piles" ? spec.pile.sizeM / 2 : 0.15);
      for (const q of p.positions) {
        out.push({ layer: "PALEN", type: "polyline", points: circlePoints(q.x, q.y, r, 16).map((v) => [v.x, v.y]), closed: true });
        out.push({ layer: "PALEN", type: "line", points: [[q.x - r, q.y - r], [q.x + r, q.y + r]] });
        out.push({ layer: "PALEN", type: "line", points: [[q.x - r, q.y + r], [q.x + r, q.y - r]] });
        out.push({ layer: "PALEN", type: "text", points: [[q.x + r + 0.3, q.y + r + 0.3]], text: `${c.name} ${q.label ?? q.id}`, height: LABEL_H });
      }
    }
    if (p.kind === "wall") {
      out.push({ layer: "DAMWANDEN", type: "polyline", points: p.points.map((v) => [v.x, v.y]), closed: p.closed });
      for (const [a, b] of wallHatch(p, 1, 0.6)) out.push({ layer: "DAMWANDEN_ARCERING", type: "line", points: [[a.x, a.y], [b.x, b.y]] });
      out.push({ layer: "DAMWANDEN", type: "text", points: [[p.points[0].x + 0.5, p.points[0].y + 0.5]], text: c.name, height: LABEL_H });
    }
    if (p.kind === "footing" && spec?.kind === "footing") {
      const pts = rectangleCorners(p.x, p.y, spec.footing.widthM, spec.footing.lengthM ?? p.lengthM ?? 10, p.angleDeg).map((v) => [v.x, v.y] as [number, number]);
      out.push({ layer: "FUNDERINGEN", type: "polyline", points: pts, closed: true });
      out.push({ layer: "FUNDERINGEN", type: "text", points: [[p.x, p.y]], text: c.name, height: LABEL_H });
    }
  }
  return out;
}

/** Plaatsingen van het actieve project voor de DWG-export. */
export function placementDwgEntities(): PlacementDwgEntity[] {
  return placementEntities(activeCalcs().calcs);
}
