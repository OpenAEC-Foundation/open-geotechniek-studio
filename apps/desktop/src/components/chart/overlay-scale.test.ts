import { describe, expect, it } from 'vitest';
import type { Cpt } from '../../types/cpt';
import {
  SERIES_COLORS,
  buildSeries,
  computeOverlayScales,
  levelToY,
  levelWindow,
  niceCeil,
  overlayLayout,
  panelAt,
  pickSeries,
  robustPeak,
  seriesStyle,
  tickLabel,
  tickStep,
  valueAtLevel,
  valueToX,
  yToLevel,
} from './overlay-scale';

const cpt = (id: string, ground: number | undefined, points: Cpt['points']): Cpt => ({
  id,
  metadata: { source_file: `${id}.gef`, ground_level_nap: ground },
  points,
});

describe('kleur en lijnstijl per sondering', () => {
  it('geeft de eerste tien elk een eigen kleur met een doorgetrokken lijn', () => {
    const styles = Array.from({ length: 10 }, (_, i) => seriesStyle(i));
    expect(new Set(styles.map((s) => s.color)).size).toBe(10);
    expect(styles.every((s) => s.dash.length === 0)).toBe(true);
  });

  it('herhaalt daarna de kleuren met een andere lijnstijl per ronde', () => {
    expect(seriesStyle(10).color).toBe(SERIES_COLORS[0]);
    expect(seriesStyle(10).dash.length).toBeGreaterThan(0);
    expect(seriesStyle(20).color).toBe(SERIES_COLORS[0]);
    expect(seriesStyle(20).dash).not.toEqual(seriesStyle(10).dash);
    const keys = Array.from({ length: 40 }, (_, i) => `${seriesStyle(i).color}|${seriesStyle(i).dash.join(',')}`);
    expect(new Set(keys).size).toBe(40);
  });

  it('geeft een losse kopie van het streeppatroon', () => {
    seriesStyle(10).dash.push(99);
    expect(seriesStyle(10).dash).not.toContain(99);
  });
});

describe('reeksen op NAP of op diepte', () => {
  it('rekent diepte om naar NAP met het maaiveld', () => {
    const s = buildSeries(cpt('A', 1.5, [{ depth: 0, qc: 1, fs: 0.01 }, { depth: 10, qc: 12 }]));
    expect(s.hasNap).toBe(true);
    expect(s.levels).toEqual([1.5, -8.5]);
    expect(s.qc).toEqual([1, 12]);
    expect(s.fs).toEqual([0.01, null]);
  });

  it('tekent zonder NAP-maaiveld op diepte onder maaiveld', () => {
    const s = buildSeries(cpt('B', undefined, [{ depth: 2, qc: 3 }, { depth: -4, qc: 5 }]));
    expect(s.hasNap).toBe(false);
    expect(s.levels).toEqual([-2, -4]);
  });
});

describe('gezamenlijke schalen', () => {
  const a = buildSeries(cpt('A', 2, [{ depth: 0, qc: 1, fs: 0.004 }, { depth: 20, qc: 12, fs: 0.012 }]));
  const b = buildSeries(cpt('B', -1.2, [{ depth: 0, qc: 2, fs: 0.002 }, { depth: 25, qc: 8, fs: 0.02 }]));

  it('omvat alle sonderingen op één niveau-as', () => {
    const scales = computeOverlayScales([a, b]);
    expect(scales.levelTop).toBe(3);
    expect(scales.levelBottom).toBe(-27);
    expect(scales.anyNap).toBe(true);
  });

  it('laat de assen krimpen naar de meetwaarden', () => {
    const scales = computeOverlayScales([a, b]);
    expect(scales.qcMax).toBe(15);
    expect(scales.fsMax).toBe(0.02);
  });

  it('houdt de assen binnen de vaste grenzen', () => {
    const high = buildSeries(cpt('H', 0, [{ depth: 1, qc: 62, fs: 0.8 }]));
    const low = buildSeries(cpt('L', 0, [{ depth: 1, qc: 0.4, fs: 0.001 }]));
    expect(computeOverlayScales([high])).toMatchObject({ qcMax: 30, fsMax: 0.5 });
    expect(computeOverlayScales([low])).toMatchObject({ qcMax: 5, fsMax: 0.01 });
  });

  it('laat één uitschieter de as niet oprekken', () => {
    const points = Array.from({ length: 200 }, (_, i) => ({ depth: i / 10, qc: 8, fs: 0.04 }));
    points[100] = { depth: 10, qc: 29, fs: 0.3 };
    const spike = buildSeries(cpt('P', 0, points));
    expect(robustPeak([spike], 'qc')).toBe(8);
    expect(computeOverlayScales([spike])).toMatchObject({ qcMax: 10, fsMax: 0.05 });
  });

  it('heeft een bruikbaar bereik zonder zichtbare sonderingen', () => {
    expect(computeOverlayScales([])).toMatchObject({ levelTop: 0, levelBottom: -30, anyNap: false });
  });

  it('kiest de fijnste schaalverdeling die leesbaar blijft', () => {
    const qc = [10, 5, 2, 1, 0.5];
    const fs = [1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01, 0.005];
    expect(tickStep(30, qc)).toBe(5);
    expect(tickStep(15, qc)).toBe(2);
    expect(tickStep(5, qc)).toBe(0.5);
    expect(tickStep(0.3, fs)).toBe(0.05);
    expect(tickStep(0.05, fs)).toBe(0.005);
    expect(tickStep(500, qc)).toBe(10);
  });

  it('schrijft de schaalverdeling met precies genoeg decimalen', () => {
    expect([0, 5, 30].map((v) => tickLabel(v, 5))).toEqual(['0', '5', '30']);
    expect(tickLabel(2.5, 0.5)).toBe('2.5');
    expect(tickLabel(0.15, 0.05)).toBe('0.15');
    expect(tickLabel(0.015, 0.005)).toBe('0.015');
  });

  it('rondt naar boven af op een nette waarde', () => {
    expect([0.012, 1, 1.2, 2.4, 4, 7, 12].map(niceCeil)).toEqual([0.015, 1, 1.5, 3, 5, 10, 15]);
  });
});

describe('zoom en verschuiven', () => {
  const scales = { levelTop: 2, levelBottom: -28, qcMax: 30, fsMax: 0.05, anyNap: true };

  it('toont bij zoom 1 het hele bereik en zoomt in rond het midden', () => {
    expect(levelWindow(scales, 1, 0)).toEqual({ top: 2, bottom: -28 });
    expect(levelWindow(scales, 2, 0)).toEqual({ top: -5.5, bottom: -20.5 });
  });

  it('schuift het venster naar beneden bij een positieve verschuiving', () => {
    expect(levelWindow(scales, 2, 3)).toEqual({ top: -8.5, bottom: -23.5 });
  });

  it('begrenst de zoom', () => {
    expect(levelWindow(scales, 100, 0)).toEqual(levelWindow(scales, 8, 0));
    expect(levelWindow(scales, 0, 0)).toEqual(levelWindow(scales, 0.2, 0));
  });
});

describe('indeling en projectie', () => {
  const layout = overlayLayout(1000, 600);
  const win = { top: 2, bottom: -28 };

  it('legt een brede qc-grafiek en een brede fs-grafiek naast de niveau-as', () => {
    expect(layout.qc.l).toBe(layout.axisW);
    expect(layout.fs.l).toBeGreaterThan(layout.qc.l + layout.qc.w);
    expect(layout.qc.w).toBeGreaterThan(layout.fs.w);
    expect(layout.fs.l + layout.fs.w).toBeLessThanOrEqual(1000);
    expect(panelAt(layout.qc.l + 5, layout)).toBe('qc');
    expect(panelAt(layout.fs.l + 5, layout)).toBe('fs');
    expect(panelAt(10, layout)).toBeNull();
  });

  it('zet niveau om naar y en terug', () => {
    expect(levelToY(2, win, layout)).toBe(layout.plotT);
    expect(levelToY(-28, win, layout)).toBe(layout.plotB);
    expect(yToLevel(levelToY(-11.3, win, layout), win, layout)).toBeCloseTo(-11.3, 9);
  });

  it('houdt waarden boven de as op de rand', () => {
    expect(valueToX(0, layout.qc, 30)).toBe(layout.qc.l);
    expect(valueToX(45, layout.qc, 30)).toBe(layout.qc.l + layout.qc.w);
  });
});

describe('waarde op een niveau en lijn onder de muis', () => {
  const a = buildSeries(cpt('A', 0, [{ depth: 0, qc: 2, fs: 0.01 }, { depth: 10, qc: 12, fs: 0.03 }, { depth: 12 }, { depth: 14, qc: 20 }]));
  const b = buildSeries(cpt('B', 0, [{ depth: 0, qc: 20 }, { depth: 10, qc: 20 }]));

  it('interpoleert tussen twee meetpunten', () => {
    expect(valueAtLevel(a, 'qc', -5)).toBeCloseTo(7, 9);
    expect(valueAtLevel(a, 'fs', -2.5)).toBeCloseTo(0.015, 9);
  });

  it('geeft niets buiten de sondering of in een gat', () => {
    expect(valueAtLevel(a, 'qc', 1)).toBeNull();
    expect(valueAtLevel(a, 'qc', -20)).toBeNull();
    expect(valueAtLevel(a, 'qc', -11)).toBeNull();
  });

  it('kiest de lijn die het dichtst onder de muis ligt', () => {
    const toX = (v: number) => v * 10;
    const toY = (level: number) => -level * 10;
    expect(pickSeries([a, b], 'qc', 72, 50, toX, toY)).toBe('A');
    expect(pickSeries([a, b], 'qc', 198, 50, toX, toY)).toBe('B');
    expect(pickSeries([a, b], 'qc', 140, 50, toX, toY)).toBeNull();
    expect(pickSeries([a, b], 'fs', 198, 50, toX, toY)).toBeNull();
  });
});
