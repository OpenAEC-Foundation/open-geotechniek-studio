// Controleberekeningen voor de fundering op staal. De verwachte getallen komen uit openbare
// uitgewerkte voorbeelden (een HBO-reader geotechniek, funderingsadviezen en constructie-
// berekeningen bij vergunningen, en uitgewerkte Eurocode 7-voorbeelden); VERIFICATIE.md
// geeft per voorbeeld de herkomst en verklaart elk verschil. Een marge in procenten staat
// er alleen waar de bron zelf afrondt of anders rekent, met de reden erbij.
import { describe, expect, it } from "vitest";
import { DEFAULT_FACTORS, FACTOR_SETS, soilTypeForZone } from "./catalog";
import { bearingFactors, computeSpread, drainedBearing, effectiveDims, influenceRatios, layersFromCpt, overturning, undrainedBearing, type SpreadInput, type SpreadLayer, type SpreadOk } from "./compute";
import type { Cpt } from "../../../types/cpt";

const L = (topNap: number, name: string, gamma: number, gammaSat: number, phi: number, c = 0, cu = 0): SpreadLayer => ({ topNap, name, gamma, gammaSat, phi, c, cu });
const base: SpreadInput = {
  cptId: null, shape: "strip", widthM: 1, lengthM: 1, foundationNap: 0, groundNap: 0, waterNap: -50, vDKn: 100, hDKn: 0, hDirection: "B", hArmM: 0, eccBM: 0, eccLM: 0, momentDKnm: 0,
  slopeDeg: 0, baseTiltDeg: 0, castInPlace: true, passiveDKn: 0, gapPossible: false, factors: DEFAULT_FACTORS, layers: [L(0, "zand", 18, 20, 32.5)],
};
const run = (patch: Partial<SpreadInput>): SpreadOk => { const r = computeSpread({ ...base, ...patch }); if (!r.ok) throw new Error(r.error); return r; };
const check = (r: SpreadOk, id: string) => { const c = r.checks.find((x) => x.id === id || x.id.startsWith(id)); if (!c) throw new Error(`toets ${id} ontbreekt: ${r.checks.map((x) => x.id).join(", ")}`); return c; };
/** Binnen `pct` procent van de waarde uit de bron. */
const within = (actual: number, expected: number, pct: number) => expect(Math.abs(actual - expected) / Math.abs(expected) * 100).toBeLessThanOrEqual(pct);

describe("bouwstenen", () => {
  it("draagkrachtfactoren volgens de tabel in de reader", () => {
    for (const [phi, nc, nq, ng] of [[20, 14.8, 6.4, 3.9], [25, 20.6, 10.6, 9.0], [30, 30.0, 18.3, 20.0], [35, 45.9, 33.1, 45.0], [40, 74.9, 63.8, 105.3]]) {
      const f = bearingFactors(phi);
      // De tabel rondt af op één decimaal; bij 30° en 40° wijkt de laatste decimaal af.
      expect(f.nc).toBeCloseTo(nc, 0); expect(f.nq).toBeCloseTo(nq, 0); within(f.ngamma, ng, 1.5);
    }
    expect(bearingFactors(0)).toEqual({ nq: 1, nc: Math.PI + 2, ngamma: 0 });
  });
  it("invloedsdiepte en -breedte uit de tabel, lineair in φ' en in H/V", () => {
    expect(influenceRatios(30, 0).ae).toBeCloseTo(4.29, 9); expect(influenceRatios(30, 0).ze).toBeCloseTo(1.59, 9);
    expect(influenceRatios(30, 1).ae).toBeCloseTo(1.62, 9); expect(influenceRatios(30, 1).ze).toBeCloseTo(0.59, 9);
    expect(influenceRatios(31.2, 0.083).ze).toBeCloseTo(1.58, 2); // reader, stap 1b
    expect(influenceRatios(0, 0.083).ze).toBeCloseTo(0.68, 2); // reader, ongedraineerd
  });
  it("effectieve afmetingen: b' = B − 2e, en b' is de kleinste maat", () => {
    const d = effectiveDims(false, 3, 2, 100, 20, 0, "B")!;
    expect(d.bRawM).toBeCloseTo(2.6, 9); expect(d.bEffM).toBe(2); expect(d.lEffM).toBeCloseTo(2.6, 9); expect(d.hAlongWidth).toBe(false);
    expect(effectiveDims(true, 1, 1, 100, 60, 0, "B")).toBeNull();
  });
  it("horizontale belasting evenwijdig aan L reduceert lineair, evenwijdig aan B met de derde macht", () => {
    const p = { bEffM: 1, lEffM: 3, ratio: 1 / 3, vKn: 100, hKn: 20, phiD: 30, cD: 0, gammaD: 10, qKpa: 10, slopeDeg: 0, baseTiltDeg: 0 };
    const along = drainedBearing({ ...p, hAlongWidth: false }), across = drainedBearing({ ...p, hAlongWidth: true });
    expect(along.iq).toBeCloseTo(0.8, 9); expect(along.igamma).toBeCloseTo(0.8, 9);
    expect(across.iq).toBeCloseTo(0.86 ** 3, 9); expect(across.igamma).toBeCloseTo(0.8 ** 3, 9);
  });
  it("φ' = 0 gedraineerd valt samen met de ongedraineerde formule", () => {
    const d = drainedBearing({ bEffM: 2, lEffM: 4, ratio: 0.5, vKn: 500, hKn: 100, hAlongWidth: true, phiD: 0, cD: 50, gammaD: 8, qKpa: 12, slopeDeg: 0, baseTiltDeg: 0 });
    const u = undrainedBearing({ bEffM: 2, lEffM: 4, ratio: 0.5, hKn: 100, cuD: 50, qKpa: 12, slopeDeg: 0, baseTiltDeg: 0 });
    expect(d.sigmaMaxKpa).toBeCloseTo(u.sigmaMaxKpa, 9);
  });
  it("een hellende onderkant en een hellend maaiveld verlagen het draagvermogen", () => {
    const flat = run({}), tilted = run({ baseTiltDeg: 10 }), sloped = run({ slopeDeg: 10 });
    expect(tilted.drained.bearing.sigmaMaxKpa).toBeLessThan(flat.drained.bearing.sigmaMaxKpa);
    expect(sloped.drained.bearing.sigmaMaxKpa).toBeLessThan(flat.drained.bearing.sigmaMaxKpa);
    expect(tilted.drained.bearing.bq).toBeCloseTo((1 - (10 * Math.PI / 180) * Math.tan(tilted.drained.phiD * Math.PI / 180)) ** 2, 9);
  });
  it("weigert ongeldige invoer", () => {
    for (const patch of [{ widthM: 0 }, { vDKn: 0 }, { hDKn: -1 }, { layers: [] }, { foundationNap: 1 }, { slopeDeg: 50 }, { zeManualM: 0 }, { factors: { ...DEFAULT_FACTORS, gammaPhi: 0.9 } }, { eccBM: 0.5 }, { layers: [L(0, "a", 18, 20, 30), L(0, "b", 18, 20, 30)] }] as Array<Partial<SpreadInput>>)
      expect(computeSpread({ ...base, ...patch }).ok).toBe(false);
  });
});

describe("invloedsdiepte", () => {
  const layered = [L(0, "zand los", 17, 19, 30), L(-1, "zand vast", 19, 21, 37.5)];
  it("legt de iteratiestappen vast en convergeert", () => {
    const r = run({ layers: layered });
    const it = r.drained.iterations;
    expect(r.drained.converged).toBe(true);
    expect(it.length).toBeGreaterThan(1);
    expect(it[0].zeM).toBeCloseTo(1.5, 9); // begin: 1,5·b'
    for (let k = 1; k < it.length; k++) expect(it[k].zeM).toBeCloseTo(it[k - 1].zeNextM, 9);
    expect(Math.abs(it[it.length - 1].zeNextM - it[it.length - 1].zeM)).toBeLessThan(0.001);
    expect(r.drained.zeM).toBeCloseTo(influenceRatios(r.drained.phiRepDeg, 0).ze, 2);
    expect(r.warnings.join(" ")).not.toMatch(/niet geconvergeerd/);
  });
  it("homogene grond: de invloedsdiepte volgt in één keer uit de tabel", () => {
    const r = run({});
    expect(r.drained.zeM).toBeCloseTo(1.745, 3);
    expect(r.drained.phiD).toBeCloseTo(28.99, 2);
  });
  it("met de hand vastgezet: geen iteratie, de gemiddelden volgen de opgegeven diepte", () => {
    const shallow = run({ layers: layered, zeManualM: 0.8 }), deep = run({ layers: layered, zeManualM: 4 });
    expect(shallow.drained.zeManual).toBe(true); expect(shallow.drained.zeM).toBe(0.8);
    expect(shallow.drained.phiRepDeg).toBeCloseTo(30, 9); // alleen de bovenste laag
    expect(deep.drained.phiRepDeg).toBeGreaterThan(31);
    expect(check(deep, "bearing-drained").steps.some((s) => /vastgezet/.test(s.formula))).toBe(true);
  });
});

// ─── V1 tot en met V4: Reader Geotechniek voor het HBO, hoofdstuk 6 ──────────────────────

describe("V1-V3 reader, voorbeeld 1: landhoofd op staal (strook, gelaagd, schuin en excentrisch belast)", () => {
  const layers = [L(18.3, "zand, matig gepakt", 18, 20, 33), L(16.0, "klei, vast", 20, 21, 25, 20, 150), L(15.0, "zand, vast gepakt", 19, 21, 35)];
  const situationA: Partial<SpreadInput> = { widthM: 3, foundationNap: 17.5, groundNap: 18.3, waterNap: 16.0, vDKn: 600, hDKn: 50, hArmM: 1.7, eccBM: 0.2, layers };

  it("V1 gedraineerd, geval b: σ'max;d = 235 kPa (bron), met talud 13°", () => {
    const r = run({ ...situationA, slopeDeg: 13 }), d = r.drained, b = d.bearing;
    expect(r.dims.bRawM).toBeCloseTo(2.32, 2);
    expect(r.qKpa).toBeCloseTo(13.1, 1);
    expect(d.zeM).toBeCloseTo(3.66, 1); // bron rondt het niveau af op NAP +13,8 m
    expect(d.phiRepDeg).toBeCloseTo(31.2, 1);
    expect(d.phiD).toBeCloseTo(27.9, 0); expect(d.cD).toBeCloseTo(3.1, 1); expect(d.gammaD).toBeCloseTo(13.8, 1);
    expect(b.nq).toBeCloseTo(14.6, 0); expect(b.nc).toBeCloseTo(25.7, 0); expect(b.ngamma).toBeCloseTo(14.4, 0);
    expect(b.iq).toBeCloseTo(0.84, 2); within(b.igamma, 0.78, 1); expect(b.ic).toBeCloseTo(0.83, 2); // iγ = 0,775
    expect(b.lambdaC).toBeCloseTo(0.77, 2); expect(b.lambdaQ).toBeCloseTo(0.61, 2); expect(b.lambdaGamma).toBeCloseTo(0.48, 2);
    // De bron rekent met afgeronde tussenwaarden (φ' 27,9°, tabelwaarden voor N): 235 kPa; de module 231 kPa.
    within(b.sigmaMaxKpa, 235, 2);
    expect(check(r, "bearing-drained").passes).toBe(false); // de bron: "voldoet NIET"
  });
  it("V1 met de afgeronde tussenwaarden van de bron volgt 235 kPa, en 259 kPa met de taludverharding", () => {
    const p = { bEffM: 2.32, lEffM: 1, ratio: 0, vKn: 600, hKn: 50, hAlongWidth: true, phiD: 27.9, cD: 3.1, gammaD: 13.8, slopeDeg: 13, baseTiltDeg: 0 };
    // De bron vermenigvuldigt factoren die op twee decimalen zijn afgerond; dat scheelt ruim 1 %.
    within(drainedBearing({ ...p, qKpa: 13.1 }).sigmaMaxKpa, 235, 1.5);
    within(drainedBearing({ ...p, qKpa: 16.2 }).sigmaMaxKpa, 259, 1.5);
    // Met de afgeronde factoren van de bron zelf: 3,1·25,7·0,83·0,77 + 13,1·14,6·0,84·0,61 + ½·2,32·13,8·14,4·0,78·0,48.
    expect(3.1 * 25.7 * 0.83 * 0.77 + 13.1 * 14.6 * 0.84 * 0.61 + 0.5 * 2.32 * 13.8 * 14.4 * 0.78 * 0.48).toBeCloseTo(235, 0);
  });
  it("V2 doorponsen op de klei: fictief vlak NAP +16,0 m, spreiding 8°", () => {
    const flat = run(situationA), p = flat.punch[0], u = p.undrained!;
    expect(p.levelNap).toBe(16.0);
    expect(p.widthM).toBeCloseTo(3.42, 2);
    expect(p.deltaVKn).toBeCloseTo(104.0, 0); expect(p.vKn).toBeCloseTo(704, 0);
    expect(u.dims.bRawM).toBeCloseTo(2.63, 2);
    expect(p.qKpa).toBeCloseTo(37.6, 1); // (18,3 − 16,0) · 18 / 1,1
    expect(u.bearing.ic).toBeCloseTo(0.96, 2);
    // Ongedraineerd, zonder taludreductie zoals de bron: 586 kPa en 1541 kN/m. De bron rondt ic af op 0,96.
    within(u.bearing.sigmaMaxKpa, 586, 1); within(u.resistanceKn, 1541, 1);
    // Gedraineerd, met talud: de bron geeft 412 kPa, maar neemt ic over uit stap 1d (0,83 in plaats van 0,85).
    const sloped = run({ ...situationA, slopeDeg: 13 }).punch[0].drained!;
    expect(sloped.phiD).toBeCloseTo(27.3, 0); expect(sloped.cD).toBeCloseTo(5.3, 0); expect(sloped.gammaD).toBeCloseTo(9.1, 1);
    expect(sloped.bearing.iq).toBeCloseTo(0.86, 2); expect(sloped.bearing.igamma).toBeCloseTo(0.81, 2);
    within(sloped.bearing.sigmaMaxKpa, 412, 2);
  });
  it("V3 afschuiven met de kleinste verticale belasting: Rh;d = 63,9 kN/m", () => {
    const r = run({ ...situationA, vMinDKn: 113 });
    expect(check(r, "sliding-drained").resistanceKn).toBeCloseTo(63.9, 0);
    // Ongedraineerd rekent de bron cu;d · b' = 150/1,35 · 1,1 = 122,2 kN/m; hier met klei direct onder de voet.
    const clay = run({ widthM: 3, vDKn: 113, hDKn: 50, hArmM: 1.7, eccBM: 0.2, layers: [L(0, "klei", 20, 21, 25, 20, 150)] });
    within(check(clay, "sliding-undrained").resistanceKn, 122.2, 0.5);
  });
});

describe("V4 reader, voorbeeld 3: L-keermuur op staal (keermuurfactoren, helling 10°)", () => {
  const input: Partial<SpreadInput> = {
    widthM: 2.5, foundationNap: 2.1, groundNap: 3.09, waterNap: 2.1, vDKn: 153.4, hDKn: 24.82, momentDKnm: 153.4 * 0.005, slopeDeg: 10, castInPlace: false, vMinDKn: 89.8,
    factors: FACTOR_SETS[1].factors, layers: [L(3.09, "aanvulling", 18, 20, 30), L(2.1, "zand, los", 17, 19, 30)],
  };
  it("gedraineerd draagvermogen 120,94 kPa en 301,3 kN/m", () => {
    const r = run(input), b = r.drained.bearing;
    expect(r.dims.bRawM).toBeCloseTo(2.49, 2);
    expect(r.drained.phiD).toBeCloseTo(25.7, 1); expect(r.drained.gammaD).toBeCloseTo(7.3, 1); expect(r.qKpa).toBeCloseTo(16.2, 1);
    expect(b.nq).toBeCloseTo(11.5, 1); expect(b.ngamma).toBeCloseTo(10.1, 1);
    expect(b.iq).toBeCloseTo(0.70, 2); expect(b.igamma).toBeCloseTo(0.59, 2);
    expect(b.lambdaQ).toBeCloseTo(0.69, 2); expect(b.lambdaGamma).toBeCloseTo(0.57, 2);
    within(b.sigmaMaxKpa, 120.94, 1.5); within(r.drained.resistanceKn, 301.3, 1.5);
  });
  it("afschuiven met δ = ⅔·φ'd: 27,7 kN/m", () => within(check(run(input), "sliding-drained").resistanceKn, 27.7, 0.5));
});

// ─── V5 tot en met V8: funderingsadviezen bij vergunningen ───────────────────────────────

describe("V5 funderingsadvies met strookdraagvermogen per breedte (gelaagd zand, ze en ae)", () => {
  const layers = [L(6.8, "dek", 17, 19, 30), L(5.3, "zand", 17, 19, 30), L(5.0, "zand", 18, 20, 32.5), L(4.0, "zand", 19, 21, 35)];
  it.each([[0.7, 63.1, 93.2, 1.12, 3.05], [1.0, 88.0, 119.4, 1.63, 4.48], [1.3, 112.9, 145.7, 2.15, 5.98], [1.6, 141.1, undefined, 2.69, 7.58]])("B = %s m", (b, sigma0, sigma150, ze, ae) => {
    const bare = run({ widthM: b, foundationNap: 5.8, groundNap: 5.8, waterNap: 5.0, layers });
    expect(bare.drained.bearing.sigmaMaxKpa).toBeCloseTo(sigma0, 1);
    expect(bare.drained.zeM).toBeCloseTo(ze, 2); expect(bare.drained.aeM).toBeCloseTo(ae, 2);
    // Bij 1,6 m kapt de bron de waarde met dekking af op het advies van 150 kPa.
    if (sigma150) expect(run({ widthM: b, foundationNap: 5.8, groundNap: 5.95, waterNap: 5.0, layers }).drained.bearing.sigmaMaxKpa).toBeCloseTo(sigma150, 1);
  });
});

describe("V6 funderingsadvies met stroken en vierkante poeren (grondwater binnen de invloedsdiepte)", () => {
  const layers = [L(3.75, "zand", 17, 19, 30), L(0.3, "klei, zandig", 18, 18, 27.5), L(0.0, "zand", 18, 20, 32.5)];
  it.each([[0.5, 45.4, 0.80, 2.15], [1.0, 77.5, 1.59, 4.29], [1.5, 102.5, 2.39, 6.44]])("strook %s m zonder dekking", (b, sigma, ze, ae) => {
    const r = run({ widthM: b, foundationNap: 2.75, groundNap: 2.75, waterNap: 2.0, layers });
    expect(r.drained.bearing.sigmaMaxKpa).toBeCloseTo(sigma, 1);
    // 0,5 · 1,59 = 0,795 m; de bron drukt 0,80 af.
    expect(Math.abs(r.drained.zeM - ze)).toBeLessThanOrEqual(0.0051); expect(Math.abs(r.drained.aeM - ae)).toBeLessThanOrEqual(0.0051);
  });
  it.each([[0.5, 31.8, 88.7, 22.2], [0.75, 44.3, 101.2, 56.9], [1.0, 54.3, 111.2, 111.2]])("poer %s × %s m: zonder dekking en met 200 mm", (b, sigma0, sigma200, rd200) => {
    const pad = { shape: "pad" as const, widthM: b, lengthM: b, foundationNap: 2.75, waterNap: 2.0, layers };
    expect(run({ ...pad, groundNap: 2.75 }).drained.bearing.sigmaMaxKpa).toBeCloseTo(sigma0, 1);
    const covered = run({ ...pad, groundNap: 2.95 });
    expect(covered.drained.bearing.sigmaMaxKpa).toBeCloseTo(sigma200, 1);
    expect(covered.drained.resistanceKn).toBeCloseTo(rd200, 1);
    expect(covered.drained.bearing.sgamma).toBeCloseTo(0.7, 9);
  });
});

describe("V7 berekening fundering op staal met doorponsen op een diepe siltlaag", () => {
  const layers = [L(17.63, "zand", 17, 19, 30), L(17.0, "zand", 18, 20, 32.5), L(14.0, "zand", 17, 19, 30), L(13.6, "silt", 18, 18, 27.5, 0, 20), L(11.0, "zand", 18, 20, 32.5), L(10.0, "veen", 12, 12, 15, 1, 30), L(9.5, "zand", 19, 21, 35)];
  const common = { foundationNap: 17.0, groundNap: 17.4, waterNap: 17.0, layers };
  it("strook 1,00 m: gedraineerd 171 kPa; ongedraineerd doorponsen 110 kPa op b' = 1,96 m", () => {
    const r = run({ ...common, widthM: 1 }), d = r.drained, p = r.punch.find((x) => x.levelNap === 13.6)!;
    expect(r.qKpa).toBeCloseTo(6.2, 1); expect(d.gammaD).toBeCloseTo(8.2, 1); expect(d.phiD).toBeCloseTo(29.0, 1); expect(d.zeM).toBeCloseTo(1.7, 1);
    expect(d.bearing.nc).toBeCloseTo(27.8, 0); expect(d.bearing.nq).toBeCloseTo(16.4, 1); expect(d.bearing.ngamma).toBeCloseTo(17.1, 1);
    expect(d.bearing.termQ).toBeCloseTo(101, 0); expect(d.bearing.termGamma).toBeCloseTo(70, 0); expect(d.bearing.sigmaMaxKpa).toBeCloseTo(171, 0);
    // De siltlaag ligt 3,40 m onder de voet, dieper dan ze: doorponsen wordt toch getoetst, zoals in de bron.
    expect(p.thicknessM).toBeCloseTo(3.4, 9); expect(p.widthM).toBeCloseTo(1.96, 2);
    expect(p.undrained!.cuD).toBeCloseTo(14.8, 1); expect(p.qKpa).toBeCloseTo(33.6, 1);
    expect(p.undrained!.bearing.sigmaMaxKpa).toBeCloseTo(110, 0);
    expect(p.undrained!.resistanceKn).toBeCloseTo(215, 0); // de tabel van de bron; haar voorbeeldblad drukt 323 af
    // Afwijking: de bron trekt het grondgewicht met rekenwaarden af (49 kN/m), de module telt het
    // representatieve gewicht maal 1,2 bij de belasting op (59,6 kN/m), zoals de reader.
    expect(p.deltaVKn).toBeCloseTo(59.6, 1);
  });
  it("poer 1,00 × 1,00 m: gedraineerd 200 kPa met sq = 1,5 en sγ = 0,7; ongedraineerd doorponsen 125 kPa", () => {
    const r = run({ ...common, shape: "pad", widthM: 1, lengthM: 1 }), b = r.drained.bearing, p = r.punch.find((x) => x.levelNap === 13.6)!;
    expect(b.sq).toBeCloseTo(1.5, 1); expect(b.sgamma).toBeCloseTo(0.7, 9);
    expect(b.termQ).toBeCloseTo(151, 0); expect(b.termGamma).toBeCloseTo(49, 0); expect(b.sigmaMaxKpa).toBeCloseTo(200, 0);
    expect(p.undrained!.dims.areaM2).toBeCloseTo(3.82, 1); expect(p.undrained!.bearing.sc).toBeCloseTo(1.2, 9);
    expect(p.undrained!.bearing.sigmaMaxKpa).toBeCloseTo(125, 0);
    expect(p.undrained!.resistanceKn).toBeCloseTo(478, 0);
  });
});

describe("V8 funderingsadvies antennemast: vierkante plaat, excentrisch en horizontaal belast", () => {
  const layers = [L(27.3, "dek", 17, 19, 30), L(26.3, "zand", 18, 20, 32.5), L(25.9, "zand", 18, 20, 30), L(25.6, "zand", 18, 20, 32.5), L(24.3, "zand", 17, 19, 30), L(24.0, "zand", 18, 20, 32.5)];
  it.each([[6.0, 1091, 2.14, 97, 1244, 383], [6.0, 893, 1.29, 58, 447, 313], [6.25, 1175, 2.67, 120, 2007, 412], [6.25, 962, 1.88, 83, 979, 337]])("plaat %s m, Vd = %s kN", (b, v, bEff, sigma, rv, rh) => {
    const r = run({ shape: "pad", widthM: b, lengthM: b, foundationNap: 26.3, groundNap: 26.3, waterNap: 26.3, vDKn: v, hDKn: 83, hArmM: 1, momentDKnm: 2020, castInPlace: false, layers });
    expect(r.dims.bRawM).toBeCloseTo(bEff, 2); expect(r.dims.lRawM).toBe(b);
    // De bron drukt σ'max;d af zonder decimalen en bepaalt ze met de rekenwaarde van φ' (zie VERIFICATIE.md).
    within(r.drained.bearing.sigmaMaxKpa, sigma, 1); within(r.drained.resistanceKn, rv, 1);
    expect(check(r, "sliding-drained").resistanceKn).toBeCloseTo(rh, 0);
  });
  it("de resultante ligt buiten de kern, en bij de kleinste belasting op de kleine plaat buiten B/3", () => {
    const at = (v: number) => check(run({ shape: "pad", widthM: 6, lengthM: 6, foundationNap: 26.3, groundNap: 26.3, waterNap: 26.3, vDKn: v, hDKn: 83, hArmM: 1, momentDKnm: 2020, layers }), "eccentricity");
    expect(at(1091).passes).toBe(true); expect(at(1091).steps.some((s) => /buiten de kern/.test(s.result))).toBe(true);
    expect(at(893).passes).toBe(false);
  });
});

// ─── V9: uitgewerkte Eurocode 7-voorbeelden (modeloplossingen van een Europese workshop) ─

describe("V9 vierkante poer met centrische last op stijve klei (cu = 200 kPa, φ' = 35°)", () => {
  it.each([[1.56, 2178.1, 2187.8], [1.39, 1717.1, 1737.0]])("ongedraineerd met γcu = 1,4: B = %s m", (b, v, rd) => {
    const r = run({ shape: "pad", widthM: b, lengthM: b, foundationNap: -0.8, groundNap: 0, waterNap: -0.8, vDKn: v, factors: { ...DEFAULT_FACTORS, gammaCu: 1.4, gammaGamma: 1 }, layers: [L(0, "klei", 22, 22, 35, 0, 200)] });
    expect(r.undrained!.bearing.sc).toBeCloseTo(1.2, 9);
    expect(check(r, "bearing-undrained").resistanceKn).toBeCloseTo(rd, 0);
    expect(check(r, "bearing-undrained").passes).toBe(true);
  });
  it.each([[1.62, 1, 2158.2], [2.08, 1.25, 1748.4], [2.29, 1.25, 2203.1]])("gedraineerd, B = %s m met γφ = %s", (b, gammaPhi, rd) => {
    // De bron rekent met γw = 9,81 (γ' = 12,19 kN/m³); daarom de rekenwaarden rechtstreeks in de formule.
    const phiD = Math.atan(Math.tan(35 * Math.PI / 180) / gammaPhi) * 180 / Math.PI; // 35° en 29,3°
    const f = drainedBearing({ bEffM: b, lEffM: b, ratio: 1, vKn: 2000, hKn: 0, hAlongWidth: true, phiD, cD: 0, gammaD: 12.19, qKpa: 9.75, slopeDeg: 0, baseTiltDeg: 0 });
    expect(f.sgamma).toBeCloseTo(0.7, 9);
    within(f.sigmaMaxKpa * b * b, rd, 0.5);
  });
});

describe("V10 vierkante poer met excentrische, schuine last (zelfde workshop, voorbeeld 2)", () => {
  it("excentriciteit, effectieve breedte, de toets op B/3 en afschuiven", () => {
    const r = run({ shape: "pad", widthM: 4.09, lengthM: 4.09, foundationNap: -0.8, groundNap: 0, vDKn: 3320.63, hDKn: 600, hArmM: 4.8, factors: { ...DEFAULT_FACTORS, gammaPhi: 1.25, gammaGamma: 1 }, layers: [L(0, "zand", 20, 20, 32)] });
    const ecc = check(r, "eccentricity");
    expect(r.dims.eccBM).toBeCloseTo(0.867, 3); expect(r.dims.bRawM).toBeCloseTo(2.35, 1); expect(r.dims.areaM2).toBeCloseTo(9.61, 1);
    expect(ecc.resistanceKn - ecc.loadKn).toBeCloseTo(0.49, 1); // "B/3 − e" in de bron
    expect(r.drained.phiD).toBeCloseTo(26.56, 2);
    expect(r.drained.bearing.nq).toBeCloseTo(12.588, 1); expect(r.drained.bearing.ngamma).toBeCloseTo(11.585, 1);
    expect(r.drained.bearing.sgamma).toBeCloseTo(0.827, 2);
    expect(check(r, "sliding-drained").resistanceKn).toBeCloseTo(1659.97, 0);
    // De hellingsfactoren van de bron (Eurocode 7 bijlage D, met exponent m) verschillen van de Nederlandse; niet vergeleken.
  });
});

// ─── V11 tot en met V13: deelcontroles ───────────────────────────────────────────────────

describe("V11 constructieberekening: strook als rechthoek 1,30 × 5,00 m op gelaagde grond (deelcontrole)", () => {
  it("met de gewogen parameters van de bron volgen haar factoren en σ'max;d", () => {
    const wide = drainedBearing({ bEffM: 1.3, lEffM: 5, ratio: 1.3 / 5, vKn: 101, hKn: 0, hAlongWidth: true, phiD: 23.43, cD: 1.78, gammaD: 8.43, qKpa: 7.2, slopeDeg: 0, baseTiltDeg: 0 });
    expect(wide.nq).toBeCloseTo(9.05, 1); expect(wide.nc).toBeCloseTo(18.58, 1); expect(wide.ngamma).toBeCloseTo(6.98, 1);
    expect(wide.sq).toBeCloseTo(1.10, 2); expect(wide.sc).toBeCloseTo(1.12, 2); expect(wide.sgamma).toBeCloseTo(0.92, 2);
    expect(wide.termC).toBeCloseTo(36.91, 0); expect(wide.termQ).toBeCloseTo(71.92, 0); expect(wide.termGamma).toBeCloseTo(35.24, 0);
    within(wide.sigmaMaxKpa, 144.07, 0.3);
    const narrow = drainedBearing({ bEffM: 1.0, lEffM: 5, ratio: 0.2, vKn: 68, hKn: 0, hAlongWidth: true, phiD: 22.18, cD: 2.12, gammaD: 8.33, qKpa: 7.2, slopeDeg: 0, baseTiltDeg: 0 });
    within(narrow.sigmaMaxKpa, 123.23, 0.3);
  });
  // De lagen van de bron vanaf het ontgravingsniveau; aanleg NAP +11,90 m, ontgraving tot +12,30 m, grondwater +11,80 m.
  const layers = [L(12.66, "zand, sterk siltig", 18, 20, 25), L(11.61, "leem, zwak zandig", 21, 21, 27.5, 5, 200), L(11.51, "klei, zwak zandig", 20, 20, 22.5, 25, 120), L(11.46, "klei, schoon", 19, 19, 17.5, 25, 100),
    L(11.41, "leem, zwak zandig", 21, 21, 27.5, 5, 200), L(11.36, "zand, sterk siltig", 18, 20, 25), L(11.06, "zand, zwak siltig", 18, 20, 27), L(10.91, "zand, schoon", 19, 21, 35), L(10.61, "grind, zwak siltig", 19, 21, 37.5), L(10.41, "zand, schoon", 19, 21, 35)];
  const zf = 11.9, water = 11.8, toRad = Math.PI / 180;
  /** De rekenketen met de hand, met per stap de keuze van de bron of die van de module. */
  const chain = (b: number, rule: { phiOnAngle: boolean; zeOnePassDesign: boolean; saturatedAboveWater: boolean; coverRepresentative: boolean }) => {
    const phiD = (l: SpreadLayer) => (rule.phiOnAngle ? l.phi / 1.15 : Math.atan(Math.tan(l.phi * toRad) / 1.15) / toRad);
    const gammaD = (l: SpreadLayer, wet: boolean) => (wet || rule.saturatedAboveWater ? l.gammaSat / 1.1 - 10 : l.gamma / 1.1);
    const mean = (ze: number, pick: (l: SpreadLayer, wet: boolean) => number) => {
      const floor = zf - ze; let num = 0, den = 0;
      layers.forEach((l, k) => {
        const bottom = Math.max(floor, layers[k + 1]?.topNap ?? -Infinity);
        for (const [top, bot, wet] of [[Math.min(zf, l.topNap), Math.max(bottom, water), false], [Math.min(zf, l.topNap, water), bottom, true]] as Array<[number, number, boolean]>) {
          if (top - bot <= 1e-9) continue;
          const w = (top - bot) * ((top + bot) / 2 - floor); num += pick(l, wet) * w; den += w;
        }
      });
      return num / den;
    };
    let ze = 1.5 * b;
    if (rule.zeOnePassDesign) ze = b * influenceRatios(mean(ze, phiD), 0).ze;
    else for (let k = 0; k < 60; k++) ze = b * influenceRatios(mean(ze, (l) => l.phi), 0).ze;
    const q = 0.4 * 18 / (rule.coverRepresentative ? 1 : 1.1);
    const p = { phiD: mean(ze, phiD), cD: mean(ze, (l) => l.c / 1.6), gammaD: mean(ze, gammaD) };
    return { ze, q, ...p, sigma: drainedBearing({ bEffM: b, lEffM: 5, ratio: b / 5, vKn: 1, hKn: 0, hAlongWidth: true, ...p, qKpa: q, slopeDeg: 0, baseTiltDeg: 0 }).sigmaMaxKpa };
  };
  const source = { phiOnAngle: true, zeOnePassDesign: true, saturatedAboveWater: true, coverRepresentative: true };
  const own = { phiOnAngle: false, zeOnePassDesign: false, saturatedAboveWater: false, coverRepresentative: false };

  it.each([[1.3, 1.71, 23.43, 1.78, 8.43, 144.07], [1.0, 1.27, 22.18, 2.12, 8.33, 123.23]])("met de rekenregels van de bron volgen uit de lagen haar tussenwaarden en σ'max;d (b = %s m)", (b, ze, phi, c, gamma, sigma) => {
    const s = chain(b, source);
    // Eén stap vanaf 1,5·b', afgelezen met de rekenwaarde van φ': NAP +10,19 en +10,63 m in de bron.
    expect(s.ze).toBeCloseTo(ze, 2); expect(s.phiD).toBeCloseTo(phi, 2); expect(s.cD).toBeCloseTo(c, 2); expect(s.gammaD).toBeCloseTo(gamma, 2);
    expect(s.q).toBeCloseTo(7.2, 9);
    within(s.sigma, sigma, 0.1);
  });
  it.each([[1.3, 155.5], [1.0, 128.5]])("met de rekenregels van de module volgt uit dezelfde lagen een hogere waarde, gelijk aan de handberekening (b = %s m)", (b, sigma) => {
    const r = run({ shape: "pad", widthM: b, lengthM: 5, foundationNap: zf, groundNap: 12.3, waterNap: water, vDKn: 101 * 5, layers }), d = r.drained, hand = chain(b, own);
    // De module stopt de iteratie bij een verschil van 1 mm; vandaar twee decimalen.
    expect(d.zeM).toBeCloseTo(hand.ze, 2); expect(d.phiD).toBeCloseTo(hand.phiD, 2); expect(d.cD).toBeCloseTo(hand.cD, 2); expect(d.gammaD).toBeCloseTo(hand.gammaD, 2); expect(r.qKpa).toBeCloseTo(hand.q, 9);
    within(d.bearing.sigmaMaxKpa, hand.sigma, 0.05);
    expect(d.bearing.sigmaMaxKpa).toBeCloseTo(sigma, 1);
  });
  it("het verschil per rekenregel, van de bron naar de module (b = 1,30 m)", () => {
    // Achtereenvolgens: dekking met γ/1,1; droog gewicht boven het grondwater; γφ' op tan φ'; ze geïtereerd met φ'gem;rep.
    const steps = [source, { ...source, coverRepresentative: false }, { ...source, coverRepresentative: false, saturatedAboveWater: false }, { ...own, zeOnePassDesign: true }, own].map((rule) => chain(1.3, rule).sigma);
    [144.07, 137.54, 141.43, 149.65, 155.47].forEach((sigma, k) => expect(steps[k]).toBeCloseTo(sigma, 1));
  });
  it("ongedraineerd op het fictieve vlak: 814,03 kPa met sc = 1,05", () => {
    const u = undrainedBearing({ bEffM: 1.38, lEffM: 5.08, ratio: 1.38 / 5.08, hKn: 0, cuD: 200 / 1.35, qKpa: 10.9, slopeDeg: 0, baseTiltDeg: 0 });
    expect(u.sc).toBeCloseTo(1.05, 2); within(u.sigmaMaxKpa, 814.03, 0.1);
  });
});

describe("V12 rekenblad gronddraagvermogen: strook en vierkante plaat op homogeen zand (deelcontrole)", () => {
  // Het blad rekent de dekking met 0,9·γ en γ' = (γsat − γw)/1,1; daarom de rekenwaarden van het blad zelf.
  const p = { vKn: 100, hKn: 0, hAlongWidth: true, phiD: Math.atan(Math.tan(30 * Math.PI / 180) / 1.15) * 180 / Math.PI, cD: 0, gammaD: 9.09, slopeDeg: 0, baseTiltDeg: 0 }; // 26,7°
  it.each([[0.35, 58], [0.6, 71], [1.0, 92], [1.4, 114]])("strook %s m: %s kPa", (b, sigma) => within(drainedBearing({ ...p, bEffM: b, lEffM: 1, ratio: 0, qKpa: 3.06 }).sigmaMaxKpa, sigma, 1));
  it.each([[0.5, 244], [1.0, 263], [2.0, 300], [2.4, 315]])("plaat %s m: %s kPa", (b, sigma) => {
    const f = drainedBearing({ ...p, bEffM: b, lEffM: b, ratio: 1, qKpa: 12.24 });
    expect(f.sq).toBeCloseTo(1.45, 2); expect(f.sc).toBeCloseTo(1.49, 2); expect(f.sgamma).toBeCloseTo(0.7, 9);
    within(f.sigmaMaxKpa, sigma, 1);
  });
});

describe("V13 L-keerwand: excentriciteit, effectieve breedte en glijden (deelcontrole)", () => {
  it("b' = 1,22 m; Rh;d 24,8 kN/m in de bron", () => {
    const r = run({ widthM: 1.6, vDKn: 72.72, hDKn: 20.34, eccBM: 0.19, castInPlace: false, layers: [L(0, "zand, schoon, matig", 18, 20, 32.5)] });
    expect(r.dims.bRawM).toBeCloseTo(1.22, 9);
    // De bron deelt de hoek zelf door 1,15 (28,26°); de module deelt tan φ' (28,99°). Daardoor 2,8 % meer.
    within(check(r, "sliding-drained").resistanceKn, 24.81, 3);
    expect(72.72 * Math.tan((2 / 3) * (32.5 / 1.15) * Math.PI / 180)).toBeCloseTo(24.81, 1);
  });
});

// ─── Kantelen ────────────────────────────────────────────────────────────────────────────

describe("kantelen", () => {
  it("V14 T-vormige keermuur uit een Europees rapport met uitgewerkte voorbeelden: momenten om de teen (deelcontrole, andere factoren)", () => {
    // De bron toetst kantelen met 1,35 / 1,5 op de kantelende en 1,0 op de stabiliserende momenten.
    const o = overturning({ stabilisingRepKnm: 1055.5, dstGRepKnm: 211.6, dstQRepKnm: 31.2, gammaGStb: 1.0, gammaGDst: 1.35, gammaQDst: 1.5 });
    expect(o.mDstD).toBeCloseTo(332.5, 0); expect(o.mStbD).toBeCloseTo(1055.5, 1); expect(Math.round(o.uc * 100)).toBe(31);
  });
  it("EQU met 0,9 / 1,1 / 1,5 om de rand van de voet", () => {
    const r = run({ shape: "pad", widthM: 2, lengthM: 2, vDKn: 400, hDKn: 40, hArmM: 1.5, vGRepKn: 300, hGRepKn: 10, hQRepKn: 20, mQRepKnm: 15 });
    const c = check(r, "overturning");
    expect(c.resistanceKn).toBeCloseTo(0.9 * 300 * 1.0, 9);
    expect(c.loadKn).toBeCloseTo(1.1 * 10 * 1.5 + 1.5 * (20 * 1.5 + 15), 9);
    expect(c.uc).toBeCloseTo(84 / 270, 9);
    expect(r.overturning).not.toBeNull();
  });
  it("zonder representatieve belastingen is er geen kanteltoets, wel de toets op de excentriciteit", () => {
    const r = run({});
    expect(r.overturning).toBeNull(); expect(r.checks.some((c) => c.id === "overturning")).toBe(false);
    expect(check(r, "eccentricity").uc).toBe(0);
  });
});

describe("laagvoorstel uit een sondering", () => {
  it("vertaalt de laagindeling naar lagen met tabelwaarden", () => {
    const points = Array.from({ length: 80 }, (_, k) => ({ depth: 0.05 * (k + 1), qc: k < 40 ? 0.4 : 12, rf: k < 40 ? 4 : 0.8 }));
    const cpt = { id: "S1", metadata: { ground_level_nap: 1.5, source_file: "s1.gef" }, points } as unknown as Cpt;
    const layers = layersFromCpt(cpt);
    expect(layers.length).toBeGreaterThanOrEqual(2);
    expect(layers[0].topNap).toBe(1.5);
    expect(layers[0].cu).toBeGreaterThan(0); expect(layers[layers.length - 1].cu).toBe(0);
    expect(computeSpread({ ...base, foundationNap: 0.7, groundNap: 1.5, layers }).ok).toBe(true);
    expect(soilTypeForZone(6, 20).id).toBe("sand-dense");
  });
});
