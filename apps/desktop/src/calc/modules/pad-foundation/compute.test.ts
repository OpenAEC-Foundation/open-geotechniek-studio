import { describe, it, expect } from "vitest";
import { computePad, padExample } from "./compute";
describe("EC7 Annex D pad foundation", () => {
  it("matches the independent 30-degree bearing factors and square example", () => {
    const r = computePad(padExample);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Published Annex D factors; numerical worksheet recomputed independently in Python.
    expect(r.nq).toBeCloseTo(18.4011222187, 8);
    expect(r.nc).toBeCloseTo(30.1396277915, 8);
    expect(r.ngamma).toBeCloseTo(20.0930851943, 8);
    expect(r.sq).toBeCloseTo(1.5);
    expect(r.sgamma).toBeCloseTo(0.7);
    expect(r.resistanceKn).toBeCloseTo(1979.1007512048, 5);
    expect(r.utilization).toBeCloseTo(500 / r.resistanceKn, 12);
  });
  it("scales resistance with the resistance factor and flags overload", () => {
    const a = computePad({ ...padExample, resistanceFactor: 1 }),
      b = computePad({
        ...padExample,
        resistanceFactor: 2,
        verticalDesignLoadKn: 1e6,
      });
    if (!a.ok || !b.ok) throw new Error("example failed");
    expect(b.resistanceKn).toBeCloseTo(a.resistanceKn / 2, 10);
    expect(b.passes).toBe(false);
  });
  it("is independent of rectangle orientation", () => {
    const a = computePad({ ...padExample, widthM: 2, lengthM: 3 }),
      b = computePad({ ...padExample, widthM: 3, lengthM: 2 });
    if (!a.ok || !b.ok) throw new Error("example failed");
    expect(b.resistanceKn).toBe(a.resistanceKn);
    expect(b.rotated).toBe(true);
  });
  it("has a finite continuous zero-friction limit", () => {
    const a = computePad({
        ...padExample,
        frictionDesignDeg: 0,
        cohesionDesignKpa: 20,
      }),
      b = computePad({
        ...padExample,
        frictionDesignDeg: 1e-5,
        cohesionDesignKpa: 20,
      });
    if (!a.ok || !b.ok) throw new Error("limit failed");
    expect(a.nq).toBe(1);
    expect(a.nc).toBeCloseTo(Math.PI + 2, 12);
    expect(a.ngamma).toBe(0);
    expect(b.resistanceKn).toBeCloseTo(a.resistanceKn, 2);
  });
  it.each([
    { widthM: 0 },
    { lengthM: -1 },
    { verticalDesignLoadKn: 0 },
    { frictionDesignDeg: 46 },
    { cohesionDesignKpa: -1 },
    { surchargeDesignKpa: -1 },
    { effectiveUnitWeightKnM3: -1 },
    { resistanceFactor: 0 },
    { widthM: Infinity },
    { widthM: NaN },
  ])("rejects invalid input %j", (change) =>
    expect(computePad({ ...padExample, ...change }).ok).toBe(false),
  );
});
