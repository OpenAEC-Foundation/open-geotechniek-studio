import { describe, expect, it } from "vitest";
import { computeDriving, defaultSafety, drivingExample, ultimate, type FormulaId } from "./compute";

// Handberekening bij het voorbeeld (slotkalender 40 slagen per 250 mm → s = 6,25 mm):
//   W = 5000·9,81/1000 = 49,05 kN; P = (5290+500)·9,81/1000 = 56,80 kN
//   η·W·h = 0,9·49,05·0,8 = 35,316 kNm; A·E = 0,1225·30e6 = 3,675e6 kN
const HAND: Record<FormulaId, number> = {
  dutch: 2618.42,   // 0,9·49,05²·0,8 / (0,00625·105,85)
  enr: 4017.75,     // 35,316 / (0,00625 + 0,00254)
  hiley: 1892.42,   // 35,316/(0,00625+0,004) · (49,05+0,16·56,80)/105,85
  janbu: 1795.48,   // Cd 0,9237; λ 4,4282; ku 3,1471
  danish: 2271.14,  // 35,316 / (0,00625 + 0,0093)
  gates: 1681.27,   // 6,7·√39240·log10(40) − 445
};

describe("heiformules", () => {
  const r = computeDriving(drivingExample());
  it("rekent de slotkalender om naar zakking per slag", () => {
    expect(r.ok).toBe(true);
    expect(r.finalBlows).toBe(40);
    expect(r.finalSetMm).toBeCloseTo(6.25, 6);
    expect(r.wKn).toBeCloseTo(49.05, 6);
    expect(r.pKn).toBeCloseTo(56.7999, 4);
    expect(r.energyKnm).toBeCloseTo(35.316, 6);
  });
  for (const id of Object.keys(HAND) as FormulaId[]) {
    it(`${id}: grensweerstand volgens de handberekening`, () => {
      const f = r.formulas.find((x) => x.id === id)!;
      expect(f.ruKn).toBeCloseTo(HAND[id], 1);
      expect(f.allowKn).toBeCloseTo(HAND[id] / defaultSafety(id, "hydraulic"), 1);
    });
  }
  it("baseert het oordeel op de mediaan van Hiley, Janbu, Deens en Gates", () => {
    // toelaatbaar: 630,81 · 598,49 · 757,05 · 480,36 → mediaan (598,49 + 630,81)/2
    expect(r.consensusKn).toBeCloseTo(614.65, 1);
    expect(r.consensusUc).toBeCloseTo(550 / 614.65, 3);
  });
  it("geeft de vereiste kalender: met dat aantal slagen wordt de belasting net gehaald", () => {
    const input = drivingExample();
    for (const f of r.formulas) {
      expect(f.requiredBlows).not.toBeNull();
      const at = (blows: number) => computeDriving({ ...input, rows: [{ depthM: 17, blows }] }).formulas.find((x) => x.id === f.id)!.allowKn;
      expect(at(f.requiredBlows!)).toBeGreaterThanOrEqual(550 - 1e-6);
      if (f.requiredBlows! > 1) expect(at(f.requiredBlows! - 1)).toBeLessThan(550);
    }
  });
  it("middelt de slotkalender over de laatste tochten", () => {
    const avg = computeDriving({ ...drivingExample(), finalCount: 3 });
    expect(avg.finalBlows).toBe(36); // (32 + 36 + 40) / 3
  });
  it("gebruikt voor een valblok de zwaardere factoren", () => {
    expect(defaultSafety("dutch", "drop")).toBe(10);
    expect(defaultSafety("dutch", "diesel")).toBe(6);
    const ctx = { w: 49.05, p: 56.8, h: 0.8, eta: 0.9, e: 0.4, l: 18, ae: 3.675e6, c: 0.008 };
    expect(ultimate("enr", 0.00625, { ...ctx, hammer: "drop" }).terms.cMm).toBeCloseTo(25.4);
  });
  it("meer slagen per tocht geeft bij elke formule meer weerstand", () => {
    for (const f of r.formulas) {
      const p = r.profile.map((t) => t.allowKn[f.id]!);
      for (let i = 1; i < p.length; i++) expect(p[i]).toBeGreaterThan(p[i - 1]);
    }
  });
  it("waarschuwt bij vrijwel vaststaan, een te licht blok en afnemende slagen", () => {
    const stuck = computeDriving({ ...drivingExample(), rows: [{ depthM: 17, blows: 200 }] });
    expect(stuck.warnings.some((w) => w.includes("< 2 mm"))).toBe(true);
    const light = computeDriving({ ...drivingExample(), ramMassKg: 2000 });
    expect(light.warnings.some((w) => w.includes("W/P"))).toBe(true);
    const down = computeDriving({ ...drivingExample(), rows: [{ depthM: 16, blows: 40 }, { depthM: 16.25, blows: 30 }, { depthM: 16.5, blows: 20 }] });
    expect(down.warnings.some((w) => w.includes("neemt"))).toBe(true);
  });
  it("weigert onvolledige invoer met een melding", () => {
    expect(computeDriving({ ...drivingExample(), rows: [] }).ok).toBe(false);
    expect(computeDriving({ ...drivingExample(), efficiency: 1.2 }).ok).toBe(false);
    expect(computeDriving({ ...drivingExample(), enabled: [] }).ok).toBe(false);
    expect(computeDriving({ ...drivingExample(), requiredKn: 0 }).error).toBeTruthy();
  });
});
