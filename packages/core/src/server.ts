// Stateless HTTP API. v1 (parse, validate, pad-foundation, settlement) stays as it was;
// v2 adds the generic module contract, reports and the CPT report. See openapi.json.
import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import {
  parseDocument,
  validateCpt,
  computeSettlement,
  computePad,
  validationOf,
  version,
  listModules,
  getModule,
  moduleSchema,
  defaultInput,
  compute,
  report,
  reportFileName,
  cptReport,
  cptLayers,
  openApi,
  MODULE_IDS,
} from "./index";

const host = process.env.OGS_HOST ?? "127.0.0.1",
  port = Number(process.env.PORT ?? 8788),
  token = process.env.OGS_API_TOKEN;
if (host !== "127.0.0.1" && host !== "::1" && !token)
  throw new Error("OGS_API_TOKEN is required when binding outside loopback");
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("Invalid PORT");
const V1_LIMIT = 8 * 1024 * 1024, V2_LIMIT = 32 * 1024 * 1024;

function authorised(header: string | undefined) {
  if (!token) return true;
  const a = Buffer.from(header ?? ""),
    b = Buffer.from(`Bearer ${token}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

class HttpError extends Error {
  constructor(readonly status: number, message: string, readonly extra: Record<string, unknown> = {}) { super(message); }
}

async function readJson(req: http.IncomingMessage, limit: number): Promise<any> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    const b = Buffer.from(chunk);
    size += b.length;
    if (size > limit) { req.destroy(); throw new HttpError(413, `Maximum request size is ${limit / 1024 / 1024} MiB`); }
    chunks.push(b);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) return {};
  try { return JSON.parse(text); } catch { throw new HttpError(400, "Invalid JSON"); }
}

const contextOf = (body: any) => ({ cpts: body.cpts, cpt: body.cpt, project: body.project, calculations: body.calculations, lang: body.lang });

const server = http.createServer(async (req, res) => {
  const send = (status: number, value: unknown) => {
    res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify(value));
  };
  const sendPdf = (bytes: Uint8Array, name: string) => {
    res.writeHead(200, { "content-type": "application/pdf", "content-length": bytes.length, "content-disposition": `attachment; filename="${name.replace(/[^\w.-]+/g, "_")}.pdf"`, "cache-control": "no-store" });
    res.end(Buffer.from(bytes));
  };
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname, method = req.method ?? "GET";
  if (method === "GET" && path === "/health") { send(200, { status: "ok", version }); return; }
  if (!authorised(req.headers.authorization)) { send(401, { error: "Unauthorised" }); return; }
  try {
    if (method === "GET" && path === "/version") { send(200, { version, api: 1, apiVersions: [1, 2] }); return; }
    if (method === "GET" && path === "/openapi.json") { send(200, openApi()); return; }
    // ---- v1
    if (method === "POST" && ["/parse", "/validate", "/settlement", "/pad-foundation"].includes(path)) {
      let body: any;
      try { body = await readJson(req, V1_LIMIT); } catch (e) { if (e instanceof HttpError && e.status === 413) throw e; throw new HttpError(400, "Invalid request"); }
      if (path === "/validate") { send(200, validateCpt(body)); return; }
      if (path === "/pad-foundation") { const result = computePad(body); send(result.ok ? 200 : 422, result); return; }
      if (path === "/settlement") { const result = computeSettlement(body); send(result.ok ? 200 : 422, result); return; }
      const cpt = parseDocument(body.content, body.filename);
      send(200, { cpt, validation: validationOf(cpt) });
      return;
    }
    // ---- v2
    const lang = url.searchParams.get("lang") ?? undefined;
    if (method === "GET" && path === "/modules") { send(200, listModules({ lang })); return; }
    const m = /^\/modules\/([a-z0-9-]+)(?:\/(schema|default|compute|report))?$/.exec(path);
    if (m) {
      const [, id, action] = m;
      if (!MODULE_IDS.includes(id)) throw new HttpError(404, `Unknown module "${id}"`);
      if (method === "GET" && !action) { send(200, getModule(id, { lang })); return; }
      if (method === "GET" && action === "schema") { send(200, moduleSchema(id, { lang })); return; }
      if (method === "POST" && action) {
        const body = await readJson(req, V2_LIMIT);
        if (action === "default") { send(200, defaultInput(id, contextOf(body))); return; }
        if (!body.input || typeof body.input !== "object") throw new HttpError(400, "Body needs an input object");
        if (action === "compute") {
          const strict = url.searchParams.get("strict") === "1" || url.searchParams.get("strict") === "true";
          const result = compute(id, body.input, contextOf(body));
          if (strict && !result.validation.valid) throw new HttpError(422, "Input does not match the schema", { validation: result.validation });
          send(200, result);
          return;
        }
        if (action === "report") {
          let bytes: Uint8Array;
          try { bytes = await report(id, body.input, { ...contextOf(body), brand: body.brand }); }
          catch (e) { throw new HttpError(422, e instanceof Error ? e.message : "Report failed"); }
          sendPdf(bytes, reportFileName(id, body.input));
          return;
        }
      }
    }
    if (method === "POST" && path === "/cpt/report") {
      const body = await readJson(req, V2_LIMIT);
      if (!Array.isArray(body.cpts) || !body.cpts.length) throw new HttpError(400, "Body needs a non-empty cpts array");
      sendPdf(await cptReport(body.cpts, { project: body.project, sections: body.sections, bores: body.bores, lang: body.lang, brand: body.brand }), body.project?.title || "sonderingsrapport");
      return;
    }
    if (method === "POST" && path === "/cpt/layers") {
      const body = await readJson(req, V2_LIMIT);
      send(200, cptLayers(body.cpt ?? body));
      return;
    }
    send(404, { error: "Unknown endpoint" });
  } catch (error) {
    if (error instanceof HttpError) send(error.status, { error: error.message, ...error.extra });
    else send(400, { error: error instanceof Error ? error.message : "Invalid request" });
  }
});
server.requestTimeout = 60000;
server.listen(port, host, () =>
  process.stderr.write(JSON.stringify({ service: "geotechniek-core", version, host, port, api: [1, 2] }) + "\n"),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => server.close(() => process.exit(0)));
