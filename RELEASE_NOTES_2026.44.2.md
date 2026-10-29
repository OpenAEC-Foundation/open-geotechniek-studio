# Open Geotechniek Studio 2026.44.2

- Add a concept EC7 Annex D worksheet for the drained bearing resistance of a
  rectangular, centrally loaded poer, alongside the one-layer settlement worksheet.
  Inputs are design values; project resistance factors remain explicit. The old
  experimental pile calculations are not exposed in this release.
- Adopt Bedrock Engineer reader improvements: initial depth offset, pre-excavation
  masking, BRO SWE encoding and positional channel flags, unit-aware metadata,
  multiple CPT objects and NEN5104 bore descriptions. Include Apache notices.
- Add separate Qt/Fr/Bq/Ic reference analysis with explicit fixed exponent n=1;
  keep indicative qc/Rf coloring separately named.
- Recognize valid trailing GEF column delimiters, preserve voids and source
  quantities, diagnose unknown units, and decode Windows-1252 with conversion
  locations. Differential tests compare Bedrock 0.4.2 and pygef 0.14.1.
- Correct drawing scale measurements to use unrounded projected coordinates.
  Preserve drawing settings per document before writing mount defaults, including
  scale across tab switches. Browser verification exported the drawing as A3 PDF and a 1:50 paginated report.
- Expose poer calculation in the Node library, HTTP API and MCP. Verify actual
  Claude Code host connectivity in an isolated configuration.

Version 2026.44.1 publication was cancelled after visual QA found false GEF
separator diagnostics. Its tag is retained; this version contains the correction.
The release workflow publishes only after all platform signing checks succeed.
AWS deployment is deferred at the user's request. Broader research requirements
remaining in issues #14/#15 are recorded honestly in docs/READINESS.md.
