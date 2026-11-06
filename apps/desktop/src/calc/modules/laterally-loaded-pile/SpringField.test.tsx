import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { LateralExplorer } from './LateralExplorer';
import { SpringField, mobilisation, mobilisationClass } from './SpringField';
import { computeLateral, lateralExample } from './compute';
import type { SpringState } from './spring-types';

vi.mock('./PileScene3D', () => ({ PileScene3D: () => null }));

const base: SpringState = {
  id: 'element-0-gauss-0', elementIndex: 0, gaussIndex: 0, layerIndex: 0, zM: .25, equivalentDepthM: .4,
  displacementM: .002, tributaryLengthM: .1, initialKnM2: 1000, ultimateKnM: 10, mode: 'nonlinear', correction: 'georgiadis',
  modelLabel: 'Hyperbolisch projectmodel', source: 'Projectinvoer', formula: 'p = pu tanh(k0 y / pu)',
  resistanceKnM: 1.97, tangentKnM2: 961, secantKnM2: 985, curvePoints: [{ yM: 0, pKnM: 0 }],
};
// Een veer op 38 % en een die bijna plastisch is (95 %).
const mid: SpringState = { ...base, id: 'element-1-gauss-0', zM: .8, resistanceKnM: 3.8, secantKnM2: 700 };
const high: SpringState = { ...base, id: 'element-2-gauss-0', zM: 1.4, layerIndex: 1, resistanceKnM: 9.5, secantKnM2: 300 };

describe('mobilisatie', () => {
  it('deelt |p| door pu en geeft geen waarde voor een lineaire veer', () => {
    expect(mobilisation(mid)).toBeCloseTo(.38, 12);
    expect(mobilisation({ ...mid, resistanceKnM: -3.8 })).toBeCloseTo(.38, 12);
    expect(mobilisation({ ...mid, ultimateKnM: null })).toBeNull();
  });
  it('kleurt onder 50 %, tot 90 % en vanaf 90 % verschillend', () => {
    expect(mobilisationClass(.49)).toBe('low');
    expect(mobilisationClass(.5)).toBe('mid');
    expect(mobilisationClass(.9)).toBe('high');
    expect(mobilisationClass(null)).toBe('linear');
  });
});

describe('Veerveld', () => {
  const setup = (springs = [base, mid, high], mode: 'linear' | 'nonlinear' = 'nonlinear') => {
    const onSelect = vi.fn();
    render(<SpringField input={lateralExample} springs={springs} mode={mode} selectedId={base.id} onSelect={onSelect} />);
    return onSelect;
  };

  it('tekent per veer een balk in de kleur van de mobilisatie', () => {
    setup();
    const bars = screen.getAllByRole('button', { name: /^Selecteer veer / });
    expect(bars).toHaveLength(3);
    expect(screen.getByRole('button', { name: `Selecteer veer ${high.id}` })).toHaveClass('mob-high');
    expect(screen.getByRole('button', { name: `Selecteer veer ${base.id}` })).toHaveClass('mob-low');
  });

  it('vat samen waar de grond het verst gemobiliseerd en het meest verweekt is', () => {
    setup();
    const summary = screen.getByText(/Hoogste mobilisatie/);
    expect(summary).toHaveTextContent('Hoogste mobilisatie 95 % op z = 1,4 m (laag 2); 1 veer boven 90 %.');
    expect(summary).toHaveTextContent('ksec/k₀ = 0,3 op z = 1,4 m');
  });

  it('meldt bij een lineair model dat er geen grens en geen verweking is', () => {
    setup([base, mid].map((s) => ({ ...s, mode: 'linear' as const, ultimateKnM: null, secantKnM2: s.initialKnM2 })), 'linear');
    expect(screen.getByText(/Lineair grondmodel/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Selecteer veer ${mid.id}` })).toHaveClass('mob-linear');
  });

  it('selecteert een veer met een klik of met Enter', () => {
    const onSelect = setup();
    fireEvent.click(screen.getByRole('button', { name: `Selecteer veer ${mid.id}` }));
    fireEvent.keyDown(screen.getByRole('button', { name: `Selecteer veer ${high.id}` }), { key: 'Enter' });
    expect(onSelect.mock.calls.map((c) => c[0])).toEqual([mid.id, high.id]);
  });
});

describe('Veren in de verkenner', () => {
  it('opent het veerveld met de echte veren van de berekening en koppelt de inspectie', () => {
    const r = computeLateral(lateralExample);
    if (!r.ok) throw new Error(r.error);
    render(<LateralExplorer input={lateralExample} result={r} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Veren' }));
    expect(screen.getByRole('img', { name: 'Veerveld langs de paal' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Selecteer veer / })).toHaveLength(r.springs.length);
    // De samenvatting noemt dezelfde hoogste mobilisatie als de solveruitvoer.
    const max = Math.max(...r.springs.map((s) => mobilisation(s) ?? 0));
    if (r.analysisMode === 'nonlinear') {
      expect(screen.getByText(/Hoogste mobilisatie/)).toHaveTextContent(`${Math.round(max * 100)} %`);
    }
    const target = r.springs[Math.floor(r.springs.length / 2)];
    fireEvent.click(screen.getByRole('button', { name: `Selecteer veer ${target.id}` }));
    expect(screen.getByRole('combobox', { name: 'Grondveer op diepte' })).toHaveValue(target.id);
    expect(within(screen.getByRole('region', { name: 'Veerinspectie' })).getByText(target.id)).toBeInTheDocument();
  });
});
