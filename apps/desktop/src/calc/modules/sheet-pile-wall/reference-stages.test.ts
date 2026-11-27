// Openbare damwandberekeningen met fasering, steunpunten, belastingen op afstand en een aflopende bodem, nagerekend
// met het stappenplan. Nummers zijn die van docs/damwand/referentieberekeningen.md; de getallen zijn in de bron-pdf
// nagelezen (paginanummers in VERIFICATIE.md, hoofdstuk 16). De bronnen zijn externe referentie-berekeningen met een
// verenmodel met drie takken per laag.
//
// Tolerantie, vooraf vastgelegd en voor alle gevallen gelijk: moment, dwarskracht en anker- of stempelkracht binnen
// 15 %, verplaatsing binnen 25 %, aangesproken passieve weerstand binnen 10 procentpunt. Waar een geval daarbuiten valt,
// staat het verschil met de verklaring in VERIFICATIE.md en toetst de test alleen wat wel binnen de tolerantie valt.
import { describe, expect, it } from "vitest";
import { CUR_FACTOR_SETS, CUR_STEPS, computeWall, wallExample, type WallFactors, type WallInput, type WallLayer, type WallOk } from "./compute";

const ok = (i: WallInput): WallOk => { const r = computeWall(i); if (!r.ok) throw new Error(r.error); return r; };
const base = wallExample();
const rc = (id: "rc1-cur" | "rc2-cur" | "rc3-cur") => CUR_FACTOR_SETS.find((x) => x.id === id)!;
const cur = (resultFactor: number) => ({ enabled: true, skipFreeWater: true, steps: CUR_STEPS.map((s) => (s.id === "6.5" ? { ...s, resultFactor } : s)) });
const layer = (topNap: number, name: string, gamma: number, gammaSat: number, c: number, phi: number, delta: number, kh: [number, number, number]): WallLayer =>
  ({ topNap, name, gamma, gammaSat, c, phi, delta, undrained: false, cu: 0, kh: kh[0], kh2: kh[1], kh3: kh[2] });
/** Eigen doorsnede per m wand met de buigstijfheid van de bron (de toets van de doorsnede doet hier niet mee). */
const ownSection = (ei: number) => ({ construction: "plank" as const, material: "custom" as const, plankMm: 200, custom: { eiKnM2: ei, mRdKnM: 1e4, vRdKn: 1e4 } });
/** Anker als veer per m wand: E·A per m wand gedeeld door de lengte, zoals de bron het invoert. */
const springAnchor = (levelNap: number, eKpa: number, aM2PerM: number, lengthM: number, angleDeg: number) =>
  ({ enabled: true, kind: "tie" as const, levelNap, angleDeg, rigid: false, stiffnessKnPerM: (eKpa * aM2PerM) / lengthM, spacingM: 1 });


/** Nr. 13: lichte damwand met één anker, oeverbeschoeiing (2015). Eén fase, RC1, aflopende bodem, strooklast. */
export function case13(): WallInput {
  const soil = [
    layer(1.6, "leem, zeer zandig", 20, 20, 1, 35, 0, [6000, 3000, 1500]), layer(0.8, "zand, zwak siltig", 19, 21, 0, 32.5, 0, [6000, 3000, 1500]),
    layer(-0.3, "leem, zeer zandig", 20, 20, 1, 35, 0, [6000, 3000, 1500]), layer(-5, "klei, zwak zandig", 18, 18, 5, 22.5, 0, [3000, 1500, 750]),
  ];
  return { ...base, ...ownSection(205.3), groundHighNap: 0.7, groundLowNap: -1.5, excavationNap: -1.5, waterHighNap: 0, waterLowNap: 0, surchargeKpa: 0, wallTopNap: 0.7, toeNap: -3.5,
    layersHigh: soil, lowSameAsHigh: true, layersLow: [], passiveMethod: "straight", gammaWater: 9.81, factors: rc("rc1-cur").factors, cur: cur(1.2),
    profileLow: [{ xM: 0.5, dzM: 0 }, { xM: 4, dzM: -0.7 }, { xM: 8, dzM: -1.5 }], loads: [{ side: "high", kind: "strip", value: 10, fromM: 0, toM: 8 }],
    anchor: springAnchor(0.3, 2.1e8, 3.46e-2, 7, 6) };
}

/** Nr. 20, profiel B: kunststof damwand met ankerstang, jachthaven (2016). Eén fase, RC1. */
export function case20(): WallInput {
  const soil = [layer(1.1, "zand, los, kleiig", 16, 18, 0, 25, 16.67, [4000, 2000, 800]), layer(0, "klei, slap", 14, 14, 2, 22.5, 15, [2000, 800, 500])];
  return { ...base, ...ownSection(327), groundHighNap: 1.1, groundLowNap: -1.4, excavationNap: -1.4, waterHighNap: -0.1, waterLowNap: -0.1, surchargeKpa: 0, wallTopNap: 1.1, toeNap: -4.7,
    layersHigh: soil, lowSameAsHigh: true, layersLow: [], passiveMethod: "straight", gammaWater: 9.81, factors: { ...rc("rc1-cur").factors, deltaWaterLowM: 0.2 }, cur: cur(1.2),
    profileLow: [{ xM: 1, dzM: 0 }, { xM: 6, dzM: -1 }], loads: [{ side: "high", kind: "strip", value: 10, fromM: 0, toM: 4.2 }],
    anchor: springAnchor(0.5, 2.1e8, 2.62e-4, 6, 0) };
}

/** Nr. 6: bestaande stalen damwand met groutankers aan een boezem (2016). Drie fasen, RC2: bestaand, maaiveld verhoogd, gebaggerd. */
export function case06(): WallInput {
  const top = [layer(0.4, "zand", 18, 20, 0, 30, 20, [12000, 6000, 3000]), layer(0, "klei, matig", 14, 14, 2, 22.5, 11.25, [4000, 2000, 800]), layer(-2, "veen", 11, 11, 2.5, 15, 0, [2000, 800, 500]), layer(-3, "zand", 18, 20, 0, 30, 20, [12000, 6000, 3000])];
  const f: WallFactors = { ...rc("rc2-cur").factors, gammaQ: 1 };
  return { ...base, ...ownSection(2.4192e4 * 0.7), groundHighNap: 0.27, groundLowNap: -2.3, excavationNap: -2.3, waterHighNap: -0.4, waterLowNap: -0.6, surchargeKpa: 0, wallTopNap: 0.27, toeNap: -7.23,
    layersHigh: [...top, layer(-6, "zand (−δ)", 18, 20, 0, 30, -20, [12000, 6000, 3000])], lowSameAsHigh: false, layersLow: top, passiveMethod: "straight", gammaWater: 10, factors: f, cur: cur(1.2),
    profileLow: [{ xM: 7.33, dzM: -0.9 }], loads: [{ side: "high", kind: "strip", value: 5, fromM: 0, toM: 10 }],
    anchor: springAnchor(-0.3, 2.1e8, 1e-4, 12, 45),
    phases: [{ name: "1 bestaand", install: ["A1"], loadIds: ["B1"] }, { name: "2 maaiveld verhoogd", profileHigh: [{ xM: 0.13, dzM: 0.13 }] }, { name: "3 gebaggerd", excavationNap: -3.2, profileLow: [] }] };
}

/** Nr. 5, doorsnede 1: bouwput met stempelraam en later de keldervloer als stempel (2018). Vier fasen, RC1. */
export function case05(): WallInput {
  const s = (d: number) => [
    layer(4.65, "zand, zwak kleiig", 17, 19, 0, 28, 18.67, [6000, 4000, 2000]), layer(3, "zand, matig vast", 18, 20, 0, 32, d, [12000, 6000, 3000]),
    layer(2.6, "zand, zwak kleiig", 17, 19, 0, 28, 18.67, [6000, 4000, 2000]), layer(1.2, "zand, matig vast", 18, 20, 0, 32, d, [12000, 6000, 3000]),
    { ...layer(0, "klei, zwak siltig", 14, 14, 2, 17.5, 11.67, [2000, 800, 500]), excessTop: 0, excessBottom: -25 }, { ...layer(-4, "zand, sterk kleiig", 18, 20, 0, 25, 16.67, [6000, 4000, 2000]), excessTop: -25, excessBottom: -25 },
  ];
  const low = s(16.6).map((l) => (l.topNap === 0 ? { ...l, excessBottom: -2 } : l.topNap === -4 ? { ...l, excessTop: -2, excessBottom: -2 } : l));
  return { ...base, ...ownSection(73269), groundHighNap: 4.65, groundLowNap: 4.65, excavationNap: 3.5, waterHighNap: 3.2, waterLowNap: 3.2, surchargeKpa: 0, wallTopNap: 4.75, toeNap: -6.25,
    layersHigh: s(16.6), lowSameAsHigh: false, layersLow: low, passiveMethod: "straight", gammaWater: 10, factors: rc("rc1-cur").factors, cur: cur(1.2),
    loads: [{ side: "high", kind: "strip", value: 20, fromM: 4.9, toM: 11 }, { side: "high", kind: "strip", value: 20, fromM: 0.2, toM: 10.2 }],
    anchor: { enabled: true, kind: "strut", levelNap: 3.9, angleDeg: 0, rigid: false, stiffnessKnPerM: (2.1e8 * 1e-3) / 38, spacingM: 1 },
    extraSupports: [{ enabled: true, kind: "strut", levelNap: 1.51, angleDeg: 0, rigid: false, stiffnessKnPerM: (2e7 * 0.3) / 38, spacingM: 1 }],
    phases: [
      { name: "1", excavationNap: 3.5, loadIds: ["B1"] },
      { name: "2", excavationNap: 0.96, waterLowNap: 0.9, install: ["A1"], loadIds: ["B2"] },
      { name: "3", excavationNap: 1.26 },
      { name: "4", install: ["A2"], remove: ["A1"] },
    ] };
}

type Value = { step: string; phase?: number; what: "M" | "V" | "u" | "A" | "mob"; source: number };
/** Waarde van de module bij een regel van de bron: M, V, A per m wand (A axiaal, maal de factor bij "6.5 × factor"), u in mm, mob in %. */
function moduleValue(r: WallOk, v: Value, support = 0): number {
  const c = r.cases.find((x) => x.stepId === v.step && (v.phase === undefined || x.phase === v.phase))!;
  const f = v.step === "6.5" && (v.what === "M" || v.what === "V" || v.what === "A") && v.source < 0 ? c.resultFactor : 1;
  const run = c.run;
  const value = v.what === "M" ? Math.abs(run.maxMoment.value) : v.what === "V" ? Math.abs(run.maxShear.value) : v.what === "u" ? Math.abs(run.maxDisplacement.value) * 1000 : v.what === "A" ? run.supports[support].axialKn : 100 * run.passive.ratio;
  return value * f;
}
/** Toets met de vaste tolerantie; een negatieve bronwaarde betekent "6.5 maal de factor". */
function compare(r: WallOk, list: Value[], support = 0) {
  for (const v of list) {
    const got = moduleValue(r, v, support), src = Math.abs(v.source), label = `${v.what} stap ${v.step}${v.phase !== undefined ? ` fase ${v.phase + 1}` : ""}: module ${got.toFixed(2)}, bron ${src}`;
    if (v.what === "mob") expect(Math.abs(got - src), label).toBeLessThan(10);
    else expect(Math.abs(got / src - 1), label).toBeLessThan(v.what === "u" ? 0.25 : 0.15);
  }
}

describe("nr. 6: bestaande kade met groutankers, drie fasen (bron p. 23)", () => {
  const r = ok(case06());
  it("6.1 en 6.2 vervallen (vrij water aan de lage zijde), zoals in de bron", () => expect([...new Set(r.cases.map((c) => c.stepId))]).toEqual(["6.3", "6.4", "6.5"]));
  it("moment, dwarskracht, verplaatsing, ankerkracht en aangesproken weerstand per fase en stap", () => compare(r, [
    { step: "6.3", phase: 0, what: "M", source: 21.21 }, { step: "6.4", phase: 0, what: "M", source: 26.51 }, { step: "6.5", phase: 0, what: "M", source: 15.38 }, { step: "6.5", phase: 0, what: "u", source: 10.8 },
    { step: "6.3", phase: 1, what: "M", source: 23.22 }, { step: "6.4", phase: 1, what: "M", source: 29.48 }, { step: "6.5", phase: 1, what: "M", source: 17.89 }, { step: "6.5", phase: 1, what: "u", source: 12.8 },
    { step: "6.3", phase: 2, what: "M", source: 22.87 }, { step: "6.4", phase: 2, what: "M", source: 32.74 }, { step: "6.5", phase: 2, what: "M", source: 20.47 }, { step: "6.5", phase: 2, what: "u", source: 15.0 },
    { step: "6.3", phase: 2, what: "V", source: 24.45 }, { step: "6.4", phase: 2, what: "V", source: 26.8 }, { step: "6.5", phase: 2, what: "V", source: 18.09 },
    { step: "6.3", phase: 0, what: "A", source: 22.64 }, { step: "6.4", phase: 0, what: "A", source: 19.99 }, { step: "6.5", phase: 0, what: "A", source: -14.35 },
    { step: "6.3", phase: 1, what: "A", source: 25.94 }, { step: "6.4", phase: 1, what: "A", source: 23.0 }, { step: "6.5", phase: 1, what: "A", source: -17.03 },
    { step: "6.3", phase: 2, what: "A", source: 33.19 }, { step: "6.4", phase: 2, what: "A", source: 29.87 }, { step: "6.5", phase: 2, what: "A", source: -20.26 },
    { step: "6.3", phase: 2, what: "mob", source: 38.3 }, { step: "6.4", phase: 2, what: "mob", source: 40.4 },
  ]));
});

describe("nr. 5: bouwput met stempelraam en keldervloer, vier fasen (bron p. 36)", () => {
  const r = ok(case05());
  it("alle stappen 6.1 tot en met 6.5: in de put staat het water onder de bodem", () => expect([...new Set(r.cases.map((c) => c.stepId))]).toEqual(["6.1", "6.2", "6.3", "6.4", "6.5"]));
  it("moment per fase en stap; fase 1 stap 6.5 ligt buiten de tolerantie (VERIFICATIE.md 16.4)", () => compare(r, [
    { step: "6.1", phase: 0, what: "M", source: 24.12 }, { step: "6.2", phase: 0, what: "M", source: 15.73 }, { step: "6.3", phase: 0, what: "M", source: 26.16 }, { step: "6.4", phase: 0, what: "M", source: 16.81 },
    { step: "6.1", phase: 1, what: "M", source: 288.63 }, { step: "6.2", phase: 1, what: "M", source: 269.53 }, { step: "6.3", phase: 1, what: "M", source: 300.63 }, { step: "6.4", phase: 1, what: "M", source: 285.1 }, { step: "6.5", phase: 1, what: "M", source: 189.5 },
    { step: "6.1", phase: 2, what: "M", source: 289.7 }, { step: "6.2", phase: 2, what: "M", source: 270.57 }, { step: "6.3", phase: 2, what: "M", source: 302.83 }, { step: "6.4", phase: 2, what: "M", source: 286.97 }, { step: "6.5", phase: 2, what: "M", source: 190.45 },
    { step: "6.1", phase: 3, what: "M", source: 169.76 }, { step: "6.2", phase: 3, what: "M", source: 188.36 }, { step: "6.3", phase: 3, what: "M", source: 183.53 }, { step: "6.4", phase: 3, what: "M", source: 206.1 }, { step: "6.5", phase: 3, what: "M", source: 113.83 },
    { step: "6.3", phase: 1, what: "V", source: 122.73 }, { step: "6.4", phase: 3, what: "V", source: 195.73 },
    { step: "6.5", phase: 1, what: "u", source: 37.5 }, { step: "6.5", phase: 2, what: "u", source: 37.3 }, { step: "6.5", phase: 3, what: "u", source: 36.7 },
  ]));
  it("stempelkracht van het raam (fase 2 en 3) en van de keldervloer (fase 4)", () => {
    compare(r, [{ step: "6.1", phase: 1, what: "A", source: 124.85 }, { step: "6.3", phase: 1, what: "A", source: 127.99 }, { step: "6.4", phase: 1, what: "A", source: 124.28 }, { step: "6.5", phase: 1, what: "A", source: -111.31 }, { step: "6.3", phase: 2, what: "A", source: 128.76 }]);
    compare(r, [{ step: "6.1", phase: 3, what: "A", source: 225.59 }, { step: "6.2", phase: 3, what: "A", source: 246.74 }, { step: "6.3", phase: 3, what: "A", source: 232.76 }, { step: "6.4", phase: 3, what: "A", source: 255.07 }, { step: "6.5", phase: 3, what: "A", source: -210.37 }]);
  });
  it("de omhullende: grootste moment 302,83 kNm/m (fase 3, stap 6.3) en grootste stempelkrachten 128,76 en 255,07 kN/m", () => {
    expect(Math.abs(Math.abs(r.uls.maxMoment.value) / 302.83 - 1)).toBeLessThan(0.15);
    expect(Math.abs(r.uls.supports.find((x) => x.id === "A1")!.axialKn / 128.76 - 1)).toBeLessThan(0.15); expect(Math.abs(r.uls.supports.find((x) => x.id === "A2")!.axialKn / 255.07 - 1)).toBeLessThan(0.15);
  });
});

describe("nr. 13: lichte damwand met één anker (bron p. 4 en 29)", () => {
  const r = ok(case13());
  it("ankerkracht, dwarskracht en de uitkomsten van stap 6.5 binnen de tolerantie; het moment in 6.3 en 6.4 ligt 15 tot 19 % lager (VERIFICATIE.md 16.3)", () => compare(r, [
    { step: "6.3", what: "A", source: 26.35 }, { step: "6.4", what: "A", source: 28.64 }, { step: "6.5", what: "A", source: -20.4 },
    { step: "6.3", what: "V", source: 15.6 }, { step: "6.4", what: "V", source: 15.5 }, { step: "6.5", what: "M", source: 3.8 }, { step: "6.5", what: "V", source: 8.8 }, { step: "6.5", what: "u", source: 14.3 },
    { step: "6.5", what: "mob", source: 48.7 },
  ]));
});

describe("nr. 20, profiel B: kunststof damwand met ankerstang (bron p. 15)", () => {
  const r = ok(case20());
  it("ankerkracht, dwarskracht en de uitkomsten van stap 6.5 binnen de tolerantie; het moment met rekenwaarden ligt 19 tot 25 % lager (VERIFICATIE.md 16.3)", () => compare(r, [
    { step: "6.3", what: "A", source: 42.09 }, { step: "6.4", what: "A", source: 45.06 }, { step: "6.5", what: "A", source: -29.5 },
    { step: "6.3", what: "V", source: 23.6 }, { step: "6.4", what: "V", source: 23.7 }, { step: "6.5", what: "M", source: 6.4 }, { step: "6.5", what: "V", source: 13.3 }, { step: "6.5", what: "u", source: 30.1 },
  ]));
});
