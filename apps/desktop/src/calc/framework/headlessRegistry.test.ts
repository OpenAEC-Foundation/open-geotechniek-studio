import { describe, expect, it } from "vitest";
import { CALC_REGISTRY } from "./registry";
import { APP_HEADLESS_MODULES, EXTRA_HEADLESS_MODULES, HEADLESS_REGISTRY, getHeadlessModule } from "./headlessRegistry";
import { buildGenericReport } from "./genericReport";
import type { ProjectContext } from "./types";

const ctx: ProjectContext = { cpts: new Map(), activeCptId: null, projectMeta: { title: "Test", client: "", location: "", project_number: "T1", author: "", date: "2026-11-28" } };

describe("headless registry", () => {
  it("holds the same modules as the app, in the same order", () => {
    expect(APP_HEADLESS_MODULES.map((m) => m.id)).toEqual(CALC_REGISTRY.map((m) => m.id));
  });

  it("the app modules use the very same functions as the headless modules", () => {
    for (const mod of CALC_REGISTRY) {
      const h = getHeadlessModule(mod.id)!;
      expect(mod.compute, mod.id).toBe(h.compute);
      expect(mod.defaultInput, mod.id).toBe(h.defaultInput);
      expect(mod.buildReport, mod.id).toBe(h.buildReport);
      expect(mod.checks, mod.id).toBe(h.checks);
      expect(mod.statusLine, mod.id).toBe(h.statusLine);
      expect([mod.name, mod.norm, mod.status]).toEqual([h.name, h.norm, h.status]);
    }
  });

  it("has unique ids and no screens", () => {
    const ids = HEADLESS_REGISTRY.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of HEADLESS_REGISTRY) expect("InputPanel" in m, m.id).toBe(false);
  });

  it("computes every extra module from its defaults and writes a generic report", () => {
    for (const m of EXTRA_HEADLESS_MODULES) {
      const input = m.defaultInput(ctx);
      const result = m.compute(input, ctx) as { ok: boolean };
      expect(result.ok, m.id).toBe(true);
      const pdf = buildGenericReport(m, input, result, ctx);
      expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
    }
  });
});
