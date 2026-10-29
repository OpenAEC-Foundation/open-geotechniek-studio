import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
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
for (const entry of ["index", "server", "mcp"])
  await build({
    entryPoints: [
      fileURLToPath(new URL(`packages/core/src/${entry}.ts`, root)),
    ],
    outfile: fileURLToPath(new URL(`packages/core/dist/${entry}.mjs`, root)),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    define: {
      "import.meta.env": "{}",
      __OGS_VERSION__: JSON.stringify(manifest.version),
    },
  });
console.log(`Built headless core ${manifest.version}`);
