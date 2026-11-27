// Hulpmiddel bij het lezen van een magnetometersondering: achtergrondveld, afwijking daarvan,
// verticale gradiënt en trajecten waar een ingestelde drempel wordt overschreden.
//
// Dit is een presentatie van meetgegevens. De drempels zijn instelwaarden van de gebruiker en geen
// normwaarden; de zones zijn geen beoordeling en vervangen geen vrijgave door een deskundige.
import type { Cpt } from "../types/cpt";
import type { MagnetometerData, Series } from "./channels";

export interface MagSettings {
  /** Traject waarover het achtergrondveld wordt bepaald (m onder maaiveld); `null` = tot het begin/eind. */
  backgroundFrom: number | null;
  backgroundTo: number | null;
  /** Drempel voor de afwijking van het achtergrondveld (nT). */
  anomalyThreshold: number;
  /** Drempel voor de verticale gradiënt van het totaalveld (nT/m). */
  gradientThreshold: number;
  /** Zones die dichter dan dit op elkaar liggen worden één zone (m). */
  mergeGap: number;
  /** Boven deze diepte worden geen zones gemarkeerd (m onder maaiveld). */
  analysisFrom: number;
}

/** Beginwaarden om mee te starten; geen normwaarden. */
export const DEFAULT_MAG_SETTINGS: MagSettings = {
  backgroundFrom: null,
  backgroundTo: null,
  anomalyThreshold: 50,
  gradientThreshold: 100,
  mergeGap: 0.25,
  analysisFrom: 0,
};

export interface MagZone {
  top: number;
  bottom: number;
  /** Grootste afwijking van het achtergrondveld in de zone, met teken (nT), en de diepte ervan. */
  peakAnomaly: number;
  peakAnomalyDepth: number;
  /** Grootste gradiënt in de zone, met teken (nT/m), en de diepte ervan. */
  peakGradient: number | null;
  peakGradientDepth: number | null;
  /** Welke drempel in de zone is overschreden. */
  byAnomaly: boolean;
  byGradient: boolean;
}

export interface MagAnalysis {
  /** Mediaan van het totaalveld over het ingestelde traject (nT); `null` zonder meetwaarden in dat traject. */
  background: number | null;
  /** Aantal meetwaarden waarop de mediaan berust. */
  backgroundCount: number;
  /** Totaalveld min achtergrond, per meetpunt (nT). */
  anomaly: Series;
  /** Verticale gradiënt van het totaalveld, per meetpunt (nT/m). */
  gradient: Series;
  zones: MagZone[];
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Verticale gradiënt dB/dz per meetpunt: centrale differentie over de buurpunten met een geldige
 * waarde, aan de randen (en naast een ontbrekende waarde) de eenzijdige differentie.
 * Punten moeten op oplopende diepte staan; een punt zonder buur op een andere diepte geeft `null`.
 */
export function verticalGradient(depth: number[], values: Series): Series {
  const usable = (i: number) => i >= 0 && i < depth.length && values[i] != null && Number.isFinite(depth[i]);
  return depth.map((_, i) => {
    if (!usable(i)) return null;
    const lo = usable(i - 1) ? i - 1 : i, hi = usable(i + 1) ? i + 1 : i;
    const dz = depth[hi] - depth[lo];
    return Math.abs(dz) > 1e-9 ? (values[hi]! - values[lo]!) / dz : null;
  });
}

/** Mediaan van de reeks over het traject [from, to]; open grenzen lopen tot het begin of eind. */
export function backgroundField(depth: number[], total: Series, from: number | null, to: number | null) {
  const lo = from ?? -Infinity, hi = to ?? Infinity;
  const values = total.filter((v, i): v is number => v != null && depth[i] >= Math.min(lo, hi) && depth[i] <= Math.max(lo, hi));
  return { background: median(values), count: values.length };
}

/** Analyse van het totaalveld met de gegeven instellingen. */
export function analyseMagnetometer(data: MagnetometerData, settings: MagSettings = DEFAULT_MAG_SETTINGS): MagAnalysis {
  const { depth } = data, n = depth.length;
  const empty: Series = new Array(n).fill(null);
  if (!data.total) return { background: null, backgroundCount: 0, anomaly: empty, gradient: empty, zones: [] };
  // Reken op oplopende diepte en zet de uitkomst terug in bronvolgorde.
  const order = depth.map((_, i) => i).filter((i) => Number.isFinite(depth[i])).sort((a, b) => depth[a] - depth[b]);
  const z = order.map((i) => depth[i]), b = order.map((i) => data.total![i]);
  const { background, count } = backgroundField(z, b, settings.backgroundFrom, settings.backgroundTo);
  const grad = verticalGradient(z, b);
  const anom: Series = b.map((v) => (v == null || background == null ? null : v - background));

  const zones: MagZone[] = [];
  let current: MagZone | null = null;
  for (let i = 0; i < z.length; i++) {
    if (z[i] < settings.analysisFrom) continue;
    const a = anom[i], g = grad[i];
    const overA = a != null && Math.abs(a) > settings.anomalyThreshold;
    const overG = g != null && Math.abs(g) > settings.gradientThreshold;
    if (!overA && !overG) continue;
    if (current && z[i] - current.bottom > Math.max(settings.mergeGap, lastStep(z, i))) { zones.push(current); current = null; }
    if (!current)
      current = { top: z[i], bottom: z[i], peakAnomaly: a ?? 0, peakAnomalyDepth: z[i], peakGradient: g, peakGradientDepth: g == null ? null : z[i], byAnomaly: false, byGradient: false };
    current.bottom = z[i];
    current.byAnomaly ||= overA;
    current.byGradient ||= overG;
    if (a != null && Math.abs(a) > Math.abs(current.peakAnomaly)) { current.peakAnomaly = a; current.peakAnomalyDepth = z[i]; }
    if (g != null && (current.peakGradient == null || Math.abs(g) > Math.abs(current.peakGradient))) { current.peakGradient = g; current.peakGradientDepth = z[i]; }
  }
  if (current) zones.push(current);

  const anomaly = [...empty], gradient = [...empty];
  order.forEach((source, i) => { anomaly[source] = anom[i]; gradient[source] = grad[i]; });
  return { background, backgroundCount: count, anomaly, gradient, zones };
}

/** Afstand tot het vorige meetpunt: opeenvolgende punten boven de drempel horen altijd bij dezelfde zone. */
function lastStep(z: number[], i: number): number {
  return i > 0 ? z[i] - z[i - 1] + 1e-9 : 0;
}

export const MAG_SETTINGS_KEY = "ogs:magnetometer";

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Instellingen van deze sondering; ze staan in de uitbreidbare metadata en gaan zo mee in het project. */
export function magSettingsFor(cpt: Cpt): MagSettings {
  try {
    const raw = JSON.parse(cpt.metadata.extra?.[MAG_SETTINGS_KEY] ?? "{}") as Partial<Record<keyof MagSettings, unknown>>;
    const positive = (v: unknown, fallback: number) => (finite(v) && v >= 0 ? v : fallback);
    return {
      backgroundFrom: finite(raw.backgroundFrom) ? raw.backgroundFrom : null,
      backgroundTo: finite(raw.backgroundTo) ? raw.backgroundTo : null,
      anomalyThreshold: positive(raw.anomalyThreshold, DEFAULT_MAG_SETTINGS.anomalyThreshold),
      gradientThreshold: positive(raw.gradientThreshold, DEFAULT_MAG_SETTINGS.gradientThreshold),
      mergeGap: positive(raw.mergeGap, DEFAULT_MAG_SETTINGS.mergeGap),
      analysisFrom: positive(raw.analysisFrom, DEFAULT_MAG_SETTINGS.analysisFrom),
    };
  } catch { return { ...DEFAULT_MAG_SETTINGS }; }
}

export function withMagSettings(cpt: Cpt, settings: MagSettings): Cpt {
  return { ...cpt, metadata: { ...cpt.metadata, extra: { ...cpt.metadata.extra, [MAG_SETTINGS_KEY]: JSON.stringify(settings) } } };
}
