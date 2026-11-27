import { describe, expect, it } from "vitest";
import { computePile } from "../compute";
import { getPileType } from "../catalog";
import { strengthCheck } from "./strength-check";
import type { PileInput } from "../types";
import type { Cpt } from "../../../../types/cpt";
import fixture from "../__fixtures__/sondering-3bm-cgeo1.json";

const base: PileInput = {
  ...fixture.input as PileInput, pileTopNap: 0, pileToeNap: -10, excavationNap: 0, negKleefBottomNap: -4, posKleefTopNap: -4,
  nEd: 100, nEk: 80, ksMinFactor: .25, timberTaper: undefined, concreteExtension: undefined, baseDiameterMm: undefined, axialStiffnessKn: 100000,
  soilProfile: [{ kind: "sand-wet", startNap: 0, endNap: -10, gammaK: 20, gammaW: 10, phi: 0 }],
};
const cpt: Cpt = { id: "constant", metadata: { source_file: "synthetisch", ground_level_nap: 0 }, points: [{ depth: 0, qc: 5 }, { depth: 20, qc: 5 }] };
const row = (r: ReturnType<typeof strengthCheck>, id: string) => r.rows.find((x) => x.id === id)!;

describe("staal: NEN-EN 1993-1-1", () => {
  const input: PileInput = { ...base, pileTypeId: "steel-pipe-driven-closed-2017", diameterMm: 219.1, wallThicknessMm: 8, strengthCheck: { enabled: true, steelGrade: "S235" } };
  it("geeft doorsnedeklasse en N_c,Rd = A·f_y/γ_M0 van de buis", () => {
    const r = strengthCheck(input, getPileType(input.pileTypeId)!, 50);
    expect(r.nEdMaxKn).toBe(150);
    // D/t = 219,1/8 = 27,4 ≤ 50 ε² = 50: klasse 1.
    expect(row(r, "steelClass").demand!.v).toBeCloseTo(27.39, 2);
    expect(row(r, "steelClass").note!.vars!.cls).toBe(1);
    expect(row(r, "steelClass").status).toBe("info");
    // A = π (219,1² − 203,1²)/4 = 5305,5 mm²; N_c,Rd = 5305,5 · 235 = 1246,8 kN.
    const axial = row(r, "steelAxial");
    expect(axial.steps.find((s) => s.s === "A")!.v).toBeCloseTo(5305.5, 1);
    expect(axial.resistance!.v).toBeCloseTo(1246.8, 1);
    expect(axial.uc).toBeCloseTo(150 / 1246.8, 4);
    expect(r.ok).toBe(true);
    expect(r.governing!.id).toBe("steelAxial");
    expect(r.notes.some((n) => n.key === "steel" && n.nl.includes("knik"))).toBe(true);
  });
  it("rekent met de gekozen staalsoort", () => {
    const r = strengthCheck({ ...input, strengthCheck: { enabled: true, steelGrade: "S355" } }, getPileType(input.pileTypeId)!, 0);
    expect(row(r, "steelAxial").resistance!.v).toBeCloseTo(5305.5 * 355 / 1000, 0);
  });
  it("laat doorsnedeklasse 4 buiten de toetsing", () => {
    // D/t = 610/5 = 122 > 90 ε² = 90·235/355 = 59,6.
    const r = strengthCheck({ ...input, diameterMm: 610, wallThicknessMm: 5, strengthCheck: { enabled: true, steelGrade: "S355" } }, getPileType(input.pileTypeId)!, 0);
    expect(row(r, "steelClass").status).toBe("outside");
    expect(row(r, "steelAxial").uc).toBeNull();
    expect(r.outside).toBe(true);
    expect(r.ok).toBe(false);
  });
  it("toetst niet als de stalen doorsnede niet in de invoer zit", () => {
    const r = strengthCheck({ ...input, pileTypeId: "steel-screw-grout", diameterMm: 400 }, getPileType("steel-screw-grout")!, 0);
    expect(row(r, "steelAxial").status).toBe("na");
    expect(r.ok).toBeNull();
  });
});

describe("hout: NEN-EN 1995-1-1", () => {
  const input: PileInput = { ...base, pileTypeId: "timber-uniform", diameterMm: 220, strengthCheck: { enabled: true } };
  it("toetst druk evenwijdig aan de vezel met de standaardwaarden", () => {
    const r = strengthCheck(input, getPileType("timber-uniform")!, 20);
    const t = row(r, "timberAxial");
    // C18: f_c,0,d = 0,50 · 18 / 1,3 = 6,923 MPa; A = π/4 · 220² = 38 013 mm²; σ = 120 000 / 38 013 = 3,157 MPa.
    expect(t.resistance!.v).toBeCloseTo(6.923, 3);
    expect(t.demand!.v).toBeCloseTo(3.157, 3);
    expect(t.uc).toBeCloseTo(3.157 / 6.923, 3);
    // Maatgevende snede: onderkant negatieve kleef, 4 m onder de kop.
    expect(t.zM).toBe(4);
  });
  it("neemt k_mod, γ_M en sterkteklasse of eigen waarde uit de invoer", () => {
    const r = strengthCheck({ ...input, strengthCheck: { enabled: true, timberClass: "C24", kMod: 0.6, gammaMTimber: 1.25 } }, getPileType("timber-uniform")!, 0);
    expect(row(r, "timberAxial").resistance!.v).toBeCloseTo(0.6 * 21 / 1.25, 6);
    expect(row(r, "timberAxial").zM).toBe(0);
    const own = strengthCheck({ ...input, strengthCheck: { enabled: true, timberFc0kMpa: 15 } }, getPileType("timber-uniform")!, 0);
    expect(row(own, "timberAxial").resistance!.v).toBeCloseTo(0.5 * 15 / 1.3, 6);
  });
  it("toetst een tapse paal op de doorsnede bij de onderkant van de negatieve kleef en geeft de punt ter informatie", () => {
    const taper: PileInput = { ...input, diameterMm: 300, timberTaper: { toeDiameterMm: 100, lengthM: 10 } };
    const r = strengthCheck(taper, getPileType("timber-uniform")!, 20);
    // D(-4) = 300 − 0,4 · 200 = 220 mm.
    expect(row(r, "timberAxial").steps.find((s) => s.s === "A")!.v).toBeCloseTo(Math.PI / 4 * 220 ** 2, 6);
    expect(row(r, "timberToe").status).toBe("info");
    expect(row(r, "timberToe").steps.find((s) => s.s === "A")!.v).toBeCloseTo(Math.PI / 4 * 100 ** 2, 6);
    expect(r.governing!.id).toBe("timberAxial");
  });
  it("rekent gezaagd hout met a · b en toetst ook de betonopzetter", () => {
    const sawn: PileInput = { ...input, pileTypeId: "timber-square", diameterMm: 150, sideBMm: 200, concreteExtension: { jointNap: -2, sizeMm: 250, isCircular: false } };
    const r = strengthCheck(sawn, getPileType("timber-square")!, 0);
    expect(row(r, "timberAxial").demand!.v).toBeCloseTo(100000 / 30000, 9);
    // Opzetter 250 × 250, C35/45: f_cd = 35/1,5 = 23,33 MPa; N_Rd = 62 500 · 23,33 = 1458 kN.
    expect(row(r, "extensionAxial").resistance!.v).toBeCloseTo(62500 * 23.33 / 1000, 6);
  });
});

describe("beton: NEN-EN 1992-1-1", () => {
  it("geeft N_Rd = A_c · f_cd van de schacht", () => {
    const input: PileInput = { ...base, pileTypeId: "concrete-prefab-prestressed-driven", diameterMm: 250, strengthCheck: { enabled: true, concreteClass: "C45/55" } };
    const r = strengthCheck(input, getPileType(input.pileTypeId)!, 30);
    expect(row(r, "concreteAxial").resistance!.v).toBeCloseTo(62500 * 30 / 1000, 6);
    expect(row(r, "concreteAxial").uc).toBeCloseTo(130 / 1875, 6);
    expect(r.notes.some((n) => n.key === "concreteInSitu")).toBe(false);
  });
  it("meldt bij een in de grond gevormde paal wat niet is toegepast", () => {
    const input: PileInput = { ...base, pileTypeId: "concrete-auger", diameterMm: 400, strengthCheck: { enabled: true } };
    const r = strengthCheck(input, getPileType("concrete-auger")!, 0);
    // Standaard C20/25: f_cd = 13,33 MPa.
    expect(row(r, "concreteAxial").resistance!.v).toBeCloseTo(Math.PI / 4 * 400 ** 2 * 13.33 / 1000, 6);
    expect(r.notes.some((n) => n.key === "concreteInSitu")).toBe(true);
  });
});

describe("aan- en uitvinken", () => {
  const input: PileInput = { ...base, pileTypeId: "timber-uniform", diameterMm: 220 };
  it("verandert niets als de toets uit staat", () => {
    const plain = computePile(input, cpt);
    expect(plain.ok).toBe(true);
    expect("strength" in plain).toBe(false);
    expect(computePile({ ...input, strengthCheck: { enabled: false, timberClass: "C24" } }, cpt)).toEqual(plain);
  });
  it("rekent met N_Ed + F_nk;d uit de draagvermogenberekening en laat de rest gelijk", () => {
    const plain = computePile(input, cpt);
    const { strength, ...rest } = computePile({ ...input, strengthCheck: { enabled: true } }, cpt);
    expect(rest).toEqual(plain);
    expect(strength!.nEdMaxKn).toBeCloseTo(100 + plain.negKleef.fnkD, 9);
    expect(strength!.standard).toContain("NEN-EN 1995-1-1");
  });
});
