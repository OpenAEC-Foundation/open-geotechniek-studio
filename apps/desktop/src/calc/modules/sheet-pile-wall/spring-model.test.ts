// Het verenmodel tegen gevallen met een bekende uitkomst; zie VERIFICATIE.md.
import { describe, expect, it } from "vitest";
import { solveSpringWall, type SideSpring, type WallElement } from "./spring-model";

const uniform = (length: number, count: number, left: SideSpring | null, right: SideSpring | null, load = 0): WallElement[] =>
  Array.from({ length: count }, (_, k) => ({ topM: (k * length) / count, bottomM: ((k + 1) * length) / count, left, right, loadKpa: load }));

describe("verenmodel", () => {
  it("gelijke grond aan beide zijden zonder belasting: geen verplaatsing en neutrale gronddruk", () => {
    const side = { p0: 20, pa: 10, pp: 80, k: 10000 }, r = solveSpringWall({ lengthM: 6, eiKnM2: 4e4, elements: uniform(6, 60, side, side) });
    expect(r.converged).toBe(true); expect(r.iterations).toBe(1);
    for (const e of r.elements) { expect(Math.abs(e.yM)).toBeLessThan(1e-12); expect(e.left!.pressureKpa).toBeCloseTo(20, 9); expect(e.right!.state).toBe("elastic"); }
  });

  it("lineaire veren: lange ligger met een kracht op de kop volgt de oplossing van Hetényi", () => {
    // Half-oneindige ligger op elastische bedding: y0 = 2·H·β/k en Mmax = 0,3224·H/β op z = π/(4β), β = (k/4EI)^¼.
    const k = 20000, ei = 4e4, h = 50, beta = (k / (4 * ei)) ** 0.25, length = 8 / beta;
    const wide = { p0: 1e4, pa: 0, pp: 2e4, k: k / 2 };
    const r = solveSpringWall({ lengthM: length, eiKnM2: ei, elements: uniform(length, 160, wide, wide), headForceKn: h });
    expect(r.beam.nodes[0].yM).toBeCloseTo((2 * h * beta) / k, 6);
    const peak = r.beam.samples.reduce((best, p) => (Math.abs(p.momentKnM) > Math.abs(best.momentKnM) ? p : best));
    expect(Math.abs(peak.momentKnM)).toBeCloseTo((0.3224 * h) / beta, 1); expect(peak.zM).toBeCloseTo(Math.PI / (4 * beta), 1);
  });

  it("stijve wand met gelijkmatige belasting: elastisch y = q/(kL + kR); daarna valt de hoge zijde terug op de actieve grens", () => {
    const left = { p0: 10, pa: 4, pp: 100, k: 1000 }, right = { p0: 10, pa: 0, pp: 50, k: 1000 };
    const elastic = solveSpringWall({ lengthM: 4, eiKnM2: 1e7, elements: uniform(4, 40, left, right, 8) });
    for (const e of elastic.elements) { expect(e.yM).toBeCloseTo(8 / 2000, 7); expect(e.left!.state).toBe("elastic"); }
    // q = 20: elastisch zou links 10 − 10 = 0 < 4 worden. Links blijft 4 kPa, rechts draagt 24 kPa: y = 14 mm.
    const plastic = solveSpringWall({ lengthM: 4, eiKnM2: 1e7, elements: uniform(4, 40, left, right, 20) });
    expect(plastic.converged).toBe(true);
    for (const e of plastic.elements) { expect(e.left!.state).toBe("active"); expect(e.left!.pressureKpa).toBe(4); expect(e.right!.pressureKpa).toBeCloseTo(24, 2); expect(e.yM).toBeCloseTo(0.014, 5); }
    expect(plastic.excessKn).toBeLessThan(0.01);
  });

  it("meer belasting dan de passieve weerstand kan dragen: geen evenwicht, zichtbaar aan het overschot", () => {
    const left = { p0: 10, pa: 4, pp: 100, k: 1000 }, right = { p0: 10, pa: 0, pp: 50, k: 1000 };
    // Grootste weerstand: 50 − 4 = 46 kPa; met 60 kPa blijft 14 kPa over 4 m = 56 kN/m over.
    const r = solveSpringWall({ lengthM: 4, eiKnM2: 1e7, elements: uniform(4, 40, left, right, 60) });
    for (const e of r.elements) expect(e.right!.state).toBe("passive");
    expect(r.excessKn).toBeCloseTo(56, 0);
  });

  it("een steun is een lineaire veer in één element", () => {
    // Stijve wand zonder grond, gelijkmatige belasting, twee steunen: elk de helft.
    const elements = uniform(4, 40, null, null, 10).map((e, k) => (k === 0 || k === 39 ? { ...e, supportKnM2: 1e6 } : e));
    const r = solveSpringWall({ lengthM: 4, eiKnM2: 1e6, elements });
    expect(r.elements[0].supportKnM).toBeCloseTo(20, 1); expect(r.elements[39].supportKnM).toBeCloseTo(20, 1);
  });

  it("volgende fase vanaf de vervormde stand: de plastische verplaatsing blijft", () => {
    // Fase 1 (zie hierboven): q = 20 kPa, links actief op 4 kPa, rechts 24 kPa, y = 14 mm.
    // Fase 2 zonder belasting, de veren beginnen op hun stand: links p = 4 − k·(y − 0,014), rechts p = 24 + k·(y − 0,014).
    // Evenwicht 4 − 1000·d = 24 + 1000·d geeft d = −0,010 m: y = 4 mm en aan beide zijden 14 kPa, niet terug naar 0.
    const y1 = 0.014, left = { p0: 4, pa: 4, pp: 100, k: 1000, w0: -y1 }, right = { p0: 24, pa: 0, pp: 50, k: 1000, w0: y1 };
    const r = solveSpringWall({ lengthM: 4, eiKnM2: 1e7, elements: uniform(4, 40, left, right, 0) });
    expect(r.converged).toBe(true);
    for (const e of r.elements) { expect(e.yM).toBeCloseTo(0.004, 6); expect(e.left!.pressureKpa).toBeCloseTo(14, 3); expect(e.right!.pressureKpa).toBeCloseTo(14, 3); expect(e.left!.state).toBe("elastic"); }
    // Zelfde belasting als fase 1 en de stand van fase 1: er verandert niets.
    const same = solveSpringWall({ lengthM: 4, eiKnM2: 1e7, elements: uniform(4, 40, left, right, 20) });
    for (const e of same.elements) { expect(e.yM).toBeCloseTo(y1, 6); expect(e.right!.pressureKpa).toBeCloseTo(24, 3); }
  });
});
