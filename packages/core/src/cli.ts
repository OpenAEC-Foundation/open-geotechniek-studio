// ogs: command line for the headless core.
import fs from "node:fs";
import path from "node:path";
import {
  version,
  listModules,
  moduleSchema,
  defaultInput,
  compute,
  report,
  cptReport,
  parseDocument,
  decodeSource,
  migrateInput,
  MODULE_IDS,
} from "./index";

const HELP = `ogs ${version} - Open Geotechniek Studio, headless (Beta release)

Usage:
  ogs modules [--lang en] [--json]
  ogs schema <module> [--lang en] [-o schema.json]
  ogs default <module> [--cpt a.gef] [-o input.json]
  ogs compute <module> input.json [--cpt a.gef ...] [--project project.json] [--calcs calcs.json] [--lang en] [--strict] [-o result.json]
  ogs report <module> input.json -o report.pdf [--cpt a.gef ...] [--project project.json] [--calcs calcs.json] [--lang en]
  ogs cpt-report a.gef [b.gef ...] -o report.pdf [--project project.json] [--basemap] [--lang en]
  ogs parse a.gef [-o cpt.json]
  ogs serve            HTTP API (PORT, OGS_HOST, OGS_API_TOKEN)
  ogs mcp              MCP server on stdio

input.json is the module input, or a stored calculation {moduleId, inputVersion, input, cpts}.
--cpt takes GEF files or CPT JSON snapshots; '-' as input file reads stdin.
Modules: ${MODULE_IDS.join(", ")}`;

interface Args { _: string[]; cpt: string[]; flags: Record<string, string | true> }
function parseArgs(argv: string[]): Args {
  const out: Args = { _: [], cpt: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--cpt") { out.cpt.push(argv[++i]); continue; }
    if (a === "-o" || a === "--out") { out.flags.out = argv[++i]; continue; }
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=", 2);
      if (v !== undefined) out.flags[k] = v;
      else if (["lang", "project", "calcs"].includes(k)) out.flags[k] = argv[++i];
      else out.flags[k] = true;
      continue;
    }
    out._.push(a);
  }
  return out;
}

const readText = (file: string) => (file === "-" ? fs.readFileSync(0, "utf8") : decodeSource(new Uint8Array(fs.readFileSync(file))).text);
const readJson = (file: string) => JSON.parse(readText(file));
function readCpt(file: string) {
  const text = readText(file);
  return /\.(json|ifcgeo)$/i.test(file) && !/^#GEFID/m.test(text) ? (JSON.parse(text).cpt ?? JSON.parse(text)) : parseDocument(text, path.basename(file));
}
function output(flags: Args["flags"], data: string | Uint8Array) {
  const out = typeof flags.out === "string" ? flags.out : null;
  if (out) { fs.writeFileSync(out, data); process.stderr.write(`Written: ${out}\n`); }
  else if (typeof data === "string") process.stdout.write(data.endsWith("\n") ? data : data + "\n");
  else throw new Error("A PDF needs -o <file.pdf>");
}

async function main(argv: string[]): Promise<number> {
  const a = parseArgs(argv);
  const [cmd, ...rest] = a._;
  const lang = typeof a.flags.lang === "string" ? a.flags.lang : undefined;
  const project = typeof a.flags.project === "string" ? readJson(a.flags.project) : undefined;
  const calculations = typeof a.flags.calcs === "string" ? readJson(a.flags.calcs) : undefined;
  const cpts = a.cpt.map(readCpt);
  const loadInput = (moduleId: string, file: string | undefined) => {
    if (!file) throw new Error("Give an input file (JSON)");
    const raw = readJson(file);
    if (raw && typeof raw === "object" && "moduleId" in raw && "input" in raw) {
      if (raw.moduleId !== moduleId) throw new Error(`${file} is a ${raw.moduleId} calculation, not ${moduleId}`);
      if (Array.isArray(raw.cpts)) cpts.push(...raw.cpts);
      return migrateInput(moduleId, raw.input, raw.inputVersion ?? 1, { cpts }).input;
    }
    return raw;
  };
  switch (cmd) {
    case undefined: case "help": case "--help": case "-h": process.stdout.write(HELP + "\n"); return 0;
    case "--version": case "version": process.stdout.write(version + "\n"); return 0;
    case "modules": {
      const list = listModules({ lang });
      if (a.flags.json) output(a.flags, JSON.stringify(list, null, 2));
      else output(a.flags, list.map((m) => `${m.id.padEnd(24)} ${m.label.padEnd(34)} ${m.cpts.padEnd(9)} ${m.report.padEnd(8)} ${m.norm}`).join("\n"));
      return 0;
    }
    case "schema": output(a.flags, JSON.stringify(moduleSchema(rest[0], { lang }), null, 2)); return 0;
    case "default": output(a.flags, JSON.stringify(defaultInput(rest[0], { cpts, lang }), null, 2)); return 0;
    case "compute": {
      const r = compute(rest[0], loadInput(rest[0], rest[1]), { cpts, project, calculations, lang });
      if (a.flags.strict && !r.validation.valid) { process.stderr.write(`Invalid input:\n${r.validation.errors.join("\n")}\n`); return 3; }
      output(a.flags, JSON.stringify(r, null, 2));
      if (!a.flags.out) process.stderr.write(`${r.status?.text ?? ""}\n`);
      return r.ok ? 0 : 2;
    }
    case "report": {
      if (typeof a.flags.out !== "string") throw new Error("report needs -o <file.pdf>");
      output(a.flags, await report(rest[0], loadInput(rest[0], rest[1]), { cpts, project, calculations, lang }));
      return 0;
    }
    case "cpt-report": {
      if (typeof a.flags.out !== "string") throw new Error("cpt-report needs -o <file.pdf>");
      const list = [...rest.map(readCpt), ...cpts];
      output(a.flags, await cptReport(list, { project, lang, sections: { basemap: a.flags.basemap === true } }));
      return 0;
    }
    case "parse": output(a.flags, JSON.stringify(readCpt(rest[0]), null, 2)); return 0;
    case "serve": await import("./server.mjs" as string); return -1;
    case "mcp": await import("./mcp.mjs" as string); return -1;
    default: throw new Error(`Unknown command "${cmd}". Run ogs help.`);
  }
}

main(process.argv.slice(2)).then(
  (code) => { if (code >= 0) process.exitCode = code; },
  (e) => { process.stderr.write(`ogs: ${e instanceof Error ? e.message : String(e)}\n`); process.exitCode = 1; },
);
