// Materiaaltoetsing gewapend beton, NEN-EN 1992-1-1 met de Nederlandse bijlage.
// Eenheden hier: N, mm en MPa; de uitkomsten in kN en kNm.
//
// Dwarskracht zonder dwarskrachtwapening, art. 6.2.2 (1), formule (6.2):
//   V_Rd,c = [C_Rd,c · k · (100 ρ_l f_ck)^(1/3) + k_1 σ_cp] · b_w · d
//          ≥ (v_min + k_1 σ_cp) · b_w · d
//   C_Rd,c = 0,18 / γ_c; k = 1 + √(200 / d) ≤ 2,0; ρ_l = A_sl / (b_w d) ≤ 0,02;
//   k_1 = 0,15; σ_cp = N_Ed / A_c ≤ 0,2 f_cd; v_min = 0,035 k^(3/2) f_ck^(1/2)
// Dwarskracht met beugels, art. 6.2.3 (3), formules (6.8) en (6.9), verticale beugels:
//   V_Rd,s = (A_sw / s) · z · f_ywd · cot θ
//   V_Rd,max = α_cw · b_w · z · ν_1 · f_cd / (cot θ + tan θ)
//   z = 0,9 d; ν_1 = 0,6 (1 − f_ck / 250); 1 ≤ cot θ ≤ 2,5
//   α_cw = 1; de verhoging bij druk is niet benut, de verlaging 2,5 (1 − σ_cp / f_cd) wel.
// Minimale dwarskrachtwapening, art. 9.2.2 (5) en (6):
//   ρ_w = A_sw / (s · b_w) ≥ 0,08 √f_ck / f_yk; s ≤ 0,75 d
// Langswapening van kolommen, art. 9.5.2 (2) en (3):
//   A_s,min = max(0,10 N_Ed / f_yd; 0,002 A_c); A_s,max = 0,04 A_c
// In de grond gevormde palen, art. 9.8.5 (3) tabel 9.6N en (4):
//   A_c ≤ 0,5 m²: A_s ≥ 0,005 A_c; 0,5 < A_c ≤ 1,0 m²: A_s ≥ 2500 mm²; A_c > 1,0 m²: A_s ≥ 0,0025 A_c;
//   ten minste 6 staven van ten minste Ø16.
//
// Ronde doorsnede: de norm geeft daarvoor geen b_w en d. Gebruikt is de
// gangbare vervanging (Clarke & Birjandi 1993; Feltham 2004): de trekwapening
// is de helft van de staven, d = r + 2 r_s / π (zwaartepunt van die helft op de
// staafcirkel met straal r_s), en b_w · d is het betonoppervlak boven die
// hoogte: A_v = r² (π/2 + α + sin α cos α) met sin α = 2 r_s / (π r).
// Ronde beugels of een spiraal: de twee sneden staan niet evenwijdig aan de
// dwarskracht; gemiddeld over de breedte werkt π/4 van de staafkracht mee
// (Priestley, Seible & Calvi 1996), dus A_sw = 2 · (π/4) · A_beugel.
import { GAMMA_C, GAMMA_S } from './materials';
import { check, noCheck, type CheckRow, type Demand, type ExistingCheck, type MaterialInput, type Note, type PartialResult, type Step } from './material-types';
import type { PileSection } from './section';

const EN2 = 'NEN-EN 1992-1-1';

/** Rekenhoogte, lijfbreedte en trekwapening voor de dwarskrachttoets. */
export function shearGeometry(s: PileSection, coreMm: number) {
  const aBar = Math.PI * s.barDiameterMm ** 2 / 4, n = s.barCount, c = s.coverToBarCentreMm;
  if (s.kind === 'concrete-square') return { square: true as const, d: coreMm - c, bw: coreMm, asl: (n / 4 + 1) * aBar, ac: coreMm ** 2 };
  const r = coreMm / 2, rs = r - c, d = r + 2 * rs / Math.PI, sinA = 2 * rs / (Math.PI * r), alpha = Math.asin(sinA);
  const av = r * r * (Math.PI / 2 + alpha + sinA * Math.cos(alpha));
  return { square: false as const, d, bw: av / d, asl: n * aBar / 2, ac: Math.PI * r * r, r, rs, alphaDeg: alpha * 180 / Math.PI, av };
}

/** V_Rd,c volgens art. 6.2.2 (1) [kN], met de tussenwaarden. */
export function shearResistanceConcrete(g: { d: number; bw: number; asl: number; ac: number }, fck: number, fcd: number, nEdN: number) {
  const k = Math.min(2, 1 + Math.sqrt(200 / g.d)), rho = Math.min(.02, g.asl / (g.bw * g.d));
  const sigma = Math.min(nEdN / g.ac, .2 * fcd), cRdc = .18 / GAMMA_C;
  const vMin = .035 * k ** 1.5 * Math.sqrt(fck), vC = cRdc * k * (100 * rho * fck) ** (1 / 3);
  return { k, rho, sigma, cRdc, vMin, vC, vRdcKn: Math.max(0, (Math.max(vC, vMin) + .15 * sigma) * g.bw * g.d) / 1000 };
}

/** V_Rd,s en V_Rd,max volgens art. 6.2.3 (3) [kN]. aswMm2 is de werkzame doorsnede van één beugel. */
export function shearResistanceStirrups(g: { d: number; bw: number }, aswMm2: number, spacingMm: number, fywd: number, fck: number, fcd: number, sigma: number, cot: number) {
  const z = .9 * g.d, nu1 = .6 * (1 - fck / 250), alphaCw = sigma > 0 ? Math.max(0, Math.min(1, 2.5 * (1 - sigma / fcd))) : 1;
  return { z, nu1, alphaCw, vRdsKn: aswMm2 / spacingMm * z * fywd * cot / 1000, vRdMaxKn: alphaCw * g.bw * z * nu1 * fcd / (cot + 1 / cot) / 1000 };
}

/** Minimum- en maximumwapening [mm²]. */
export function reinforcementLimits(acMm2: number, nEdN: number, fyd: number) {
  const asMin = Math.max(.10 * Math.max(0, nEdN) / fyd, .002 * acMm2), asMax = .04 * acMm2;
  const asBored = acMm2 <= .5e6 ? .005 * acMm2 : acMm2 <= 1e6 ? 2500 : .0025 * acMm2;
  return { asMin, asMax, asBored };
}

export function concreteChecks(s: PileSection, m: MaterialInput | undefined, d: Demand, existing: ExistingCheck): PartialResult {
  const rows: CheckRow[] = [], notes: Note[] = [];
  const coreOnly = s.kind === 'filled-tube', core = coreOnly ? s.diameterMm - 2 * s.wallMm : s.diameterMm;
  const fck = s.fckMpa, fcd = s.fcdMpa, fyd = s.fydMpa, nEdN = d.nEdKn * 1000;
  const aBar = Math.PI * s.barDiameterMm ** 2 / 4, as = s.barCount * aBar;
  if (coreOnly) notes.push({ key: 'tubeIgnored', nl: 'De buis werkt volgens de invoer niet mee: getoetst is de betonkern met zijn wapening, zonder de buis.' });

  // Buiging met normaalkracht: de bestaande toets met het rekdiagram.
  rows.push(existing.uc !== null && existing.mRdKnM !== null
    ? { id: 'bendingN', label: 'Buiging met normaalkracht', article: `${EN2} art. 6.1`, demand: { s: 'M_Ed', v: d.mMaxKnM, u: 'kNm' }, resistance: { s: 'M_Rd', v: existing.mRdKnM, u: 'kNm' },
      uc: existing.uc, status: existing.uc <= 1 ? 'ok' : 'fail', zM: d.zM,
      steps: [{ s: 'N_Ed', v: d.nEdKn, u: 'kN' }, { s: 'f_cd', v: fcd, u: 'MPa' }, { s: 'f_yd', v: fyd, u: 'MPa' }, { s: 'A_s', v: as, u: 'mm²', d: 0 }],
      note: { key: 'strainMethod', nl: 'M_Rd bij N_Ed uit het rekdiagram: parabool-rechthoek, betonstuik 3,5 ‰, betontrek niet meegerekend.' } }
    : noCheck('bendingN', 'Buiging met normaalkracht', `${EN2} art. 6.1`, 'na', { key: 'reason', nl: '{{reason}}', vars: { reason: existing.error ?? '' } }));

  // Dwarskracht.
  if (s.barCount < 1) rows.push(noCheck('shearC', 'Dwarskracht zonder dwarskrachtwapening', `${EN2} art. 6.2.2`, 'na',
    { key: 'noBars', nl: 'Geen langswapening: art. 6.2.2 geldt voor gewapend beton. Ongewapend beton (hoofdstuk 12) is niet opgenomen.' }));
  else {
    const g = shearGeometry(s, core), c = shearResistanceConcrete(g, fck, fcd, nEdN);
    const geo: Step[] = g.square
      ? [{ s: 'd', f: 'h − c', v: g.d, u: 'mm', d: 0 }, { s: 'b_w', v: g.bw, u: 'mm', d: 0 }, { s: 'A_sl', f: '(n / 4 + 1) · A_Ø', v: g.asl, u: 'mm²', d: 0 }]
      : [{ s: 'r_s', v: g.rs, u: 'mm', d: 0 }, { s: 'd', f: 'r + 2 r_s / π', v: g.d, u: 'mm', d: 0 }, { s: 'α', f: 'asin(2 r_s / (π r))', v: g.alphaDeg, u: '°', d: 1 },
        { s: 'A_v', f: 'r² (π/2 + α + sin α cos α)', v: g.av, u: 'mm²', d: 0 }, { s: 'b_w', f: 'A_v / d', v: g.bw, u: 'mm', d: 0 }, { s: 'A_sl', f: 'A_s / 2', v: g.asl, u: 'mm²', d: 0 }];
    const hasStirrups = (m?.stirrupDiameterMm ?? 0) > 0 && (m?.stirrupSpacingMm ?? 0) > 0, cot = m?.cotTheta ?? 2.5, cotOk = cot >= 1 && cot <= 2.5;
    const needed = d.vMaxKn > c.vRdcKn;
    rows.push(check('shearC', 'Dwarskracht zonder dwarskrachtwapening', `${EN2} art. 6.2.2 (1)`, { s: 'V_Ed', v: d.vMaxKn, u: 'kN' }, { s: 'V_Rd,c', v: c.vRdcKn, u: 'kN' }, [
      ...geo,
      { s: 'ρ_l', f: 'A_sl / (b_w d) ≤ 0,02', v: c.rho * 100, u: '%', d: 3 }, { s: 'k', f: '1 + √(200 / d) ≤ 2,0', v: c.k, u: '', d: 3 },
      { s: 'σ_cp', f: 'N_Ed / A_c ≤ 0,2 f_cd', v: c.sigma, u: 'MPa', d: 2 }, { s: 'v_min', f: '0,035 k^{3/2} √f_ck', v: c.vMin, u: 'MPa', d: 3 },
      { s: 'v_Rd,c', f: 'C_Rd,c k (100 ρ_l f_ck)^{1/3}, C_Rd,c = 0,18 / γ_c', v: c.vC, u: 'MPa', d: 3 },
      { s: 'V_Rd,c', f: '(max(v_Rd,c; v_min) + 0,15 σ_cp) b_w d', v: c.vRdcKn, u: 'kN' },
    ], { zM: d.zV, ...(hasStirrups && needed && cotOk ? { status: 'info' as const } : {}), ...(g.square ? {} : { note: { key: 'roundShear', nl: 'Ronde doorsnede: b_w en d volgens de gangbare vervanging (Clarke & Birjandi 1993; Feltham 2004); de norm geeft die niet.' } }) }));

    if (hasStirrups) {
      const phi = m!.stirrupDiameterMm!, sp = m!.stirrupSpacingMm!, legs = g.square ? Math.max(1, Math.round(m!.stirrupLegs ?? 2)) : 2;
      const aLeg = Math.PI * phi * phi / 4, aswFull = legs * aLeg, asw = g.square ? aswFull : aswFull * Math.PI / 4;
      const art = `${EN2} art. 6.2.3 (3)`;
      if (!cotOk) rows.push(noCheck('shearS', 'Dwarskracht met beugels', art, 'na', { key: 'cotRange', nl: 'cot θ moet tussen 1,0 en 2,5 liggen (art. 6.2.3 (2)).' }));
      else {
        const r = shearResistanceStirrups(g, asw, sp, fyd, fck, fcd, c.sigma, cot), counts = needed ? {} : { status: 'info' as const };
        rows.push(check('shearS', 'Dwarskracht met beugels', art, { s: 'V_Ed', v: d.vMaxKn, u: 'kN' }, { s: 'V_Rd,s', v: r.vRdsKn, u: 'kN' }, [
          { s: 'A_sw', f: g.square ? `${legs} · A_Ø${phi}` : `2 · (π/4) · A_Ø${phi}`, v: asw, u: 'mm²', d: 0 }, { s: 's', v: sp, u: 'mm', d: 0 },
          { s: 'z', f: '0,9 d', v: r.z, u: 'mm', d: 0 }, { s: 'f_ywd', v: fyd, u: 'MPa', d: 0 }, { s: 'cot θ', v: cot, u: '', d: 2 },
          { s: 'V_Rd,s', f: '(A_sw / s) z f_ywd cot θ', v: r.vRdsKn, u: 'kN' },
        ], { zM: d.zV, ...counts, ...(g.square ? {} : { note: { key: 'hoopFactor', nl: 'Ronde beugels of spiraal: π/4 van de staafkracht werkt in de dwarskrachtrichting (Priestley, Seible & Calvi 1996); de norm geeft die factor niet.' } }) }));
        rows.push(check('shearMax', 'Drukdiagonaal', art, { s: 'V_Ed', v: d.vMaxKn, u: 'kN' }, { s: 'V_Rd,max', v: r.vRdMaxKn, u: 'kN' }, [
          { s: 'ν_1', f: '0,6 (1 − f_ck / 250)', v: r.nu1, u: '', d: 3 }, { s: 'α_cw', v: r.alphaCw, u: '', d: 2 },
          { s: 'V_Rd,max', f: 'α_cw b_w z ν_1 f_cd / (cot θ + tan θ)', v: r.vRdMaxKn, u: 'kN' },
        ], { zM: d.zV, ...counts }));
        const fyk = fyd * GAMMA_S, rhoW = aswFull / (sp * g.bw), rhoMin = .08 * Math.sqrt(fck) / fyk;
        rows.push(check('shearRatio', 'Minimale dwarskrachtwapening', `${EN2} art. 9.2.2 (5)`, { s: 'ρ_w,min', v: rhoMin * 100, u: '%', d: 3 }, { s: 'ρ_w', v: rhoW * 100, u: '%', d: 3 }, [
          { s: 'ρ_w', f: 'A_sw / (s b_w)', v: rhoW * 100, u: '%', d: 3 }, { s: 'ρ_w,min', f: '0,08 √f_ck / f_yk', v: rhoMin * 100, u: '%', d: 3 }], { ...counts, detail: true }));
        rows.push(check('shearSpacing', 'Grootste beugelafstand', `${EN2} art. 9.2.2 (6)`, { s: 's', v: sp, u: 'mm', d: 0 }, { s: 's_l,max', v: .75 * g.d, u: 'mm', d: 0 }, [
          { s: 's_l,max', f: '0,75 d', v: .75 * g.d, u: 'mm', d: 0 }], { ...counts, detail: true }));
        if (!needed) notes.push({ key: 'stirrupsNotNeeded', nl: 'V_Ed ≤ V_Rd,c: rekenkundig is geen dwarskrachtwapening nodig; de regels voor de beugels staan er ter informatie.' });
      }
    }
  }

  // Minimum- en maximumwapening.
  const ac = s.kind === 'concrete-square' ? core ** 2 : Math.PI * core ** 2 / 4, lim = reinforcementLimits(ac, nEdN, fyd);
  rows.push(check('asMin', 'Minimale langswapening', `${EN2} art. 9.5.2 (2)`, { s: 'A_s,min', v: lim.asMin, u: 'mm²', d: 0 }, { s: 'A_s', v: as, u: 'mm²', d: 0 }, [
    { s: 'A_c', v: ac, u: 'mm²', d: 0 }, { s: 'A_s,min', f: 'max(0,10 N_Ed / f_yd; 0,002 A_c)', v: lim.asMin, u: 'mm²', d: 0 }, { s: 'ρ', f: 'A_s / A_c', v: 100 * as / ac, u: '%', d: 2 }], { detail: true }));
  rows.push(check('asMax', 'Maximale langswapening', `${EN2} art. 9.5.2 (3)`, { s: 'A_s', v: as, u: 'mm²', d: 0 }, { s: 'A_s,max', v: lim.asMax, u: 'mm²', d: 0 }, [
    { s: 'A_s,max', f: '0,04 A_c', v: lim.asMax, u: 'mm²', d: 0 }], { detail: true }));
  if (m?.boredPile && s.kind !== 'concrete-square') {
    const detail = s.barCount >= 6 && s.barDiameterMm >= 16;
    const row = check('asBored', 'Minimale langswapening boorpaal', `${EN2} art. 9.8.5 (3)`, { s: 'A_s,bpmin', v: lim.asBored, u: 'mm²', d: 0 }, { s: 'A_s', v: as, u: 'mm²', d: 0 }, [
      { s: 'A_s,bpmin', f: ac <= .5e6 ? '0,005 A_c' : ac <= 1e6 ? '2500 mm²' : '0,0025 A_c', v: lim.asBored, u: 'mm²', d: 0 }, { s: 'n', v: s.barCount, u: '', d: 0 }, { s: 'Ø', v: s.barDiameterMm, u: 'mm', d: 0 }],
    { detail: true, note: { key: 'boredDetail', nl: 'Art. 9.8.5 (4): ten minste 6 staven van ten minste Ø16; de vrije staafafstand van hoogstens 200 mm is niet getoetst.' } });
    rows.push(detail ? row : { ...row, status: 'fail' });
  }

  rows.push(noCheck('crack', 'Scheurwijdte', `${EN2} art. 7.3`, 'na',
    { key: 'crackNA', nl: 'Niet mogelijk: de module kent één belastingsgeval, dat als rekenwaarde wordt getoetst. Voor de scheurwijdte is een quasi-blijvende of frequente combinatie nodig; die zit niet in de invoer.' }));

  return {
    standard: 'NEN-EN 1992-1-1 met Nederlandse bijlage', rows, notes,
    notChecked: { key: 'notConcrete', nl: 'Niet getoetst: scheurwijdte, verankering en overlappingslassen, detaillering van beugels in kolommen (art. 9.5.3), betondekking en duurzaamheid, knik en tweede-orde-effecten (P–Δ), een gescheurde buigstijfheid, vermoeiing, en bij prefab palen transport, hijsen en heien.' },
  };
}
