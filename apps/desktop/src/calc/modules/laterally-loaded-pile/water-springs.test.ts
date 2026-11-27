/**
 * Nieuwe onderdelen van de horizontale paal, elk tegen een handberekening:
 * - elastoplastische veer p = min(k0 |y|, pu) en het bezwijken van een starre paal (evenwicht, Broms-type);
 * - beddingsconstante uit de pressiometermodulus (Ménard);
 * - grensweerstand volgens Brinch Hansen (1961);
 * - buigstijfheid per zone (afroesting tot een niveau);
 * - waterbodem: vrije lengte in water en stroming q = ½ ρ C_D D u².
 */
import { describe, expect, it } from 'vitest';
import { solveBeam } from './beam';
import { computeLateral, lateralExample, type LateralInput, type LateralLayer } from './compute';
import { brinchHansenKq, evaluateSpring, integratedUltimate } from './nonlinear-soil';
import { menardKh } from './soil';
import { currentLoadKnM, DEFAULT_CURRENT, type CurrentLoad } from './water';
import { NO_CORROSION } from '../../shared/corrosion';

type Ok = Extract<ReturnType<typeof computeLateral>, { ok: true }>;
const ok = (r: ReturnType<typeof computeLateral>): Ok => { if (!r.ok) throw new Error(r.error); return r; };
const tube = { ...lateralExample.section, kind: 'steel-tube' as const, diameterMm: 914, wallMm: 20, tubeFydMpa: 355 };
const sampleAt = (r: Ok, z: number) => r.beam.samples.reduce((a, s) => Math.abs(s.zM - z) < Math.abs(a.zM - z) ? s : a);

describe('elastoplastische veer', () => {
  it('lineair tot pu, daarna pu met het teken van y', () => {
    const law = { kind: 'elastoplastic' as const, initialKnM2: 1000, ultimateKnM: 50 };
    expect(evaluateSpring(law, 0.02)).toMatchObject({ resistanceKnM: 20, tangentKnM2: 1000 });
    expect(evaluateSpring(law, 0.2)).toMatchObject({ resistanceKnM: 50, tangentKnM2: 0 });
    expect(evaluateSpring(law, -0.2).resistanceKnM).toBe(-50);
  });
  // Starre paal L = 10 m, vrije kop, constante pu = 50 kN/m, zeer stijve veren: bezwijklast uit evenwicht
  // (draaipunt x = L/√2): H_u = pu L (√2 − 1) = 207,1 kN. Onder H_u en met een geheel plastische bovenzone ligt het
  // grootste moment op z = H/pu met M = H² / (2 pu).
  const rigid = (H: number): LateralInput => ({ ...lateralExample, lengthM: 10, maxElementM: 0.1, headForceKn: H, headMomentKnM: 0, springWidthM: 1,
    section: { ...tube, diameterMm: 2000, wallMm: 200 }, analysisMode: 'elastoplastic', layerCorrection: 'none',
    layers: [{ topM: 0, bottomM: 10, springId: 'manual', manualKhKnM3: 1e6, frictionDeg: 0, netPressureKpa: 0, ultimate: { atSurfaceKnM: 50, gradientKnM2: 0, capKnM: 50 } }] });
  it('grootste moment H²/(2 pu) bij 95 % van de bezwijklast', { timeout: 60000 }, () => {
    const Hu = 50 * 10 * (Math.SQRT2 - 1), H = 0.95 * Hu, r = ok(computeLateral(rigid(H)));
    expect(r.maxMomentKnM / (H * H / 100) - 1).toBeLessThan(0.005);
    expect(r.maxMomentKnM / (H * H / 100) - 1).toBeGreaterThan(-0.005);
  });
  it('geen evenwicht boven de bezwijklast', { timeout: 60000 }, () => {
    expect(computeLateral(rigid(1.03 * 50 * 10 * (Math.SQRT2 - 1))).ok).toBe(false);
  });
  it('met een zeer hoge pu gelijk aan de lineaire berekening', { timeout: 60000 }, () => {
    const base: LateralInput = { ...rigid(100), section: tube, layers: [{ ...rigid(100).layers[0], manualKhKnM3: 5000, ultimate: { atSurfaceKnM: 1e7, gradientKnM2: 0, capKnM: 1e7 } }] };
    const a = ok(computeLateral(base)), b = ok(computeLateral({ ...base, analysisMode: 'linear' }));
    expect(a.beam.nodes[0].yM).toBeCloseTo(b.beam.nodes[0].yM, 9);
    expect(a.maxMomentKnM).toBeCloseTo(b.maxMomentKnM, 6);
  });
});

describe('Ménard', () => {
  // R = 0,457 m ≥ R0 = 0,3 m, α = 1/3, E_p = 7000 kN/m²:
  // (2,65 · 0,457 / 0,3)^(1/3) = 1,59243; 1,3 · 0,3 · 1,59243 = 0,621048; α R = 0,152333;
  // k_h = 3 · 7000 / 0,773381 = 27 153 kN/m³.
  it('k_h van een paal Ø914 in zand', () => {
    expect(menardKh(7000, 0.914, 1 / 3)).toBeCloseTo(27153.5, -1);
    expect(menardKh(700, 0.914, 1 / 3)).toBeCloseTo(2715.35, 0);
  });
  // R < R0: 1/k_h = (2R/E)(4 · 2,65^α + 3α)/18; R = 0,2 m, α = 2/3, E = 3000: 2,65^(2/3) = 1,91535;
  // (4 · 1,91535 + 2) / 18 = 0,536744; k_h = 3000 / (0,4 · 0,536744) = 13 973 kN/m³.
  it('kleine paal en klei', () => expect(menardKh(3000, 0.4, 2 / 3)).toBeCloseTo(13973, -1));
  it('lijnveer k0 = k_h × werkende breedte in de rekenkern', () => {
    const r = ok(computeLateral({ ...lateralExample, analysisMode: 'linear', layerCorrection: 'none', springWidthM: 0.914,
      layers: [{ topM: 0, bottomM: 12, springId: 'menard', menardEpKpa: 7000, menardAlpha: 1 / 3, manualKhKnM3: 0, frictionDeg: 30, netPressureKpa: 0 }] }));
    expect(r.resolvedLayers[0].lineSpringKnM2).toBeCloseTo(menardKh(7000, 0.914, 1 / 3) * 0.914, 6);
  });
  it('weigert een ontbrekende E_p', () => expect(() => menardKh(NaN, 0.9, 1 / 3)).toThrow());
});

describe('Brinch Hansen', () => {
  // φ = 30°: K_q⁰ = e^(1,20920) · 0,86603 · 1,73205 − e^(−0,60460) · 0,86603 · 0,57735 = 5,0258 − 0,2731 = 4,7527.
  // N_q = 18,401; N_c = 30,140; d_c^∞ = 2,0344; K0 = 0,5; K_q^∞ = 17,701.
  it('K_q aan maaiveld en zeer diep', () => {
    expect(brinchHansenKq(30, 0, 1)).toBeCloseTo(4.7527, 3);
    expect(brinchHansenKq(30, 1e7, 1)).toBeCloseTo(17.701, 2);
  });
  it('integraal en inverse van het profiel', () => {
    const p = { atSurfaceKnM: 0, gradientKnM2: 0, capKnM: 1, brinchHansen: { phiDeg: 32.5, gammaEffKnM3: 10, widthM: 0.914 } };
    // Trapeziumregel met 20 000 stappen als onafhankelijke controle.
    let s = 0; const n = 20000, h = 5 / n;
    for (let i = 0; i <= n; i++) { const z = i * h; s += (i === 0 || i === n ? 0.5 : 1) * brinchHansenKq(32.5, z, 0.914) * 10 * z * 0.914 * h; }
    expect(integratedUltimate(p, 5) / s - 1).toBeLessThan(1e-6);
  });
});

describe('buigstijfheid per zone', () => {
  // Ingeklemde voet, kracht H aan de kop, EI1 over de bovenste a meter: δ = H [a³/(3 EI1) + (L³ − a³)/(3 EI2)].
  it('kopverplaatsing van een uitkraging met twee stijfheden', () => {
    const H = 10, L = 6, a = 2, ei1 = 5000, ei2 = 20000;
    const r = solveBeam({ lengthM: L, eiKnM2: ei2, eiZones: [{ topM: 0, bottomM: a, eiKnM2: ei1 }], maxElementM: 0.5, headForceKn: H, headMomentKnM: 0,
      headFixedRotation: false, toeFixed: true, layers: [] });
    expect(r.nodes[0].yM).toBeCloseTo(H * (a ** 3 / (3 * ei1) + (L ** 3 - a ** 3) / (3 * ei2)), 10);
  });
  it('afroesting tot een niveau: EI na afroesting alleen boven dat niveau', { timeout: 60000 }, () => {
    const custom = (mm: number) => ({ ...NO_CORROSION, source: 'custom' as const, customMm: mm });
    const base: LateralInput = { ...lateralExample, section: tube, headNap: 0, analysisMode: 'linear', layerCorrection: 'none' };
    const corrosion = { outer: custom(0.6), inner: custom(0.6), sides: 2 as const, reducedStiffness: true };
    const none = ok(computeLateral(base)), all = ok(computeLateral({ ...base, corrosion })), zone = ok(computeLateral({ ...base, corrosion: { ...corrosion, zoneBottomNap: -3 } }));
    expect(zone.corrosion?.stiffnessZone?.bottomM).toBeCloseTo(3, 9);
    // 912,8 × 18,8: EI = 210 000 · π (912,8⁴ − 875,2⁴) / 64 = 1 108 260 kNm².
    expect(zone.corrosion?.stiffnessZone?.eiKnM2).toBeCloseTo(1108260, -1);
    const y = (r: Ok) => r.beam.nodes[0].yM;
    expect(y(zone)).toBeGreaterThan(y(none)); expect(y(zone)).toBeLessThan(y(all));
    // De toetsen blijven met de afgeroeste doorsnede (veilige kant).
    expect(zone.material?.rows.find((r) => r.id === 'bending')?.resistance?.v).toBeCloseTo(all.material!.rows.find((r) => r.id === 'bending')!.resistance!.v, 6);
  });
});

describe('waterbodem', () => {
  const soil: LateralLayer[] = [{ topM: 4, bottomM: 12, springId: 'manual', manualKhKnM3: 20000, frictionDeg: 30, netPressureKpa: 0, ultimate: { atSurfaceKnM: 0, gradientKnM2: 80, capKnM: 600 } }];
  const base: LateralInput = { ...lateralExample, headNap: 2, lengthM: 12, maxElementM: 0.25, headForceKn: 40, headMomentKnM: 0, section: tube, layers: soil };
  it('waterbodem op het maaiveld met het waterpeil eronder verandert niets', { timeout: 60000 }, () => {
    for (const mode of ['linear', 'nonlinear'] as const) for (const corr of ['none', 'georgiadis'] as const) {
      const a = ok(computeLateral({ ...base, analysisMode: mode, layerCorrection: corr }));
      const b = ok(computeLateral({ ...base, analysisMode: mode, layerCorrection: corr, waterBed: { enabled: true, bedNap: -2, waterNap: -3, current: { ...DEFAULT_CURRENT, speedMs: 2, cd: 1 } } }));
      expect(b.beam.samples.map((s) => s.momentKnM)).toEqual(a.beam.samples.map((s) => s.momentKnM));
      expect(b.beam.nodes[0].yM).toBe(a.beam.nodes[0].yM);
    }
  });
  it('geen grondveren boven de waterbodem', { timeout: 60000 }, () => {
    const above = ok(computeLateral({ ...base, layers: [{ ...soil[0], topM: 0 }], waterBed: { enabled: true, bedNap: -2, waterNap: 1 } }));
    const below = ok(computeLateral(base));
    expect(above.beam.nodes[0].yM).toBeCloseTo(below.beam.nodes[0].yM, 12);
    expect(above.springs.every((s) => s.zM >= 4 - 1e-9)).toBe(true);
  });
  // Vrije lengte e = 4 m in water: het moment op de bodem is H·e, en de paal onder de bodem gedraagt zich als een
  // paal met de kop op de bodem, belast door H en M = −H·e (tekenafspraak van de module).
  it('bijdrage van de vrije lengte: M = H·e op de waterbodem', { timeout: 60000 }, () => {
    const water = ok(computeLateral({ ...base, waterBed: { enabled: true, bedNap: -2, waterNap: 1 } }));
    expect(Math.abs(sampleAt(water, 4).momentKnM)).toBeCloseTo(40 * 4, 6);
    const short = ok(computeLateral({ ...base, headNap: -2, lengthM: 8, headMomentKnM: -40 * 4, layers: [{ ...soil[0], topM: 0, bottomM: 8 }] }));
    expect(water.maxMomentKnM).toBeCloseTo(short.maxMomentKnM, 3);
    expect(sampleAt(water, 4).yM).toBeCloseTo(short.beam.nodes[0].yM, 6);
  });
});

describe('stroming', () => {
  // ρ = 1000, C_D = 1,0, D = 0,914, u = 1,5: q = ½ · 1000 · 1,0 · 0,914 · 1,5² / 1000 = 1,02825 kN/m.
  const c: CurrentLoad = { ...DEFAULT_CURRENT, speedMs: 1.5, cd: 1, factor: 1.5 };
  it('q per meter', () => {
    expect(currentLoadKnM(c, 0.914, 3, 5.8)).toBeCloseTo(1.02825, 10);
    expect(currentLoadKnM({ ...c, profile: 'power' }, 0.914, 5.8 / 2, 5.8)).toBeCloseTo(1.02825 * 0.5 ** (2 / 7), 10);
  });
  // Paalkop NAP +9,8, waterpeil +8,8, bodem +3,0: belast van 1,0 tot 6,8 m onder de kop.
  const pile = (cur: CurrentLoad): LateralInput => ({ ...lateralExample, headNap: 9.8, lengthM: 14.8, maxElementM: 0.1, headForceKn: 302, headMomentKnM: 0, section: tube, springWidthM: 0.914,
    analysisMode: 'linear', layerCorrection: 'none', layers: [{ topM: 6.8, bottomM: 14.8, springId: 'manual', manualKhKnM3: 20000, frictionDeg: 30, netPressureKpa: 0 }],
    waterBed: { enabled: true, bedNap: 3, waterNap: 8.8, current: cur } });
  it('uniform: resultante γ q d op halve waterdiepte, en het moment op de bodem', { timeout: 60000 }, () => {
    const r = ok(computeLateral(pile(c))), w = r.water!.current!;
    expect(w.resultantKn).toBeCloseTo(1.5 * 1.02825 * 5.8, 6);
    expect(w.resultantNap).toBeCloseTo((3 + 8.8) / 2, 6);
    expect(Math.abs(sampleAt(r, 6.8).momentKnM)).toBeCloseTo(302 * 6.8 + w.resultantKn * 2.9, 3);
  });
  // Machtsprofiel n = 1/7: ∫ (h/d)^(2/7) dh = 7d/9; zwaartepunt op 9d/16 boven de bodem.
  it('machtsprofiel: resultante en aangrijppunt', { timeout: 60000 }, () => {
    const w = ok(computeLateral(pile({ ...c, profile: 'power' }))).water!.current!;
    expect(w.resultantKn / (1.5 * 1.02825 * 5.8 * 7 / 9) - 1).toBeLessThan(1e-4);
    expect(w.resultantNap).toBeCloseTo(3 + 9 * 5.8 / 16, 3);
  });
  it('u = 0 verandert niets; tegen H in verlaagt het moment', { timeout: 60000 }, () => {
    const a = ok(computeLateral({ ...pile(c), waterBed: { enabled: true, bedNap: 3, waterNap: 8.8 } })), b = ok(computeLateral(pile({ ...c, speedMs: 0 })));
    expect(b.beam.samples.map((s) => s.momentKnM)).toEqual(a.beam.samples.map((s) => s.momentKnM));
    expect(ok(computeLateral(pile({ ...c, sign: -1 }))).maxMomentKnM).toBeLessThan(a.maxMomentKnM);
  });
  it('zonder C_D een melding', () => expect(computeLateral(pile({ ...c, cd: null })).ok).toBe(false));
});
