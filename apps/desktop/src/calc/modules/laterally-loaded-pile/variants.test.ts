import { describe, expect, it } from 'vitest';
import { computeLateral, lateralExample, type LateralInput } from './compute';
import { defaultSheet } from './sheet-section';
import { findSheetPile } from '../../library/sheetPiles';
import { applyDesign, designLabel, designOf, evaluateVariant, newVariant, pileMass, readVariants, withLength } from './variants';
import { withLength as tableWithLength, ROUND_CONCRETE } from './pile-table';
import { ROUND_SERIES } from './optimizer';

const base: LateralInput = structuredClone(lateralExample);
const tube = { ...base.section, kind: 'steel-tube' as const, diameterMm: 323.9, wallMm: 10, tubeFydMpa: 355 };

describe('gewicht per paal (handgerekend, ρ staal 7850 en beton 2400 kg/m³)', () => {
  it('holle stalen buis Ø323,9 × 10 mm, 12 m', () => {
    // A = π/4 · (323,9² − 303,9²) = π/4 · 12 556 = 9 861,4 mm²; m = 9 861,4e-6 · 12 · 7850 = 928,9 kg
    const m = pileMass(tube, 12);
    expect(m.profileKg).toBeCloseTo(928.95, 1);
    expect(m.rebarKg).toBe(0); expect(m.concreteM3).toBe(0);
    expect(m.steelKg).toBeCloseTo(928.95, 1); expect(m.totalKg).toBeCloseTo(928.95, 1);
  });
  it('prefab vierkant 400 mm met 8Ø20, 12 m', () => {
    // As = 8 · π · 10² = 2 513,3 mm² → 2 513,3e-6 · 12 · 7850 = 236,75 kg
    // Ac,netto = 0,16 − 0,0025133 = 0,157487 m² → V = 1,88984 m³ → 4 535,6 kg
    const m = pileMass(base.section, 12);
    expect(m.rebarKg).toBeCloseTo(236.75, 1);
    expect(m.concreteM3).toBeCloseTo(1.88984, 4);
    expect(m.concreteKg).toBeCloseTo(4535.6, 0);
    expect(m.profileKg).toBe(0);
    expect(m.totalKg).toBeCloseTo(236.75 + 4535.6, 0);
  });
  it('betongevulde buis Ø323,9 × 10 met 6Ø16: buis, kern en staven apart', () => {
    // kern Ø303,9: π/4 · 303,9² = 72 535,6 mm²; staven 6 · π · 8² = 1 206,4 mm²
    // beton (72 535,6 − 1 206,4)e-6 · 10 · 2400 = 1 711,9 kg; wapening 1 206,4e-6 · 10 · 7850 = 94,70 kg; buis 9 861,4e-6 · 10 · 7850 = 774,1 kg
    const m = pileMass({ ...tube, kind: 'filled-tube', barCount: 6, barDiameterMm: 16, coverToBarCentreMm: 50 }, 10);
    expect(m.concreteKg).toBeCloseTo(1711.9, 0);
    expect(m.rebarKg).toBeCloseTo(94.70, 1);
    expect(m.profileKg).toBeCloseTo(774.1, 0);
    expect(m.steelKg).toBeCloseTo(774.1 + 94.70, 0);
  });
  it('damwandprofiel per m wand: A uit de bibliotheek, gelijk aan de catalogusmassa', () => {
    const sheet = { ...defaultSheet() }, p = findSheetPile(sheet.profileId, sheet.manufacturer)!;
    const m = pileMass({ ...base.section, kind: 'sheet-pile', sheet }, 10);
    expect(m.profileKg).toBeCloseTo(p.areaCm2PerM! * 1e-4 * 10 * 7850, 6);
    // De catalogus geeft de massa apart; die moet binnen 1 % gelijk zijn.
    expect(Math.abs(m.profileKg / (p.massKgPerM2! * 10) - 1)).toBeLessThan(0.01);
  });
  it('ongeldige doorsnede: geen gewicht', () => {
    expect(pileMass({ ...tube, wallMm: 200 }, 12).totalKg).toBeNaN();
  });
});

describe('varianten', () => {
  it('ontwerp overnemen en weer zetten verandert grond en belasting niet', () => {
    const d = designOf(base), changed = { ...d, section: tube, lengthM: 10 };
    const next = applyDesign({ ...base, headForceKn: 77 }, changed);
    expect(next.section).toEqual(tube); expect(next.lengthM).toBe(10); expect(next.headForceKn).toBe(77);
    expect(next.layers[next.layers.length - 1].bottomM).toBe(10);
    expect(applyDesign(base, d)).toEqual(base);
    expect(designLabel(changed)).toBe('Ø323,9×10 S355');
    expect(designLabel(d)).toBe('□400 8Ø20 C30/37');
  });
  it('lengteregel is gelijk aan die van de paaltabel, en de ronde reeks ook', () => {
    for (const L of [6, 10, 12, 15]) expect(withLength(base, L)).toEqual(tableWithLength(base, L));
    expect(ROUND_SERIES).toEqual(ROUND_CONCRETE);
  });
  it('worden met de berekening bewaard en geladen; de berekening leest ze niet', () => {
    const v1 = newVariant(undefined, designOf(base));
    const cfg = { items: [v1, newVariant({ items: [v1] }, { ...designOf(base), section: tube })], inReport: true };
    const saved = JSON.parse(JSON.stringify({ ...base, variants: cfg })) as LateralInput;
    expect(saved.variants).toEqual(cfg);
    expect(readVariants(saved.variants)).toEqual(cfg);
    expect(cfg.items.map((v) => v.id)).toEqual(['v1', 'v2']);
    // Kapotte items vallen weg bij het laden.
    expect(readVariants({ items: [{ id: 'x' }, cfg.items[0], null] })!.items).toEqual([cfg.items[0]]);
    expect(readVariants('onzin')).toBeUndefined();
    const a = computeLateral(base), b = computeLateral(saved);
    expect(a.ok && b.ok && b.maxMomentKnM).toBe(a.ok && a.maxMomentKnM);
  });
  it('rekent een variant door met de maatgevende toets en het oordeel', () => {
    const o = evaluateVariant(base, { ...designOf(base), section: tube });
    expect(o.ok).toBe(true);
    expect(o.uc).toBeGreaterThan(0); expect(o.checkLabel).toBeTruthy();
    expect(o.passes).toBe(o.uc! <= 1);
    expect(evaluateVariant(base, { ...designOf(base), section: tube }, 0.001).passes).toBe(false);
    const bad = evaluateVariant(base, { ...designOf(base), section: { ...tube, wallMm: 200 } });
    expect(bad.ok).toBe(false); expect(bad.passes).toBe(false);
  });
});
