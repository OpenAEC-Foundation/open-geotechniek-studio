import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import {
  parseDocument,
  validateCpt,
  computeSettlement,
  computePad,
  validationOf,
  version,
} from "./index";
const host = process.env.OGS_HOST ?? "127.0.0.1",
  port = Number(process.env.PORT ?? 8788),
  token = process.env.OGS_API_TOKEN;
if (host !== "127.0.0.1" && host !== "::1" && !token)
  throw new Error("OGS_API_TOKEN is required when binding outside loopback");
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("Invalid PORT");
function authorised(header: string | undefined) {
  if (!token) return true;
  const a = Buffer.from(header ?? ""),
    b = Buffer.from(`Bearer ${token}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
const server = http.createServer(async (req, res) => {
  const send = (status: number, value: unknown) => {
    res.writeHead(status, {
      "content-type": "application/json",
      "cache-control": "no-store",
    });
    res.end(JSON.stringify(value));
  };
  if (req.method === "GET" && req.url === "/health") {
    send(200, { status: "ok", version });
    return;
  }
  if (!authorised(req.headers.authorization)) {
    send(401, { error: "Unauthorised" });
    return;
  }
  if (req.method === "GET" && req.url === "/version") {
    send(200, { version, api: 1 });
    return;
  }
  if (
    req.method !== "POST" ||
    !["/parse", "/validate", "/settlement", "/pad-foundation"].includes(req.url ?? "")
  ) {
    send(404, { error: "Unknown endpoint" });
    return;
  }
  try {
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      const b = Buffer.from(chunk);
      size += b.length;
      if (size > 8 * 1024 * 1024) {
        send(413, { error: "Maximum request size is 8 MiB" });
        req.destroy();
        return;
      }
      chunks.push(b);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (req.url === "/validate") {
      send(200, validateCpt(body));
      return;
    }
    if(req.url === "/pad-foundation"){const result=computePad(body);send(result.ok?200:422,result);return;}
    if (req.url === "/settlement") {
      const result = computeSettlement(body);
      send(result.ok ? 200 : 422, result);
      return;
    }
    const cpt = parseDocument(body.content, body.filename);
    send(200, { cpt, validation: validationOf(cpt) });
  } catch (error) {
    send(400, {
      error: error instanceof Error ? error.message : "Invalid request",
    });
  }
});
server.requestTimeout = 30000;
server.listen(port, host, () =>
  process.stderr.write(
    JSON.stringify({ service: "geotechniek-core", version, host, port }) + "\n",
  ),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => server.close(() => process.exit(0)));
