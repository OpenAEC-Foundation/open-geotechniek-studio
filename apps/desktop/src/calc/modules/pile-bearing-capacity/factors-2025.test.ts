import { describe, expect, it } from "vitest";
import { computePile } from "./compute";
import { PILE_TYPE_CATALOG, getPileType, resolvePileType } from "./catalog";
import { COMMON_TYPES_2025, FACTORS_2025, factors2025, table2025Complete, type FactorTable2025 } from "./factors-2025";
import { PILE_STANDARDS, applyStandard, applyTable2025, changeStandard, defaultStandard, getStandard } from "./standards";
import fixture from "./__fixtures__/sondering-3bm-cgeo1.json";
import type { PileInput } from "./types";
import type { Cpt } from "../../../types/cpt";

const base = { ...fixture.input, pileTypeId: "concrete-prefab-prestressed-driven", diameterMm: 290 } as PileInput;
const cpt = { id: "S", metadata: { source_file: "S.gef", ground_level_nap: 0 }, points: [{ depth: 0, qc: 8, rf: 1 }, { depth: 40, qc: 8, rf: 1 }] } as unknown as Cpt;
const row = { alphaP: 0.5, alphaS: 0.008, alphaT: 0.006, beta: 1, s: 1, settlementLine: 2 as const, source: "testtabel, rij 1" };

describe("paalfactoren per editie", () => {
  // Tabel 7.c van de editie 2017: αp, αs, αt en lastzakkingslijn per tabelrij.
  it.each([
    ["concrete-prefab-prestressed-driven", 0.7, 0.010, 0.007, 1],
    ["concrete-prefab-round", 0.7, 0.010, 0.007, 1],
    ["steel-pipe-driven-closed-2017", 0.7, 0.010, 0.007, 1],
    ["concrete-driven-casing-hammered", 0.7, 0.014, 0.012, 1],
    ["concrete-driven-casing-vibrated", 0.7, 0.012, 0.010, 1],
    ["concrete-screw-displacement", 0.63, 0.009, 0.009, 1],
    ["steel-screw-grout", 0.63, 0.009, 0.009, 1],
    ["steel-screw-permanent-casing", 0.56, 0.006, 0.0045, 1],
    ["concrete-auger", 0.56, 0.006, 0.0045, 2],
    ["concrete-bored", 0.35, 0.006, 0.0045, 3],
    ["timber-uniform", 0.7, 0.010, 0.007, 1],
  ] as const)("2017: %s", (id, alphaP, alphaS, alphaT, line) => {
    const type = applyStandard(getPileType(id)!, "nen-9997-2017")!;
    expect([type.alphaP, type.alphaS, type.alphaT, type.settlementLine ?? 1]).toEqual([alphaP, alphaS, alphaT, line]);
    expect(type.edition).toBe("2017");
    expect(type.factorsMissing).toBeFalsy();
  });

  it("2012 en 2006: de oorspronkelijke puntfactor", () => {
    const prefab = getPileType("concrete-prefab-prestressed-driven")!;
    expect(applyStandard(prefab, "nen-9997-2012")?.alphaP).toBe(1);
    expect(applyStandard(prefab, "nen-6743-2006")?.alphaP).toBe(1);
    expect(applyStandard(getPileType("concrete-auger")!, "nen-9997-2012")?.alphaP).toBe(0.8);
  });

  it("systemen zonder rij in de tabel van 2017 rekenen alleen met projectfactoren", () => {
    for (const id of ["concrete-screw-soil-displacing", "concrete-auger-cased"]) {
      const input = { ...base, pileTypeId: id, diameterMm: 400, axialStiffnessKn: 2_000_000 };
      const r = computePile(input, cpt);
      expect(r.ok).toBe(false);
      expect(r.errorCode).toBe("factorsMissing");
      const own = computePile({ ...input, projectFactors: { alphaP: 0.5, alphaS: 0.008, alphaT: 0.006, beta: 1, s: 1, source: "Zelfverklaring paalsysteem", edition: "2017" } }, cpt);
      expect(own.ok).toBe(true);
      // Geen lastzakkingslijn uit een tabel: geen zakking.
      expect(own.settlement.available).toBe(false);
    }
  });
});

describe("editie 2025", () => {
  it("is een keuze naast de bestaande edities", () => {
    expect(PILE_STANDARDS.map((s) => s.id)).toEqual(["nen-6743-1991", "nen-6743-2006", "nen-9997-2012", "nen-9997-2017", "nen-9997-2025"]);
    expect(getStandard("nen-9997-2025")?.edition).toBe("2025");
    // Ontbrekende normkeuze blijft het bestaande model van 2017.
    expect(getStandard(undefined)?.id).toBe("nen-9997-2017");
  });

  it("heeft voor elk paaltype een regel in de ene tabel", () => {
    for (const type of PILE_TYPE_CATALOG) {
      if (type.id === "steel-pipe-driven-closed") continue; // bestaand projectmodel, geen tabelrij
      expect(FACTORS_2025[type.id], type.id).toBeDefined();
    }
    for (const id of COMMON_TYPES_2025) expect(getPileType(id), id).toBeDefined();
  });

  it("neemt alleen volledige regels over; er wordt niets aangevuld uit 2017", () => {
    expect(factors2025("x", { x: row })).toEqual(row);
    for (const key of Object.keys(row) as Array<keyof typeof row>) {
      const partial = { ...row, [key]: undefined };
      expect(factors2025("x", { x: partial }), key).toBeUndefined();
    }
    expect(factors2025("x", { x: { ...row, alphaP: 0 } })).toBeUndefined();
    expect(factors2025("x", { x: { ...row, source: " " } })).toBeUndefined();
    expect(factors2025("y", { x: row })).toBeUndefined();
  });

  it("past een volledige regel toe en laat de 2 MPa-grens voor qc;III bij avegaar vervallen", () => {
    const auger = applyTable2025(getPileType("concrete-auger")!, { "concrete-auger": row });
    expect(auger).toEqual(expect.objectContaining({ alphaP: 0.5, alphaS: 0.008, alphaT: 0.006, settlementLine: 2, edition: "2025", factorsMissing: false }));
    expect(auger.qcIIIStartCapMpa).toBeUndefined();
    expect(auger.source).toContain("testtabel, rij 1");
    const missing = applyTable2025(getPileType("concrete-auger")!, {});
    expect(missing.factorsMissing).toBe(true);
    expect(missing.isCircular).toBe(true);
  });

  it("rekent niet met een paaltype waarvoor de tabel van 2025 geen volledige regel heeft", () => {
    for (const type of PILE_TYPE_CATALOG) {
      if (factors2025(type.id)) continue;
      const input = { ...base, pileTypeId: type.id, diameterMm: 400, axialStiffnessKn: 2_000_000, standard: "nen-9997-2025" as const };
      expect(resolvePileType(input)?.factorsMissing, type.id).toBe(true);
      const r = computePile(input, cpt);
      expect(r.ok, type.id).toBe(false);
      expect(r.errorCode, type.id).toBe("factorsMissing");
      expect(r.error).toMatch(/2025 nog niet in de tabel/);
    }
  });

  it("blijft rekenen met eigen projectfactoren van de editie 2025", () => {
    const projectFactors = { alphaP: 0.7, alphaS: 0.010, alphaT: 0.007, beta: 1, s: 1, source: "Zelfverklaring A1", edition: "2025" };
    const input = { ...base, standard: "nen-9997-2025" as const, projectFactors };
    const r = computePile(input, cpt);
    expect(r.ok).toBe(true);
    expect(resolvePileType(input)).toEqual(expect.objectContaining({ alphaP: 0.7, alphaS: 0.010, factorsMissing: false }));
    // Dezelfde factoren geven dezelfde draagkracht als de tabel van 2017 met die waarden.
    const r2017 = computePile({ ...base, standard: "nen-9997-2017" }, cpt);
    expect(r.base.rbCalMax).toBeCloseTo(r2017.base.rbCalMax, 10);
    expect(r.shaft.rsCalMax).toBeCloseTo(r2017.shaft.rsCalMax, 10);
    // Zonder lastzakkingslijn uit de tabel wordt geen zakking bepaald.
    expect(r.settlement.available).toBe(false);
    // Projectfactoren van een andere editie passen niet bij de norm van 2025.
    expect(computePile({ ...input, projectFactors: { ...projectFactors, edition: "2017" } }, cpt).ok).toBe(false);
  });

  it("wist projectfactoren bij de wissel naar 2025, zoals bij elke normwissel", () => {
    const next = changeStandard({ ...base, projectFactors: { alphaP: 1, alphaS: 0.01, alphaT: 0, beta: 1, s: 1, source: "x", edition: "2017" } }, "nen-9997-2025");
    expect(next).toEqual(expect.objectContaining({ standard: "nen-9997-2025", projectFactors: undefined, pileTypeId: base.pileTypeId }));
  });

  it("wordt pas de standaard als de tabel voor de gangbare typen volledig is", () => {
    const complete: FactorTable2025 = Object.fromEntries(COMMON_TYPES_2025.map((id) => [id, row]));
    expect(table2025Complete(complete)).toBe(true);
    expect(table2025Complete({ ...complete, "concrete-bored": {} })).toBe(false);
    expect(defaultStandard(true)).toBe("nen-9997-2025");
    expect(defaultStandard(false)).toBe("nen-9997-2017");
    // De huidige tabel bepaalt de standaard voor nieuwe berekeningen.
    expect(defaultStandard()).toBe(table2025Complete() ? "nen-9997-2025" : "nen-9997-2017");
  });
});
