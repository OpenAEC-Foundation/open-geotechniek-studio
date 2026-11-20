// Kerngetallen en meldingen van een dissipatietest als tekst, voor het scherm en het rapport.
// De Nederlandse tekst is de brontekst; het scherm vertaalt op de sleutel.
import type { DissipationResult, DissipationWarning } from "./analysis";
import type { DissipationTest } from "./types";

/** De formule met de opmaak van de rapporttekst (sub- en superscript). */
export const FORMULA = "c_h = T*50 · r^2 · √I_r / t_50";
/** Dezelfde formule als gewone tekst voor het scherm. */
export const FORMULA_TEXT = "cₕ = T*₅₀ · r² · √Iᵣ / t₅₀";
export const FORMULA_SOURCE = "Teh & Houlsby (1991)";
export const INDICATIVE_NOTE =
  "Indicatieve afleiding: de theorie geldt voor normaal tot licht overgeconsolideerde klei en de stijfheidsindex I_r is een schatting. Gebruik c_h niet zonder eigen beoordeling.";

export const WARNING_NL: Record<DissipationWarning, string> = {
  noData: "Te weinig meetwaarden voor een uitwerking.",
  nonMonotonic: "De waterspanning loopt eerst op (dilatant gedrag). De piek geldt als beginwaarde en de tijd telt vanaf de piek (Sully et al., 1999).",
  u0FromLast: "u_0 is de laatste meting. Dat klopt alleen als de test tot evenwicht is doorgezet; vul anders u_0 of de grondwaterstand in.",
  noExcess: "Er is geen meetbare overspanning; t50 is niet te bepalen.",
  negativeExcess: "De beginwaarde ligt onder u_0 (onderspanning). De theorie voor c_h geldt hier niet; de uitkomst is hooguit een orde van grootte.",
  t50NotReached: "De helft van de overspanning is binnen de meting niet afgebouwd; t50 is niet te bepalen.",
  noT50Factor: "Voor een filter op deze plaats (u3) geeft de publicatie geen T*50; c_h is niet berekend.",
  groundwaterMissing: "De grondwaterstand is niet ingevuld.",
  manualMissing: "u_0 is niet ingevuld.",
};

export interface SummaryRow {
  /** Sleutel voor de vertaling van de omschrijving. */
  key: string;
  nl: string;
  value: string;
  /** De waarde is een keuze; het scherm vertaalt die op deze sleutel. */
  valueKey?: string;
}

const num = (v: number | null | undefined, decimals: number, unit = "") => v == null || !Number.isFinite(v) ? "-" : `${v.toFixed(decimals)}${unit ? ` ${unit}` : ""}`;

/** Tijd in seconden, met minuten erbij als dat leesbaarder is. */
export function formatTime(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return "-";
  const s = seconds >= 100 ? seconds.toFixed(0) : seconds.toPrecision(3);
  return seconds >= 120 ? `${s} s (${(seconds / 60).toFixed(1)} min)` : `${s} s`;
}

/** c_h in wetenschappelijke notatie, bijvoorbeeld "7.80e-6". */
export const formatCh = (ch: number | null) => (ch == null || !Number.isFinite(ch) ? "-" : ch.toExponential(2));

export const U0_MODE_NL = { last: "laatste meting", manual: "ingevuld", groundwater: "uit grondwaterstand en diepte" } as const;

/** De regels van de tabel met kerngetallen: eerst de meting, dan de invoer en de uitkomst. */
export function summaryRows(test: DissipationTest, r: DissipationResult): SummaryRow[] {
  const duration = r.series.length ? r.series[r.series.length - 1].time : null;
  return [
    { key: "depth", nl: "Diepte (sondeerlengte)", value: num(test.depth, 2, "m") },
    { key: "channel", nl: "Filterpositie", value: r.channel },
    { key: "duration", nl: "Duur van de meting", value: formatTime(duration) },
    r.nonMonotonic ? { key: "uiPeak", nl: "Beginwaarde u_i (piek)", value: num(r.ui, 1, "kPa") } : { key: "ui", nl: "Beginwaarde u_i", value: num(r.ui, 1, "kPa") },
    ...(r.nonMonotonic ? [{ key: "tPeak", nl: "Tijdstip van de piek", value: formatTime(r.tStart) }] : []),
    { key: "u0", nl: "Evenwichtswaarde u_0", value: num(r.u0, 1, "kPa") },
    { key: "u0Mode", nl: "Herkomst van u_0", value: U0_MODE_NL[r.u0Mode], valueKey: `u0Mode.${r.u0Mode}` },
    { key: "u50", nl: "Waterspanning bij U = 0,5", value: num(r.u50, 1, "kPa") },
    { key: "minU", nl: "Kleinste U in de meting", value: num(r.minU, 2) },
    r.nonMonotonic ? { key: "t50Peak", nl: "t_50 (vanaf de piek)", value: formatTime(r.t50) } : { key: "t50", nl: "t_50", value: formatTime(r.t50) },
    { key: "t50Star", nl: "Tijdfactor T*50", value: r.t50Star == null ? "-" : `${r.t50Star} (${r.channel})` },
    { key: "coneArea", nl: "Oppervlakte conuspunt", value: num(r.coneAreaMm2, 0, "mm²") },
    { key: "radius", nl: "Conusstraal r", value: `${(r.radiusM * 1000).toFixed(2)} mm` },
    { key: "ir", nl: "Stijfheidsindex I_r", value: num(r.rigidityIndex, 0) },
    { key: "ch", nl: "c_h [m²/s]", value: formatCh(r.ch) },
    { key: "chYear", nl: "c_h [m²/jaar]", value: r.chPerYear == null ? "-" : r.chPerYear >= 100 ? r.chPerYear.toFixed(0) : r.chPerYear.toPrecision(3) },
  ];
}
