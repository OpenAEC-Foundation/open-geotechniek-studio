// Eén afspraak voor het tekenen van grondveren in 2D en 3D:
// lengte = beginstijfheid k₀, kleur = grondsoort, en een verloop naar de
// foutkleur van het thema naarmate de veer zijn grensweerstand nadert.
import { soilColor } from './report-data';
import type { SpringState } from './spring-types';

/** Mobilisatie |p| / pu; null bij een lineaire veer zonder grens. */
export function mobilisation(s: SpringState): number | null {
  return s.ultimateKnM && s.ultimateKnM > 0 ? Math.abs(s.resistanceKnM) / s.ultimateKnM : null;
}

/** Relatieve lengte van het veersymbool (0,3–1): stijvere veer = langer symbool. */
export function springLength(k0: number, kMax: number): number {
  return kMax > 0 && k0 > 0 ? 0.3 + 0.7 * Math.min(1, k0 / kMax) : 0.3;
}

/** Aandeel waarschuwingskleur (0–1): nul tot 50 % mobilisatie, daarna lineair naar 1 bij 100 %. */
export function mobilisationMix(m: number | null): number {
  return m === null || !Number.isFinite(m) ? 0 : Math.max(0, Math.min(1, (m - 0.5) / 0.5));
}

/** Lijnkleur van de grondsoort: de vulkleur, donkerder zodat een dunne lijn leesbaar blijft. */
export function soilStroke(springId: string): [number, number, number] {
  const [r, g, b] = soilColor(springId).rgb;
  return [Math.round(r * 0.62), Math.round(g * 0.62), Math.round(b * 0.62)];
}
const css = ([r, g, b]: [number, number, number]) => `rgb(${r} ${g} ${b})`;
export const soilStrokeCss = (springId: string) => css(soilStroke(springId));

/** CSS-kleur van een veer: grondsoortkleur, gemengd met de foutkleur van het thema naar mobilisatie. */
export function springCss(springId: string, m: number | null): string {
  const mix = Math.round(mobilisationMix(m) * 100);
  return mix === 0 ? soilStrokeCss(springId) : `color-mix(in srgb, var(--oa-error) ${mix}%, ${soilStrokeCss(springId)})`;
}

/** Zigzagpad van een veer vanaf (x, y) naar rechts over lengte len. */
export function springPath(x: number, y: number, len: number, amplitude = 4): string {
  const lead = Math.min(6, len * 0.15), body = len - 2 * lead, n = Math.max(2, Math.round(body / 7)), step = body / (2 * n);
  let d = `M${x} ${y}h${lead.toFixed(2)}`;
  for (let i = 0; i < 2 * n; i++) d += `l${step.toFixed(2)} ${(i % 2 ? 2 : -2) * amplitude * (i === 0 || i === 2 * n - 1 ? 0.5 : 1)}`;
  return `${d}h${lead.toFixed(2)}`;
}
