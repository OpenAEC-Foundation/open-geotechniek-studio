// Materiaaltoetsing: elke toets met een met de hand narekenbaar geval. Bij elk
// geval staat de formule en het artikel; de getallen in het commentaar zijn de
// handberekening. De formules komen uit kennis van de normen en zijn niet tegen
// de normtekst gelegd (zie VERIFICATIE.md).
import { describe, expect, it } from 'vitest';
import { findSheetPile } from '../../library/sheetPiles';
import { computeLateral, lateralExample, type LateralInput } from './compute';
import { reinforcementLimits, shearGeometry, shearResistanceConcrete, shearResistanceStirrups } from './material-concrete';
import { compositePlastic, tubeProps } from './material-steel';
import { shearRho } from './material-types';
import { concreteClassOf, designConcrete, designRebar, rebarGradeOf, steelGradeOf } from './materials';
import { sectionCapacity, sectionStiffness, type PileSection } from './section';
import { defaultSheet, sheetMoment, sheetProps } from './sheet-section';

const base = lateralExample.section;
const run = (patch: Partial<LateralInput>, section: Partial<PileSection> = {}) => {
  const r = computeLateral({ ...lateralExample, ...patch, section: { ...base, ...section } });
  if (!r.ok) throw new Error(r.error);
  return r;
};
const row = (r: ReturnType<typeof run>, id: string) => { const x = r.material?.rows.find((q) => q.id === id); if (!x) throw new Error(`geen rij ${id}`); return x; };

describe('bestaande uitkomsten veranderen niet', () => {
  // Vastgelegd vóór de materiaaltoetsing werd toegevoegd: y max [mm], M max [kNm], V max [kN], u.c. N–M, MRd [kNm], EI [kNm²].
  const before: Record<string, number[]> = {
    'concrete-square|0': [29.197451681539672, 100.55705588367957, 59.99999999959253, 0.5806925094990388, 173.16747545173217, 71220.63655501079],
    'concrete-square|400': [29.197451681539672, 100.55705588367957, 59.99999999959253, 0.4447375142616709, 226.1042809726068, 71220.63655501079],
    'concrete-round|0': [35.19887542630926, 82.6565380581371, 59.99999999317686, 0.5751905518349711, 143.70287862769385, 42516.43001809211],
    'concrete-round|400': [35.19887542630926, 82.6565380581371, 59.99999999317686, 0.49078751264012005, 168.41613922387364, 42516.43001809211],
    'filled-tube|0': [36.932410634450214, 78.13910479484043, 59.99999998637727, 0.5742124110146394, 136.08048745718995, 37071.08236244564],
    'filled-tube|400': [36.932410634450214, 78.13910479484043, 59.99999998637727, 0.49412730116023473, 158.13557480302353, 37071.08236244564],
    'filled-tube-p|0': [26.929196217971427, 108.33421893424239, 59.99999999990461, 0.15552988767898576, 696.5492006130976, 88314.91394919655],
    'filled-tube-p|400': [26.929196217971427, 108.33421893424239, 59.99999999990461, 0.15321630536477415, 707.0671667504485, 88314.91394919655],
    'steel-tube|0': [32.933514798711016, 88.98443064520481, 59.999999997453195, 0.15980964833427935, 556.8151333333329, 51243.831586750915],
    'steel-tube|400': [32.933514798711016, 88.98443064520481, 59.999999997453195, 0.1614403313339422, 551.1908326125703, 51243.831586750915],
  };
  for (const [key, want] of Object.entries(before)) it(key, () => {
    const [k, n] = key.split('|'), kind = (k === 'filled-tube-p' ? 'filled-tube' : k) as PileSection['kind'];
    const r = run({ nEdKn: Number(n), headForceKn: 60 }, { kind, tubeParticipates: k === 'filled-tube-p', diameterMm: kind.includes('tube') ? 406 : 400 });
    const got = [r.maxDisplacementMm, r.maxMomentKnM, r.maxShearKn, r.sectionUtilization!, r.capacity!.mRdKnM, r.section.eiKnM2];
    got.forEach((v, i) => expect(v).toBeCloseTo(want[i], 9));
  });
  it('ook met beugels en boorpaal ingevuld blijven verplaatsing, snedekrachten en N–M gelijk', () => {
    const a = run({ headForceKn: 60 }), b = run({ headForceKn: 60, material: { stirrupDiameterMm: 8, stirrupSpacingMm: 200, boredPile: true } });
    expect(b.maxDisplacementMm).toBe(a.maxDisplacementMm); expect(b.maxMomentKnM).toBe(a.maxMomentKnM);
    expect(b.maxShearKn).toBe(a.maxShearKn); expect(b.sectionUtilization).toBe(a.sectionUtilization);
  });
});

describe('sterkteklassen en materiaalfactoren', () => {
  it('fcd = αcc·fck/γc en fyd = fyk/γs (EN 1992-1-1 art. 3.1.6, 2.4.2.4; NB: αcc = 1,0, γc = 1,5, γs = 1,15)', () => {
    expect(designConcrete(30)).toBe(20);          // 1,0 · 30 / 1,5
    expect(designConcrete(25)).toBe(16.67);       // 25 / 1,5 = 16,67
    expect(designRebar(500)).toBe(435);           // 500 / 1,15 = 434,8 → 435
  });
  it('de standaardinvoer is C30/37, B500 en S355: de keuzelijsten veranderen geen bestaande waarde', () => {
    expect(concreteClassOf(base.fckMpa, base.fcdMpa)).toBe('C30/37');
    expect(rebarGradeOf(base.fydMpa)).toBe('B500');
    expect(steelGradeOf(base.tubeFydMpa)).toBe('S355');
    expect(concreteClassOf(30, 18)).toBe('');     // eigen waarde blijft een eigen waarde
  });
});

describe('gewapend beton, NEN-EN 1992-1-1', () => {
  const square: PileSection = { ...base, kind: 'concrete-square', diameterMm: 400, barCount: 8, barDiameterMm: 20, coverToBarCentreMm: 50 };
  it('V_Rd,c vierkant 400, 8Ø20, C30 (art. 6.2.2 (1), formule 6.2)', () => {
    // d = 400 − 50 = 350 mm; A_sl = 3 staven Ø20 = 3 · 314,16 = 942,5 mm²
    // ρ_l = 942,5 / (400 · 350) = 0,00673; k = 1 + √(200/350) = 1,756
    // v = 0,12 · 1,756 · (100 · 0,00673 · 30)^(1/3) = 0,12 · 1,756 · 2,723 = 0,5738 MPa
    // v_min = 0,035 · 1,756^1,5 · √30 = 0,446 MPa (niet maatgevend)
    // V_Rd,c = 0,5738 · 400 · 350 = 80,3 kN
    const g = shearGeometry(square, 400), c = shearResistanceConcrete(g, 30, 20, 0);
    expect(g.d).toBe(350); expect(g.asl).toBeCloseTo(942.48, 1);
    expect(c.k).toBeCloseTo(1.756, 3); expect(c.rho).toBeCloseTo(0.006732, 5); expect(c.vMin).toBeCloseTo(0.446, 3);
    expect(c.vRdcKn).toBeCloseTo(80.34, 1);
    // Met N_Ed = 400 kN: σ_cp = 400000 / 160000 = 2,5 MPa (≤ 0,2 · 20 = 4); V_Rd,c = (0,5738 + 0,15 · 2,5) · 140000 = 132,8 kN
    expect(shearResistanceConcrete(g, 30, 20, 400e3).vRdcKn).toBeCloseTo(132.84, 1);
    // σ_cp is begrensd op 0,2 f_cd = 4 MPa: (0,5738 + 0,6) · 140000 = 164,3 kN
    expect(shearResistanceConcrete(g, 30, 20, 2000e3).vRdcKn).toBeCloseTo(164.34, 1);
  });
  it('v_min is maatgevend bij weinig wapening en k is begrensd op 2,0', () => {
    // d = 150: k = 1 + √(200/150) = 2,155 → 2,0; v_min = 0,035 · 2^1,5 · √30 = 0,542 MPa
    const c = shearResistanceConcrete({ d: 150, bw: 200, asl: 20, ac: 40000 }, 30, 20, 0);
    expect(c.k).toBe(2); expect(c.vMin).toBeCloseTo(0.5422, 3);
    expect(c.vRdcKn).toBeCloseTo(0.5422 * 200 * 150 / 1000, 2);
  });
  it('V_Rd,s en V_Rd,max met beugels Ø8-200, twee sneden, cot θ = 2,5 (art. 6.2.3 (3), formules 6.8 en 6.9)', () => {
    // A_sw = 2 · 50,27 = 100,5 mm²; z = 0,9 · 350 = 315 mm
    // V_Rd,s = 100,5 / 200 · 315 · 435 · 2,5 = 172,2 kN
    // ν_1 = 0,6 · (1 − 30/250) = 0,528; V_Rd,max = 400 · 315 · 0,528 · 20 / (2,5 + 0,4) = 458,8 kN
    const r = shearResistanceStirrups({ d: 350, bw: 400 }, 2 * Math.PI * 16, 200, 435, 30, 20, 0, 2.5);
    expect(r.z).toBeCloseTo(315, 9); expect(r.nu1).toBeCloseTo(0.528, 9);
    expect(r.vRdsKn).toBeCloseTo(172.19, 1); expect(r.vRdMaxKn).toBeCloseTo(458.81, 1);
    // cot θ = 1: V_Rd,max = 400 · 315 · 0,528 · 20 / 2 = 665,3 kN
    expect(shearResistanceStirrups({ d: 350, bw: 400 }, 100, 200, 435, 30, 20, 0, 1).vRdMaxKn).toBeCloseTo(665.28, 1);
    // Hoge druk: σ_cp = 0,8 f_cd → α_cw = 2,5 · (1 − 0,8) = 0,5
    expect(shearResistanceStirrups({ d: 350, bw: 400 }, 100, 200, 435, 30, 20, 16, 1).alphaCw).toBeCloseTo(0.5, 9);
  });
  it('de beugels tellen pas mee als V_Ed boven V_Rd,c ligt; anders staan ze er ter informatie', () => {
    const material = { stirrupDiameterMm: 8, stirrupSpacingMm: 200 };
    const low = run({ headForceKn: 30, material }), high = run({ headForceKn: 100, material });
    expect(row(low, 'shearC').status).toBe('ok'); expect(row(low, 'shearS').status).toBe('info');
    expect(row(high, 'shearC').status).toBe('info'); expect(row(high, 'shearS').status).toBe('ok');
    expect(row(high, 'shearS').resistance!.v).toBeCloseTo(172.19, 1); expect(row(high, 'shearMax').resistance!.v).toBeCloseTo(458.81, 1);
    // ρ_w = 100,5 / (200 · 400) = 0,126 %; ρ_w,min = 0,08 · √30 / 500 = 0,088 %; s_l,max = 0,75 · 350 = 262,5 mm (art. 9.2.2 (5), (6))
    expect(row(high, 'shearRatio').resistance!.v).toBeCloseTo(0.1257, 3); expect(row(high, 'shearRatio').demand!.v).toBeCloseTo(0.0876, 3);
    expect(row(high, 'shearSpacing').resistance!.v).toBeCloseTo(262.5, 9);
    // Zonder beugels: V_Ed = 100 kN > V_Rd,c = 80,3 kN voldoet niet.
    const none = run({ headForceKn: 100 });
    expect(row(none, 'shearC').status).toBe('fail'); expect(row(none, 'shearC').uc).toBeCloseTo(100 / 80.34, 2); expect(none.material!.ok).toBe(false);
  });
  it('ronde doorsnede: d en A_v volgens de vervanging van Clarke & Birjandi / Feltham', () => {
    // Ø500, staafhart op 60 mm: r = 250, r_s = 190; d = 250 + 2 · 190 / π = 370,96 mm
    // sin α = 2 · 190 / (π · 250) = 0,4838; A_v = oppervlak van de cirkel boven de koorde op diepte d
    const g = shearGeometry({ ...base, kind: 'concrete-round', diameterMm: 500, coverToBarCentreMm: 60, barCount: 10 }, 500);
    if (g.square) throw new Error('rond verwacht');
    expect(g.d).toBeCloseTo(370.96, 2); expect(g.asl).toBeCloseTo(5 * Math.PI * 100, 6);
    // Onafhankelijk: het oppervlak numeriek uit de koordebreedten van de bovenrand tot diepte d.
    let area = 0; const steps = 20000, dy = g.d / steps;
    for (let k = 0; k < steps; k++) { const y = 250 - (k + .5) * dy; area += 2 * Math.sqrt(250 * 250 - y * y) * dy; }
    expect(g.av).toBeCloseTo(area, 0);
    expect(g.bw * g.d).toBeCloseTo(g.av, 6);
  });
  it('ronde beugels of spiraal werken voor π/4 mee', () => {
    const r = run({ headForceKn: 100, material: { stirrupDiameterMm: 10, stirrupSpacingMm: 150, cotTheta: 2 } }, { kind: 'concrete-round', diameterMm: 500, coverToBarCentreMm: 60 });
    const asw = row(r, 'shearS').steps.find((s) => s.s === 'A_sw')!.v as number;
    expect(asw).toBeCloseTo(2 * (Math.PI / 4) * Math.PI * 25, 6);   // 2 · π/4 · 78,54 = 123,4 mm²
    // V_Rd,s = 123,4 / 150 · 0,9 · 370,96 · 435 · 2 = 238,9 kN
    expect(row(r, 'shearS').resistance!.v).toBeCloseTo(123.37 / 150 * .9 * 370.96 * 435 * 2 / 1000, 0);
  });
  it('cot θ buiten 1 tot 2,5 geeft geen toets met beugels', () => {
    const r = run({ headForceKn: 100, material: { stirrupDiameterMm: 8, stirrupSpacingMm: 200, cotTheta: 3 } });
    expect(row(r, 'shearS').status).toBe('na'); expect(row(r, 'shearC').status).toBe('fail');
  });
  it('minimum- en maximumwapening (art. 9.5.2 (2), (3)) en boorpalen (art. 9.8.5 (3), tabel 9.6N)', () => {
    // A_c = 400² = 160000 mm²; N_Ed = 1000 kN: 0,10 · 1e6 / 435 = 230 mm² < 0,002 · 160000 = 320 mm²; A_s,max = 0,04 · 160000 = 6400 mm²
    const a = reinforcementLimits(160000, 1000e3, 435);
    expect(a.asMin).toBeCloseTo(320, 9); expect(a.asMax).toBeCloseTo(6400, 9);
    // N_Ed = 2000 kN: 0,10 · 2e6 / 435 = 459,8 mm² is maatgevend; trek telt niet
    expect(reinforcementLimits(160000, 2000e3, 435).asMin).toBeCloseTo(459.77, 2);
    expect(reinforcementLimits(160000, -2000e3, 435).asMin).toBeCloseTo(320, 9);
    // Boorpaal Ø500: A_c = 196350 mm² ≤ 0,5 m² → 0,005 A_c = 981,7 mm²; Ø1000: 785398 mm² → 2500 mm²; Ø1500: 1767146 mm² → 0,0025 A_c = 4417,9 mm²
    expect(reinforcementLimits(Math.PI * 500 ** 2 / 4, 0, 435).asBored).toBeCloseTo(981.75, 2);
    expect(reinforcementLimits(Math.PI * 1000 ** 2 / 4, 0, 435).asBored).toBe(2500);
    expect(reinforcementLimits(Math.PI * 1500 ** 2 / 4, 0, 435).asBored).toBeCloseTo(4417.86, 2);
  });
  it('de boorpaalregel staat er alleen als die is aangevinkt en vraagt 6 staven Ø16', () => {
    const round = { kind: 'concrete-round' as const, diameterMm: 500, coverToBarCentreMm: 60 };
    expect(run({}, round).material!.rows.some((x) => x.id === 'asBored')).toBe(false);
    // 8Ø20 = 2513 mm² ≥ 981,7 mm²: voldoet; 4Ø20 = 1257 mm² ≥ 981,7 maar minder dan 6 staven: voldoet niet
    expect(row(run({ material: { boredPile: true } }, round), 'asBored').status).toBe('ok');
    expect(row(run({ material: { boredPile: true } }, { ...round, barCount: 4 }), 'asBored').status).toBe('fail');
  });
  it('scheurwijdte: geen toets, met de reden; buiging met normaalkracht is de bestaande toets', () => {
    const r = run({ headForceKn: 60 });
    expect(row(r, 'crack').status).toBe('na'); expect(row(r, 'crack').note!.key).toBe('crackNA');
    expect(row(r, 'bendingN').uc).toBe(r.sectionUtilization); expect(row(r, 'bendingN').resistance!.v).toBe(r.capacity!.mRdKnM);
    // Maatgevend bij H = 60 kN: dwarskracht 60 / 80,34 = 0,75 boven buiging 0,58.
    expect(r.material!.governing!.id).toBe('shearC'); expect(r.material!.governing!.uc).toBeCloseTo(60 / 80.34, 2); expect(r.material!.ok).toBe(true);
  });
  it('een wapeningsgrens is alleen maatgevend als zij niet voldoet', () => {
    // H = 5 kN: de benutting van de sterktetoetsen is laag; A_s / A_s,max = 2513 / 6400 = 0,39 is hoger maar geen sterktetoets.
    const low = run({ headForceKn: 5, headMomentKnM: 0 });
    expect(row(low, 'asMax').uc).toBeCloseTo(2513.27 / 6400, 3); expect(low.material!.governing!.id).not.toBe('asMax');
    // 4Ø8 = 201 mm² < A_s,min = 320 mm²: voldoet niet en is dan maatgevend, u.c. = 320 / 201 = 1,59.
    const few = run({ headForceKn: 5, headMomentKnM: 0 }, { barCount: 4, barDiameterMm: 8 });
    expect(few.material!.governing).toMatchObject({ id: 'asMin' }); expect(few.material!.governing!.uc).toBeCloseTo(320 / 201.06, 2); expect(few.material!.ok).toBe(false);
  });
  it('gevulde buis waarvan de buis niet meewerkt: de betonkern als gewapend beton', () => {
    const r = run({}, { kind: 'filled-tube', diameterMm: 406, wallMm: 10, tubeParticipates: false });
    expect(r.material!.standard).toMatch(/1992/); expect(r.material!.notes.some((x) => x.key === 'tubeIgnored')).toBe(true);
    // Kern Ø386: A_c = π · 386² / 4 = 117021 mm²
    expect(row(r, 'asMin').steps.find((s) => s.s === 'A_c')!.v).toBeCloseTo(Math.PI * 386 ** 2 / 4, 6);
  });
});

describe('stalen buis, NEN-EN 1993-1-1', () => {
  it('doorsnedeklasse uit D/t (tabel 5.2): 50 ε², 70 ε², 90 ε² met ε² = 235/f_y', () => {
    // S355: ε² = 0,662 → grenzen 33,1 / 46,3 / 59,6
    expect(tubeProps(500, 16, 355).cls).toBe(1);      // D/t = 31,25
    expect(tubeProps(500, 12.5, 355).cls).toBe(2);    // 40
    expect(tubeProps(500, 10, 355).cls).toBe(3);      // 50
    expect(tubeProps(500, 5, 355).cls).toBe(4);       // 100
    expect(tubeProps(500, 10, 235).cls).toBe(1);      // S235: grens klasse 1 = 50
  });
  it('weerstanden buis Ø500×10, S355 (art. 6.2.4, 6.2.5, 6.2.6)', () => {
    // A = π (500² − 480²) / 4 = 15394 mm²; N_c,Rd = 15394 · 355 = 5464,8 kN
    // W_el = π (500⁴ − 480⁴) / (32 · 500) = 1848,8 cm³ → 656,3 kNm; W_pl = (500³ − 480³) / 6 = 2401,3 cm³ → 852,5 kNm
    // A_v = 2 A / π = 9800 mm²; V_pl,Rd = 9800 · 355 / √3 = 2008,6 kN
    const p = tubeProps(500, 10, 355);
    expect(p.area).toBeCloseTo(15393.8, 1); expect(p.nRdKn).toBeCloseTo(5464.8, 1);
    expect(p.mElRdKnM).toBeCloseTo(656.33, 1); expect(p.mPlRdKnM).toBeCloseTo(852.47, 1);
    expect(p.av).toBeCloseTo(9800, 6); expect(p.vplRdKn).toBeCloseTo(2008.6, 1);
  });
  it('klasse 3 wordt elastisch getoetst: N/A + M/W_el ≤ f_y (art. 6.2.9.2)', () => {
    const r = run({ nEdKn: 1000, headForceKn: 60 }, { kind: 'steel-tube', diameterMm: 500, wallMm: 10 });
    const x = row(r, 'interaction'), m = r.maxMomentKnM;
    // σ = 1e6 / 15394 + M · 1e6 / 1848811
    expect(x.demand!.v).toBeCloseTo(1e6 / 15393.8 + m * 1e6 / 1848811, 1); expect(x.resistance!.v).toBe(355);
    expect(x.uc).toBeCloseTo((1e6 / 15393.8 + m * 1e6 / 1848811) / 355, 4);
    expect(row(r, 'bending').resistance!.v).toBeCloseTo(656.33, 1);
    // De bestaande N–M-toets is plastisch en dus gunstiger; de materiaaltoetsing is maatgevend.
    expect(x.uc!).toBeGreaterThan(r.sectionUtilization!); expect(r.material!.notes.some((q) => q.key === 'class3')).toBe(true);
  });
  it('klasse 1: de interactie is de plastische N–M-kromme, gelijk aan de bestaande toets', () => {
    const r = run({ nEdKn: 400, headForceKn: 60 }, { kind: 'steel-tube', diameterMm: 406, wallMm: 10 });
    expect(row(r, 'tubeClass').status).toBe('info'); expect(row(r, 'interaction').uc).toBeCloseTo(r.sectionUtilization!, 9);
    // Dunwandige benadering M_N,Rd ≈ M_pl,Rd · cos(π n / 2) binnen 1 %.
    const p = tubeProps(406, 10, 355), n = 400 / p.nRdKn;
    expect(row(r, 'interaction').resistance!.v / (p.mPlRdKnM * Math.cos(Math.PI * n / 2))).toBeCloseTo(1, 2);
  });
  it('dwarskracht boven de helft van V_pl,Rd verlaagt de vloeigrens met ρ (art. 6.2.8 (3))', () => {
    expect(shearRho(500, 1000)).toBe(0);                 // V = 0,5 V_pl: geen reductie
    expect(shearRho(750, 1000)).toBeCloseTo(0.25, 12);   // (2 · 0,75 − 1)² = 0,25
    expect(shearRho(1200, 1000)).toBe(1);
  });
  it('klasse 4 valt buiten de toetsing en geeft geen oordeel "voldoet"', () => {
    const r = run({}, { kind: 'steel-tube', diameterMm: 500, wallMm: 5 });
    expect(row(r, 'tubeClass').status).toBe('outside'); expect(row(r, 'interaction').status).toBe('outside'); expect(row(r, 'interaction').uc).toBeNull();
    expect(r.material!.outside).toBe(true); expect(r.material!.ok).toBe(false);
  });
});

describe('betongevulde buis, NEN-EN 1994-1-1 art. 6.7.3', () => {
  it('plastische doorsnede Ø400×10 zonder staven, neutrale lijn in het midden (art. 6.7.3.2)', () => {
    // Neutrale lijn door het middelpunt: de buis is in evenwicht, het halve beton draagt N.
    // N = f_cd · π · 190² / 2 = 20 · 56705,7 = 1134,1 kN
    // M = f_yd · (D³ − d³)/6 + f_cd · d³/12 = 355 · (400³ − 380³)/6 + 20 · 380³/12 = 540,07 + 91,45 = 631,5 kNm
    const c = { D: 400, t: 10, barY: [], barDia: 20, fyd: 355, fcd: 20, fsd: 435 };
    const r = compositePlastic(c, 20 * Math.PI * 190 ** 2 / 2)!;
    expect(r.neutralAxisMm).toBeCloseTo(0, 4); expect(r.mRdKnM).toBeCloseTo(631.53, 1);
    // N_pl,Rd = A_a f_yd + A_c f_cd = 12252,2 · 355 + 113411,5 · 20 = 4349,5 + 2268,2 = 6617,8 kN (formule 6.30, gevulde buis)
    expect(r.nMaxKn).toBeCloseTo(6617.8, 0);
    expect(r.nMinKn).toBeCloseTo(-4349.5, 0);
    // Zuivere buiging ligt onder het maximum en boven de buis alleen (540,07 kNm).
    const pure = compositePlastic(c, 0)!;
    expect(pure.mRdKnM).toBeLessThan(631.53); expect(pure.mRdKnM).toBeGreaterThan(540.07);
    expect(compositePlastic(c, 7000e3)).toBeNull();
  });
  it('staven: in de drukzone f_sd − f_cd, in de trekzone f_sd', () => {
    // Twee staven Ø20 op y = ±100 mm, neutrale lijn in het midden: ΔM = 314,16 · (435 − 20) · 100 + 314,16 · 435 · 100 = 26,70 kNm
    const c = { D: 400, t: 10, barY: [100, -100], barDia: 20, fyd: 355, fcd: 20, fsd: 435 };
    const n0 = 20 * Math.PI * 190 ** 2 / 2 + Math.PI * 100 * (435 - 20) - Math.PI * 100 * 435;
    const r = compositePlastic(c, n0)!;
    expect(r.neutralAxisMm).toBeCloseTo(0, 3); expect(r.mRdKnM).toBeCloseTo(631.53 + 26.70, 1);
  });
  it('toets met α_M = 0,9 (S355), δ en D/t; de plastische weerstand ligt boven die van het rekdiagram', () => {
    const r = run({ nEdKn: 400, headForceKn: 60 }, { kind: 'filled-tube', diameterMm: 406, wallMm: 10, tubeParticipates: true });
    expect(r.material!.standard).toMatch(/1994/);
    const b = row(r, 'compBending'), mpl = b.steps.find((s) => s.s === 'M_pl,N,Rd')!.v as number;
    expect(b.resistance!.v).toBeCloseTo(0.9 * mpl, 9); expect(mpl).toBeGreaterThan(r.capacity!.mRdKnM);
    // D/t = 40,6 ≤ 90 · 235 / 355 = 59,6 (tabel 6.3)
    expect(row(r, 'compDt').resistance!.v).toBeCloseTo(59.58, 2); expect(row(r, 'compDt').status).toBe('info');
    // δ = A_a f_yd / N_pl,Rd met A_a = π (406² − 386²)/4 = 12440,7 mm²
    const aa = Math.PI * (406 ** 2 - 386 ** 2) / 4, as = 8 * Math.PI * 100, ac = Math.PI * 386 ** 2 / 4 - as;
    expect(row(r, 'compDelta').demand!.v).toBeCloseTo(aa * 355 / (aa * 355 + ac * 20 + as * 435), 9);
    expect(row(r, 'axial').resistance!.v).toBeCloseTo((aa * 355 + ac * 20 + as * 435) / 1000, 6);
    // Dwarskracht op de buis alleen: V_pl,a,Rd = (2 A_a / π) · 355 / √3
    expect(row(r, 'compShear').resistance!.v).toBeCloseTo(2 * aa / Math.PI * 355 / Math.sqrt(3) / 1000, 6);
    expect(r.material!.ok).toBe(true);
  });
  it('α_M = 0,8 boven S355 en buiten het toepassingsgebied bij een te lage betonklasse', () => {
    const high = run({}, { kind: 'filled-tube', diameterMm: 406, wallMm: 12.5, tubeParticipates: true, tubeFydMpa: 460 });
    expect(row(high, 'compBending').steps.find((s) => s.s === 'α_M')!.v).toBe(0.8);
    const weak = run({}, { kind: 'filled-tube', diameterMm: 406, wallMm: 10, tubeParticipates: true, fckMpa: 16, fcdMpa: 10.67 });
    expect(row(weak, 'compScope').status).toBe('outside'); expect(weak.material!.ok).toBe(false);
  });
});

describe('damwandprofiel uit de bibliotheek, NEN-EN 1993-5', () => {
  const au14 = findSheetPile('AU 14', 'ArcelorMittal')!;
  const sheet = (grade: string, extra: Partial<ReturnType<typeof defaultSheet>> = {}) => ({ profileId: 'AU 14', manufacturer: 'ArcelorMittal', grade, widthMode: 'wall' as const, betaB: 1, betaD: 1, ...extra });
  it('de handberekening gebruikt de bibliotheekwaarden van AU 14', () => {
    expect([au14.widthMm, au14.wallHeightMm, au14.flangeMm, au14.webMm, au14.areaCm2PerM, au14.iCm4PerM, au14.welCm3PerM, au14.wplCm3PerM]).toEqual([750, 408, 10, 8.3, 132.3, 28680, 1405, 1663]);
    expect(au14.classes).toMatchObject({ S240GP: 2, S355GP: 3 });
  });
  it('EI, M_c,Rd, N_pl,Rd en V_pl,Rd per m wand (art. 5.2.2, 5.2.3)', () => {
    // EI = 210000 · 28680 cm⁴ = 60228 kNm²/m
    // S240GP, klasse 2: M_c,Rd = W_pl · f_y = 1663 · 240 / 1000 = 399,1 kNm/m
    // S355GP, klasse 3: M_c,Rd = W_el · f_y = 1405 · 355 / 1000 = 498,8 kNm/m
    // N_pl,Rd = 132,3 cm² · 355 = 4696,7 kN/m
    // A_V = t_w (h − 2 t_f) · 1000 / b = 8,3 · 388 · 1000 / 750 = 4293,9 mm²/m; V_pl,Rd = 4293,9 · 355 / √3 = 880,1 kN/m
    const p2 = sheetProps(sheet('S240GP'), 210000), p3 = sheetProps(sheet('S355GP'), 210000);
    expect(p3.eiKnM2).toBeCloseTo(60228, 6);
    expect(p2.plastic).toBe(true); expect(p2.mcRdKnM).toBeCloseTo(399.12, 2);
    expect(p3.plastic).toBe(false); expect(p3.cls).toBe(3); expect(p3.mcRdKnM).toBeCloseTo(498.775, 3);
    expect(p3.nplRdKn).toBeCloseTo(4696.65, 2); expect(p3.avMm2).toBeCloseTo(4293.87, 1); expect(p3.vplRdKn).toBeCloseTo(880.07, 1);
  });
  it('losse plank en β_B, β_D: alles evenredig met de breedte, β_B op W en β_D op I', () => {
    const p = sheetProps(sheet('S355GP', { widthMode: 'single', betaB: 0.8, betaD: 0.5 }), 210000);
    expect(p.widthM).toBe(0.75);
    expect(p.mcRdKnM).toBeCloseTo(0.8 * 498.775 * 0.75, 3); expect(p.eiKnM2).toBeCloseTo(0.5 * 60228 * 0.75, 6);
    expect(p.nplRdKn).toBeCloseTo(4696.65 * 0.75, 2); expect(p.vplRdKn).toBeCloseTo(880.07 * 0.75, 1);
    expect(() => sheetProps(sheet('S355GP', { betaB: 1.2 }), 210000)).toThrow(/β/);
  });
  it('normaalkracht en dwarskracht op de momentweerstand (art. 5.2.3 (10)-(11), 5.2.2 (9))', () => {
    const p3 = sheetProps(sheet('S355GP'), 210000), p2 = sheetProps(sheet('S240GP'), 210000);
    // Klasse 3: n ≤ 0,10 geen reductie; n = 0,2: M_N,Rd = M_c,Rd · (1 − 0,2)
    expect(sheetMoment(p3, 0.05 * p3.nplRdKn, 0).mRdKnM).toBeCloseTo(498.775, 3);
    expect(sheetMoment(p3, 0.2 * p3.nplRdKn, 0).mRdKnM).toBeCloseTo(0.8 * 498.775, 3);
    // U-profiel klasse 2: n ≤ 0,25 geen reductie; n = 0,4: 1,33 · M_c,Rd · 0,6 = 0,798 M_c,Rd
    expect(sheetMoment(p2, 0.25 * p2.nplRdKn, 0).mRdKnM).toBeCloseTo(399.12, 2);
    expect(sheetMoment(p2, 0.4 * p2.nplRdKn, 0).mRdKnM).toBeCloseTo(1.33 * 0.6 * 399.12, 2);
    // V = 0,75 V_pl,Rd: ρ = 0,25 → 0,75 M_c,Rd (reductie op de hele doorsnede)
    expect(sheetMoment(p3, 0, 0.75 * p3.vplRdKn!).mRdKnM).toBeCloseTo(0.75 * 498.775, 3);
    // Trek en druk gelijk.
    expect(sheetMoment(p3, -0.2 * p3.nplRdKn, 0).mRdKnM).toBeCloseTo(0.8 * 498.775, 3);
  });
  it('Z-profiel klasse 2: 1,11 · M_c,Rd · (1 − n) boven n = 0,10', () => {
    // AZ 25-800, S240GP, klasse 2 volgens de catalogus: M_c,Rd = W_pl · f_y = 2890 · 240 / 1000 = 693,6 kNm/m
    const z = sheetProps({ ...defaultSheet(), profileId: 'AZ 25-800', manufacturer: 'ArcelorMittal', grade: 'S240GP' }, 210000);
    expect([z.profile.shape, z.cls, z.profile.wplCm3PerM]).toEqual(['Z', 2, 2890]);
    expect(z.mcRdKnM).toBeCloseTo(693.6, 6);
    expect(sheetMoment(z, 0.1 * z.nplRdKn, 0).mRdKnM).toBeCloseTo(z.mcRdKnM, 6);
    expect(sheetMoment(z, 0.3 * z.nplRdKn, 0).mRdKnM).toBeCloseTo(1.11 * 0.7 * z.mcRdKnM, 6);
  });
  it('rekent door als doorsnede van de module en geeft het overzicht', () => {
    const r = run({ headForceKn: 60, springWidthM: 1 }, { kind: 'sheet-pile', diameterMm: 408, sheet: sheet('S355GP') });
    expect(r.section.eiKnM2).toBeCloseTo(60228, 6); expect(r.capacity!.mRdKnM).toBeCloseTo(498.775, 3);
    expect(r.material!.standard).toMatch(/1993-5/);
    expect(row(r, 'bending').uc).toBeCloseTo(r.maxMomentKnM / 498.775, 6); expect(row(r, 'shear').uc).toBeCloseTo(60 / 880.07, 3);
    expect(row(r, 'interaction').uc).toBeCloseTo(r.sectionUtilization!, 9);
    expect(r.material!.notes.some((x) => x.key === 'sheetModel')).toBe(true); expect(r.material!.ok).toBe(true);
    expect(sectionStiffness({ ...base, kind: 'sheet-pile', sheet: sheet('S355GP') }).steelAreaM2).toBeCloseTo(0.01323, 6);
  });
  it('klasse 4 volgens de catalogus valt buiten de toetsing', () => {
    const az = findSheetPile('AZ 18-800', 'ArcelorMittal')!;
    expect(az.classes!.S430GP).toBe(4);
    const section = { ...base, kind: 'sheet-pile' as const, sheet: { ...sheet('S430GP'), profileId: 'AZ 18-800' } };
    expect(() => sectionCapacity(section, 0)).toThrow(/klasse 4/i);
    const r = run({}, section);
    expect(r.sectionUtilization).toBeNull(); expect(row(r, 'sheetClass').status).toBe('outside'); expect(r.material!.ok).toBe(false);
  });
  it('een profiel zonder klasse of plastisch weerstandsmoment wordt elastisch gerekend en zegt dat', () => {
    const hat = findSheetPile('NS-SP-10H')!;
    expect([hat.wplCm3PerM, hat.webMm, hat.classes]).toEqual([null, null, undefined]);
    const r = run({}, { kind: 'sheet-pile', sheet: { ...sheet('S355GP'), profileId: 'NS-SP-10H', manufacturer: undefined } });
    expect(row(r, 'sheetClass').note!.key).toBe('sheetNoClass');
    expect(row(r, 'bending').resistance!.v).toBeCloseTo(902 * 355 / 1000, 6);   // W_el · f_y
    expect(row(r, 'shear').status).toBe('na');                                    // lijfdikte niet in de bibliotheek
  });
  it('een vlak profiel zonder I en W is niet te rekenen', () => {
    const r = computeLateral({ ...lateralExample, section: { ...base, kind: 'sheet-pile', sheet: { ...sheet('S355GP'), profileId: 'AS 500-9.5' } } });
    expect(r.ok).toBe(false);
  });
});
