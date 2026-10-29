# Open Geotechniek Studio — 2026.44.1 candidate

Blueprint shell, fonts and five themes; a single concept settlement worksheet (20 mm hand-check example). Other experimental calculations are withheld. The public web build contains no calculation code. Version fields now synchronize desktop, Node core, native SDK and package lockfiles using ISO year.week.release.

## Issue fixes

- #1: unified development/desktop settlement worksheet replaces the inaccessible experimental calculation selection.
- #2: reference markers belong to their CPT, preserve ownership when dragged and persist through project save/reopen.
- #3: documented trusted importer interface and headless core; `.modgru` requires a converter based on its actual specification.
- #4: explicit chart scale and multi-page soundings with interpolated page boundaries, editable cover title, shared browser/desktop vector reports.
- #5: drawing follows the selected map location without requiring a CPT; restored explicit drawings preserve their viewport; title-block scale updates map geometry; PDF capture uses the actual paper dimensions.
- #14 (partial): robust GEF token/void/separator/CRS/depth diagnostics, original quantities retained, typed pre-excavation/specimens, BRO regime/metadata and reversible outlier exclusion; validation JSON/CSV; accurate indicative qc/Rf labels; schema-invalid IFC4x3 writer disabled; synthetic fixtures and MIT license.
- #15 (partial): headless ESM core, authenticated HTTP contract, MCP and external-client tests, native DLL/.so ABI and consumer test, release signing workflow, AWS Fargate deployment candidate. See [evidence and remaining acceptance](docs/READINESS.md).
- #16: version 2026.44.1 consistently applied, with CI checks and a version-update script.

Browser project/report/GEF-BORE fixes reuse selected work from PR #13 (`47c83ac84057f6a3e2b1e1f3b42947ebccb56eb7`); that PR's unrelated changes are not included.

## Validation and release status

239 frontend tests passed, including the report metadata changes. Production frontend and public builds, three external core/HTTP/MCP tests, four native SDK tests, independent ctypes consumer and three version/signing-script tests passed locally. Dependency audit: zero known vulnerabilities at preparation time.

Signing credentials exist as organization secrets, but this repository still needs access. Required Apple, Azure and OpenPGP secret names are documented in [the previous preparation notes](RELEASE_NOTES_2026.44.0.md). No production private key is copied into source or this chat. The release workflow requires actual signature verification before publication. The local deb is a development artifact without a production release signature.

AWS account/region/target and actual Claude-host verification are outstanding. Issues #14/#15 must remain open until their remaining evidence is delivered. Neither CI configuration nor a local test key proves production signing.
