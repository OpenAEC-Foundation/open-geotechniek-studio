import i18next from "i18next";

/** Vertaal-namespaces van het rekenkader en de rekenmodules. */
export type CalcNs = "calc" | "calcPile" | "calcPileCore" | "calcLateral" | "calcAdvice";

/**
 * Vertaling voor code buiten React (rekenkern, catalogi, meldingen).
 * De Nederlandse brontekst staat in de code als standaard; de vertaling
 * komt uit `locales/<taal>/<ns>.json`. Gebruik in componenten liever
 * `useTranslation(ns)`, zodat een taalwissel opnieuw rendert.
 */
export function ct(ns: CalcNs, key: string, nl: string, vars?: Record<string, unknown>): string {
  return i18next.t(`${ns}:${key}`, { defaultValue: nl, ...vars }) as string;
}

/** Taalcode voor getalnotatie (toLocaleString / Intl.NumberFormat). */
export function numberLocale(): string {
  return i18next.resolvedLanguage || i18next.language || "nl";
}

/** Getal met vaste decimalen in de notatie van de actieve taal. */
export function fmtNumber(value: number, digits = 2): string {
  return value.toLocaleString(numberLocale(), { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
