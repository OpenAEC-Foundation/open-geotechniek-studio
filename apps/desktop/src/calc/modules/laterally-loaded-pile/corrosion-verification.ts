// Verificatie van afgeroeste stalen buispalen: zes handgerekende gevallen (VERIFICATIE.md, hoofdstuk "Verificatie
// afroesting"), live doorgerekend met de code van de module: corrodePile voor de doorsnede na afroesting en
// tubeChecks (material-steel.ts) voor de toetsen. Getoetst in corrosion-verification.test.ts en in de app getoond in
// het blok "Verificatie" bij de afroesting.
//
// Handformules (NEN-EN 1993-1-1):
//   t_red = t − Δ_buiten − Δ_binnen; D_red = D − 2 Δ_buiten; d = D_red − 2 t_red
//   A = π (D² − d²) / 4; I = π (D⁴ − d⁴) / 64; W_el = 2 I / D; W_pl = (D³ − d³) / 6
//   klasse tabel 5.2: D/t ≤ 50 ε², 70 ε², 90 ε² (ε² = 235 / f_y)
//   M_c,Rd = W_pl f_y (klasse 1-2) of W_el f_y (klasse 3), art. 6.2.5; N_c,Rd = A f_y, art. 6.2.4;
//   V_pl,Rd = (2 A / π) f_y / √3, art. 6.2.6
//   interactie klasse 1-2: M_N,Rd = M_pl,Rd · cos(π n / 2), n = N / N_pl,Rd (dunwandige buis), art. 6.2.9.1;
//   klasse 3: σ = N / A + M / W_el, art. 6.2.9.2.
// De verwachte getallen staan hier als vaste waarden, met de hand (rekenmachine) uitgerekend met deze formules.
import type { VerificationRow } from '../../shared/corrosion-verification';
import { NO_CORROSION, type CorrosionFace } from '../../shared/corrosion';
import { corrodePile } from './corrosion-section';
import { tubeChecks, tubeProps } from './material-steel';
import type { Demand } from './material-types';
import type { PileSection } from './section';

const custom = (mm: number): CorrosionFace => ({ ...NO_CORROSION, source: 'custom', customMm: mm });
const base: PileSection = { kind: 'steel-tube', diameterMm: 0, wallMm: 0, concreteEMpa: 30000, steelEMpa: 210000, rebarEMpa: 200000, concreteFactor: 1, creepCoefficient: 0, tubeParticipates: false, barCount: 0, barDiameterMm: 16, coverToBarCentreMm: 50, fckMpa: 30, fcdMpa: 20, fydMpa: 435, tubeFydMpa: 355 };

interface TubeCase {
  id: string; D: number; t: number; fy: number; outer: number; inner: number; nKn: number; mKnM: number;
  expect: { t: number; D: number; A: number; I: number; wel: number; wpl: number; dt: number; cls: number; mc: number | null; nc: number; v: number; interaction?: { s: string; v: number } };
}
/** Verwachte waarden in mm, mm², cm⁴, cm³, kNm en kN. */
export const TUBE_CASES: readonly TubeCase[] = [
  { id: 'B1', D: 323.9, t: 10, fy: 355, outer: 1.2, inner: 0, nKn: 0, mKnM: 0, expect: { t: 8.8, D: 321.5, A: 8644.9, I: 10574.7, wel: 657.84, wpl: 860.70, dt: 36.53, cls: 2, mc: 305.55, nc: 3068.9, v: 1128.0 } },
  { id: 'B2', D: 323.9, t: 10, fy: 355, outer: 1.2, inner: 1.2, nKn: 0, mKnM: 0, expect: { t: 7.6, D: 321.5, A: 7494.7, I: 9236.4, wel: 574.58, wpl: 749.00, dt: 42.30, cls: 2, mc: 265.89, nc: 2660.6, v: 977.9 } },
  { id: 'B3', D: 508, t: 14.2, fy: 355, outer: 2.0, inner: 0, nKn: 1000, mKnM: 0, expect: { t: 12.2, D: 504, A: 18849.4, I: 57023.3, wel: 2262.83, wpl: 2951.39, dt: 41.31, cls: 2, mc: 1047.74, nc: 6691.5, v: 2459.5, interaction: { s: 'M_N,Rd [kNm]', v: 1019.01 } } },
  { id: 'B4', D: 610, t: 12, fy: 355, outer: 1.75, inner: 1.75, nKn: 0, mKnM: 0, expect: { t: 8.5, D: 606.5, A: 15968.7, I: 71395.4, wel: 2354.34, wpl: 3039.84, dt: 71.35, cls: 4, mc: null, nc: 5668.9, v: 2083.6 } },
  { id: 'B5', D: 406.4, t: 10, fy: 355, outer: 1.2, inner: 1.2, nKn: 500, mKnM: 200, expect: { t: 7.6, D: 404, A: 9464.5, I: 18596.6, wel: 920.62, wpl: 1194.36, dt: 53.16, cls: 3, mc: 326.82, nc: 3359.9, v: 1234.9, interaction: { s: 'σ_x,Ed [MPa]', v: 270.08 } } },
  { id: 'B6', D: 219.1, t: 8, fy: 235, outer: 3.0, inner: 0, nKn: 0, mKnM: 0, expect: { t: 5.0, D: 213.1, A: 3268.8, I: 1770.5, wel: 166.17, wpl: 216.57, dt: 42.62, cls: 1, mc: 50.89, nc: 768.2, v: 282.3 } },
  // Meerpaal, open stalen buis Ø914×20, referentierapport 2025 (VERIFICATIE.md, "Meerpaal in open water"): 0,012 mm/jaar
  // aan beide zijden, 50 jaar. De bron rekent EI = 1 108 260 kNm², A = 52 801 mm² en V_pl,Rd = 6 889,6 kN met dezelfde
  // doorsnede, maar M_pl,Rd = 5 334,9 kNm met W_pl terwijl D/t in klasse 3 valt.
  { id: 'B7', D: 914, t: 20, fy: 355, outer: 0.6, inner: 0.6, nKn: 0, mKnM: 0, expect: { t: 18.8, D: 912.8, A: 52801.4, I: 527742.8, wel: 11563.16, wpl: 15027.85, dt: 48.55, cls: 3, mc: 4104.92, nc: 18744.5, v: 6889.6 } },
];

export function tubeVerification(): VerificationRow[] {
  const rows: VerificationRow[] = [];
  for (const c of TUBE_CASES) {
    const section = { ...base, diameterMm: c.D, wallMm: c.t, tubeFydMpa: c.fy };
    const info = corrodePile(section, { outer: custom(c.outer), inner: custom(c.inner), sides: c.inner > 0 ? 2 : 1, reducedStiffness: false })!;
    const s = info.section, p = tubeProps(s.diameterMm, s.wallMm, c.fy);
    const demand: Demand = { nEdKn: c.nKn, mMaxKnM: c.mKnM, zM: 0, vMaxKn: 0, zV: 0, samples: [{ zM: 0, m: c.mKnM, v: 0 }] };
    const checks = tubeChecks(s, demand), row = (id: string) => checks.rows.find((r) => r.id === id);
    const input = `D ${c.D} × ${c.t} mm, S${c.fy}, Δ ${c.outer}${c.inner ? ` + ${c.inner}` : ''} mm (${c.inner ? '2 kanten' : '1 kant'})${c.nKn ? `, N ${c.nKn} kN` : ''}`.replace(/\./g, ',');
    const add = (quantity: string, expected: number, actual: number, basis: string, tolerance = 0.001) => rows.push({ id: c.id, input, quantity, expected, actual, tolerance, basis });
    add('t_red [mm]', c.expect.t, s.wallMm, 't − Δ', 1e-9); add('D_red [mm]', c.expect.D, s.diameterMm, 'D − 2 Δ_buiten', 1e-9);
    add('A [mm²]', c.expect.A, p.area, 'π (D² − d²) / 4'); add('I [cm⁴]', c.expect.I, (p.wel * s.diameterMm) / 2 / 1e4, 'π (D⁴ − d⁴) / 64');
    add('W_el [cm³]', c.expect.wel, p.wel / 1e3, '2 I / D'); add('W_pl [cm³]', c.expect.wpl, p.wpl / 1e3, '(D³ − d³) / 6');
    add('D/t', c.expect.dt, p.dt, 'D_red / t_red'); add('klasse', c.expect.cls, p.cls, 'EN 1993-1-1 tabel 5.2', 0);
    if (c.expect.mc !== null) add('M_c,Rd [kNm]', c.expect.mc, row('bending')!.resistance!.v, 'art. 6.2.5');
    else add('buiten de toetsing (klasse 4)', 1, row('bending')?.status === 'outside' ? 1 : 0, 'NEN-EN 1993-1-6', 0);
    add('N_c,Rd [kN]', c.expect.nc, p.nRdKn, 'art. 6.2.4'); add('V_pl,Rd [kN]', c.expect.v, p.vplRdKn, 'art. 6.2.6');
    if (c.expect.interaction) {
      const r = row('interaction')!, elastic = c.expect.cls === 3;
      add(c.expect.interaction.s, c.expect.interaction.v, elastic ? r.demand!.v : r.resistance!.v, elastic ? 'N / A + M / W_el, art. 6.2.9.2' : 'M_pl,Rd cos(π n / 2), art. 6.2.9.1', elastic ? 0.001 : 0.005);
    }
  }
  return rows;
}
