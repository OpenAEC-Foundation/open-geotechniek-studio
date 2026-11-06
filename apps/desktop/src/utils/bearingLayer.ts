import type { Cpt } from "../types/cpt";

/**
 * Bovenkant van de draagkrachtige laag (diepte t.o.v. maaiveld, m): de eerste
 * diepte waarop qc over minstens `minThicknessM` boven `qcMpa` blijft.
 * null = in deze sondering niet gevonden.
 */
export function bearingLayerTop(cpt: Cpt, qcMpa: number, minThicknessM: number): number | null {
  const pts = cpt.points.filter((p) => Number.isFinite(p.depth) && Number.isFinite(p.qc)).sort((a, b) => a.depth - b.depth);
  let start: number | null = null;
  for (const p of pts) {
    if ((p.qc as number) >= qcMpa) {
      if (start === null) start = p.depth;
      if (p.depth - start >= minThicknessM) return start;
    } else start = null;
  }
  return null;
}
