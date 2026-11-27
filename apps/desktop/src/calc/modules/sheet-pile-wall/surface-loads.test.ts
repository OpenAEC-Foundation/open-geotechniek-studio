// Belastingen op afstand en een maaiveld dat niet vlak is: elastische spreiding (Boussinesq), gespiegeld in de wand.
// Zie VERIFICATIE.md, hoofdstuk 14.
import { describe, expect, it } from "vitest";
import { REPRESENTATIVE, buildScenario, computeWall, sidePoint, wallExample, type WallInput, type WallOk } from "./compute";
import { extraVerticalStress, lineStress, profileStrips, stripStress } from "./surface-loads";

const ok = (i: WallInput): WallOk => { const r = computeWall(i); if (!r.ok) throw new Error(r.error); return r; };

describe("spreiding volgens Boussinesq", () => {
  it("strook van 1 tot 3 m op 2 m diepte, met de hand", () => {
    // θ1 = atan(1/2), θ2 = atan(3/2): σz = q/π·(θ2 − θ1 + sin θ2·cos θ2 − sin θ1·cos θ1) = 1,8484 kPa bij q = 10; gespiegeld tweemaal.
    expect(stripStress(10, 1, 3, 2)).toBeCloseTo(1.8483764, 6);
    expect(extraVerticalStress([{ q: 10, x1: 1, x2: 3 }], [], 2)).toBeCloseTo(3.6967528, 6);
  });
  it("lijnlast: σz = 2·P·z³ / (π·(x² + z²)²); P = 10 kN/m op 1 m, z = 1 m", () => {
    expect(lineStress(10, 1, 1)).toBeCloseTo(20 / (4 * Math.PI), 9);
    expect(extraVerticalStress([], [{ p: 10, x: 1 }], 1)).toBeCloseTo(40 / (4 * Math.PI), 9);
  });
  it("een strook vanaf de wand tot oneindig is gespiegeld precies de gelijkmatige bovenbelasting, op elke diepte", () => {
    for (const z of [0, 0.1, 1, 5, 40]) expect(extraVerticalStress([{ q: 12, x1: 0, x2: Infinity }], [], z)).toBeCloseTo(12, 9);
    // Een strook op afstand geeft aan het maaiveld niets en op grote diepte bijna niets.
    expect(extraVerticalStress([{ q: 12, x1: 2, x2: 4 }], [], 0)).toBe(0);
    // Op grote diepte gespiegeld ongeveer 2 · 2·q·b / (π·z), de spanning onder een lijnlast q·b.
    expect(extraVerticalStress([{ q: 12, x1: 2, x2: 4 }], [], 1000)).toBeCloseTo((4 * 12 * 2) / (Math.PI * 1000), 4);
  });
  it("profiel: stukjes van hooguit 0,25 m en voorbij het laatste punt een strook tot oneindig", () => {
    const s = profileStrips([{ xM: 1, dzM: 1 }], () => 18);
    expect(s).toHaveLength(5); expect(s[0]).toMatchObject({ x1: 0, x2: 0.25 }); expect(s[0].q).toBeCloseTo(18 * 0.125, 9);
    expect(s[4]).toMatchObject({ q: 18, x1: 1, x2: Infinity });
  });
});

describe("in de wandberekening", () => {
  const base = wallExample();
  it("een strook vanaf de wand tot ver weg geeft dezelfde uitkomst als de gelijkmatige bovenbelasting", () => {
    const uniform = ok(base), strip = ok({ ...base, surchargeKpa: 0, loads: [{ side: "high", kind: "strip", value: base.surchargeKpa, fromM: 0, toM: 1e6 }] });
    expect(strip.uls.maxMoment.value).toBeCloseTo(uniform.uls.maxMoment.value, 3); expect(strip.uls.anchor!.horizontalKn).toBeCloseTo(uniform.uls.anchor!.horizontalKn, 3);
  });
  it("een strook verder van de wand werkt minder", () => {
    const near = ok({ ...base, surchargeKpa: 0, loads: [{ side: "high", kind: "strip", value: 30, fromM: 0.5, toM: 3.5 }] });
    const far = ok({ ...base, surchargeKpa: 0, loads: [{ side: "high", kind: "strip", value: 30, fromM: 5, toM: 8 }] }), none = ok({ ...base, surchargeKpa: 0 });
    expect(Math.abs(near.uls.maxMoment.value)).toBeGreaterThan(Math.abs(far.uls.maxMoment.value)); expect(Math.abs(far.uls.maxMoment.value)).toBeGreaterThan(Math.abs(none.uls.maxMoment.value));
  });
  it("een maaiveld dat 0,01 m van de wand 1 m hoger ligt, is vrijwel 1 m grond als bovenbelasting", () => {
    const dry: WallInput = { ...base, waterHighNap: -10, waterLowNap: -10 };
    const raised = ok({ ...dry, profileHigh: [{ xM: 0.01, dzM: 1 }] }), surcharge = ok({ ...dry, surchargeKpa: dry.surchargeKpa + 18 });
    expect(Math.abs(raised.uls.maxMoment.value / surcharge.uls.maxMoment.value - 1)).toBeLessThan(0.01);
  });
  it("een aflopende waterbodem verlaagt de passieve weerstand en vergroot het moment; de toeslag laat het profiel evenwijdig zakken", () => {
    const flat = ok(base), sloping = ok({ ...base, profileLow: [{ xM: 1, dzM: 0 }, { xM: 8, dzM: -2 }] });
    expect(Math.abs(sloping.uls.maxMoment.value)).toBeGreaterThan(Math.abs(flat.uls.maxMoment.value));
    const s = buildScenario({ ...base, profileLow: [{ xM: 8, dzM: -2 }] }, base.factors), r = buildScenario({ ...base, profileLow: [{ xM: 8, dzM: -2 }] }, REPRESENTATIVE);
    expect(s.low.surfaceNap).toBeLessThan(r.low.surfaceNap); expect(s.low.strips).toEqual(r.low.strips);
    // Diep onder de bodem: σ′v is 2 m grond lager dan zonder profiel (onder water: γsat − γw = 10 kN/m³).
    expect(sidePoint(buildScenario(base, REPRESENTATIVE).low, -400).sigmaVEff - sidePoint(r.low, -400).sigmaVEff).toBeCloseTo(20, 0);
  });
  it("belastingen per fase aan en uit", () => {
    const loads = [{ side: "high" as const, kind: "line" as const, value: 50, fromM: 1, toM: 1 }];
    const r = ok({ ...base, loads, phases: [{ name: "1", install: ["A1"], loadIds: [] }, { name: "2", loadIds: ["B1"] }] });
    const [p1, p2] = r.cases.filter((c) => c.stepId === "uls").map((c) => c.run);
    expect(p1.scenario.high.lines ?? []).toHaveLength(0); expect(p2.scenario.high.lines).toHaveLength(1);
    expect(p2.anchor!.horizontalKn).toBeGreaterThan(p1.anchor!.horizontalKn);
  });
});
