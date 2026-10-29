# OpenAEC Geotechniek native SDK

A public C ABI with no Tauri or GUI dependency. Scope: snapshot validation and indicative 1D settlement. This library does not expose the CPT parsers, report rendering or the withheld pile calculation.

```sh
cargo build --locked --release --manifest-path packages/native/Cargo.toml
cargo test --locked --manifest-path packages/native/Cargo.toml
python3 packages/native/test-consumer.py packages/native/target/release/libopenaec_geotechniek.so
```

Windows output: `openaec_geotechniek.dll`; Linux: `libopenaec_geotechniek.so`; macOS source build: `libopenaec_geotechniek.dylib`. Header: `include/openaec_geotechniek.h`. Windows/Linux release archives contain the library, header, consumer test and this contract. macOS desktop distribution is supported separately; a prebuilt macOS native SDK is not delivered in this release.

Exports:

- `const char *ogs_core_version(void)`: borrowed static UTF-8 version, never free it.
- `char *ogs_core_call(const unsigned char *data, size_t length)`: caller supplies a readable UTF-8 JSON buffer for the call duration; returns an owned NUL-terminated UTF-8 JSON string, always released once with `ogs_core_free`.
- `void ogs_core_free(char *data)`: accepts null or a live result from this same library; never use another allocator or free twice.

Request: `{"operation":"settlement","input":{"thicknessM":2,"stressIncreaseKpa":50,"constrainedModulusMpa":5}}`, or `{"operation":"validate_cpt","input":<CPT snapshot>}`. Reply: `{"ok":true,"result":...}` or `{"ok":false,"error":"..."}`. Zero-length/null input gives a JSON error. Panics are caught at the boundary. Invalid pointers are a C caller contract violation and cannot be validated by the library. Calls hold no global mutable state and write no files. JSON request size is caller-controlled, so hosts should impose a limit on untrusted inputs.

Settlement units are metres / kPa / MPa → millimetres. The example is 20 mm. Positive layer thickness/modulus and non-negative stress are required. Strain ≥100% is rejected; >5% generates a warning. This is a concept model, without a design verification or partial factors. Type and geotechnical validation remain the caller's responsibility.
