# Open Geotechniek Studio 2026.44.4

Fix native snapshot fidelity. The older Rust calculation model only knows the
core curves; using it to serialize a snapshot could omit source quantities,
measurement metadata or future fields. The complete source JSON is now kept
separately from that calculation view and returned by native CPT read/list routes
and REST/MCP responses. Native `.ifcgeo` saving preserves that complete snapshot;
the GUI writes the current editable CPT directly, including later annotations.

IFCX project serialization validates the known schema while retaining the complete
original editable payload in `header.metadata.openGeoStudio`. Native save/reopen
and the simple project save route preserve complete cached CPT snapshots.

Regression tests prove unknown quantities, pre-excavation metadata, future fields
and complete project source survive cache/save/reopen; closing a CPT clears both
caches. Includes all 2026.44.3 reader, export, BRO and layer improvements.

AWS remains explicitly deferred. The independent engineering factor review and
withheld pile-module acceptance points remain open in #14.
