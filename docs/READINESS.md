# Versioned delivery evidence — 2026.44.4

This is an evidence ledger, not a claim that every checkbox in issues #14/#15 is complete. Runtime evidence must refer to this version's actual artifacts.

| Capability | Boundary / supported runtime | Evidence / limitation |
| --- | --- | --- |
| Desktop Windows | x64 NSIS | CI builds and verifies Authenticode/timestamp on installer, installed application, uninstaller and SDK DLL; v2026.44.2 signed installer/payload/uninstaller/DLL verified in release run 40805343347; signer Impertio Studio B.V. |
| Desktop Linux | x64 deb/AppImage | Local deb build; release CI verifies detached OpenPGP signatures; v2026.44.2 OpenPGP signatures verified in CI and locally on downloaded artifacts |
| Desktop macOS | universal Intel/Apple Silicon DMG | CI build with Developer ID, notarization and checks on the mounted delivered app; v2026.44.2 notarization Accepted, codesign/spctl/stapler and both architectures verified from mounted delivered DMG |
| Public web | browser, no calculations | CI asserts calculation code is absent from public bundle |
| Development/desktop calculation | one-layer settlement and EC7 Annex D poer, concept | 20 mm settlement and 1979.100751 kN poer examples; manual design values/factors; old experimental pile modules withheld |
| Node product core | Node >=22 ESM | Shared GEF parser, snapshot validation, indicative qc/Rf layers, fixed-n=1 normalized point analysis, settlement and poer; external consumer test without GUI |
| Native SDK | C ABI, Windows x64 DLL / Linux x64 .so; macOS source build | Export/ownership contract and Python ctypes consumer test; no parser/report exports; CI tests all three hosts |
| HTTP API v1 | standalone Node, loopback default | External process tests for token authentication, errors, GEF parse, health/version, settlement and poer |
| MCP | stdio JSON-RPC, MCP 2024-11-05 | External client initialize/list/call test; four stateless tools, no resources or writes |
| Claude | manual Desktop/Code configuration | Configuration documented; Claude Code 2.1.312 health check connected on 2026-10-29 using isolated CLAUDE_CONFIG_DIR; no interactive app or installable bundle |
| UI | Blueprint 0.4 source commit 6c9c8967b4025befa808aa4998bfbae03cc27025 | Vendored tokens/fonts, hashes and license notices; five themes, compact native shell; `scripts/check-blueprint.mjs` validates source assets |
| AWS | private Node container on ECS/Fargate | Dockerfile, CloudFormation, scoped execution role, token from Secrets Manager, internal HTTPS ALB, health/logging and remote smoke script; deployment to an actual account explicitly deferred by the user on 2026-10-29; not claimed verified |
| Updater signing | no updater delivered | Installer signing does not establish updater signatures; explicitly outside this release |

The desktop-binary API/MCP is a legacy integration. Unvalidated raw GEF/BRO
imports and the old GEF writer are disabled; GUI imports use the shared parser
and pass validated JSON snapshots to native storage. Its native reports and old
layer method do not expose the shared GUI/Node controls. New integrations should
use the documented Node core. Native regression tests cover fail-closed import
and BRO result-limit/rejection handling.

## Reproducible checks

```
npm --prefix apps/desktop ci
npm --prefix apps/desktop test
npm --prefix apps/desktop run build
python3 scripts/version.py --check
node scripts/check-blueprint.mjs
python3 scripts/test-release.py
node scripts/build-core.mjs
node --test packages/core/test.mjs
cargo test --locked --manifest-path packages/native/Cargo.toml
cargo build --locked --release --manifest-path packages/native/Cargo.toml
python3 packages/native/test-consumer.py packages/native/target/release/libopenaec_geotechniek.so
```

Release workflow is fail-closed: publication requires every platform build and verification. Linux test-key signing tests prove script behavior, not organization signatures. No secret values are stored or printed.

## Remaining research / verification

Issue #14 remains open for independent engineering review of factors and the
withheld pile module's second reference / pile-plan result-export requirements.
The user requested that unreleased calculations be removed from this release;
only settlement and the concept poer worksheet are exposed. A request for an
approved independent factor/reference source is pending. No normative approval
or pile capability is inferred from concept status or successful software tests.

Issue #15 was closed for the authorized release scope using actual evidence in
[release run 40805343347](https://github.com/OpenAEC-Foundation/open-geotechniek-studio/actions/runs/40805343347)
and [published v2026.44.2 assets](https://github.com/OpenAEC-Foundation/open-geotechniek-studio/releases/tag/v2026.44.2).
AWS deployment was explicitly deferred by the user, and is not claimed verified.
Release 2026.44.3 also passed its complete signing run 40811070824. Release 2026.44.4 must pass its own artifact checks before publication.

## Reader and visual evidence for 2026.44.2

- Bedrock gef-parser 0.4.2 (e895db2) initial offset, pre-excavation behavior and
  NEN5104 bore codes; BRO parser ed84e54 SWE encoding/channel masks/units adapted
  with attribution and Apache-2.0 license. Original quantities remain available.
- Differential interpretation check: all 3 synthetic fixture rows and all 553
  public example rows compared with Bedrock 0.4.2 and pygef 0.14.1. pygef's automatic
  void-row removal is disabled for this comparison; original void sentinels are
  compared as missing values. Both external parsers share a tokenizer dependency.
- Browser QA: report downloaded at 1:50 as six A4 pages, including a two-page CPT
  and custom cover; CPT page rendered and inspected. Drawing downloaded as A3
  landscape with rendered map, north arrow, scale bar and 1:1000 title block.
- Browser tab-switch QA: requested 1:1000 remained 1:1000 in title block and both
  property fields; selected Rotterdam address remained present in both views.
  Saved settings restore before the first default-state write, scoped per document.
- Exact map-projection coordinates now remove the subpixel measurement drift
  between requested scale, properties and title block.
- Windows-1252 decoding reports every converted high byte with source line/byte
  column. Unknown GEF physical units are preserved as source parameters and
  excluded from interpretation with an error; known units convert explicitly.

Open #14 items remain open rather than being marked complete by a release tag.
The old pile module remains withheld, including its unresolved independent
reference, factor review and pile-plan export requirements. The new poer module
is a concept calculation and does not replace an independent engineering review.


## Additional source / interpretation controls in 2026.44.3

- Complete raw GEF headers and BRO object XML/envelope metadata remain in snapshots;
  repeated unknown BRO metadata values are visible. Removed BRO layers are typed.
  Data diagnostics include XML source lines; split-object positions explicitly
  refer to the preserved CPT fragment. Mixed depth methods and fallback records
  are listed individually in validation JSON and summarized in the viewer.
- Shared GEF export retains original numeric columns, preserves qc/fs/Rf/u2 and
  corrected depth, writes 31000 for known RD positions and never invents predrill
  depth. Invalid/ambiguous recovered inputs stop export. Both source and exported
  public examples are compared with two external parsers in CI.
- BRO cap detection triggers spatial subdivision and deduplication. A bounded,
  expiring cache reuses requests; explicit refresh clears it. Exhaustion and
  service failures are shown as incomplete searches instead of empty success.
- Existing map transformation is shared and regression-tested within 0.5 m against
  four public BRO RD/ETRS89 pairs. It is a map approximation, not survey-grade
  RDNAPTRANS. Position method/available uncertainty are retained in metadata.
- Minimum-thickness/hysteresis controls, manual layer edits and source-attributed
  JSON export preserve the measurement arrays. Void gaps remain uninterpreted.


## Snapshot fidelity in 2026.44.4

The typed native calculation model is a view. The complete input JSON is stored
separately and returned by CPT read/list routes and native REST/MCP. GUI saves use
the current editable CPT; native `.ifcgeo` writes use the complete cached source.
IFCX conversion embeds the complete original project payload in the editable
header instead of serializing only the older typed model. Seven native regression
tests include unknown quantities, metadata/future fields, source file round trips
and full project IFCX save/reopen. Legacy project rendering remains a projection;
the editable source is preserved independently of it.
