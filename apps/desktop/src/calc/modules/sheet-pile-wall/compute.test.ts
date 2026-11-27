// De rekenkern van damwand en beschoeiing: spanningen, rekenwaarden, evenwicht, toetsen en de vergelijking met Blum.
import { describe, expect, it } from "vitest";
import { kCurved, kaStraight } from "./earth-pressure";
import { FACTOR_SETS, REPRESENTATIVE, blumLoad, buildScenario, computeWall, revetmentExample, sidePoint, supportStiffness, wallExample, wallLayersFromCpt, widthFactors, type WallInput, type WallOk } from "./compute";

const ok = (i: WallInput): WallOk => { const r = computeWall(i); if (!r.ok) throw new Error(r.error); return r; };
const cantilever = (): WallInput => ({ ...wallExample(), anchor: { ...wallExample().anchor, enabled: false }, toeNap: -12 });
const rad = (d: number) => (d * Math.PI) / 180;

describe("spanningen en rekenwaarden", () => {
  it("verticale spanning, waterspanning en gronddrukgrenzen in gelaagde grond met de hand", () => {
    const i: WallInput = { ...wallExample(), surchargeKpa: 10, waterHighNap: -1.5, layersHigh: [
      { topNap: 0, name: "zand", gamma: 18, gammaSat: 20, phi: 30, c: 0, delta: 0, undrained: false, cu: 0, kh: 10000 },
      { topNap: -3, name: "klei", gamma: 16, gammaSat: 16, phi: 20, c: 5, delta: 0, undrained: false, cu: 0, kh: 2000 },
    ] };
    const s = buildScenario(i, REPRESENTATIVE);
    // NAP −2,0: σv = 10 + 18·1,5 + 20·0,5 = 47; u = 5; σ'v = 42; Ka = 1/3, K0 = 0,5, Kp = 3.
    const a = sidePoint(s.high, -2);
    expect(a.sigmaV).toBeCloseTo(47, 9); expect(a.u).toBeCloseTo(5, 9); expect(a.soil!.pa).toBeCloseTo(14, 9); expect(a.soil!.p0).toBeCloseTo(21, 9); expect(a.soil!.pp).toBeCloseTo(126, 8);
    // NAP −4,0 in de klei: σv = 10 + 27 + 30 + 16 = 83; u = 25; σ'v = 58; σ'a = Ka·58 − 2·5·√Ka met Ka = tan²(35°).
    const b = sidePoint(s.high, -4), ka = Math.tan(rad(35)) ** 2;
    expect(b.sigmaVEff).toBeCloseTo(58, 9); expect(b.soil!.pa).toBeCloseTo(ka * 58 - 10 * Math.sqrt(ka), 9); expect(b.soil!.pp).toBeCloseTo(58 / ka + 10 / Math.sqrt(ka), 8);
    expect(b.soil!.k).toBe(2000);
    // Lage zijde: boven het ontgravingsniveau geen grond; 1 m eronder in de klei σ'v = (16 − 10)·1 = 6.
    expect(sidePoint(s.low, -3.9).soil).toBeNull(); expect(sidePoint(s.low, -5).sigmaVEff).toBeCloseTo(6, 9);
  });

  it("open water boven de bodem aan de lage zijde: waterdruk vanaf de waterspiegel, korrelspanning vanaf de bodem", () => {
    const i = revetmentExample("plank"), s = buildScenario(i, REPRESENTATIVE), p = sidePoint(s.low, -2);
    // Bodem op −1,0, water op −0,5, klei γsat = 17: σv = 10·0,5 + 17·1 = 22; u = 15; σ'v = 7.
    expect(p.sigmaV).toBeCloseTo(22, 9); expect(p.u).toBeCloseTo(15, 9); expect(p.sigmaVEff).toBeCloseTo(7, 9);
    expect(sidePoint(s.low, -0.8).u).toBeCloseTo(3, 9); expect(sidePoint(s.low, -0.8).soil).toBeNull();
  });

  it("ongedraineerde laag: σh = σv ∓ 2·cu in totaalspanningen", () => {
    const i: WallInput = { ...wallExample(), surchargeKpa: 0, waterHighNap: 0, layersHigh: [{ topNap: 0, name: "klei", gamma: 16, gammaSat: 16, phi: 20, c: 0, delta: 0, undrained: true, cu: 20, kh: 2000 }] };
    const p = sidePoint(buildScenario(i, REPRESENTATIVE).high, -5);
    // σv = 80, u = 50: actief 80 − 40 − 50 < 0 wordt 0; passief 80 + 40 − 50 = 70.
    expect(p.soil!.pa).toBe(0); expect(p.soil!.pp).toBeCloseTo(70, 9);
  });

  it("rekenwaarden: factor op tan φ′, wandwrijving in verhouding, toeslag op de kerende hoogte met een maximum", () => {
    const i = wallExample(), s = buildScenario(i, FACTOR_SETS[1].factors), sand = s.high.layers[0];
    expect(Math.tan(rad(sand.phi))).toBeCloseTo(Math.tan(rad(32.5)) / 1.175, 12);
    expect(sand.delta / sand.phi).toBeCloseTo(21.7 / 32.5, 12);
    expect(sand.coef.passive).toBe("curved"); expect(sand.coef.kp).toBeCloseTo(kCurved(sand.phi, sand.delta, true).kn, 12); expect(sand.coef.ka).toBeCloseTo(kaStraight(sand.phi, sand.delta), 12);
    // Verankerd: 10 % van de hoogte onder het anker (3,0 m) = 0,30 m. Onverankerd: 10 % van 4,0 m = 0,40 m.
    expect(s.deltaAM).toBeCloseTo(0.3, 12); expect(s.low.surfaceNap).toBeCloseTo(-4.3, 12);
    expect(buildScenario(cantilever(), FACTOR_SETS[1].factors).deltaAM).toBeCloseTo(0.4, 12);
    expect(buildScenario({ ...cantilever(), excavationNap: -8 }, FACTOR_SETS[1].factors).deltaAM).toBe(0.5);
    const shifted = buildScenario(i, { ...FACTOR_SETS[1].factors, deltaWaterHighM: 0.05, deltaWaterLowM: 0.25, gammaQ: 1.5, gammaK: 1.3 });
    expect(shifted.high.waterNap).toBeCloseTo(-1.45, 12); expect(shifted.low.waterNap).toBeCloseTo(-4.25, 12); expect(shifted.high.surchargeKpa).toBe(15); expect(shifted.high.layers[0].kh).toBeCloseTo(20000 / 1.3, 9);
  });
});

describe("verenmodel op de wand", () => {
  it("evenwicht: horizontale krachten sluiten, de drukken blijven binnen hun grenzen en het moment is nul aan kop en teen", () => {
    for (const input of [wallExample(), cantilever(), revetmentExample("plank"), revetmentExample("posts")]) {
      const r = ok(input);
      for (const run of [r.uls, r.sls]) {
        let net = 0;
        for (const row of run.rows) {
          const l = row.topNap - row.bottomNap;
          net += ((row.high?.pressureKpa ?? 0) + row.uHighKpa - (row.low?.pressureKpa ?? 0) - row.uLowKpa) * l;
          for (const side of [row.high, row.low]) if (side) { expect(side.pressureKpa).toBeGreaterThanOrEqual(side.activeKpa - 1e-9); expect(side.pressureKpa).toBeLessThanOrEqual(side.passiveKpa + 1e-9); }
        }
        const scale = Math.max(1, run.passive.maxKn);
        expect(Math.abs(net - (run.anchor?.horizontalKn ?? 0)) / scale).toBeLessThan(0.005);
        expect(Math.abs(run.samples[0].momentKnM)).toBeLessThan(1e-6 * scale); expect(Math.abs(run.samples[run.samples.length - 1].momentKnM)).toBeLessThan(0.002 * Math.max(1, Math.abs(run.maxMoment.value)));
        expect(run.stable).toBe(true);
      }
    }
  });

  it("naast Blum: moment en ankerkracht in dezelfde orde (binnen 30 %)", () => {
    const free = ok(cantilever());
    expect(Math.abs(Math.abs(free.uls.maxMoment.value) / free.blum.cantilever!.maxMomentKnM - 1)).toBeLessThan(0.3);
    const anchored = ok(wallExample()), b = anchored.blum;
    expect(b.kind).toBe("anchored"); expect(b.cantilever).toBeNull();
    for (const c of [b.free!, b.fixed!]) {
      expect(Math.abs(Math.abs(anchored.uls.maxMoment.value) / c.maxMomentKnM - 1)).toBeLessThan(0.3);
      expect(Math.abs(anchored.uls.anchor!.horizontalKn / c.anchorKn - 1)).toBeLessThan(0.3);
    }
    // Blum rekent met dezelfde belasting als de grenzen van het verenmodel.
    const s = anchored.uls.scenario;
    expect(blumLoad(wallExample(), s, -2)).toBeCloseTo(sidePoint(s.high, -2).soil!.pa + sidePoint(s.high, -2).u, 12);
  });

  it("ankerkracht: horizontaal uit het model, axiaal over de hoek, per anker over de hart-op-hartafstand", () => {
    const i = wallExample(), a = ok(i).uls.anchor!;
    expect(a.axialKn).toBeCloseTo(a.horizontalKn / Math.cos(rad(30)), 9); expect(a.perAnchorKn).toBeCloseTo(a.axialKn * 2.8, 9); expect(a.verticalKn).toBeCloseTo(a.horizontalKn * Math.tan(rad(30)), 9);
    expect(supportStiffness(i.anchor)).toBeCloseTo((30000 * Math.cos(rad(30)) ** 2) / 2.8, 9);
    expect(a.displacementM).toBeCloseTo(a.horizontalKn / supportStiffness(i.anchor), 4);
    const rigid = ok({ ...i, anchor: { ...i.anchor, rigid: true, angleDeg: 0 } }).uls.anchor!;
    expect(Math.abs(rigid.displacementM)).toBeLessThan(1e-4); expect(rigid.horizontalKn).toBeGreaterThan(a.horizontalKn);
  });

  it("te korte wand: geen evenwicht, met het teenniveau dat Blum vraagt in de melding", () => {
    const r = computeWall({ ...wallExample(), toeNap: -6 });
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.error).toMatch(/Geen evenwicht met rekenwaarden/); expect(r.error).toMatch(/Blum vraagt een teen op NAP -7,0\d m/); }
  });

  it("vraagt om invoer in plaats van te rekenen met een ontbrekende beddingsconstante of een onmogelijke geometrie", () => {
    const i = wallExample(), error = (patch: Partial<WallInput>) => { const r = computeWall({ ...i, ...patch }); return r.ok ? "" : r.error; };
    expect(error({ layersHigh: i.layersHigh.map((l) => ({ ...l, kh: 0 })) })).toMatch(/vul de beddingsconstante in/);
    expect(error({ excavationNap: 1 })).toMatch(/lager liggen dan het maaiveld/);
    expect(error({ toeNap: -3 })).toMatch(/teen van de wand/);
    expect(error({ wallTopNap: -0.5 })).toMatch(/bovenkant van de wand/);
    expect(error({ anchor: { ...i.anchor, levelNap: -5 } })).toMatch(/anker ligt tussen/);
    expect(error({ profileId: "bestaat niet" })).toMatch(/Kies een profiel/);
    expect(error({ layersHigh: [{ ...i.layersHigh[0], undrained: true, cu: 0 }] })).toMatch(/geen cu/);
  });
});

describe("toetsen", () => {
  it("stalen damwand: momentcapaciteit uit de bibliotheek, dwarskracht met het lijf, normaalkracht uit het schuine anker", () => {
    const r = ok(wallExample()), by = Object.fromEntries(r.checks.map((c) => [c.id, c]));
    // AZ 18-700 in S355GP is doorsnedeklasse 3: W_el = 1800 cm³/m, M_c;Rd = 1800·355/1000 = 639 kNm/m.
    expect(by.bending.resistance).toBeCloseTo(639, 9); expect(by.bending.load).toBeCloseTo(Math.abs(r.uls.maxMoment.value), 9);
    // A_v = 9,0·(420 − 9,0)/0,7 = 5284 mm²/m; V_pl;Rd = 5284·355/√3/1000 = 1083 kN/m.
    expect(by.shear.resistance).toBeCloseTo((9 * 411 / 0.7) * 355 / Math.sqrt(3) / 1000, 6);
    // N_pl;Rd = 139,2 cm²·355 = 4942 kN/m; klasse 3: M_N;Rd = M_c;Rd·(1 − N/N_pl).
    const nEd = r.uls.anchor!.verticalKn;
    expect(by.normal.resistance).toBeCloseTo(639 * (1 - nEd / 4941.6), 6);
    expect(by.passive.uc).toBeCloseTo(r.uls.passive.ratio, 12); expect(by.passive.uc).toBeLessThan(1);
    expect(by.embedment.resistance).toBeCloseTo(4.7, 9); expect(by.embedment.load).toBeCloseTo(r.blum.free!.requiredToeM - 4.3, 9);
    expect(r.governing.uc).toBe(Math.max(...r.checks.map((c) => c.uc))); expect(r.passes).toBe(true);
    expect(ok({ ...wallExample(), betaB: 0.8 }).checks[0].resistance).toBeCloseTo(0.8 * 639, 9);
  });

  it("houten plank: buiging en afschuiving volgens NEN-EN 1995-1-1 per m wand", () => {
    const i = revetmentExample("plank"), r = ok(i), by = Object.fromEntries(r.checks.map((c) => [c.id, c]));
    // D40, 50 mm: EI = 13000·10³·0,05³/12 = 135,4 kNm²/m; f_m;d = 0,5·40/1,3 = 15,38; W = 50²/6·1000 = 416,7 cm³/m: M_Rd = 6,41 kNm/m.
    expect(r.eiKnM2).toBeCloseTo(135.417, 2); expect(by.bending.resistance).toBeCloseTo(6.410, 2);
    // f_v;d = 0,5·4,2/1,3 = 1,615; V_Rd = 1,615·0,67·50 000 mm²/1,5 = 36,1 kN/m.
    expect(by.shear.resistance).toBeCloseTo(36.08, 1);
    expect(r.checks.map((c) => c.id)).toEqual(["bending", "shear", "passive", "embedment"]);
    expect(r.blum.kind).toBe("cantilever"); expect(r.section.construction).toBe("plank");
  });

  it("eigen doorsnede (kunststof, beton): toets tegen het ingevoerde moment; zonder dwarskracht alleen een melding", () => {
    const i: WallInput = { ...revetmentExample("plank"), material: "custom", custom: { eiKnM2: 60, mRdKnM: 8, vRdKn: 0 } }, r = ok(i);
    expect(r.eiKnM2).toBe(60); expect(r.checks[0].resistance).toBe(8); expect(r.checks.some((c) => c.id === "shear")).toBe(false);
    expect(r.warnings.join(" ")).toMatch(/geen opneembare dwarskracht/);
    expect(ok({ ...i, custom: { eiKnM2: 60, mRdKnM: 8, vRdKn: 12 } }).checks.find((c) => c.id === "shear")!.resistance).toBe(12);
    // Slapper: grotere verplaatsing bij vrijwel hetzelfde moment.
    expect(r.sls.headDisplacementM).toBeGreaterThan(ok(revetmentExample("plank")).sls.headDisplacementM);
  });

  it("palen met schotten: stijfheid en belasting per m wand, toets per paal, passieve weerstand over de factor maal de paalbreedte", () => {
    const i = revetmentExample("posts"), r = ok(i), by = Object.fromEntries(r.checks.map((c) => [c.id, c]));
    // Rond 160 mm, D40, h.o.h. 0,8 m: I = π·0,16⁴/64 = 3217 cm⁴; EI = 13·10⁶·3,217·10⁻⁵/0,8 = 522,8 kNm²/m.
    expect(r.eiKnM2).toBeCloseTo((13e6 * Math.PI * 0.16 ** 4) / 64 / 0.8, 6);
    expect(by.bending.load).toBeCloseTo(Math.abs(r.uls.maxMoment.value) * 0.8, 9); expect(by.bending.unit).toBe("kNm");
    // W = π·160³/32 = 402,1 cm³; M_Rd = 15,38·402,1/1000 = 6,19 kNm. V_Rd = 1,615·0,67·20106 mm²·¾ = 16,3 kN.
    expect(by.bending.resistance).toBeCloseTo(6.186, 2); expect(by.shear.resistance).toBeCloseTo(16.32, 1);
    // Onder de schotten (NAP −1,3): gronddruk over 0,16/0,8 = 0,2 en passief over 3·0,16/0,8 = 0,6 van de wandbreedte.
    expect(widthFactors(i, -1.2)).toEqual({ soil: 1, passive: 1 }); expect(widthFactors(i, -2).soil).toBeCloseTo(0.2, 12); expect(widthFactors(i, -2).passive).toBeCloseTo(0.6, 12);
    expect(widthFactors({ ...i, posts: { ...i.posts, spatialFactor: 9 } }, -2).passive).toBe(1);
    const s = r.uls.scenario, low = sidePoint(s.low, -2), high = sidePoint(s.high, -2);
    expect(blumLoad(i, s, -2)).toBeCloseTo(0.2 * (high.soil!.pa + high.u - low.u) - 0.6 * low.soil!.pp, 12);
    const row = r.uls.rows.find((x) => x.topNap < -2 && x.low)!;
    expect(row.low!.passiveKpa).toBeCloseTo(0.6 * sidePoint(s.low, (row.topNap + row.bottomNap) / 2).soil!.pp, 9);
    // Schot: ligger op twee steunpunten, q·a²/8 en q·a/2; 40 mm: M_Rd = 15,38·40²/6 = 4,10 kNm/m.
    const q = (by.board.load * 8) / 0.8 ** 2;
    expect(by.boardShear.load).toBeCloseTo((q * 0.8) / 2, 9); expect(by.board.resistance).toBeCloseTo(4.103, 2); expect(q).toBeGreaterThan(0);
    // Een anker telt bij palen met schotten niet mee.
    expect(ok({ ...i, anchor: { ...i.anchor, enabled: true } }).uls.anchor).toBeNull();
    expect(computeWall({ ...i, posts: { ...i.posts, boardBottomNap: -0.5 } }).ok).toBe(false);
  });

  it("verankerde plankenwand: ankerkracht en een kleiner moment dan onverankerd", () => {
    const base = revetmentExample("plank"), i: WallInput = { ...base, toeNap: -2.5, anchor: { ...base.anchor, enabled: true } }, r = ok(i);
    expect(r.uls.anchor!.horizontalKn).toBeGreaterThan(0); expect(r.blum.kind).toBe("anchored");
    expect(Math.abs(r.uls.maxMoment.value)).toBeLessThan(Math.abs(ok(base).uls.maxMoment.value));
  });

  it("een eerder opgeslagen damwand zonder de nieuwe velden rekent als stalen damwand", () => {
    const { construction: _c, material: _m, timber: _t, posts: _p, custom: _u, plankMm: _k, ...old } = wallExample();
    void _c; void _m; void _t; void _p; void _u; void _k;
    const r = ok(old as WallInput);
    expect(r.section.construction).toBe("sheet-pile"); expect(r.uls.maxMoment.value).toBeCloseTo(ok(wallExample()).uls.maxMoment.value, 9);
  });
});

describe("laagvoorstel", () => {
  it("uit een sondering: wandwrijving ⅔·φ′ en een open beddingsconstante", () => {
    const cpt = { metadata: { ground_level_nap: 1 }, points: Array.from({ length: 80 }, (_, k) => ({ depth: 0.1 * k, qc: 8, fs: 0.05, rf: 0.6 })) } as never;
    const layers = wallLayersFromCpt(cpt);
    for (const l of layers) { expect(l.kh).toBe(0); expect(l.delta).toBeCloseTo((2 * l.phi) / 3, 1); expect(l.undrained).toBe(false); }
  });
});
