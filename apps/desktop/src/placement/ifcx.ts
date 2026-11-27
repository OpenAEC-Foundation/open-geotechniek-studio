// Geplaatste berekeningen in de IFCX-export: eenvoudige elementen (IfcPile, IfcWall, IfcFooting) als prisma's in
// RD min de oorsprong van het grondmodel, met z in NAP; dezelfde ligging als het grondmodel in die export.
import type { CalculationInstance } from "../calc/framework/types";
import type { PlacedExport } from "../ifcx/projectIfcx";
import { calcSpec } from "./calcGeometry";
import { circlePoints, rectangleCorners, signedArea, wallSides, type Vec } from "./geometry";
import { calcColor } from "./store";
import { hasGeometry } from "./types";

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Verticaal prisma op een bolle omtrek van `bottom` tot `top`, met deksels (waaier vanuit het eerste punt). */
export function prismMesh(outline: Vec[], bottom: number, top: number): PlacedExport["mesh"] {
  const ring = signedArea(outline) < 0 ? [...outline].reverse() : outline, n = ring.length;
  const points: [number, number, number][] = [];
  for (const p of ring) points.push([r3(p.x), r3(p.y), r3(bottom)]);
  for (const p of ring) points.push([r3(p.x), r3(p.y), r3(top)]);
  const idx: number[] = [];
  for (let k = 0; k < n; k++) { const j = (k + 1) % n; idx.push(k, j, n + j, k, n + j, n + k); }
  for (let k = 1; k < n - 1; k++) { idx.push(n, n + k, n + k + 1); idx.push(0, k + 1, k); }
  return { points, faceVertexIndices: idx };
}

const hexRgb = (hex: string): [number, number, number] => {
  const v = parseInt(hex.replace("#", ""), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255].map((x) => Math.round(x * 1000) / 1000) as [number, number, number];
};

/** Elementen van de geplaatste berekeningen; `origin` is de oorsprong van het grondmodel (RD). */
export function placedIfcx(calcs: CalculationInstance[], origin: { x: number; y: number } | null): PlacedExport[] {
  const o = origin ?? { x: 0, y: 0 };
  const loc = (p: { x: number; y: number }): Vec => ({ x: p.x - o.x, y: p.y - o.y });
  const specs = new Map(calcs.map((c) => [c.id, calcSpec(c)]));
  const out: PlacedExport[] = [];
  for (const c of calcs) {
    const p = c.placement, spec = specs.get(c.id);
    if (!hasGeometry(p) || !spec || spec.kind !== p.kind) continue;
    const base = { color: hexRgb(calcColor(c.id)) };
    if (p.kind === "piles" && spec.kind === "piles") {
      const pl = spec.pile, r = pl.sizeM / 2;
      for (const q of p.positions) {
        const m = loc(q);
        const outline = pl.circular ? circlePoints(m.x, m.y, r, 16) : rectangleCorners(m.x, m.y, pl.sizeM, pl.sizeM, 0);
        out.push({ ...base, id: `${c.id}:${q.id}`, name: `${c.name} ${q.label ?? q.id}`, ifcClass: "IfcPile", mesh: prismMesh(outline, pl.toeNap, pl.topNap), props: { calculationId: c.id, module: c.moduleId, topNap: pl.topNap, bottomNap: pl.toeNap } });
      }
    }
    if (p.kind === "wall") {
      for (const side of wallSides(p, p.points.map(loc))) {
        const otherId = p.sideCalcIds?.[side.index];
        const other = otherId ? specs.get(otherId) : null;
        const w = other?.kind === "wall" ? other.wall : spec.kind === "wall" ? spec.wall : null;
        if (!w) continue;
        const calcId = other?.kind === "wall" ? otherId! : c.id;
        const mid = { x: (side.a.x + side.b.x) / 2, y: (side.a.y + side.b.y) / 2 };
        const outline = rectangleCorners(mid.x, mid.y, Math.max(0.01, w.thicknessM), side.length, (Math.atan2(side.t.y, side.t.x) * 180) / Math.PI);
        out.push({ ...base, color: hexRgb(calcColor(calcId)), id: `${c.id}:side-${side.index}`, name: `${c.name} ${side.index + 1}`, ifcClass: "IfcWall", mesh: prismMesh(outline, w.toeNap, w.topNap), props: { calculationId: calcId, module: "sheet-pile-wall", topNap: w.topNap, bottomNap: w.toeNap } });
      }
    }
    if (p.kind === "footing" && spec.kind === "footing") {
      const f = spec.footing, m = loc(p);
      const top = f.groundNap - f.foundationNap >= 0.2 ? f.groundNap : f.foundationNap + 0.5;
      const outline = rectangleCorners(m.x, m.y, f.widthM, f.lengthM ?? p.lengthM ?? 10, p.angleDeg);
      out.push({ ...base, id: c.id, name: c.name, ifcClass: "IfcFooting", mesh: prismMesh(outline, f.foundationNap, top), props: { calculationId: c.id, module: c.moduleId, topNap: top, bottomNap: f.foundationNap } });
    }
  }
  return out;
}
