import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { computeLateral, lateralExample, type LateralInput } from './compute';
import { VariantsBar } from './VariantsPanel';
import { OptimizerDialog } from './OptimizerDialog';
import { laterallyLoadedPileModule as module } from './module';
import { designOf, newVariant } from './variants';

afterEach(cleanup);
function Host({ start, spy }: { start: LateralInput; spy: (i: LateralInput) => void }) {
  const [input, setInput] = useState(start);
  return <VariantsBar input={input} onChange={(next) => { spy(next); setInput(next); }} />;
}

describe('varianten in de interface', () => {
  it('zet de huidige invoer als variant, kopieert, wijzigt één veld en kiest een variant', () => {
    const spy = vi.fn();
    render(<Host start={structuredClone(lateralExample)} spy={spy} />);
    fireEvent.click(screen.getByRole('button', { name: 'Varianten' }));
    const table = () => screen.getByRole('table', { name: 'Vergelijking van varianten' });
    fireEvent.click(within(table()).getByRole('button', { name: '+ Als variant' }));
    expect(spy.mock.lastCall![0].variants.items).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Kopieer Variant 1' }));
    expect(spy.mock.lastCall![0].variants.items).toHaveLength(2);
    // De kopie wordt een stalen buis.
    fireEvent.change(screen.getByLabelText('Paaltype Variant 1 (kopie)'), { target: { value: 'steel-tube' } });
    const copy = spy.mock.lastCall![0].variants.items[1];
    expect(copy.design.section.kind).toBe('steel-tube');
    expect(copy.design.pileSystemId).toBe('steel-tube-closed');
    // Per variant gewicht, lengte, verplaatsing, moment, u.c. en toets.
    const rows = table().querySelectorAll('tbody tr');
    expect(rows).toHaveLength(3);
    expect(rows[2].textContent).toMatch(/voldoet/);
    // Kiezen zet de variant als invoer; de varianten blijven bewaard.
    fireEvent.click(within(rows[2] as HTMLElement).getByRole('button', { name: 'Kiezen' }));
    const chosen = spy.mock.lastCall![0] as LateralInput;
    expect(chosen.section.kind).toBe('steel-tube');
    expect(chosen.variants!.items).toHaveLength(2);
    expect(chosen.headForceKn).toBe(lateralExample.headForceKn);
    fireEvent.click(screen.getByRole('checkbox', { name: /Blad "Varianten" in de uitdraai/ }));
    expect(spy.mock.lastCall![0].variants.inReport).toBe(true);
  });

  it('zet het blad Varianten in het PDF-rapport', () => {
    const base = { ...structuredClone(lateralExample), headNap: -1 };
    const v = newVariant(undefined, designOf(base));
    const input: LateralInput = { ...base, variants: { items: [v], inReport: true } };
    const r = computeLateral(input); if (!r.ok) throw new Error(r.error);
    const meta = { title: 'Proef', client: '', location: '', project_number: '7', author: '', date: '2026-11-06' };
    const text = new TextDecoder('latin1').decode(module.buildReport!(input, r, { cpts: new Map(), activeCptId: null, projectMeta: meta }));
    expect(text).toContain('Varianten');
    expect(text).toContain('kg/paal');
    const without = new TextDecoder('latin1').decode(module.buildReport!({ ...input, variants: { items: [v] } }, r, { cpts: new Map(), activeCptId: null, projectMeta: meta }));
    expect(without).not.toContain('kg/paal');
  });

  it('optimaliseert in stukjes zonder worker en zet de beste als varianten', async () => {
    const spy = vi.fn();
    const base: LateralInput = { ...structuredClone(lateralExample), pileSystemId: 'steel-tube-closed', springWidthM: .3239,
      section: { ...lateralExample.section, kind: 'steel-tube', diameterMm: 323.9, wallMm: 10, tubeFydMpa: 355 } };
    render(<OptimizerDialog input={base} onChange={spy} onClose={() => {}} forceMainThread />);
    expect(screen.getByText(/Zoekruimte: 84 varianten/)).toBeInTheDocument(); // 12 diameters × 7 wanddikten
    // Kleine zoekruimte: drie diameters.
    for (const d of ['168,3', '193,7', '219,1', '244,5', '355,6', '406,4', '457', '508', '559', '610']) fireEvent.click(screen.getByRole('button', { name: d }));
    expect(screen.getByText(/Zoekruimte: 14 varianten/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Populatie'), { target: { value: '6' } });
    fireEvent.blur(screen.getByLabelText('Populatie'));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Start' })); });
    await waitFor(() => expect(spy).toHaveBeenCalled(), { timeout: 60000 });
    const out = spy.mock.lastCall![0] as LateralInput;
    expect(out.variants!.optimizer!.evaluated).toBeGreaterThan(0);
    expect(out.variants!.items.every((v) => v.origin === 'optimizer')).toBe(true);
    expect(out.variants!.items.length).toBeGreaterThan(0);
    expect(out.variants!.items.length).toBeLessThanOrEqual(10);
    expect(screen.getByText(/varianten doorgerekend/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Beste massa per generatie' })).toBeInTheDocument();
  }, 120000);
});
