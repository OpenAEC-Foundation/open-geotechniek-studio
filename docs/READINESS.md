# Versioned delivery evidence — 2026.44.1 candidate

This is an evidence ledger, not a claim that every checkbox in issues #14/#15 is complete. Runtime evidence must refer to this version's actual artifacts.

| Capability | Boundary / supported runtime | Evidence / limitation |
| --- | --- | --- |
| Desktop Windows | x64 NSIS | CI builds and verifies Authenticode/timestamp on installer, installed application, uninstaller and SDK DLL; actual signed run pending org-secret access |
| Desktop Linux | x64 deb/AppImage | Local deb build; release CI verifies detached OpenPGP signatures; actual production signing pending org-secret access |
| Desktop macOS | universal Intel/Apple Silicon DMG | CI build with Developer ID, notarization and checks on the mounted delivered app; runner evidence pending |
| Public web | browser, no calculations | CI asserts calculation code is absent from public bundle |
| Development/desktop calculation | one-layer settlement, concept | 20 mm hand example; other experimental calculation modules withheld |
| Node product core | Node >=22 ESM | Shared GEF parser, snapshot validation, indicative qc/Rf layers, settlement; external consumer test without GUI |
| Native SDK | C ABI, Windows x64 DLL / Linux x64 .so; macOS source build | Export/ownership contract and Python ctypes consumer test; no parser/report exports; CI tests all three hosts |
| HTTP API v1 | standalone Node, loopback default | External process tests for token authentication, errors, GEF parse, health/version, settlement |
| MCP | stdio JSON-RPC, MCP 2024-11-05 | External client initialize/list/call test; three stateless tools, no resources or writes |
| Claude | manual Desktop/Code configuration | Configuration documented; actual Claude host connection unverified; no interactive app or installable bundle |
| UI | Blueprint 0.4 source commit 6c9c8967b4025befa808aa4998bfbae03cc27025 | Vendored tokens/fonts, hashes and license notices; five themes, compact native shell; `scripts/check-blueprint.mjs` validates source assets |
| AWS | private Node container on ECS/Fargate | Dockerfile, CloudFormation, scoped execution role, token from Secrets Manager, internal HTTPS ALB, health/logging and remote smoke script; no chosen account/region/runtime run yet |
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

Issue #14 remains open for legacy native parser parity, Windows-1252 file decoding, complete diagnostic coverage/GEF-export validation, multiple BRO objects (currently explicitly rejected rather than silently truncated), BRO paging/cache/location uncertainty, normalized Robertson classification, editable/hysteretic layers, independent pile reference/export, and differential tests against two external GEF parsers. No pile design capability is released by hiding the old modules.

Issue #15 remains open until real signed Windows/macOS/Linux artifacts, an actual Claude connection and an AWS runtime smoke-test have versioned evidence. A container definition alone does not satisfy AWS acceptance.
