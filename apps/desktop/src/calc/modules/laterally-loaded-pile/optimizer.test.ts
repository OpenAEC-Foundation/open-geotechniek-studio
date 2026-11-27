import { describe, expect, it } from 'vitest';
import { lateralExample, type LateralInput } from './compute';
import { buildSpace, decode, defaultSettings, enumerate, fitnessOf, objectiveKg, rng, runOptimizer, spaceSize, violationOf, type OptimizerSettings } from './optimizer';
import { designLabel, evaluateVariant } from './variants';

// Stalen buis onder een flinke kopkracht: de lichtste buis die voldoet ligt midden in de reeks.
const base: LateralInput = { ...structuredClone(lateralExample), headForceKn: 120, headMomentKnM: 0, pileSystemId: 'steel-tube-closed', springWidthM: .3239,
  section: { ...lateralExample.section, kind: 'steel-tube', diameterMm: 323.9, wallMm: 10, tubeFydMpa: 355 } };
const small = (over: Partial<OptimizerSettings> = {}): OptimizerSettings => ({
  ...defaultSettings(base), kinds: ['steel-tube'], sizes: { 'steel-tube': [219.1, 273, 323.9, 355.6, 406.4, 457] },
  wallsMm: [6.3, 8, 10, 12.5, 16], steelGrades: ['S355'], toeHighNap: -10, toeLowNap: -12, toeStepM: 2,
  population: 12, generations: 25, stall: 10, seed: 7, ...over,
});

describe('zoekruimte', () => {
  it('telt de verschillende ontwerpen en decodeert elk genoom naar een ontwerp uit de reeks', () => {
    const st = small(), sp = buildSpace(base, st);
    expect(sp.lengths).toEqual([10, 12]);
    expect(spaceSize(sp)).toBe(6 * 5 * 2);
    const all = enumerate(base, st);
    expect(all).toHaveLength(60);
    expect(new Set(all.map((d) => `${designLabel(d)} ${d.lengthM}`)).size).toBe(60);
    const d = decode(base, st, sp, [0, 5, 4, 0, 0, 0, 1]);
    expect(d.section.diameterMm).toBe(457); expect(d.section.wallMm).toBe(16); expect(d.lengthM).toBe(12);
    expect(d.springWidthM).toBeCloseTo(.457, 9); // werkende breedte volgt de paal
    expect(d.pileSystemId).toBe('steel-tube-closed');
  });
  it('straft overschrijding en houdt een voldoende variant op zijn massa', () => {
    const ok = { ok: true, uc: .9, outside: false, passes: true, yHeadMm: 10 } as Parameters<typeof violationOf>[0];
    expect(violationOf(ok, {})).toBe(0);
    expect(violationOf({ ...ok, uc: 1.2, passes: false }, {})).toBeCloseTo(.2, 9);
    expect(violationOf(ok, { maxDisplacementMm: 5 })).toBeCloseTo(1, 9);
    expect(violationOf({ ...ok, ok: false }, {})).toBe(10);
    expect(fitnessOf(500, 0, 20)).toBe(500);
    expect(fitnessOf(500, .1, 20)).toBe(500 + 20 * .1 * 600);
  });
  it('randomgenerator is reproduceerbaar', () => {
    const a = rng(3), b = rng(3);
    expect(Array.from({ length: 5 }, a)).toEqual(Array.from({ length: 5 }, b));
  });
});

describe('genetisch algoritme', () => {
  it('vindt het echte minimum van een kleine zoekruimte (volledig doorzocht)', async () => {
    // Met een verplaatsingseis van 90 mm voldoen 16 van de 60 varianten; het minimum is dan Ø457 × 8 bij 10 m.
    const st = small({ maxDisplacementMm: 90 });
    const all = enumerate(base, st).map((d) => ({ d, o: evaluateVariant(base, d) }));
    const feasible = all.filter((x) => violationOf(x.o, st) === 0).sort((a, b) => objectiveKg(a.o, st) - objectiveKg(b.o, st));
    expect(feasible.length).toBeGreaterThan(3);
    expect(feasible.length).toBeLessThan(all.length); // de eisen snijden echt
    const truth = feasible[0];
    const r = await runOptimizer(base, st);
    expect(r.best[0].violation).toBe(0);
    expect(r.best[0].objectiveKg).toBeCloseTo(objectiveKg(truth.o, st), 6);
    expect(designLabel(r.best[0].design)).toBe(designLabel(truth.d));
    expect(r.best.length).toBeLessThanOrEqual(10);
    expect(r.best.map((c) => c.objectiveKg)).toEqual([...r.best.map((c) => c.objectiveKg)].sort((a, b) => a - b));
    expect(r.evaluated).toBeLessThanOrEqual(60);
    expect(r.history.length).toBe(r.generations);
    // Ook met andere startwaarden: hetzelfde minimum.
    for (const seed of [1, 2, 3, 11]) expect(designLabel((await runOptimizer(base, { ...st, seed })).best[0].design), `seed ${seed}`).toBe(designLabel(truth.d));
  }, 120000);
  it('geeft met dezelfde seed dezelfde uitkomst', async () => {
    const st = small({ generations: 6, stall: 99 });
    const a = await runOptimizer(base, st), b = await runOptimizer(base, st);
    expect(a.history).toEqual(b.history);
    expect(a.best.map((c) => c.label)).toEqual(b.best.map((c) => c.label));
    expect(a.evaluated).toBe(b.evaluated);
  }, 120000);
  it('stopt op verzoek en rekent elke variant maar één keer', async () => {
    let calls = 0, gens = 0;
    const seen = new Set<string>();
    const r = await runOptimizer(base, small({ generations: 50, stall: 99 }), {
      evaluate: (d) => { const k = JSON.stringify(d); expect(seen.has(k)).toBe(false); seen.add(k); calls++; return evaluateVariant(base, d); },
      onProgress: (p) => { gens = p.generation; }, shouldStop: () => gens >= 3, pause: async () => {},
    });
    expect(r.reason === 'stopped' || r.reason === 'exhausted').toBe(true);
    expect(r.evaluated).toBe(calls);
  }, 120000);
});
