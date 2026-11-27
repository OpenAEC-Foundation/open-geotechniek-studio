// Materiaaltoetsing stalen buis (NEN-EN 1993-1-1) en betongevulde buis als
// staal-betondoorsnede (NEN-EN 1994-1-1 art. 6.7.3, vereenvoudigde methode).
// Eenheden hier: N, mm en MPa; de uitkomsten in kN en kNm.
//
// Stalen buis, NEN-EN 1993-1-1:
//   doorsnedeklasse, tabel 5.2 (buisprofiel): D/t ≤ 50 ε² klasse 1, ≤ 70 ε² klasse 2,
//     ≤ 90 ε² klasse 3, daarboven klasse 4; ε = √(235 / f_y)
//   N_c,Rd = A · f_y / γ_M0                                   art. 6.2.4 (trek: art. 6.2.3)
//   M_c,Rd = W_pl · f_y / γ_M0 (klasse 1 en 2), W_el (klasse 3)  art. 6.2.5
//     W_el = π (D⁴ − d⁴) / (32 D); W_pl = (D³ − d³) / 6
//   V_pl,Rd = A_v · f_y / (√3 · γ_M0), A_v = 2 A / π           art. 6.2.6 (2) en (3)
//   V_Ed > 0,5 V_pl,Rd: vloeigrens (1 − ρ) f_y, ρ = (2 V_Ed / V_pl,Rd − 1)²   art. 6.2.8, 6.2.10
//     (hier op de hele doorsnede in plaats van alleen het afschuifoppervlak: veilige kant)
//   buiging met normaalkracht: klasse 1 en 2 de plastische N–M-interactie van de buis
//     (art. 6.2.9.1, exact uit de spanningsblokken); klasse 3 de elastische toets
//     N_Ed / A + M_Ed / W_el ≤ f_y / γ_M0 (art. 6.2.9.2)
//   klasse 4 valt buiten deze toetsing (NEN-EN 1993-1-6).
//
// Betongevulde buis, NEN-EN 1994-1-1:
//   toepassingsgebied: S235-S460, C20/25-C50/60 (art. 6.7.1 (2)); 0,2 ≤ δ ≤ 0,9 met
//     δ = A_a f_yd / N_pl,Rd (art. 6.7.1 (4)); D/t ≤ 90 · 235 / f_y (tabel 6.3);
//     langswapening hoogstens 6 % van het betonoppervlak (art. 6.7.3.1 (3))
//   N_pl,Rd = A_a f_yd + A_c f_cd + A_s f_sd (gevulde buis: f_cd zonder de factor 0,85)   art. 6.7.3.2 (1)
//   M_pl,N,Rd uit volledig plastische spanningsblokken, betontrek niet meegerekend    art. 6.7.3.2 (2), (5)
//   M_Ed ≤ α_M · M_pl,N,Rd; α_M = 0,9 voor S235-S355 en 0,8 voor S420-S460            art. 6.7.3.6 (1)
//   dwarskracht op de buis alleen; bij V_Ed > 0,5 V_pl,a,Rd de vloeigrens van de buis
//     verlaagd met (1 − ρ)                                                           art. 6.7.3.2 (3), (4)
//   De verhoging van de betonsterkte door omsnoering (art. 6.7.3.2 (6)) is niet benut.
import { GAMMA_M0 } from './materials';
import { check, noCheck, shearRho, ucOf, type CheckRow, type Demand, type ExistingCheck, type Note, type PartialResult } from './material-types';
import { sectionCapacity, type PileSection } from './section';

const EN3 = 'NEN-EN 1993-1-1', EN4 = 'NEN-EN 1994-1-1';

/** Doorsnedegrootheden en weerstanden van een buis D × t bij vloeigrens fy [MPa]. */
export function tubeProps(D: number, t: number, fy: number) {
  const di = D - 2 * t, area = Math.PI * (D * D - di * di) / 4, eps2 = 235 / fy, dt = D / t;
  const wel = Math.PI * (D ** 4 - di ** 4) / (32 * D), wpl = (D ** 3 - di ** 3) / 6, av = 2 * area / Math.PI;
  const cls = dt <= 50 * eps2 ? 1 : dt <= 70 * eps2 ? 2 : dt <= 90 * eps2 ? 3 : 4;
  return { di, area, eps2, dt, cls, wel, wpl, av,
    nRdKn: area * fy / GAMMA_M0 / 1000, mElRdKnM: wel * fy / GAMMA_M0 / 1e6, mPlRdKnM: wpl * fy / GAMMA_M0 / 1e6, vplRdKn: av * fy / Math.sqrt(3) / GAMMA_M0 / 1000 };
}

export function tubeChecks(s: PileSection, d: Demand): PartialResult {
  const fy = s.tubeFydMpa * GAMMA_M0, p = tubeProps(s.diameterMm, s.wallMm, fy), rows: CheckRow[] = [], notes: Note[] = [];
  const notChecked: Note = { key: 'notTube', nl: 'Niet getoetst: knik van de staaf (art. 6.3; de paal is in de grond gesteund), doorsnedeklasse 4 en schaalplooi (NEN-EN 1993-1-6), tweede-orde-effecten (P–Δ), lassen en verbindingen, vermoeiing en corrosie (vul de restwanddikte in).' };
  const classSteps = [{ s: 'ε', f: '√(235 / f_y)', v: Math.sqrt(p.eps2), u: '', d: 3 }, { s: '50 ε²', v: 50 * p.eps2, u: '', d: 1 }, { s: '70 ε²', v: 70 * p.eps2, u: '', d: 1 }, { s: '90 ε²', v: 90 * p.eps2, u: '', d: 1 }];
  const classRow = check('tubeClass', 'Doorsnedeklasse en lokale plooi', `${EN3} tabel 5.2`, { s: 'D/t', v: p.dt, u: '', d: 1 }, { s: '90 ε²', v: 90 * p.eps2, u: '', d: 1 }, classSteps);
  if (p.cls === 4) {
    const note: Note = { key: 'class4', nl: 'Doorsnedeklasse 4: lokale plooi is maatgevend. Dat valt buiten deze toetsing (NEN-EN 1993-1-6); de weerstanden zijn niet berekend.' };
    rows.push({ ...classRow, status: 'outside', note });
    for (const [id, label, art] of [['axial', 'Normaalkracht', '6.2.4'], ['bending', 'Buiging', '6.2.5'], ['shear', 'Dwarskracht', '6.2.6'], ['interaction', 'Buiging, normaalkracht en dwarskracht', '6.2.8-6.2.10']])
      rows.push(noCheck(id, label, `${EN3} art. ${art}`, 'outside', { key: 'class4Short', nl: 'Valt buiten deze toetsing (doorsnedeklasse 4).' }));
    return { standard: 'NEN-EN 1993-1-1 met Nederlandse bijlage', rows, notes, notChecked };
  }
  // De grens D/t is een voorwaarde, geen benutting: de rij telt niet mee in de maatgevende u.c.
  rows.push({ ...classRow, status: 'info', note: { key: 'tubeClassIs', nl: 'Doorsnedeklasse {{cls}}.', vars: { cls: p.cls } } });
  const plastic = p.cls <= 2, mcRd = plastic ? p.mPlRdKnM : p.mElRdKnM;
  rows.push(check('axial', 'Normaalkracht', `${EN3} art. ${d.nEdKn < 0 ? '6.2.3' : '6.2.4'}`, { s: 'N_Ed', v: d.nEdKn, u: 'kN' }, { s: 'N_c,Rd', v: p.nRdKn, u: 'kN' }, [
    { s: 'A', f: 'π (D² − d²) / 4', v: p.area, u: 'mm²', d: 0 }, { s: 'f_y', v: fy, u: 'MPa', d: 0 }, { s: 'N_c,Rd', f: 'A f_y / γ_M0', v: p.nRdKn, u: 'kN' }]));
  rows.push(check('bending', 'Buiging', `${EN3} art. 6.2.5`, { s: 'M_Ed', v: d.mMaxKnM, u: 'kNm' }, { s: 'M_c,Rd', v: mcRd, u: 'kNm' }, [
    plastic ? { s: 'W_pl', f: '(D³ − d³) / 6', v: p.wpl / 1000, u: 'cm³', d: 0 } : { s: 'W_el', f: 'π (D⁴ − d⁴) / (32 D)', v: p.wel / 1000, u: 'cm³', d: 0 },
    { s: 'M_c,Rd', f: plastic ? 'W_pl f_y / γ_M0' : 'W_el f_y / γ_M0', v: mcRd, u: 'kNm' }], { zM: d.zM }));
  rows.push(check('shear', 'Dwarskracht', `${EN3} art. 6.2.6`, { s: 'V_Ed', v: d.vMaxKn, u: 'kN' }, { s: 'V_pl,Rd', v: p.vplRdKn, u: 'kN' }, [
    { s: 'A_v', f: '2 A / π', v: p.av, u: 'mm²', d: 0 }, { s: 'V_pl,Rd', f: 'A_v f_y / (√3 γ_M0)', v: p.vplRdKn, u: 'kN' }], { zM: d.zV }));

  // Interactie in elke snede; de hoogste u.c. is maatgevend.
  const cache = new Map<number, number>();
  const mPlastic = (rho: number) => { if (!cache.has(rho)) { let m = 0; try { m = sectionCapacity({ ...s, tubeFydMpa: s.tubeFydMpa * (1 - rho) }, d.nEdKn).mRdKnM; } catch { m = 0; } cache.set(rho, m); } return cache.get(rho)!; };
  let best = { uc: -1, zM: 0, rho: 0, m: 0, v: 0, r: 0 };
  for (const q of d.samples) {
    const rho = shearRho(q.v, p.vplRdKn), f = 1 - rho;
    const r = plastic ? mPlastic(rho) : f * fy / GAMMA_M0, e = plastic ? q.m : Math.abs(d.nEdKn) * 1000 / p.area + q.m * 1e6 / p.wel;
    const uc = ucOf(e, r);
    if (uc > best.uc) best = { uc, zM: q.zM, rho, m: e, v: q.v, r };
  }
  const steps = [{ s: 'n', f: 'N_Ed / N_c,Rd', v: Math.abs(d.nEdKn) / p.nRdKn, u: '', d: 3 }, { s: 'V_Ed', v: best.v, u: 'kN' }, { s: 'ρ', f: '(2 V_Ed / V_pl,Rd − 1)² (V_Ed > 0,5 V_pl,Rd)', v: best.rho, u: '', d: 3 }];
  rows.push(plastic
    ? check('interaction', 'Buiging, normaalkracht en dwarskracht', `${EN3} art. 6.2.9.1, 6.2.10`, { s: 'M_Ed', v: best.m, u: 'kNm' }, { s: 'M_N,V,Rd', v: best.r, u: 'kNm' }, steps, { zM: best.zM })
    : check('interaction', 'Buiging, normaalkracht en dwarskracht', `${EN3} art. 6.2.9.2, 6.2.10`, { s: 'σ_x,Ed', v: best.m, u: 'MPa', d: 0 }, { s: 'f_y,red', v: best.r, u: 'MPa', d: 0 },
      [...steps, { s: 'σ_x,Ed', f: 'N_Ed / A + M_Ed / W_el', v: best.m, u: 'MPa', d: 0 }, { s: 'f_y,red', f: '(1 − ρ) f_y / γ_M0', v: best.r, u: 'MPa', d: 0 }], { zM: best.zM }));
  if (!plastic) notes.push({ key: 'class3', nl: 'Doorsnedeklasse 3: elastisch getoetst. De N–M-kromme en de u.c. van de doorsnedetoets N–M hierboven zijn plastisch en gelden voor deze buis niet.' });
  notes.push({ key: 'tubeYield', nl: 'f_y is de ingevoerde rekenwaarde f_yd van het buisstaal maal γ_M0 = 1,0; de wanddikte is de ingevoerde restwanddikte.' });
  return { standard: 'NEN-EN 1993-1-1 met Nederlandse bijlage', rows, notes, notChecked };
}

export interface CompositeSection { D: number; t: number; barY: number[]; barDia: number; fyd: number; fcd: number; fsd: number }
/**
 * Plastische momentweerstand M_pl,N,Rd [kNm] van een betongevulde buis bij normaalkracht
 * nEdN [N, druk +]: buis ±f_yd, beton f_cd in de drukzone en geen trek, staven ±f_sd
 * (in de drukzone verminderd met het verdrongen beton). null als N buiten het bereik ligt.
 */
export function compositePlastic(c: CompositeSection, nEdN: number) {
  const R = c.D / 2, ri = R - c.t, aa = Math.PI * (R * R - ri * ri), ab = Math.PI * c.barDia ** 2 / 4;
  // Cirkelsegment boven de koorde op hoogte a: oppervlak en statisch moment om het middelpunt.
  const seg = (r: number, a: number) => { const x = Math.max(-r, Math.min(r, a)), h2 = Math.max(0, r * r - x * x); return { area: r * r * Math.acos(x / r) - x * Math.sqrt(h2), q: 2 / 3 * h2 ** 1.5 }; };
  const response = (a: number) => {
    const o = seg(R, a), i = seg(ri, a);
    let n = c.fyd * (2 * (o.area - i.area) - aa) + c.fcd * i.area, m = 2 * c.fyd * (o.q - i.q) + c.fcd * i.q;
    for (const y of c.barY) {
      // Een staaf die de neutrale lijn snijdt, gaat geleidelijk van trek naar druk.
      const frac = Math.max(0, Math.min(1, (y + c.barDia / 2 - a) / c.barDia)), force = ab * (frac * (c.fsd - c.fcd) - (1 - frac) * c.fsd);
      n += force; m += force * y;
    }
    return { n, m };
  };
  const nMax = response(-R).n, nMin = response(R).n;
  if (nEdN > nMax + 1 || nEdN < nMin - 1) return null;
  let lo = -R, hi = R;
  for (let k = 0; k < 80; k++) { const mid = (lo + hi) / 2; if (response(mid).n > nEdN) lo = mid; else hi = mid; }
  const a = (lo + hi) / 2;
  return { mRdKnM: Math.abs(response(a).m) / 1e6, neutralAxisMm: a, nMaxKn: nMax / 1000, nMinKn: nMin / 1000 };
}

export function compositeChecks(s: PileSection, d: Demand, existing: ExistingCheck): PartialResult {
  const rows: CheckRow[] = [], notes: Note[] = [];
  const D = s.diameterMm, t = s.wallMm, di = D - 2 * t, fy = s.tubeFydMpa * GAMMA_M0, fyd = s.tubeFydMpa, fcd = s.fcdMpa, fsd = s.fydMpa;
  const tube = tubeProps(D, t, fy), as = s.barCount * Math.PI * s.barDiameterMm ** 2 / 4, ac = Math.PI * di * di / 4 - as;
  const rs = di / 2 - s.coverToBarCentreMm, barY = Array.from({ length: s.barCount }, (_, k) => rs * Math.sin(2 * Math.PI * k / s.barCount));
  const section = (factor: number): CompositeSection => ({ D, t, barY, barDia: s.barDiameterMm, fyd: fyd * factor, fcd, fsd });
  const nplRd = (tube.area * fyd + ac * fcd + as * fsd) / 1000, delta = tube.area * fyd / (nplRd * 1000), tension = d.nEdKn < 0, ntRd = (tube.area * fyd + as * fsd) / 1000;
  const notChecked: Note = { key: 'notComposite', nl: 'Niet getoetst: schuifverbinding en krachtsinleiding tussen buis en beton (art. 6.7.4), knik van de staaf (art. 6.7.3.5; de paal is in de grond gesteund), tweede-orde-effecten, kruip en krimp in de sterkte, scheurwijdte en corrosie (vul de restwanddikte in). De verhoging door omsnoering is niet benut.' };

  if (existing.uc !== null && existing.mRdKnM !== null) rows.push({ id: 'bendingN', label: 'Buiging met normaalkracht', article: 'NEN-EN 1992-1-1 art. 6.1', demand: { s: 'M_Ed', v: d.mMaxKnM, u: 'kNm' }, resistance: { s: 'M_Rd', v: existing.mRdKnM, u: 'kNm' },
    uc: existing.uc, status: existing.uc <= 1 ? 'ok' : 'fail', zM: d.zM, steps: [{ s: 'N_Ed', v: d.nEdKn, u: 'kN' }],
    note: { key: 'strainComposite', nl: 'Bestaande toets met vlakke doorsnede en betonstuik 3,5 ‰; strenger dan de plastische methode van NEN-EN 1994-1-1 hieronder.' } });

  const scopeOk = fy >= 235 && fy <= 460 && s.fckMpa >= 20 && s.fckMpa <= 50 && as <= .06 * (Math.PI * di * di / 4) + 1e-9;
  if (!scopeOk) rows.push(noCheck('compScope', 'Toepassingsgebied vereenvoudigde methode', `${EN4} art. 6.7.1 (2), 6.7.3.1`, 'outside',
    { key: 'compositeScope', nl: 'Buiten het toepassingsgebied: de methode geldt voor S235 tot en met S460, C20/25 tot en met C50/60 en langswapening tot 6 % van het betonoppervlak.' }));
  const limitDt = 90 * 235 / fy, dtRow = check('compDt', 'Lokale plooi van de buis', `${EN4} tabel 6.3`, { s: 'D/t', v: tube.dt, u: '', d: 1 }, { s: '90 · 235 / f_y', v: limitDt, u: '', d: 1 }, []);
  rows.push(dtRow.status === 'ok' ? { ...dtRow, status: 'info' } : { ...dtRow, status: 'outside', note: { key: 'compositeDt', nl: 'D/t boven de grens: lokale plooi mag niet worden verwaarloosd; valt buiten de vereenvoudigde methode.' } });
  const deltaOk = delta >= .2 && delta <= .9;
  rows.push({ id: 'compDelta', label: 'Staalbijdrage δ', article: `${EN4} art. 6.7.1 (4)`, demand: { s: 'δ', v: delta, u: '', d: 3 }, resistance: { s: '0,2 – 0,9', v: NaN, u: '' }, uc: null, status: deltaOk ? 'info' : 'outside',
    steps: [{ s: 'A_a', v: tube.area, u: 'mm²', d: 0 }, { s: 'A_c', v: ac, u: 'mm²', d: 0 }, { s: 'A_s', v: as, u: 'mm²', d: 0 }, { s: 'N_pl,Rd', f: 'A_a f_yd + A_c f_cd + A_s f_sd', v: nplRd, u: 'kN' }, { s: 'δ', f: 'A_a f_yd / N_pl,Rd', v: delta, u: '', d: 3 }],
    ...(deltaOk ? {} : { note: { key: 'compositeDelta', nl: 'δ buiten 0,2 tot 0,9: bij δ < 0,2 als gewapend beton toetsen, bij δ > 0,9 als staal.' } }) });
  const alphaM = fy <= 355 ? .9 : .8;

  rows.push(check('axial', 'Normaalkracht', `${EN4} art. 6.7.3.2 (1)`, { s: 'N_Ed', v: d.nEdKn, u: 'kN' }, tension ? { s: 'N_t,Rd', v: ntRd, u: 'kN' } : { s: 'N_pl,Rd', v: nplRd, u: 'kN' },
    [tension ? { s: 'N_t,Rd', f: 'A_a f_yd + A_s f_sd', v: ntRd, u: 'kN' } : { s: 'N_pl,Rd', f: 'A_a f_yd + A_c f_cd + A_s f_sd', v: nplRd, u: 'kN' }]));
  rows.push(check('compShear', 'Dwarskracht (op de buis)', `${EN4} art. 6.7.3.2 (3); ${EN3} art. 6.2.6`, { s: 'V_Ed', v: d.vMaxKn, u: 'kN' }, { s: 'V_pl,a,Rd', v: tube.vplRdKn, u: 'kN' }, [
    { s: 'A_v', f: '2 A_a / π', v: tube.av, u: 'mm²', d: 0 }, { s: 'V_pl,a,Rd', f: 'A_v f_yd / √3', v: tube.vplRdKn, u: 'kN' }], { zM: d.zV }));

  const cache = new Map<number, number>();
  const mPl = (rho: number) => { if (!cache.has(rho)) cache.set(rho, compositePlastic(section(1 - rho), d.nEdKn * 1000)?.mRdKnM ?? 0); return cache.get(rho)!; };
  let best = { uc: -1, zM: 0, rho: 0, m: 0, v: 0, mpl: 0 };
  for (const q of d.samples) {
    const rho = shearRho(q.v, tube.vplRdKn), mpl = mPl(rho), uc = ucOf(q.m, alphaM * mpl);
    if (uc > best.uc) best = { uc, zM: q.zM, rho, m: q.m, v: q.v, mpl };
  }
  rows.push(check('compBending', 'Buiging met normaalkracht en dwarskracht, plastisch', `${EN4} art. 6.7.3.2, 6.7.3.6 (1)`, { s: 'M_Ed', v: best.m, u: 'kNm' }, { s: 'α_M M_pl,N,Rd', v: alphaM * best.mpl, u: 'kNm' }, [
    { s: 'N_Ed', v: d.nEdKn, u: 'kN' }, { s: 'V_Ed', v: best.v, u: 'kN' }, { s: 'ρ', f: '(2 V_Ed / V_pl,a,Rd − 1)² (V_Ed > 0,5 V_pl,a,Rd)', v: best.rho, u: '', d: 3 },
    { s: 'M_pl,N,Rd', v: best.mpl, u: 'kNm' }, { s: 'α_M', v: alphaM, u: '', d: 1 }], { zM: best.zM }));
  notes.push({ key: 'compositeMethod', nl: 'Staal-betondoorsnede volgens de vereenvoudigde methode: volledig plastische spanningsblokken, betontrek niet meegerekend, geen verhoging door omsnoering. Samengestelde werking is volgens de invoer aangetoond.' });
  return { standard: 'NEN-EN 1994-1-1 art. 6.7.3 met Nederlandse bijlage', rows, notes, notChecked };
}
