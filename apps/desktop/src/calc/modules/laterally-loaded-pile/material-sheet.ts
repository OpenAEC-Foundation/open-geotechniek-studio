// Materiaaltoetsing damwandprofiel, NEN-EN 1993-5 art. 5.2 met NEN-EN 1993-1-1.
// De formules en de keuzes staan in sheet-section.ts. De doorsnedeklasse komt uit
// de catalogus van de fabrikant (bibliotheek); ontbreekt die of het plastisch
// weerstandsmoment, dan is elastisch gerekend en staat dat erbij.
import { check, noCheck, ucOf, type CheckRow, type Demand, type Note, type PartialResult } from './material-types';
import type { PileSection } from './section';
import { sheetMoment, sheetProps } from './sheet-section';

const EN5 = 'NEN-EN 1993-5';

export function sheetChecks(s: PileSection, d: Demand): PartialResult {
  const p = sheetProps(s.sheet, s.steelEMpa), pr = p.profile, rows: CheckRow[] = [];
  const notes: Note[] = [{ key: 'sheetModel', nl: 'Het profiel is een ligger op grondveren over een rekenbreedte van {{b}} m; H, M en N gelden over die breedte. Dit is geen damwandberekening: geen actieve en passieve gronddruk aan weerszijden, geen verankering en geen fasering.', vars: { b: p.widthM } }];
  if (s.sheet?.widthMode === 'single') notes.push({ key: 'sheetSingle', nl: 'Losse plank: de bibliotheek geeft I, W en A per m doorgaande wand. Een losse U-plank heeft een eigen neutrale lijn en daardoor een kleinere I en W; reken die in met β_B en β_D of met de waarden van de fabrikant.' });
  const notChecked: Note = { key: 'notSheet', nl: 'Niet getoetst: plooi van het lijf door dwarskracht (de lijfhoek staat niet in de bibliotheek), knik (art. 5.2.3), doorsnedeklasse 4, de sloten, verankering en gordingen, plaatselijke krachtsinleiding, vermoeiing en corrosie. De gronddruk aan weerszijden van een wand hoort bij een damwandberekening.' };
  const base = [{ s: 'b', v: p.widthM, u: 'm', d: 3 }, { s: 'f_y', v: p.fyMpa, u: 'MPa', d: 0 }];

  if (p.cls === 4) {
    rows.push(noCheck('sheetClass', 'Doorsnedeklasse', `${EN5} art. 5.2.1`, 'outside', { key: 'sheetClass4', nl: 'Doorsnedeklasse 4 bij {{grade}} volgens de catalogus: lokale plooi is maatgevend. Dat valt buiten deze toetsing (NEN-EN 1993-5 bijlage A); de weerstanden zijn niet berekend.', vars: { grade: p.grade } }));
    for (const [id, label, art] of [['bending', 'Buiging', '5.2.2 (2)'], ['shear', 'Dwarskracht', '5.2.2 (4)'], ['axial', 'Normaalkracht', '5.2.3 (1)'], ['interaction', 'Buiging, normaalkracht en dwarskracht', '5.2.2 (9), 5.2.3']])
      rows.push(noCheck(id, label, `${EN5} art. ${art}`, 'outside', { key: 'class4Short', nl: 'Valt buiten deze toetsing (doorsnedeklasse 4).' }));
    return { standard: 'NEN-EN 1993-5 met NEN-EN 1993-1-1', rows, notes, notChecked };
  }
  rows.push({ id: 'sheetClass', label: 'Doorsnedeklasse', article: `${EN5} art. 5.2.1`, uc: null, status: 'info', steps: [],
    note: p.cls === null
      ? { key: 'sheetNoClass', nl: 'De bibliotheek geeft voor dit profiel geen doorsnedeklasse bij {{grade}}: elastisch gerekend. Ga zelf na dat de doorsnede geen klasse 4 is.', vars: { grade: p.grade } }
      : { key: 'sheetClassIs', nl: 'Klasse {{cls}} bij {{grade}} volgens de catalogus van de fabrikant.', vars: { cls: p.cls, grade: p.grade } } });

  const w = p.plastic ? 'W_pl' : 'W_el';
  rows.push(check('bending', 'Buiging', `${EN5} art. 5.2.2 (2)`, { s: 'M_Ed', v: d.mMaxKnM, u: 'kNm' }, { s: 'M_c,Rd', v: p.mcRdKnM, u: 'kNm' }, [
    ...base, { s: w, v: p.wCm3PerM, u: 'cm³/m', d: 0 }, { s: 'β_B', v: p.betaB, u: '', d: 2 }, { s: 'M_c,Rd', f: `β_B ${w} f_y b / γ_M0`, v: p.mcRdKnM, u: 'kNm' }],
  { zM: d.zM, ...(p.elasticReason === 'noWpl' ? { note: { key: 'sheetNoWpl', nl: 'De bibliotheek geeft geen plastisch weerstandsmoment: elastisch gerekend.' } } : {}) }));

  if (p.vplRdKn === null || p.avMm2 === null) rows.push(noCheck('shear', 'Dwarskracht', `${EN5} art. 5.2.2 (4)`, 'na', { key: 'sheetNoWeb', nl: 'Niet mogelijk: de lijfdikte, hoogte of flensdikte van dit profiel staat niet in de bibliotheek.' }));
  else rows.push(check('shear', 'Dwarskracht', `${EN5} art. 5.2.2 (4), (5)`, { s: 'V_Ed', v: d.vMaxKn, u: 'kN' }, { s: 'V_pl,Rd', v: p.vplRdKn, u: 'kN' }, [
    { s: 't_w', v: pr.webMm!, u: 'mm', d: 1 }, { s: 'h', v: pr.wallHeightMm!, u: 'mm', d: 0 }, { s: 't_f', v: pr.flangeMm!, u: 'mm', d: 1 },
    { s: 'A_V', f: pr.shape === 'U' ? 't_w (h − 2 t_f) / b_p · b' : pr.shape === 'hat' ? '2 t_w (h − t_f) / b_p · b' : 't_w (h − t_f) / b_p · b', v: p.avMm2, u: 'mm²', d: 0 },
    { s: 'V_pl,Rd', f: 'A_V f_y / (√3 γ_M0)', v: p.vplRdKn, u: 'kN' }], { zM: d.zV }));

  rows.push(check('axial', 'Normaalkracht', `${EN5} art. 5.2.3 (1)`, { s: 'N_Ed', v: d.nEdKn, u: 'kN' }, { s: 'N_pl,Rd', v: p.nplRdKn, u: 'kN' }, [
    { s: 'A', v: p.areaMm2, u: 'mm²', d: 0 }, { s: 'N_pl,Rd', f: 'A f_y / γ_M0', v: p.nplRdKn, u: 'kN' }]));

  let best = { uc: -1, zM: 0, m: 0, v: 0, r: sheetMoment(p, d.nEdKn, 0) };
  for (const q of d.samples) { const r = sheetMoment(p, d.nEdKn, q.v), uc = ucOf(q.m, r.mRdKnM); if (uc > best.uc) best = { uc, zM: q.zM, m: q.m, v: q.v, r }; }
  rows.push(check('interaction', 'Buiging, normaalkracht en dwarskracht', `${EN5} art. 5.2.2 (9), 5.2.3 (10)`, { s: 'M_Ed', v: best.m, u: 'kNm' }, { s: 'M_N,V,Rd', v: best.r.mRdKnM, u: 'kNm' }, [
    { s: 'n', f: 'N_Ed / N_pl,Rd', v: best.r.n, u: '', d: 3 }, { s: 'n_lim', v: best.r.limit, u: '', d: 2 },
    { s: 'M_N,Rd', f: best.r.n <= best.r.limit ? 'M_c,Rd' : `min(M_c,Rd; ${String(best.r.factor).replace('.', ',')} M_c,Rd (1 − n))`, v: best.r.rho < 1 ? best.r.mRdKnM / (1 - best.r.rho) : 0, u: 'kNm' },
    { s: 'V_Ed', v: best.v, u: 'kN' }, { s: 'ρ', f: '(2 V_Ed / V_pl,Rd − 1)² (V_Ed > 0,5 V_pl,Rd)', v: best.r.rho, u: '', d: 3 },
    { s: 'M_N,V,Rd', f: '(1 − ρ) M_N,Rd', v: best.r.mRdKnM, u: 'kNm' }], { zM: best.zM }));
  if (p.betaB < 1 || p.betaD < 1) notes.push({ key: 'sheetBeta', nl: 'Gereduceerd voor schuifkrachtoverdracht in de sloten: β_B = {{bb}} op het weerstandsmoment, β_D = {{bd}} op de buigstijfheid.', vars: { bb: p.betaB, bd: p.betaD } });
  return { standard: 'NEN-EN 1993-5 met NEN-EN 1993-1-1', rows, notes, notChecked };
}
