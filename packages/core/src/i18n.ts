// Translations of the app (apps/desktop/src/i18n/locales/<lang>/<ns>.json), bundled
// by build-core.mjs as the virtual module "ogs:locales". The module texts, checks
// and reports use the same i18next instance as the app does.
import i18next from "i18next";
import resources from "ogs:locales";

/** Languages of the app; Dutch is the source language of the calculations. */
export const LANGUAGES = ["nl", "en", "de", "fr", "es", "it", "pt", "pl", "da", "sv"] as const;
export type Language = (typeof LANGUAGES)[number];

let ready = false;
function init(): void {
  if (ready && i18next.isInitialized) return;
  if (!i18next.isInitialized)
    void i18next.init({ resources, lng: "nl", fallbackLng: "en", ns: Object.keys(resources.nl ?? {}), defaultNS: "common", interpolation: { escapeValue: false }, initImmediate: false, showSupportNotice: false } as Parameters<typeof i18next.init>[0]);
  else for (const [lng, nss] of Object.entries(resources)) for (const [ns, data] of Object.entries(nss)) if (!i18next.hasResourceBundle(lng, ns)) i18next.addResourceBundle(lng, ns, data, true, false);
  ready = true;
}

export function checkLanguage(lang: string | undefined): Language {
  const l = (lang ?? "nl").toLowerCase().split(/[-_]/)[0];
  if (!(LANGUAGES as readonly string[]).includes(l)) throw new Error(`Unsupported language "${lang}". Use one of: ${LANGUAGES.join(", ")}.`);
  return l as Language;
}

function switchTo(lang: Language): string {
  const before = i18next.language;
  if (before !== lang) void i18next.changeLanguage(lang);
  if (i18next.language !== lang) throw new Error(`Language ${lang} could not be activated`);
  return before;
}

/** Runs a synchronous step in the given language and restores the previous one. */
export function withLanguage<T>(lang: string | undefined, fn: () => T): T {
  init();
  const before = switchTo(checkLanguage(lang));
  try { return fn(); } finally { if (before && before !== i18next.language) void i18next.changeLanguage(before); }
}

let queue: Promise<unknown> = Promise.resolve();
/** Runs an asynchronous step in the given language, one at a time. */
export function withLanguageAsync<T>(lang: string | undefined, fn: () => Promise<T>): Promise<T> {
  init();
  const l = checkLanguage(lang);
  const run = queue.then(async () => {
    const before = switchTo(l);
    try { return await fn(); } finally { if (before && before !== i18next.language) void i18next.changeLanguage(before); }
  });
  queue = run.catch(() => undefined);
  return run;
}

/** A translated text of the app in a given language, without switching the active language. */
export function text(lang: string | undefined, key: string, nl: string): string {
  init();
  return i18next.t(key, { lng: checkLanguage(lang), defaultValue: nl }) as string;
}
