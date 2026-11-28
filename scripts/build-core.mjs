import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import { generateSchemas } from "./gen-module-schemas.mjs";
const root = new URL("../", import.meta.url),
  app = new URL("apps/desktop/package.json", root);
const require = createRequire(app),
  { build } = require("esbuild");
const manifest = JSON.parse(
  fs.readFileSync(new URL("packages/core/package.json", root)),
);
const appManifest = JSON.parse(fs.readFileSync(app));
if (manifest.version !== appManifest.version)
  throw new Error("Core/app version mismatch");

// 1. Input schemas from the TypeScript types of the modules.
const schemaFile = fileURLToPath(new URL("packages/core/src/generated/schemas.json", root));
fs.mkdirSync(path.dirname(schemaFile), { recursive: true });
fs.writeFileSync(schemaFile, JSON.stringify(generateSchemas(), null, 1) + "\n");

// 2. The app's translations as the virtual module "ogs:locales".
const localesDir = fileURLToPath(new URL("apps/desktop/src/i18n/locales/", root));
const locales = {
  name: "ogs-locales",
  setup(b) {
    b.onResolve({ filter: /^ogs:locales$/ }, () => ({ path: "locales", namespace: "ogs-locales" }));
    b.onLoad({ filter: /.*/, namespace: "ogs-locales" }, () => {
      const out = {};
      for (const lang of fs.readdirSync(localesDir))
        for (const file of fs.readdirSync(path.join(localesDir, lang)).filter((f) => f.endsWith(".json")))
          (out[lang] ??= {})[file.slice(0, -5)] = JSON.parse(fs.readFileSync(path.join(localesDir, lang, file), "utf8"));
      return { contents: `export default ${JSON.stringify(out)};`, loader: "js" };
    });
  },
};
// Assets the headless paths never draw (icons of the app's UI) and the stylesheets of components.
const stub = {
  name: "ogs-stub",
  setup(b) {
    b.onResolve({ filter: /\?(raw|url)$/ }, (a) => ({ path: a.path, namespace: "ogs-stub" }));
    b.onLoad({ filter: /.*/, namespace: "ogs-stub" }, () => ({ contents: "export default ''", loader: "js" }));
  },
};

const common = {
  bundle: true,
  // packages/core has no node_modules of its own: resolve against the app, so app and core share one i18next/jsPDF.
  nodePaths: [fileURLToPath(new URL("apps/desktop/node_modules", root))],
  format: "esm",
  plugins: [locales, stub],
  loader: { ".css": "empty" },
  jsx: "automatic",
  legalComments: "eof",
  logLevel: "warning",
  define: {
    "import.meta.env": JSON.stringify({ MODE: "production", DEV: false, PROD: true }),
    __OGS_VERSION__: JSON.stringify(manifest.version),
  },
};
const src = (entry) => fileURLToPath(new URL(`packages/core/src/${entry}.ts`, root));
const dist = (file) => fileURLToPath(new URL(`packages/core/dist/${file}`, root));

// The server, MCP server and CLI load the library from ./index.mjs instead of bundling it again.
const shared = {
  name: "ogs-shared",
  setup(b) {
    b.onResolve({ filter: /^\.\/(index|server\.mjs|mcp\.mjs)$/ }, (a) =>
      a.importer.includes(`${path.sep}packages${path.sep}core${path.sep}src${path.sep}`) ? { path: a.path === "./index" ? "./index.mjs" : a.path, external: true } : undefined);
  },
};
// Node: library, HTTP server, MCP server and CLI.
await build({ ...common, entryPoints: [src("index")], outfile: dist("index.mjs"), platform: "node", target: "node22" });
for (const entry of ["server", "mcp", "cli"])
  await build({ ...common, plugins: [...common.plugins, shared], entryPoints: [src(entry)], outfile: dist(`${entry}.mjs`), platform: "node", target: "node22",
    banner: entry === "cli" ? { js: "#!/usr/bin/env node" } : undefined });
// Browser / webview: the same library without Node built-ins.
const browser = await build({ ...common, entryPoints: [src("index")], outfile: dist("browser.mjs"), platform: "browser", target: "es2022", metafile: true });
const nodeOnly = Object.values(browser.metafile.outputs).flatMap((o) => o.imports).filter((i) => i.external && /^node:|^(fs|path|http|crypto|child_process)$/.test(i.path));
if (nodeOnly.length) throw new Error(`Browser build imports Node built-ins: ${nodeOnly.map((i) => i.path).join(", ")}`);

// OpenAPI description and JSON schemas next to the code.
const { openApi } = await import(`${new URL("packages/core/dist/index.mjs", root)}?t=${Date.now()}`);
fs.writeFileSync(dist("openapi.json"), JSON.stringify(openApi(), null, 2) + "\n");
fs.copyFileSync(schemaFile, dist("schemas.json"));
fs.copyFileSync(fileURLToPath(new URL("packages/core/src/public.d.ts", root)), dist("index.d.ts"));
console.log(`Built headless core ${manifest.version}`);
