// Pure helpers of the force diagrams, shared by the drawing, the sheet and the PDF report (no React).
import type { BeamResult } from './beam';

export type Sample = BeamResult['samples'][number];

/** Ronde schaalwaarden (1, 2, 2,5 of 5 × 10ⁿ) die het bereik inclusief 0 dekken. */
export function niceTicks(lo: number, hi: number, target = 4): number[] {
  const a = Math.min(0, lo), b = Math.max(0, hi), span = b - a || Math.max(Math.abs(a), Math.abs(b), 1);
  const raw = span / target, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const first = Math.floor(a / step + 1e-9) * step, last = Math.ceil(b / step - 1e-9) * step;
  return Array.from({ length: Math.round((last - first) / step) + 1 }, (_, i) => +(first + i * step).toPrecision(12));
}

/** Grootste en kleinste waarde met hun diepte. */
export function extremes(samples: Sample[], value: (p: Sample) => number) {
  let max = samples[0], min = samples[0];
  for (const p of samples) { if (value(p) > value(max)) max = p; if (value(p) < value(min)) min = p; }
  return { max: { v: value(max), z: max.zM }, min: { v: value(min), z: min.zM } };
}

/** Lineair geïnterpoleerde waarde op diepte z (samples oplopend in z). */
export function valueAt(samples: Sample[], value: (p: Sample) => number, z: number): number {
  let k = samples.findIndex((p) => p.zM >= z);
  if (k <= 0) return value(samples[Math.max(0, k)]);
  const a = samples[k - 1], b = samples[k], t = b.zM > a.zM ? (z - a.zM) / (b.zM - a.zM) : 0;
  return value(a) + t * (value(b) - value(a));
}

/** Gebied tussen twee nuldoorgangen met één teken, en de grootste waarde daarin. */
export interface SignRegion { zTop: number; zBottom: number; sign: 1 | -1; peak: { v: number; z: number } }
/**
 * Tekengebieden van een lijn over de diepte. Nuldoorgangen worden lineair
 * tussen twee punten bepaald; waarden kleiner dan `tolerance` × de grootste
 * absolute waarde tellen als nul en horen bij geen enkel gebied.
 */
export function signRegions(samplesIn: Sample[], value: (p: Sample) => number, tolerance = 1e-6): SignRegion[] {
  const samples = [...samplesIn].sort((a, b) => a.zM - b.zM);
  const eps = tolerance * Math.max(0, ...samples.map((p) => Math.abs(value(p))));
  const sign = (v: number): 0 | 1 | -1 => Math.abs(v) <= eps ? 0 : v > 0 ? 1 : -1;
  const regions: SignRegion[] = [];
  let open: SignRegion | null = null, lastEnd = samples.length ? samples[0].zM : 0;
  for (let k = 0; k < samples.length; k++) {
    const p = samples[k], v = value(p), s = sign(v), prev = k > 0 ? samples[k - 1] : null, pv = prev ? value(prev) : 0;
    // Nulpunt tussen het vorige punt en dit punt, binnen het interval gehouden.
    const zero = prev && pv !== v && p.zM > prev.zM ? Math.min(p.zM, Math.max(prev.zM, prev.zM + (p.zM - prev.zM) * pv / (pv - v))) : p.zM;
    if (open && s !== open.sign) {
      open.zBottom = zero; lastEnd = zero;
      if (open.zBottom > open.zTop) regions.push(open);
      open = null;
    }
    if (!open && s !== 0) open = { zTop: prev ? (sign(pv) === 0 ? zero : lastEnd) : p.zM, zBottom: p.zM, sign: s, peak: { v, z: p.zM } };
    if (open && Math.abs(v) > Math.abs(open.peak.v)) open.peak = { v, z: p.zM };
    if (open) open.zBottom = p.zM;
  }
  if (open && open.zBottom > open.zTop) regions.push(open);
  return regions;
}

export type Sign = 'bend' | 'shear' | 'plain' | null;
export interface Curve { key: string; title: string; symbol: string; unit: string; digits: number; value: (p: Sample) => number; tone: string; mirror: boolean; sign: Sign }
/**
 * Het moment staat aan de getrokken zijde: bij M = EI·y″ > 0 is de vezel aan
 * de −y-kant getrokken, dus de lijn wordt gespiegeld getekend. Kleuren als
 * in de constructieve rekenprogramma's: moment rood, dwarskracht blauw.
 */
export const CURVES: Curve[] = [
  { key: 'y', title: 'Verplaatsing', symbol: 'y', unit: 'mm', digits: 2, value: (p) => p.yM * 1000, tone: 'disp', mirror: false, sign: null },
  { key: 'M', title: 'Buigend moment', symbol: 'M', unit: 'kNm', digits: 1, value: (p) => p.momentKnM, tone: 'moment', mirror: true, sign: 'bend' },
  { key: 'V', title: 'Dwarskracht', symbol: 'V', unit: 'kN', digits: 1, value: (p) => p.shearKn, tone: 'shear', mirror: false, sign: 'shear' },
  { key: 'p', title: 'Grondreactie', symbol: 'p', unit: 'kN/m', digits: 1, value: (p) => p.reactionKnM, tone: 'soil', mirror: false, sign: 'plain' },
];

