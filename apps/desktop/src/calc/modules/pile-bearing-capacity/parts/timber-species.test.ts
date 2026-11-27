import { describe, expect, it } from "vitest";
import { computePile } from "../compute";
import { getPileType } from "../catalog";
import { pileSystemIdOf } from "../pile-systems";
import { TIMBER_CLASSES, strengthCheck } from "./strength-check";
import { TIMBER_SPECIES, resolveTimber } from "./timber-species";
import { pileParts } from "./physical-scene";
import { WOOD_GROUP_COLORS } from "./material-colors";
import type { PileInput } from "../types";
import type { Cpt } from "../../../../types/cpt";
import fixture from "../__fixtures__/sondering-3bm-cgeo1.json";

// Toewijzing volgens Centrum Hout, Houtwijzer Sterktegegevens van hout (2007),
// tabel "Relaties tussen visuele sorteringen en de sterkteklassen van houtsoorten".
// f_c,0,k per klasse: NEN-EN 338:2016 (C20 19, C22 20, C24 21, D50 30, D70 36 MPa).

const base: PileInput = {
  ...fixture.input as PileInput, pileTypeId: "timber-uniform", diameterMm: 220, pileTopNap: 0, pileToeNap: -10, excavationNap: 0, negKleefBottomNap: -4, posKleefTopNap: -4,
  nEd: 100, nEk: 80, ksMinFactor: .25, timberTaper: undefined, concreteExtension: undefined, baseDiameterMm: undefined, axialStiffnessKn: 100000,
  soilProfile: [{ kind: "sand-wet", startNap: 0, endNap: -10, gammaK: 20, gammaW: 10, phi: 0 }],
};
const cpt: Cpt = { id: "constant", metadata: { source_file: "synthetisch", ground_level_nap: 0 }, points: [{ depth: 0, qc: 5 }, { depth: 20, qc: 5 }] };
const axial = (r: ReturnType<typeof strengthCheck>) => r.rows.find((x) => x.id === "timberAxial")!;

describe("toewijzing houtsoort → sterkteklasse", () => {
  it.each([["vuren", "C24"], ["grenen", "C24"], ["lariks", "C24"], ["eiken", "C20"], ["azobe", "D70"], ["bangkirai", "D50"], ["basralocus", "C22"]])("%s → %s", (id, cls) => {
    expect(resolveTimber({ id })!.grade!.strengthClass).toBe(cls);
  });
  it("douglas heeft geen vaste klasse; onbekende soort geeft niets", () => {
    expect(resolveTimber({ id: "douglas" })!.grade).toBeNull();
    expect(resolveTimber({ id: "onbekend" })).toBeNull();
    expect(resolveTimber(undefined)).toBeNull();
  });
  it("valt bij een onbekende sorteerklasse terug op de eerste", () => {
    expect(resolveTimber({ id: "vuren", gradeId: "X" })!.grade!.id).toBe("AB");
  });
  it("elke toegewezen klasse staat in de klassentabel van de sterktetoets", () => {
    for (const s of TIMBER_SPECIES) for (const g of s.grades) expect(TIMBER_CLASSES.some((c) => c.id === g.strengthClass)).toBe(true);
  });
});

describe("doorwerking in de sterktetoets", () => {
  it("vuren A/B: C24, f_c,0,d = 0,50 · 21 / 1,3 = 8,08 MPa, ook als een andere klasse of eigen waarde is ingevuld", () => {
    const r = strengthCheck({ ...base, timberSpecies: { id: "vuren" }, strengthCheck: { enabled: true, timberClass: "C14", timberFc0kMpa: 10 } }, getPileType("timber-uniform")!, 0);
    expect(axial(r).steps.find((s) => s.s === "f_c,0,k")!.v).toBe(21);
    expect(axial(r).resistance!.v).toBeCloseTo(0.5 * 21 / 1.3, 9);
    const note = r.notes.find((n) => n.key === "timberSpecies")!;
    expect(note.vars).toMatchObject({ grade: "A/B (NEN 5466)", cls: "C24" });
    expect(String(note.vars!.source)).toContain("Houtwijzer");
    expect(r.notes.find((n) => n.key === "timber")!.vars!.cls).toBe("C24");
  });
  it("azobé op gezaagd hout 200 × 200: D70, f_c,0,d = 0,50 · 36 / 1,3 = 13,85 MPa", () => {
    const sawn: PileInput = { ...base, pileTypeId: "timber-square", diameterMm: 200, timberSpecies: { id: "azobe" }, strengthCheck: { enabled: true } };
    const r = strengthCheck(sawn, getPileType("timber-square")!, 0);
    expect(axial(r).resistance!.v).toBeCloseTo(0.5 * 36 / 1.3, 9);
    // σ = 100 kN / 40 000 mm² = 2,5 MPa.
    expect(axial(r).uc).toBeCloseTo(2.5 / (0.5 * 36 / 1.3), 9);
  });
  it("douglas: de gekozen klasse of eigen waarde blijft gelden, met een melding", () => {
    const r = strengthCheck({ ...base, timberSpecies: { id: "douglas" }, strengthCheck: { enabled: true, timberClass: "C18" } }, getPileType("timber-uniform")!, 0);
    expect(axial(r).resistance!.v).toBeCloseTo(0.5 * 18 / 1.3, 9);
    expect(r.notes.some((n) => n.key === "timberSpeciesOwn")).toBe(true);
    const own = strengthCheck({ ...base, timberSpecies: { id: "douglas" }, strengthCheck: { enabled: true, timberFc0kMpa: 15 } }, getPileType("timber-uniform")!, 0);
    expect(axial(own).resistance!.v).toBeCloseTo(0.5 * 15 / 1.3, 9);
  });
  it("zonder houtsoort blijft de toets gelijk aan eerder (standaard C18)", () => {
    const r = strengthCheck({ ...base, strengthCheck: { enabled: true } }, getPileType("timber-uniform")!, 0);
    expect(axial(r).resistance!.v).toBeCloseTo(0.5 * 18 / 1.3, 9);
    expect(r.notes.some((n) => n.key.startsWith("timberSpecies"))).toBe(false);
  });
});

describe("geen invloed op het draagvermogen", () => {
  it("geeft hetzelfde resultaat met en zonder houtsoort, behalve de sterktetoets", () => {
    for (const pileTypeId of ["timber-uniform", "timber-square"]) {
      const input: PileInput = { ...base, pileTypeId };
      const plain = computePile(input, cpt);
      expect(computePile({ ...input, timberSpecies: { id: "azobe" } }, cpt)).toEqual(plain);
      const { strength, ...rest } = computePile({ ...input, timberSpecies: { id: "azobe" }, strengthCheck: { enabled: true } }, cpt);
      const { strength: plainStrength, ...plainRest } = computePile({ ...input, strengthCheck: { enabled: true } }, cpt);
      expect(rest).toEqual(plainRest);
      expect(strength!.nEdMaxKn).toBe(plainStrength!.nEdMaxKn);
    }
  });
});

describe("kleur in de fysieke 3D", () => {
  const parts = (input: PileInput) => pileParts(input, getPileType(input.pileTypeId), pileSystemIdOf(input));
  it("kleurt het hout naar groep en laat het zonder houtsoort ongewijzigd", () => {
    expect(parts(base).every((p) => p.color === undefined)).toBe(true);
    const tropical = parts({ ...base, timberSpecies: { id: "azobe" } });
    expect(tropical.filter((p) => p.material === "wood").every((p) => p.color === WOOD_GROUP_COLORS.tropical)).toBe(true);
    expect(parts({ ...base, timberSpecies: { id: "vuren" } }).find((p) => p.material === "wood")!.color).toBe(WOOD_GROUP_COLORS.softwood);
  });
});
