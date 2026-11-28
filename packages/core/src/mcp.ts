// MCP server over stdio (newline-delimited JSON-RPC, protocol 2024-11-05).
// Stateless and read-only: no files are read or written; PDF reports come back
// as an embedded resource (base64).
import readline from "node:readline";
import {
  parseDocument,
  validateCpt,
  computeSettlement,
  computePad,
  version,
  listModules,
  moduleSchema,
  defaultInput,
  compute,
  report,
  reportFileName,
  cptReport,
  cptLayers,
  MODULE_IDS,
  LANGUAGES,
} from "./index";

const cpts = { type: "array", description: "CPTs: snapshots from parse_gef, or {content, filename} with GEF/JSON source text.", items: { type: "object" } };
const lang = { type: "string", enum: [...LANGUAGES], description: "Language of texts and number format; default nl." };
const project = { type: "object", description: "Project data for the report header: title, client, location, project_number, author, date.", properties: { title: { type: "string" }, client: { type: "string" }, location: { type: "string" }, project_number: { type: "string" }, author: { type: "string" }, date: { type: "string" } } };
const calculations = { type: "array", description: "Other calculations of the project ({id, moduleId, name, input}); used by foundation-advice.", items: { type: "object" } };
const moduleId = { type: "string", enum: MODULE_IDS };

const tools = [
  { name: "pad_foundation", description: "Concept EC7 Annex D drained bearing resistance. Centric vertical load; caller supplies design values and project resistance factor. Not a complete foundation design.", inputSchema: { type: "object", properties: Object.fromEntries(["widthM", "lengthM", "verticalDesignLoadKn", "frictionDesignDeg", "cohesionDesignKpa", "surchargeDesignKpa", "effectiveUnitWeightKnM3", "resistanceFactor"].map((key) => [key, { type: "number" }])), required: ["widthM", "lengthM", "verticalDesignLoadKn", "frictionDesignDeg", "cohesionDesignKpa", "surchargeDesignKpa", "effectiveUnitWeightKnM3", "resistanceFactor"], additionalProperties: false } },
  { name: "parse_gef", description: "Parse GEF or a CPT JSON snapshot; return diagnostics. Does not write files or cache data.", inputSchema: { type: "object", properties: { content: { type: "string" }, filename: { type: "string" } }, required: ["content", "filename"], additionalProperties: false } },
  { name: "validate_cpt", description: "Validate a CPT snapshot without storing it.", inputSchema: { type: "object", properties: { cpt: { type: "object" } }, required: ["cpt"], additionalProperties: false } },
  { name: "settlement", description: "Indicative 1D settlement with a constant constrained modulus. No design verification.", inputSchema: { type: "object", properties: { thicknessM: { type: "number", exclusiveMinimum: 0 }, stressIncreaseKpa: { type: "number", minimum: 0 }, constrainedModulusMpa: { type: "number", exclusiveMinimum: 0 } }, required: ["thicknessM", "stressIncreaseKpa", "constrainedModulusMpa"], additionalProperties: false } },
  { name: "list_modules", description: "All calculation modules of Open Geotechniek Studio (Beta release): id, name, norm, whether they use CPTs, report type.", inputSchema: { type: "object", properties: { lang }, additionalProperties: false } },
  { name: "module_schema", description: "JSON Schema of the input of a module, with descriptions, units (x-unit) and default values.", inputSchema: { type: "object", properties: { moduleId, lang }, required: ["moduleId"], additionalProperties: false } },
  { name: "default_input", description: "Default input of a module as the app makes it; give a CPT to start from its ground level and layers.", inputSchema: { type: "object", properties: { moduleId, cpts, lang }, required: ["moduleId"], additionalProperties: false } },
  { name: "compute_module", description: "Compute a module: the app's numbers, checks with unity checks (uc <= 1 passes), status line and the full result. Modules with cpts='required' need the CPT in cpts and input.cptId.", inputSchema: { type: "object", properties: { moduleId, input: { type: "object" }, cpts, project, calculations, lang, full: { type: "boolean", description: "Include the full result object (can be large). Default false: checks and status only." } }, required: ["moduleId", "input"], additionalProperties: false } },
  { name: "module_report", description: "PDF report of a module, as the app exports it; returned as an embedded application/pdf resource (base64).", inputSchema: { type: "object", properties: { moduleId, input: { type: "object" }, cpts, project, calculations, lang }, required: ["moduleId", "input"], additionalProperties: false } },
  { name: "cpt_report", description: "CPT report (sonderingsrapport) for one or more CPTs; offline map unless sections.basemap is true. Returned as an embedded application/pdf resource.", inputSchema: { type: "object", properties: { cpts, project, sections: { type: "object" }, lang }, required: ["cpts"], additionalProperties: false } },
  { name: "cpt_layers", description: "Indicative qc/Rf layer interpretation of a CPT.", inputSchema: { type: "object", properties: { cpt: { type: "object" } }, required: ["cpt"], additionalProperties: false } },
].map((t) => ({ ...t, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }));

const json = (value: unknown) => ({ content: [{ type: "text", text: JSON.stringify(value) }] });
const pdf = (bytes: Uint8Array, name: string) => ({
  content: [
    { type: "text", text: JSON.stringify({ file: `${name}.pdf`, bytes: bytes.length, mimeType: "application/pdf" }) },
    { type: "resource", resource: { uri: `ogs://report/${encodeURIComponent(name)}.pdf`, mimeType: "application/pdf", blob: Buffer.from(bytes).toString("base64") } },
  ],
});

async function callTool(name: string, args: any): Promise<unknown> {
  args ??= {};
  switch (name) {
    case "pad_foundation": return json(computePad(args));
    case "parse_gef": return json(parseDocument(args.content, args.filename));
    case "validate_cpt": return json(validateCpt(args.cpt));
    case "settlement": return json(computeSettlement(args));
    case "list_modules": return json(listModules({ lang: args.lang }));
    case "module_schema": return json(moduleSchema(args.moduleId, { lang: args.lang }));
    case "default_input": return json(defaultInput(args.moduleId, { cpts: args.cpts, lang: args.lang }));
    case "compute_module": {
      const r = compute(args.moduleId, args.input, { cpts: args.cpts, project: args.project, calculations: args.calculations, lang: args.lang });
      return json(args.full ? r : { ...r, result: undefined });
    }
    case "module_report": return pdf(await report(args.moduleId, args.input, { cpts: args.cpts, project: args.project, calculations: args.calculations, lang: args.lang }), reportFileName(args.moduleId, args.input));
    case "cpt_report": return pdf(await cptReport(args.cpts, { project: args.project, sections: args.sections, lang: args.lang }), args.project?.title || "sonderingsrapport");
    case "cpt_layers": return json(cptLayers(args.cpt));
    default: throw new Error("Unknown tool");
  }
}

const write = (value: unknown) => process.stdout.write(JSON.stringify(value) + "\n");
let chain: Promise<void> = Promise.resolve();
const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on("line", (line) => {
  chain = chain.then(async () => {
    let request: any;
    try {
      request = JSON.parse(line);
      if (request.id === undefined) return;
      let result: unknown;
      if (request.method === "initialize")
        result = { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "openaec-geotechniek-core", version } };
      else if (request.method === "ping") result = {};
      else if (request.method === "tools/list") result = { tools };
      else if (request.method === "tools/call") {
        const { name, arguments: args } = request.params ?? {};
        try { result = await callTool(name, args); }
        catch (e) {
          if (name && tools.some((t) => t.name === name)) result = { isError: true, content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }] };
          else throw e;
        }
      } else {
        write({ jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "Method not found" } });
        return;
      }
      write({ jsonrpc: "2.0", id: request.id, result });
    } catch (error) {
      write({ jsonrpc: "2.0", id: request?.id ?? null, error: { code: request ? -32602 : -32700, message: error instanceof Error ? error.message : "Invalid request" } });
    }
  });
});
