import { describe, expect, it } from "vitest";
import { chartTextScale } from "./VisualPanel";

describe("chartTextScale", () => {
  it("laat tekst ongemoeid als de grafiek groot genoeg getekend wordt", () => {
    expect(chartTextScale(1)).toBe(1);
    expect(chartTextScale(0.9)).toBe(1);
  });
  it("houdt tekst op ~90 % van de ontwerpmaat bij een verkleinde grafiek", () => {
    // 233 px breed voor een viewBox van 720: zonder correctie 3,2 px tekst.
    const scale = 233 / 720;
    expect(10 * scale * chartTextScale(scale)).toBeGreaterThanOrEqual(10 * 0.32 * 2.2 - 1e-9);
    expect(chartTextScale(0.5) * 0.5).toBeCloseTo(0.9);
  });
  it("begrenst de vergroting en vangt ongeldige schalen af", () => {
    expect(chartTextScale(0.1)).toBe(2.2);
    expect(chartTextScale(0)).toBe(1);
    expect(chartTextScale(Number.NaN)).toBe(1);
  });
});
