import { describe, expect, it } from "vitest";
import { meanShaftPerimeter, shaftDiameterAtNap } from "./parts/geometry";
import { computePile } from "./compute";
import fixture from "./__fixtures__/sondering-3bm-cgeo1.json";
import type { PileInput } from "./types";
import type { Cpt } from "../../../types/cpt";

// Houten paal met betonopzetter: paalkop NAP 0, las NAP −2, paalpunt NAP −12.
const geo = {
  diameterMm: 220,
  pileTopNap: 0,
  concreteExtension: { jointNap: -2, sizeMm: 250, isCircular: false },
} satisfies Parameters<typeof meanShaftPerimeter>[0];
const concrete = 4 * 0.25;          // omtrek opzetter 250×250 [m]
const wood = Math.PI * 0.22;        // omtrek hout Ø220 [m]

describe("schachtomtrek met betonopzetter", () => {
  it("gebruikt boven de las de opzetter en eronder het hout", () => {
    expect(meanShaftPerimeter(geo, true, 0, -2)).toBeCloseTo(concrete, 12);
    expect(meanShaftPerimeter(geo, true, -2, -12)).toBeCloseTo(wood, 12);
  });

  it("middelt over de las naar lengte", () => {
    // 2 m opzetter + 6 m hout over een kleefzone van 8 m.
    expect(meanShaftPerimeter(geo, true, 0, -8)).toBeCloseTo((2 * concrete + 6 * wood) / 8, 12);
  });

  it("laat de tapsheid van het hout bij de las beginnen", () => {
    const tapered = { ...geo, timberTaper: { toeDiameterMm: 140, lengthM: 8 } };
    expect(shaftDiameterAtNap(tapered, -2)).toBe(220);
    expect(shaftDiameterAtNap(tapered, -6)).toBeCloseTo(180, 12);
    expect(shaftDiameterAtNap(tapered, -10)).toBeCloseTo(140, 12);
    // Hout van de las tot NAP −10: lineair 220 → 140 mm, gemiddeld 180 mm.
    expect(meanShaftPerimeter(tapered, true, -2, -10)).toBeCloseTo(Math.PI * 0.18, 12);
    // Over de las: 2 m opzetter + 4 m hout dat van 220 naar 180 mm loopt.
    expect(meanShaftPerimeter(tapered, true, 0, -6)).toBeCloseTo((2 * concrete + 4 * Math.PI * 0.2) / 6, 12);
  });
});

const cpt = {
  id: "S-hout", metadata: { source_file: "S-hout.gef", ground_level_nap: 0 },
  points: [{ depth: 0, qc: 10, rf: 1 }, { depth: 40, qc: 10, rf: 1 }],
} as unknown as Cpt;
const timber = {
  ...fixture.input, cptId: cpt.id, pileTypeId: "timber-uniform", diameterMm: 220,
  baseDiameterMm: undefined, axialStiffnessKn: undefined, timberTaper: undefined,
} as PileInput;
const withExtension = (patch: Partial<NonNullable<PileInput["concreteExtension"]>> = {}): PileInput => ({
  ...timber,
  concreteExtension: { jointNap: timber.pileTopNap - 2, sizeMm: 250, isCircular: false, ...patch },
});

describe("berekening houten paal met betonopzetter", () => {
  it("rekent zonder EA, want zakking en veerwaarden worden niet bepaald", () => {
    expect(computePile(timber, cpt).ok).toBe(false); // zonder opzetter: EA vereist
    const r = computePile(withExtension(), cpt);
    expect(r.ok).toBe(true);
    expect(r.settlement.available).toBe(false);
    expect(r.settlement.eaKn).toBeUndefined();
    expect(r.warnings.some((w) => w.startsWith("Betonopzetter 250×250 mm"))).toBe(true);
    expect(r.warnings.some((w) => w.includes("verschillende EA voor beton en hout"))).toBe(true);
  });

  it("neemt de omtrek van de opzetter mee in de negatieve kleef", () => {
    const input = withExtension();
    const r = computePile(input, cpt);
    const zone = input.pileTopNap - input.negKleefBottomNap;
    expect(r.negKleef.meanPerimeterM).toBeCloseTo((2 * concrete + (zone - 2) * wood) / zone, 12);
    // Een bredere opzetter geeft meer kleef dan een kleinere.
    const small = computePile(withExtension({ sizeMm: 150 }), cpt);
    expect(r.negKleef.fnkD).toBeGreaterThan(small.negKleef.fnkD);
  });

  it("weigert een opzetter op een niet-houten paal of met de las buiten de paal", () => {
    const steel = { ...withExtension(), pileTypeId: "steel-pipe-driven-closed-2017" } as PileInput;
    expect(computePile(steel, cpt).error).toMatch(/betonopzetter vereist een houten paal/);
    expect(computePile(withExtension({ jointNap: timber.pileTopNap + 0.1 }), cpt).ok).toBe(false);
    expect(computePile(withExtension({ jointNap: timber.pileToeNap - 0.1 }), cpt).ok).toBe(false);
    expect(computePile(withExtension({ sizeMm: 0 }), cpt).ok).toBe(false);
  });

  it("houdt de tapsheid binnen het houten deel onder de las", () => {
    const woodLength = timber.pileTopNap - 2 - timber.pileToeNap;
    const ok = { ...withExtension(), timberTaper: { toeDiameterMm: 160, lengthM: woodLength } };
    expect(computePile(ok, cpt).ok).toBe(true);
    const tooLong = { ...withExtension(), timberTaper: { toeDiameterMm: 160, lengthM: woodLength + 0.5 } };
    expect(computePile(tooLong, cpt).error).toMatch(/binnen het houten deel onder de las/);
  });
});
