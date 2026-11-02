import { describe, expect, it } from "vitest";
import { computePile } from "./compute";
import { resolvePileType } from "./catalog";
import { computeSummary } from "./parts/summary";
import fixture from "./__fixtures__/sondering-3bm-cgeo1.json";
import type { PileInput } from "./types";
import type { Cpt } from "../../../types/cpt";
import { computeNegKleef } from "./parts/negative-skin-friction";

const input = { ...fixture.input, pileTypeId: "concrete-prefab-prestressed-driven" } as PileInput;
const cpt: Cpt = { id: "uniform", metadata: { source_file: "synthetisch", ground_level_nap: 0 }, points: [{ depth: 0, qc: 5 }, { depth: 40, qc: 5 }] };

describe("historische normprofielen", () => {
  it.each(["nen-6743-1991", "nen-6743-2006", "nen-9997-2012"] as const)("gebruikt historische prefab-factoren voor %s", standard => {
    const pile = resolvePileType({ ...input, standard } as PileInput)!;
    expect(pile.alphaP).toBe(1);
    expect(pile.alphaS).toBe(.01);
  });
  it("reproduceert de veiligheidsstap van referentie 05290, pagina 32", () => {
    const result = computeSummary({ rbCalMax: 196.6, rsCalMax: 223.9, fnkD: 0, nEd: 250, gammaM: 1.25, standard: "nen-6743-1991" });
    expect(result.rcK).toBeCloseTo(315.375, 8);
    expect(result.rcD).toBeCloseTo(252.3, 8);
  });
  it("reproduceert de representatieve draagkracht van referentie 60700963, pagina 8", () => {
    const result = computeSummary({ rbCalMax: 728, rsCalMax: 124, fnkD: 0, nEd: 0, gammaM: 1.2, standard: "nen-6743-2006" });
    expect(result.rcK).toBeCloseTo(613.44, 8);
  });
  it("weigert een niet-bestaande norm in geïmporteerde invoer", () => {
    expect(computePile({ ...input, standard: "onbekend" } as unknown as PileInput, cpt).ok).toBe(false);
  });
  it("vermengt historische en moderne projectfactoren niet", () => {
    const result = computePile({ ...input, standard: "nen-6743-2006", projectFactors: { alphaP: .7, alphaS: .01, alphaT: 0, beta: 1, s: 1, source: "Verklaring", edition: "2025" } } as PileInput, cpt);
    expect(result.ok).toBe(false);
  });
  it("geeft geen ongeverifieerde historische zakking of veerwaarden", () => {
    const result = computePile({ ...input, standard: "nen-6743-2006" } as PileInput, cpt);
    expect(result.ok).toBe(true);
    expect(result.settlement.available).toBe(false);
    expect(result.settlement.curve).toEqual([]);
  });
  it("behoudt het bestaande model bij ontbrekende normkeuze", () => {
    expect(resolvePileType(input)?.alphaP).toBe(.7);
    const result = computePile(input, cpt);
    expect(result.summary.rcK).toBeCloseTo(result.summary.rcCal / 1.39, 8);
  });
  it("gebruikt voor in de grond gevormd beton de historische wandwrijvingshoek phi", () => {
    const result = computeNegKleef({ ...input, standard: "nen-6743-2006", pileTypeId: "concrete-driven-casing-hammered" });
    expect(result.layers[0].delta).toBeCloseTo(input.soilProfile[0].phi * Math.PI / 180, 10);
  });
  it("weigert onvolledige historische invloedszones", () => {
    expect(computePile({ ...input, standard: "nen-6743-2006" }, { ...cpt, points: [{ depth: 0, qc: 5 }, { depth: 14.2, qc: 5 }] }).error).toMatch(/4 Deq/);
  });
  it("weigert ontbrekende qc in de historische puntberekening", () => {
    expect(computePile({ ...input, standard: "nen-6743-2006" }, { ...cpt, points: [{ depth: 0 }, { depth: 40, qc: 5 }] }).ok).toBe(false);
  });
  it("weigert niet onderbouwde paaltypen in het referentieprofiel uit 1991", () => {
    expect(computePile({ ...input, standard: "nen-6743-1991", pileTypeId: "concrete-bored", axialStiffnessKn: 1000000 }, cpt).ok).toBe(false);
  });
});
