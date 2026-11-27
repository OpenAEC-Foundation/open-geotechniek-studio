// Bouwfasering en meer steunpunten: elke fase rekent verder vanaf de vervormde wand en de grondveren van de vorige.
// Zie VERIFICATIE.md, hoofdstuk 12.
import { describe, expect, it } from "vitest";
import { computeWall, revetmentExample, wallExample, DEFAULT_GROUT, type WallInput, type WallOk, type WallRun } from "./compute";

const ok = (i: WallInput): WallOk => { const r = computeWall(i); if (!r.ok) throw new Error(r.error); return r; };
const lastOf = <T>(list: T[]): T => list[list.length - 1];
const key = (r: WallOk) => [r.uls.maxMoment.value, r.uls.maxShear.value, r.sls.headDisplacementM, r.uls.anchor?.horizontalKn ?? null, r.uls.passive.ratio, r.governing.uc, r.checks.length];
/** Som van de horizontale krachten op de wand: grond en water aan beide zijden en de steunpunten [kN/m]. */
const balance = (run: WallRun) => run.rows.reduce((sum, row) => sum + ((row.high?.pressureKpa ?? 0) + row.uHighKpa - (row.low?.pressureKpa ?? 0) - row.uLowKpa) * (row.topNap - row.bottomNap), 0) - run.supports.reduce((sum, x) => sum + x.horizontalKn, 0);

describe("één fase met één steunpunt: uitkomsten gelijk aan de versie zonder fasering", () => {
  // Uitkomsten van de module vóór de fasering (zelfde invoer), op twaalf cijfers: M, V, y kop (representatief), anker horizontaal, aangesproken passief, maatgevende u.c., aantal toetsen.
  const before: Record<string, Array<number | null>> = {
    base: [-89.751292296, 56.6792439805, 0.00517078550926, 62.5012448636, 0.530128712832, 0.577457852436, 5],
    grout: [-91.7710159932, 57.4552641992, 0.00215842888749, 63.2808054364, 0.52604214358, 0.676916932638, 8],
    cant: [450.218423241, 181.654812095, 0.0828678388889, null, 0.415416044776, 0.88921766044, 5],
    plank: [2.98542550222, -3.85744389785, 0.0167530101376, null, 0.325203999691, 0.638466576057, 4],
    posts: [3.00333696749, -3.86633585041, 0.00796077263824, null, 0.145728368985, 0.554238947606, 6],
    // Starre steun: de grootste dwarskracht was −101,6 kN/m, een piek binnen de band van 4 cm waarover de steun is
    // uitgesmeerd, groter dan de steunkracht zelf (96,7 kN/m). Binnen de band geldt nu de sprong van boven naar onder;
    // de grootste dwarskracht ligt dan net onder de steun. De overige uitkomsten zijn gelijk gebleven.
    rigid: [-91.8465533202, 64.9127253730, -0.00148324075216, 96.7135760421, 0.501325896174, 0.577457852436, 5],
  };
  const base = wallExample();
  const inputs: Record<string, WallInput> = {
    base, grout: { ...base, anchor: { ...base.anchor, kind: "grout", angleDeg: 30, grout: { ...DEFAULT_GROUT, prestressKn: 100, shaftFrictionKpa: 150 } } },
    cant: { ...base, anchor: { ...base.anchor, enabled: false }, toeNap: -12 }, plank: revetmentExample("plank"), posts: revetmentExample("posts"), rigid: { ...base, anchor: { ...base.anchor, rigid: true } },
  };
  for (const [name, input] of Object.entries(inputs)) it(name, () => {
    const got = key(ok(input));
    got.forEach((v, k) => (v === null ? expect(before[name][k]).toBeNull() : expect(v).toBeCloseTo(before[name][k]!, 9)));
  });

  it("dezelfde invoer als één uitgeschreven fase met het anker geeft precies hetzelfde", () => {
    const a = ok(base), b = ok({ ...base, phases: [{ name: "ontgraven", install: ["A1"] }] });
    expect(key(b)).toEqual(key(a));
    expect(b.cases.map((c) => c.stepId)).toEqual(["uls", "sls"]);
  });
});

describe("bouwfasen", () => {
  const base = wallExample();
  const cantilever: WallInput = { ...base, anchor: { ...base.anchor, enabled: false }, toeNap: -12 };

  it("een fase zonder verandering: de wand blijft staan, op de reststijfheid van de veren op hun grens na", () => {
    // In één stap levert een veer voorbij zijn grens nog 10⁻⁴·kh maal de verplaatsing voorbij de grens (VERIFICATIE.md 3).
    // De volgende fase begint de grens op de stand van nu: dat restje valt weg (hier 2,5 % op de verplaatsing van een
    // onverankerde wand vlak bij bezwijken), daarna verandert er niets meer.
    const r = ok({ ...cantilever, phases: [{ name: "1" }, { name: "2" }, { name: "3" }] }), [p1, p2, p3] = r.cases.filter((c) => c.stepId === "uls").map((c) => c.run);
    expect(Math.abs(p2.headDisplacementM / p1.headDisplacementM - 1)).toBeLessThan(0.03);
    expect(Math.abs(p3.headDisplacementM / p2.headDisplacementM - 1)).toBeLessThan(0.001); expect(Math.abs(p3.maxMoment.value / p2.maxMoment.value - 1)).toBeLessThan(0.001);
    // Een verankerde wand ver van bezwijken: binnen 0,5 %.
    const anchored = ok({ ...base, phases: [{ name: "1", install: ["A1"] }, { name: "2" }] }), [a1, a2] = anchored.cases.filter((c) => c.stepId === "sls").map((c) => c.run);
    expect(Math.abs(a2.headDisplacementM / a1.headDisplacementM - 1)).toBeLessThan(0.005); expect(Math.abs(a2.anchor!.horizontalKn / a1.anchor!.horizontalKn - 1)).toBeLessThan(0.005);
  });

  it("lineair-elastisch: in twee stappen ontgraven geeft hetzelfde als in één keer", () => {
    // Superpositie: zolang geen veer zijn grens haalt, hangt de eindstand niet af van de weg ernaartoe. Stijve, zeer
    // sterke klei (ongedraineerd, cu = 500 kPa): de actieve grens is 0 en de passieve grens ver weg.
    const clay = { ...cantilever.layersHigh[0], topNap: 0, name: "klei", phi: 0, c: 0, delta: 0, undrained: true, cu: 500, gamma: 18, gammaSat: 18, kh: 40000 };
    // Alleen de bovenste veren aan de hoge zijde komen op hun grens (daar begint p0 bij 20 kPa en is pa = 0); die blijven daar in beide wegen.
    const stiff: WallInput = { ...cantilever, excavationNap: -1, waterHighNap: -6, waterLowNap: -6, surchargeKpa: 20, toeNap: -6, layersHigh: [clay], lowSameAsHigh: true };
    const direct = ok(stiff), staged = ok({ ...stiff, phases: [{ name: "1", excavationNap: -0.5 }, { name: "2", excavationNap: -1 }] });
    const last = lastOf(staged.cases.filter((c) => c.stepId === "sls")).run, d = direct.sls;
    expect(d.rows.filter((row) => row.high?.state !== "elastic" || (row.low && row.low.state !== "elastic")).every((row) => row.high?.state === "active" && row.topNap > -0.5)).toBe(true);
    expect(Math.abs(last.headDisplacementM / d.headDisplacementM - 1)).toBeLessThan(1e-6); expect(Math.abs(last.maxMoment.value / d.maxMoment.value - 1)).toBeLessThan(1e-6);
  });

  it("met plastische vervorming hangt de uitkomst wel van de weg af, en sluit het evenwicht in elke fase", () => {
    const staged = ok({ ...cantilever, phases: [{ name: "1", excavationNap: -3 }, { name: "2", excavationNap: -4 }, { name: "3", excavationNap: -3.5 }] });
    for (const c of staged.cases) expect(Math.abs(balance(c.run))).toBeLessThan(0.005 * c.run.passive.maxKn + 0.01);
    const still = ok({ ...cantilever, phases: [{ name: "1", excavationNap: -3 }, { name: "2", excavationNap: -4 }, { name: "3" }] });
    const sls = (r: WallOk) => r.cases.filter((c) => c.stepId === "sls").map((c) => c.run);
    // Terug aanvullen tot NAP −3,5 m: de wand veert maar een klein deel terug, en blijft verder uit dan na fase 1.
    expect(sls(staged)[2].headDisplacementM).toBeLessThan(sls(still)[2].headDisplacementM); expect(sls(staged)[2].headDisplacementM).toBeGreaterThan(sls(staged)[0].headDisplacementM);
    // Direct tot NAP −3,5 m ontgraven geeft een kleinere verplaatsing dan eerst tot −4 m en dan terug.
    expect(ok({ ...cantilever, excavationNap: -3.5 }).sls.headDisplacementM).toBeLessThan(sls(staged)[2].headDisplacementM);
  });

  it("een steunpunt dat later wordt aangebracht, werkt vanaf de vervormde stand: zonder verdere verandering geen kracht", () => {
    const strut: WallInput = { ...base, anchor: { ...base.anchor, kind: "strut", angleDeg: 0, levelNap: -0.5 }, toeNap: -12, phases: [{ name: "ontgraven", excavationNap: -3 }, { name: "stempel", install: ["A1"] }, { name: "verder", excavationNap: -4 }] };
    const r = ok(strut), runs = r.cases.filter((c) => c.stepId === "sls").map((c) => c.run);
    expect(runs[0].supports).toHaveLength(0);
    // Bijna nul: alleen het restje van de reststijfheid (zie hierboven) komt nog op de stempel.
    expect(Math.abs(runs[1].supports[0].horizontalKn)).toBeLessThan(0.5);
    expect(Math.abs(runs[1].headDisplacementM / runs[0].headDisplacementM - 1)).toBeLessThan(0.01);
    expect(runs[2].supports[0].horizontalKn).toBeGreaterThan(5);
    // Met de stempel komt er bij het verder ontgraven minder verplaatsing bij dan zonder.
    const free = ok({ ...strut, anchor: { ...strut.anchor, enabled: false } }).cases.filter((c) => c.stepId === "sls").map((c) => c.run);
    expect(runs[2].headDisplacementM - runs[1].headDisplacementM).toBeLessThan(0.5 * (free[2].headDisplacementM - free[1].headDisplacementM));
  });

  it("voorspanning drukt de wand terug en een verwijderd steunpunt draagt niets meer", () => {
    const phases = (p: number): WallInput => ({ ...base, anchor: { ...base.anchor, kind: "tie", prestressKn: p }, phases: [{ name: "1", excavationNap: -1.5 }, { name: "2", install: ["A1"] }, { name: "3", excavationNap: -4 }, { name: "4", remove: ["A1"] }] });
    const without = ok({ ...phases(0), toeNap: -12 }), withP = ok({ ...phases(150), toeNap: -12 });
    const run = (r: WallOk, k: number) => r.cases.filter((c) => c.stepId === "sls")[k].run;
    expect(run(withP, 1).supports[0].horizontalKn).toBeGreaterThan(20);
    expect(run(withP, 1).headDisplacementM).toBeLessThan(run(without, 1).headDisplacementM);
    expect(run(withP, 3).supports).toHaveLength(0);
    expect(run(withP, 3).headDisplacementM).toBeGreaterThan(run(withP, 2).headDisplacementM);
  });

  it("twee steunpunten op verschillende niveaus met elk een eigen stijfheid", () => {
    const two: WallInput = { ...base, groundHighNap: 0, excavationNap: -7, toeNap: -14, layersHigh: base.layersHigh.map((l) => ({ ...l, topNap: l.topNap === 0 ? 0 : -9 })),
      anchor: { ...base.anchor, levelNap: -1 }, extraSupports: [{ enabled: true, kind: "strut", levelNap: -4.5, angleDeg: 0, rigid: false, stiffnessKnPerM: 200000, spacingM: 4 }],
      phases: [{ name: "1", excavationNap: -2, install: [] }, { name: "2", install: ["A1"] }, { name: "3", excavationNap: -5.5 }, { name: "4", install: ["A2"] }, { name: "5", excavationNap: -7 }] };
    const r = ok(two), last = lastOf(r.cases.filter((c) => c.stepId === "uls")).run;
    expect(last.supports.map((x) => x.id)).toEqual(["A1", "A2"]);
    expect(last.supports[1].horizontalKn).toBeGreaterThan(0);
    expect(Math.abs(balance(last))).toBeLessThan(0.005 * last.passive.maxKn + 0.01);
    // De omhullende neemt per steunpunt de grootste kracht over alle fasen.
    for (const s of r.uls.supports) expect(s.horizontalKn).toBeGreaterThanOrEqual(Math.max(...r.cases.filter((c) => c.design).map((c) => c.run.supports.find((x) => x.id === s.id)?.horizontalKn ?? 0)) - 1e-9);
    expect(r.warnings.some((w) => /Blum is alleen uitgewerkt voor één steunpunt/.test(w))).toBe(true);
  });
});
