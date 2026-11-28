// One contract for every calculation module of Open Geotechniek Studio.
//
// The modules are the app's own (apps/desktop/src/calc/framework/headlessRegistry.ts):
// same defaults, same compute, same checks and the same PDF report. Nothing here
// recalculates; this file only builds the project context the app would pass and
// makes the results JSON-safe. No Node built-ins: this file also runs in a browser.
import type { CalcCheck, CalculationInstance, HeadlessCalcModule, ProjectContext } from "../../../apps/desktop/src/calc/framework/types";
import { APP_HEADLESS_MODULES, HEADLESS_REGISTRY, getHeadlessModule } from "../../../apps/desktop/src/calc/framework/headlessRegistry";
import { buildGenericReport } from "../../../apps/desktop/src/calc/framework/genericReport";
import { generateCptReport } from "../../../apps/desktop/src/utils/cptReport";
import { DEFAULT_SECTIONS, type ReportSections } from "../../../apps/desktop/src/store/reportSectionsState";
import { mergeBrand, useReportBrand, type ReportBrand } from "../../../apps/desktop/src/report/reportBrand";
import type { Cpt, ProjectMeta } from "../../../apps/desktop/src/types/cpt";
import type { Bore } from "../../../apps/desktop/src/types/bore";
import { analyzeLayers } from "../../../apps/desktop/src/utils/layerAnalysis";
import { buildSoilModel } from "../../../apps/desktop/src/components/soil3d/soilModel";
import { toCpt, type CptSource } from "./cpt";
import { LANGUAGES, text, withLanguage, withLanguageAsync, type Language } from "./i18n";
import { toJsonSafe, validateSchema, type JsonSchema, type SchemaValidation } from "./schema";
import schemas from "./generated/schemas.json";

declare const __OGS_VERSION__: string;
const VERSION = __OGS_VERSION__;

export { LANGUAGES, type Language, validateSchema, toJsonSafe, type JsonSchema, type SchemaValidation };
export type { CalcCheck, ProjectMeta, ReportBrand, ReportSections, Cpt, Bore };

/** Version of the input format per module. Raise it with a migration in MIGRATIONS when a field changes meaning. */
const INPUT_VERSION = 1;

/** How a module uses CPTs. */
export type CptUse = "none" | "defaults" | "required" | "project";
const CPT_USE: Record<string, CptUse> = {
  "pile-bearing-capacity": "required", // input.cptId; the report also uses the other CPTs (capacity table)
  "tension-pile": "required",
  "driving-assessment": "required",
  "foundation-advice": "project", // all CPTs and the other calculations of the project
  "spread-foundation": "defaults", // the layer proposal of defaultInput
  "sheet-pile-wall": "defaults",
  "laterally-loaded-pile": "none",
  "pad-foundation": "none",
  settlement: "none",
  kalendering: "none",
};

export interface ModuleInfo {
  id: string;
  name: { nl: string; en: string };
  subtitle: { nl: string; en: string };
  /** Name and subtitle in the requested language. */
  label: string;
  description: string;
  category: string;
  norm: string;
  /** Release status as shown in the app. */
  status: "Beta release";
  /** Package version (calver) the module ships with; the same as the app version. */
  version: string;
  inputVersion: number;
  cpts: CptUse;
  /** "module": the app's own PDF report; "generic": a generated calculation sheet. */
  report: "module" | "generic";
  /** Offered in the app's module list (false: kept for older projects and the API). */
  inApp: boolean;
}

export interface ContextOptions {
  /** CPT snapshots or GEF/JSON sources ({content, filename}). */
  cpts?: CptSource[];
  /** The CPT `defaultInput` starts from; default the first of `cpts`. */
  cpt?: CptSource | string;
  project?: Partial<ProjectMeta>;
  /** Other calculations of the project, for the foundation advice. */
  calculations?: Array<{ id: string; moduleId: string; name?: string; input: unknown }>;
  /** Language of texts, checks and number formats (nl, en, de, fr, es, it, pt, pl, da, sv). */
  lang?: string;
}

export interface ComputeOptions extends ContextOptions {
  /** Reject input that does not match the schema instead of only reporting it. */
  strict?: boolean;
}

export interface ReportOptions extends ContextOptions {
  /** A result from computeRaw for this input; otherwise the report computes it. */
  result?: unknown;
  /** House style of the report; missing fields fall back to the default. */
  brand?: Partial<ReportBrand>;
}

export interface ComputeResult {
  moduleId: string;
  moduleVersion: string;
  inputVersion: number;
  /** false when the module could not calculate (missing CPT, invalid input). */
  ok: boolean;
  error?: string;
  status: { text: string; ok: boolean; pending?: boolean } | null;
  /** Core results as in the chips under the input: a check with `uc` passes at uc <= 1. */
  checks: Array<CalcCheck & { passes?: boolean }>;
  /** Highest unity check of the checks; null without checks. */
  governingUc: number | null;
  passes: boolean | null;
  /** The module result, JSON-safe (Map → object, non-finite → null). */
  result: unknown;
  validation: SchemaValidation;
  messages: string[];
}

function requireModule(id: string): HeadlessCalcModule {
  const mod = getHeadlessModule(id);
  if (!mod) throw new Error(`Unknown module "${id}". Known: ${HEADLESS_REGISTRY.map((m) => m.id).join(", ")}`);
  return mod;
}

const inApp = new Set(APP_HEADLESS_MODULES.map((m) => m.id));

/** All calculation modules. */
export function listModules(options: { lang?: string } = {}): ModuleInfo[] {
  return HEADLESS_REGISTRY.map((m) => ({
    id: m.id,
    name: { nl: m.name, en: text("en", `calc:modules.${m.id}.name`, m.name) },
    subtitle: { nl: m.subtitle, en: text("en", `calc:modules.${m.id}.subtitle`, m.subtitle) },
    label: text(options.lang, `calc:modules.${m.id}.name`, m.name),
    description: text(options.lang, `calc:modules.${m.id}.subtitle`, m.subtitle),
    category: m.category,
    norm: m.norm,
    status: "Beta release",
    version: VERSION,
    inputVersion: INPUT_VERSION,
    cpts: CPT_USE[m.id] ?? "none",
    report: m.buildReport ? "module" : "generic",
    inApp: inApp.has(m.id),
  }));
}

export function getModule(id: string, options: { lang?: string } = {}): ModuleInfo {
  requireModule(id);
  return listModules(options).find((m) => m.id === id)!;
}

const DEFAULT_PROJECT: ProjectMeta = { title: "", client: "", location: "", project_number: "", author: "", date: "" };

/** The project context the app passes to a module. */
export function projectContext(options: ContextOptions = {}, input?: unknown): ProjectContext {
  const list = (options.cpts ?? []).map(toCpt);
  const cpts = new Map(list.map((c) => [c.id, c] as const));
  let active: string | null = null;
  if (typeof options.cpt === "string") active = options.cpt;
  else if (options.cpt) { const c = toCpt(options.cpt); if (!cpts.has(c.id)) cpts.set(c.id, c); active = c.id; }
  const cptId = input && typeof input === "object" ? (input as { cptId?: unknown }).cptId : undefined;
  if (!active && typeof cptId === "string") active = cptId;
  if (!active) active = cpts.keys().next().value ?? null;
  const now = new Date().toISOString();
  const calculations: CalculationInstance[] = (options.calculations ?? []).map((c, i) => ({
    id: c.id ?? `calc-${i + 1}`, moduleId: c.moduleId, name: c.name ?? c.id ?? `Berekening ${i + 1}`, input: c.input, createdAt: now, updatedAt: now,
  }));
  return { cpts, activeCptId: active, projectMeta: { ...DEFAULT_PROJECT, date: now.slice(0, 10), ...options.project }, calculations };
}

/** Default input of a module, as the app makes it for a new calculation (with the given CPT). */
export function defaultInput(id: string, options: ContextOptions = {}): unknown {
  const mod = requireModule(id);
  return toJsonSafe(withLanguage(options.lang, () => mod.defaultInput(projectContext(options))));
}

function withDefaults(schema: JsonSchema, value: unknown): JsonSchema {
  const s = { ...schema };
  if (value !== undefined && !s.$ref) s.default = toJsonSafe(value);
  if (s.type === "object" && s.properties && value && typeof value === "object" && !Array.isArray(value)) {
    s.properties = Object.fromEntries(Object.entries(s.properties as Record<string, JsonSchema>).map(([k, p]) => [k, withDefaults(p, (value as Record<string, unknown>)[k])]));
  }
  return s;
}

/**
 * JSON Schema (2020-12) of the input of a module, generated from its TypeScript
 * input type; descriptions and units ("x-unit") from the type's documentation,
 * defaults from defaultInput without a CPT (or with `cpt` when given).
 */
export function moduleSchema(id: string, options: ContextOptions = {}): JsonSchema {
  const mod = requireModule(id);
  const base = (schemas as Record<string, JsonSchema>)[id];
  if (!base) throw new Error(`No schema generated for "${id}"`);
  const defaults = defaultInput(id, options);
  const info = getModule(id, options);
  return {
    ...withDefaults(base, defaults),
    title: info.label,
    description: `${info.description}. ${mod.norm}`,
    "x-module": { id, version: VERSION, inputVersion: INPUT_VERSION, cpts: info.cpts },
  };
}

export function validateInput(id: string, input: unknown): SchemaValidation {
  requireModule(id);
  return validateSchema((schemas as Record<string, JsonSchema>)[id], input);
}

type Migration = (input: Record<string, unknown>) => Record<string, unknown>;
/** Input migrations per module: MIGRATIONS[id][n] turns version n into n + 1. None yet. */
const MIGRATIONS: Record<string, Record<number, Migration>> = {};

/**
 * Brings stored input up to the current input version. Modules read older
 * input themselves (optional fields have a documented default); this adds the
 * migrations of later input versions and fills missing required top-level
 * fields from the module defaults, so a saved input of an older release still computes.
 */
export function migrateInput(id: string, input: unknown, fromVersion = INPUT_VERSION, options: ContextOptions = {}): { input: unknown; inputVersion: number; notes: string[] } {
  requireModule(id);
  if (fromVersion > INPUT_VERSION) throw new Error(`Input version ${fromVersion} is newer than this package (${INPUT_VERSION}); update @openaec/geotechniek-core.`);
  let value = (input && typeof input === "object" ? structuredClone(input) : {}) as Record<string, unknown>;
  const notes: string[] = [];
  for (let v = fromVersion; v < INPUT_VERSION; v++) { const m = MIGRATIONS[id]?.[v]; if (m) { value = m(value); notes.push(`migrated from input version ${v} to ${v + 1}`); } }
  const schema = (schemas as Record<string, JsonSchema>)[id];
  const defaults = defaultInput(id, options) as Record<string, unknown>;
  for (const key of schema.required ?? []) if (value[key] === undefined && defaults[key] !== undefined) { value[key] = defaults[key]; notes.push(`${key}: filled from the defaults`); }
  return { input: value, inputVersion: INPUT_VERSION, notes };
}

function prepare(id: string, input: unknown, options: ContextOptions) {
  const mod = requireModule(id);
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  const messages: string[] = [];
  const ctx = projectContext(options, input);
  let value = input as Record<string, unknown>;
  // A CPT module without cptId takes the only (or first) CPT supplied, as the app does for a new calculation.
  if (CPT_USE[id] === "required" && (value.cptId === undefined || value.cptId === null) && ctx.activeCptId) {
    value = { ...value, cptId: ctx.activeCptId };
    messages.push(`cptId not given: using CPT ${ctx.activeCptId}`);
  }
  if (typeof value.cptId === "string" && CPT_USE[id] === "required" && !ctx.cpts.has(value.cptId)) messages.push(`CPT ${value.cptId} is not among the supplied CPTs`);
  return { mod, ctx, input: value, messages };
}

/** Computes a module and returns the module's own result object (not JSON-safe; for report()). */
export function computeRaw(id: string, input: unknown, options: ContextOptions = {}): unknown {
  const p = prepare(id, input, options);
  return withLanguage(options.lang, () => p.mod.compute(p.input, p.ctx));
}

/** Computes a module: the same numbers as the app, with its checks and status line. */
export function compute(id: string, input: unknown, options: ComputeOptions = {}): ComputeResult {
  const p = prepare(id, input, options);
  const validation = validateSchema((schemas as Record<string, JsonSchema>)[id], p.input);
  const base = { moduleId: id, moduleVersion: VERSION, inputVersion: INPUT_VERSION, validation, messages: p.messages };
  if (options.strict && !validation.valid) throw Object.assign(new Error(`Invalid input: ${validation.errors.slice(0, 5).join("; ")}`), { validation });
  return withLanguage(options.lang, () => {
    let raw: unknown;
    try {
      raw = p.mod.compute(p.input, p.ctx);
    } catch (e) {
      return { ...base, ok: false, error: e instanceof Error ? e.message : String(e), status: null, checks: [], governingUc: null, passes: null, result: null };
    }
    const r = raw as { ok?: unknown; error?: unknown };
    const ok = typeof r?.ok === "boolean" ? r.ok : true;
    const checks = (p.mod.checks?.(p.input, raw) ?? []).map((c) => (c.uc === undefined ? { ...c } : { ...c, uc: Number.isFinite(c.uc) ? c.uc : null as unknown as number, passes: Number.isFinite(c.uc) ? c.uc <= 1 : false }));
    const ucs = (p.mod.checks?.(p.input, raw) ?? []).flatMap((c) => (c.uc === undefined ? [] : [c.uc]));
    const governingUc = ucs.length ? Math.max(...ucs) : null;
    return {
      ...base, ok, ...(typeof r?.error === "string" ? { error: r.error } : {}),
      status: p.mod.statusLine?.(raw) ?? null,
      checks,
      governingUc: governingUc === null ? null : Number.isFinite(governingUc) ? governingUc : null,
      passes: governingUc === null ? null : governingUc <= 1,
      result: toJsonSafe(raw),
    };
  });
}

function withBrand<T>(brand: Partial<ReportBrand> | undefined, fn: () => T): T {
  if (!brand) return fn();
  const before = useReportBrand.getState();
  const saved = { brand: before.brand, source: before.source, error: before.error };
  useReportBrand.setState({ brand: mergeBrand(brand), source: "api", error: null });
  try { return fn(); } finally { useReportBrand.setState(saved); }
}

/** The report file name the app proposes, without extension. */
export function reportFileName(id: string, input: unknown): string {
  const mod = requireModule(id);
  return mod.reportFileName?.(input) ?? id;
}

/** The PDF report of a module, as the app exports it. */
export function reportSync(id: string, input: unknown, options: ReportOptions = {}): Uint8Array {
  const p = prepare(id, input, options);
  return withLanguage(options.lang, () => withBrand(options.brand, () => {
    const result = options.result ?? p.mod.compute(p.input, p.ctx);
    const r = result as { ok?: unknown; error?: unknown };
    if (!p.mod.buildReport) {
      if (r?.ok === false) throw new Error(typeof r.error === "string" ? r.error : "Calculation failed");
      return buildGenericReport(p.mod, p.input, result, p.ctx);
    }
    return p.mod.buildReport(p.input, result, p.ctx);
  }));
}

/** The PDF report of a module (Promise form of reportSync). */
export async function report(id: string, input: unknown, options: ReportOptions = {}): Promise<Uint8Array> {
  return reportSync(id, input, options);
}

export interface CptReportOptions {
  project?: Partial<ProjectMeta>;
  /** Parts of the report; missing parts as in the app's default selection. */
  sections?: Partial<ReportSections>;
  bores?: Bore[];
  lang?: string;
  brand?: Partial<ReportBrand>;
}

/** The CPT report (sonderingsrapport) of the app. Offline by default: the overview map is an RD grid;
 *  sections.basemap = true fetches the aerial photo and cadastral map (PDOK) as the app does. */
export function cptReport(cpts: CptSource[], options: CptReportOptions = {}): Promise<Uint8Array> {
  const list = cpts.map(toCpt);
  const project = { ...DEFAULT_PROJECT, date: new Date().toISOString().slice(0, 10), ...options.project };
  const sections: ReportSections = { ...DEFAULT_SECTIONS, basemap: false, ...options.sections, ...(options.bores ? { bores: options.bores } : {}) };
  return withLanguageAsync(options.lang, async () => {
    if (!options.brand) return generateCptReport(list, project, sections);
    const before = useReportBrand.getState(), saved = { brand: before.brand, source: before.source, error: before.error };
    useReportBrand.setState({ brand: mergeBrand(options.brand), source: "api", error: null });
    try { return await generateCptReport(list, project, sections); } finally { useReportBrand.setState(saved); }
  });
}

/** Indicative qc/Rf layer interpretation of a CPT, as the modules and the app use it. */
export function cptLayers(cpt: CptSource) {
  return toJsonSafe(analyzeLayers(toCpt(cpt)));
}

/** The 3D soil model (interpolated soil class per cell) the foundation advice uses. */
export function soilModel(cpts: CptSource[], options: { bearingQcMpa?: number; bearingMinThicknessM?: number } = {}) {
  return toJsonSafe(buildSoilModel(cpts.map(toCpt), options as Parameters<typeof buildSoilModel>[1]));
}

/** Packed contract version of a stored sheet: what an integrating application saves. */
export interface StoredCalculation {
  moduleId: string;
  moduleVersion: string;
  inputVersion: number;
  input: unknown;
  cpts: Cpt[];
}

/** A stored calculation for a module, with the defaults and the given CPTs. */
export function newCalculation(id: string, options: ContextOptions = {}): StoredCalculation {
  const ctx = projectContext(options);
  return { moduleId: id, moduleVersion: VERSION, inputVersion: INPUT_VERSION, input: defaultInput(id, options), cpts: [...ctx.cpts.values()] };
}

export const MODULE_IDS = HEADLESS_REGISTRY.map((m) => m.id);
