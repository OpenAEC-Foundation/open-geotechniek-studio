import i18next from "i18next";

/**
 * Vertaling uit de namespace `panels` voor code buiten React (analyse,
 * validatie, grafiek-tekenen). De Nederlandse brontekst staat in de code
 * als standaard. Gebruik in componenten liever `useTranslation("panels")`.
 */
export function pt(key: string, nl: string, vars?: Record<string, unknown>): string {
  return i18next.t(`panels:${key}`, { defaultValue: nl, ...vars }) as string;
}
