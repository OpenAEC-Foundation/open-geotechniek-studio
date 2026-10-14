import { describe, expect, it } from "vitest";
import type { Cpt } from "../../../../types/cpt";
import { QcProfile } from "./qc-profile";

const profile = (points: Cpt["points"]) => new QcProfile({ id: "profiel", metadata: { source_file: "synthetisch" }, points });

describe("geïndexeerde qc-integratie", () => {
  it("integreert gedeeltelijke segmenten en dalende meetwaarden", () => {
    expect(profile([{ depth: 0, qc: 12 }, { depth: 10, qc: 2 }]).average(2, 4)).toBeCloseTo(9, 12);
  });

  it("begrenst het gemiddelde tot het beschikbare meettraject", () => {
    const p = profile([{ depth: 2, qc: 4 }, { depth: 4, qc: 8 }]);
    expect(p.average(0, 10)).toBe(6);
    expect(p.average(6, 10)).toBe(0);
    expect(p.average(3, 3)).toBe(0);
  });

  it("behoudt de nulwaardeconventie voor ontbrekende qc", () => {
    expect(profile([{ depth: 0 }, { depth: 2, qc: 8 }]).average(0, 2)).toBe(4);
    expect(profile([]).average(0, 2)).toBe(0);
  });

  it("komt bij onregelmatige meetafstand overeen met onafhankelijke segmentintegratie", () => {
    const points = Array.from({ length: 101 }, (_, i) => ({ depth: i * i / 100, qc: 10 + 5 * Math.sin(i) }));
    const p = profile(points);
    for (let k = 0; k < 40; k++) {
      const top = k * 1.73 + 0.017;
      const bottom = top + 0.83;
      let integral = 0;
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        const lo = Math.max(top, a.depth), hi = Math.min(bottom, b.depth);
        if (hi <= lo) continue;
        const slope = (b.qc - a.qc) / (b.depth - a.depth);
        integral += a.qc * (hi - lo) + slope / 2 * ((hi - a.depth) ** 2 - (lo - a.depth) ** 2);
      }
      expect(p.average(top, bottom)).toBeCloseTo(integral / (bottom - top), 10);
    }
  });
});
