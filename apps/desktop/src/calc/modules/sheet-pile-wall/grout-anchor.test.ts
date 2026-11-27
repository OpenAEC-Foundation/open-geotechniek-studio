// Groutanker, drietakkige veer, wateroverspanning en de reductie op EI; de handberekeningen staan in VERIFICATIE.md.
import { describe, expect, it } from "vitest";
import { DEFAULT_GROUT, REPRESENTATIVE, anchorStiffness, buildScenario, computeWall, sidePoint, supportPreload, supportStiffness, wallExample, type WallInput, type WallOk } from "./compute";
import { solveSpringWall, springCurve, type WallElement } from "./spring-model";
import { wallScene } from "./scene";

const ok = (i: WallInput): WallOk => { const r = computeWall(i); if (!r.ok) throw new Error(r.error); return r; };
const rad = (d: number) => (d * Math.PI) / 180;
/** Voorbeeldwand met een groutanker: 4 strengen van 150 mm², 6 m vrij, 6 m groutlichaam rond 150 mm, τ = 200 kPa (invoer). */
const grouted = (patch: Partial<typeof DEFAULT_GROUT> = {}): WallInput => {
  const base = wallExample();
  return { ...base, anchor: { ...base.anchor, kind: "grout", grout: { ...DEFAULT_GROUT, shaftFrictionKpa: 200, ...patch } } };
};

describe("groutanker", () => {
  it("veerstijfheid uit de vrije lengte, omgerekend naar horizontaal per m wand", () => {
    const a = grouted().anchor;
    // k = 195 000 N/mm² · 600 mm² / 6 m = 19 500 kN/m; horizontaal 19 500 · cos² 30° / 2,8 = 5223 kN/m per m.
    expect(anchorStiffness(a)).toBeCloseTo(19500, 9); expect(supportStiffness(a)).toBeCloseTo((19500 * 0.75) / 2.8, 6);
    expect(anchorStiffness({ ...a, grout: { ...a.grout!, freeLengthM: 12 } })).toBeCloseTo(9750, 9);
    // Een vinkje "star" van een eerdere keuze telt bij een groutanker niet.
    expect(supportStiffness({ ...a, rigid: true })).toBeCloseTo((19500 * 0.75) / 2.8, 6);
    expect(supportPreload(a)).toBe(0); expect(supportPreload({ ...a, grout: { ...a.grout!, prestressKn: 100 } })).toBeCloseTo((100 * Math.cos(rad(30))) / 2.8, 9);
  });

  it("krachtontbinding: per anker over h.o.h. en de hoek; de verticale component als normaalkracht in de profieltoets", () => {
    const r = ok(grouted()), a = r.uls.anchor!, g = r.grout!;
    expect(a.axialKn).toBeCloseTo(a.horizontalKn / Math.cos(rad(30)), 9); expect(g.forceKn).toBeCloseTo((a.horizontalKn * 2.8) / Math.cos(rad(30)), 9);
    expect(a.verticalKn).toBeCloseTo(a.horizontalKn * Math.tan(rad(30)), 9);
    expect(a.horizontalKn).toBeCloseTo(supportStiffness(grouted().anchor) * a.displacementM, 3);
    expect(g.elongationMm).toBeCloseTo((g.forceKn / 19500) * 1000, 9);
    const normal = r.checks.find((c) => c.id === "normal")!;
    expect(normal.steps[0].result).toBe(`${a.verticalKn.toFixed(1).replace(".", ",")} kN/m`);
  });

  it("voorspanning is de beginkracht van de veer: kracht = k·y + voorspanning, en de wand verplaatst minder", () => {
    const plain = ok(grouted()), pre = ok(grouted({ prestressKn: 150 })), h0 = (150 * Math.cos(rad(30))) / 2.8;
    expect(pre.uls.anchor!.horizontalKn).toBeCloseTo(supportStiffness(grouted().anchor) * pre.uls.anchor!.displacementM + h0, 3);
    expect(pre.sls.maxDisplacement.value).toBeLessThan(plain.sls.maxDisplacement.value);
    expect(pre.uls.anchor!.horizontalKn).toBeGreaterThan(plain.uls.anchor!.horizontalKn);
    // Evenwicht blijft sluiten.
    const net = pre.uls.rows.reduce((sum, row) => sum + ((row.high?.pressureKpa ?? 0) + row.uHighKpa - (row.low?.pressureKpa ?? 0) - row.uLowKpa) * (row.topNap - row.bottomNap), 0);
    expect(Math.abs(net - pre.uls.anchor!.horizontalKn)).toBeLessThan(0.005 * pre.uls.passive.maxKn);
  });

  it("trekelement en houdkracht van het groutlichaam, met de extra factor op de ankerkracht", () => {
    const r = ok(grouted()), g = r.grout!, by = Object.fromEntries(r.checks.map((c) => [c.id, c]));
    // Staal: 600 mm² · 1600 N/mm² / 1,15 = 834,8 kN. Groutlichaam: π · 0,15 · 6 · 200 = 565,5 kN; / 1,1 = 514,1 kN.
    expect(g.steelRdKn).toBeCloseTo(834.78, 2); expect(g.pulloutRkKn).toBeCloseTo(565.49, 2); expect(g.pulloutRdKn).toBeCloseTo(514.08, 2);
    expect(g.designForceKn).toBeCloseTo(1.25 * g.forceKn, 9);
    expect(by.tendon.load).toBeCloseTo(g.designForceKn, 9); expect(by.tendon.uc).toBeCloseTo(g.designForceKn / 834.78, 4);
    expect(by.pullout.uc).toBeCloseTo(g.designForceKn / 514.08, 4);
    const weaker = ok(grouted({ shaftFrictionKpa: 50, gammaPullout: 1.35, loadFactor: 1.5 }));
    expect(weaker.grout!.pulloutRdKn).toBeCloseTo((Math.PI * 0.15 * 6 * 50) / 1.35, 6); expect(weaker.checks.find((c) => c.id === "pullout")!.passes).toBe(false); expect(weaker.passes).toBe(false);
  });

  it("ligging: begin en eind van het groutlichaam, het actieve glijvlak vanaf de teen en de vrije lengte die daarbij hoort", () => {
    const i = grouted(), r = ok(i), g = r.grout!, s = r.uls.scenario;
    // Anker op NAP −1,0 onder 30°: begin op 6·cos 30° = 5,196 m en NAP −4,0; eind op 10,392 m en NAP −7,0.
    expect(g.start.xM).toBeCloseTo(5.196, 3); expect(g.start.nap).toBeCloseTo(-4, 9); expect(g.end.xM).toBeCloseTo(10.392, 3); expect(g.end.nap).toBeCloseTo(-7, 9);
    // φ′gem;d: 7 m zand matig en 2 m zand vast, gewogen naar dikte.
    const phi = (7 * s.high.layers[0].phi + 2 * s.high.layers[1].phi) / 9, theta = 45 + phi / 2;
    expect(g.phiAvgDeg).toBeCloseTo(phi, 9); expect(g.slipAngleDeg).toBeCloseTo(theta, 9);
    // Snijpunt van de ankerlijn met het glijvlak: L = (−1 − (−9)) / (tan θ · cos 30° + sin 30°).
    const required = 8 / (Math.tan(rad(theta)) * Math.cos(rad(30)) + 0.5);
    expect(g.requiredFreeM).toBeCloseTo(required, 9);
    // Controle: dat punt ligt op het glijvlak, dus hoogte boven de teen = afstand achter de wand · tan θ.
    expect(-1 - required * 0.5 - -9).toBeCloseTo(required * Math.cos(rad(30)) * Math.tan(rad(theta)), 9);
    const check = r.checks.find((c) => c.id === "freeLength")!;
    expect(check.uc).toBeCloseTo(required / 6, 9); expect(check.passes).toBe(required <= 6);
    expect(ok(grouted({ freeLengthM: 2 })).checks.find((c) => c.id === "freeLength")!.passes).toBe(false);
    // Lagen langs het groutlichaam: van NAP −4 tot −7 helemaal in het matige zand; een langer lichaam loopt door in het vaste zand.
    expect(g.layers).toEqual([{ name: "Zand, matig", lengthM: 6, weak: false }]);
    const long = ok(grouted({ groutLengthM: 8 })).grout!.layers;
    expect(long.map((l) => l.name)).toEqual(["Zand, matig", "Zand, vast"]); expect(long[0].lengthM).toBeCloseTo(6, 9); expect(long[1].lengthM).toBeCloseTo(2, 9);
  });

  it("meldt een groutlichaam in een slappe laag of boven het maaiveld, en vraagt om de schachtwrijving", () => {
    const soft = grouted();
    soft.layersHigh = [{ ...soft.layersHigh[0] }, { topNap: -5, name: "Klei, slap", soilId: "clay-soft", gamma: 14, gammaSat: 14, phi: 17.5, c: 0, delta: 11.7, undrained: false, cu: 25, kh: 2000 }, { ...soft.layersHigh[1], topNap: -6 }];
    const r = computeWall(soft);
    if (r.ok) { expect(r.grout!.layers.find((l) => l.name === "Klei, slap")).toMatchObject({ weak: true }); expect(r.warnings.join(" ")).toMatch(/ligt over 2,00 m in Klei, slap/); }
    else expect(r.error).toMatch(/evenwicht/);
    const flat = ok({ ...grouted({ freeLengthM: 3 }), anchor: { ...grouted().anchor, angleDeg: 0, grout: { ...DEFAULT_GROUT, shaftFrictionKpa: 200 } } });
    expect(flat.grout!.start.nap).toBe(-1); expect(flat.grout!.layers[0].lengthM).toBe(6);
    const error = computeWall(grouted({ shaftFrictionKpa: 0 }));
    expect(error.ok).toBe(false); if (!error.ok) expect(error.error).toMatch(/Vul de schachtwrijving/);
    expect(ok(grouted()).warnings.join(" ")).toMatch(/Kranz/);
    const high = ok({ ...grouted(), anchor: { ...grouted().anchor, levelNap: -0.2, angleDeg: 0 } });
    expect(high.warnings.join(" ")).not.toMatch(/boven het maaiveld/);
  });

  it("tekening: vrije lengte en groutlichaam op schaal, het glijvlak en een breder grondblok aan de hoge zijde", () => {
    const i = grouted(), r = ok(i), s = wallScene(i, r);
    expect(s.support).toEqual({ kind: "grout", levelNap: -1, angleDeg: 30, freeM: 6, groutM: 6, groutDiameterM: 0.15 });
    expect(s.extentHighM).toBeCloseTo(12 * Math.cos(rad(30)) + 1, 9); expect(s.bottomNap).toBeLessThanOrEqual(-8);
    expect(s.slip!.angleDeg).toBe(r.grout!.slipAngleDeg); expect(s.slip!.reachM).toBeCloseTo(9 / Math.tan(rad(r.grout!.slipAngleDeg)), 9);
    expect(s.waling).toMatchObject({ levelNap: -1 }); expect(s.anchors.length).toBeGreaterThan(0);
    const strut = { ...wallExample(), anchor: { ...wallExample().anchor, kind: "strut" as const, angleDeg: 30 } };
    expect(wallScene(strut, ok(strut)).support).toMatchObject({ kind: "strut", angleDeg: 0 }); expect(ok(strut).uls.anchor!.verticalKn).toBe(0);
  });
});

describe("drietakkige veer", () => {
  it("knikpunten: 50, 80 en 100 % van passief min actief na 0,5·Δp/k1, 0,8·Δp/k2 en Δp/k3, verschoven naar de neutrale druk", () => {
    const c = springCurve({ pa: 0, pp: 100, p0: 0, k: 20000, k2: 10000, k3: 5000 });
    expect(c.p).toEqual([0, 50, 80, 100]); expect(c.w.map((w) => +(w * 1000).toFixed(6))).toEqual([0, 2.5, 8, 20]);
    // Neutraal op 30 kPa ligt op de eerste tak, 1,5 mm van het actieve punt.
    expect(springCurve({ pa: 0, pp: 100, p0: 30, k: 20000, k2: 10000, k3: 5000 }).w.map((w) => +(w * 1000).toFixed(6))).toEqual([-1.5, 1, 6.5, 18.5]);
    // Eén tak: van actief naar passief met k.
    expect(springCurve({ pa: 10, pp: 60, p0: 20, k: 10000 }).w.map((w) => +(w * 1000).toFixed(6))).toEqual([-1, 4]);
  });

  it("stijve wand tegen één veer: de verplaatsing volgt de tak waarop de druk ligt", () => {
    const wall = (load: number): WallElement[] => Array.from({ length: 20 }, (_, k) => ({ topM: k * 0.2, bottomM: (k + 1) * 0.2, left: null, right: { pa: 0, pp: 100, p0: 0, k: 20000, k2: 10000, k3: 5000 }, loadKpa: load }));
    const at = (load: number) => solveSpringWall({ lengthM: 4, eiKnM2: 1e7, elements: wall(load) }).elements[10];
    // 40 kPa: eerste tak, 40/20 000 = 2,0 mm. 65 kPa: tweede tak, 2,5 + 15/30·5,5 = 5,25 mm. 90 kPa: derde tak, 8 + 10/20·12 = 14,0 mm.
    expect(at(40).yM * 1000).toBeCloseTo(2, 6); expect(at(40).right!.branch).toBe(1);
    expect(at(65).yM * 1000).toBeCloseTo(5.25, 6); expect(at(65).right!.branch).toBe(2);
    expect(at(90).yM * 1000).toBeCloseTo(14, 6); expect(at(90).right!.branch).toBe(3); expect(at(90).right!.state).toBe("elastic");
  });

  it("een steun met voorspanning: kracht = k·y + voorspanning", () => {
    // Stijve wand zonder grond, 10 kPa over 4 m, twee steunen van 10⁵ kN/m; de bovenste met 5 kN voorspanning.
    const elements: WallElement[] = Array.from({ length: 40 }, (_, k) => ({ topM: k * 0.1, bottomM: (k + 1) * 0.1, left: null, right: null, loadKpa: 10, ...(k === 0 || k === 39 ? { supportKnM2: 1e6 } : {}), ...(k === 0 ? { supportPreloadKnM: 50 } : {}) }));
    const r = solveSpringWall({ lengthM: 4, eiKnM2: 1e7, elements });
    expect(r.elements[0].supportKnM).toBeCloseTo(20, 1); expect(r.elements[39].supportKnM).toBeCloseTo(20, 1);
    expect(r.elements[0].yM * 1e5).toBeCloseTo(15, 1); expect(r.elements[39].yM * 1e5).toBeCloseTo(20, 1);
  });

  it("in de wand: drie takken geven een grotere verplaatsing dan alleen de eerste tak; halve invoer wordt geweigerd", () => {
    const base = wallExample(), three: WallInput = { ...base, layersHigh: base.layersHigh.map((l) => ({ ...l, kh2: l.kh / 2, kh3: l.kh / 4 })) };
    expect(ok(three).sls.maxDisplacement.value).toBeGreaterThan(ok(base).sls.maxDisplacement.value);
    expect(ok(three).warnings.join(" ")).not.toMatch(/één beddingsconstante per laag/); expect(ok(base).warnings.join(" ")).toMatch(/één beddingsconstante per laag/);
    const half = computeWall({ ...base, layersHigh: base.layersHigh.map((l) => ({ ...l, kh2: l.kh / 2 })) });
    expect(half.ok).toBe(false); if (!half.ok) expect(half.error).toMatch(/kh2 en kh3 allebei/);
  });
});

describe("wateroverspanning en buigstijfheid", () => {
  it("wateroverspanning per laag: lineair over de laag, boven op de hydrostatische druk, en van de korrelspanning af", () => {
    const base = wallExample(), i: WallInput = { ...base, gammaWater: 9.81, lowSameAsHigh: false, layersLow: [{ ...base.layersHigh[0], excessTop: 0, excessBottom: 14 }, { ...base.layersHigh[1], excessTop: 14, excessBottom: 99 }] };
    const low = buildScenario(i, REPRESENTATIVE).low, plain = buildScenario({ ...i, layersLow: base.layersHigh }, REPRESENTATIVE).low;
    // Laag 1 van NAP 0 tot −7: op NAP −5,5 is de overspanning 14·5,5/7 = 11 kPa; hydrostatisch 9,81·1,5 = 14,715 kPa.
    expect(sidePoint(low, -5.5).u).toBeCloseTo(14.715 + 11, 9); expect(sidePoint(low, -5.5).sigmaVEff).toBeCloseTo(sidePoint(plain, -5.5).sigmaVEff - 11, 9);
    // De onderste laag houdt de bovenwaarde.
    expect(sidePoint(low, -8).u).toBeCloseTo(9.81 * 4 + 14, 9);
    const r = ok(i), reference = ok({ ...i, layersLow: base.layersHigh });
    expect(Math.abs(r.uls.maxMoment.value)).toBeGreaterThan(Math.abs(reference.uls.maxMoment.value));
    expect(r.warnings.join(" ")).not.toMatch(/hydrostatisch gerekend/); expect(reference.warnings.join(" ")).toMatch(/hydrostatisch gerekend/);
  });

  it("reductiefactor op EI en het volumegewicht van water", () => {
    const base = wallExample(), r = ok({ ...base, eiFactor: 0.66 });
    expect(r.eiKnM2).toBeCloseTo(0.66 * 79380, 6); expect(r.sls.maxDisplacement.value).toBeGreaterThan(ok(base).sls.maxDisplacement.value);
    expect(sidePoint(buildScenario({ ...base, gammaWater: 9.81 }, REPRESENTATIVE).high, -3.5).u).toBeCloseTo(19.62, 9);
    expect(computeWall({ ...base, eiFactor: 1.2 }).ok).toBe(false);
  });
});
