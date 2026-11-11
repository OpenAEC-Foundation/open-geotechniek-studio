/**
 * Verificatie van de rekenkern horizontale paal tegen onafhankelijke referenties.
 *
 * A. Gesloten oplossingen (lineaire bedding):
 *    - Hetényi (1946), ligger op elastische bedding: half-oneindige paal en
 *      eindige paal via de exacte homogene oplossing van EI y'''' + k y = 0.
 *    - Starre korte paal: evenwicht van kracht en moment.
 *    - Matlock & Reese (1960): lineair toenemende bedding k = nh z, lange paal
 *      (Zmax >= 5), coëfficiënten Ay, By en Am,max.
 * B. Onafhankelijke eindige-differentieoplossing (andere discretisatie dan
 *    de Hermite-elementen van de rekenkern, Newton-iteratie op knopen,
 *    Richardson-extrapolatie) voor gelaagde en niet-lineaire bedding,
 *    inclusief een zelfstandig afgeleide Georgiadis-equivalente diepte.
 *
 * De rekenkern wordt steeds via computeLateral aangeroepen, dus inclusief
 * invoerverwerking en doorsnedestijfheid. EI wordt uit het resultaat gelezen.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { computeLateral, lateralExample, type LateralInput, type LateralLayer } from './compute';

type Ok = Extract<ReturnType<typeof computeLateral>, { ok: true }>;

function run(over: Partial<LateralInput>): Ok {
  const r = computeLateral({
    ...lateralExample, analysisMode: 'linear', layerCorrection: 'none',
    headForceKn: 0, headMomentKnM: 0, nEdKn: 0, springWidthM: 1, maxElementM: 0.1,
    headFixedRotation: false, toeFixed: false, ...over,
  });
  if (!r.ok) throw new Error(r.error);
  return r;
}
const manual = (topM: number, bottomM: number, kKnM2: number, ultimate?: LateralLayer['ultimate']): LateralLayer =>
  ({ topM, bottomM, springId: 'manual', manualKhKnM3: kKnM2, frictionDeg: 0, netPressureKpa: 0, ultimate });
const head = (r: Ok) => r.beam.nodes[0];
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);
const rows: Array<{ geval: string; grootheid: string; rekenkern: number; referentie: number; afwijking: string; grens: string }> = [];
function check(grootheid: string, rekenkern: number, referentie: number, grens: number) {
  const d = rel(rekenkern, referentie);
  rows.push({ geval: (expect.getState().currentTestName ?? '').split(' > ').pop()!.split(' ')[0], grootheid, rekenkern, referentie,
    afwijking: `${(d * 100).toPrecision(2)} %`, grens: `${grens * 100} %` });
  expect(d).toBeLessThan(grens);
}
// VERIFY_REPORT=1 npx vitest run verification → tabel met de werkelijke afwijkingen.
afterAll(() => { if (process.env.VERIFY_REPORT) console.table(rows); });

/* ---------- A. Exacte oplossing van EI y'''' + k y = 0 (uniforme k) ---------- */

type C = [number, number];
const cmul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cexp = (a: C): C => [Math.exp(a[0]) * Math.cos(a[1]), Math.exp(a[0]) * Math.sin(a[1])];
const cpow = (a: C, n: number): C => { let r: C = [1, 0]; for (let i = 0; i < n; i++) r = cmul(r, a); return r; };

function solve(A: number[][], b: number[]): number[] {
  const n = b.length, M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  const x = Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]; x[r] = s / M[r][r]; }
  return x;
}

/** Exacte eindige ligger op uniforme bedding; geeft y(z) en afgeleiden. */
function exactUniform(o: { L: number; EI: number; k: number; H: number; M: number; fixedHead?: boolean; toeFixed?: boolean }) {
  const b = Math.pow(o.k / (4 * o.EI), 0.25);
  const l1: C = [b, b], l3: C = [-b, b];
  // Basis met verschoven exponent tegen overloop bij lange palen.
  const basis = (z: number, n: number): number[] => {
    const e1 = cmul(cpow(l1, n), cexp(cmul(l1, [z - o.L, 0]))), e3 = cmul(cpow(l3, n), cexp(cmul(l3, [z, 0])));
    return [e1[0], e1[1], e3[0], e3[1]];
  };
  const rows: number[][] = [], rhs: number[] = [];
  if (o.fixedHead) { rows.push(basis(0, 1)); rhs.push(0); } else { rows.push(basis(0, 2).map(v => v * o.EI)); rhs.push(-o.M); }
  rows.push(basis(0, 3).map(v => v * o.EI)); rhs.push(o.H);
  if (o.toeFixed) { rows.push(basis(o.L, 0)); rhs.push(0); rows.push(basis(o.L, 1)); rhs.push(0); }
  else { rows.push(basis(o.L, 2)); rhs.push(0); rows.push(basis(o.L, 3)); rhs.push(0); }
  const c = solve(rows, rhs);
  const d = (z: number, n: number) => basis(z, n).reduce((s, v, i) => s + v * c[i], 0);
  let mMax = 0, zAtMax = 0;
  for (let i = 0; i <= 4000; i++) { const z = o.L * i / 4000, m = Math.abs(o.EI * d(z, 2)); if (m > mMax) { mMax = m; zAtMax = z; } }
  return { beta: b, y0: d(0, 0), rot0: d(0, 1), mMax, zAtMax, mHead: -o.EI * d(0, 2) };
}

/* ---------- B. Onafhankelijke eindige differenties met Newton ---------- */

type Law = (y: number, z: number) => { p: number; dp: number };
/** Bandoplossing (halve bandbreedte 4) zonder pivotering; rijen zo geordend dat de diagonaal gevuld is. */
function solveBand(A: number[][], b: number[], w = 4): number[] {
  const n = b.length, M = A.map(r => [...r]), x = [...b];
  for (let c = 0; c < n; c++) for (let r = c + 1; r <= Math.min(n - 1, c + w); r++) {
    const f = M[r][c] / M[c][c]; if (f === 0) continue;
    for (let k = c; k <= Math.min(n - 1, c + 2 * w); k++) M[r][k] -= f * M[c][k];
    x[r] -= f * x[c];
  }
  for (let r = n - 1; r >= 0; r--) { let s = x[r]; for (let k = r + 1; k <= Math.min(n - 1, r + 2 * w); k++) s -= M[r][k] * x[k]; x[r] = s / M[r][r]; }
  return x;
}
function fd(o: { L: number; EI: number; H: number; M: number; law: Law; n: number; fixedHead?: boolean }) {
  const { L, EI, n } = o, h = L / n, N = n + 5, id = (j: number) => j + 2;
  let u = Array(N).fill(0);
  const steps = 10;
  for (let s = 1; s <= steps; s++) {
    const H = o.H * s / steps, M = o.M * s / steps;
    for (let it = 0; it < 60; it++) {
      const J = Array.from({ length: N }, () => Array(N).fill(0)), R = Array(N).fill(0);
      const set = (row: number, coef: Array<[number, number]>, rhs: number) => {
        R[row] = coef.reduce((acc, [j, c]) => acc + c * u[id(j)], 0) - rhs;
        coef.forEach(([j, c]) => { J[row][id(j)] += c; });
      };
      // Rij id(j) hoort bij onbekende j: randvoorwaarden op de spookknopen.
      set(id(-2), [[-2, -EI / (2 * h ** 3)], [-1, EI / h ** 3], [1, -EI / h ** 3], [2, EI / (2 * h ** 3)]], H);
      if (o.fixedHead) set(id(-1), [[-1, -1], [1, 1]], 0);
      else set(id(-1), [[-1, EI / h ** 2], [0, -2 * EI / h ** 2], [1, EI / h ** 2]], -M);
      for (let i = 0; i <= n; i++) {
        const c = EI / h ** 4, row = id(i), { p, dp } = o.law(u[id(i)], i * h);
        set(row, [[i - 2, c], [i - 1, -4 * c], [i, 6 * c], [i + 1, -4 * c], [i + 2, c]], 0);
        R[row] += p; J[row][id(i)] += dp;
      }
      set(id(n + 1), [[n - 1, 1], [n, -2], [n + 1, 1]], 0);
      set(id(n + 2), [[n - 2, -1], [n - 1, 2], [n + 1, -2], [n + 2, 1]], 0);
      const du = solveBand(J, R.map(v => -v));
      u = u.map((v, i) => v + du[i]);
      if (Math.max(...du.map(Math.abs)) <= 1e-12 * Math.max(1e-12, ...u.map(Math.abs))) break;
    }
  }
  let mMax = 0;
  for (let i = 0; i <= n; i++) mMax = Math.max(mMax, Math.abs(EI * (u[id(i - 1)] - 2 * u[id(i)] + u[id(i + 1)]) / h ** 2));
  return { y0: u[id(0)], rot0: (u[id(1)] - u[id(-1)]) / (2 * h), mMax };
}
/** Richardson: twee roosters, O(h²) → O(h⁴). */
function fdRef(o: Omit<Parameters<typeof fd>[0], 'n'>, n = 160, richardson = true) {
  if (!richardson) return fd({ ...o, n });
  const a = fd({ ...o, n }), b = fd({ ...o, n: 2 * n });
  const x = (p: number, q: number) => (4 * q - p) / 3;
  return { y0: x(a.y0, b.y0), rot0: x(a.rot0, b.rot0), mMax: x(a.mMax, b.mMax) };
}
const layered = (ks: Array<[number, number]>): Law => (y, z) => {
  // ks: [ondergrens, k]; knoop precies op een laaggrens krijgt het gemiddelde.
  const i = ks.findIndex(([bot]) => z < bot - 1e-12), on = ks.findIndex(([bot]) => Math.abs(z - bot) < 1e-12);
  const k = on >= 0 && on + 1 < ks.length ? (ks[on][1] + ks[on + 1][1]) / 2 : ks[i >= 0 ? i : ks.length - 1][1];
  return { p: k * y, dp: k };
};
const tanhLaw = (k: number, pu: number) => (y: number) => ({ p: pu * Math.tanh(k * y / pu), dp: k / Math.cosh(k * y / pu) ** 2 });

/* ---------- Gevallen ---------- */

describe('Verificatie horizontale paal — gesloten oplossingen', () => {
  it('V1 lange paal, vrije kop, kopkracht (Hetényi half-oneindig)', () => {
    const k = 20000, L = 16, H = 100, r = run({ lengthM: L, headForceKn: H, layers: [manual(0, L, k)] });
    const EI = r.section.eiKnM2, b = Math.pow(k / (4 * EI), 0.25);
    expect(b * L).toBeGreaterThan(8);
    check('kopverplaatsing', head(r).yM, 2 * H * b / k, 1e-3);
    check('kophoek', Math.abs(head(r).rotationRad), 2 * H * b * b / k, 1e-3);
    check('max. moment', r.maxMomentKnM, 0.3224 * H / b, 1e-3);
  });

  it('V2 lange paal, vrije kop, kopmoment (Hetényi half-oneindig)', () => {
    const k = 20000, L = 16, M = 50, r = run({ lengthM: L, headMomentKnM: M, layers: [manual(0, L, k)] });
    const EI = r.section.eiKnM2, b = Math.pow(k / (4 * EI), 0.25);
    check('kopverplaatsing', Math.abs(head(r).yM), 2 * M * b * b / k, 1e-3);
    check('kophoek', Math.abs(head(r).rotationRad), 4 * M * b ** 3 / k, 1e-3);
    check('max. moment', r.maxMomentKnM, M, 1e-3);
  });

  it('V3 lange paal, ingeklemde kop (Hetényi half-oneindig)', () => {
    const k = 20000, L = 16, H = 100, r = run({ lengthM: L, headForceKn: H, headFixedRotation: true, layers: [manual(0, L, k)] });
    const EI = r.section.eiKnM2, b = Math.pow(k / (4 * EI), 0.25);
    check('kopverplaatsing', head(r).yM, H * b / k, 1e-3);
    expect(Math.abs(head(r).rotationRad)).toBeLessThan(1e-12);
    check('kopinklemmoment', Math.abs(r.beam.headReactionMomentKnM), H / (2 * b), 1e-3);
  });

  it('V4 korte starre paal (evenwicht kracht en moment)', () => {
    const k = 1000, L = 2, H = 40;
    const r = run({ lengthM: L, headForceKn: H, layers: [manual(0, L, k)], section: { ...lateralExample.section, diameterMm: 1500 } });
    expect(k * L ** 4 / r.section.eiKnM2).toBeLessThan(2e-3);
    check('kopverplaatsing', head(r).yM, 4 * H / (k * L), 2e-3);
    check('kophoek', Math.abs(head(r).rotationRad), 6 * H / (k * L * L), 2e-3);
  });

  it('V5 korte buigzame paal, kracht en moment (exacte eindige ligger)', () => {
    const k = 8000, L = 4, H = 60, M = 30, r = run({ lengthM: L, headForceKn: H, headMomentKnM: M, layers: [manual(0, L, k)] });
    const ex = exactUniform({ L, EI: r.section.eiKnM2, k, H, M });
    expect(ex.beta * L).toBeGreaterThan(1); expect(ex.beta * L).toBeLessThan(3);
    check('kopverplaatsing', head(r).yM, ex.y0, 1e-4);
    check('kophoek', head(r).rotationRad, ex.rot0, 1e-4);
    check('max. moment', r.maxMomentKnM, ex.mMax, 1e-3);
  });

  it('V6 paal met ingeklemde voet (exacte eindige ligger)', () => {
    const k = 3000, L = 5, H = 50, r = run({ lengthM: L, headForceKn: H, toeFixed: true, layers: [manual(0, L, k)] });
    const ex = exactUniform({ L, EI: r.section.eiKnM2, k, H, M: 0, toeFixed: true });
    check('kopverplaatsing', head(r).yM, ex.y0, 1e-4);
    check('max. moment', r.maxMomentKnM, ex.mMax, 1e-3);
  });

  it('V7 lineair toenemende bedding k = nh·z (Matlock & Reese, Zmax ≥ 5)', () => {
    // De rekenkern kent per laag een constante bedding: k = nh·z wordt in 40 lagen opgeknipt.
    // (a) rekenkern tegen dezelfde getrapte bedding, (b) doorlopende bedding tegen Matlock & Reese,
    // (c) het effect van het opknippen zelf, als bewaakte bovengrens.
    const nh = 6000, L = 12, H = 80, M = 40, n = 40;
    const layers = Array.from({ length: n }, (_, i) => manual(i * L / n, (i + 1) * L / n, nh * (i + 0.5) * L / n));
    const rH = run({ lengthM: L, headForceKn: H, layers, maxElementM: L / n }), rM = run({ lengthM: L, headMomentKnM: M, layers, maxElementM: L / n });
    const EI = rH.section.eiKnM2, T = Math.pow(EI / nh, 0.2);
    expect(L / T).toBeGreaterThan(5);
    const stepped = layered(layers.map(l => [l.bottomM, l.manualKhKnM3] as [number, number]));
    const refH = fdRef({ L, EI, H, M: 0, law: stepped }, 960, false);
    check('kopverplaatsing', head(rH).yM, refH.y0, 2e-4);
    check('max. moment', rH.maxMomentKnM, refH.mMax, 2e-4);
    const contH = fdRef({ L, EI, H, M: 0, law: (y, z) => ({ p: nh * z * y, dp: nh * z }) }, 300);
    const contM = fdRef({ L, EI, H: 0, M, law: (y, z) => ({ p: nh * z * y, dp: nh * z }) }, 300);
    check('kopverplaatsing', contH.y0, 2.435 * H * T ** 3 / EI, 5e-3);
    check('max. moment', contH.mMax, 0.772 * H * T, 5e-3);
    check('kopverplaatsing', Math.abs(contM.y0), 1.623 * M * T ** 2 / EI, 5e-3);
    check('kopverplaatsing', head(rH).yM, contH.y0, 0.01);
    check('kopverplaatsing', Math.abs(head(rM).yM), Math.abs(contM.y0), 0.01);
  }, 60000);
});

describe('Verificatie horizontale paal — onafhankelijke differentieoplossing', () => {
  it('controle: de differentiemethode zelf reproduceert de exacte eindige ligger', () => {
    const o = { L: 6, EI: 60000, k: 8000, H: 60, M: 30 };
    const ex = exactUniform(o), ref = fdRef({ ...o, law: (y) => ({ p: o.k * y, dp: o.k }) });
    check('ref.y0', ref.y0, ex.y0, 1e-4);
    check('ref.rot0', ref.rot0, ex.rot0, 1e-4);
    check('max. moment', ref.mMax, ex.mMax, 1e-3);
  });

  it('V8 twee lagen, slap op stijf, lineair', () => {
    const L = 12, H = 50, M = 20;
    const r = run({ lengthM: L, headForceKn: H, headMomentKnM: M, layers: [manual(0, 4, 2000), manual(4, L, 20000)] });
    // Sprong in k: geen Richardson; 960 intervallen leggen de laaggrens op een knoop.
    const ref = fdRef({ L, EI: r.section.eiKnM2, H, M, law: layered([[4, 2000], [L, 20000]]) }, 960, false);
    check('kopverplaatsing', head(r).yM, ref.y0, 1e-4);
    check('kophoek', head(r).rotationRad, ref.rot0, 1e-4);
    check('max. moment', r.maxMomentKnM, ref.mMax, 1e-4);
  }, 60000);

  it('V9 niet-lineair, één laag, hoge mobilisatie', () => {
    const L = 12, H = 120, k = 8000, pu = 60;
    const r = run({ lengthM: L, headForceKn: H, analysisMode: 'nonlinear', layers: [manual(0, L, k, { atSurfaceKnM: pu, gradientKnM2: 0, capKnM: pu })] });
    const ref = fdRef({ L, EI: r.section.eiKnM2, H, M: 0, law: (y) => tanhLaw(k, pu)(y) });
    expect(Math.max(...r.springs.map(s => Math.abs(s.resistanceKnM) / (s.ultimateKnM ?? 1)))).toBeGreaterThan(0.9);
    check('kopverplaatsing', head(r).yM, ref.y0, 2e-4);
    check('max. moment', r.maxMomentKnM, ref.mMax, 5e-4);
  });

  it('V10 niet-lineair, met diepte toenemende pu met bovengrens', () => {
    const L = 12, H = 90, M = 30, k = 10000, a = 10, g = 25, cap = 150;
    const r = run({ lengthM: L, headForceKn: H, headMomentKnM: M, analysisMode: 'nonlinear', layers: [manual(0, L, k, { atSurfaceKnM: a, gradientKnM2: g, capKnM: cap })] });
    const ref = fdRef({ L, EI: r.section.eiKnM2, H, M, law: (y, z) => tanhLaw(k, Math.min(cap, a + g * z))(y) });
    check('kopverplaatsing', head(r).yM, ref.y0, 2e-4);
    check('max. moment', r.maxMomentKnM, ref.mMax, 5e-4);
  });

  it('V11 niet-lineair, twee lagen met Georgiadis-equivalente diepte', () => {
    const L = 12, H = 70, z1 = 3;
    const u1 = { atSurfaceKnM: 20, gradientKnM2: 10, capKnM: 200 }, u2 = { atSurfaceKnM: 0, gradientKnM2: 60, capKnM: 400 };
    const r = run({ lengthM: L, headForceKn: H, analysisMode: 'nonlinear', layerCorrection: 'georgiadis',
      layers: [manual(0, z1, 3000, u1), manual(z1, L, 25000, u2)] });
    // Zelfstandig: ∫0^z* 60 z dz = ∫0^3 (20 + 10 z) dz = 105 kN → z* = √(2·105/60).
    const zStar = Math.sqrt(2 * (20 * z1 + 5 * z1 * z1) / 60);
    const law: Law = (y, z) => z < z1 - 1e-12 ? tanhLaw(3000, 20 + 10 * z)(y)
      : Math.abs(z - z1) < 1e-12 ? (() => { const p = tanhLaw(3000, 20 + 10 * z)(y), q = tanhLaw(25000, Math.min(400, 60 * zStar))(y); return { p: (p.p + q.p) / 2, dp: (p.dp + q.dp) / 2 }; })()
      : tanhLaw(25000, Math.min(400, 60 * (zStar + z - z1)))(y);
    check('equivalente diepte', r.layering[1].topEquivalentM, zStar, 1e-12);
    const ref = fdRef({ L, EI: r.section.eiKnM2, H, M: 0, law });
    check('kopverplaatsing', head(r).yM, ref.y0, 2e-4);
    check('max. moment', r.maxMomentKnM, ref.mMax, 5e-4);
  });

  it('evenwicht: grondreactie en kopbelasting sluiten in alle gevallen', () => {
    const r = run({ lengthM: 12, headForceKn: 90, headMomentKnM: 30, analysisMode: 'nonlinear',
      layers: [manual(0, 12, 10000, { atSurfaceKnM: 10, gradientKnM2: 25, capKnM: 150 })] });
    expect(Math.abs(r.beam.forceResidualKn)).toBeLessThan(1e-6);
    expect(Math.abs(r.beam.momentResidualKnM)).toBeLessThan(1e-6);
  });
});
