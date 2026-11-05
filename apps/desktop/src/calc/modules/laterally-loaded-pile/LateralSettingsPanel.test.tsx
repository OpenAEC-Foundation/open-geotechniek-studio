import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LateralSettingsPanel } from './LateralSettingsPanel';
import { LateralInputPanel } from './LateralInputPanel';
import { computeLateral, lateralExample } from './compute';

const result = computeLateral(lateralExample);
describe('instellingen horizontale paal', () => {
  it('rekent met een eigen beddingswaarde voor de grondsoort', () => {
    const onChange = vi.fn();
    render(<LateralSettingsPanel input={lateralExample} result={result} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('kh sand-medium laag [kN/m³]'), { target: { value: '30000' } });
    const next = onChange.mock.lastCall![0];
    expect(next.springOverrides).toEqual({ 'sand-medium': { low: 30000 } });
    const r = computeLateral(next);
    if (!r.ok || !result.ok) throw new Error('niet berekend');
    expect(r.resolvedLayers[1].khKnM3).toBe(30000);
    expect(r.maxDisplacementMm).toBeLessThan(result.maxDisplacementMm);
    expect(computeLateral({ ...lateralExample, springOverrides: { 'sand-medium': { low: -1 } } })).toMatchObject({ ok: false });
  });
  it('neemt pu-profielen over uit de lagen en geeft ze aan een laag bij het kiezen van de grondsoort', () => {
    const onChange = vi.fn();
    render(<LateralSettingsPanel input={lateralExample} result={result} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Overnemen uit de lagen' }));
    const withDefaults = onChange.mock.lastCall![0];
    expect(withDefaults.puDefaults['clay-soft']).toEqual(lateralExample.layers[0].ultimate);
    const change = vi.fn();
    render(<LateralInputPanel input={withDefaults} result={result} onChange={change} />);
    fireEvent.change(screen.getByLabelText('Bedding laag 2'), { target: { value: 'clay-soft' } });
    expect(change.mock.lastCall![0].layers[1]).toMatchObject({ springId: 'clay-soft', ultimate: lateralExample.layers[0].ultimate });
  });
});
