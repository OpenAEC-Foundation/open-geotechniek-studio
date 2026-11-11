import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { getSetting } from "../store";

// Alle talen uit locales/<taal>/<namespace>.json; een nieuwe taalmap wordt vanzelf opgepikt.
const files = import.meta.glob<{ default: Record<string, unknown> }>("./locales/*/*.json", { eager: true });
const resources: Record<string, Record<string, Record<string, unknown>>> = {};
for (const [path, mod] of Object.entries(files)) {
  const [, lang, ns] = path.match(/\.\/locales\/([^/]+)\/([^/]+)\.json$/)!;
  (resources[lang] ??= {})[ns] = mod.default;
}

/** Talen in de keuzelijst, met hun eigen naam. */
export const LANGUAGES = [
  { code: "auto", name: "Auto-detect" },
  { code: "en", name: "English" },
  { code: "nl", name: "Nederlands" },
  { code: "de", name: "Deutsch" },
  { code: "fr", name: "Français" },
  { code: "es", name: "Español" },
  { code: "it", name: "Italiano" },
  { code: "pt", name: "Português" },
  { code: "pl", name: "Polski" },
  { code: "sv", name: "Svenska" },
  { code: "da", name: "Dansk" },
];

const ns = ["common", "ribbon", "backstage", "settings", "feedback", "cpt", "calc", "calcPile", "calcPileCore", "calcLateral", "calcAdvice"];

i18next
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    ns,
    defaultNS: "common",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    detection: {
      order: ["navigator"],
      caches: [],
    },
  });

i18next.on("languageChanged", (lng) => {
  document.documentElement.setAttribute("lang", lng);
});

// Load saved language from Tauri store on startup. Niet in tests: die
// draaien vast in het Nederlands (zie test-setup.ts), de brontaal.
if (import.meta.env.MODE !== "test") {
  getSetting("language", "auto").then((lang) => {
    changeLanguage(lang);
  });
}

export function changeLanguage(lang: string) {
  if (lang === "auto") {
    const detected = navigator.language?.split("-")[0] || "en";
    const supported = Object.keys(i18next.options.resources || {});
    const finalLang = supported.includes(detected) ? detected : "en";
    return i18next.changeLanguage(finalLang);
  }
  return i18next.changeLanguage(lang);
}

export default i18next;
