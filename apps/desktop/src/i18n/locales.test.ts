import { describe, expect, it } from "vitest";
import { LANGUAGES } from "./config";

const files = import.meta.glob<{ default: Record<string, unknown> }>("./locales/*/*.json", { eager: true });
const byLang: Record<string, Record<string, Record<string, unknown>>> = {};
for (const [path, mod] of Object.entries(files)) {
  const [, lang, ns] = path.match(/\.\/locales\/([^/]+)\/([^/]+)\.json$/)!;
  (byLang[lang] ??= {})[ns] = mod.default;
}
/** Alle sleutels met hun waarde, plat als "a.b.c". */
function flat(o: Record<string, unknown>, prefix = ""): Record<string, string> {
  return Object.entries(o).reduce<Record<string, string>>((acc, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return typeof v === "object" && v !== null ? { ...acc, ...flat(v as Record<string, unknown>, key) } : { ...acc, [key]: String(v) };
  }, {});
}
const vars = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort();

describe("vertalingen", () => {
  const en = byLang.en;
  it("elke taal in de keuzelijst heeft een taalmap en omgekeerd", () => {
    expect(LANGUAGES.filter((l) => l.code !== "auto").map((l) => l.code).sort()).toEqual(Object.keys(byLang).sort());
  });
  for (const lang of Object.keys(byLang).filter((l) => l !== "en")) {
    it(`${lang}: dezelfde onderdelen, sleutels en invulvelden als het Engels, zonder lege teksten`, () => {
      expect(Object.keys(byLang[lang]).sort()).toEqual(Object.keys(en).sort());
      for (const ns of Object.keys(en)) {
        const a = flat(en[ns]), b = flat(byLang[lang][ns]);
        expect(Object.keys(b).sort(), `${lang}/${ns}`).toEqual(Object.keys(a).sort());
        for (const k of Object.keys(a)) {
          expect(b[k].trim().length, `${lang}/${ns}:${k}`).toBeGreaterThan(0);
          expect(vars(b[k]), `${lang}/${ns}:${k}`).toEqual(vars(a[k]));
        }
      }
    });
  }
  it("houdt het versienummer gelijk in alle talen", () => {
    const versions = new Set(Object.values(byLang).map((l) => (l.common as { version: string }).version));
    expect(versions.size).toBe(1);
  });
});
