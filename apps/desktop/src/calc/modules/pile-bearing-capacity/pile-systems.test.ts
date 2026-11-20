import { describe, expect, it } from "vitest";
import { computePile } from "./compute";
import { computeNegKleef } from "./parts/negative-skin-friction";
import { shaftPerimeterAtNap } from "./parts/geometry";
import { PILE_TYPE_CATALOG, getPileType } from "./catalog";
import { PILE_SYSTEMS, applyPileSystem, pileSystemIdOf, type PileSystemId } from "./pile-systems";
import fixture from "./__fixtures__/sondering-3bm-cgeo1.json";
import type { PileInput } from "./types";
import type { Cpt } from "../../../types/cpt";

// Paalkop NAP −0,5, paalpunt NAP −14, grondwater NAP −2,5, kleefzone tot NAP −8.
const base = fixture.input as PileInput;
const cpt = { id: "S", metadata: { source_file: "S.gef", ground_level_nap: 0 }, points: [{ depth: 0, qc: 8, rf: 1 }, { depth: 40, qc: 8, rf: 1 }] } as unknown as Cpt;
const circular = (input: PileInput) => getPileType(input.pileTypeId)!.isCircular;
const at = (input: PileInput, nap: number) => shaftPerimeterAtNap(input, circular(input), nap);

describe("paalsystemen", () => {
  it("biedt de systemen die een constructeur kiest, elk met bestaande tabelrijen", () => {
    expect(PILE_SYSTEMS.map((s) => s.id)).toEqual([
      "prefab-concrete", "steel-tube-closed", "screw-injection", "screw-permanent-casing", "screw-lost-tip",
      "screw-soil-displacing", "vibro", "auger", "auger-cased", "bored", "timber", "timber-extension",
    ]);
    for (const s of PILE_SYSTEMS) for (const id of s.typeIds) expect(getPileType(id), id).toBeDefined();
    // Elke tabelrij uit de catalogus hoort bij een systeem.
    for (const type of PILE_TYPE_CATALOG) expect(pileSystemIdOf({ pileTypeId: type.id }), type.id).toBeDefined();
  });

  describe("omtrek per niveau", () => {
    const constant: Array<[PileSystemId, number]> = [
      ["prefab-concrete", 4], ["steel-tube-closed", Math.PI], ["screw-injection", Math.PI], ["screw-permanent-casing", Math.PI],
      ["screw-lost-tip", Math.PI], ["screw-soil-displacing", Math.PI], ["vibro", Math.PI], ["auger", Math.PI],
      ["auger-cased", Math.PI], ["bored", Math.PI],
    ];
    it.each(constant)("%s: over de hele lengte dezelfde omtrek", (systemId, shape) => {
      const input = { ...applyPileSystem({ ...base, pileTypeId: "onbekend" }, systemId), diameterMm: 400 };
      expect(pileSystemIdOf(input)).toBe(systemId);
      for (const nap of [input.pileTopNap, -3, -8, input.pileToeNap]) expect(at(input, nap)).toBeCloseTo(shape * 0.4, 12);
    });

    it("prefab betonpaal: vierkant, omtrek 4 × de zijde", () => {
      const input = { ...applyPileSystem(base, "prefab-concrete"), diameterMm: 290 };
      expect(input.pileTypeId).toBe("concrete-prefab-prestressed-driven");
      expect(at(input, -5)).toBeCloseTo(1.16, 12);
    });

    it("een bredere voet verandert de schachtomtrek niet", () => {
      const input = { ...applyPileSystem(base, "screw-permanent-casing"), diameterMm: 323.9, baseDiameterMm: 450 };
      expect(at(input, input.pileToeNap)).toBeCloseTo(Math.PI * 0.3239, 12);
    });

    it("houten paal: taps van kop naar punt", () => {
      const input = applyPileSystem(base, "timber");
      expect(input.concreteExtension).toBeUndefined();
      expect(input.timberTaper).toEqual({ toeDiameterMm: 150, lengthM: 13.5 });
      expect(input.diameterMm).toBe(220);
      expect(at(input, -0.5)).toBeCloseTo(Math.PI * 0.22, 12);
      // Halverwege: (220 + 150) / 2 = 185 mm.
      expect(at(input, -7.25)).toBeCloseTo(Math.PI * 0.185, 12);
      expect(at(input, -14)).toBeCloseTo(Math.PI * 0.15, 12);
    });

    it("houten paal met betonopzetter: boven de las de opzetter, eronder het tapse hout", () => {
      const start = applyPileSystem(base, "timber-extension");
      // Kortste opzetter met de las minstens 0,5 m onder grondwater (NAP −2,5): 2,5 m.
      expect(start.concreteExtension).toEqual({ jointNap: -3, sizeMm: 280, isCircular: true });
      const input: PileInput = { ...start, concreteExtension: { jointNap: -3, sizeMm: 320, isCircular: false } };
      expect(at(input, -0.5)).toBeCloseTo(4 * 0.32, 12);
      expect(at(input, -2.99)).toBeCloseTo(4 * 0.32, 12);
      expect(at(input, -3)).toBeCloseTo(Math.PI * 0.22, 12);        // op de las begint het hout
      expect(at(input, -8.5)).toBeCloseTo(Math.PI * 0.185, 12);      // halverwege het hout
      expect(at(input, -14)).toBeCloseTo(Math.PI * 0.15, 12);
    });
  });

  describe("negatieve kleef met en zonder opzetter", () => {
    // Hout Ø220 zonder tapsheid; opzetter 320 × 320 tot de las op NAP −2,5,
    // precies op de grens van de eerste grondlaag.
    const wood: PileInput = { ...base, pileTypeId: "timber-uniform", diameterMm: 220, timberTaper: undefined, concreteExtension: undefined };
    const withExt: PileInput = { ...wood, concreteExtension: { jointNap: -2.5, sizeMm: 320, isCircular: false } };
    const oWood = Math.PI * 0.22, oExt = 4 * 0.32;

    it("rekent elke laag met de omtrek van die laag", () => {
      const r = computeNegKleef(withExt);
      expect(r.layers.map((l) => l.perimeterM!)).toEqual([oExt, oWood, oWood, oWood].map((v) => expect.closeTo(v, 12)));
      for (const l of r.layers) expect(l.fsNkRep).toBeCloseTo(l.sigmaGemRep * l.perimeterM! * l.k0TanDelta, 10);
      expect(computeNegKleef(wood).layers.every((l) => Math.abs(l.perimeterM! - oWood) < 1e-12)).toBe(true);
    });

    it("het verschil is precies het omtrekverschil in de lagen naast de opzetter", () => {
      const a = computeNegKleef(wood), b = computeNegKleef(withExt);
      const top = a.layers[0];
      expect(b.fnkRep - a.fnkRep).toBeCloseTo(top.sigmaGemRep * top.k0TanDelta * (oExt - oWood), 10);
      // Onder de las verandert er niets.
      for (let i = 1; i < a.layers.length; i++) expect(b.layers[i].fsNkRep).toBeCloseTo(a.layers[i].fsNkRep, 12);
      // De verhouding in de bovenste laag is de verhouding van de omtrekken.
      expect(b.layers[0].fsNkRep / a.layers[0].fsNkRep).toBeCloseTo(oExt / oWood, 12);
    });

    it("middelt de omtrek naar lengte in een laag waar de las doorheen loopt", () => {
      // Las op NAP −1,5: 1 m opzetter en 1 m hout in de eerste laag (NAP −0,5 tot −2,5).
      const r = computeNegKleef({ ...withExt, concreteExtension: { jointNap: -1.5, sizeMm: 320, isCircular: false } });
      expect(r.layers[0].perimeterM).toBeCloseTo((oExt + oWood) / 2, 12);
      expect(r.layers[1].perimeterM).toBeCloseTo(oWood, 12);
    });

    it("smeert de brede opzetter niet uit over de diepere lagen", () => {
      // Het gemiddelde over de hele kleefzone zou de opzetter ook laten tellen
      // waar de korrelspanning hoog is; per laag is de kleef kleiner.
      const r = computeNegKleef(withExt);
      const smeared = r.layers.reduce((s, l) => s + l.sigmaGemRep * l.k0TanDelta, 0) * r.meanPerimeterM!;
      expect(r.meanPerimeterM).toBeCloseTo((2 * oExt + 5.5 * oWood) / 7.5, 12);
      expect(r.fnkRep).toBeLessThan(smeared);
    });

    it("geeft de omtrek per laag door in de volledige berekening", () => {
      const r = computePile(withExt, cpt);
      expect(r.ok).toBe(true);
      expect(r.negKleef.layers[0].perimeterM).toBeCloseTo(oExt, 12);
      expect(r.shaft.perLayer.every((l) => Math.abs(l.perimeterM! - oWood) < 1e-12)).toBe(true);
    });
  });

  describe("bestaande invoer", () => {
    // De pileTypeId-waarden die opgeslagen projecten kunnen bevatten.
    const legacy: Array<[string, PileSystemId]> = [
      ["steel-pipe-driven-closed", "steel-tube-closed"],
      ["steel-pipe-driven-closed-2017", "steel-tube-closed"],
      ["concrete-prefab-prestressed-driven", "prefab-concrete"],
      ["concrete-prefab-round", "prefab-concrete"],
      ["concrete-driven-casing-hammered", "vibro"],
      ["concrete-driven-casing-vibrated", "vibro"],
      ["concrete-screw-displacement", "screw-lost-tip"],
      ["steel-screw-grout", "screw-injection"],
      ["concrete-auger", "auger"],
      ["concrete-bored", "bored"],
      ["timber-uniform", "timber"],
    ];
    it.each(legacy)("vertaalt %s naar paalsysteem %s en laat de invoer ongemoeid", (pileTypeId, systemId) => {
      const input: PileInput = { ...base, pileTypeId, diameterMm: 400, axialStiffnessKn: 2_000_000 };
      expect(pileSystemIdOf(input)).toBe(systemId);
      // Het eigen systeem opnieuw kiezen verandert niets aan de opgeslagen invoer.
      expect(applyPileSystem(input, systemId, pileTypeId)).toEqual(input);
      // Constante doorsnede: de kleef is als vanouds één omtrek × Σ(σ·h·K0·tanδ).
      const r = computePile(input, cpt);
      expect(r.ok).toBe(true);
      const os = (getPileType(pileTypeId)!.isCircular ? Math.PI : 4) * 0.4;
      expect(r.negKleef.meanPerimeterM).toBeCloseTo(os, 12);
      for (const l of r.negKleef.layers) expect(l.perimeterM).toBe(r.negKleef.meanPerimeterM);
      expect(r.negKleef.fnkRep).toBe(r.negKleef.layers.reduce((s, l) => s + l.sigmaGemRep * r.negKleef.meanPerimeterM! * l.k0TanDelta, 0));
    });

    it("herkent hout met een opgeslagen betonopzetter als het systeem met opzetter", () => {
      const stored = { pileTypeId: "timber-uniform", concreteExtension: { jointNap: -3, sizeMm: 250, isCircular: false } };
      expect(pileSystemIdOf(stored)).toBe("timber-extension");
    });

    it("houdt het bestaande referentiegeval op dezelfde uitkomst", () => {
      const r = computeNegKleef(base);
      expect(r.fnkD).toBeCloseTo(fixture.expected.fnkD, 0);
      expect(r.layers.every((l) => l.perimeterM === r.meanPerimeterM)).toBe(true);
      expect(r.meanPerimeterM).toBeCloseTo(Math.PI * 0.168, 12);
    });

    it("laat een onbekend paaltype met rust", () => {
      expect(pileSystemIdOf({ pileTypeId: "eigen-type" })).toBeUndefined();
    });

    it("wisselt tussen hout met en zonder opzetter zonder de houtmaten te verliezen", () => {
      const tapered: PileInput = { ...base, pileTypeId: "timber-uniform", diameterMm: 240, timberTaper: { toeDiameterMm: 160, lengthM: 13.5 } };
      const withExt = applyPileSystem(tapered, "timber-extension");
      expect(withExt.diameterMm).toBe(240);
      expect(withExt.timberTaper).toEqual({ toeDiameterMm: 160, lengthM: 11 });
      const back = applyPileSystem(withExt, "timber");
      expect(back.concreteExtension).toBeUndefined();
      expect(back.diameterMm).toBe(240);
    });
  });
});
