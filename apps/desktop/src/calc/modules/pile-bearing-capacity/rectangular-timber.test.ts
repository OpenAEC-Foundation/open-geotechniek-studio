import { describe, expect, it } from "vitest";
import { computePile } from "./compute";
import { pileGeometry } from "./parts/geometry";
import { applyPileSystem, pileSystemIdOf, switchPileType } from "./pile-systems";
import { seriesFor } from "./standard-sizes";
import { sizeInput } from "./capacity-table";
import { parseRectList } from "./ui/SettingsPanel";
import type { PileInput } from "./types";
import type { Cpt } from "../../../types/cpt";
import fixture from "./__fixtures__/sondering-3bm-cgeo1.json";

// Zelfde opzet als timber-taper.test.ts: constante qc = 5 MPa, één zandlaag, φ = 0 zodat K0·tanδ op het minimum 0,25 staat.
const base: PileInput = {
  ...fixture.input as PileInput, pileTypeId: "timber-square", diameterMm: 150, sideBMm: 200,
  pileTopNap: 0, pileToeNap: -10, excavationNap: 0, negKleefBottomNap: -4, posKleefTopNap: -4,
  axialStiffnessKn: 100000, ksMinFactor: .25, timberTaper: undefined, concreteExtension: undefined, baseDiameterMm: undefined,
  soilProfile: [{ kind: "sand-wet", startNap: 0, endNap: -10, gammaK: 20, gammaW: 10, phi: 0 }],
};
const cpt: Cpt = { id: "constant", metadata: { source_file: "synthetisch", ground_level_nap: 0 }, points: [{ depth: 0, qc: 5 }, { depth: 20, qc: 5 }] };

describe("doorsnedegrootheden van een rechthoek a × b", () => {
  it("geeft oppervlak a·b, omtrek 2(a+b) en de cirkel met gelijk oppervlak als Deq", () => {
    const g = pileGeometry(150, false, 200);
    expect(g.areaMm2).toBe(30000);
    expect(g.perimeterM).toBeCloseTo(0.7, 12);
    // √(4·30000/π) = 195,44 mm = 1,13·a·√(b/a)
    expect(g.equivalentDiameterMm).toBeCloseTo(195.441, 3);
    expect(g.equivalentDiameterMm).toBeCloseTo(2 / Math.sqrt(Math.PI) * 150 * Math.sqrt(200 / 150), 9);
  });
  it("valt voor a = b samen met het vierkant, en laat rond en vierkant zonder b ongemoeid", () => {
    expect(pileGeometry(200, false, 200)).toEqual(pileGeometry(200, false));
    expect(pileGeometry(200, false)).toEqual({ areaMm2: 40000, perimeterM: 0.8, equivalentDiameterMm: Math.sqrt(160000 / Math.PI) });
    // Bij een ronde paal doet een tweede zijde niets.
    expect(pileGeometry(220, true, 300)).toEqual(pileGeometry(220, true));
    expect(pileGeometry(220, true).areaMm2).toBe(Math.PI / 4 * 220 ** 2);
  });
});

describe("gezaagde houten paal a × b in de berekening", () => {
  const r = computePile(base, cpt);
  it("rekent kleef, schacht en punt met de rechthoek", () => {
    expect(r.ok).toBe(true);
    // Negatieve kleef 0 tot -4 m: ∫σ'v dz = 10·4²/2 = 80 kPa·m; O = 0,7 m; K0·tanδ = 0,25.
    expect(r.negKleef.fnkRep).toBeCloseTo(0.7 * 0.25 * 80, 9);
    // Positieve kleef -4 tot -10 m: O · αs · qc · h = 0,7 · 0,010 · 5 MPa · 6 m.
    expect(r.shaft.rsCalMax).toBeCloseTo(0.7 * 0.01 * 5 * 6 * 1000, 6);
    // Punt: qb = ½ · 0,7 · (5 + 5)/2 + 5) = 3,5 MPa op A = 30 000 mm².
    expect(r.base.abMm2).toBe(30000);
    expect(r.base.deqMm).toBeCloseTo(195.441, 3);
    expect(r.base.rbCalMax).toBeCloseTo(30000 * 3.5 / 1000, 6);
  });
  it("meldt dat de vormfactor s voor a ≠ b niet is bepaald", () => {
    expect(r.warnings.some((w) => w.includes("150 × 200") && w.includes("s = 1,00"))).toBe(true);
    const square = computePile({ ...base, sideBMm: undefined }, cpt);
    expect(square.warnings.some((w) => w.includes("Rechthoekige doorsnede"))).toBe(false);
    expect(square.base.abMm2).toBe(22500);
    expect(square.shaft.rsCalMax).toBeCloseTo(0.6 * 0.01 * 5 * 6 * 1000, 6);
  });
  it("geeft met b = a dezelfde uitkomst als het vierkant", () => {
    const { warnings: _w1, ...explicit } = computePile({ ...base, sideBMm: 150 }, cpt);
    const { warnings: _w2, ...square } = computePile({ ...base, sideBMm: undefined }, cpt);
    expect(explicit).toEqual(square);
  });
  it("weigert een tweede zijde bij een ronde paal, bij tapsheid en bij een ongeldige maat", () => {
    expect(computePile({ ...base, pileTypeId: "timber-uniform" }, cpt).ok).toBe(false);
    expect(computePile({ ...base, sideBMm: -5 }, cpt).ok).toBe(false);
    expect(computePile({ ...base, pileTypeId: "concrete-prefab-prestressed-driven" }, cpt).ok).toBe(false);
  });
  it("rekent met een betonopzetter boven de las met de omtrek van de opzetter", () => {
    const ext = computePile({ ...base, concreteExtension: { jointNap: -2, sizeMm: 250, isCircular: false } }, cpt);
    expect(ext.ok).toBe(true);
    // Eén laag van 0 tot -4 m: de module rekent met de gemiddelde omtrek binnen de laag,
    // (1,0 · 2 + 0,7 · 2) / 4 = 0,85 m, en ∫σ'v dz = 80 kPa·m.
    expect(ext.negKleef.fnkRep).toBeCloseTo(0.85 * 0.25 * 80, 9);
  });
});

describe("ronde houten paal blijft zoals hij was", () => {
  const round: PileInput = { ...base, pileTypeId: "timber-uniform", diameterMm: 300, sideBMm: undefined, timberTaper: { toeDiameterMm: 100, lengthM: 10 } };
  it("houdt de uitkomsten van de tapse ronde paal", () => {
    const r = computePile(round, cpt);
    expect(r.ok).toBe(true);
    // Dezelfde narekenwaarden als in timber-taper.test.ts.
    expect(r.negKleef.fnkRep).toBeCloseTo(Math.PI * .26 * .25 * 80, 10);
    expect(r.base.abMm2).toBeCloseTo(Math.PI / 4 * 100 ** 2);
    expect(r.shaft.rsCalMax).toBeCloseTo(Math.PI * .16 * 6 * .01 * 5 * 1000);
    expect(r.strength).toBeUndefined();
  });
});

describe("keuze rond of gezaagd", () => {
  const round: PileInput = { ...base, pileTypeId: "timber-uniform", diameterMm: 220, sideBMm: undefined, concreteExtension: { jointNap: -2, sizeMm: 280, isCircular: true } };
  it("hoort bij de houten paalsystemen en houdt de opzetter bij de wissel", () => {
    const sawn = switchPileType(round, "timber-square", true);
    expect(sawn.pileTypeId).toBe("timber-square");
    expect(sawn.concreteExtension).toEqual(round.concreteExtension);
    expect(sawn.timberTaper).toBeUndefined();
    expect(sawn.sideBMm).toBeUndefined();
    expect(pileSystemIdOf(sawn)).toBe("timber-extension");
    // Opzetter eraf: het blijft gezaagd hout.
    const plain = applyPileSystem(sawn, "timber");
    expect(plain.pileTypeId).toBe("timber-square");
    expect(plain.concreteExtension).toBeUndefined();
    expect(pileSystemIdOf(plain)).toBe("timber");
  });
  it("kiest een nieuw houten systeem zoals voorheen als ronde paal", () => {
    const steel: PileInput = { ...base, pileTypeId: "steel-pipe-driven-closed-2017", sideBMm: undefined };
    expect(applyPileSystem(steel, "timber").pileTypeId).toBe("timber-uniform");
  });
  it("biedt een reeks a × b die in de instellingen aan te vullen is", () => {
    expect(seriesFor("timber-square").rect).toContainEqual([150, 200]);
    const own = seriesFor("timber-square", { rectSizesMm: [[160, 160], [160, 240]] });
    expect(own.rect).toEqual([[160, 160], [160, 240]]);
    expect(own.sizes).toEqual([160]);
    expect(parseRectList("200x150 180 150×150; 120*240 fout")).toEqual([[150, 150], [180, 180], [120, 240], [150, 200]]);
  });
  it("neemt in de draagvermogentabel een andere maat als vierkant", () => {
    expect(sizeInput(base, 150)).toBe(base);
    expect(sizeInput(base, 200).sideBMm).toBeUndefined();
  });
});
