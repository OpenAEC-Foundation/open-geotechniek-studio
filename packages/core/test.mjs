import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";
import {
  parseDocument,
  computeSettlement,
  registerImporter,
  validateCpt,
  validationOf,
} from "./dist/index.mjs";
const content =
  "#GEFID=1,0,0\n#TESTID=SYNTHETIC\n#COLUMN=3\n#COLUMNINFO=1,m,length,1\n#COLUMNINFO=2,MPa,qc,2\n#COLUMNINFO=3,MPa,fs,3\n#EOH=\n1 2 0.02";
test("external consumer parses GEF, validates and calculates without GUI", () => {
  const cpt = parseDocument(content, "synthetic.gef");
  assert.equal(cpt.points[0].qc, 2);
  assert.equal(validationOf(cpt).records, 1);
  assert.equal(validateCpt(cpt).valid, true);
  assert.equal(
    computeSettlement({
      thicknessM: 2,
      stressIncreaseKpa: 50,
      constrainedModulusMpa: 5,
    }).settlementMm,
    20,
  );
  registerImporter({
    id: "synthetic-mapping-example",
    matches: (_, name) => name === "synthetic.mapping",
    parse: () => cpt,
  });
  assert.equal(parseDocument("ignored", "synthetic.mapping").id, cpt.id);
  assert.throws(
    () => parseDocument("unknown", "unknown.modgru"),
    /Unsupported format/,
  );
});
const freePort = () =>
  new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const port = s.address().port;
      s.close(() => resolve(port));
    });
  });
test("HTTP auth, error handling, parse, version, and health smoke test", async () => {
  const port = await freePort();
  const child = spawn(process.execPath, ["dist/server.mjs"], {
    cwd: new URL(".", import.meta.url),
    env: { ...process.env, PORT: String(port), OGS_API_TOKEN: "fixture-token" },
  });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("API did not start")),
        10000,
      );
      child.stderr.once("data", () => {
        clearTimeout(timer);
        resolve();
      });
      child.once("exit", (code) => {
        clearTimeout(timer);
        reject(new Error("API exited " + code));
      });
    });
    const base = `http://127.0.0.1:${port}`;
    assert.equal((await fetch(base + "/health")).status, 200);
    assert.equal((await fetch(base + "/version")).status, 401);
    const headers = {
      "content-type": "application/json",
      authorization: "Bearer fixture-token",
    };
    assert.equal(
      (await (await fetch(base + "/version", { headers })).json()).api,
      1,
    );
    const response = await fetch(base + "/parse", {
      method: "POST",
      headers,
      body: JSON.stringify({ content, filename: "synthetic.gef" }),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).cpt.id, "SYNTHETIC");
    assert.equal(
      (
        await fetch(base + "/parse", {
          method: "POST",
          headers,
          body: "bad json",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await fetch(base + "/settlement", {
          method: "POST",
          headers,
          body: JSON.stringify({
            thicknessM: 2,
            stressIncreaseKpa: 50,
            constrainedModulusMpa: 0,
          }),
        })
      ).status,
      422,
    );
  } finally {
    child.kill();
  }
});
test("MCP external stdio client initializes, lists tools and calls settlement", async () => {
  const child = spawn(process.execPath, ["dist/mcp.mjs"], {
    cwd: new URL(".", import.meta.url),
    stdio: ["pipe", "pipe", "pipe"],
  });
  let buffer = "";
  const waiting = new Map();
  child.stdout.on("data", (bytes) => {
    buffer += bytes;
    while (buffer.includes("\n")) {
      const at = buffer.indexOf("\n"),
        line = buffer.slice(0, at);
      buffer = buffer.slice(at + 1);
      const value = JSON.parse(line);
      waiting.get(value.id)?.(value);
      waiting.delete(value.id);
    }
  });
  const call = (id, method, params) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("MCP timeout")), 10000);
      waiting.set(id, (value) => {
        clearTimeout(timer);
        resolve(value);
      });
      child.stdin.write(
        JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n",
      );
    });
  try {
    assert.equal(
      (
        await call(1, "initialize", {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "external-test", version: "1" },
        })
      ).result.serverInfo.name,
      "openaec-geotechniek-core",
    );
    assert.equal((await call(2, "tools/list", {})).result.tools.length, 3);
    const reply = await call(3, "tools/call", {
      name: "settlement",
      arguments: {
        thicknessM: 2,
        stressIncreaseKpa: 50,
        constrainedModulusMpa: 5,
      },
    });
    assert.equal(JSON.parse(reply.result.content[0].text).settlementMm, 20);
  } finally {
    child.kill();
  }
});
