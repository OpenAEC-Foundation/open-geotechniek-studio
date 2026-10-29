import { describe, it, expect } from "vitest";
import { decodeSource } from "./sourceEncoding";
describe("source text decoding", () => {
  it("preserves UTF-8 and its BOM for parser diagnostics", () => {
    const result = decodeSource(
      new Uint8Array([239, 187, 191, ...new TextEncoder().encode("Dordrécht")]),
    );
    expect(result.text).toBe("\uFEFFDordrécht");
    expect(result.diagnostics).toEqual([]);
  });
  it("decodes legacy Windows-1252 without replacement and records each converted byte", () => {
    const result = decodeSource(new Uint8Array([65, 10, 233, 32, 128]));
    expect(result.text).toBe("A\né €");
    expect(result.diagnostics.slice(1).map((d) => [d.line, d.column])).toEqual([
      [2, 1],
      [2, 3],
    ]);
  });
  it("rejects UTF-16 rather than interpreting it as a single-byte file", () =>
    expect(() => decodeSource(new Uint8Array([255, 254, 65, 0]))).toThrow(
      "UTF-16",
    ));
});
