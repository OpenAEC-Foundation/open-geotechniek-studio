import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import * as core from "./dist/index.mjs";
const {
  parseDocument,
  computeSettlement,
  computePad,
  registerImporter,
  validateCpt,
  validationOf,
} = core;
const padInput={widthM:2,lengthM:2,verticalDesignLoadKn:500,frictionDesignDeg:30,cohesionDesignKpa:0,surchargeDesignKpa:20,effectiveUnitWeightKnM3:10,resistanceFactor:1.4};
const content =
  "#GEFID=1,0,0\n#TESTID=SYNTHETIC\n#COLUMN=3\n#COLUMNINFO=1,m,length,1\n#COLUMNINFO=2,MPa,qc,2\n#COLUMNINFO=3,MPa,fs,3\n#EOH=\n1 2 0.02";
const here = new URL(".", import.meta.url);
const fixtures = new URL("../../apps/desktop/src/calc/modules/pile-bearing-capacity/__fixtures__/", import.meta.url);
const gefText = (name) => fs.readFileSync(new URL(name, fixtures), "latin1");
const gefSource = (name) => ({ content: gefText(name), filename: name });
const parity = JSON.parse(fs.readFileSync(new URL("test/parity.json", import.meta.url), "utf8"));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ogs-core-test-"));
const pdfInfo = (bytes) => { const text = Buffer.from(bytes).toString("latin1"); return { pdf: text.startsWith("%PDF-") && text.trimEnd().endsWith("%%EOF"), pages: (text.match(/\/Type \/Page\b/g) ?? []).length, text }; };

/** Same fingerprint as apps/desktop/src/calc/framework/coreParity.test.ts. */
function digest(value) {
  const text = JSON.stringify(value, (_k, v) => (typeof v === "number" ? Number(v.toPrecision(10)) : v));
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return `${h.toString(16).padStart(8, "0")}-${text.length}`;
}
const contextOf = (c) => ({ cpts: c.cptFiles.map(gefSource), project: { title: "Pariteit", project_number: "P-1", date: "2026-11-28" }, calculations: c.calculations });

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
  assert.ok(Math.abs(computePad(padInput).resistanceKn-1979.1007512048)<1e-6);
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

test("module list: every module of the app, with names, status and version", () => {
  const list = core.listModules({ lang: "en" });
  assert.deepEqual(list.map((m) => m.id), core.MODULE_IDS);
  for (const id of ["pile-bearing-capacity", "tension-pile", "laterally-loaded-pile", "driving-assessment", "spread-foundation", "sheet-pile-wall", "foundation-advice"])
    assert.equal(list.find((m) => m.id === id)?.inApp, true, id);
  for (const m of list) {
    assert.equal(m.status, "Beta release");
    assert.equal(m.version, core.version);
    assert.ok(m.name.nl && m.name.en && m.norm, m.id);
  }
  assert.equal(list.find((m) => m.id === "pile-bearing-capacity").label, "Pile bearing capacity");
  assert.equal(core.listModules().find((m) => m.id === "pile-bearing-capacity").label, "Paaldraagvermogen");
  assert.throws(() => core.moduleSchema("does-not-exist"), /Unknown module/);
});

test("compute through the core gives the app's numbers for every module (test/parity.json)", () => {
  assert.equal(parity.length, core.MODULE_IDS.length);
  for (const c of parity) {
    const r = core.compute(c.moduleId, c.input, contextOf(c));
    assert.equal(r.ok, c.expected.ok, c.moduleId);
    assert.deepEqual(r.status, c.expected.status, c.moduleId);
    assert.deepEqual(r.checks.map(({ passes, ...k }) => k), c.expected.checks, c.moduleId);
    assert.equal(digest(r.result), c.expected.digest, `${c.moduleId}: result differs from the app`);
    assert.doesNotThrow(() => JSON.stringify(r), c.moduleId);
    assert.deepEqual(JSON.parse(JSON.stringify(r.result)), r.result, `${c.moduleId}: result is not plain JSON`);
    const ucs = r.checks.filter((k) => typeof k.uc === "number").map((k) => k.uc);
    assert.equal(r.governingUc, ucs.length ? Math.max(...ucs) : null, c.moduleId);
  }
});

test("schemas: generated from the module types; defaults and example inputs validate", () => {
  for (const id of core.MODULE_IDS) {
    const schema = core.moduleSchema(id);
    assert.equal(schema.type, "object", id);
    assert.ok(Object.keys(schema.properties).length > 2, id);
    assert.ok(schema.default && typeof schema.default === "object", `${id}: default`);
    const plain = core.validateInput(id, core.defaultInput(id));
    assert.deepEqual(plain.errors, [], `${id}: defaults without CPT`);
    const withCpt = core.validateInput(id, core.defaultInput(id, { cpts: [gefSource("121882_1.gef")] }));
    assert.deepEqual(withCpt.errors, [], `${id}: defaults with CPT`);
    const example = parity.find((p) => p.moduleId === id);
    assert.deepEqual(core.validateInput(id, example.input).errors, [], `${id}: parity input`);
  }
  const pile = core.moduleSchema("pile-bearing-capacity");
  assert.equal(pile.properties.pileToeNap["x-unit"], "m NAP");
  assert.equal(pile.properties.diameterMm["x-unit"], "mm");
  assert.equal(pile.properties.gammaM["x-unit"], undefined);
  assert.equal(pile.properties.diameterMm.default, 219);
  const bad = core.validateInput("pile-bearing-capacity", { ...core.defaultInput("pile-bearing-capacity"), diameterMm: "big", standard: "nen-1" });
  assert.equal(bad.valid, false);
  assert.ok(bad.errors.some((e) => e.includes("diameterMm")) && bad.errors.some((e) => e.includes("standard")));
  assert.throws(() => core.compute("pile-bearing-capacity", { ...core.defaultInput("pile-bearing-capacity"), diameterMm: "big" }, { strict: true }), /Invalid input/);
});

test("old input: missing required fields are filled from the defaults", () => {
  const { pileToeNap, ksMinFactor, ...old } = parity[0].input;
  void pileToeNap; void ksMinFactor;
  const m = core.migrateInput("pile-bearing-capacity", old, 1);
  assert.deepEqual(m.notes.sort(), ["ksMinFactor: filled from the defaults", "pileToeNap: filled from the defaults"]);
  assert.equal(core.validateInput("pile-bearing-capacity", m.input).valid, true);
  assert.throws(() => core.migrateInput("pile-bearing-capacity", old, 99), /newer/);
});

test("language: texts and number format follow lang, the active language is restored", () => {
  const c = parity.find((p) => p.moduleId === "tension-pile");
  const en = core.compute(c.moduleId, c.input, { ...contextOf(c), lang: "en" });
  const nl = core.compute(c.moduleId, c.input, contextOf(c));
  assert.match(nl.status.text, /0,51/);
  assert.match(en.status.text, /0\.51/);
  assert.equal(digest(en.result), digest(nl.result));
  assert.throws(() => core.compute(c.moduleId, c.input, { ...contextOf(c), lang: "xx" }), /Unsupported language/);
});

test("reports: a valid PDF for every module, in Node, with the module name and BETA RELEASE", async () => {
  for (const c of parity) {
    const info = core.getModule(c.moduleId);
    const bytes = await core.report(c.moduleId, c.input, contextOf(c));
    const pdf = pdfInfo(bytes);
    assert.ok(pdf.pdf, c.moduleId);
    if (info.report === "module") assert.ok(pdf.pages > 1, `${c.moduleId}: ${pdf.pages} pages`);
    assert.ok(pdf.text.includes(info.name.nl.split(" ")[0]), `${c.moduleId}: name in the PDF`);
    assert.ok(pdf.text.includes("BETA RELEASE"), `${c.moduleId}: BETA RELEASE`);
    fs.writeFileSync(path.join(tmp, `${c.moduleId}.pdf`), bytes);
  }
  const branded = await core.report("settlement", parity.find((p) => p.moduleId === "settlement").input, { brand: { organization: "Bureau Test" } });
  assert.ok(pdfInfo(branded).pdf);
  const cptPdf = pdfInfo(await core.cptReport([gefSource("121882_1.gef"), gefSource("121882_2.gef")], { project: { title: "Test", project_number: "T-1" } }));
  assert.ok(cptPdf.pdf && cptPdf.pages > 2);
  assert.ok(cptPdf.text.includes("Sonderingsrapport"));
});

test("browser build: no Node built-ins, same results", async () => {
  const src = fs.readFileSync(new URL("dist/browser.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /from\s*["']node:|require\(["']node:|from\s*["'](fs|path|http|crypto|child_process)["']/);
  const browser = await import("./dist/browser.mjs");
  const c = parity.find((p) => p.moduleId === "pile-bearing-capacity");
  assert.equal(digest(browser.compute(c.moduleId, c.input, contextOf(c)).result), c.expected.digest);
});

test("type declarations cover every export", () => {
  const dts = fs.readFileSync(new URL("dist/index.d.ts", import.meta.url), "utf8");
  for (const name of Object.keys(core)) assert.match(dts, new RegExp(`export declare (const|function) ${name}\\b`), name);
});

const freePort = () =>
  new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const port = s.address().port;
      s.close(() => resolve(port));
    });
  });
async function startServer(env) {
  const port = await freePort();
  const child = spawn(process.execPath, ["dist/server.mjs"], { cwd: here, env: { ...process.env, PORT: String(port), ...env } });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("API did not start")), 20000);
    child.stderr.once("data", () => { clearTimeout(timer); resolve(); });
    child.once("exit", (code) => { clearTimeout(timer); reject(new Error("API exited " + code)); });
  });
  return { child, base: `http://127.0.0.1:${port}` };
}

test("HTTP auth, error handling, parse, version, and health smoke test", async () => {
  const { child, base } = await startServer({ OGS_API_TOKEN: "fixture-token" });
  try {
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
    const padReply=await fetch(base+'/pad-foundation',{method:'POST',headers,body:JSON.stringify(padInput)});
    assert.equal(padReply.status,200);assert.ok(Math.abs((await padReply.json()).resistanceKn-1979.1007512048)<1e-6);
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

test("HTTP v2: modules, schema, compute, report, CPT report, OpenAPI", async () => {
  const { child, base } = await startServer({});
  const post = (p, body) => fetch(base + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  try {
    const modules = await (await fetch(base + "/modules?lang=en")).json();
    assert.deepEqual(modules.map((m) => m.id), core.MODULE_IDS);
    const schema = await (await fetch(base + "/modules/tension-pile/schema")).json();
    assert.equal(schema.type, "object");
    assert.equal((await fetch(base + "/modules/nope/schema")).status, 404);
    const c = parity.find((p) => p.moduleId === "tension-pile");
    const computed = await (await post("/modules/tension-pile/compute", { input: c.input, ...contextOf(c) })).json();
    assert.equal(digest(computed.result), c.expected.digest);
    assert.deepEqual(computed.status, c.expected.status);
    assert.equal((await post("/modules/tension-pile/compute?strict=1", { input: { ...c.input, sizeMm: "x" }, ...contextOf(c) })).status, 422);
    assert.equal((await post("/modules/tension-pile/compute", {})).status, 400);
    const def = await (await post("/modules/tension-pile/default", { cpts: [gefSource("121882_1.gef")] })).json();
    assert.equal(def.cptId, "1");
    const rep = await post("/modules/tension-pile/report", { input: c.input, ...contextOf(c), lang: "en" });
    assert.equal(rep.status, 200);
    assert.equal(rep.headers.get("content-type"), "application/pdf");
    assert.ok(pdfInfo(new Uint8Array(await rep.arrayBuffer())).pdf);
    const cptRep = await post("/cpt/report", { cpts: [gefSource("121882_1.gef")], project: { title: "Test" } });
    assert.equal(cptRep.status, 200);
    assert.ok(pdfInfo(new Uint8Array(await cptRep.arrayBuffer())).pdf);
    assert.equal((await post("/cpt/report", { cpts: [] })).status, 400);
    const layers = await (await post("/cpt/layers", { cpt: gefSource("121882_1.gef") })).json();
    assert.ok(layers.layers.length > 0);
    const spec = await (await fetch(base + "/openapi.json")).json();
    assert.equal(spec.openapi, "3.1.0");
    for (const p of ["/modules", "/modules/{id}/schema", "/modules/{id}/compute", "/modules/{id}/report", "/cpt/report", "/parse", "/settlement"]) assert.ok(spec.paths[p], p);
  } finally {
    child.kill();
  }
});

test("CLI: modules, schema, compute with --cpt and report to a PDF", () => {
  const ogs = (...args) => spawnSync(process.execPath, ["dist/cli.mjs", ...args], { cwd: here, encoding: "utf8" });
  const list = ogs("modules", "--json");
  assert.equal(list.status, 0, list.stderr);
  assert.equal(JSON.parse(list.stdout).length, core.MODULE_IDS.length);
  assert.equal(JSON.parse(ogs("schema", "kalendering").stdout).type, "object");
  const c = parity.find((p) => p.moduleId === "pile-bearing-capacity");
  const inputFile = path.join(tmp, "pile-input.json"), outFile = path.join(tmp, "pile-result.json"), pdfFile = path.join(tmp, "pile-cli.pdf");
  fs.writeFileSync(inputFile, JSON.stringify(c.input));
  const gefFile = new URL("121882_1.gef", fixtures);
  const run = ogs("compute", "pile-bearing-capacity", inputFile, "--cpt", gefFile.pathname.replace(/^\/([A-Za-z]:)/, "$1"), "-o", outFile);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(digest(JSON.parse(fs.readFileSync(outFile, "utf8")).result), c.expected.digest);
  const rep = ogs("report", "pile-bearing-capacity", inputFile, "--cpt", gefFile.pathname.replace(/^\/([A-Za-z]:)/, "$1"), "-o", pdfFile, "--lang", "en");
  assert.equal(rep.status, 0, rep.stderr);
  assert.ok(pdfInfo(fs.readFileSync(pdfFile)).pages > 1);
  const stored = path.join(tmp, "stored.json");
  fs.writeFileSync(stored, JSON.stringify({ moduleId: "settlement", inputVersion: 1, input: { thicknessM: 2, stressIncreaseKpa: 50 }, cpts: [] }));
  const old = ogs("compute", "settlement", stored);
  assert.equal(old.status, 0, old.stderr);
  assert.equal(JSON.parse(old.stdout).result.settlementMm, 20);
  assert.notEqual(ogs("compute", "nope", inputFile).status, 0);
});

test("MCP external stdio client initializes, lists tools and calls settlement", async () => {
  const child = spawn(process.execPath, ["dist/mcp.mjs"], {
    cwd: here,
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
      const timer = setTimeout(() => reject(new Error("MCP timeout")), 30000);
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
    const names = (await call(2, "tools/list", {})).result.tools.map((t) => t.name);
    for (const n of ["parse_gef", "validate_cpt", "settlement", "pad_foundation", "list_modules", "module_schema", "default_input", "compute_module", "module_report", "cpt_report", "cpt_layers"]) assert.ok(names.includes(n), n);
    const reply = await call(3, "tools/call", {
      name: "settlement",
      arguments: {
        thicknessM: 2,
        stressIncreaseKpa: 50,
        constrainedModulusMpa: 5,
      },
    });
    assert.equal(JSON.parse(reply.result.content[0].text).settlementMm, 20);
    const padReply=await call(4,'tools/call',{name:'pad_foundation',arguments:padInput});
    assert.ok(Math.abs(JSON.parse(padReply.result.content[0].text).resistanceKn-1979.1007512048)<1e-6);
    const c = parity.find((p) => p.moduleId === "tension-pile");
    const computed = JSON.parse((await call(5, "tools/call", { name: "compute_module", arguments: { moduleId: c.moduleId, input: c.input, cpts: contextOf(c).cpts } })).result.content[0].text);
    assert.deepEqual(computed.status, c.expected.status);
    const rep = (await call(6, "tools/call", { name: "module_report", arguments: { moduleId: c.moduleId, input: c.input, cpts: contextOf(c).cpts } })).result;
    assert.equal(rep.content[1].resource.mimeType, "application/pdf");
    assert.ok(pdfInfo(Buffer.from(rep.content[1].resource.blob, "base64")).pdf);
    const err = (await call(7, "tools/call", { name: "compute_module", arguments: { moduleId: "nope", input: {} } })).result;
    assert.equal(err.isError, true);
  } finally {
    child.kill();
  }
});
