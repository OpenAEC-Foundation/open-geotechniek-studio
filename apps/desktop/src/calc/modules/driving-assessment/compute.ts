// Beoordeling kalendering: de verwachte kalender uit een sondering, naast de
// getelde kalender.
//
// Per tocht volgt het verwachte aantal slagen uit de conusweerstand op
// paalpuntniveau, de paalmaat en de slagenergie van het blok:
//
//   N = ⌈ tocht · D² · qc / E_blok ⌉
//
// met de tocht in mm, D in m, qc in MPa en E_blok = m·g·h in kNm. Dit is
// een empirische vuistregel uit de praktijk (de arbeid om het vlak D² over
// de tocht tegen qc in te drukken, gedeeld door de energie per slag), geen
// normformule en geen draagvermogensberekening. Een afwijking tot ongeveer
// 50 % tussen verwacht en geteld is gewoon; de module is alleen een
// controle of de kalender past bij de sondering.
//
// Voor een rechthoekige paal geldt D = √(a·b). qc is het gemiddelde van de
// sondering over de tocht (van de vorige diepte tot de diepte van de tocht).
import type { Cpt } from "../../../types/cpt";
import type { ProjectContext } from "../../framework/types";
import { ct } from "../../i18n";

export const G = 9.81;
export type PileShape = "square" | "round" | "rect";

export interface DrivingRow { /** Diepte paalpunt aan het eind van de tocht [m − maaiveld]. */ depthM: number; /** Getelde slagen in deze tocht. */ blows: number }

export interface DrivingInput {
  cptId: string | null;
  ramMassKg: number;
  dropHeightM: number;
  shape: PileShape;
  /** Zijde of diameter [mm]. */
  sizeMm: number;
  /** Tweede zijde van een rechthoekige paal [mm]. */
  sizeBMm: number;
  /** Lengte van een tocht [mm]. */
  tochtMm: number;
  /** Traject waarover de verwachte kalender wordt getoond [m − maaiveld]. */
  fromM: number;
  toM: number;
  /** Getelde kalender; mag leeg zijn. */
  rows: DrivingRow[];
  /** Toegestane afwijking tussen geteld en verwacht [%]. */
  tolerancePct: number;
}

export interface Tocht { depthM: number; qcMpa: number | null; expected: number | null }
export interface Comparison extends Tocht { blows: number; /** (geteld − verwacht) / verwacht. */ deviation: number | null; within: boolean | null }

export interface DrivingResult {
  ok: boolean;
  /** Invoer ontbreekt nog (geen sondering): geen fout, wel geen uitkomst. */
  pending?: boolean;
  error?: string;
  warnings: string[];
  energyKnm: number;
  dEqMm: number;
  /** Verwachte kalender over het traject. */
  profile: Tocht[];
  /** Getelde tochten met hun verwachting. */
  comparisons: Comparison[];
  within: number;
  outside: number;
  /** Gemiddelde afwijking over de vergeleken tochten. */
  meanDeviation: number | null;
  /** Laatste getelde tocht (slotkalender), anders de laatste van het traject. */
  final: Comparison | Tocht | null;
}

const m = (key: string, nl: string, vars?: Record<string, unknown>) => ct("calcDriving", key, nl, vars);

export function equivalentDiameterMm(input: Pick<DrivingInput, "shape" | "sizeMm" | "sizeBMm">): number {
  return input.shape === "rect" ? Math.sqrt(Math.max(0, input.sizeMm) * Math.max(0, input.sizeBMm)) : input.sizeMm;
}

/** Verwachte slagen per tocht, naar boven afgerond zoals in het rekenblad. */
export function expectedBlows(qcMpa: number, dM: number, tochtMm: number, energyKnm: number): number {
  return Math.max(1, Math.ceil((tochtMm * dM * dM * qcMpa) / energyKnm - 1e-9));
}

/** Gemiddelde conusweerstand over (top, bottom] in m − maaiveld; null zonder meetpunten. */
export function meanQc(cpt: Cpt, top: number, bottom: number): number | null {
  let sum = 0, n = 0;
  for (const p of cpt.points) {
    if (p.qc === undefined || !Number.isFinite(p.qc) || !Number.isFinite(p.depth)) continue;
    if (p.depth > top + 1e-9 && p.depth <= bottom + 1e-9) { sum += Math.max(0, p.qc); n++; }
  }
  return n ? sum / n : null;
}

const EMPTY: DrivingResult = { ok: false, warnings: [], energyKnm: 0, dEqMm: 0, profile: [], comparisons: [], within: 0, outside: 0, meanDeviation: null, final: null };

export function computeDriving(input: DrivingInput, ctx: Pick<ProjectContext, "cpts">): DrivingResult {
  const fail = (error: string, pending = false): DrivingResult => ({ ...EMPTY, error, pending });
  const pos = (v: number) => Number.isFinite(v) && v > 0;
  const cpt = input.cptId ? ctx.cpts.get(input.cptId) : undefined;
  if (!cpt) return fail(m("errors.noCpt", "Kies een sondering; de verwachte kalender volgt uit de conusweerstand."), true);
  if (!pos(input.ramMassKg) || !pos(input.dropHeightM)) return fail(m("errors.hammer", "Vul de massa en de valhoogte van het heiblok in."));
  const dEqMm = equivalentDiameterMm(input);
  if (!pos(dEqMm)) return fail(m("errors.pile", "Vul de maat van de paal in."));
  if (!pos(input.tochtMm)) return fail(m("errors.tocht", "De tochtlengte moet groter dan 0 zijn."));
  if (!(input.tolerancePct > 0)) return fail(m("errors.tolerance", "De toegestane afwijking moet groter dan 0 zijn."));
  if (!Number.isFinite(input.fromM) || !Number.isFinite(input.toM) || input.toM <= input.fromM) return fail(m("errors.range", "Het traject loopt van een kleinere naar een grotere diepte."));
  const rows = input.rows.filter((r) => Number.isFinite(r.depthM) && Number.isFinite(r.blows));
  if (rows.some((r) => r.blows <= 0)) return fail(m("errors.blows", "Elke getelde tocht heeft minstens één slag."));

  const energyKnm = (input.ramMassKg * G * input.dropHeightM) / 1000;
  const tocht = input.tochtMm / 1000, dM = dEqMm / 1000;
  const at = (depthM: number): Tocht => {
    const qc = meanQc(cpt, depthM - tocht, depthM);
    return { depthM, qcMpa: qc, expected: qc === null ? null : expectedBlows(qc, dM, input.tochtMm, energyKnm) };
  };

  const profile: Tocht[] = [];
  const count = Math.min(2000, Math.floor((input.toM - input.fromM) / tocht + 1e-9));
  for (let i = 1; i <= count; i++) profile.push(at(Math.round((input.fromM + i * tocht) * 1000) / 1000));

  const tol = input.tolerancePct / 100;
  const comparisons: Comparison[] = rows.map((r) => {
    const t = at(r.depthM);
    const deviation = t.expected === null ? null : (r.blows - t.expected) / t.expected;
    return { ...t, blows: r.blows, deviation, within: deviation === null ? null : Math.abs(deviation) <= tol + 1e-9 };
  });
  const judged = comparisons.filter((c) => c.deviation !== null);
  const within = judged.filter((c) => c.within).length, outside = judged.length - within;
  const meanDeviation = judged.length ? judged.reduce((a, c) => a + c.deviation!, 0) / judged.length : null;

  const warnings: string[] = [];
  const maxDepth = cpt.points.reduce((a, p) => (Number.isFinite(p.depth) ? Math.max(a, p.depth) : a), 0);
  if (input.toM > maxDepth + 1e-6) warnings.push(m("warn.beyondCpt", "De sondering reikt tot {{depth}} m; dieper is er geen verwachting.", { depth: maxDepth.toFixed(1) }));
  if (comparisons.some((c) => c.expected === null)) warnings.push(m("warn.noQc", "Voor een deel van de getelde tochten heeft de sondering geen meetwaarden."));
  if (meanDeviation !== null && judged.length >= 3 && Math.abs(meanDeviation) > tol)
    warnings.push(meanDeviation > 0
      ? m("warn.higher", "Er is gemiddeld {{pct}} % meer geslagen dan verwacht: zwaardere grond dan de sondering, een lager rendement van het blok of een andere valhoogte.", { pct: Math.round(meanDeviation * 100) })
      : m("warn.lower", "Er is gemiddeld {{pct}} % minder geslagen dan verwacht: slappere grond dan de sondering of een zwaarder blok dan ingevuld.", { pct: Math.round(-meanDeviation * 100) }));

  const final = comparisons.length ? comparisons[comparisons.length - 1] : profile.length ? profile[profile.length - 1] : null;
  return { ok: true, warnings, energyKnm, dEqMm, profile, comparisons, within, outside, meanDeviation, final };
}

/** Standaardinvoer: de actieve sondering, de onderste meters ervan en een gangbaar blok. */
export function defaultDrivingInput(ctx: Pick<ProjectContext, "cpts" | "activeCptId">): DrivingInput {
  const cptId = ctx.activeCptId && ctx.cpts.has(ctx.activeCptId) ? ctx.activeCptId : ctx.cpts.keys().next().value ?? null;
  const cpt = cptId ? ctx.cpts.get(cptId) : undefined;
  const maxDepth = cpt ? cpt.points.reduce((a, p) => (Number.isFinite(p.depth) ? Math.max(a, p.depth) : a), 0) : 0;
  const toM = maxDepth > 6 ? Math.floor(maxDepth - 1) : 15;
  return { cptId, ramMassKg: 5000, dropHeightM: 0.8, shape: "square", sizeMm: 350, sizeBMm: 350, tochtMm: 250, fromM: Math.max(0, toM - 5), toM, rows: [], tolerancePct: 50 };
}
