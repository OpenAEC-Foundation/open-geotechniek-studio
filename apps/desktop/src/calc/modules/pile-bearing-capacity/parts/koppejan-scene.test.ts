import { describe, expect, it } from "vitest";
import { buildKoppejanScene, spreadDown } from "./koppejan-scene";
import { computePile } from "../compute";
import { getPileType } from "../catalog";
import fixture from "../__fixtures__/sondering-3bm-cgeo1.json";
import type { PileInput } from "../types";
import type { Cpt } from "../../../../types/cpt";

const GROUND = -0.5;
// 5 MPa boven NAP -8 m, 12 MPa daaronder, met een zwakke laag net onder de punt.
const cpt: Cpt = {
  id: "S1",
  metadata: { source_file: "test", ground_level_nap: GROUND },
  points: Array.from({ length: 251 }, (_, i) => {
    const depth = i * 0.1, level = GROUND - depth;
    return { depth, depth_nap: level, qc: level > -8 ? 5 : level < -15 && level > -15.4 ? 6 : 12 };
  }),
};
// De fixture heeft alleen lagen tot de onderkant van de negatieve kleef; draagkrachtig zand eronder.
const input = { ...fixture.input, cptId: cpt.id, soilProfile: [...fixture.input.soilProfile, { kind: "sand-wet", startNap: -8, endNap: -14, gammaK: 20, gammaW: 10, phi: 32.5 }] } as PileInput;
const pileType = getPileType(input.pileTypeId);
const result = computePile(input, cpt);
const scene = buildKoppejanScene(input, result, cpt, pileType)!;
const deq = result.base.deqMm / 1000;

describe("buildKoppejanScene", () => {
  it("rekent de fixture door en levert een model", () => {
    expect(result.ok).toBe(true);
    expect(scene).not.toBeNull();
    expect(scene.deqM).toBeCloseTo(deq, 9);
  });

  it("legt traject I en II van de paalpunt tot de kritieke diepte en III tot 8 Deq erboven", () => {
    const [zoneI, zoneII, zoneIII] = scene.zones;
    expect(scene.zones.map((z) => z.id)).toEqual(["I", "II", "III"]);
    const critical = input.pileToeNap - result.base.criticalDepthM;
    for (const zone of [zoneI, zoneII]) {
      expect(zone.topNap).toBe(input.pileToeNap);
      expect(zone.bottomNap).toBeCloseTo(critical, 9);
    }
    expect(zoneIII.bottomNap).toBe(input.pileToeNap);
    expect(zoneIII.topNap).toBeCloseTo(input.pileToeNap + 8 * deq, 9);
    expect(zoneI.direction).toBe("down");
    expect(zoneII.direction).toBe("up");
    expect(zoneIII.direction).toBe("up");
    // I is de kern, II de ring eromheen, III sluit aan op de paal.
    expect(zoneI.innerRadiusM).toBe(0);
    expect(zoneII.innerRadiusM).toBe(zoneI.outerRadiusM);
    expect(zoneIII.outerRadiusM).toBe(zoneII.outerRadiusM);
    expect(zoneIII.innerRadiusM).toBeCloseTo(input.diameterMm / 2000, 9);
  });

  it("neemt de trajectgemiddelden en de kritieke diepte over uit het resultaat", () => {
    expect(scene.zones.map((z) => z.qcGemMpa)).toEqual([result.base.qcIGemMpa, result.base.qcIIGemMpa, result.base.qcIIIGemMpa]);
    expect(scene.critical.depthM).toBe(result.base.criticalDepthM);
    expect(scene.critical.deqRatio).toBeGreaterThanOrEqual(0.7 - 1e-9);
    expect(scene.critical.deqRatio).toBeLessThanOrEqual(4 + 1e-9);
    expect(scene.searchRange.topNap).toBeCloseTo(input.pileToeNap - 0.7 * deq, 9);
    expect(scene.searchRange.bottomNap).toBeCloseTo(input.pileToeNap - 4 * deq, 9);
    expect(scene.critical.nap).toBeLessThanOrEqual(scene.searchRange.topNap + 1e-9);
    expect(scene.critical.nap).toBeGreaterThanOrEqual(scene.searchRange.bottomNap - 1e-9);
  });

  it("tekent de paal van kop tot punt op ware maat", () => {
    const { segments } = scene.pile;
    expect(segments[0].topNap).toBe(input.pileTopNap);
    expect(segments[segments.length - 1].bottomNap).toBe(input.pileToeNap);
    expect(segments[0].topSizeM).toBeCloseTo(input.diameterMm / 1000, 9);
    expect(segments[0].isCircular).toBe(pileType!.isCircular);
  });

  it("zet de sondering en de afgekapte lijn om naar NAP", () => {
    const { raw, clipped, averages, axisMaxMpa } = scene.qc;
    expect(raw.length).toBeGreaterThan(100);
    expect(raw[0].nap).toBeCloseTo(GROUND, 9);
    expect(raw.every((p, i) => i === 0 || p.nap < raw[i - 1].nap)).toBe(true);
    expect(axisMaxMpa).toBeGreaterThanOrEqual(12);
    expect(clipped.length).toBe(result.base.clippedQcCurve!.length);
    // De afgekapte lijn dekt precies traject II en III.
    expect(Math.max(...clipped.map((p) => p.nap))).toBeCloseTo(input.pileToeNap + 8 * deq, 6);
    expect(Math.min(...clipped.map((p) => p.nap))).toBeCloseTo(scene.critical.nap, 6);
    expect(averages.map((a) => a.zone)).toEqual(["I", "II", "III"]);
    expect(scene.qc.originX).toBeGreaterThan(scene.zones[1].outerRadiusM);
  });

  it("geeft elk traject een label met zijn gemiddelde, en de kritieke diepte", () => {
    const text = (id: string) => scene.labels.find((l) => l.id === id)!.text;
    expect(text("I")).toBe(`qc;I;gem = ${result.base.qcIGemMpa.toFixed(2).replace(".", ",")} MPa`);
    expect(text("II")).toContain("qc;II;gem");
    expect(text("III")).toContain("qc;III;gem");
    expect(text("critical")).toBe(`kritieke diepte ${result.base.criticalDepthM.toFixed(2).replace(".", ",")} m`);
    expect(text("toe")).toBe("paalpunt NAP −14,00 m");
    // Labels rond de punt staan van boven naar beneden en overlappen niet.
    const tip = scene.labels.filter((l) => l.group === "tip" && l.target);
    expect(tip.map((l) => l.id)).toEqual(["III", "toe", "II", "I", "critical"]);
    for (let i = 1; i < tip.length; i++) expect(tip[i - 1].anchor[1] - tip[i].anchor[1]).toBeGreaterThanOrEqual(scene.labelGapM - 1e-9);
    expect(scene.labelGapM).toBeCloseTo(1.4 * deq, 9);
  });

  it("toont de kleeftrajecten langs de schacht met hun kracht", () => {
    const negative = scene.shaftZones.find((z) => z.id === "negative")!;
    const positive = scene.shaftZones.find((z) => z.id === "positive")!;
    expect(negative.bottomNap).toBe(result.negKleef.bottomNap);
    expect(negative.forceKn).toBe(result.negKleef.fnkD);
    expect(positive.topNap).toBe(input.posKleefTopNap ?? input.negKleefBottomNap);
    expect(positive.bottomNap).toBe(input.pileToeNap);
    expect(positive.forceKn).toBe(result.shaft.rsCalMax);
    expect(scene.labels.find((l) => l.id === "negative")!.text).toMatch(/^Fnk;d = \d+ kN$/);
    expect(scene.labels.find((l) => l.id === "positive")!.text).toMatch(/^Rs;cal;max = \d+ kN$/);
  });

  it("geeft uitsnedes voor de paalpunt en de hele paal", () => {
    const { tip, pile } = scene.focus;
    expect(tip.topNap).toBeGreaterThan(input.pileToeNap + 8 * deq);
    expect(tip.bottomNap).toBeLessThan(input.pileToeNap - 4 * deq);
    expect(pile.topNap).toBeGreaterThan(Math.max(input.pileTopNap, GROUND));
    expect(pile.x1).toBeGreaterThan(scene.qc.originX + scene.qc.widthM);
    expect(tip.x0).toBeLessThan(0);
  });

  it("kapt traject III af op het maaiveld bij een korte paal", () => {
    const short = { ...input, pileToeNap: GROUND - 1, negKleefBottomNap: GROUND - 0.2, posKleefTopNap: GROUND - 0.2 } as PileInput;
    const shortResult = computePile(short, cpt);
    const shortScene = buildKoppejanScene(short, { ...shortResult, ok: true }, cpt, pileType);
    expect(shortScene!.zones.find((z) => z.id === "III")!.topNap).toBe(GROUND);
  });

  it("tekent een vierkante paal en een taps verlopende houten paal met de juiste maten", () => {
    const square = buildKoppejanScene({ ...input, diameterMm: 250 }, result, cpt, { ...pileType!, isCircular: false, material: "concrete" })!;
    expect(square.pile.segments[0]).toMatchObject({ isCircular: false, topSizeM: 0.25, bottomSizeM: 0.25, material: "concrete" });
    const taper = buildKoppejanScene(
      { ...input, diameterMm: 300, timberTaper: { toeDiameterMm: 140, lengthM: 6 }, concreteExtension: { jointNap: -2, sizeMm: 320, isCircular: false } },
      result, cpt, { ...pileType!, material: "wood" })!;
    expect(taper.pile.segments.map((s) => [s.topNap, s.bottomNap])).toEqual([[input.pileTopNap, -2], [-2, -8], [-8, input.pileToeNap]]);
    expect(taper.pile.segments[0]).toMatchObject({ material: "concrete", isCircular: false, topSizeM: 0.32 });
    expect(taper.pile.segments[1]).toMatchObject({ material: "wood", topSizeM: 0.3 });
    expect(taper.pile.segments[1].bottomSizeM).toBeCloseTo(0.14, 9);
    expect(taper.pile.segments[2].bottomSizeM).toBeCloseTo(0.14, 9);
  });

  it("geeft niets terug zonder sondering of zonder resultaat", () => {
    expect(buildKoppejanScene(input, result, null, pileType)).toBeNull();
    expect(buildKoppejanScene(input, { ...result, ok: false, error: "x" }, cpt, pileType)).toBeNull();
    expect(buildKoppejanScene(input, { ...result, base: { ...result.base, deqMm: 0 } }, cpt, pileType)).toBeNull();
    expect(buildKoppejanScene(input, { ...result, base: { ...result.base, criticalDepthM: NaN } }, cpt, pileType)).toBeNull();
  });

  it("werkt zonder afgekapte lijn in het resultaat", () => {
    const old = buildKoppejanScene(input, { ...result, base: { ...result.base, clippedQcCurve: undefined } }, cpt, pileType)!;
    expect(old.qc.clipped).toEqual([]);
  });
});

it("spreadDown houdt de volgorde en de kleinste afstand aan", () => {
  expect(spreadDown([5, 4.9, 4.8, 1], 0.5)).toEqual([5, 4.5, 4, 1]);
  expect(spreadDown([], 1)).toEqual([]);
});

describe("bezwijklichaam rond de paalpunt", () => {
  it("loopt van de kritieke diepte onder de punt tot 8 Deq erboven", async () => {
    const { slipBody } = await import("./koppejan-scene");
    // Deq 0,25 m: kritieke diepte 4 Deq = 1,0 m, bovenkant 8 Deq = 2,0 m. tan = ln(2)/π.
    const body = slipBody(-10, 1.0, 2.0)!;
    expect(body.tanSpiral).toBeCloseTo(Math.log(2) / Math.PI, 12);
    expect(body.profile[0]).toEqual([0, -11]);
    expect(body.profile[body.profile.length - 1][0]).toBe(0);
    expect(body.profile[body.profile.length - 1][1]).toBeCloseTo(-8, 12);
    // Halverwege (θ = π/2) ligt het vlak op paalpuntniveau, op r = 1,0·√2 van de as.
    const mid = body.profile[(body.profile.length - 1) / 2];
    expect(mid[1]).toBeCloseTo(-10, 12);
    expect(mid[0]).toBeCloseTo(Math.SQRT2, 12);
    expect(body.maxRadiusM).toBeGreaterThan(mid[0]);
    expect(body.widestNap).toBeGreaterThan(-10);
  });
  it("wordt breder en hoger ten opzichte van de diepte naarmate de kritieke diepte kleiner is", async () => {
    const { slipBody } = await import("./koppejan-scene");
    const diep = slipBody(0, 1.0, 2.0)!, ondiep = slipBody(0, 0.175, 2.0)!;
    expect(ondiep.tanSpiral).toBeGreaterThan(diep.tanSpiral);
    expect(ondiep.bottomNap).toBeGreaterThan(diep.bottomNap);
    expect(slipBody(0, 0, 2)).toBeNull();
    expect(slipBody(0, 1, 0)).toBeNull();
  });
});
