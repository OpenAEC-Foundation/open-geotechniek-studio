/**
 * Vergelijking met gepubliceerde gesloten oplossingen en uitgewerkte voorbeelden
 * (aanvulling op verification.test.ts; zie VERIFICATIE.md, gevallen R1–R12).
 *
 * Bronnen:
 * - Hetényi, M. (1946), Beams on Elastic Foundation: half-oneindige en eindige ligger.
 * - Barber, E.S. (1953) en Broms, B.B. (1964): starre paal, constante en lineair toenemende bedding.
 * - Matlock, H. & Reese, L.C. (1960/1961): dimensieloze coëfficiënten voor k = nh·z.
 * - Broms, B.B. (1964a, 1964b): grenstoestand in cohesieve en niet-cohesieve grond.
 * - Kouretzis, G. (2025), Fundamentals of foundation engineering and their applications
 *   (open studieboek, University of Newcastle), §6.24–6.25 en voorbeelden 6.12 en 6.13.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { solveBeam } from './beam';
import { computeLateral, lateralExample, type LateralInput, type LateralLayer } from './compute';
import { solveFoundationBeam } from './nonlinear-beam';
import { equivalentLayers } from './nonlinear-soil';
import { sectionCapacity, sectionStiffness, type PileSection } from './section';
import type { SoilSpringProfile } from './spring-types';

type Ok = Extract<ReturnType<typeof computeLateral>, { ok: true }>;
function run(over: Partial<LateralInput>): Ok {
  const r = computeLateral({ ...lateralExample, analysisMode: 'linear', layerCorrection: 'none', headForceKn: 0, headMomentKnM: 0, nEdKn: 0,
    springWidthM: 1, maxElementM: 0.1, headFixedRotation: false, toeFixed: false, ...over });
  if (!r.ok) throw new Error(r.error);
  return r;
}
const manual = (topM: number, bottomM: number, k: number): LateralLayer => ({ topM, bottomM, springId: 'manual', manualKhKnM3: k, frictionDeg: 0, netPressureKpa: 0 });
/** k = nh·z opgeknipt in n lagen met de waarde in het laagmidden. */
const stepped = (nh: number, L: number, n = 40) => Array.from({ length: n }, (_, i) => manual(i * L / n, (i + 1) * L / n, nh * (i + 0.5) * L / n));
const head = (r: Ok) => r.beam.nodes[0];
const peak = (samples: Ok['beam']['samples']) => samples.reduce((a, p) => Math.abs(p.momentKnM) > Math.abs(a.momentKnM) ? p : a);

const rows: Array<{ geval: string; grootheid: string; module: number; bron: number; afwijking: string }> = [];
function check(grootheid: string, module: number, bron: number, grens: number) {
  const d = Math.abs(module - bron) / Math.abs(bron);
  rows.push({ geval: (expect.getState().currentTestName ?? '').split(' > ').pop()!.split(' ')[0], grootheid, module, bron, afwijking: `${(d * 100).toPrecision(2)} %` });
  expect(d).toBeLessThan(grens);
}
afterAll(() => { if (process.env.VERIFY_REPORT) console.table(rows); });

/** Starre paal (EI zeer groot) op begrensde veren p = pu·tanh(k·y/pu), rechtstreeks op de rekenkern. */
function plastic(o: { L: number; H: number; fixed?: boolean; top: number; pu0: number; gradient: number }) {
  const profiles: SoilSpringProfile[] = [{ topM: o.top, bottomM: o.L, initialKnM2: 1e5, ultimate: { atSurfaceKnM: o.pu0, gradientKnM2: o.gradient, capKnM: 1e9 } }];
  return solveFoundationBeam({ lengthM: o.L, eiKnM2: 1e9, maxElementM: 0.1, headForceKn: o.H, headMomentKnM: 0, headFixedRotation: !!o.fixed, toeFixed: false,
    layers: [{ topM: o.top, bottomM: o.L, lineSpringKnM2: 1e5, lineLoadKnM: 0 }] }, profiles, equivalentLayers(profiles, 'none'), 'nonlinear', 'none');
}
/** Grootste kopkracht waarbij de rekenkern nog evenwicht vindt. */
function collapseLoad(solve: (H: number) => unknown, lo: number, hi: number) {
  for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; try { solve(mid); lo = mid; } catch { hi = mid; } }
  return lo;
}

describe('Gesloten oplossingen, lineaire bedding', () => {
  it('R1 Hetényi lange paal: plaats van het grootste moment, dwarskracht en excentrische last', () => {
    const k = 20000, L = 16, H = 100, e = 1.5;
    const r = run({ lengthM: L, headForceKn: H, layers: [manual(0, L, k)] });
    const b = Math.pow(k / (4 * r.section.eiKnM2), 0.25), top = peak(r.beam.samples);
    check('diepte max. moment', top.zM, Math.PI / (4 * b), 2e-3);
    check('max. moment', Math.abs(top.momentKnM), 0.3224 * H / b, 1e-3);
    check('max. dwarskracht', r.maxShearKn, H, 1e-6);
    expect(Math.abs(r.beam.samples[0].shearKn)).toBeCloseTo(H, 6);
    // Kracht H op hoogte e boven de kop: y0 = 2Hβ(1 + βe)/k. In de tekenafspraak van de
    // module (rotatie = dy/dz, z omlaag) is het bijbehorende kopmoment −H·e.
    const ecc = run({ lengthM: L, headForceKn: H, headMomentKnM: -H * e, layers: [manual(0, L, k)] });
    check('kopverplaatsing', head(ecc).yM, 2 * H * b * (1 + b * e) / k, 1e-3);
    check('max. moment', ecc.maxMomentKnM, Math.max(...Array.from({ length: 4000 }, (_, i) => { const z = i * 4 / 4000;
      return Math.exp(-b * z) * (H / b * Math.sin(b * z) + H * e * (Math.cos(b * z) + Math.sin(b * z))); })), 1e-3);
    expect(head(ecc).yM).toBeGreaterThan(head(r).yM);
    // Een positief ingevoerd moment werkt de kracht dus tegen.
    expect(head(run({ lengthM: L, headForceKn: H, headMomentKnM: H * e, layers: [manual(0, L, k)] })).yM).toBeLessThan(head(r).yM);
  });

  it('R2 Hetényi eindige paal met vrije einden, kracht en moment op de kop', () => {
    const k = 8000, L = 4, H = 60, M = 30;
    const rH = run({ lengthM: L, headForceKn: H, layers: [manual(0, L, k)] }), rM = run({ lengthM: L, headMomentKnM: M, layers: [manual(0, L, k)] });
    const b = Math.pow(k / (4 * rH.section.eiKnM2), 0.25), s = Math.sinh(b * L), c = Math.cosh(b * L), sn = Math.sin(b * L), cs = Math.cos(b * L);
    expect(b * L).toBeLessThan(2.5);
    check('kopverplaatsing (H)', head(rH).yM, 2 * H * b / k * (s * c - sn * cs) / (s * s - sn * sn), 1e-4);
    check('kopverplaatsing (M)', Math.abs(head(rM).yM), 2 * M * b * b / k * (s * s + sn * sn) / (s * s - sn * sn), 1e-4);
  });

  it('R3 starre korte paal met ingeklemde kop, constante bedding (Broms)', () => {
    const k = 1000, L = 2, H = 40;
    const r = run({ lengthM: L, headForceKn: H, headFixedRotation: true, layers: [manual(0, L, k)], section: { ...lateralExample.section, diameterMm: 1500 } });
    check('kopverplaatsing', head(r).yM, H / (k * L), 2e-3);
    check('inklemmoment', Math.abs(r.beam.headReactionMomentKnM), H * L / 2, 2e-3);
    check('max. moment', r.maxMomentKnM, H * L / 2, 2e-3);
    expect(peak(r.beam.samples).zM).toBe(0);
  });

  it('R4 starre paal, bedding lineair toenemend met de diepte (Barber)', () => {
    const nh = 2000, L = 3, H = 50, section = { ...lateralExample.section, diameterMm: 2000 };
    const free = run({ lengthM: L, headForceKn: H, layers: stepped(nh, L), maxElementM: L / 40, section });
    expect(nh * L ** 5 / free.section.eiKnM2).toBeLessThan(0.02);
    check('kopverplaatsing vrij', head(free).yM, 18 * H / (nh * L * L), 2e-3);
    check('kophoek vrij', Math.abs(head(free).rotationRad), 24 * H / (nh * L ** 3), 2e-3);
    const fixed = run({ lengthM: L, headForceKn: H, headFixedRotation: true, layers: stepped(nh, L), maxElementM: L / 40, section });
    check('kopverplaatsing ingeklemd', head(fixed).yM, 2 * H / (nh * L * L), 2e-3);
    check('inklemmoment', Math.abs(fixed.beam.headReactionMomentKnM), 2 * H * L / 3, 2e-3);
  });

  it('R5 Matlock & Reese: korte palen (Zmax = 2, 3, 4), ingeklemde kop en hoek', { timeout: 60000 }, () => {
    // Tabelwaarden aan maaiveld; de module rekent k = nh·z in 40 lagen (afwijking door opknippen < 0,5 % bij korte palen).
    const nh = 6000, H = 80, M = 40, EI = run({ lengthM: 12, headForceKn: H, layers: [manual(0, 12, 1)] }).section.eiKnM2, T = Math.pow(EI / nh, 0.2);
    for (const [Z, Ay, By] of [[2, 4.738, 3.418], [3, 2.727, 1.758], [4, 2.442, 1.622]]) {
      const L = Z * T, layers = stepped(nh, L);
      check(`Ay (Zmax ${Z})`, head(run({ lengthM: L, headForceKn: H, layers, maxElementM: L / 40 })).yM * EI / (H * T ** 3), Ay, 5e-3);
      check(`By (Zmax ${Z})`, Math.abs(head(run({ lengthM: L, headMomentKnM: M, layers, maxElementM: L / 40 })).yM) * EI / (M * T * T), By, 5e-3);
    }
    // Lange paal (Zmax = 7,3): opknippen in 40 lagen kost hier circa 0,9 %.
    const L = 12, layers = stepped(nh, L);
    const free = run({ lengthM: L, headForceKn: H, layers }), moment = run({ lengthM: L, headMomentKnM: M, layers }), fixed = run({ lengthM: L, headForceKn: H, headFixedRotation: true, layers });
    check('As', Math.abs(head(free).rotationRad) * EI / (H * T * T), 1.623, 0.015);
    check('Bs', Math.abs(head(moment).rotationRad) * EI / (M * T), 1.75, 0.015);
    check('diepte max. moment / T', peak(free.beam.samples).zM / T, 1.3, 0.05);
    check('Fy ingeklemde kop', head(fixed).yM * EI / (H * T ** 3), 0.93, 0.015);
    check('Fm ingeklemde kop', Math.abs(fixed.beam.headReactionMomentKnM) / (H * T), 0.93, 0.015);
  });
});

describe('Uitgewerkte voorbeelden en grenstoestand (Broms)', () => {
  const tube: PileSection = { ...lateralExample.section, kind: 'steel-tube', diameterMm: 400, wallMm: 5, barCount: 0, steelEMpa: 210000, tubeFydMpa: 450 };

  it('R6 Kouretzis voorbeeld 6.12: stalen buis Ø400/390 in klei, ingeklemde kop', { timeout: 60000 }, () => {
    check('traagheidsmoment', sectionStiffness(tube).eiKnM2 / 210e6, 0.000121, 2e-3);
    check('plastisch moment', sectionCapacity(tube, 0).mRdKnM, 351, 1e-3);
    // Kopverplaatsing bij Hw = 263,5 kN, Kh = 67·Su/D = 16750 kN/m³; bron: y = βL·Hw/(Kh·D·L) met βL = 5 afgelezen.
    const r = run({ lengthM: 10, headForceKn: 263.5, headFixedRotation: true, springWidthM: 0.4, layers: [manual(0, 10, 16750)], section: tube });
    check('kopverplaatsing', head(r).yM, 5 * 263.5 / (16750 * 0.4 * 10), 0.02);
    const b = Math.pow(6700 / (4 * r.section.eiKnM2), 0.25);
    check('kopverplaatsing (β niet afgerond)', head(r).yM, 263.5 * b / 6700, 1e-3);
    // Bezwijken als korte paal: Hf = 9·Su·D·(L − 1,5D) = 3384 kN, Mmax = 4,5·Su·D·(L² − 2,25D²) = 17935 kNm.
    const solve = (H: number) => plastic({ L: 10, H, fixed: true, top: 0.6, pu0: 360, gradient: 0 });
    check('bezwijkbelasting', collapseLoad(solve, 1000, 5000), 3384, 5e-3);
    check('inklemmoment bij 98 % Hf', Math.abs(solve(0.98 * 3384).headReactionMomentKnM), 0.98 * 17935, 0.02);
  });

  it('R7 Kouretzis voorbeeld 6.13: dezelfde paal in zand, ingeklemde kop', { timeout: 60000 }, () => {
    // pu = 3·Kp·γ·D·z; bron rekent met Kp = 3,39: Hf = 3661,2 kN en Mmax = 24408 kNm.
    const g = 3 * 3.39 * 18 * 0.4, solve = (H: number) => plastic({ L: 10, H, fixed: true, top: 0, pu0: 0, gradient: g });
    check('bezwijkbelasting', collapseLoad(solve, 1000, 5000), 3661.2, 5e-3);
    check('inklemmoment bij 98 % Hf', Math.abs(solve(0.98 * 3661.2).headReactionMomentKnM), 0.98 * 24408, 0.03);
  });

  it('R8 Broms korte paal met vrije kop in cohesieve grond', { timeout: 60000 }, () => {
    // D = 0,4 m, L = 4 m, Su = 100 kPa, e = 0: f = Hf/(9·Su·D), Hf·(1,5D + 0,5f) = 2,25·Su·D·(L − 1,5D − f)².
    // Uitgeschreven: f² + (4a + 2g)·f − g² = 0 met a = 1,5D en g = L − a.
    const pu = 360, a = 0.6, L = 4, g = L - a, f = (-(4 * a + 2 * g) + Math.sqrt((4 * a + 2 * g) ** 2 + 4 * g * g)) / 2;
    const Hf = pu * f;
    expect(Hf * (a + 0.5 * f)).toBeCloseTo(pu / 4 * (L - a - f) ** 2, 6);
    const solve = (H: number) => plastic({ L, H, top: a, pu0: pu, gradient: 0 });
    check('bezwijkbelasting', collapseLoad(solve, 50, 1000), Hf, 5e-3);
    const H = 0.97 * Hf, top = peak(solve(H).samples);
    check('max. moment bij 97 % Hf', Math.abs(top.momentKnM), H * (a + 0.5 * H / pu), 5e-3);
    check('diepte max. moment', top.zM, a + H / pu, 0.01);
  });

  it('R9 Broms korte paal met vrije kop in zand: verschil met de vereenvoudiging van Broms', { timeout: 60000 }, () => {
    // Broms vervangt de tegendruk onder het draaipunt door een puntlast aan de voet: Hf = ½·γ·Kp·D·L².
    // Met dezelfde pu = g·z aan weerszijden van het draaipunt volgt exact Hf = g·L²·(2^(−2/3) − ½).
    const g = 3 * 3.39 * 18 * 0.4, L = 4, exact = g * L * L * (Math.pow(2, -2 / 3) - 0.5), broms = g * L * L / 6;
    const module = collapseLoad((H) => plastic({ L, H, top: 0, pu0: 0, gradient: g }), 10, 1000);
    check('bezwijkbelasting (volledige verdeling)', module, exact, 5e-3);
    expect(broms / module).toBeGreaterThan(1.27); expect(broms / module).toBeLessThan(1.29);
  });
});

describe('Doorsnede', () => {
  it('R10 stalen buis: plastische interactie M = Mpl·cos(π·n/2) (dunwandig)', () => {
    const chs: PileSection = { ...lateralExample.section, kind: 'steel-tube', diameterMm: 600, wallMm: 12, barCount: 0, tubeFydMpa: 355 };
    const nPl = Math.PI * (0.6 ** 2 - 0.576 ** 2) / 4 * 355000, mPl = (0.6 ** 3 - 0.576 ** 3) / 6 * 355000;
    for (const n of [0.25, 0.5, 0.75]) check(`MRd bij N = ${n}·Npl`, sectionCapacity(chs, n * nPl).mRdKnM, mPl * Math.cos(Math.PI * n / 2), 1e-3);
    check('MRd bij trek', sectionCapacity(chs, -0.5 * nPl).mRdKnM, mPl * Math.cos(Math.PI / 4), 1e-3);
  });

  it('R11 betonpaal vierkant 400, 4Ø20: zuivere buiging met spanningsblokcoëfficiënten', () => {
    // Parabool-rechthoek bij εcu = 3,5 ‰: vulling 17/21, zwaartepunt op 99/238·x. De bovenstaven liggen onder de neutrale lijn (trek, elastisch).
    const b = 400, fcd = 20, fyd = 435, Es = 200000, As = 2 * Math.PI * 100, dTop = 50, dBot = 350;
    let lo = 1, hi = dTop;
    const sTop = (x: number) => Es * 0.0035 * (dTop - x) / x;
    for (let i = 0; i < 80; i++) { const x = (lo + hi) / 2; if (17 / 21 * b * x * fcd > As * fyd + As * sTop(x)) hi = x; else lo = x; }
    const x = (lo + hi) / 2;
    expect(sTop(x)).toBeLessThan(fyd);
    const mRd = (17 / 21 * b * x * fcd * (200 - 99 / 238 * x) + As * fyd * (dBot - 200) - As * sTop(x) * (200 - dTop)) / 1e6;
    check('MRd', sectionCapacity({ ...lateralExample.section, barCount: 4 }, 0).mRdKnM, mRd, 2e-3);
  });

  it('R12 betonpaal rond en betongevulde buis: onafhankelijke integratie over de hoek', { timeout: 60000 }, () => {
    const fcd = 20000, fyd = 435000, Es = 2e8;
    const independent = (o: { core: number; bars: number; barD: number; cover: number; nEd: number; tube?: { D: number; fy: number; E: number } }) => {
      const R = o.core / 2, sc = (e: number) => e <= 0 ? 0 : e >= 0.002 ? fcd : fcd * (1 - (1 - e / 0.002) ** 2), ss = (e: number, E: number, fy: number) => Math.max(-fy, Math.min(fy, E * e));
      const at = (x: number) => {
        const top = x <= o.core ? 0.0035 : 0.002 / (1 - 3 / 7 * o.core / x), eps = (y: number) => top * (1 - (R - y) / x);
        let n = 0, m = 0; const N = 20000;
        // Cirkel: dA = 2·r²·sin²θ dθ met y = r·cosθ.
        const disc = (r: number, stress: (e: number) => number, sign: number) => { for (let i = 0; i < N; i++) { const t = Math.PI * (i + 0.5) / N, y = r * Math.cos(t), dA = 2 * r * r * Math.sin(t) ** 2 * Math.PI / N, f = sign * stress(eps(y)) * dA; n += f; m += f * y; } };
        disc(R, sc, 1);
        if (o.tube) { const tb = o.tube, st = (e: number) => ss(e, tb.E, tb.fy); disc(tb.D / 2, st, 1); disc(R, st, -1); }
        const aBar = Math.PI * o.barD ** 2 / 4;
        for (let i = 0; i < o.bars; i++) { const y = (R - o.cover) * Math.sin(2 * Math.PI * i / o.bars), f = (ss(eps(y), Es, fyd) - sc(eps(y))) * aBar; n += f; m += f * y; }
        return { n, m };
      };
      let lo = o.core * 1e-6, hi = o.core * 1e6;
      for (let i = 0; i < 200; i++) { const mid = Math.sqrt(lo * hi); if (at(mid).n < o.nEd) lo = mid; else hi = mid; }
      return Math.abs(at(Math.sqrt(lo * hi)).m);
    };
    const round: PileSection = { ...lateralExample.section, kind: 'concrete-round', diameterMm: 500, barCount: 8 };
    for (const nEd of [0, 800]) check(`rond Ø500, N = ${nEd}`, sectionCapacity(round, nEd).mRdKnM, independent({ core: 0.5, bars: 8, barD: 0.02, cover: 0.05, nEd }), 2e-3);
    const filled: PileSection = { ...lateralExample.section, kind: 'filled-tube', diameterMm: 508, wallMm: 10, barCount: 6, tubeParticipates: true };
    check('gevulde buis Ø508×10, N = 500', sectionCapacity(filled, 500).mRdKnM,
      independent({ core: 0.488, bars: 6, barD: 0.02, cover: 0.05, nEd: 500, tube: { D: 0.508, fy: 355000, E: 2.1e8 } }), 2e-3);
  });
});

describe('Robuustheid van het elementnet (herstelde fouten)', () => {
  it('laaggrenzen die op afronding na samenvallen geven geen element van nul lengte', () => {
    // 40 × (L/40) is niet altijd exact L; voorheen ontstond dan een splinterelement en de melding "slecht geconditioneerd".
    const EI = 71220.63655501079, nh = 6000, L = 2 * Math.pow(EI / nh, 0.2);
    const layers = Array.from({ length: 40 }, (_, i) => ({ topM: i * L / 40, bottomM: (i + 1) * L / 40, lineSpringKnM2: nh * (i + 0.5) * L / 40, lineLoadKnM: 0 }));
    expect(layers[39].bottomM).not.toBe(L);
    const base = { lengthM: L, eiKnM2: EI, maxElementM: L / 40, headForceKn: 80, headMomentKnM: 0, headFixedRotation: false, toeFixed: false };
    const r = solveBeam({ ...base, layers });
    expect(r.nodes).toHaveLength(41);
    expect(r.nodes[40].zM).toBe(L);
    expect(Math.min(...r.elements.map((e) => e.bottomM - e.topM))).toBeGreaterThan(L / 41);
    // Ook een grens die een fractie naast de buurlaag ligt.
    const shifted = layers.map((l, i) => i === 10 ? { ...l, topM: l.topM + 1e-12 } : l);
    expect(solveBeam({ ...base, layers: shifted }).nodes[0].yM).toBeCloseTo(r.nodes[0].yM, 10);
  });

  it('een zeer stijve paal met korte elementen convergeert (afrondingsvloer in het residu)', () => {
    // Voorheen: "Geen convergentie", ook lineair, omdat het residu niet onder 1e-7·H kan komen.
    const r = computeLateral({ ...lateralExample, analysisMode: 'linear', layerCorrection: 'none', headForceKn: 50, headMomentKnM: 0, springWidthM: 1,
      lengthM: 3, maxElementM: 0.075, layers: stepped(2000, 3), section: { ...lateralExample.section, diameterMm: 2000 } });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.convergence.relativeResidual).toBeLessThan(1e-5); expect(Math.abs(r.beam.forceResidualKn)).toBeLessThan(1e-3); }
  });

  it('bezwijken wordt niet als evenwicht geaccepteerd', () => {
    expect(() => plastic({ L: 10, H: 1.01 * 3384, fixed: true, top: 0.6, pu0: 360, gradient: 0 })).toThrow(/convergentie|uitgeput/i);
  });

  it('de standaard elementlengte van 0,5 m is fijn genoeg voor het voorbeeld', () => {
    const coarse = computeLateral(lateralExample), fine = computeLateral({ ...lateralExample, maxElementM: 0.1 });
    if (!coarse.ok || !fine.ok) throw new Error('niet berekend');
    expect(Math.abs(coarse.beam.nodes[0].yM / fine.beam.nodes[0].yM - 1)).toBeLessThan(1e-4);
    expect(Math.abs(coarse.maxMomentKnM / fine.maxMomentKnM - 1)).toBeLessThan(1e-4);
  });
});
