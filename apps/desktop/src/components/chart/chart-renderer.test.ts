import { describe, expect, it } from 'vitest';
import { computeColumnLayout, hitTest, hitTestSplitter, pickMarkerAt, renderChart } from './chart-renderer';
import { chartWidthScale } from './chart-zoom';
import type { Cpt } from '../../types/cpt';

const cpts: Cpt[] = ['A', 'B', 'C'].map((id) => ({ id, metadata: { source_file: `${id}.xml`, ground_level_nap: 2 }, points: [{ depth: 0, qc: 1 }, { depth: 20, qc: 25 }] }));

describe('weergave van verbrede sonderingen', () => {
  it('behoudt drie CPTs, kolomverhoudingen en interactiecoördinaten na vergroting', () => {
    const opts = { width: 1200 * chartWidthScale(2, true), height: 700, zoom: 2, panX: 0, panY: 0, scaleColumns: true, columnRatios: [1, 2, 1] };
    expect(computeColumnLayout(cpts, opts)).toEqual([{ left: 0, width: 600 }, { left: 600, width: 1200 }, { left: 1800, width: 600 }]);
    expect(hitTest(cpts, opts, 2100, 300)?.cptId).toBe('C');
    expect(pickMarkerAt(cpts, opts, 2100, 300)?.cptId).toBe('C');
    expect(hitTestSplitter(cpts, opts, 1800, 300)).toBe(1);
  });

  it('tekent bij gekoppelde schaal het volledige qc-bereik en bij gewone zoom het ingezoomde bereik', () => {
    const headers = (scaleColumns: boolean) => {
      const labels: string[] = [];
      const ctx = new Proxy({
        measureText: (text: string) => ({ width: text.length * 5 }),
        fillText: (text: string, x: number, y: number) => { if (y === 15 && x >= 50 && x < 555) labels.push(text); },
      }, { get: (target, key) => Reflect.get(target, key) ?? (() => {}) }) as unknown as CanvasRenderingContext2D;
      renderChart(ctx, [cpts[0]], { width: 1200, height: 700, zoom: 2, panX: 0, panY: 0, scaleColumns }, { qc: true, fs: false, rf: false, u2: false });
      return labels;
    };
    expect(headers(true)).toContain('30');
    expect(headers(false)).not.toContain('30');
    expect(headers(false)).toContain('10');
  });
});
