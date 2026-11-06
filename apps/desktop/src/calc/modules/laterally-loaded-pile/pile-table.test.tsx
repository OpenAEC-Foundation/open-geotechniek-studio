import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { computeLateral, lateralExample, type LateralInput } from './compute';
import { computePileTable, lightestSize, rowInput, sizeSeries, withLength } from './pile-table';
import { LateralTable } from './LateralTable';
import { buildLateralReport } from './report-pdf';

const ctx = { cpts: new Map(), activeCptId: null, projectMeta: { title: 'Kade', client: '', location: '', project_number: '9', author: '', date: '2026-11-06' } };
const table = (rows: NonNullable<LateralInput['pileTable']>['rows'], extra = {}): LateralInput =>
  ({ ...lateralExample, headNap: -1, pileTable: { rows, ...extra } });

describe('paaltabel: rekenlaag', () => {
  it('rekent iedere rij gelijk aan een losse berekening met de belasting van die rij', () => {
    const input = table([{ id: 'a', name: 'A', headForceKn: 30, headMomentKnM: 20, nEdKn: 0 }, { id: 'b', name: 'B', headForceKn: 90, headMomentKnM: 0, nEdKn: 400, lengthM: 10 }]);
    const [a, b] = computePileTable(input);
    const single = computeLateral({ ...lateralExample, headNap: -1, headForceKn: 90, headMomentKnM: 0, nEdKn: 400, lengthM: 10, layers: [lateralExample.layers[0], { ...lateralExample.layers[1], bottomM: 10 }] });
    if (!single.ok) throw new Error(single.error);
    expect(b.summary.yHeadMm).toBeCloseTo(single.beam.nodes[0].yM * 1000, 9);
    expect(b.summary.uc).toBeCloseTo(single.sectionUtilization!, 9);
    expect(b.input.lengthM).toBe(10);
    expect(a.summary.yHeadMm).toBeLessThan(b.summary.yHeadMm);
    expect(b.input.pileTable).toBeUndefined();
  });
  it('korte palen krijgen ingekorte lagen en een andere maat past de doorsnede aan', () => {
    expect(withLength(lateralExample, 3).layers).toEqual([{ ...lateralExample.layers[0], bottomM: 3 }]);
    expect(rowInput(lateralExample, { id: 'x', name: 'X', headForceKn: 1, headMomentKnM: 0, nEdKn: 0, diameterMm: 450 }).section.diameterMm).toBe(450);
    expect(sizeSeries('steel-tube')[0]).toBe(168.3);
  });
  it('vindt de lichtste maat die u.c. ≤ 1 en de verplaatsingsgrens haalt', () => {
    const input = table([{ id: 'a', name: 'A', headForceKn: 60, headMomentKnM: 0, nEdKn: 0 }], { maxDisplacementMm: 40 });
    const best = lightestSize(input, input.pileTable!.rows[0]);
    expect(best).not.toBeNull();
    expect(best!.summary.passes).toBe(true);
    expect(best!.sizeMm).toBe(350);
    const series = sizeSeries('concrete-square'), i = series.indexOf(best!.sizeMm);
    // Eén maat kleiner voldoet niet (of is de kleinste).
    if (i > 0) expect(computePileTable({ ...input, pileTable: { ...input.pileTable!, rows: [{ ...input.pileTable!.rows[0], diameterMm: series[i - 1] }] } })[0].summary.passes).toBe(false);
  });
});

describe('paaltabel: scherm', () => {
  const setup = (input: LateralInput) => { const onChange = vi.fn(), onOpen = vi.fn(); render(<LateralTable input={input} ctx={ctx} onChange={onChange} onOpen={onOpen} focus={null} onFocus={vi.fn()} />); return { onChange, onOpen }; };
  it('toont per paal de resultaten en het aantal dat voldoet', () => {
    setup(table([{ id: 'a', name: 'Kade A', headForceKn: 30, headMomentKnM: 20, nEdKn: 0 }, { id: 'b', name: 'Kade B', headForceKn: 400, headMomentKnM: 0, nEdKn: 0 }]));
    const rows = within(screen.getByRole('table', { name: 'Palen met kopbelasting en resultaten' })).getAllByRole('row').slice(2);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveClass('is-pass');
    expect(rows[0].querySelector('td.is-ok')).not.toBeNull();
    expect(rows[1].className).toMatch(/is-fail|is-error/);
    expect(screen.getByRole('status')).toHaveTextContent('1 van 2 voldoen');
  });
  it('voegt palen toe, kiest ze voor de uitdraai en opent het rekenblad van een paal', () => {
    const { onChange, onOpen } = setup(table([{ id: 'a', name: 'Kade A', headForceKn: 30, headMomentKnM: 20, nEdKn: 0 }]));
    fireEvent.click(screen.getByRole('button', { name: '+ Paal' }));
    expect(onChange.mock.lastCall![0].pileTable.rows).toHaveLength(2);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Kade A in de uitdraai' }));
    expect(onChange.mock.lastCall![0].pileTable.examples).toEqual(['a']);
    fireEvent.change(screen.getByLabelText('H Kade A [kN]'), { target: { value: '55' } });
    expect(onChange.mock.lastCall![0].pileTable.rows[0].headForceKn).toBe(55);
    fireEvent.click(screen.getByRole('button', { name: 'Rekenblad Kade A' }));
    expect(onChange.mock.lastCall![0]).toMatchObject({ headForceKn: 30, headMomentKnM: 20, pileTable: { rows: [{ id: 'a' }] } });
    expect(onOpen).toHaveBeenCalled();
  });
  it('zoekt de lichtste maat en neemt die over', () => {
    const { onChange } = setup(table([{ id: 'a', name: 'Kade A', headForceKn: 60, headMomentKnM: 0, nEdKn: 0 }], { maxDisplacementMm: 40 }));
    fireEvent.click(screen.getByRole('button', { name: 'Lichtste maat zoeken' }));
    fireEvent.click(screen.getByRole('button', { name: /overnemen$/ }));
    expect(onChange.mock.lastCall![0].pileTable.rows[0].diameterMm).toBe(350);
  });
});

describe('paaltabel: uitdraai', () => {
  it('werkt de gekozen palen volledig uit en sluit af met het overzicht', () => {
    const input = table([{ id: 'a', name: 'Kade A', headForceKn: 30, headMomentKnM: 20, nEdKn: 0 }, { id: 'b', name: 'Kade B', headForceKn: 60, headMomentKnM: 0, nEdKn: 0 }, { id: 'c', name: 'Kade C', headForceKn: 45, headMomentKnM: 0, nEdKn: 0 }], { examples: ['a', 'c'] });
    const text = new TextDecoder('latin1').decode(buildLateralReport(input, computeLateral(input), ctx));
    expect(text).toContain('Paal Kade A');
    expect(text).toContain('Paal Kade C');
    expect(text).not.toContain('Paal Kade B');
    expect(text).toContain('Overzicht palen');
    expect(text).toContain('Kade B');
    expect(text.split('1. Uitgangspunten').length - 1).toBe(2);
  });
});
