import { describe, it, expect, vi, afterEach } from "vitest";
import { CALC_REGISTRY, getCalcModule } from "./registry";

describe("calc registry", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
  it("biedt verticale en horizontale paalberekeningen afzonderlijk aan, plus het funderingsadvies", () => {
    expect(CALC_REGISTRY.map((module) => module.id)).toEqual(["pile-bearing-capacity", "laterally-loaded-pile", "foundation-advice"]);
    expect(getCalcModule("foundation-advice")?.category).toBe("report");
    expect(getCalcModule("pile-bearing-capacity")?.status).toBe("experimental");
    expect(getCalcModule("laterally-loaded-pile")?.status).toBe("experimental");
  });

  it("biedt dezelfde conceptmodules op de publieke website", async () => {
    vi.stubEnv("VITE_PUBLIC_WEB", "1");
    vi.resetModules();
    const { CALC_REGISTRY: publicModules } = await import("./registry");
    expect(publicModules.map(module => module.id)).toEqual(["pile-bearing-capacity", "laterally-loaded-pile", "foundation-advice"]);
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
