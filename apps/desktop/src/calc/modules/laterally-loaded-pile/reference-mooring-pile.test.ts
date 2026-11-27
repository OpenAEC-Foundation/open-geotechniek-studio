/**
 * Verificatiegeval "meerpaal, open stalen buis Ø914×20, referentierapport 2025" (VERIFICATIE.md, hoofdstuk
 * "Meerpaal in open water"). Een funderingsadvies met een externe referentie-berekening: paal als elastoplastisch
 * ondersteunde ligger met veren uit de Ménard-modulus, representatieve belasting, uitkomsten × 1,5.
 *
 * Invoer uit het rapport: buis Ø914×20 S355, vrije kop, H = 302 kN (representatief) op NAP +9,8, waterpeil +8,8,
 * waterbodem +3,0, punt −5,0. Zand γ_n 20 (γ′ = 10), φ′ 30 / 32,5, E_p in kN/m². Afroesting 0,012 mm/jaar aan beide
 * zijden, 50 jaar (0,6 + 0,6 mm), van de kop tot NAP +2,0.
 * Keuze in de module: veren 'menard' (α = 1/3, zand), elastoplastisch, pu volgens Brinch Hansen met γ′ = 10, geen
 * laagcorrectie, waterbodem aangevinkt. De kopverplaatsing van de bron staat op NAP +10,0 (bovenkant buis, 0,2 m
 * boven de last): y(+10,0) = y(+9,8) − θ · 0,2.
 *
 * Bodemopbouw 2: de tabel van het rapport geeft laaggrenzen +3,0 / −2,0 / −3,0, de figuren van de berekening tonen
 * +3,0 / 0,0 / −3,0. De uitkomsten van de bron passen bij de figuren; het geval rekent daarmee (en toont de tabel apart).
 */
import { describe, expect, it } from 'vitest';
import { computeLateral, lateralExample, type LateralInput, type LateralLayer } from './compute';
import { NO_CORROSION } from '../../shared/corrosion';

type Ok = Extract<ReturnType<typeof computeLateral>, { ok: true }>;
const HEAD = 9.8;
interface Layer { top: number; bottom: number; ep: number; phi: number }
const PROFILE_1: Layer[] = [{ top: 3, bottom: 0, ep: 700, phi: 30 }, { top: 0, bottom: -3, ep: 7000, phi: 32.5 }, { top: -3, bottom: -5, ep: 10500, phi: 32.5 }];
const PROFILE_2: Layer[] = [{ top: 3, bottom: 0, ep: 3500, phi: 30 }, { top: 0, bottom: -3, ep: 7000, phi: 32.5 }, { top: -3, bottom: -5, ep: 10500, phi: 32.5 }];
const PROFILE_2_TABLE: Layer[] = [{ top: 3, bottom: -2, ep: 3500, phi: 30 }, { top: -2, bottom: -3, ep: 7000, phi: 32.5 }, { top: -3, bottom: -5, ep: 10500, phi: 32.5 }];
const custom = (mm: number) => ({ ...NO_CORROSION, source: 'custom' as const, customMm: mm });

function mooringPileInput(profile: Layer[], years: 0 | 50, headForceKn = 302): LateralInput {
  const layers: LateralLayer[] = profile.map((l) => ({ topM: HEAD - l.top, bottomM: HEAD - l.bottom, springId: 'menard', menardEpKpa: l.ep, menardAlpha: 1 / 3,
    manualKhKnM3: 0, frictionDeg: l.phi, netPressureKpa: 0, ultimate: { atSurfaceKnM: 0, gradientKnM2: 0, capKnM: 1, brinchHansen: { phiDeg: l.phi, gammaEffKnM3: 10 } } }));
  return { ...lateralExample, headNap: HEAD, lengthM: HEAD + 5, maxElementM: 0.1, headForceKn, headMomentKnM: 0, nEdKn: 0, headFixedRotation: false, toeFixed: false,
    springWidthM: 0.914, pileSystemId: 'steel-tube-open', openEnd: true,
    section: { ...lateralExample.section, kind: 'steel-tube', diameterMm: 914, wallMm: 20, tubeFydMpa: 355 },
    analysisMode: 'elastoplastic', layerCorrection: 'none', layers, waterBed: { enabled: true, bedNap: 3, waterNap: 8.8 },
    ...(years ? { corrosion: { outer: custom(0.6), inner: custom(0.6), sides: 2 as const, reducedStiffness: true, zoneBottomNap: 2 } } : {}) };
}
function run(profile: Layer[], years: 0 | 50, H = 302): Ok {
  const r = computeLateral(mooringPileInput(profile, years, H));
  if (!r.ok) throw new Error(r.error);
  return r;
}
const peak = (r: Ok, key: 'momentKnM' | 'shearKn') => r.beam.samples.reduce((a, s) => Math.abs(s[key]) > Math.abs(a[key]) ? s : a);
const topDisplacementMm = (r: Ok) => 1000 * (r.beam.nodes[0].yM - r.beam.nodes[0].rotationRad * 0.2);
const row = (r: Ok, id: string) => r.material!.rows.find((x) => x.id === id)!;
const rel = (a: number, b: number) => Math.abs(a / b - 1);

// Uitkomsten van de bron (representatief): moment, dwarskracht en verplaatsing van de paalkop (NAP +10,0).
const SOURCE = {
  p1: { m: 2691.4, v: 891.9, y0: 302.7, y50: 305.5 },
  p2: { m: 2681.4, v: 870.0, y0: 288.9, y50: 291.6 },
};

describe('meerpaal, open stalen buis Ø914×20, referentierapport 2025', () => {
  for (const [name, profile, src] of [['bodemopbouw 1', PROFILE_1, SOURCE.p1], ['bodemopbouw 2', PROFILE_2, SOURCE.p2]] as const) {
    it(`${name}: moment, dwarskracht en kopverplaatsing`, { timeout: 120000 }, () => {
      const r0 = run(profile, 0), r50 = run(profile, 50), m = peak(r0, 'momentKnM'), v = peak(r0, 'shearKn');
      // Moment: binnen 1 % (statisch bepaald door H, de vrije lengte en de grensweerstand bovenin).
      expect(rel(r0.maxMomentKnM, src.m)).toBeLessThan(0.01);
      // Niveau van het grootste moment: bron "ca. +0,0".
      expect(Math.abs(HEAD - m.zM)).toBeLessThan(0.3);
      // Dwarskracht en verplaatsing hangen af van de vorm van de grensweerstand en de veren: 4 % en 8 %.
      expect(rel(Math.abs(v.shearKn), src.v)).toBeLessThan(0.04);
      expect(rel(topDisplacementMm(r0), src.y0)).toBeLessThan(0.08);
      // Afroesting bovenin: momenten gelijk, verplaatsing enkele millimeters groter (bron + 2,8 en + 2,7 mm).
      expect(r50.maxMomentKnM).toBeCloseTo(r0.maxMomentKnM, 2);
      const dy = topDisplacementMm(r50) - topDisplacementMm(r0);
      expect(dy).toBeGreaterThan(1.5); expect(dy).toBeLessThan(4);
    });
  }
  it('bodemopbouw 2 met de laaggrenzen uit de tabel wijkt duidelijk af van de bron', { timeout: 120000 }, () => {
    const r = run(PROFILE_2_TABLE, 0);
    expect(rel(r.maxMomentKnM, SOURCE.p2.m)).toBeLessThan(0.01);
    expect(topDisplacementMm(r) / SOURCE.p2.y0).toBeGreaterThan(1.2);
  });
  it('doorsnede 0 en 50 jaar: klasse, weerstanden en EI zoals de bron, behalve de klasse-3-weerstand', { timeout: 120000 }, () => {
    const r0 = run(PROFILE_1, 0), r50 = run(PROFILE_1, 50);
    expect(row(r0, 'bending').resistance!.v).toBeCloseTo(5675.5, 0); // bron M_pl,Rd 5675,5 kNm
    expect(row(r0, 'shear').resistance!.v).toBeCloseTo(7329.3, 0); // bron V_pl,Rd 7329,3 kN
    expect(r50.corrosion!.tube!.reducedDiameterMm).toBeCloseTo(912.8, 9); expect(r50.corrosion!.tube!.reducedWallMm).toBeCloseTo(18.8, 9);
    expect(r50.corrosion!.stiffnessZone!.eiKnM2).toBeCloseTo(1108260, -1); // bron EI 1 108 260 kNm²
    expect(row(r50, 'shear').resistance!.v).toBeCloseTo(6889.6, 0); // bron V_pl,Rd 6889,6 kN
    // D/t = 912,8 / 18,8 = 48,55 > 70 ε² = 46,4: klasse 3, dus W_el f_y = 4 104,9 kNm (de bron rekent met W_pl: 5 334,9).
    expect(row(r50, 'tubeClass').note?.vars?.cls).toBe(3);
    expect(row(r50, 'bending').resistance!.v).toBeCloseTo(4104.9, 0);
    // Rekenwaarde zoals de bron: 1,5 × het representatieve moment.
    expect(1.5 * r0.maxMomentKnM / 5675.5).toBeCloseTo(0.714, 2);
    expect(1.5 * r50.maxMomentKnM / 4104.9).toBeGreaterThan(0.98);
  });
  it('de rekenwaarde H = 453 kN direct op de paal vindt geen evenwicht: de grond bezwijkt eerder (ca. 369 kN)', { timeout: 120000 }, () => {
    expect(computeLateral(mooringPileInput(PROFILE_1, 0, 453)).ok).toBe(false);
    expect(computeLateral(mooringPileInput(PROFILE_1, 0, 360)).ok).toBe(true);
    expect(computeLateral(mooringPileInput(PROFILE_1, 0, 380)).ok).toBe(false);
  });
});
