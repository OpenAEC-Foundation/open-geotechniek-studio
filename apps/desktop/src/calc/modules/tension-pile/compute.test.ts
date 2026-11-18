// Controleberekeningen voor de trekweerstand. De getallen komen uit openbare
// uitgewerkte voorbeelden (een HBO-reader geotechniek en funderingsadviezen bij
// omgevingsvergunningen); zie VERIFICATIE.md voor de herkomst per voorbeeld.
import { describe, expect, it } from "vitest";
import { capQc, clayAlphaT, compactionFactor, computeTensionCore, correlationFactors, variableLoadFactor, type CoreOptions, type TensionLayer } from "./compute";
import { getTensionPileType } from "./catalog";

const type = (id: string) => getTensionPileType(id)!;
const norm = { gammaSt: 1.35, gammaGamma: 1.1, gammaWater: 10 };
const sand = (topNap: number, bottomNap: number, qcMpa: number, gamma = 20, extra: Partial<TensionLayer> = {}): TensionLayer =>
  ({ topNap, bottomNap, soil: "sand", gamma, gammaSat: gamma, phi: 32.5, qcMpa, ...extra });
const ok = (r: ReturnType<typeof computeTensionCore>) => { if (!r.ok) throw new Error(r.error); return r; };

describe("factoren", () => {
  it("wisselbelasting: 1,00 zonder wisseling, 1,25 bij 0..max, 1,50 bij druk", () => {
    expect(variableLoadFactor(100, 100)).toBe(1);
    expect(variableLoadFactor(100, 0)).toBeCloseTo(1.25, 6);
    expect(variableLoadFactor(20, -250)).toBe(1.5);
    expect(variableLoadFactor(249.2, 148.2)).toBeCloseTo(1.101, 3);
  });
  it("correlatiefactoren per aantal sonderingen", () => {
    expect(correlationFactors(1, false)).toEqual({ xi3: 1.39, xi4: 1.39 });
    expect(correlationFactors(2, false)).toEqual({ xi3: 1.32, xi4: 1.32 });
    expect(correlationFactors(4, false)).toEqual({ xi3: 1.28, xi4: 1.03 });
    expect(correlationFactors(6, false)).toEqual({ xi3: 1.28, xi4: 1.03 });
    expect(correlationFactors(12, false)).toEqual({ xi3: 1.25, xi4: 1.00 });
    expect(correlationFactors(1, true)).toEqual({ xi3: 1.26, xi4: 1.26 });
  });
  it("alpha-t in klei sluit aan op 0,02 en 0,03", () => {
    expect(clayAlphaT(1)).toBe(0.02);
    expect(clayAlphaT(2)).toBeCloseTo(0.02, 9);
    expect(clayAlphaT(2.25)).toBeCloseTo(0.025, 9);
    expect(clayAlphaT(2.5)).toBe(0.03);
  });
  it("afsnuiten: dunne piek naar 12 MPa, pakket dikker dan 1 m naar 15 MPa", () => {
    expect(capQc([9, 14, 9], [1, 0.5, 1])).toEqual([9, 12, 9]);
    expect(capQc([9, 13, 15, 16], [0.5, 0.5, 0.5, 0.75])).toEqual([9, 13, 15, 15]);
  });
  it("f1 groeit bij een dicht palenveld en is 1 vanaf zes paaldiameters", () => {
    const f1 = compactionFactor(10000, 100, 2.5, 0.45, 4);
    expect(f1).toBeGreaterThan(1.05);
    expect(f1).toBeLessThan(1.6);
    expect(compactionFactor(10000, 100, 3.0, 0.45, 4)).toBe(1);
  });
});

describe("V1: prefab 400 in een palenveld, f2 per laag en kluit", () => {
  const qcD = [1829, 1860, 3300, 3814, 3850, 3397, 3421, 4917, 4449, 3477, 4989, 5008, 6021];
  const f2 = [0.784, 0.753, 0.677, 0.623, 0.592, 0.584, 0.579, 0.548, 0.533, 0.538, 0.520, 0.506, 0.507];
  const layers: TensionLayer[] = [
    { topNap: -4.79, bottomNap: -10.80, soil: "peat", gamma: 11.198, gammaSat: 11.198, phi: 15, qcMpa: 0.3 },
    { topNap: -10.80, bottomNap: -12.0, soil: "clay", gamma: 16.203, gammaSat: 16.203, phi: 20, qcMpa: 1 },
    ...qcD.map((q, i) => sand(-12 - i, Math.max(-24.5, -13 - i), 0, 20, { qcDesignKpa: q })),
  ];
  const r = ok(computeTensionCore(layers, {
    pileType: type("prefab-concrete"), sizeMm: 400, pileTopNap: -4.5, pileToeNap: -24.5, waterNap: 0, tensionTopNap: -12,
    includeCohesive: false, group: { spacingXM: 2, spacingYM: 2 }, factors: { xi: 1.25, gammaVar: 1.1, ...norm }, ftDKn: 336.5,
  }));
  it("invloedsoppervlak en korrelspanning", () => {
    expect(r.group!.areaM2).toBeCloseTo(3.84, 2);
    expect(r.layers.find((l) => l.soil === "sand")!.sigmaTopDesignKpa).toBeCloseTo(6.77, 1);
  });
  it("f2 per laag", () => {
    const got = r.layers.filter((l) => l.soil === "sand").map((l) => l.f2);
    expect(got).toHaveLength(f2.length);
    got.forEach((v, i) => expect(v).toBeCloseTo(f2[i], 2));
  });
  it("weerstand, paalgewicht en toets", () => {
    expect(Math.abs(r.rFrictionKn - 305.1)).toBeLessThan(1);
    expect(r.gPileKn).toBeCloseTo(37.8, 1);
    expect(Math.abs(r.rtDKn - 342.9)).toBeLessThan(1);
    expect(r.passes).toBe(true);
    // De bron rekent de kegel met 1/2 en een lagere hoogte (406 kN); met 1/3 en de kegelhoogte uit de tophoek is het iets minder.
    expect(r.group!.rKluitKn).toBeGreaterThan(390);
    expect(r.group!.rKluitKn).toBeLessThan(410);
  });
});

describe("V2: prefab 400 geheid na ontgraven, klei en zand", () => {
  const layers: TensionLayer[] = [
    { topNap: -0.7, bottomNap: -2.7, soil: "clay", gamma: 3, gammaSat: 13, phi: 20, qcMpa: 0.3 },
    { topNap: -2.7, bottomNap: -9.5, soil: "clay", gamma: 15, gammaSat: 15, phi: 20, qcMpa: 0.7 },
    { topNap: -9.5, bottomNap: -11.2, soil: "peat", gamma: 12, gammaSat: 12, phi: 15, qcMpa: 0.3 },
    sand(-11.2, -12, 6, 22), sand(-12, -13, 12, 22), sand(-13, -14, 15, 22), sand(-14, -15, 13, 22), sand(-15, -16, 12, 22),
  ];
  const base: CoreOptions = {
    pileType: type("prefab-concrete"), sizeMm: 400, pileTopNap: -8, pileToeNap: -16, waterNap: -1.5, excavationNap: -8, excavationReduction: "linear",
    tensionTopNap: -8, cohesiveAlphaT: 0.02, factors: { xi: 1, gammaVar: 1, gammaSt: 1, gammaGamma: 1, gammaWater: 10 }, ftDKn: 367,
  };
  const single = ok(computeTensionCore(layers, base));
  it("gereduceerde conusweerstand per laag", () => {
    const got = single.layers.filter((l) => l.soil === "sand").map((l) => l.qcReducedMpa);
    // Tweede laag: de bron rekent met 27,7 kPa (5,63 MPa); uit haar eigen spanningen volgt 59 - 32,5 = 26,5 kPa.
    [1.95, 5.39, 8.13, 7.91, 7.89].forEach((v, i) => expect(got[i]).toBeCloseTo(v, 1));
  });
  it("trekweerstand 384 kN, paalgewicht 17,9 kN", () => {
    // 384 kN in de bron; 2,7 kN minder door de tweede laag.
    expect(Math.abs(single.rSingleKn - 381.3)).toBeLessThan(2);
    expect(single.gPileKn).toBeCloseTo(17.9, 1);
    expect(single.rtDKn).toBeGreaterThan(367);
  });
  it("kluit 499 kN bij stramien 3 x 3 m", () => {
    const g = ok(computeTensionCore(layers, { ...base, group: { spacingXM: 3, spacingYM: 3, areaM2: 9.08 } }));
    expect(g.group!.coneHeightM).toBeCloseTo(1.7, 1);
    expect(Math.abs(g.group!.rKluitKn - 498.9)).toBeLessThan(5);
  });
});

describe("V3 en V4: alleenstaande stalen buispaal, wisselbelasting en afsnuiten", () => {
  const soft = (topNap: number, bottomNap: number, gamma: number, qcMpa: number, soil: "clay" | "peat" = "clay"): TensionLayer =>
    ({ topNap, bottomNap, soil, gamma, gammaSat: gamma, phi: 20, qcMpa });
  const layers: TensionLayer[] = [
    sand(-0.65, -2.5, 4, 17), soft(-2.5, -4.5, 15, 1), soft(-4.5, -6.5, 13, 0.6, "peat"), soft(-6.5, -11, 14, 0.4), soft(-11, -12, 17, 1), soft(-12, -17.5, 15, 0.6),
    sand(-17.5, -18, 9), sand(-18, -18.5, 13), sand(-18.5, -19, 15), sand(-19, -19.75, 16),
  ];
  const run = (sizeMm: number) => ok(computeTensionCore(layers, {
    pileType: type("steel-tube-closed"), sizeMm, pileTopNap: -0.65, pileToeNap: -19.75, waterNap: -2.5, tensionTopNap: -17.5, includeCohesive: false,
    factors: { xi: 1.39, gammaVar: variableLoadFactor(20, -250), ...norm },
  }));
  it("buis 219: 50,9 kN wrijving", () => {
    const r = run(219);
    expect(r.factors.gammaVar).toBe(1.5);
    expect(r.layers[r.layers.length - 1].qcAppliedMpa).toBe(15);
    expect(r.rFrictionKn).toBeCloseTo(50.9, 1);
    // De bron rekent het paalgewicht met 0,9 (9,0 kN); met gamma/1,1 is het 9,2 kN.
    expect(r.gPileKn).toBeCloseTo(9.2, 1);
  });
  it("buis 273: 63,5 kN wrijving", () => expect(run(273).rFrictionKn).toBeCloseTo(63.5, 1));
});

describe("V5 en V6: palenrij hart-op-hart 2,0 m, alleenstaand en in de groep", () => {
  const rows: Array<[number, number, number]> = [[3, 17, 4], [2, 17, 3.5], [1.5, 19, 2], [0, 20, 12], [-0.7, 19, 2.5], [-1, 20, 4], [-2, 20, 11.5], [-3, 20, 12], [-4, 20, 12], [-5, 20, 11], [-5.8, 19, 4], [-6.5, 20, 15]];
  let top = 4.4;
  const layers = rows.map(([bottom, gamma, qc]) => { const l = sand(top, bottom, qc, gamma); top = bottom; return l; });
  // De bron kapt de laag van 0,7 m op 15 MPa en niet op 12 MPa; de test volgt de bron.
  const run = (id: string, sizeMm: number, areaM2?: number) => ok(computeTensionCore(layers, {
    pileType: type(id), sizeMm, pileTopNap: 4.4, pileToeNap: -6.5, waterNap: 3, tensionTopNap: -0.7, qcPeakCapMpa: 15,
    group: areaM2 ? { spacingXM: 2, spacingYM: 2, areaM2 } : undefined, factors: { xi: 1.32, gammaVar: 1.5, ...norm },
  }));
  it("prefab 290 alleenstaand: 186,5 + 12,0 = 199 kN", () => {
    const r = run("prefab-concrete", 290);
    expect(Math.abs(r.rSingleKn - 186.5)).toBeLessThan(0.5);
    expect(r.gPileKn).toBeCloseTo(12.0, 1);
    expect(Math.round(r.rtDKn)).toBe(199);
  });
  it("prefab 290 in de rij: 165,7 kN bij A = 6,26 m2", () => expect(Math.abs(run("prefab-concrete", 290, 6.26).rFrictionKn - 165.7)).toBeLessThan(0.5));
  it("buispaal 324 alleenstaand: 163,7 + 11,8 kN", () => {
    const r = run("steel-tube-closed", 324);
    expect(Math.abs(r.rSingleKn - 163.7)).toBeLessThan(0.5);
    expect(r.gPileKn).toBeCloseTo(11.8, 1);
  });
  it("buispaal 324 in de rij: 147,6 kN bij A = 6,26 m2", () => expect(Math.abs(run("steel-tube-closed", 324, 6.26).rFrictionKn - 147.6)).toBeLessThan(0.5));
  it("zonder de uitzondering kapt de dunne laag op 12 MPa", () => {
    const r = ok(computeTensionCore(layers, { pileType: type("prefab-concrete"), sizeMm: 290, pileTopNap: 4.4, pileToeNap: -6.5, waterNap: 3, tensionTopNap: -0.7, factors: { xi: 1.32, gammaVar: 1.5, ...norm } }));
    expect(r.layers[r.layers.length - 1].qcAppliedMpa).toBe(12);
  });
});

describe("V7: avegaarpaal, toename per 0,25 m in vast zand", () => {
  const layers = [sand(0, -20, 20)];
  const at = (sizeMm: number, toe: number) => ok(computeTensionCore(layers, { pileType: type("cfa"), sizeMm, pileTopNap: 0, pileToeNap: toe, waterNap: -1, factors: { xi: 1.28, gammaVar: 1.1, ...norm } })).rFrictionKn;
  it.each([[400, 11.156], [450, 12.551], [500, 13.945]])("diameter %i: %f kN", (size, expected) => {
    expect(at(size, -12.25) - at(size, -12)).toBeCloseTo(expected, 2);
  });
});

describe("invoercontrole", () => {
  it("meldt een paalpunt onder de grondopbouw", () => {
    const r = computeTensionCore([sand(0, -5, 10)], { pileType: type("cfa"), sizeMm: 400, pileTopNap: 0, pileToeNap: -8, waterNap: -1, factors: { xi: 1.39, gammaVar: 1, ...norm } });
    expect(r.ok).toBe(false);
  });
  it("veen levert geen wrijving en waarschuwt bij een korte paal", () => {
    const r = ok(computeTensionCore([{ topNap: 0, bottomNap: -6, soil: "peat", gamma: 11, gammaSat: 11, phi: 15, qcMpa: 0.3 }], { pileType: type("cfa"), sizeMm: 400, pileTopNap: 0, pileToeNap: -5, waterNap: -1, factors: { xi: 1.39, gammaVar: 1, ...norm } }));
    expect(r.rFrictionKn).toBe(0);
    expect(r.warnings.length).toBeGreaterThan(1);
  });
});
