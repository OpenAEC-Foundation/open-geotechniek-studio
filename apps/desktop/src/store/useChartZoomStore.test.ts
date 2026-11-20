import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => { vi.resetModules(); localStorage.clear(); });

describe('bewaarde sonderingszoomvoorkeur', () => {
  it('laadt de voorkeur bij een nieuwe sessie', async () => {
    localStorage.setItem('ogs:chart.scaleColumns', 'true');
    const { useChartZoomStore, loadChartZoomPreference } = await import('./useChartZoomStore');
    await loadChartZoomPreference();
    expect(useChartZoomStore.getState().scaleColumns).toBe(true);
  });
  it('overschrijft een zojuist uitgezet vinkje niet met een late opgeslagen voorkeur', async () => {
    localStorage.setItem('ogs:chart.scaleColumns', 'true');
    const { useChartZoomStore, loadChartZoomPreference } = await import('./useChartZoomStore');
    const loaded = loadChartZoomPreference();
    useChartZoomStore.getState().setScaleColumns(false);
    await loaded;
    expect(useChartZoomStore.getState().scaleColumns).toBe(false);
    expect(localStorage.getItem('ogs:chart.scaleColumns')).toBe('false');
  });
});

describe('bewaarde keuze naast elkaar of over elkaar', () => {
  it('laadt de keuze bij een nieuwe sessie', async () => {
    localStorage.setItem('ogs:chart.overlay', 'true');
    const { useChartZoomStore, loadChartZoomPreference } = await import('./useChartZoomStore');
    expect(useChartZoomStore.getState().overlay).toBe(false);
    await loadChartZoomPreference();
    expect(useChartZoomStore.getState().overlay).toBe(true);
    expect(useChartZoomStore.getState().scaleColumns).toBe(false);
  });
  it('bewaart een wijziging en laat een late voorkeur die niet overschrijven', async () => {
    localStorage.setItem('ogs:chart.overlay', 'true');
    const { useChartZoomStore, loadChartZoomPreference } = await import('./useChartZoomStore');
    const loaded = loadChartZoomPreference();
    useChartZoomStore.getState().setOverlay(false);
    await loaded;
    expect(useChartZoomStore.getState().overlay).toBe(false);
    expect(localStorage.getItem('ogs:chart.overlay')).toBe('false');
  });
});
