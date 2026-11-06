import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Cpt } from '../../../types/cpt';
import type { CalculationInstance, ProjectContext } from '../../framework/types';
import { pileBearingCapacityModule } from '../pile-bearing-capacity/module';
import { lateralExample } from '../laterally-loaded-pile/compute';
import { adviceSummary, bearingLayerTop } from './analysis';
import { situationLayout } from './situation';
import { buildAdviceReport } from './report';
import { foundationAdviceModule } from './module';
import { DEFAULT_ADVICE } from './types';

const cpt = (id: string, x: number, y: number, sandAt: number): Cpt => ({ id, metadata: { source_file: `${id}.gef`, ground_level_nap: 0.5 }, position: { x_rd: x, y_rd: y },
  points: Array.from({ length: 251 }, (_, j) => { const depth = j * 0.1; return { depth, depth_nap: 0.5 - depth, qc: depth < sandAt ? 1 : 15, fs: depth < sandAt ? 0.04 : 0.08, rf: depth < sandAt ? 4 : 0.6 }; }) });
const cpts = new Map([['S01', cpt('S01', 100000, 400000, 12)], ['S02', cpt('S02', 100030, 400020, 13.5)]]);
const meta = { title: 'Bedrijfshal', client: 'Opdrachtgever B.V.', location: 'Dordrecht', project_number: '2321', author: 'Adviseur', date: '2026-11-06' };
const base: ProjectContext = { cpts, activeCptId: 'S01', projectMeta: meta };
const pile = pileBearingCapacityModule.defaultInput(base);
const calcs: CalculationInstance[] = [
  { id: 'v1', moduleId: 'pile-bearing-capacity', name: 'Kolommen', input: { ...(pile as object), nEd: 300 }, createdAt: '', updatedAt: '' },
  { id: 'h1', moduleId: 'laterally-loaded-pile', name: 'Kade', input: lateralExample, createdAt: '', updatedAt: '' },
];
const ctx: ProjectContext = { ...base, calculations: calcs };

describe('funderingsadvies: analyse', () => {
  it('vindt de draagkrachtige laag als het eerste traject met qc boven de grens over de opgegeven dikte', () => {
    expect(bearingLayerTop(cpts.get('S01')!, 10, 1)).toBeCloseTo(12, 6);
    const s = adviceSummary(DEFAULT_ADVICE, ctx);
    expect(s.cpts.map((c) => c.bearingTopNap)).toEqual([0.5 - 12, 0.5 - 13.5]);
    expect(s.bearing).toMatchObject({ highest: -11.5, lowest: -13 });
    expect(s.vertical).toHaveLength(1);
    expect(s.lateral[0].rows.length).toBeGreaterThan(0);
  });
  it('neemt alleen de gekozen sonderingen en berekeningen op', () => {
    const s = adviceSummary({ ...DEFAULT_ADVICE, cptIds: ['S02'], calcIds: ['h1'] }, ctx);
    expect(s.cpts.map((c) => c.id)).toEqual(['S02']);
    expect(s.vertical).toHaveLength(0);
    expect(s.lateral).toHaveLength(1);
  });
  it('tekent de situatie op schaal met alle sonderingen binnen het kader', () => {
    const L = situationLayout(adviceSummary(DEFAULT_ADVICE, ctx).cpts, 400);
    expect(L.points).toHaveLength(2);
    for (const p of L.points) { expect(p.px).toBeGreaterThan(0); expect(p.px).toBeLessThan(400); expect(p.py).toBeGreaterThan(0); expect(p.py).toBeLessThan(400); }
    // Op schaal: 30 m in X is evenveel tekening als 30 m in Y.
    const [a, b] = L.points;
    expect((b.px - a.px) / 30).toBeCloseTo((a.py - b.py) / 20, 6);
  });
});

describe('funderingsadvies: rapport', () => {
  it('maakt een PDF met voorblad, inhoudsopgave, hoofdstukken en bijlagen', () => {
    const text = new TextDecoder('latin1').decode(buildAdviceReport({ ...DEFAULT_ADVICE, reference: '2321-FA-01', structure: 'Bedrijfshal van staal' }, ctx));
    for (const t of ['Funderingsadvies', 'Inhoud', '1  Inleiding', '3  Grondonderzoek', 'Situatietekening', 'Bodemopbouw', 'palen op druk', 'Horizontaal belaste palen', 'Conclusies en aanbevelingen', 'Bijlage A: sonderingen', 'Bijlage B: berekeningen', '2321-FA-01', 'Prefab'].slice(0, 12))
      expect(text).toContain(t);
    expect(text).toContain('draagkrachtige laag');
  });
  it('laat de bijlagen weg als die uit staan', () => {
    const text = new TextDecoder('latin1').decode(buildAdviceReport({ ...DEFAULT_ADVICE, appendixCpts: false, appendixCalcs: false }, ctx));
    expect(text).not.toContain('Bijlage A');
    expect(text).not.toContain('Bijlage B');
  });
});

describe('funderingsadvies: scherm', () => {
  it('toont de situatie en de draagkrachtige laag per sondering', () => {
    const s = foundationAdviceModule.compute(DEFAULT_ADVICE, ctx);
    render(<><foundationAdviceModule.VisualPanel input={DEFAULT_ADVICE} result={s} /><foundationAdviceModule.ResultPanel input={DEFAULT_ADVICE} result={s} /></>);
    expect(screen.getByRole('img', { name: 'Situatietekening met sonderingen' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Draagkrachtige laag per sondering' })).toHaveTextContent('-11,50');
  });
});
