// Paaltabel horizontale paal: veel palen (of paalgroepen) met dezelfde grond
// en doorsnede, elk met een eigen kopbelasting en eventueel een eigen lengte
// of maat. Per rij de kernuitkomsten, en op verzoek de lichtste standaardmaat
// die voldoet.
import { computeLateral, type LateralInput, type LateralResult } from './compute';
import type { SectionKind } from './section';
import { mobilisation } from './SpringField';
import { PREFAB_SQUARE, STEEL_TUBE_OD } from '../pile-bearing-capacity/standard-sizes';
import { ct } from '../../i18n';

export interface LateralRow {
  id: string; name: string;
  /** Aantal palen met deze belasting (alleen voor het overzicht). */
  count?: number;
  headForceKn: number; headMomentKnM: number; nEdKn: number;
  /** Ontbrekend: lengte en maat van de basisinvoer. */
  lengthM?: number; diameterMm?: number;
}
export interface LateralTableConfig {
  rows: LateralRow[];
  /** Grens voor de kopverplaatsing [mm]; ontbrekend = geen grens. */
  maxDisplacementMm?: number;
  /** Rijen die volledig in het rapport komen. */
  examples?: string[];
}

/** Ronde betonpalen [mm]; vierkant en buizen komen uit de gedeelde reeksen. */
export const ROUND_CONCRETE = [300, 350, 400, 450, 500, 550, 600];
export function sizeSeries(kind: SectionKind): number[] {
  return kind === 'concrete-square' ? PREFAB_SQUARE : kind === 'concrete-round' ? ROUND_CONCRETE : STEEL_TUBE_OD;
}

/** Andere paallengte: lagen gaan mee, de onderste laag eindigt op de punt. */
export function withLength(input: LateralInput, L: number): LateralInput {
  if (!(L > 0) || L === input.lengthM) return input;
  const last = Math.max(...input.layers.map((l) => l.bottomM));
  const layers = input.layers.filter((l) => l.topM < L - 1e-9)
    .map((l) => ({ ...l, bottomM: Math.abs(l.bottomM - last) < 1e-9 ? L : Math.min(l.bottomM, L) }));
  return { ...input, lengthM: Math.round(L * 1000) / 1000, layers };
}

/** Invoer van één rij: de basisinvoer met de belasting, lengte en maat van de rij. */
export function rowInput(base: LateralInput, row: LateralRow): LateralInput {
  const { pileTable: _table, ...rest } = base;
  const sized = row.diameterMm ? { ...rest, section: { ...rest.section, diameterMm: row.diameterMm } } : rest;
  return withLength({ ...sized, headForceKn: row.headForceKn, headMomentKnM: row.headMomentKnM, nEdKn: row.nEdKn }, row.lengthM ?? base.lengthM);
}

export interface RowSummary {
  ok: boolean; error?: string;
  yHeadMm: number; mMaxKnM: number; mNap: number; vMaxKn: number; mobMax: number | null; uc: number | null;
  /** Voldoet aan u.c. ≤ 1 en de verplaatsingsgrens. */
  passes: boolean;
}
export function summarize(input: LateralInput, r: LateralResult, maxY?: number): RowSummary {
  if (!r.ok) return { ok: false, error: r.error, yHeadMm: NaN, mMaxKnM: NaN, mNap: NaN, vMaxKn: NaN, mobMax: null, uc: null, passes: false };
  const s = r.beam.samples;
  const top = s.reduce((a, p) => Math.abs(p.momentKnM) > Math.abs(a.momentKnM) ? p : a, s[0]);
  const mobs = r.springs.map(mobilisation).filter((m): m is number => m !== null);
  const yHeadMm = r.beam.nodes[0].yM * 1000;
  return {
    ok: true, yHeadMm, mMaxKnM: Math.abs(top.momentKnM), mNap: (input.headNap ?? 0) - top.zM,
    vMaxKn: Math.max(...s.map((p) => Math.abs(p.shearKn))), mobMax: mobs.length ? Math.max(...mobs) : null,
    uc: r.sectionUtilization,
    passes: r.sectionUtilization !== null && r.sectionUtilization <= 1 && (maxY === undefined || Math.abs(yHeadMm) <= maxY),
  };
}

export function defaultRows(base: LateralInput): LateralRow[] {
  return [{ id: 'p1', name: ct('calcLateral', 'table.pileName', 'Paal {{n}}', { n: 1 }), count: 1, headForceKn: base.headForceKn, headMomentKnM: base.headMomentKnM, nEdKn: base.nEdKn }];
}

export function computePileTable(base: LateralInput) {
  const table = base.pileTable, rows = table?.rows?.length ? table.rows : defaultRows(base);
  return rows.map((row) => { const input = rowInput(base, row); return { row, input, summary: summarize(input, computeLateral(input), table?.maxDisplacementMm) }; });
}

/** Lichtste maat uit de reeks die voldoet; null als geen maat voldoet. */
export function lightestSize(base: LateralInput, row: LateralRow): { sizeMm: number; summary: RowSummary } | null {
  for (const sizeMm of sizeSeries(base.section.kind)) {
    const input = rowInput(base, { ...row, diameterMm: sizeMm });
    const summary = summarize(input, computeLateral(input), base.pileTable?.maxDisplacementMm);
    if (summary.passes) return { sizeMm, summary };
  }
  return null;
}
