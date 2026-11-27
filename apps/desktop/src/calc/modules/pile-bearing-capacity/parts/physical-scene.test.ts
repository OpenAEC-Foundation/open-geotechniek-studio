import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildPhysicalScene, cptBlockLayers, partRadius, pileParts, type PhysicalPart } from "./physical-scene";
import { analyzeLayers } from "../../../../utils/layerAnalysis";
import { buildPhysicalObjects } from "../ui/physical-three";
import { disposeObjects } from "../ui/koppejan-three";
import { getPileType } from "../catalog";
import { pileSystemIdOf } from "../pile-systems";
import fixture from "../__fixtures__/sondering-3bm-cgeo1.json";
import type { PileInput } from "../types";
import type { Cpt } from "../../../../types/cpt";

// Gelaagde sondering (maaiveld NAP 0, tot 20 m): klei, veen, zand en vast zand volgens de
// qc/Rf-indeling van de grondopbouw (zones 3, 2, 6 en 7).
const zoneAt = (d: number) => (d < 1 ? { qc: 1, rf: 2 } : d < 4 ? { qc: 0.4, rf: 3 } : d < 12 ? { qc: 15, rf: 1 } : { qc: 30, rf: 0.5 });
const cpt: Cpt = { id: "S1", metadata: { source_file: "test", ground_level_nap: 0 }, points: Array.from({ length: 201 }, (_, i) => ({ depth: i / 10, ...zoneAt(i / 10) })) };
const base: PileInput = {
  ...fixture.input as PileInput, cptId: cpt.id, pileTopNap: -0.5, pileToeNap: -12, excavationNap: -1, waterNap: -1.5,
  negKleefBottomNap: -6, posKleefTopNap: -6, timberTaper: undefined, concreteExtension: undefined, baseDiameterMm: undefined, sideBMm: undefined,
  soilProfile: [
    { kind: "clay", startNap: 0, endNap: -1.5, gammaK: 18, gammaW: 0, phi: 22.5 },
    { kind: "clay", startNap: -1.5, endNap: -4, gammaK: 18, gammaW: 10, phi: 22.5 },
    { kind: "peat", startNap: -4, endNap: -6, gammaK: 13, gammaW: 10, phi: 15 },
    { kind: "sand-wet", startNap: -6, endNap: -12, gammaK: 20, gammaW: 10, phi: 32.5 },
  ],
};
const scene = (input: PileInput) => buildPhysicalScene(input, cpt, getPileType(input.pileTypeId))!;
const part = (parts: PhysicalPart[], id: string) => parts.find((p) => p.id === id)!;

describe("paal per paalsysteem", () => {
  it("prefab: vierkante schacht met afgeschuinde punt en stekken", () => {
    const s = scene({ ...base, pileTypeId: "concrete-prefab-prestressed-driven", diameterMm: 250 });
    expect(s.systemId).toBe("prefab-concrete");
    const shaft = part(s.pile.parts, "shaft").shape, tip = part(s.pile.parts, "tip");
    expect(shaft).toMatchObject({ kind: "rect", topNap: -0.5, topAM: 0.25, topBM: 0.25, bottomAM: 0.25 });
    // De punt eindigt op het paalpuntniveau; de vorm is schematisch, de maat van de schacht niet.
    expect(tip.shape).toMatchObject({ kind: "rect", bottomNap: -12, topAM: 0.25, bottomAM: 0.125 });
    expect(tip.schematic).toBe(true);
    expect(tip.shape.topNap).toBeCloseTo(-12 + 0.15, 9);
    expect(shaft.bottomNap).toBe(tip.shape.topNap);
    const rebar = part(s.pile.parts, "rebar");
    expect(rebar.material).toBe("steel");
    expect(rebar.shape.kind === "bars" && rebar.shape.positions).toHaveLength(4);
    expect(s.pile.parts.every((p) => p.material !== "wood")).toBe(true);
  });
  it("stalen buis: wanddikte en voetplaat op maat", () => {
    const s = scene({ ...base, pileTypeId: "steel-pipe-driven-closed-2017", diameterMm: 219.1, wallThicknessMm: 8, baseDiameterMm: 235 });
    expect(part(s.pile.parts, "shaft")).toMatchObject({ material: "steel", shape: { kind: "round", topDiameterM: 0.2191, wallM: 0.008, topNap: -0.5 } });
    const plate = part(s.pile.parts, "footplate").shape;
    expect(plate).toMatchObject({ kind: "round", bottomNap: -12, topDiameterM: 0.235 });
    expect(plate.topNap - plate.bottomNap).toBeCloseTo(0.025, 9);
    expect(s.pile.maxRadiusM).toBeCloseTo(0.1175, 9);
    expect(part(s.pile.parts, "shaft").schematic).toBeUndefined();
  });
  it("hout met opzetter: beton tot de las, daaronder taps hout met een lasring", () => {
    const input: PileInput = { ...base, pileTypeId: "timber-uniform", diameterMm: 220, concreteExtension: { jointNap: -2.5, sizeMm: 280, isCircular: true }, timberTaper: { toeDiameterMm: 150, lengthM: 6 } };
    const s = scene(input);
    expect(s.systemId).toBe("timber-extension");
    expect(part(s.pile.parts, "extension")).toMatchObject({ material: "concrete", shape: { kind: "round", topNap: -0.5, bottomNap: -2.5, topDiameterM: 0.28 } });
    // Taps van 220 naar 150 mm over 6 m vanaf de las, daarna constant tot de punt.
    expect(part(s.pile.parts, "wood-1")).toMatchObject({ material: "wood", shape: { topNap: -2.5, bottomNap: -8.5, topDiameterM: 0.22, bottomDiameterM: 0.15 } });
    expect(part(s.pile.parts, "wood-2")).toMatchObject({ shape: { topNap: -8.5, bottomNap: -12, topDiameterM: 0.15, bottomDiameterM: 0.15 } });
    expect(part(s.pile.parts, "joint")).toMatchObject({ material: "steel", schematic: true, shape: { topNap: -2.5 } });
    expect(s.labels.find((l) => l.id === "joint")!.target![1]).toBe(-2.5);
  });
  it("gezaagd hout: rechthoek a × b", () => {
    const s = scene({ ...base, pileTypeId: "timber-square", diameterMm: 150, sideBMm: 200 });
    expect(part(s.pile.parts, "wood-1").shape).toMatchObject({ kind: "rect", topAM: 0.15, topBM: 0.2, bottomAM: 0.15, bottomBM: 0.2, topNap: -0.5, bottomNap: -12 });
    expect(s.pile.maxRadiusM).toBeCloseTo(0.125, 9);
  });
  it("schroefpalen: schroefpunt met blad; vibro: voetplaat; schroefinjectie: groutschil om een kern", () => {
    const screw = pileParts({ ...base, pileTypeId: "steel-screw-permanent-casing", diameterMm: 323.9, baseDiameterMm: 450 }, getPileType("steel-screw-permanent-casing"), "screw-permanent-casing");
    expect(part(screw, "screw-blade").shape).toMatchObject({ kind: "helix", outerTopDiameterM: 0.45 });
    expect(part(screw, "screw-tip").shape.bottomNap).toBe(-12);
    const vibro = pileParts({ ...base, pileTypeId: "concrete-driven-casing-hammered", diameterMm: 380, baseDiameterMm: 450 }, getPileType("concrete-driven-casing-hammered"), "vibro");
    expect(part(vibro, "footplate").shape).toMatchObject({ topDiameterM: 0.45, bottomNap: -12 });
    const grout = pileParts({ ...base, pileTypeId: "steel-screw-grout", diameterMm: 400 }, getPileType("steel-screw-grout"), "screw-injection");
    expect(part(grout, "grout")).toMatchObject({ material: "grout", shape: { topDiameterM: 0.4 } });
    expect(part(grout, "core").schematic).toBe(true);
  });
  it("kent elk paalsysteem uit de catalogus een vorm toe die van kop tot punt loopt", () => {
    for (const id of ["concrete-prefab-round", "steel-pipe-driven-closed", "concrete-screw-displacement", "concrete-screw-soil-displacing", "concrete-driven-casing-vibrated", "concrete-auger", "concrete-auger-cased", "concrete-bored", "timber-uniform", "timber-square"]) {
      const input = { ...base, pileTypeId: id, diameterMm: 300 };
      const parts = pileParts(input, getPileType(id), pileSystemIdOf(input));
      const body = parts.filter((p) => p.role !== "rebar" && p.role !== "blade" && p.role !== "core" && p.role !== "joint");
      expect(Math.max(...body.map((p) => p.shape.topNap)), id).toBe(-0.5);
      expect(Math.min(...body.map((p) => p.shape.bottomNap)), id).toBe(-12);
      expect(parts.every((p) => partRadius(p.shape) > 0), id).toBe(true);
    }
  });
});

describe("grondblok en niveaus", () => {
  const s = scene({ ...base, pileTypeId: "concrete-prefab-prestressed-driven", diameterMm: 250 });
  it("neemt de grondopbouw van de sondering over, gesplitst op het ontgravingsniveau, tot de einddiepte", () => {
    const own = analyzeLayers(cpt).layers;
    expect(own.map((l) => l.zone_number)).toEqual([3, 2, 6, 7]);
    expect(s.block.bottomNap).toBe(-20);
    expect(s.block.topNap).toBe(0);
    expect(s.block.layers.map((l) => [l.zone, l.topNap, l.bottomNap, l.excavated, l.assumed])).toEqual([
      [3, 0, -own[0].depth_bottom, true, false],
      [2, -own[1].depth_top, -1, true, false],
      [2, -1, -own[1].depth_bottom, false, false],
      [6, -own[2].depth_top, -own[2].depth_bottom, false, false],
      [7, -own[3].depth_top, -20, false, false],
    ].map(([zone, top, bottom, ex, as]) => [zone, expect.closeTo(top as number, 9), expect.closeTo(bottom as number, 9), ex, as]));
    // Naam en kleur zoals in het paneel Grondopbouw.
    expect(s.block.layers.map((l) => [l.name, l.color])).toEqual([own[0], own[1], own[1], own[2], own[3]].map((l) => [l.zone_name, l.zone_color]));
  });
  it("geeft maaiveld, ontgraving en grondwater als vlak en zet de niveaus als label", () => {
    expect(s.planes).toEqual([{ id: "ground", nap: 0 }, { id: "excavation", nap: -1 }, { id: "water", nap: -1.5 }]);
    const levels = s.labels.filter((l) => l.align === "left");
    expect(levels.map((l) => l.id)).toEqual(["ground", "head", "excavation", "water", "toe"]);
    // Uit elkaar geschoven: nooit dichter dan de labelafstand, de aanhaallijn wijst naar het echte niveau.
    for (let i = 1; i < levels.length; i++) expect(levels[i - 1].anchor[1] - levels[i].anchor[1]).toBeGreaterThanOrEqual(s.labelGapM - 1e-9);
    expect(levels.find((l) => l.id === "water")!.target![1]).toBe(-1.5);
    // Te dunne lagen houden geen naam, zodat de namen elkaar niet overlappen.
    const names = s.labels.filter((l) => l.id.startsWith("layer-"));
    expect(names.map((l) => l.text)).toEqual(["Organisch / veen", "Zand", "Grof zand / grind"]);
    for (let i = 1; i < names.length; i++) expect(names[i - 1].anchor[1] - names[i].anchor[1]).toBeGreaterThanOrEqual(s.labelGapM - 1e-9);
  });
  it("verwerkt een grondsoortaanpassing uit de grondlaaginterpretatie zoals de berekening en de 2D-tekening", () => {
    const input: PileInput = { ...base, pileTypeId: "concrete-prefab-prestressed-driven", diameterMm: 250,
      interpretationOverrides: [{ id: "a1", cptId: "S1", topNap: -6, bottomNap: -8, soilKind: "clay" }] };
    const adjusted = scene(input);
    const own = analyzeLayers(cpt).layers;
    expect(adjusted.block.layers.map((l) => [l.zone, l.adjusted, l.topNap, l.bottomNap])).toEqual([
      [3, false, 0, -own[0].depth_bottom],
      [2, false, -own[1].depth_top, -1],
      [2, false, -1, -own[1].depth_bottom],
      [6, false, -own[2].depth_top, -6],
      [3, true, -6, -8],
      [6, false, -8, -own[2].depth_bottom],
      [7, false, -own[3].depth_top, -20],
    ].map(([zone, adj, top, bottom]) => [zone, adj, expect.closeTo(top as number, 9), expect.closeTo(bottom as number, 9)]));
    expect(adjusted.labels.map((l) => l.text)).toContain("Klei (aangepast)");
  });
  it("laat een gelijk ontgravingsniveau weg en werkt zonder sondering", () => {
    const flat = buildPhysicalScene({ ...base, excavationNap: 0 }, cpt, getPileType(base.pileTypeId))!;
    expect(flat.planes.map((p) => p.id)).toEqual(["ground", "water"]);
    expect(flat.block.layers.some((l) => l.excavated)).toBe(false);
    const noCpt = buildPhysicalScene(base, null, getPileType(base.pileTypeId))!;
    expect(noCpt.groundNap).toBe(-1);
    expect(noCpt.block.layers).toEqual([]);
  });
  it("trekt boven en onder de sondering de dichtstbijzijnde laag door", () => {
    const layers = cptBlockLayers(cpt, [], 0, 5, 1, -22);
    expect(layers[0]).toMatchObject({ zone: 3, topNap: 1, bottomNap: 0, assumed: true });
    expect(layers[layers.length - 1]).toMatchObject({ zone: 7, topNap: -20, bottomNap: -22, assumed: true });
    expect(cptBlockLayers({ ...cpt, points: [] }, [], 0, 5, 0, -13)).toEqual([]);
  });
  it("geeft geen model bij ongeldige maten of niveaus", () => {
    expect(buildPhysicalScene({ ...base, pileToeNap: 3 }, cpt, getPileType(base.pileTypeId))).toBeNull();
    expect(buildPhysicalScene({ ...base, diameterMm: 0 }, cpt, getPileType(base.pileTypeId))).toBeNull();
  });
  it("houdt de hele paal en het blok binnen de uitsnede", () => {
    expect(s.focus.pile.topNap).toBeGreaterThan(0);
    expect(s.focus.pile.bottomNap).toBeLessThan(s.block.bottomNap);
    expect(s.focus.pile.x1).toBeGreaterThan(s.block.halfWidthM);
    expect(s.focus.tip.topNap).toBeGreaterThan(-12);
    expect(s.focus.tip.bottomNap).toBeLessThan(-12);
  });
});

describe("three.js-objecten van de fysieke weergave", () => {
  it("tekent elk onderdeel, elke laag en elk vlak, zonder rekenhulplijnen", () => {
    const model = scene({ ...base, pileTypeId: "timber-uniform", diameterMm: 220, concreteExtension: { jointNap: -2.5, sizeMm: 250, isCircular: false }, timberTaper: { toeDiameterMm: 150, lengthM: 9.5 } });
    const { root } = buildPhysicalObjects(model, { text: "#000", muted: "#777", background: "#fff" });
    const names: string[] = [];
    root.traverse((o) => { if (o.name) names.push(o.name); });
    for (const p of model.pile.parts) expect(names).toContain(`part-${p.id}`);
    expect(names.filter((n) => n.startsWith("soil-"))).toHaveLength(model.block.layers.length);
    expect(names).toEqual(expect.arrayContaining(["plane-ground", "plane-excavation", "plane-water"]));
    expect(names.some((n) => /^(zone-|slip-|shaft-|qc-|average-|critical)/.test(n))).toBe(false);
    // De opzetter is 250 × 250 mm: de omhullende van het onderdeel klopt met de maat.
    const box = new THREE.Box3().setFromObject(root.getObjectByName("part-extension")!);
    expect(box.max.x - box.min.x).toBeCloseTo(0.25, 6);
    expect(box.max.z - box.min.z).toBeCloseTo(0.25, 6);
    expect(box.max.y).toBeCloseTo(-0.5, 6);
    expect(box.min.y).toBeCloseTo(-2.5, 6);
    // Het grondblok ligt achter de paalas.
    const soil = new THREE.Box3().setFromObject(root.getObjectByName("soil-1")!);
    expect(soil.max.z).toBeLessThanOrEqual(0);
    disposeObjects(root);
  });
  it("schaalt een rechthoekige paal naar a × b", () => {
    const model = scene({ ...base, pileTypeId: "timber-square", diameterMm: 150, sideBMm: 200 });
    const { root } = buildPhysicalObjects(model, { text: "#000", muted: "#777", background: "#fff" });
    const box = new THREE.Box3().setFromObject(root.getObjectByName("part-wood-1")!);
    expect(box.max.x - box.min.x).toBeCloseTo(0.15, 6);
    expect(box.max.z - box.min.z).toBeCloseTo(0.2, 6);
    disposeObjects(root);
  });
});
