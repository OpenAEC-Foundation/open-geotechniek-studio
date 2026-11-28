// Parity of the headless core (packages/core) with the app.
//
// This test computes every module the way the app does (the module's own
// compute, checks and status line, in the app's test environment) for fixed
// example inputs, and compares that with packages/core/test/parity.json.
// packages/core/test.mjs computes the same inputs through the built package and
// compares with the same file. So both sides are pinned to one set of numbers.
// After an intended change of a calculation: UPDATE_PARITY=1 npx vitest run src/calc/framework/coreParity.test.ts
import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { CALC_REGISTRY } from "./registry";
import { getHeadlessModule } from "./headlessRegistry";
import type { HeadlessCalcModule, ProjectContext } from "./types";
import { parseGef } from "../../types/gefParser";
import { lateralExample } from "../modules/laterally-loaded-pile/compute";
import { toJsonSafe } from "../../../../../packages/core/src/schema";
import type { Cpt } from "../../types/cpt";

const FIXTURES = resolve(__dirname, "../modules/pile-bearing-capacity/__fixtures__");
const PARITY = resolve(__dirname, "../../../../../packages/core/test/parity.json");
const gef = (name: string) => parseGef(readFileSync(resolve(FIXTURES, name), "latin1"), name);
const PROJECT = { title: "Pariteit", client: "", location: "", project_number: "P-1", author: "", date: "2026-11-28" };

/** Short, stable fingerprint of a JSON-safe result: numbers to 10 significant digits, FNV-1a over the JSON. */
export function digest(value: unknown): string {
  const text = JSON.stringify(value, (_k, v) => (typeof v === "number" ? Number(v.toPrecision(10)) : v));
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return `${h.toString(16).padStart(8, "0")}-${text.length}`;
}

interface Case { moduleId: string; cptFiles: string[]; input: unknown; calculations?: Array<{ id: string; moduleId: string; name: string; input: unknown }> }

function ctxOf(cpts: Cpt[], active: string | null, calculations: Case["calculations"] = []): ProjectContext {
  const now = "2026-11-28T00:00:00.000Z";
  return { cpts: new Map(cpts.map((c) => [c.id, c])), activeCptId: active, projectMeta: PROJECT, calculations: calculations.map((c) => ({ ...c, createdAt: now, updatedAt: now })) };
}

function cases(): Case[] {
  const c1 = gef("121882_1.gef"), c2 = gef("121882_2.gef");
  const mod = (id: string) => getHeadlessModule(id)!;
  const def = (id: string, cpts: Cpt[]) => mod(id).defaultInput(ctxOf(cpts, cpts[0]?.id ?? null)) as Record<string, unknown>;
  const pile = { ...def("pile-bearing-capacity", [c1]), nEd: 300, nEk: 230 };
  return [
    { moduleId: "pile-bearing-capacity", cptFiles: ["121882_1.gef"], input: pile },
    { moduleId: "tension-pile", cptFiles: ["121882_1.gef"], input: { ...def("tension-pile", [c1]), ftDKn: 100 } },
    { moduleId: "laterally-loaded-pile", cptFiles: [], input: structuredClone(lateralExample) },
    { moduleId: "driving-assessment", cptFiles: ["121882_1.gef"], input: def("driving-assessment", [c1]) },
    { moduleId: "spread-foundation", cptFiles: ["121882_1.gef"], input: def("spread-foundation", [c1]) },
    { moduleId: "sheet-pile-wall", cptFiles: [], input: def("sheet-pile-wall", []) },
    { moduleId: "foundation-advice", cptFiles: ["121882_1.gef", "121882_2.gef"], input: def("foundation-advice", [c1, c2]),
      calculations: [{ id: "paal-1", moduleId: "pile-bearing-capacity", name: "Paal 1", input: pile }] },
    { moduleId: "pad-foundation", cptFiles: [], input: def("pad-foundation", []) },
    { moduleId: "settlement", cptFiles: [], input: def("settlement", []) },
    { moduleId: "kalendering", cptFiles: [], input: def("kalendering", []) },
  ];
}

function run(mod: HeadlessCalcModule, k: Case) {
  const cpts = k.cptFiles.map(gef);
  const input = toJsonSafe(k.input);
  const cptId = (input as { cptId?: string }).cptId ?? null;
  const result = mod.compute(input, ctxOf(cpts, cptId ?? cpts[0]?.id ?? null, k.calculations));
  return {
    moduleId: k.moduleId, cptFiles: k.cptFiles, input, ...(k.calculations ? { calculations: k.calculations } : {}),
    expected: { ok: (result as { ok?: boolean }).ok ?? true, status: mod.statusLine?.(result) ?? null, checks: toJsonSafe(mod.checks?.(input, result) ?? []), digest: digest(toJsonSafe(result)) },
  };
}

describe("parity of the headless core with the app", () => {
  const computed = cases().map((k) => run(getHeadlessModule(k.moduleId)!, k));

  it("covers every module of the app", () => {
    for (const m of CALC_REGISTRY) expect(computed.some((c) => c.moduleId === m.id), m.id).toBe(true);
  });

  it("matches packages/core/test/parity.json", () => {
    if (process.env.UPDATE_PARITY) writeFileSync(PARITY, JSON.stringify(computed, null, 1) + "\n");
    const stored = JSON.parse(readFileSync(PARITY, "utf8"));
    expect(computed).toEqual(stored);
  });

  it("every case computes", () => {
    for (const c of computed) expect(c.expected.ok, c.moduleId).toBe(true);
  });
});
