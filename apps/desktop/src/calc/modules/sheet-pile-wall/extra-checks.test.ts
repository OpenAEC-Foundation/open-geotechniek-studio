// Toetsen die adviesrapporten bevatten: vervormingseis, verticaal evenwicht, ankerstaaf en gording. Zie VERIFICATIE.md, hoofdstuk 15.
import { describe, expect, it } from "vitest";
import { computeWall, wallExample, DEFAULT_TIE, DEFAULT_WALER, type WallInput, type WallOk } from "./compute";

const ok = (i: WallInput): WallOk => { const r = computeWall(i); if (!r.ok) throw new Error(r.error); return r; };
const base = wallExample();

describe("extra toetsen", () => {
  it("staan standaard uit: bestaande berekeningen houden dezelfde toetsen", () => {
    expect(ok(base).checks.map((c) => c.id)).toEqual(["bending", "normal", "shear", "passive", "embedment"]);
  });

  it("vervormingseis: min(H / 100; 50 mm), met de grootste representatieve verplaatsing", () => {
    const r = ok({ ...base, extraChecks: { deformation: { enabled: true, ratio: 100, maxMm: 50 }, vertical: { enabled: false, qbMaxMPa: 0, xi: 1.39, gammaB: 1.2 } } });
    const c = r.checks.find((x) => x.id === "deformation")!;
    // Kerende hoogte 4 m: 4000 / 100 = 40 mm, kleiner dan het maximum van 50 mm.
    expect(c.resistance).toBeCloseTo(40, 9); expect(c.load).toBeCloseTo(Math.abs(r.sls.maxDisplacement.value) * 1000, 9);
    const strict = ok({ ...base, extraChecks: { deformation: { enabled: true, ratio: 100, maxMm: 2 }, vertical: { enabled: false, qbMaxMPa: 0, xi: 1.39, gammaB: 1.2 } } });
    expect(strict.checks.find((x) => x.id === "deformation")!.resistance).toBe(2);
  });

  it("verticaal evenwicht: wrijving aan de hoge zijde plus de verticale ankerkracht tegen q_b;max · A / (ξ · γ_b)", () => {
    const r = ok({ ...base, extraChecks: { deformation: { enabled: false, ratio: 100, maxMm: 50 }, vertical: { enabled: true, qbMaxMPa: 10, xi: 1.39, gammaB: 1.2 } } });
    const c = r.checks.find((x) => x.id === "vertical")!;
    // AZ 18-700: A = 139,2 cm²/m; 10 MPa · 0,01392 m² / (1,39 · 1,2) = 83,45 kN/m.
    expect(c.resistance).toBeCloseTo((10000 * 0.01392) / (1.39 * 1.2), 6);
    // De verticale component van het anker (30°) telt mee: F_v = F_δ + F_h · tan 30°.
    const friction = Number(c.steps[0].result.split(" ")[0].replace(",", "."));
    expect(c.load).toBeCloseTo(friction + r.sls.anchor!.horizontalKn * Math.tan(Math.PI / 6), 1);
  });

  it("ankerstaaf: min(k_t · f_ua · A_s / γ_M2; f_y · A_g / γ_M0) tegen 1,25 × de ankerkracht per anker", () => {
    const r = ok({ ...base, anchor: { ...base.anchor, tie: { ...DEFAULT_TIE, enabled: true } } }), c = r.checks.find((x) => x.id === "tie")!;
    // 0,6 · 490 · 1000 / 1,25 = 235,2 kN; 355 · 1257 = 446,2 kN.
    expect(c.resistance).toBeCloseTo(235.2, 6); expect(c.load).toBeCloseTo(1.25 * r.uls.anchor!.perAnchorKn, 6);
  });

  it("gording: q · a² / 10 tegen W · f_y / γ_M0", () => {
    const r = ok({ ...base, anchor: { ...base.anchor, waler: { ...DEFAULT_WALER, enabled: true, wCm3: 500 } } }), c = r.checks.find((x) => x.id === "waler")!;
    expect(c.load).toBeCloseTo((r.uls.anchor!.horizontalKn * 2.8 ** 2) / 10, 6); expect(c.resistance).toBeCloseTo(177.5, 6);
  });
});
