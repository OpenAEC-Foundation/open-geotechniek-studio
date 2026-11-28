// Public types of @openaec/geotechniek-core. Hand-maintained: test.mjs checks that
// every runtime export of dist/index.mjs is declared here. Module inputs and results
// are typed as plain JSON; their exact shape is the JSON Schema of moduleSchema(id).

export declare const version: string;

// ---------------------------------------------------------------- CPT
export interface CptPoint { depth: number; depth_nap?: number; qc?: number; fs?: number; rf?: number; u2?: number; inclination?: number; pre_excavated?: boolean; parameters?: Record<string, number | null> }
export interface CptMetadata { source_file: string; ground_level_nap?: number; date?: string; project_name?: string; project_number?: string; equipment?: string; predrilled_depth_m?: number; extra?: Record<string, string>; [key: string]: unknown }
/** CPT snapshot: depth in m below the reference level, qc/fs/u2 in MPa, rf in %, position in RD metres. */
export interface Cpt { id: string; metadata: CptMetadata; position?: { x_rd: number; y_rd: number; z_nap?: number }; points: CptPoint[]; [key: string]: unknown }
/** A CPT as the contract accepts it: a snapshot, or GEF/JSON source text with its file name. */
export type CptSource = Cpt | { content: string; filename: string };
export interface Importer { id: string; matches: (content: string, filename: string) => boolean; parse: (content: string, filename: string) => Cpt }

export declare function parseDocument(content: string, filename: string): Cpt;
export declare function parseGef(content: string, filename: string): Cpt;
export declare function parseGefBore(content: string, filename: string): unknown;
export declare function validateCpt(value: unknown): { valid: boolean; errors: string[] };
export declare function toCpt(value: CptSource): Cpt;
export declare function registerImporter(importer: Importer): void;
export declare function validationOf(cpt: Cpt): unknown;
export declare function decodeSource(bytes: Uint8Array): { text: string; diagnostics: unknown[] };
export declare function exportGef(cpt: Cpt): { text: string; warnings: string[] };
export declare function normalizeCpt(cpt: Cpt, ...rest: unknown[]): unknown;
export declare function analyzeLayers(cpt: Cpt, settings?: unknown): { layers: Array<{ depth_top: number; depth_bottom: number; zone_number: number; zone_name: string; zone_color: string }>; provenance: unknown; warnings: string[] };
export declare function withLayerInterpretation(cpt: Cpt, settings?: unknown, manualLayers?: unknown): Cpt;
export declare function detectLayers(cpt: Cpt, ...rest: unknown[]): unknown;
export declare function cptLayers(cpt: CptSource): unknown;
export declare function soilModel(cpts: CptSource[], options?: { bearingQcMpa?: number; bearingMinThicknessM?: number }): unknown;

// ---------------------------------------------------------------- v1 calculations
export declare function computeSettlement(input: { thicknessM: number; stressIncreaseKpa: number; constrainedModulusMpa: number }): { ok: true; settlementMm: number; strain: number; warning: string | null } | { ok: false; error: string };
export declare function computePad(input: { widthM: number; lengthM: number; verticalDesignLoadKn: number; frictionDesignDeg: number; cohesionDesignKpa: number; surchargeDesignKpa: number; effectiveUnitWeightKnM3: number; resistanceFactor: number }): ({ ok: true; resistanceKn: number; utilization: number; passes: boolean } & Record<string, unknown>) | { ok: false; error: string };

// ---------------------------------------------------------------- module contract
export declare const LANGUAGES: readonly ["nl", "en", "de", "fr", "es", "it", "pt", "pl", "da", "sv"];
export type Language = (typeof LANGUAGES)[number];
export declare const MODULE_IDS: string[];
export type JsonSchema = Record<string, any>;
export interface SchemaValidation { valid: boolean; errors: string[] }
export type CptUse = "none" | "defaults" | "required" | "project";
export interface ProjectMeta { title: string; client: string; location: string; project_number: string; author: string; date: string; report_texts?: { introduction?: string; levelling?: string; groundwater?: string } }
export interface ReportBrand { organization: string; tagline: string; website: string; accent: [number, number, number]; secondary?: [number, number, number]; dark?: [number, number, number]; logoDataUrl?: string; logoOnDarkDataUrl?: string; coverImage?: string; pageImage?: string; contact?: string; badges: string[] }
export interface CalcCheck { label: string; value: string; uc?: number | null; passes?: boolean }

export interface ModuleInfo {
  id: string;
  name: { nl: string; en: string };
  subtitle: { nl: string; en: string };
  label: string;
  description: string;
  category: string;
  norm: string;
  status: "Beta release";
  version: string;
  inputVersion: number;
  cpts: CptUse;
  report: "module" | "generic";
  inApp: boolean;
}

export interface ContextOptions {
  cpts?: CptSource[];
  cpt?: CptSource | string;
  project?: Partial<ProjectMeta>;
  calculations?: Array<{ id: string; moduleId: string; name?: string; input: unknown }>;
  lang?: string;
}
export interface ComputeOptions extends ContextOptions { strict?: boolean }
export interface ReportOptions extends ContextOptions { result?: unknown; brand?: Partial<ReportBrand> }

export interface ComputeResult {
  moduleId: string;
  moduleVersion: string;
  inputVersion: number;
  ok: boolean;
  error?: string;
  status: { text: string; ok: boolean; pending?: boolean } | null;
  checks: CalcCheck[];
  governingUc: number | null;
  passes: boolean | null;
  result: unknown;
  validation: SchemaValidation;
  messages: string[];
}

export interface ReportSections {
  cover: boolean; coordTable: boolean; map: boolean; perCpt: boolean; sbtLegend: boolean; metadata: boolean;
  texts?: boolean; testReport?: boolean; dissipation?: boolean; magnetometer?: boolean; boreLogs?: boolean;
  basemap?: boolean; chartScale?: number | null; coverTitle?: string; bores?: unknown[];
}
export interface CptReportOptions { project?: Partial<ProjectMeta>; sections?: Partial<ReportSections>; bores?: unknown[]; lang?: string; brand?: Partial<ReportBrand> }

export interface StoredCalculation { moduleId: string; moduleVersion: string; inputVersion: number; input: unknown; cpts: Cpt[] }

export declare function listModules(options?: { lang?: string }): ModuleInfo[];
export declare function getModule(id: string, options?: { lang?: string }): ModuleInfo;
export declare function moduleSchema(id: string, options?: ContextOptions): JsonSchema;
export declare function defaultInput(id: string, options?: ContextOptions): unknown;
export declare function validateInput(id: string, input: unknown): SchemaValidation;
export declare function migrateInput(id: string, input: unknown, fromVersion?: number, options?: ContextOptions): { input: unknown; inputVersion: number; notes: string[] };
export declare function projectContext(options?: ContextOptions, input?: unknown): unknown;
export declare function compute(id: string, input: unknown, options?: ComputeOptions): ComputeResult;
export declare function computeRaw(id: string, input: unknown, options?: ContextOptions): unknown;
export declare function report(id: string, input: unknown, options?: ReportOptions): Promise<Uint8Array>;
export declare function reportSync(id: string, input: unknown, options?: ReportOptions): Uint8Array;
export declare function reportFileName(id: string, input: unknown): string;
export declare function cptReport(cpts: CptSource[], options?: CptReportOptions): Promise<Uint8Array>;
export declare function newCalculation(id: string, options?: ContextOptions): StoredCalculation;
export declare function validateSchema(schema: JsonSchema, value: unknown, limit?: number): SchemaValidation;
export declare function toJsonSafe(value: unknown): unknown;
export declare function openApi(): Record<string, unknown>;
