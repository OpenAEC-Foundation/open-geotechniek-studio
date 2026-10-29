import { describe, it, expect } from "vitest";
import { CALC_REGISTRY, getCalcModule } from "./registry";

describe("calc registry", () => {
  it("exposes only the requested settlement worksheet in desktop/dev builds", () => {
    expect(CALC_REGISTRY.map((module) => module.id)).toEqual(["settlement"]);
    expect(getCalcModule("pile-bearing-capacity")).toBeUndefined();
  });

  it("is a defined array", () => {
    expect(Array.isArray(CALC_REGISTRY)).toBe(true);
  });

  it("has unique module ids if any modules are registered", () => {
    const ids = CALC_REGISTRY.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("getCalcModule returns undefined for unknown id", () => {
    expect(getCalcModule("does-not-exist")).toBeUndefined();
  });
});
