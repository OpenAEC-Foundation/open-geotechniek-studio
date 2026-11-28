// OpenAPI 3.1 description of the HTTP API (v1 and v2). Built into dist/openapi.json
// and served at GET /openapi.json.
import { listModules, moduleSchema, LANGUAGES } from "./modules";

declare const __OGS_VERSION__: string;

const json = (schema: object) => ({ "application/json": { schema } });
const error = { description: "Error", content: json({ $ref: "#/components/schemas/Error" }) };

export function openApi(): Record<string, unknown> {
  const modules = listModules();
  const ids = modules.map((m) => m.id);
  const inputs = Object.fromEntries(ids.map((id) => [`Input_${id}`, (() => { const { $schema, $id, ...s } = moduleSchema(id) as Record<string, unknown>; void $schema; void $id; return s; })()]));
  const cpt = { anyOf: [{ $ref: "#/components/schemas/CptSnapshot" }, { type: "object", required: ["content", "filename"], properties: { content: { type: "string", description: "GEF or JSON source text" }, filename: { type: "string" } } }] };
  const context = {
    cpts: { type: "array", items: cpt, description: "CPTs the calculation uses (snapshots or GEF/JSON sources)." },
    project: { $ref: "#/components/schemas/Project" },
    calculations: { type: "array", description: "Other calculations of the project (foundation advice).", items: { type: "object", required: ["id", "moduleId", "input"], properties: { id: { type: "string" }, moduleId: { type: "string", enum: ids }, name: { type: "string" }, input: { type: "object" } } } },
    lang: { type: "string", enum: [...LANGUAGES], default: "nl" },
  };
  const idParam = { name: "id", in: "path", required: true, schema: { type: "string", enum: ids } };
  return {
    openapi: "3.1.0",
    info: { title: "Open Geotechniek Studio headless API", version: __OGS_VERSION__, description: "Stateless calculation, report and CPT API. Beta release: results are indicative." },
    servers: [{ url: "http://127.0.0.1:8788" }],
    components: {
      securitySchemes: { bearer: { type: "http", scheme: "bearer", description: "Required when OGS_API_TOKEN is set." } },
      schemas: {
        Error: { type: "object", required: ["error"], properties: { error: { type: "string" }, validation: { type: "object" } } },
        Project: { type: "object", properties: { title: { type: "string" }, client: { type: "string" }, location: { type: "string" }, project_number: { type: "string" }, author: { type: "string" }, date: { type: "string", format: "date" } } },
        CptSnapshot: { type: "object", required: ["id", "metadata", "points"], properties: { id: { type: "string" }, metadata: { type: "object" }, points: { type: "array", items: { type: "object", required: ["depth"], properties: { depth: { type: "number" }, qc: { type: "number" }, fs: { type: "number" }, rf: { type: "number" }, u2: { type: "number" } } } }, position: { type: "object" } } },
        Module: { type: "object", properties: { id: { type: "string" }, name: { type: "object" }, subtitle: { type: "object" }, label: { type: "string" }, description: { type: "string" }, category: { type: "string" }, norm: { type: "string" }, status: { const: "Beta release" }, version: { type: "string" }, inputVersion: { type: "integer" }, cpts: { enum: ["none", "defaults", "required", "project"] }, report: { enum: ["module", "generic"] }, inApp: { type: "boolean" } } },
        Check: { type: "object", required: ["label", "value"], properties: { label: { type: "string" }, value: { type: "string" }, uc: { type: ["number", "null"] }, passes: { type: "boolean" } } },
        ComputeResult: { type: "object", properties: { moduleId: { type: "string" }, moduleVersion: { type: "string" }, inputVersion: { type: "integer" }, ok: { type: "boolean" }, error: { type: "string" }, status: { type: ["object", "null"] }, checks: { type: "array", items: { $ref: "#/components/schemas/Check" } }, governingUc: { type: ["number", "null"] }, passes: { type: ["boolean", "null"] }, result: {}, validation: { type: "object" }, messages: { type: "array", items: { type: "string" } } } },
        ...inputs,
      },
    },
    security: [{ bearer: [] }, {}],
    paths: {
      "/health": { get: { security: [], summary: "Liveness probe", responses: { 200: { description: "OK", content: json({ type: "object" }) } } } },
      "/version": { get: { summary: "Version and API versions", responses: { 200: { description: "OK", content: json({ type: "object" }) } } } },
      "/openapi.json": { get: { summary: "This description", responses: { 200: { description: "OK" } } } },
      "/modules": { get: { summary: "All calculation modules", parameters: [{ name: "lang", in: "query", schema: { type: "string", enum: [...LANGUAGES] } }], responses: { 200: { description: "OK", content: json({ type: "array", items: { $ref: "#/components/schemas/Module" } }) } } } },
      "/modules/{id}/schema": { get: { summary: "JSON Schema of the input, with defaults and units", parameters: [idParam, { name: "lang", in: "query", schema: { type: "string" } }], responses: { 200: { description: "JSON Schema 2020-12", content: json({ type: "object" }) }, 404: error } } },
      "/modules/{id}/default": { post: { summary: "Default input, optionally from a CPT", parameters: [idParam], requestBody: { content: json({ type: "object", properties: { cpt: cpt, ...context } }) }, responses: { 200: { description: "Input", content: json({ type: "object" }) }, 400: error, 404: error } } },
      "/modules/{id}/compute": { post: { summary: "Compute a module", parameters: [idParam, { name: "strict", in: "query", schema: { type: "boolean" } }], requestBody: { required: true, content: json({ type: "object", required: ["input"], properties: { input: { type: "object" }, ...context } }) }, responses: { 200: { description: "Result", content: json({ $ref: "#/components/schemas/ComputeResult" }) }, 400: error, 404: error, 422: error } } },
      "/modules/{id}/report": { post: { summary: "PDF report of a module", parameters: [idParam], requestBody: { required: true, content: json({ type: "object", required: ["input"], properties: { input: { type: "object" }, brand: { type: "object" }, ...context } }) }, responses: { 200: { description: "PDF", content: { "application/pdf": { schema: { type: "string", format: "binary" } } } }, 400: error, 404: error, 422: error } } },
      "/cpt/report": { post: { summary: "CPT report (sonderingsrapport)", requestBody: { required: true, content: json({ type: "object", required: ["cpts"], properties: { cpts: context.cpts, project: context.project, sections: { type: "object", description: "cover, coordTable, map, perCpt, sbtLegend, metadata, texts, testReport, dissipation, magnetometer, boreLogs, basemap, chartScale, coverTitle" }, lang: context.lang, brand: { type: "object" } } }) }, responses: { 200: { description: "PDF", content: { "application/pdf": { schema: { type: "string", format: "binary" } } } }, 400: error } } },
      "/cpt/layers": { post: { summary: "Indicative qc/Rf layer interpretation", requestBody: { required: true, content: json({ type: "object", required: ["cpt"], properties: { cpt } }) }, responses: { 200: { description: "Layers", content: json({ type: "object" }) }, 400: error } } },
      "/parse": { post: { summary: "v1: parse GEF or a CPT JSON snapshot", requestBody: { content: json({ type: "object", required: ["content", "filename"], properties: { content: { type: "string" }, filename: { type: "string" } } }) }, responses: { 200: { description: "CPT and validation" }, 400: error } } },
      "/validate": { post: { summary: "v1: validate a CPT snapshot", responses: { 200: { description: "{valid, errors}" } } } },
      "/settlement": { post: { summary: "v1: one-layer settlement", requestBody: { content: json({ $ref: "#/components/schemas/Input_settlement" }) }, responses: { 200: { description: "Result" }, 422: error } } },
      "/pad-foundation": { post: { summary: "v1: drained pad resistance (EN 1997-1 Annex D)", requestBody: { content: json({ $ref: "#/components/schemas/Input_pad-foundation" }) }, responses: { 200: { description: "Result" }, 422: error } } },
    },
  };
}
