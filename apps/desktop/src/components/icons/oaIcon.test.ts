import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isOaIconId, oaIcon, oaIconIds } from "./oaIcon";

const SRC = join(__dirname, "..", "..");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "assets" ? [] : sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** B2-ids zoals de code ze noemt: icon="…", <OaIcon id="…"/>, id={a ? "…" : "…"} en oaIcon('…'). */
function usedIds(): Map<string, string> {
  const used = new Map<string, string>();
  for (const file of sources(SRC)) {
    const text = readFileSync(file, "utf8");
    const add = (id: string) => { if (isOaIconId(id)) used.set(id, file); };
    for (const m of text.matchAll(/\bicon="([^"]+)"/g)) add(m[1]);
    for (const m of text.matchAll(/oaIcon\(\s*["']([^"']+)["']/g)) add(m[1]);
    for (const m of text.matchAll(/<OaIcon\s+id=(?:"([^"]+)"|\{([^}]*)\})/g)) {
      if (m[1]) add(m[1]);
      else for (const q of m[2].matchAll(/["']([^"']+)["']/g)) add(q[1]);
    }
  }
  return used;
}

describe("OpenAEC B2-iconen", () => {
  it("leest de sprite: elk icoon in 16 en 24 px", () => {
    const ids = oaIconIds();
    expect(ids.length).toBeGreaterThan(100);
    expect(oaIcon("view.fit", 24)).toContain('data-icon="view.fit"');
    expect(oaIcon("view.fit", 16)).toContain('viewBox="0 0 16 16"');
  });

  it("gebruikt in de code alleen ids die in de vastgelegde kopie staan", () => {
    const known = new Set(oaIconIds());
    const used = usedIds();
    expect(used.size).toBeGreaterThan(40);
    const missing = [...used].filter(([id]) => !known.has(id)).map(([id, file]) => `${id} (${file})`);
    expect(missing).toEqual([]);
  });

  it("kleurt het icoon niet zelf oranje: het accent loopt via --icon-accent", () => {
    const svg = oaIcon("file.save", 16);
    expect(svg).toContain("var(--icon-accent,currentColor)");
    expect(svg).not.toMatch(/#[0-9a-f]{6}/i);
  });
});
