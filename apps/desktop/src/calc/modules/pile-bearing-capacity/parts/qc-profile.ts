import type { Cpt } from "../../../../types/cpt";

/** Integraal van min(lineaire qc, cap), inclusief het snijpunt binnen een segment. */
function cappedArea(a: number, b: number, width: number, cap: number): number {
  if (a <= cap && b <= cap) return (a + b) / 2 * width;
  if (a >= cap && b >= cap) return cap * width;
  const fraction = (cap - a) / (b - a);
  return a < cap
    ? width * (fraction * (a + cap) / 2 + (1 - fraction) * cap)
    : width * (fraction * cap + (1 - fraction) * (cap + b) / 2);
}

/** Lineair geïnterpoleerd qc-profiel met cumulatieve trapeziumintegralen.
 * Ontbrekende qc behoudt de bestaande nulwaardeconventie.
 * De index is lokaal per berekening, zodat gewijzigde CPT-data nooit verouderde cachedata gebruikt.
 */
export class QcProfile {
  readonly depths: number[];
  private readonly qc: number[];
  private readonly area: number[];
  constructor(cpt: Cpt) {
    this.depths = cpt.points.map(p => p.depth);
    this.qc = cpt.points.map(p => p.qc ?? 0);
    this.area = [0];
    for (let i = 1; i < this.depths.length; i++) {
      this.area.push(this.area[i - 1] + (this.depths[i] - this.depths[i - 1]) * (this.qc[i] + this.qc[i - 1]) / 2);
    }
  }
  private lowerBound(depth: number): number {
    let lo = 0, hi = this.depths.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.depths[mid] < depth) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
  at(depth: number): number {
    const j = this.lowerBound(depth);
    if (j === 0) return this.qc[0];
    if (j === this.depths.length) return this.qc[j - 1];
    const t = (depth - this.depths[j - 1]) / (this.depths[j] - this.depths[j - 1]);
    return this.qc[j - 1] + t * (this.qc[j] - this.qc[j - 1]);
  }
  private integral(depth: number): number {
    const j = this.lowerBound(depth);
    if (j === 0) return 0;
    if (j === this.depths.length) return this.area[j - 1];
    return this.area[j - 1] + (depth - this.depths[j - 1]) * (this.qc[j - 1] + this.at(depth)) / 2;
  }
  average(top: number, bottom: number): number {
    top = Math.max(top, this.depths[0]);
    bottom = Math.min(bottom, this.depths[this.depths.length - 1]);
    if (this.depths.length < 2 || bottom <= top) return 0;
    return (this.integral(bottom) - this.integral(top)) / (bottom - top);
  }

  averageCapped(top: number, bottom: number, cap: number): number {
    top = Math.max(top, this.depths[0]);
    bottom = Math.min(bottom, this.depths[this.depths.length - 1]);
    if (this.depths.length < 2 || bottom <= top) return 0;
    let depth = top, qc = this.at(top), area = 0;
    const sample = (d: number, q: number) => {
      area += cappedArea(qc, q, d - depth, cap);
      depth = d;
      qc = q;
    };
    for (let i = this.lowerBound(top); i < this.depths.length && this.depths[i] < bottom; i++) {
      if (this.depths[i] > top) sample(this.depths[i], this.qc[i]);
    }
    sample(bottom, this.at(bottom));
    return area / (bottom - top);
  }

  walkUp(bottom: number, top: number, initialMin = Infinity, capture = false) {
    let depth = bottom, qc = this.at(bottom), min = Math.min(initialMin, qc), area = 0;
    const clippedPoints: Array<{ depth: number; qcClipped: number }> = [];
    if (capture) clippedPoints.push({ depth, qcClipped: min });
    const sample = (d: number, q: number) => {
      const width = depth - d;
      // Bij stijgende qc blijft het lopende minimum constant. Bij dalende
      // qc geldt min(qc, vorig minimum), met een eventueel intern snijpunt.
      area += q >= qc ? min * width : cappedArea(qc, q, width, min);
      if (capture && qc > min && q < min) {
        clippedPoints.push({ depth: depth - width * (min - qc) / (q - qc), qcClipped: min });
      }
      min = Math.min(min, q);
      if (capture) clippedPoints.push({ depth: d, qcClipped: min });
      depth = d;
      qc = q;
    };
    for (let i = this.lowerBound(bottom) - 1; i >= 0 && this.depths[i] > top; i--) sample(this.depths[i], this.qc[i]);
    sample(top, this.at(top));
    clippedPoints.reverse();
    return { avg: bottom > top ? area / (bottom - top) : 0, finalMin: min, clippedPoints };
  }
}
