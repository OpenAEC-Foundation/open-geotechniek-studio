# @openaec/geotechniek-core

A headless ESM package for Node.js 22+. No Tauri, browser, desktop session or network dependency. Build from the repository root:

```sh
npm --prefix apps/desktop ci
node scripts/build-core.mjs
node --test packages/core/test.mjs
cd packages/core && npm pack
```

An external consumer can import the built package by absolute file URL or install the generated tarball:

```js
import { parseDocument, validationOf, computeSettlement } from '@openaec/geotechniek-core';
const cpt = parseDocument(gefText, 'sounding.gef');
console.log(validationOf(cpt));
console.log(computeSettlement({ thicknessM: 2, stressIncreaseKpa: 50, constrainedModulusMpa: 5 }));
// { ok: true, settlementMm: 20, strain: 0.01, ... }
```

Supported inputs: GEF-CPT text and CPT JSON snapshots (`.ifcgeo`, `.json`). BRO XML uses the desktop/browser DOM importer. GEF-BORE is available separately as `parseGefBore`; `decodeSource(Uint8Array)` decodes UTF-8/Windows-1252 with explicit conversion diagnostics. Validation diagnostics describe recovery; structural errors throw. `validateCpt` checks the snapshot contract, not geotechnical design suitability.

## Custom importers (#3)

`.modgru` is not a documented standard supported by this package. Map the actual file specification in trusted application code; no guessed format or uploaded executable is accepted.

```js
import { registerImporter, parseDocument } from '@openaec/geotechniek-core';
registerImporter({
  id: 'your-company-modgru-v1',
  matches: (_text, name) => name.toLowerCase().endsWith('.modgru'),
  parse: (text, filename) => yourDocumentedConverter(text, filename),
});
const cpt = parseDocument(sourceText, 'test.modgru');
```

The converter returns `{ id, metadata: { source_file }, points: [{ depth, qc?, fs?, rf?, u2?, inclination? }], position? }`. Depth is metres below the reference surface, qc/fs/u2 are MPa, rf is percent; position requires explicit RD metres. Preserve original metadata/quantities and report conversions. `parseDocument` validates the returned snapshot. Importer registration is process-local, trusted code only. HTTP/MCP clients cannot install plugins. A converter can alternatively write GEF or `.ifcgeo` for the existing file-open workflow.

## HTTP contract (API v1)

```sh
node packages/core/dist/server.mjs
# 127.0.0.1:8788, no auth unless OGS_API_TOKEN is set
OGS_API_TOKEN=your-existing-token node packages/core/dist/server.mjs
```

Configuration: `PORT` (8788), `OGS_HOST` (127.0.0.1), `OGS_API_TOKEN`. Any bind outside loopback requires a token. Use a TLS proxy for remote access; there is no CORS allowance. All endpoints are stateless and write no files. JSON request bodies are limited to 8 MiB; request timeout is 30 seconds. Logs contain startup configuration, never imported file contents or tokens.

| Method | Path | Input / output |
| --- | --- | --- |
| GET | `/health` | Public `{status,version}` for runtime probes |
| GET | `/version` | `{version,api:1}` |
| POST | `/parse` | `{content,filename}` → `{cpt,validation}` |
| POST | `/validate` | CPT snapshot → `{valid,errors}` |
| POST | `/pad-foundation` | Explicit design values and resistance factor → concept drained EC7 Annex D resistance |
| POST | `/settlement` | `{thicknessM,stressIncreaseKpa,constrainedModulusMpa}` → result |

When configured, supply `Authorization: Bearer …` except for health. Errors: 400 malformed JSON/input/unsupported format, 401 missing/invalid token, 404 unknown endpoint, 413 oversized input, 422 out-of-model calculation input. Validation of an invalid snapshot returns 200 with `valid:false`. These are model inputs, not a code-execution API.

Reproducible external HTTP and MCP client tests: `node --test packages/core/test.mjs` after building. Tests spawn the servers without opening a desktop UI.

## MCP / Claude

Transport: newline-delimited JSON-RPC over stdio, MCP 2024-11-05. Tools: `parse_gef`, `validate_cpt`, `settlement`, `pad_foundation`. No resources, prompts, file access, persistent state, mutation or undo. Launch permissions come from the host OS account; none of these tools fetches remote URLs.

Claude Desktop `claude_desktop_config.json` example (replace both absolute paths):

```json
{"mcpServers":{"geotechniek":{"command":"/absolute/path/to/node","args":["/absolute/path/to/open-geotechniek-studio/packages/core/dist/mcp.mjs"]}}}
```

Claude Code, from a checkout with built `dist`:

```sh
claude mcp add --transport stdio geotechniek -- node /absolute/path/to/packages/core/dist/mcp.mjs
```

The external stdio client is tested in CI. Claude Code 2.1.312 also connected successfully using `claude mcp list` in an isolated configuration on 2026-10-29. This health check establishes host connectivity; it does not establish Claude Desktop UI or an interactive connector. No installable Claude bundle or interactive MCP App is delivered.


## Calculation scope

`computePad` / `/pad-foundation` / `pad_foundation` implement the drained analytical
resistance method in EN 1997-1 Annex D for a rectangular horizontal foundation,
centric vertical compression, homogeneous soil and level ground. All input soil
parameters, surcharge and vertical load are **design values**. The caller supplies
`resistanceFactor`; there is no automatically selected Dutch National Annex factor
set. The 1.4 example value is a numerical example, not a Dutch preset. Inputs are
`widthM`, `lengthM`, `verticalDesignLoadKn`, `frictionDesignDeg`,
`cohesionDesignKpa`, `surchargeDesignKpa`, `effectiveUnitWeightKnM3`,
`resistanceFactor`. The model does not check concrete, settlement, sliding,
eccentricity, inclination or global stability. See the worksheet's explicit
norm/NA and factor notes before using results. `normalizeCpt` provides the
separate fixed-n=1 Qt/Fr/Bq/Ic reference analysis, not variable-exponent Qtn.
