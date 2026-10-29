import { describe, expect, it } from 'vitest';
import { computeSettlement, type SettlementInput } from './compute';
const example = { thicknessM: 2, stressIncreaseKpa: 50, constrainedModulusMpa: 5 };
describe('1D settlement with constrained modulus', () => {
  it('matches a hand calculation: 2 × 50 / 5000 m = 20 mm', () => {
    const r = computeSettlement(example);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.settlementMm).toBeCloseTo(20, 12); expect(r.strain).toBeCloseTo(0.01, 12); }
  });
  it('scales linearly with thickness and stress, inversely with modulus', () => {
    for (const input of [{...example, thicknessM: 4}, {...example, stressIncreaseKpa: 100}, {...example, constrainedModulusMpa: 2.5}]) {
      expect(computeSettlement(input)).toMatchObject({ ok: true, settlementMm: 40 });
    }
    expect(computeSettlement({...example, stressIncreaseKpa: 0})).toMatchObject({ ok: true, settlementMm: 0 });
  });
  it('rejects zero/negative thickness or modulus, negative loads and malformed saved input', () => {
    for (const input of [null, {}, {...example, thicknessM: 0}, {...example, constrainedModulusMpa: -1}, {...example, stressIncreaseKpa: -1}, {...example, thicknessM: null}, {...example, thicknessM: '2'}, {...example, constrainedModulusMpa: NaN}, {...example, stressIncreaseKpa: Infinity}]) {
      expect(computeSettlement(input as SettlementInput).ok).toBe(false);
    }
  });
  it('flags high strain and rejects complete layer collapse or overflow', () => {
    const r = computeSettlement({...example, stressIncreaseKpa: 300});
    expect(r.ok && r.warning).toBeTruthy();
    expect(computeSettlement({...example, stressIncreaseKpa: 5000}).ok).toBe(false);
    expect(computeSettlement({...example, thicknessM: Number.MAX_VALUE, stressIncreaseKpa: 1000}).ok).toBe(false);
  });
});
