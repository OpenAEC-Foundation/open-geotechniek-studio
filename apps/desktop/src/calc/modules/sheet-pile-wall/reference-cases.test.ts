// Openbare berekening als vergelijking; bron, invoer en de verklaring per verschil staan in VERIFICATIE.md, hoofdstuk 6.
//
// Onverankerde stalen damwand als grond- en waterkering langs een rivier, één fase (openbaar rapport, 2022). De
// bron is een externe referentie-berekening met een verenmodel met drie takken per laag. Het rapport drukt de
// representatieve berekening (stap 6.5) volledig af en geeft van de berekening met rekenwaarden (stap 6.3) de
// uitkomsten. De module wijkt in de geometrie op één punt af: het maaiveld achter de wand is hier vlak, in de
// bron loopt het na 2 m af.
import { describe, expect, it } from "vitest";
import { contourModuli, drawingContour } from "../../library/sheetPileContour";
import { findSheetPile } from "../../library/sheetPiles";
import { CUR_FACTOR_SETS, CUR_STEPS, FACTOR_SETS, REPRESENTATIVE, buildScenario, computeWall, sidePoint, wallExample, type WallFactors, type WallInput, type WallLayer, type WallOk } from "./compute";

const ok = (i: WallInput): WallOk => { const r = computeWall(i); if (!r.ok) throw new Error(r.error); return r; };

interface Options { branches: boolean; excess: boolean; eiFactor: number; straight: boolean; gammaWater: number; factors: WallFactors }
/** Zoals de bron rekent: drie takken, wateroverspanning aan de lage zijde, EI × 0,66, recht glijvlak, γw = 9,81. */
const asSource: Options = { branches: true, excess: true, eiFactor: 0.66, straight: true, gammaWater: 9.81, factors: { ...REPRESENTATIVE } };
/** Zoals de eerste versie van de module rekende: één tak, hydrostatisch, volle EI, gekromd glijvlak, γw = 10. */
const firstVersion: Options = { branches: false, excess: false, eiFactor: 1, straight: false, gammaWater: 10, factors: { ...REPRESENTATIVE } };
/** Rekenwaarden van de bron (stap 6.3): RC3, lage beddingsconstanten, toeslag op kerende hoogte en waterstanden. */
const designFactors: WallFactors = { ...FACTOR_SETS[2].factors, gammaK: 1.3, deltaWaterHighM: 0.05, deltaWaterLowM: 0.25 };

function layers(o: Options, low: boolean): WallLayer[] {
  const k = (k1: number, k2: number, k3: number) => (o.branches ? { kh: k1, kh2: k2, kh3: k3 } : { kh: k1 });
  // De bron geeft de wateroverspanning aan de lage zijde per laag: de stijghoogte loopt met de diepte op naar het rivierpeil.
  const u = (top: number, bottom: number) => (o.excess && low ? { excessTop: top, excessBottom: bottom } : {});
  return [
    { topNap: 20.5, name: "dijksmateriaal", gamma: 18, gammaSat: 18, phi: 22.5, c: 0, delta: 15, undrained: false, cu: 0, ...k(2000, 800, 500) },
    { topNap: 19.5, name: "zand, opgebracht", gamma: 18, gammaSat: 20, phi: 30, c: 0, delta: 20, undrained: false, cu: 0, ...k(20000, 10000, 5000), ...u(0, 5.37) },
    { topNap: 16, name: "klei, zandhoudend", gamma: 18, gammaSat: 18, phi: 22.5, c: 3, delta: 15, undrained: false, cu: 0, ...k(4000, 2000, 800), ...u(5.37, 17.56) },
    { topNap: 10, name: "zand en grind, vast", gamma: 19, gammaSat: 21, phi: 35, c: 0, delta: 23.3, undrained: false, cu: 0, ...k(40000, 20000, 10000), ...u(17.56, 17.56) },
  ];
}
function riverWall(o: Options): WallInput {
  const base = wallExample();
  return {
    ...base, groundHighNap: 20.5, groundLowNap: 18.65, excavationNap: 18.65, waterHighNap: 20.44, waterLowNap: 18.65, surchargeKpa: 0, wallTopNap: 20.5, toeNap: 13, profileId: "GU 8N", grade: "S240GP",
    layersHigh: layers(o, false), lowSameAsHigh: false, layersLow: layers(o, true), anchor: { ...base.anchor, enabled: false },
    factors: o.factors, eiFactor: o.eiFactor, gammaWater: o.gammaWater, passiveMethod: o.straight ? "straight" : "auto",
  };
}
const shear = (r: WallOk) => ({ negative: Math.min(...r.uls.samples.map((p) => p.shearKn)), positive: Math.max(...r.uls.samples.map((p) => p.shearKn)) });
const within = (value: number, published: number, fraction: number) => expect(Math.abs(value / published - 1)).toBeLessThan(fraction);

describe("openbare referentieberekening: onverankerde damwand langs een rivier", () => {
  it("invoer zoals de bron: buigstijfheid, passieve coëfficiënt en waterdruk aan de lage zijde", () => {
    const i = riverWall(asSource), r = ok(i), low = buildScenario(i, REPRESENTATIVE).low;
    // Bron: EI 2,5221·10⁴ × 0,66 = 1,6646·10⁴ kNm²/m; Kp van het zand 5,74; waterspanning rechts 31,37 kPa op NAP +16,00 en 66,89 kPa op NAP +13,00.
    expect(r.eiKnM2).toBeCloseTo(16646, 0);
    expect(r.coefficients.find((c) => c.side === "low" && c.name === "zand, opgebracht")!.coef.kp).toBeCloseTo(5.74, 2);
    expect(sidePoint(low, 16.0001).u).toBeCloseTo(31.37, 1); expect(sidePoint(low, 13).u).toBeCloseTo(66.89, 1);
    // Passieve korreldruk rechts op NAP +16,17: bron 115,9 kPa.
    within(sidePoint(low, 16.17).soil!.pp, 115.9, 0.01);
  });

  it("representatieve berekening (stap 6.5): moment, dwarskracht en verplaatsing zoals de bron", () => {
    // Bron: M = 50,03 kNm/m; V = −28,48 en +26,96 kN/m; verplaatsing aan de kop 31,4 mm.
    const r = ok(riverWall(asSource)), v = shear(r);
    within(Math.abs(r.uls.maxMoment.value), 50.03, 0.05);
    within(-v.negative, 28.48, 0.05); within(v.positive, 26.96, 0.1);
    within(r.uls.headDisplacementM * 1000, 31.4, 0.1);
  });

  it("berekening met rekenwaarden (stap 6.3): moment, dwarskracht en aangesproken weerstand zoals de bron", () => {
    // Bron: Ms;d = 89,75 kNm/m; dwarskracht 48,93 kN/m; aangesproken passieve weerstand 62,3 %.
    const r = ok(riverWall({ ...asSource, factors: designFactors }));
    within(Math.abs(r.uls.maxMoment.value), 89.75, 0.05);
    within(Math.abs(r.uls.maxShear.value), 48.93, 0.05);
    expect(Math.abs(100 * r.uls.passive.ratio - 62.3)).toBeLessThan(5);
  });

  it("waar het verschil van de eerste versie vandaan kwam: stap voor stap van die versie naar de bron", () => {
    const moment = (o: Options) => Math.abs(ok(riverWall(o)).uls.maxMoment.value), head = (o: Options) => ok(riverWall(o)).uls.headDisplacementM * 1000;
    const first = moment(firstVersion);
    // 1. De bron rekent passief met het rechte glijvlak (Kp = 5,74 tegen 4,63 gekromd): dat verlaagt het moment.
    const straight: Options = { ...firstVersion, straight: true }, mStraight = moment(straight);
    expect(mStraight).toBeLessThan(0.92 * first);
    // 2. De wateroverspanning aan de lage zijde verhoogt het moment met ruim een vijfde: het grootste en onveilige verschil.
    const excess: Options = { ...straight, excess: true, gammaWater: 9.81 }, mExcess = moment(excess);
    expect(mExcess).toBeGreaterThan(1.2 * mStraight);
    // 3. Drie takken: het moment enkele procenten omhoog, de verplaatsing ruim een kwart.
    const three: Options = { ...excess, branches: true };
    expect(moment(three)).toBeGreaterThan(1.02 * mExcess); expect(moment(three)).toBeLessThan(1.08 * mExcess);
    expect(head(three)).toBeGreaterThan(1.2 * head(excess));
    // 4. De reductie op EI verandert het moment nauwelijks en vergroot de verplaatsing met een derde.
    expect(Math.abs(moment(asSource) / moment(three) - 1)).toBeLessThan(0.03); expect(head(asSource)).toBeGreaterThan(1.3 * head(three));
    // De eerste versie lag met rekenwaarden 15 % onder de bron.
    expect(Math.abs(ok(riverWall({ ...firstVersion, factors: { ...FACTOR_SETS[2].factors } })).uls.maxMoment.value)).toBeLessThan(0.9 * 89.75);
  });

  it("profieltoets met GU 8N in S240GP uit de bibliotheek (contour uit de fabriekstekening) naast de bron", () => {
    // Bron: M_s;d = 89,75 kNm/m tegen toelaatbaar 122,46 kNm/m na afroesting (1,2 mm per zijde in 100 jaar): u.c. 0,73.
    // De module rekent zonder afroesting: klasse 2, W_pl = 935 cm³/m, M_c;Rd = 224,4 kNm/m.
    const r = ok(riverWall({ ...asSource, factors: designFactors })), by = (id: string) => r.checks.find((c) => c.id === id)!;
    const p = findSheetPile("GU 8N")!, w = contourModuli(p);
    expect(drawingContour(p)).toBeDefined(); expect(Math.abs(w.wplCm3PerM / 935 - 1)).toBeLessThan(0.01); expect(Math.abs(w.welCm3PerM / 770 - 1)).toBeLessThan(0.01);
    expect(by("bending").resistance).toBeCloseTo((935 * 240) / 1000, 6); expect(by("bending").uc).toBeLessThan(89.75 / 122.46);
    // Wat de afroesting van de bron vraagt: 122,46 / 224,4 = 0,55 van het plastische moment zonder afroesting.
    expect(122.46 / by("bending").resistance).toBeCloseTo(0.546, 3);
    // Dwarskracht: A_v = 7,1 · (312 − 7,5) / 0,6 = 3 603 mm²/m, V_pl;Rd = 499 kN/m; normaalkracht 0.
    expect(by("shear").resistance).toBeCloseTo((((7.1 * 304.5) / 0.6) * 240) / Math.sqrt(3) / 1000, 6); expect(by("shear").uc).toBeLessThan(0.1);
    expect(by("normal").resistance).toBeCloseTo(by("bending").resistance, 9);
  });

  it("met het gekromde glijvlak van de module is er in dit geval met rekenwaarden geen evenwicht: de module is daar strenger dan de bron", () => {
    const r = computeWall(riverWall({ ...asSource, straight: false, factors: designFactors }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Geen evenwicht met rekenwaarden/);
  });

  it("stappenplan: 6.1 en 6.2 vervallen bij vrij water aan de lage zijde; 6.3, 6.4 en 6.5 zoals de bron", () => {
    // Bron (p. 15): 6.3 M 89,75, D 48,93, 62,3 %; 6.4 M 89,75, D 48,53, 62,1 %; 6.5 u 31,4 mm, M 50,03, D 28,48; 6.5 × 1,35 = 67,54 kNm/m.
    const rc3 = CUR_FACTOR_SETS.find((x) => x.id === "rc3-cur")!;
    const i: WallInput = { ...riverWall({ ...asSource, factors: rc3.factors }), cur: { enabled: true, skipFreeWater: true, steps: CUR_STEPS.map((s) => (s.id === "6.5" ? { ...s, resultFactor: rc3.resultFactor } : s)) } };
    const r = ok(i), step = (id: string) => r.cases.find((c) => c.stepId === id)!;
    expect(r.cases.map((c) => c.stepId)).toEqual(["6.3", "6.4", "6.5"]);
    expect(r.warnings.some((w) => /Stap 6\.1, 6\.2 vervalt/.test(w))).toBe(true);
    // 6.3 is dezelfde berekening als de losse berekening met de rekenwaarden van de bron hierboven.
    const single = ok(riverWall({ ...asSource, factors: designFactors }));
    expect(step("6.3").run.maxMoment.value).toBeCloseTo(single.uls.maxMoment.value, 9);
    within(Math.abs(step("6.4").run.maxMoment.value), 89.75, 0.05); within(Math.abs(step("6.4").run.maxShear.value), 48.53, 0.05);
    expect(Math.abs(100 * step("6.4").run.passive.ratio - 62.1)).toBeLessThan(5);
    within(Math.abs(step("6.5").run.maxMoment.value), 50.03, 0.05); within(r.sls.headDisplacementM * 1000, 31.4, 0.1);
    // De omhullende: het grootste van 6.3, 6.4 en 1,35 × 6.5.
    const m = Math.max(...r.cases.map((c) => Math.abs(c.run.maxMoment.value) * c.resultFactor));
    expect(Math.abs(r.uls.maxMoment.value)).toBeCloseTo(m, 9); within(Math.abs(r.uls.maxMoment.value), 89.75, 0.05);
    expect(r.checks.find((c) => c.id === "bending")!.load).toBeCloseTo(m, 9);
  });
});
