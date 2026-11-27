// Afroesting van de paaldoorsnede: zonder verlies precies de huidige uitkomst, een handgerekende buis met 1 en 2
// kanten, het damwandprofiel, de stijfheid alleen met het vinkje, en de verificatietabel (VERIFICATIE.md).
import { appendFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NO_CORROSION, type CorrosionFace } from '../../shared/corrosion';
import { rowDiff, rowOk } from '../../shared/corrosion-verification';
import { computeLateral, lateralExample, type LateralInput } from './compute';
import { tubeVerification } from './corrosion-verification';
import { defaultSheet } from './sheet-section';
import { designOf, evaluateVariant, pileMass } from './variants';

const custom = (mm: number): CorrosionFace => ({ ...NO_CORROSION, source: 'custom', customMm: mm });
const tube = (kind: 'steel-tube' | 'filled-tube' = 'steel-tube'): LateralInput => ({ ...structuredClone(lateralExample), headForceKn: 150, section: { ...lateralExample.section, kind, diameterMm: 323.9, wallMm: 10, tubeFydMpa: 355, barCount: kind === 'filled-tube' ? 8 : 0, tubeParticipates: kind === 'filled-tube' } });
const ok = (i: LateralInput) => { const r = computeLateral(i); if (!r.ok) throw new Error(r.error); return r; };

describe('afroesting horizontaal belaste paal', () => {
  it('dikteverlies 0 geeft exact de huidige uitkomsten', () => {
    for (const i of [tube(), tube('filled-tube'), { ...tube(), section: { ...tube().section, kind: 'sheet-pile' as const, sheet: defaultSheet() } }]) {
      const before = ok(i), after = ok({ ...i, corrosion: { outer: custom(0), inner: custom(0), sides: 2, reducedStiffness: true } });
      expect(after.material).toEqual(before.material); expect(after.capacity).toEqual(before.capacity); expect(after.maxMomentKnM).toBe(before.maxMomentKnM); expect(after.corrosion).toBeNull();
    }
  });
  it('holle buis 323,9 × 10, S355, 1,2 mm per kant: met de hand', () => {
    const one = ok({ ...tube(), corrosion: { outer: custom(1.2), inner: NO_CORROSION, sides: 1, reducedStiffness: false } });
    const two = ok({ ...tube(), corrosion: { outer: custom(1.2), inner: custom(1.2), sides: 2, reducedStiffness: false } });
    const m = (r: typeof one) => r.material!.rows.find((x) => x.id === 'bending')!.resistance!.v;
    // 1 kant: D 321,5, t 8,8: W_pl = (321,5³ − 303,9³) / 6 = 860,70 cm³ → M = 305,55 kNm. 2 kanten: t 7,6, W_pl = 749,00 cm³ → 265,89 kNm.
    expect(m(one)).toBeCloseTo(305.55, 1); expect(m(two)).toBeCloseTo(265.89, 1);
    expect(one.corrosion!.tube).toEqual({ diameterMm: 323.9, wallMm: 10, reducedDiameterMm: 321.5, reducedWallMm: 8.8 });
    expect(one.material!.rows[0].id).toBe('corrosion');
    // De paal zelf rekent standaard met de EI zonder afroesting; met het vinkje met de kleinere.
    expect(one.section.eiKnM2).toBe(ok(tube()).section.eiKnM2);
    const stiff = ok({ ...tube(), corrosion: { outer: custom(1.2), inner: NO_CORROSION, sides: 1, reducedStiffness: true } });
    expect(stiff.section.eiKnM2).toBeCloseTo((210000 * 1000 * Math.PI * (0.3215 ** 4 - 0.3039 ** 4)) / 64, 3);
  });
  it('gevulde buis roest alleen buiten; de keuze 2 kanten telt dan niet', () => {
    const r = ok({ ...tube('filled-tube'), corrosion: { outer: custom(1.2), inner: custom(1.2), sides: 2, reducedStiffness: false } });
    expect(r.corrosion!.sides).toBe(1); expect(r.corrosion!.tube!.reducedWallMm).toBeCloseTo(8.8, 9);
  });
  it('damwandprofiel: 1 of 2 zijden, het weerstandsmoment wordt kleiner', () => {
    const i: LateralInput = { ...tube(), section: { ...tube().section, kind: 'sheet-pile', sheet: defaultSheet() } };
    const m = (r: ReturnType<typeof ok>) => r.material!.rows.find((x) => x.id === 'bending')!.resistance!.v;
    const none = ok(i), one = ok({ ...i, corrosion: { outer: custom(0.3), inner: NO_CORROSION, sides: 1, reducedStiffness: false } }), two = ok({ ...i, corrosion: { outer: custom(0.3), inner: custom(0.3), sides: 2, reducedStiffness: false } });
    expect(m(one)).toBeLessThan(m(none)); expect(m(two)).toBeLessThan(m(one));
  });
  it('het gewicht van een variant blijft nominaal, ook met afroesting en EI na afroesting', () => {
    const i = tube(), corroded = { ...i, corrosion: { outer: custom(1.2), inner: custom(1.2), sides: 2 as const, reducedStiffness: true } };
    const nominal = pileMass(i.section, i.lengthM).totalKg;
    expect(evaluateVariant(corroded, designOf(corroded)).mass.totalKg).toBe(nominal);
    expect(evaluateVariant(corroded, designOf(corroded)).uc).toBeGreaterThan(evaluateVariant(i, designOf(i)).uc!);
    // Controle: de verkleinde buis zou lichter zijn.
    expect(pileMass({ ...i.section, diameterMm: 321.5, wallMm: 7.6 }, i.lengthM).totalKg).toBeLessThan(nominal);
  });
  it('ontbrekende tabelwaarde geeft een melding', () => {
    const r = computeLateral({ ...tube(), corrosion: { outer: { ...NO_CORROSION, source: 'table', lifeYears: 30 as 25 }, inner: NO_CORROSION, sides: 1, reducedStiffness: false } });
    expect(r.ok).toBe(false);
  });
});

describe('verificatietabel afgeroeste stalen buizen', () => {
  it('alle regels in orde, ook de verschuiving van de klasse', () => {
    const rows = tubeVerification();
    if (process.env.CORROSION_TABLE) for (const r of rows) appendFileSync(process.env.CORROSION_TABLE, `${r.id}|${r.input}|${r.quantity}|${r.expected}|${r.actual}|${rowDiff(r)}|${rowOk(r)}\n`);
    expect(rows.filter((r) => r.quantity === 'klasse').map((r) => r.expected)).toEqual([2, 2, 2, 4, 3, 1]);
    for (const r of rows) expect(rowOk(r), `${r.id} ${r.quantity}: verwacht ${r.expected}, module ${r.actual}`).toBe(true);
  });
});
