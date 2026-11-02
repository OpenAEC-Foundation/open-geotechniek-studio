import { describe, it, expect, vi, afterEach } from "vitest";
import { CALC_REGISTRY, getCalcModule } from "./registry";

describe("calc registry", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
  it("exposes only pile bearing capacity in desktop builds", () => {
    expect(CALC_REGISTRY.map((module) => module.id)).toEqual(["pile-bearing-capacity"]);
    expect(getCalcModule("pile-bearing-capacity")?.status).toBe("experimental");
  });

  it("exposes only pile bearing capacity on the public website", async () => {
    vi.stubEnv("VITE_PUBLIC_WEB", "1");
    vi.resetModules();
    const { CALC_REGISTRY: publicModules } = await import("./registry");
    expect(publicModules.map(module => module.id)).toEqual(["pile-bearing-capacity"]);
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
