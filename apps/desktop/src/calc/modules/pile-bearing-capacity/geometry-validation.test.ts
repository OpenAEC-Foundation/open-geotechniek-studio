import { describe, expect, it } from "vitest";
import { computePile } from "./compute";
import { getPileType } from "./catalog";
import { computeBaseResistance } from "./parts/base-resistance";
import { computeShaftFriction } from "./parts/shaft-friction";
import { computeNegKleef } from "./parts/negative-skin-friction";
import fixture from "./__fixtures__/sondering-3bm-cgeo1.json";
import type { PileInput } from "./types";
import type { Cpt } from "../../../types/cpt";

const input = fixture.input as PileInput;
const cpt: Cpt = {
  id: "geometry",
  metadata: { source_file: "synthetisch-profiel", ground_level_nap: 0 },
  points: Array.from({ length: 201 }, (_, i) => ({ depth: i / 10, qc: 5 })),
};
const square = getPileType("concrete-prefab-prestressed-driven")!;

describe("vierkante paalgeometrie", () => {
  it("gebruikt 90000 mm² puntoppervlak en de diameter van een cirkel met gelijk oppervlak", () => {
    const result = computeBaseResistance(cpt, { pileToeDepth: 14, diameterMm: 300, pileType: square });
    expect(result.abMm2).toBe(90_000);
    expect(result.deqMm).toBeCloseTo(338.51375, 4);
    expect(result.rbCalMax).toBeCloseTo(315, 6);
  });

  it("gebruikt 1,2 m omtrek voor positieve kleef bij een zijlengte van 300 mm", () => {
    const result = computeShaftFriction(cpt, {
      diameterMm: 300, pileType: square, negKleefBottomNap: -5, pileToeNap: -8,
    }, [{ kind: "sand-wet", startNap: -5, endNap: -8, gammaK: 20, gammaW: 10, phi: 32.5 }]);
    expect(result.rsCalMax).toBeCloseTo(180, 6);
  });

  it("gebruikt 1,2 m omtrek voor negatieve kleef bij een zijlengte van 300 mm", () => {
    const result = computeNegKleef({
      ...input, pileTypeId: square.id, diameterMm: 300,
      pileTopNap: 0, excavationNap: 0, negKleefBottomNap: -2,
      soilProfile: [{ kind: "sand-dry", startNap: 0, endNap: -2, gammaK: 20, gammaW: 0, phi: 30 }],
    });
    expect(result.fnkRep).toBeCloseTo(12, 6);
  });

  it("controleert sonderingsdiepte met de equivalente diameter", () => {
    const result = computePile({ ...input, pileTypeId: square.id, diameterMm: 300 }, {
      ...cpt, points: [{ depth: 0, qc: 5 }, { depth: 14.22, qc: 5 }],
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Sondering te ondiep");
  });
});

describe("invoercontrole paaldraagvermogen", () => {
  it.each([
    { diameterMm: 0 }, { diameterMm: -219 }, { diameterMm: NaN },
    { wallThicknessMm: 0 }, { wallThicknessMm: 100 },
    { pileToeNap: input.pileTopNap }, { pileToeNap: 1 },
    { gammaM: 0 }, { gammaM: Infinity }, { gammaFnk: -1 },
    { nEd: -1 }, { nEk: NaN }, { waterNap: Infinity },
    { negKleefBottomNap: -20 }, { negKleefBottomNap: 1 },
    { posKleefTopNap: -20 }, { posKleefTopNap: 1 },
    { posKleefTopNap: -7 }, { ksMinFactor: -1 },
  ])("wijst ongeldige invoer af: %j", (patch) => {
    const result = computePile({ ...input, ...patch }, cpt);
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("accepteert een massieve betonpaal zonder wanddikte", () => {
    expect(computePile({ ...input, pileTypeId: square.id, wallThicknessMm: 0 }, cpt).ok).toBe(true);
  });

  it("wijst niet-eindige grondparameters af", () => {
    expect(computePile({ ...input, soilProfile: [{ ...input.soilProfile[0], gammaK: NaN }] }, cpt).ok).toBe(false);
  });

  it("wijst omgekeerde grondlagen af", () => {
    expect(computePile({ ...input, soilProfile: [{ ...input.soilProfile[0], endNap: 1 }] }, cpt).ok).toBe(false);
  });
});
