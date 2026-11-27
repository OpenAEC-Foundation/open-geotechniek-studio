import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { createInstance } from 'i18next';
import OverlayChart from './OverlayChart';
import ChartView from '../panels/ChartView';
import StartTab from '../ribbon/StartTab';
import { useCptStore } from '../../store/useCptStore';
import { useChartZoomStore } from '../../store/useChartZoomStore';
import type { Cpt } from '../../types/cpt';

const i18n = createInstance();
void i18n.use(initReactI18next).init({ lng: 'nl', resources: {}, initImmediate: false });

const cpt = (id: string, ground?: number): Cpt => ({
  id,
  metadata: { source_file: `${id}.gef`, ground_level_nap: ground },
  points: [{ depth: 0, qc: 1, fs: 0.01 }, { depth: 20, qc: 25, fs: 0.03 }],
});
const initial = useCptStore.getState();
const setActive = vi.fn();

beforeEach(() => {
  // jsdom heeft geen tekencontext; legenda, melding en schakelaar blijven echt.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  setActive.mockClear();
  useCptStore.setState({
    cpts: new Map([cpt('S01', 1.2), cpt('S02', 0.8), cpt('S03'), cpt('S04', 1)].map((c) => [c.id, c])),
    hiddenCptIds: new Set(['S04']),
    activeCptId: 'S02',
    setActive,
  });
  useChartZoomStore.getState().setOverlay(false);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); useCptStore.setState(initial, true); });

const wrap = (ui: React.ReactNode) => render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);

describe('sonderingen over elkaar', () => {
  it('toont de zichtbare sonderingen in de legenda en markeert de actieve', () => {
    wrap(<OverlayChart />);
    const rows = screen.getAllByRole('button');
    expect(rows.map((r) => r.getAttribute('title'))).toEqual(['S01', 'S02', 'S03']);
    expect(rows.map((r) => r.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
  });

  it('maakt een sondering actief met een klik op de naam', () => {
    wrap(<OverlayChart />);
    fireEvent.click(screen.getByRole('button', { name: /S01/ }));
    expect(setActive).toHaveBeenCalledWith('S01');
  });

  it('meldt welke sonderingen niet op NAP staan', () => {
    wrap(<OverlayChart />);
    expect(screen.getByRole('note').textContent).toMatch(/niet op NAP: S03$/);
  });

  it('wisselt via het lint tussen naast elkaar en over elkaar', () => {
    const { container } = wrap(<><StartTab /><ChartView /></>);
    expect(container.querySelector('.overlay-chart')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Over elkaar' }));
    expect(container.querySelector('.overlay-chart')).not.toBeNull();
    expect(useChartZoomStore.getState().overlay).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Naast elkaar' }));
    expect(container.querySelector('.overlay-chart')).toBeNull();
  });
});
