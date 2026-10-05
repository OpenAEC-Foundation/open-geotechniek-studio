import type { Cpt } from "../../../../types/cpt";

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
}
