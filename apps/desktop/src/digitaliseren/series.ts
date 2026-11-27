// Van aangeklikte punten of een gevolgde lijn naar een gewone meetreeks op een vaste stap.
import type { MeasurementPoint } from "../types/cpt";
import { toValues, type Affine, type Px } from "./calibration";

export type DepthMode = "depth" | "nap";
/** Lineair tussen de punten, of trapsgewijs: elke aflezing geldt tot de volgende aflezing. */
export type Interpolation = "linear" | "step";
export type SecondKind = "fs" | "rf";

/** Eén aflezing: diepte in m onder maaiveld en de waarde (MPa of %). */
export interface Reading { depth: number; value: number }

export const DEFAULT_STEP = { electrical: 0.02, mechanical: 0.2 } as const;
export const MIN_STEP = 0.005;
export const MAX_STEP = 1;

const round = (v: number, decimals: number) => Number(v.toFixed(decimals));

/**
 * Zet de aangeklikte pixels om naar aflezingen. Staat de diepte-as in m NAP, dan is de diepte onder
 * maaiveld het maaiveldniveau min het afgelezen niveau.
 */
export function readingsFromPixels(points: Px[], m: Affine, depthMode: DepthMode, groundLevelNap: number): Reading[] {
  return points.map((p) => {
    const r = toValues(m, p);
    return { depth: depthMode === "nap" ? groundLevelNap - r.depth : r.depth, value: r.value };
  });
}

/**
 * Aflezingen uit een gevolgde lijn (één pixel per beeldrij): per stap in de diepte het gemiddelde van de
 * beeldrijen die erbinnen vallen. Een negatieve waarde telt als nul en wat boven het maaiveld ligt,
 * vervalt. De aflezingen liggen op veelvouden van de stap.
 */
export function averageReadings(pixels: Px[], m: Affine, depthMode: DepthMode, groundLevelNap: number, step: number): Reading[] {
  if (!(step > 0)) return [];
  const buckets = new Map<number, { sum: number; n: number }>();
  for (const r of readingsFromPixels(pixels, m, depthMode, groundLevelNap)) {
    if (!Number.isFinite(r.depth) || !Number.isFinite(r.value) || r.depth < -1e-9) continue;
    const key = Math.round(r.depth / step + 1e-9);
    const bucket = buckets.get(key) ?? { sum: 0, n: 0 };
    bucket.sum += Math.max(0, r.value); bucket.n++;
    buckets.set(key, bucket);
  }
  return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([key, b]) => ({ depth: round(key * step, 4), value: b.sum / b.n }));
}

export interface NormalizedReadings {
  readings: Reading[];
  /** Aantal punten dat verviel omdat er op dezelfde diepte een later punt staat. */
  duplicates: number;
  /** De punten zijn niet van boven naar beneden aangeklikt en zijn op diepte gesorteerd. */
  reordered: boolean;
}

/**
 * Sorteert de aflezingen op diepte. Staan er meer punten op dezelfde diepte (op de millimeter), dan
 * telt het laatst aangeklikte. Een negatieve waarde wordt nul: de conusweerstand en de wrijving zijn
 * niet negatief.
 */
export function normalizeReadings(input: Reading[]): NormalizedReadings {
  const valid = input.filter((r) => Number.isFinite(r.depth) && Number.isFinite(r.value));
  const reordered = valid.some((r, i) => i > 0 && r.depth < valid[i - 1].depth);
  const sorted = valid.map((r, i) => ({ r, i })).sort((a, b) => a.r.depth - b.r.depth || a.i - b.i);
  const readings: Reading[] = [];
  let duplicates = 0;
  for (const { r } of sorted) {
    const reading = { depth: round(r.depth, 4), value: Math.max(0, r.value) };
    const last = readings[readings.length - 1];
    if (last && Math.round(last.depth * 1000) === Math.round(reading.depth * 1000)) { readings[readings.length - 1] = { ...reading, depth: last.depth }; duplicates++; }
    else readings.push(reading);
  }
  return { readings, duplicates, reordered };
}

/** Waarde op een diepte binnen het bereik van de (gesorteerde) aflezingen; daarbuiten `undefined`. */
export function valueAt(readings: Reading[], depth: number, mode: Interpolation): number | undefined {
  const eps = 1e-6;
  if (readings.length < 2 || depth < readings[0].depth - eps || depth > readings[readings.length - 1].depth + eps) return undefined;
  let i = 0;
  while (i < readings.length - 2 && readings[i + 1].depth <= depth + eps) i++;
  const a = readings[i], b = readings[i + 1];
  if (depth >= b.depth - eps) return b.value;
  if (mode === "step" || depth <= a.depth + eps) return a.value;
  return a.value + ((b.value - a.value) * (depth - a.depth)) / (b.depth - a.depth);
}

/** De dieptes van de meetreeks: veelvouden van de stap binnen het bereik van de aflezingen. */
export function gridDepths(readings: Reading[], step: number): number[] {
  if (readings.length < 2 || !(step > 0)) return [];
  const top = readings[0].depth, bottom = readings[readings.length - 1].depth, out: number[] = [];
  for (let i = Math.ceil(top / step - 1e-6); i * step <= bottom + 1e-6; i++) out.push(round(i * step, 4));
  return out;
}

export interface BuildInput {
  qc: Reading[];
  second?: { kind: SecondKind; readings: Reading[] };
  step: number;
  interpolation: Interpolation;
  groundLevelNap: number;
}

/**
 * De meetreeks: qc op elke stap, en fs en Rf waar de tweede reeks loopt. Is fs gedigitaliseerd, dan
 * volgt Rf = 100 · fs / qc; is Rf gedigitaliseerd, dan volgt fs = Rf · qc / 100.
 */
export function buildPoints(input: BuildInput): MeasurementPoint[] {
  const { qc, second, step, interpolation, groundLevelNap } = input;
  return gridDepths(qc, step).map((depth) => {
    const point: MeasurementPoint = { depth, depth_nap: round(groundLevelNap - depth, 4), qc: round(valueAt(qc, depth, interpolation) ?? 0, 3) };
    const other = second ? valueAt(second.readings, depth, interpolation) : undefined;
    if (second && other !== undefined) {
      if (second.kind === "fs") {
        point.fs = round(other, 4);
        if (point.qc! > 0) point.rf = round((100 * point.fs) / point.qc!, 2);
      } else {
        point.rf = round(other, 2);
        point.fs = round((point.rf * point.qc!) / 100, 4);
      }
    }
    return point;
  });
}
