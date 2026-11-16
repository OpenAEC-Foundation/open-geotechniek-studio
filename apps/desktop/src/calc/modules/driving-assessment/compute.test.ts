import { describe, expect, it } from "vitest";
import type { Cpt } from "../../../types/cpt";
import { computeDriving, defaultDrivingInput, equivalentDiameterMm, expectedBlows, meanQc, type DrivingInput } from "./compute";

/** Sondering tot 20 m: qc 2 MPa tot 15 m, daaronder 20 MPa; meetpunt elke 2 cm. */
function cpt(): Cpt {
  const points = [];
  for (let i = 1; i <= 1000; i++) { const depth = i * 0.02; points.push({ depth, qc: depth > 15 + 1e-9 ? 20 : 2 }); }
  return { id: "S1", metadata: { source_file: "S1.gef", ground_level_nap: 0.5 }, position: { x_rd: 100000, y_rd: 450000 }, points } as Cpt;
}
const ctx = { cpts: new Map([["S1", cpt()]]), activeCptId: "S1" };
const base: DrivingInput = { cptId: "S1", ramMassKg: 5000, dropHeightM: 0.8, shape: "square", sizeMm: 350, sizeBMm: 350, tochtMm: 250, fromM: 14, toM: 16, rows: [], tolerancePct: 50 };

describe("verwachte kalender", () => {
  it("volgt de formule uit het rekenblad: N = ⌈tocht · D² · qc / E⌉", () => {
    // E = 5000·9,81·0,8/1000 = 39,24 kNm; 250·0,35²·20/39,24 = 15,61 → 16
    expect(expectedBlows(20, 0.35, 250, 39.24)).toBe(16);
    // 400·0,35²·15/35,316 = 20,81 → 21
    expect(expectedBlows(15, 0.35, 400, 35.316)).toBe(21);
    expect(expectedBlows(0.01, 0.35, 250, 39.24)).toBe(1);
  });
  it("rekent per tocht met de gemiddelde conusweerstand van de sondering", () => {
    const r = computeDriving(base, ctx);
    expect(r.ok).toBe(true);
    expect(r.energyKnm).toBeCloseTo(39.24, 6);
    expect(r.profile.map((t) => t.depthM)).toEqual([14.25, 14.5, 14.75, 15, 15.25, 15.5, 15.75, 16]);
    expect(r.profile[0]).toMatchObject({ qcMpa: 2, expected: 2 }); // 250·0,1225·2/39,24 = 1,56 → 2
    expect(r.profile[7]).toMatchObject({ qcMpa: 20, expected: 16 });
    expect(meanQc(cpt(), 14.9, 15.1)).toBeCloseTo(11, 6); // half 2, half 20
  });
  it("gebruikt √(a·b) voor een rechthoekige paal", () => {
    expect(equivalentDiameterMm({ shape: "rect", sizeMm: 400, sizeBMm: 250 })).toBeCloseTo(316.23, 2);
    expect(equivalentDiameterMm({ shape: "round", sizeMm: 400, sizeBMm: 0 })).toBe(400);
  });
  it("vergelijkt de getelde kalender met de verwachting", () => {
    const r = computeDriving({ ...base, rows: [{ depthM: 15.5, blows: 20 }, { depthM: 15.75, blows: 12 }, { depthM: 16, blows: 30 }] }, ctx);
    expect(r.comparisons.map((c) => c.expected)).toEqual([16, 16, 16]);
    expect(r.comparisons[0].deviation).toBeCloseTo(0.25, 6);
    expect(r.comparisons.map((c) => c.within)).toEqual([true, true, false]); // +25 %, −25 %, +88 %
    expect(r.within).toBe(2);
    expect(r.outside).toBe(1);
    expect(r.meanDeviation).toBeCloseTo((0.25 - 0.25 + 0.875) / 3, 6);
    expect(r.final).toMatchObject({ depthM: 16, blows: 30 });
  });
  it("meldt een stelselmatige afwijking en een traject voorbij de sondering", () => {
    const high = computeDriving({ ...base, rows: [15.5, 15.75, 16].map((depthM) => ({ depthM, blows: 40 })) }, ctx);
    expect(high.warnings.some((w) => w.includes("meer geslagen"))).toBe(true);
    const deep = computeDriving({ ...base, toM: 22 }, ctx);
    expect(deep.warnings.some((w) => w.includes("20.0 m"))).toBe(true);
    expect(deep.profile[deep.profile.length - 1].expected).toBeNull();
  });
  it("wacht op een sondering en weigert onvolledige invoer", () => {
    expect(computeDriving({ ...base, cptId: null }, ctx)).toMatchObject({ ok: false, pending: true });
    expect(computeDriving({ ...base, sizeMm: 0 }, ctx).ok).toBe(false);
    expect(computeDriving({ ...base, toM: 10 }, ctx).ok).toBe(false);
    expect(computeDriving({ ...base, rows: [{ depthM: 15, blows: 0 }] }, ctx).ok).toBe(false);
  });
  it("kiest standaard de actieve sondering en haar onderste meters", () => {
    expect(defaultDrivingInput(ctx)).toMatchObject({ cptId: "S1", toM: 19, fromM: 14, tolerancePct: 50, rows: [] });
    expect(defaultDrivingInput({ cpts: new Map(), activeCptId: null }).cptId).toBeNull();
  });
});
