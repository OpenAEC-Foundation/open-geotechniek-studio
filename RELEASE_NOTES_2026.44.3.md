# Open Geotechniek Studio 2026.44.3

- Detect BRO's 2000-object search cap, subdivide the area and deduplicate boundary
  objects. Add bounded expiring caches and explicit refresh. Search errors and
  incomplete areas are visible instead of being reported as empty success.
- Correct inherited location CRS lookup for real BRO dispatches; retain source
  XML, envelope metadata, repeated unknown values and typed removed layers.
  Validate source positions against four public RD/ETRS89 regression pairs.
- Record per-record depth methods, corrected-depth fallback and data source lines.
  Validate required GEF headers, column declarations and void definitions.
- Add minimum layer thickness/hysteresis controls, manual layer editing and JSON
  export with source, method, version and settings. Source measurements are intact.
- Add shared browser/desktop/Node GEF export with preserved source columns, correct
  depth/void/CRS metadata, no inferred predrill depth and fail-closed handling of
  invalid or ambiguous sources. Read exported files with Bedrock and pygef in CI.
- Disable the older native raw GEF/BRO parser and GEF writer that could silently
  shift or omit data. Existing GUI imports are unaffected; legacy external clients
  must submit validated .ifcgeo snapshots and use the shared exporter.

Release 2026.44.2 already delivered verified signing on Windows, macOS and Linux.
This version's artifacts pass the same signing and verification workflow before
publication. AWS remains deferred. Issue #14's independent engineering factor
review and withheld pile-calculation requirements are not claimed complete.
