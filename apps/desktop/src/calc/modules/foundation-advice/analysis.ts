// Analyse voor het funderingsadvies: per sondering de opbouw en de
// draagkrachtige laag, en per paalberekening de kernuitkomsten. Alles wordt
// uit het project afgeleid; het advies rekent zelf niets nieuws uit.
import type { Cpt, Layer } from '../../../types/cpt';
import type { CalculationInstance, ProjectContext } from '../../framework/types';
import { analyzeLayers } from '../../../utils/layerAnalysis';
import { computePile } from '../pile-bearing-capacity/compute';
import type { PileInput, PileResult } from '../pile-bearing-capacity/types';
import { resolvePileType } from '../pile-bearing-capacity/catalog';
import { getStandard } from '../pile-bearing-capacity/standards';
import { chooseLevels, computeCapacityMatrix, defaultCapacityConfig, type SizeChoice } from '../pile-bearing-capacity/capacity-table';
import type { LateralInput } from '../laterally-loaded-pile/compute';
import { computePileTable } from '../laterally-loaded-pile/pile-table';
import { sectionText } from '../laterally-loaded-pile/LateralSheet';
import type { AdviceInput } from './types';

export interface CptSummary {
  id: string; x?: number; y?: number; groundNap: number | null; endNap: number | null; endDepthM: number;
  layers: Layer[];
  /** Bovenkant draagkrachtige laag (indicatief), m NAP; null = niet gevonden. */
  bearingTopNap: number | null;
  maxQc: number;
}

/** Eerste diepte waarop qc over minstens `minThicknessM` boven `qcMpa` blijft. */
export function bearingLayerTop(cpt: Cpt, qcMpa: number, minThicknessM: number): number | null {
  const pts = cpt.points.filter((p) => Number.isFinite(p.depth) && Number.isFinite(p.qc)).sort((a, b) => a.depth - b.depth);
  let start: number | null = null;
  for (const p of pts) {
    if ((p.qc as number) >= qcMpa) {
      if (start === null) start = p.depth;
      if (p.depth - start >= minThicknessM) return start;
    } else start = null;
  }
  return null;
}

export function summarizeCpt(cpt: Cpt, input: AdviceInput): CptSummary {
  const ground = cpt.metadata.ground_level_nap ?? cpt.position?.z_nap ?? null;
  const depths = cpt.points.map((p) => p.depth).filter(Number.isFinite);
  const endDepthM = depths.length ? Math.max(...depths) : 0;
  let layers: Layer[] = [];
  try { layers = analyzeLayers(cpt).layers; } catch { layers = []; }
  const top = bearingLayerTop(cpt, input.bearingQcMpa, input.bearingMinThicknessM);
  return {
    id: cpt.id, x: cpt.position?.x_rd, y: cpt.position?.y_rd,
    groundNap: ground, endNap: ground === null ? null : ground - endDepthM, endDepthM, layers,
    bearingTopNap: top === null || ground === null ? null : ground - top,
    maxQc: Math.max(0, ...cpt.points.map((p) => p.qc ?? 0)),
  };
}

export interface VerticalSummary {
  id: string; name: string; standard: string; pileType: string; material: string; sizeMm: number; isCircular: boolean;
  cptId: string | null; topNap: number; toeNap: number; nEd: number;
  ok: boolean; error?: string; rcNetD: number; fnkD: number; uc: number; warnings: string[];
  extension?: string;
  choices: SizeChoice[]; target?: { minKn: number; maxKn: number }; tableCpts: string[];
}
export interface LateralSummaryRow { name: string; count: number; h: number; m: number; n: number; lengthM: number; sizeMm: number; ok: boolean; uc: number | null; yHeadMm: number; mMax: number; passes: boolean }
export interface LateralSummary { id: string; name: string; section: string; headNap: number; maxDisplacementMm?: number; rows: LateralSummaryRow[] }

export function summarizeCalculations(calcs: CalculationInstance[], ctx: ProjectContext, include: string[] | undefined) {
  const chosen = calcs.filter((c) => !include || include.includes(c.id));
  const vertical: VerticalSummary[] = [], lateral: LateralSummary[] = [];
  for (const c of chosen) {
    if (c.moduleId === 'pile-bearing-capacity') {
      const input = c.input as PileInput;
      const r: PileResult = computePile(input, input.cptId ? ctx.cpts.get(input.cptId) ?? null : null), type = resolvePileType(input);
      let choices: SizeChoice[] = [], target, tableCpts: string[] = [];
      if (input.capacityTable) {
        const config = defaultCapacityConfig(input, [...ctx.cpts.keys()]);
        try { choices = chooseLevels(computeCapacityMatrix(input, ctx.cpts, config)); target = config.targetKn; tableCpts = config.cptIds; } catch { choices = []; }
      }
      const ext = input.concreteExtension;
      vertical.push({
        id: c.id, name: c.name, standard: getStandard(input.standard)?.label ?? 'bestaand projectmodel',
        pileType: type?.name ?? input.pileTypeId, material: type?.material ?? 'steel', sizeMm: input.diameterMm, isCircular: type?.isCircular ?? true,
        cptId: input.cptId, topNap: input.pileTopNap, toeNap: input.pileToeNap, nEd: input.nEd,
        ok: r.ok, error: r.error, rcNetD: r.summary.rcNetD, fnkD: r.negKleef.fnkD, uc: r.summary.unityCheck, warnings: r.warnings,
        extension: ext ? `betonopzetter ${ext.isCircular ? 'Ø' : ''}${ext.sizeMm}${ext.isCircular ? '' : `×${ext.sizeMm}`} mm tot de las op NAP ${ext.jointNap.toFixed(2)} m` : undefined,
        choices, target, tableCpts,
      });
    } else if (c.moduleId === 'laterally-loaded-pile') {
      const input = c.input as LateralInput;
      const rows = computePileTable(input).map(({ row, input: ri, summary: s }) => ({
        name: row.name, count: row.count ?? 1, h: row.headForceKn, m: row.headMomentKnM, n: row.nEdKn, lengthM: ri.lengthM, sizeMm: ri.section.diameterMm,
        ok: s.ok, uc: s.uc, yHeadMm: s.yHeadMm, mMax: s.mMaxKnM, passes: s.passes,
      }));
      lateral.push({ id: c.id, name: c.name, section: sectionText(input.section), headNap: input.headNap ?? 0, maxDisplacementMm: input.pileTable?.maxDisplacementMm, rows });
    }
  }
  return { vertical, lateral };
}

export function adviceSummary(input: AdviceInput, ctx: ProjectContext) {
  const cpts = [...ctx.cpts.values()].filter((c) => !input.cptIds || input.cptIds.includes(c.id)).map((c) => summarizeCpt(c, input));
  const tops = cpts.map((c) => c.bearingTopNap).filter((v): v is number => v !== null);
  const calcs = summarizeCalculations((ctx.calculations ?? []).filter((c) => c.moduleId !== 'foundation-advice'), ctx, input.calcIds);
  return {
    cpts, ...calcs,
    bearing: tops.length ? { highest: Math.max(...tops), lowest: Math.min(...tops), mean: tops.reduce((a, b) => a + b, 0) / tops.length, found: tops.length } : null,
  };
}
export type AdviceSummary = ReturnType<typeof adviceSummary>;
