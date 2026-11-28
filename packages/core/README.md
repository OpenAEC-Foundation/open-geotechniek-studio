# @openaec/geotechniek-core

Headless Open Geotechniek Studio: CPT parsing and validation, **every calculation module of the app**, their PDF reports and the CPT report (sonderingsrapport). ESM for Node.js 22+ (`dist/index.mjs`) and for a browser or webview (`dist/browser.mjs`, no Node built-ins). No Tauri, desktop session or network dependency. Beta release: results are indicative.

The modules are not re-implemented: the package bundles the app's own module code (`apps/desktop/src/calc/modules/*/headless.ts`, listed in `calc/framework/headlessRegistry.ts`), so defaults, numbers, checks and reports are those of the app. `test/parity.json` pins this: the app test suite (`coreParity.test.ts`) computes it in the app, `test.mjs` checks the built package against it.

Build from the repository root:

```sh
npm --prefix apps/desktop ci
node scripts/build-core.mjs        # also regenerates src/generated/schemas.json
node --test packages/core/test.mjs
cd packages/core && npm pack
```

## Modules

| id | Module | CPTs | Report | In app |
| --- | --- | --- | --- | --- |
| `pile-bearing-capacity` | Paaldraagvermogen (NEN 9997-1 / NEN 6743, version per input) | required (`input.cptId`; the report also uses the other CPTs) | module | yes |
| `tension-pile` | Trekpalen (NEN 9997-1 art. 7.6.3) | required | module | yes |
| `laterally-loaded-pile` | Horizontale paalbelasting (CUR 166 bedding, N–M check) | none | module | yes |
| `driving-assessment` | Beoordeling kalendering (rule of thumb) | required | generic sheet | yes |
| `spread-foundation` | Fundering op staal (NEN 9997-1 art. 6.5) | layer proposal in the defaults | module | yes |
| `sheet-pile-wall` | Damwand en beschoeiing (NEN 9997-1, CUR 166) | layer proposal in the defaults | module | yes |
| `foundation-advice` | Funderingsadvies (bundles CPTs and calculations) | all CPTs + `calculations` | module | yes |
| `pad-foundation` | Poer op staal (EN 1997-1 Annex D) | none | generic sheet | no |
| `settlement` | Zetting van één laag (1D) | none | generic sheet | no |
| `kalendering` | Kalendering (empirical formula) | none | generic sheet | no |

"module": the PDF the app exports. "generic sheet": the app has no report for this module; the core writes a calculation sheet (input, checks, status) in the same house style. All modules: `listModules`, `moduleSchema`, `defaultInput`, `compute` and `report`.

## Contract

```js
import { listModules, moduleSchema, defaultInput, compute, report, cptReport, parseDocument } from '@openaec/geotechniek-core';

const cpt = parseDocument(gefText, 'S01.gef');           // or pass {content, filename}
listModules({ lang: 'en' });                              // [{id, name:{nl,en}, label, norm, status:'Beta release', version, inputVersion, cpts, report, inApp}]
moduleSchema('tension-pile');                             // JSON Schema 2020-12 with default values, descriptions and units (x-unit)
const input = { ...defaultInput('tension-pile', { cpts: [cpt] }), ftDKn: 100 };
const r = compute('tension-pile', input, { cpts: [cpt], lang: 'nl' });
// r = {moduleId, moduleVersion, inputVersion, ok, error?, status:{text,ok,pending}, checks:[{label,value,uc?,passes?}],
//      governingUc, passes, result (JSON-safe), validation:{valid,errors}, messages}
const pdf = await report('tension-pile', input, { cpts: [cpt], project: { title: 'Hal', project_number: 'P-12' }, lang: 'en' });
const cptPdf = await cptReport([cpt], { project: { title: 'Hal' }, sections: { testReport: true } });
```

| Function | Purpose |
| --- | --- |
| `listModules({lang})`, `getModule(id)`, `MODULE_IDS` | Module list with Dutch and English name, norm, status, package version and input version |
| `moduleSchema(id, {lang, cpt})` | Input JSON Schema, generated from the module's TypeScript input type (`scripts/gen-module-schemas.mjs`); defaults from `defaultInput` |
| `defaultInput(id, {cpts, cpt, project})` | The input the app makes for a new calculation (from the CPT when given) |
| `validateInput(id, input)` | Schema check; `compute` reports it in `validation`, `{strict:true}` rejects |
| `compute(id, input, {cpts, project, calculations, lang})` | Result, checks (unity check `uc`, passes at ≤ 1), governing u.c. and status line |
| `computeRaw` | The module's own result object (Maps, non-finite numbers) for in-process use |
| `report(id, input, {cpts, project, calculations, lang, brand, result})`, `reportSync` | PDF bytes (`Uint8Array`) |
| `cptReport(cpts, {project, sections, bores, lang, brand})` | The CPT report; offline by default (`sections.basemap: true` fetches the PDOK aerial photo as the app does) |
| `migrateInput(id, input, fromVersion)` | Brings stored input to the current input version and fills missing required fields from the defaults |
| `newCalculation(id, {cpts})` | `{moduleId, moduleVersion, inputVersion, input, cpts}`: what an integrating application stores |
| `cptLayers(cpt)`, `soilModel(cpts)`, `analyzeLayers` | Layer interpretation and the 3D soil model the modules use |
| `openApi()` | OpenAPI 3.1 description of the HTTP API (also `dist/openapi.json`) |

- **CPTs** are snapshots (`parseDocument`) or `{content, filename}` with GEF/JSON source text. A module with `cpts: "required"` uses `input.cptId`; without it the first supplied CPT is taken (reported in `messages`).
- **Language**: `lang` is one of `nl en de fr es it pt pl da sv` (the app's translations are bundled). Checks, status texts and number formats follow it; report texts are translated as far as the app translates them (much of the reports is Dutch, as in the app).
- **House style**: `brand` (`organization`, `accent`, `logoDataUrl`, `coverImage`, …) as in the app's report settings; default OpenAEC.
- **Versions**: `moduleVersion` is the package version (= app version). `inputVersion` is 1 for all modules; a later change of meaning gets a migration in `migrateInput`. Optional input fields keep a documented default, so input of older releases still computes.
- **Types**: `dist/index.d.ts`. Module inputs and results are typed as JSON; their shape is the module schema.

### Reports in Node: what differs from the app

The report code is the app's (jsPDF, vector figures, embedded symbol font, "BETA RELEASE" label). It uses no canvas, DOM or fetch on these paths, except:
- **Foundation advice, 3D soil model figure**: rendered with WebGL. In Node there is no WebGL, so these two figures and their legend are left out (the rest of the advice is complete). In a browser or webview with WebGL they are included.
- **CPT report, overview map**: offline by default (RD grid). With `sections.basemap: true` the PDOK aerial photo and cadastral map are fetched, as the app does.
- **House style images** (logo, cover, letterhead) must be PNG/JPEG data URLs; converting SVG or PDF to an image needs a canvas and is not done headless.
- PDF metadata (creation date, document id) differ per run, as in the app.

The bundle is large (about 7 MB unminified): it holds jsPDF, three.js (soil model), i18next and the translations of all ten languages.

## Command line: `ogs`

```sh
npx ogs modules [--lang en]
npx ogs schema tension-pile -o schema.json
npx ogs default tension-pile --cpt S01.gef -o input.json
npx ogs compute tension-pile input.json --cpt S01.gef [--project project.json] [--lang en] [-o result.json]
npx ogs report tension-pile input.json --cpt S01.gef -o rapport.pdf [--lang en]
npx ogs cpt-report S01.gef S02.gef -o sonderingen.pdf [--basemap]
npx ogs serve        # HTTP API
npx ogs mcp          # MCP server on stdio
```

`input.json` can also be a stored calculation `{moduleId, inputVersion, input, cpts}`; it is migrated first. `--calcs calcs.json` gives the other calculations of the project for the foundation advice. Exit code 2 when the module could not compute, 3 for `--strict` schema errors.

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

Supported inputs: GEF-CPT text and CPT JSON snapshots (`.ifcgeo`, `.json`). BRO XML uses the desktop/browser DOM importer. GEF-BORE is available separately as `parseGefBore`; `decodeSource(Uint8Array)` decodes UTF-8/Windows-1252 with explicit conversion diagnostics. Validation diagnostics describe recovery; structural errors throw. `validateCpt` checks the snapshot contract, not geotechnical design suitability.

## HTTP API (v1 and v2)

```sh
node packages/core/dist/server.mjs          # or: npx ogs serve
# 127.0.0.1:8788, no auth unless OGS_API_TOKEN is set
OGS_API_TOKEN=your-existing-token node packages/core/dist/server.mjs
```

Configuration: `PORT` (8788), `OGS_HOST` (127.0.0.1), `OGS_API_TOKEN`. Any bind outside loopback requires a token. Use a TLS proxy for remote access; there is no CORS allowance. All endpoints are stateless and write no files. JSON bodies are limited to 8 MiB (v1) and 32 MiB (v2); request timeout is 60 seconds. Logs contain startup configuration, never imported file contents or tokens. The full description is `GET /openapi.json` (also `dist/openapi.json`). v1 is unchanged.

| Method | Path | Input / output |
| --- | --- | --- |
| GET | `/health` | Public `{status,version}` for runtime probes |
| GET | `/version` | `{version,api:1,apiVersions:[1,2]}` |
| GET | `/openapi.json` | OpenAPI 3.1 description |
| POST | `/parse` | v1: `{content,filename}` → `{cpt,validation}` |
| POST | `/validate` | v1: CPT snapshot → `{valid,errors}` |
| POST | `/pad-foundation` | v1: explicit design values and resistance factor → concept drained EC7 Annex D resistance |
| POST | `/settlement` | v1: `{thicknessM,stressIncreaseKpa,constrainedModulusMpa}` → result |
| GET | `/modules?lang=` | v2: module list |
| GET | `/modules/{id}` | v2: one module |
| GET | `/modules/{id}/schema?lang=` | v2: input JSON Schema with defaults and units |
| POST | `/modules/{id}/default` | v2: `{cpts?, cpt?}` → default input |
| POST | `/modules/{id}/compute[?strict=1]` | v2: `{input, cpts?, project?, calculations?, lang?}` → compute result (200 also when `ok:false`; 422 for schema errors with `strict`) |
| POST | `/modules/{id}/report` | v2: as compute, plus `brand?` → `application/pdf` |
| POST | `/cpt/report` | v2: `{cpts, project?, sections?, bores?, lang?, brand?}` → `application/pdf` |
| POST | `/cpt/layers` | v2: `{cpt}` → indicative layer interpretation |

When configured, supply `Authorization: Bearer …` except for health. Errors: 400 malformed JSON/input/unsupported format, 401 missing/invalid token, 404 unknown endpoint or module, 413 oversized input, 422 out-of-model calculation input, or a report of a calculation that cannot be computed. Validation of an invalid snapshot returns 200 with `valid:false`. These are model inputs, not a code-execution API.

Reproducible external HTTP, CLI and MCP client tests: `node --test packages/core/test.mjs` after building. Tests spawn the servers without opening a desktop UI.

## MCP / Claude

Transport: newline-delimited JSON-RPC over stdio, MCP 2024-11-05. Tools: `parse_gef`, `validate_cpt`, `settlement`, `pad_foundation`, and for all modules `list_modules`, `module_schema`, `default_input`, `compute_module` (checks and status; `full: true` adds the result object), `module_report` and `cpt_report` (PDF as an embedded `application/pdf` resource, base64), `cpt_layers`. No prompts, file access, persistent state, mutation or undo. Launch permissions come from the host OS account; none of these tools fetches remote URLs unless `cpt_report` is asked for `sections.basemap`.

Claude Desktop `claude_desktop_config.json` example (replace both absolute paths):

```json
{"mcpServers":{"geotechniek":{"command":"/absolute/path/to/node","args":["/absolute/path/to/open-geotechniek-studio/packages/core/dist/mcp.mjs"]}}}
```

Claude Code, from a checkout with built `dist`:

```sh
claude mcp add --transport stdio geotechniek -- node /absolute/path/to/packages/core/dist/mcp.mjs
```

The external stdio client is tested in CI. Claude Code 2.1.312 also connected successfully using `claude mcp list` in an isolated configuration on 2026-10-29. This health check establishes host connectivity; it does not establish Claude Desktop UI or an interactive connector. No installable Claude bundle or interactive MCP App is delivered.

The desktop app's own `--mcp` mode is a separate, older headless server (Rust) with its own state and does not run these modules; `--mcp-studio` works in the open window and can add calculations of every app module. Use in Open CalcSheet Studio: see [docs/integratie-open-calcsheet-studio.md](../../docs/integratie-open-calcsheet-studio.md).

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

The scope, sources and limitations of the other modules are those of the app; see the `VERIFICATIE.md` and related notes next to each module in `apps/desktop/src/calc/modules/`.

## Source-preserving export and layer interpretation (2026.44.3)

`exportGef(cpt)` returns `{text,warnings}` using CUR GEF-CPT-Report 1.1.2 headers,
explicit separators, per-column voids, measured/corrected depth and GEF RD/NAP code
31000. Original numeric GEF columns are retained with normalized known units.
Invalid/ambiguous source layouts, invalid numeric tokens and omitted records stop
export rather than silently emitting a partial dataset. For a normalized BRO/JSON
snapshot the GEF export contains the core curve channels and explicitly warns
that the JSON snapshot retains the full original source metadata. No predrill
depth is inferred from the first sample. Differential CI reads both source and
exported synthetic/public examples with Bedrock 0.4.2 and pygef 0.14.1.

`analyzeLayers(cpt)` returns `{layers,provenance,warnings}`. Default minimum layer
thickness and depth hysteresis are 0.1 m; with hysteresis enabled a new class also
requires two consecutive points. Layer boundaries use adjacent depth midpoints;
void intervals remain gaps. `withLayerInterpretation(cpt,settings,manualLayers?)`
stores a separate interpretation in metadata; it never edits measurement points.
Manual ranges are validated for depth bounds, ordering, overlap and known zones.
The JSON export records source CPT/file, method, software version, settings and
edit time. These are indicative qc/Rf zones, not a verified soil description.

Legacy desktop-binary raw GEF/BRO import and GEF writing have been disabled.
Submit a validated `.ifcgeo` snapshot to that service; use this library or the
shared desktop exporter for GEF. No Node executable is spawned by the desktop.
