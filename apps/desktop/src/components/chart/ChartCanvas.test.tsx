import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { createInstance } from 'i18next';
import ChartCanvas from './ChartCanvas';
import StartTab from '../ribbon/StartTab';
import { useChartZoomStore } from '../../store/useChartZoomStore';

const i18n = createInstance();
void i18n.use(initReactI18next).init({ lng: 'nl', resources: {}, initImmediate: false });

beforeEach(() => {
  // jsdom heeft geen tekencontext of layout; de zoom en DOM-geometrie blijven echt.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  useChartZoomStore.getState().setScaleColumns(false);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('canvaszoom en hoofdblad', () => {
  it('verbreedt de canvas via het vinkje en herstelt de volledige breedte bij Passend', () => {
    const { container } = render(<I18nextProvider i18n={i18n}><StartTab /><ChartCanvas /></I18nextProvider>);
    const canvas = container.querySelector('canvas')!;
    const surface = canvas.parentElement!;
    const viewport = surface.parentElement!;
    act(() => window.dispatchEvent(new CustomEvent('ogs:zoom-in')));
    expect(surface.style.width).toBe('100%');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Sonderingen meeschalen' }));
    expect(surface.style.width).toBe('125%');
    expect(viewport.style.overflowX).toBe('auto');
    fireEvent.wheel(canvas, { deltaY: -1 });
    expect(surface.style.width).toBe('137.5%');
    viewport.scrollLeft = 125;
    act(() => window.dispatchEvent(new CustomEvent('ogs:zoom-fit')));
    expect(surface.style.width).toBe('100%');
    expect(viewport.scrollLeft).toBe(0);
    act(() => window.dispatchEvent(new CustomEvent('ogs:zoom-out')));
    expect(surface.style.width).toBe('100%');
    act(() => window.dispatchEvent(new CustomEvent('ogs:zoom-in')));
    act(() => window.dispatchEvent(new CustomEvent('ogs:zoom-in')));
    expect(surface.style.width).toBe('125%');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Sonderingen meeschalen' }));
    expect(surface.style.width).toBe('100%');
  });
});
