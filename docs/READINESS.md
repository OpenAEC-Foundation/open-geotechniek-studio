# Versioned delivery evidence — 2026.44.2 candidate

This is an evidence ledger, not a claim that every checkbox in issues #14/#15 is complete. Runtime evidence must refer to this version's actual artifacts.

| Capability | Boundary / supported runtime | Evidence / limitation |
| --- | --- | --- |
| Desktop Windows | x64 NSIS | CI builds and verifies Authenticode/timestamp on installer, installed application, uninstaller and SDK DLL; actual signed run pending completion of the signed release run |
| Desktop Linux | x64 deb/AppImage | Local deb build; release CI verifies detached OpenPGP signatures; actual production signing pending completion of the signed release run |
| Desktop macOS | universal Intel/Apple Silicon DMG | CI build with Developer ID, notarization and checks on the mounted delivered app; runner evidence pending |
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

The native desktop-binary API/MCP remains a legacy integration. Its raw parser/report implementations are not equivalent to the new Node API or shared GUI parser. Prefer the documented Node core for new integrations. This limitation remains part of issue #14.

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

Issue #14 remains open for legacy native parser parity, complete diagnostic coverage/GEF-export validation, BRO paging/cache/location uncertainty, editable/hysteretic layers, independent pile reference/export. No pile design capability is released by hiding the old modules.

Issue #15 remains open until real signed Windows/macOS/Linux artifacts, release verification. AWS is separately deferred by the user have versioned evidence. A container definition alone does not satisfy AWS acceptance.


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
