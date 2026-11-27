// Open stalen buispaal in de horizontale berekening: zelfde paalsysteem als in
// de module paaldraagvermogen, constructief een holle buis, met het kenmerk
// openEnd (de binnenzijde staat ook in grond).
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { pileBearingCapacityModule } from '../pile-bearing-capacity/module';
import type { PileInput } from '../pile-bearing-capacity/types';
import { computeLateral, lateralExample, type LateralInput } from './compute';
import { LateralInputPanel } from './LateralInputPanel';
import { SYSTEM_KINDS, lateralInputFromPile, systemAvailable, systemOf } from './pile-link';

const last = (f: { mock: { calls: unknown[][] } }) => f.mock.calls[f.mock.calls.length - 1][0];
const ctx = { cpts: new Map(), activeCptId: null, projectMeta: { title: '', client: '', location: '', project_number: '', author: '', date: '' } };
const base = pileBearingCapacityModule.defaultInput(ctx) as PileInput;
const pile: PileInput = { ...base, pileTypeId: 'steel-pipe-driven-open', openTube: { plug: true, plugFactor: .5 }, diameterMm: 508, wallThicknessMm: 12.5, pileTopNap: -1, pileToeNap: -15, excavationNap: 0,
  soilProfile: [{ kind: 'sand-wet', startNap: 0, endNap: -20, gammaK: 20, gammaW: 10, phi: 32.5 }] };

describe('open stalen buispaal horizontaal', () => {
  it('alleen als holle buis te kiezen', () => {
    expect(SYSTEM_KINDS['steel-tube-open']).toEqual(['steel-tube']);
    expect(systemAvailable('steel-tube-open')).toBe(true);
  });
  it('wordt overgenomen als holle buis met openEnd, ook met prop', () => {
    const made = lateralInputFromPile(pile, { calcId: 'c1', name: 'Steiger' });
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    expect(made.input.pileSystemId).toBe('steel-tube-open');
    expect(made.input.openEnd).toBe(true);
    expect(made.input.section).toMatchObject({ kind: 'steel-tube', diameterMm: 508, wallMm: 12.5 });
    expect(systemOf(made.input)).toBe('steel-tube-open');
  });
  it('een gesloten buis krijgt geen openEnd', () => {
    const made = lateralInputFromPile({ ...pile, pileTypeId: 'steel-pipe-driven-closed-2017', openTube: undefined }, { calcId: 'c1', name: 'x' });
    expect(made.ok && made.input.openEnd).toBeFalsy();
  });
  it('tegel kiezen zet openEnd aan, terug naar gesloten zet hem uit', () => {
    const onChange = vi.fn();
    const input: LateralInput = structuredClone(lateralExample);
    const { rerender } = render(<LateralInputPanel input={input} result={computeLateral(input)} onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: /open punt/i }));
    const next = last(onChange) as LateralInput;
    expect(next.openEnd).toBe(true);
    expect(next.section.kind).toBe('steel-tube');
    rerender(<LateralInputPanel input={next} result={computeLateral(next)} onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: /gesloten punt/i }));
    expect((last(onChange) as LateralInput).openEnd).toBeUndefined();
  });
});
