import readline from "node:readline";
import {
  parseDocument,
  validateCpt,
  computeSettlement,
  version,
} from "./index";
const tools = [
  {
    name: "parse_gef",
    description:
      "Parse GEF or a CPT JSON snapshot; return diagnostics. Does not write files or cache data.",
    inputSchema: {
      type: "object",
      properties: { content: { type: "string" }, filename: { type: "string" } },
      required: ["content", "filename"],
      additionalProperties: false,
    },
  },
  {
    name: "validate_cpt",
    description: "Validate a CPT snapshot without storing it.",
    inputSchema: {
      type: "object",
      properties: { cpt: { type: "object" } },
      required: ["cpt"],
      additionalProperties: false,
    },
  },
  {
    name: "settlement",
    description:
      "Indicative 1D settlement with a constant constrained modulus. No design verification.",
    inputSchema: {
      type: "object",
      properties: {
        thicknessM: { type: "number", exclusiveMinimum: 0 },
        stressIncreaseKpa: { type: "number", minimum: 0 },
        constrainedModulusMpa: { type: "number", exclusiveMinimum: 0 },
      },
      required: ["thicknessM", "stressIncreaseKpa", "constrainedModulusMpa"],
      additionalProperties: false,
    },
  },
].map((t) => ({
  ...t,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
}));
const lines = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});
lines.on("line", (line) => {
  let request: any;
  try {
    request = JSON.parse(line);
    if (request.id === undefined) return;
    let result: unknown;
    if (request.method === "initialize")
      result = {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "openaec-geotechniek-core", version },
      };
    else if (request.method === "ping") result = {};
    else if (request.method === "tools/list") result = { tools };
    else if (request.method === "tools/call") {
      const { name, arguments: args } = request.params ?? {};
      let value: unknown;
      if (name === "parse_gef")
        value = parseDocument(args.content, args.filename);
      else if (name === "validate_cpt") value = validateCpt(args.cpt);
      else if (name === "settlement") value = computeSettlement(args);
      else throw new Error("Unknown tool");
      result = { content: [{ type: "text", text: JSON.stringify(value) }] };
    } else {
      process.stdout.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: request.id,
          error: { code: -32601, message: "Method not found" },
        }) + "\n",
      );
      return;
    }
    process.stdout.write(
      JSON.stringify({ jsonrpc: "2.0", id: request.id, result }) + "\n",
    );
  } catch (error) {
    process.stdout.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id: request?.id ?? null,
        error: {
          code: request ? -32602 : -32700,
          message: error instanceof Error ? error.message : "Invalid request",
        },
      }) + "\n",
    );
  }
});
