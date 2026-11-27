// Uitwerking van een dissipatietest: beginwaarde u_i, evenwichtswaarde u_0, genormaliseerde
// overspanning U(t) = (u_t - u_0) / (u_i - u_0), de tijd t50 waarop U = 0,5 en daaruit de horizontale
// consolidatiecoëfficiënt.
//
// Bronnen:
// - Teh, C.I. & Houlsby, G.T. (1991), "An analytical study of the cone penetration test in clay",
//   Géotechnique 41(1), 17-34: c_h = T*50 · r² · √I_r / t50 met de gewijzigde tijdfactor T*.
//   T*50 = 0,118 voor een filter op het conusvlak (u1) en 0,245 voor een filter direct achter de
//   conus (u2).
// - Sully, J.P., Robertson, P.K., Campanella, R.G. & Woeller, D.J. (1999), "An approach to evaluation
//   of field CPTU dissipation data in overconsolidated fine-grained soils", Canadian Geotechnical
//   Journal 36(2), 369-381: bij een verloop dat eerst oploopt (dilatant gedrag) geldt de piek als
//   beginwaarde en begint de tijd bij de piek (correctie op de log-tijdgrafiek).
//
// De uitkomst is een indicatieve afleiding: de theorie geldt voor normaal tot licht overgeconsolideerde
// klei en I_r is een schatting.
import type { DissipationPoint, DissipationSettings, DissipationTest, PoreChannel } from "./types";

/** T*50 per filterpositie volgens Teh & Houlsby (1991). Voor u3 geeft de publicatie geen waarde. */
export const T50_STAR: Record<PoreChannel, number | null> = { u1: 0.118, u2: 0.245, u3: null };
/**
 * Gewijzigde tijdfactor T* per consolidatiegraad voor een filter direct achter de conus (u2),
 * Teh & Houlsby (1991). Alleen gebruikt om een theoretische curve te tekenen en te toetsen.
 */
export const T_STAR_U2: Array<[degree: number, tStar: number]> = [
  [0.2, 0.038], [0.3, 0.078], [0.4, 0.142], [0.5, 0.245], [0.6, 0.439], [0.7, 0.804], [0.8, 1.6],
];
export const DEFAULT_RIGIDITY_INDEX = 100;
export const DEFAULT_CONE_AREA_MM2 = 1000;
/** Volumegewicht van water [kN/m³]. */
export const GAMMA_WATER = 9.81;
const SECONDS_PER_YEAR = 365.25 * 24 * 3600;

export interface SeriesPoint { time: number; /** Waterspanning [kPa]. */ u: number }

export type DissipationWarning =
  | "noData" | "nonMonotonic" | "u0FromLast" | "noExcess" | "negativeExcess" | "t50NotReached"
  | "noT50Factor" | "groundwaterMissing" | "manualMissing";

export interface DissipationResult {
  channel: PoreChannel;
  series: SeriesPoint[];
  /** Beginwaarde [kPa]: de eerste meting, of de piek bij een verloop dat eerst oploopt. */
  ui: number | null;
  /** Tijdstip van de beginwaarde [s]; groter dan nul bij een verloop dat eerst oploopt. */
  tStart: number;
  /** Evenwichtswaterspanning [kPa]. */
  u0: number | null;
  u0Mode: NonNullable<DissipationSettings["u0Mode"]>;
  nonMonotonic: boolean;
  /** Waterspanning bij U = 0,5 [kPa]. */
  u50: number | null;
  /** t50 [s], geteld vanaf `tStart`. */
  t50: number | null;
  /** Kleinste U die in de meting is bereikt (1 = niets afgebouwd). */
  minU: number | null;
  rigidityIndex: number;
  coneAreaMm2: number;
  /** Conusstraal [m] uit de conusoppervlakte: r = √(A/π). */
  radiusM: number;
  t50Star: number | null;
  /** c_h [m²/s]. */
  ch: number | null;
  chPerYear: number | null;
  warnings: DissipationWarning[];
}

/** Kanalen waarvoor de test meetwaarden heeft. */
export function availableChannels(test: DissipationTest): PoreChannel[] {
  return (["u2", "u1", "u3"] as PoreChannel[]).filter((key) => test.points.some((p) => p[key] != null));
}

/** Tijdreeks van één kanaal in kPa, op tijd gesorteerd en zonder ontbrekende waarden. */
export function seriesOf(points: DissipationPoint[], channel: PoreChannel): SeriesPoint[] {
  return points
    .filter((p) => Number.isFinite(p.time) && p.time >= 0 && p[channel] != null && Number.isFinite(p[channel]))
    .map((p) => ({ time: p.time, u: (p[channel] as number) * 1000 }))
    .sort((a, b) => a.time - b.time);
}

/** Conusstraal [m] uit de conusoppervlakte [mm²]. */
export const coneRadius = (areaMm2: number) => Math.sqrt(areaMm2 / Math.PI) / 1000;

/** Hydrostatische waterspanning [kPa] op `depth` bij een grondwaterstand `groundwaterDepth` (beide m onder maaiveld). */
export const hydrostatic = (depth: number, groundwaterDepth: number) => Math.max(0, (depth - groundwaterDepth) * GAMMA_WATER);

/** c_h [m²/s] volgens Teh & Houlsby (1991). */
export function horizontalConsolidation(t50Star: number, radiusM: number, rigidityIndex: number, t50: number): number {
  return (t50Star * radiusM * radiusM * Math.sqrt(rigidityIndex)) / t50;
}

/**
 * Eerste tijdstip na `from` waarop de reeks `level` kruist, lineair tussen twee metingen in de
 * logaritme van de tijd (in gewone tijd als een van beide tijden nul is).
 */
function crossing(series: SeriesPoint[], from: number, level: number, shift: number): number | null {
  for (let i = from + 1; i < series.length; i++) {
    const a = series[i - 1], b = series[i];
    if ((a.u - level) * (b.u - level) > 0) continue;
    if (a.u === b.u) return a.time - shift;
    const f = (a.u - level) / (a.u - b.u);
    const ta = a.time - shift, tb = b.time - shift;
    return ta > 0 && tb > 0 ? Math.exp(Math.log(ta) + f * (Math.log(tb) - Math.log(ta))) : ta + f * (tb - ta);
  }
  return null;
}

/** De uitwerking van één test met de keuzes van de gebruiker (of de standaardwaarden). */
export function analyseDissipation(test: DissipationTest, fileConeAreaMm2?: number): DissipationResult {
  const s = test.settings ?? {};
  const channels = availableChannels(test);
  const channel = s.channel && channels.includes(s.channel) ? s.channel : channels[0] ?? "u2";
  const series = seriesOf(test.points, channel);
  const warnings: DissipationWarning[] = [];
  const rigidityIndex = s.rigidityIndex && s.rigidityIndex > 0 ? s.rigidityIndex : DEFAULT_RIGIDITY_INDEX;
  const coneAreaMm2 = s.coneAreaMm2 && s.coneAreaMm2 > 0 ? s.coneAreaMm2 : fileConeAreaMm2 && fileConeAreaMm2 > 0 ? fileConeAreaMm2 : DEFAULT_CONE_AREA_MM2;
  const radiusM = coneRadius(coneAreaMm2);
  const t50Star = T50_STAR[channel];
  let u0Mode = s.u0Mode ?? "last";
  const base: DissipationResult = {
    channel, series, ui: null, tStart: 0, u0: null, u0Mode, nonMonotonic: false, u50: null, t50: null, minU: null,
    rigidityIndex, coneAreaMm2, radiusM, t50Star, ch: null, chPerYear: null, warnings,
  };
  if (series.length < 2) { warnings.push("noData"); return base; }

  // Evenwichtswaarde: ingevuld, uit de grondwaterstand, of anders de laatste meting.
  let u0: number;
  if (u0Mode === "manual" && s.u0Kpa != null && Number.isFinite(s.u0Kpa)) u0 = s.u0Kpa;
  else if (u0Mode === "groundwater" && s.groundwaterDepthM != null && Number.isFinite(s.groundwaterDepthM)) u0 = hydrostatic(test.depth, s.groundwaterDepthM);
  else {
    if (u0Mode === "manual") warnings.push("manualMissing");
    if (u0Mode === "groundwater") warnings.push("groundwaterMissing");
    u0Mode = "last";
    u0 = series[series.length - 1].u;
    warnings.push("u0FromLast");
  }

  // Beginwaarde: de eerste meting. Loopt de waterspanning eerst duidelijk op terwijl er overspanning
  // is, dan geldt de piek als begin (Sully et al., 1999).
  const first = series[0];
  let peak = 0;
  for (let i = 1; i < series.length; i++) if (series[i].u > series[peak].u) peak = i;
  const rise = series[peak].u - first.u;
  const nonMonotonic = peak > 0 && series[peak].u > u0 && rise > Math.max(0.5, 0.02 * Math.abs(series[peak].u - u0));
  const start = nonMonotonic ? peak : 0;
  const ui = series[start].u, tStart = series[start].time;
  if (nonMonotonic) warnings.push("nonMonotonic");

  const excess = ui - u0;
  const result: DissipationResult = { ...base, ui, tStart, u0, u0Mode, nonMonotonic };
  if (Math.abs(excess) < 0.5) { warnings.push("noExcess"); return result; }
  if (excess < 0) warnings.push("negativeExcess");

  const u50 = u0 + 0.5 * excess;
  const t50 = crossing(series, start, u50, tStart);
  const minU = Math.min(...series.slice(start).map((p) => (p.u - u0) / excess));
  result.u50 = u50; result.minU = minU;
  // Met de laatste meting als evenwicht is U = 0 altijd "bereikt"; t50 telt dan alleen als schatting.
  if (t50 == null || !(t50 > 0)) { warnings.push("t50NotReached"); return result; }
  result.t50 = t50;
  if (t50Star == null) { warnings.push("noT50Factor"); return result; }
  result.ch = horizontalConsolidation(t50Star, radiusM, rigidityIndex, t50);
  result.chPerYear = result.ch * SECONDS_PER_YEAR;
  return result;
}

/** Genormaliseerde overspanning U op elk meetpunt vanaf de beginwaarde. */
export function normalised(result: DissipationResult): Array<{ time: number; U: number }> {
  if (result.ui == null || result.u0 == null || result.ui === result.u0) return [];
  const excess = result.ui - result.u0;
  return result.series.filter((p) => p.time >= result.tStart).map((p) => ({ time: p.time - result.tStart, U: (p.u - result.u0!) / excess }));
}

/**
 * Theoretische curve voor een filter achter de conus (u2) volgens de tijdfactoren van Teh & Houlsby
 * (1991): tijden waarop 20 tot 80 % van de overspanning is afgebouwd, plus het begin.
 */
export function theoreticalU2Curve(ch: number, areaMm2: number, rigidityIndex: number, uiKpa: number, u0Kpa: number): DissipationPoint[] {
  const scale = (coneRadius(areaMm2) ** 2 * Math.sqrt(rigidityIndex)) / ch;
  return [{ time: 0, u2: uiKpa / 1000 }, ...T_STAR_U2.map(([degree, tStar]) => ({ time: tStar * scale, u2: (u0Kpa + (1 - degree) * (uiKpa - u0Kpa)) / 1000 }))];
}
