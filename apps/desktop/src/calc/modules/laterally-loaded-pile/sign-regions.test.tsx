import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ForceDiagrams, signRegions } from './ForceDiagrams';
import { computeLateral, lateralExample } from './compute';
import { mobilisationMix, springCss, springLength, springPath } from './spring-visual';
import type { BeamResult } from './beam';

type Sample = BeamResult['samples'][number];
const line = (values: Array<[number, number]>): Sample[] => values.map(([zM, v]) => ({ zM, yM: 0, momentKnM: v, shearKn: 0, reactionKnM: 0 }));
const M = (p: Sample) => p.momentKnM;

describe('tekengebieden van een krachtslijn', () => {
  it('splitst op de nuldoorgang, lineair tussen twee punten', () => {
    const regions = signRegions(line([[0, 10], [1, 30], [2, 10], [3, -30], [4, -10]]), M);
    expect(regions).toHaveLength(2);
    expect(regions[0]).toMatchObject({ zTop: 0, sign: 1, peak: { v: 30, z: 1 } });
    expect(regions[0].zBottom).toBeCloseTo(2.25, 12);
    expect(regions[1].zTop).toBeCloseTo(2.25, 12);
    expect(regions[1]).toMatchObject({ zBottom: 4, sign: -1, peak: { v: -30, z: 3 } });
  });

  it('laat een nulstuk buiten de gebieden en begint en eindigt op het nulpunt', () => {
    const regions = signRegions(line([[0, 0], [1, 20], [2, 0], [3, 0], [4, -8], [5, 0]]), M);
    expect(regions.map((g) => [g.zTop, g.zBottom, g.sign])).toEqual([[0, 2, 1], [3, 5, -1]]);
  });

  it('ziet ruis rond nul niet als eigen gebied en sorteert de punten op diepte', () => {
    const regions = signRegions(line([[3, 1e-9], [0, 50], [1, 20], [2, -1e-9], [4, -1e-9]]), M);
    expect(regions).toHaveLength(1);
    expect(regions[0].sign).toBe(1);
    expect(regions[0].zBottom).toBeGreaterThan(1); expect(regions[0].zBottom).toBeLessThanOrEqual(2);
    expect(signRegions([], M)).toEqual([]);
    expect(signRegions(line([[0, 0], [1, 0]]), M)).toEqual([]);
  });

  it('geeft voor de berekende paal aaneengesloten gebieden met wisselend teken', () => {
    const r = computeLateral({ ...lateralExample, headMomentKnM: 0 }); if (!r.ok) throw new Error(r.error);
    for (const value of [(p: Sample) => p.momentKnM, (p: Sample) => p.shearKn]) {
      const regions = signRegions(r.beam.samples, value);
      expect(regions.length).toBeGreaterThan(1);
      regions.slice(1).forEach((g, k) => { expect(g.sign).toBe(-regions[k].sign); expect(g.zTop).toBeCloseTo(regions[k].zBottom, 9); });
      // De grootste waarde van alle gebieden is het extreem van de lijn.
      expect(Math.max(...regions.map((g) => Math.abs(g.peak.v)))).toBeCloseTo(Math.max(...r.beam.samples.map((p) => Math.abs(value(p)))), 9);
    }
    // In de tekenafspraak van de rekenkern is de dwarskracht aan de kop −H.
    expect(signRegions(r.beam.samples, (p) => p.shearKn)[0]).toMatchObject({ zTop: 0, sign: -1 });
  });

  it('tekent op het scherm in elk voldoende groot gebied het teken van dat gebied', () => {
    const r = computeLateral({ ...lateralExample, headMomentKnM: 0 }); if (!r.ok) throw new Error(r.error);
    const { container } = render(<ForceDiagrams input={lateralExample} beam={r.beam} />);
    const shear = [...container.querySelectorAll('.pile-diagram-V .pile-sign-region')].map((g) => g.getAttribute('data-sign'));
    expect(shear.slice(0, 2)).toEqual(['-1', '1']);
    // Het afschuifteken toont de kracht op het bovenvlak: bij H naar rechts wijst de bovenste pijl aan de kop naar rechts.
    const first = container.querySelector('.pile-diagram-V .pile-shear-sign line')!;
    expect(Number(first.getAttribute('x2'))).toBeGreaterThan(Number(first.getAttribute('x1')));
    expect(container.querySelectorAll('.pile-diagram-V .pile-shear-sign').length).toBe(shear.length);
    expect(container.querySelectorAll('.pile-diagram-M .pile-bend-sign').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.pile-diagram-y .pile-sign-region')).toHaveLength(0);
    expect(container.querySelectorAll('.pile-diagram-M .pile-fill')).toHaveLength(1);
  });
});

describe('veersymbool', () => {
  it('schaalt de lengte met de stijfheid en kleurt naar de foutkleur vanaf 50 % mobilisatie', () => {
    expect(springLength(20000, 20000)).toBe(1);
    expect(springLength(2000, 20000)).toBeCloseTo(0.37, 12);
    expect(springLength(0, 20000)).toBe(0.3);
    expect([null, 0.3, 0.5, 0.75, 1, 1.4].map(mobilisationMix)).toEqual([0, 0, 0, 0.5, 1, 1]);
    expect(springCss('clay-soft', 0.2)).toBe('rgb(105 128 89)');
    expect(springCss('clay-soft', 0.9)).toBe('color-mix(in srgb, var(--oa-error) 80%, rgb(105 128 89))');
    expect(springCss('sand-medium', null)).not.toBe(springCss('clay-soft', null));
  });
  it('tekent een zigzag die op de aslijn begint en eindigt over de gevraagde lengte', () => {
    const d = springPath(10, 50, 60), parts = [...d.matchAll(/([hl])(-?[\d.]+)(?: (-?[\d.]+))?/g)];
    expect(d.startsWith('M10 50')).toBe(true);
    expect(parts.reduce((a, p) => a + Number(p[2]), 0)).toBeCloseTo(60, 1);
    expect(parts.reduce((a, p) => a + Number(p[3] ?? 0), 0)).toBeCloseTo(0, 9);
  });
});
