import { describe, it, expect } from "vitest";
import { buildMode } from "./buildMode";

describe("builddoelen", () => {
  it("houdt de publieke demo gescheiden van de ingesloten tool", () => {
    expect(buildMode({ VITE_PUBLIC_WEB:"1" })).toEqual({ embedded:false, publicDemo:true, autoExample:true });
    expect(buildMode({ VITE_PUBLIC_WEB:"1", VITE_PLATFORM:"1" })).toEqual({ embedded:true, publicDemo:false, autoExample:false });
  });
  it("opent standaard geen voorbeeldproject", () => {
    expect(buildMode({}).autoExample).toBe(false);
  });
});
