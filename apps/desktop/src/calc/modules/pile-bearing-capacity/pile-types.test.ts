import { describe, expect, it } from "vitest";
import { computePile } from "./compute";
import { getPileType, resolvePileType } from "./catalog";
import fixture from "./__fixtures__/sondering-3bm-cgeo1.json";
import type { PileInput } from "./types";
import type { Cpt } from "../../../types/cpt";
const input = fixture.input as PileInput;
const cpt: Cpt = { id: "uniform", metadata: { source_file: "synthetisch", ground_level_nap: 0 }, points: [{depth:0,qc:5},{depth:30,qc:5}] };
describe("paalsoorten en onafhankelijke paalgeometrie", () => {
  it("vergroot alleen de puntkracht bij een grotere voet, niet de schacht of EA", () => {
    const a = computePile(input, cpt);
    const b = computePile({...input, baseDiameterMm: input.diameterMm * 1.2}, cpt);
    expect(b.ok).toBe(true);
    expect(b.base.rbCalMax / a.base.rbCalMax).toBeCloseTo(1.44);
    expect(b.shaft.rsCalMax).toBeCloseTo(a.shaft.rsCalMax);
    expect(b.negKleef.fnkD).toBeCloseTo(a.negKleef.fnkD);
    expect(b.settlement.eaKn).toBe(a.settlement.eaKn);
  });
  it.each([0,-1,NaN,Infinity])("weigert ongeldige voetmaat %s", baseDiameterMm => {
    expect(computePile({...input,baseDiameterMm},cpt).ok).toBe(false);
  });
  it("past expliciete projectfactoren toe zonder de catalogus te muteren", () => {
    const projectFactors = {alphaP:.35,alphaS:.006,alphaT:0,beta:.9,s:1,source:"Projectverklaring 42",edition:"2025"};
    const p = {...input,projectFactors};
    expect(resolvePileType(p)?.alphaP).toBe(.35);
    const r = computePile(p,cpt);
    const old = computePile(input,cpt);
    expect(r.base.rbCalMax / old.base.rbCalMax).toBeCloseTo(.45);
    expect(getPileType(input.pileTypeId)?.alphaP).toBe(.7);
  });
  it("vereist een bron bij projectfactoren", () => {
    expect(computePile({...input,projectFactors:{alphaP:.35,alphaS:.006,alphaT:0,beta:1,s:1,source:"",edition:"2025"}},cpt).ok).toBe(false);
  });
  it("gebruikt opgegeven EA voor een in de grond gevormde paal", () => {
    const r=computePile({...input,pileTypeId:"concrete-bored",axialStiffnessKn:2_000_000,projectFactors:{alphaP:.35,alphaS:.006,alphaT:0,beta:1,s:1,source:"Projectverklaring",edition:"2025"}},cpt);
    expect(r.ok).toBe(true);
    expect(r.settlement.eaKn).toBe(2_000_000);
  });
});

// Bron: lokale NEN 9997-1:2016+C2:2017, tabel 7.c en art. 7.6.2.3(e).
describe("normgebonden varianten", () => {
  it.each([
    ["concrete-prefab-round", .7, .010],
    ["steel-pipe-driven-closed-2017", .7, .010],
    ["concrete-driven-casing-hammered", .7, .014],
    ["concrete-driven-casing-vibrated", .7, .012],
    ["concrete-screw-displacement", .63, .009],
    ["steel-screw-grout", .63, .009],
    ["concrete-bored", .35, .006],
    ["timber-uniform", .7, .010],
  ] as const)("berekent %s met de bijbehorende factoren", (pileTypeId, ap, as) => {
    const r=computePile({...input,pileTypeId,diameterMm:400,axialStiffnessKn:2_000_000,soilProfile:[{kind:"sand-wet",startNap:input.negKleefBottomNap,endNap:input.pileToeNap,gammaK:20,gammaW:10,phi:30}]},cpt);
    expect(r.ok).toBe(true);
    expect(r.base.qbMaxMpa).toBeCloseTo(ap*5);
    expect(r.shaft.rsCalMax).toBeCloseTo(Math.PI*.4*(input.negKleefBottomNap-input.pileToeNap)*as*5*1000);
  });
  it("begrenst qc;III voor de avegaarvariant uit 2017", () => {
    const r=computePile({...input,pileTypeId:"concrete-auger",axialStiffnessKn:2_000_000},cpt);
    expect(r.base.qcIIIGemMpa).toBeCloseTo(2);
    expect(r.base.qbMaxMpa).toBeCloseTo(.5*.56*(5+2));
    expect(r.settlement.available).toBe(false);
    expect(r.settlement.curve).toEqual([]);
  });
  it("toont geen heipaalzettingen voor boorpalen", () => {
    const r=computePile({...input,pileTypeId:"concrete-bored",axialStiffnessKn:2_000_000},cpt);
    expect(r.settlement.available).toBe(false);
    expect(r.warnings.join(' ')).toContain("Lastzakkingslijn 3");
  });
  it("weigert een ontbrekende stijfheid bij in de grond gevormde palen", () => {
    expect(computePile({...input,pileTypeId:"concrete-driven-casing-hammered"},cpt).error).toContain("EA");
  });
  it.each([0,-1,NaN,Infinity])("weigert ongeldige EA %s", axialStiffnessKn => {
    expect(computePile({...input,axialStiffnessKn},cpt).ok).toBe(false);
  });
});

describe("toepassingsgrenzen catalogus",()=>{
 it("weigert een te grote voetplaat voor de gesloten buispaal uit tabel 2017",()=>{
  expect(computePile({...input,pileTypeId:"steel-pipe-driven-closed-2017",baseDiameterMm:input.diameterMm+21},cpt).ok).toBe(false);
 });
 it("weigert de groutschroefpreset beneden 300 mm",()=>{
  expect(computePile({...input,pileTypeId:"steel-screw-grout",diameterMm:299,axialStiffnessKn:1000000},cpt).ok).toBe(false);
 });
 it("weigert een afwijkende voetmaat voor hout met constante doorsnede",()=>{
  expect(computePile({...input,pileTypeId:"timber-uniform",baseDiameterMm:140,axialStiffnessKn:1000000},cpt).ok).toBe(false);
 });
});
