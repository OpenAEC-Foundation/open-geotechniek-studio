import { describe, expect, it } from "vitest";
import { computePile } from "./compute";
import { computeNegKleef } from "./parts/negative-skin-friction";
import { changeStandard } from "./standards";
import type { PileInput } from "./types";
import type { Cpt } from "../../../types/cpt";
import fixture from "./__fixtures__/sondering-3bm-cgeo1.json";

const input: PileInput = {
  ...fixture.input as PileInput, pileTypeId: "timber-uniform", diameterMm: 300,
  pileTopNap: 0, pileToeNap: -10, excavationNap: 0, negKleefBottomNap: -4,
  posKleefTopNap: -4, axialStiffnessKn: 100000, ksMinFactor: .25,
  timberTaper: { toeDiameterMm: 100, lengthM: 10 },
  soilProfile: [{ kind: "sand-wet", startNap: 0, endNap: -10, gammaK: 20, gammaW: 10, phi: 0 }],
};
const cpt: Cpt = { id: "constant", metadata: { source_file: "synthetisch", ground_level_nap: 0 }, points: [{depth:0,qc:5},{depth:20,qc:5}] };

describe("houten paal met lineair taps schachtdeel vanaf de kop", () => {
  it("gebruikt de gemiddelde diameter van het negatieve-kleeftraject", () => {
    // D(0)=300, D(4)=220 mm; gemiddelde 260 mm; integraal sigma=80 kPa m.
    expect(computeNegKleef(input).fnkRep).toBeCloseTo(Math.PI * .26 * .25 * 80, 10);
  });
  it("neemt het constante deel na het tapse deel mee in de omtrek", () => {
    // 2 m taps van 300 naar 100 mm, daarna 2 m constant: Dgem=150 mm.
    const shorter = {...input, timberTaper:{toeDiameterMm:100,lengthM:2}};
    expect(computeNegKleef(shorter).fnkRep).toBeCloseTo(Math.PI * .15 * .25 * 80, 10);
  });
  it("verandert de omtrek mee wanneer de kleefgrens verandert", () => {
    const deeper = {...input, negKleefBottomNap:-8};
    expect(computeNegKleef(deeper).fnkRep).toBeCloseTo(Math.PI * .22 * .25 * 320, 10);
  });
  it.each([undefined, "nen-6743-2006", "nen-9997-2012"] as const)("gebruikt puntdiameter en positieve trajectomtrek voor %s", standard => {
    const r = computePile({...input, standard}, cpt);
    expect(r.ok).toBe(true);
    expect(r.base.abMm2).toBeCloseTo(Math.PI / 4 * 100 ** 2);
    expect(r.shaft.rsCalMax).toBeCloseTo(Math.PI * .16 * 6 * .01 * 5 * 1000);
    expect(r.settlement.available).toBe(false);
  });
  it("berekent tapse draagkracht zonder een fictieve constante EA", () => {
    expect(computePile({...input, axialStiffnessKn:undefined},cpt).ok).toBe(true);
  });
  it.each([{toeDiameterMm:0,lengthM:10},{toeDiameterMm:301,lengthM:10},{toeDiameterMm:100,lengthM:0},{toeDiameterMm:100,lengthM:11},{toeDiameterMm:NaN,lengthM:10},{toeDiameterMm:100,lengthM:Infinity}])("weigert ongeldige tapsheid %j", timberTaper => {
    expect(computePile({...input,timberTaper},cpt).ok).toBe(false);
  });
  it("weigert houttapsheid op een ander paalmateriaal", () => {
    expect(computePile({...input,pileTypeId:"concrete-prefab-round"},cpt).ok).toBe(false);
  });
  it("wist houttapsheid wanneer de normkeuze overschakelt naar prefab", () => {
    expect(changeStandard(input,"nen-6743-1991").timberTaper).toBeUndefined();
  });
  it("behoudt de cilindrische uitkomst bij gelijke kop- en puntdiameter", () => {
    const a=computePile({...input,timberTaper:undefined},cpt);
    const b=computePile({...input,timberTaper:{toeDiameterMm:300,lengthM:10}},cpt);
    expect(b.negKleef.fnkRep).toBeCloseTo(a.negKleef.fnkRep);
    expect(b.base.rbCalMax).toBeCloseTo(a.base.rbCalMax);
    expect(b.shaft.rsCalMax).toBeCloseTo(a.shaft.rsCalMax);
  });
});
