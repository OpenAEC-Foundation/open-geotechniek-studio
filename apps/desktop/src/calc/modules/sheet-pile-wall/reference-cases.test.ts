// Openbare berekeningen als vergelijking; bronnen, invoer en de verschillen staan in VERIFICATIE.md, hoofdstuk 6.
import { describe, expect, it } from "vitest";
import { FACTOR_SETS, computeWall, wallExample, type WallInput, type WallOk } from "./compute";

const ok = (i: WallInput): WallOk => { const r = computeWall(i); if (!r.ok) throw new Error(r.error); return r; };

/**
 * Onverankerde stalen damwand als grond- en waterkering langs een rivier, één fase (openbaar rapport, 2022).
 * De bron rekent met een verenmodel met drie beddingsconstanten per laag en een aflopend maaiveld achter de wand;
 * hier één beddingsconstante per laag en een vlak maaiveld.
 */
function riverWall(branch: 0 | 1 | 2): WallInput {
  const base = wallExample();
  return {
    ...base, groundHighNap: 20.5, groundLowNap: 18.65, excavationNap: 18.65, waterHighNap: 20.44, waterLowNap: 18.65, surchargeKpa: 0, wallTopNap: 20.5, toeNap: 13, profileId: "GU 8N", grade: "S240GP",
    layersHigh: [
      { topNap: 20.5, name: "dijksmateriaal", gamma: 18, gammaSat: 18, phi: 22.5, c: 0, delta: 15, undrained: false, cu: 0, kh: [2000, 800, 500][branch] },
      { topNap: 19.5, name: "zand, opgebracht", gamma: 18, gammaSat: 20, phi: 30, c: 0, delta: 20, undrained: false, cu: 0, kh: [20000, 10000, 5000][branch] },
      { topNap: 16, name: "klei, zandhoudend", gamma: 18, gammaSat: 18, phi: 22.5, c: 3, delta: 15, undrained: false, cu: 0, kh: [4000, 2000, 800][branch] },
      { topNap: 10, name: "zand en grind, vast", gamma: 19, gammaSat: 21, phi: 35, c: 0, delta: 23.3, undrained: false, cu: 0, kh: [40000, 20000, 10000][branch] },
    ],
    anchor: { ...base.anchor, enabled: false }, factors: { ...FACTOR_SETS[2].factors },
  };
}

describe("openbare referentieberekening: onverankerde damwand langs een rivier", () => {
  const published = { momentKnM: 89.75, shearKn: 48.93, displacementMm: 31.4, mobilisedPct: 62.3, eiKnM2: 25221 };

  it("zelfde buigstijfheid als de bron; moment en dwarskracht in dezelfde orde (binnen 30 %), aan de lage kant", () => {
    const r = ok(riverWall(0));
    expect(r.eiKnM2).toBeCloseTo(published.eiKnM2, 0);
    const m = Math.abs(r.uls.maxMoment.value), v = Math.abs(r.uls.maxShear.value);
    expect(Math.abs(m / published.momentKnM - 1)).toBeLessThan(0.3); expect(Math.abs(v / published.shearKn - 1)).toBeLessThan(0.3);
    expect(m).toBeLessThan(published.momentKnM); expect(v).toBeLessThan(published.shearKn);
    expect(Math.abs(100 * r.uls.passive.ratio - published.mobilisedPct)).toBeLessThan(10);
    // Blum geeft met dezelfde rekenwaarden vrijwel hetzelfde moment als het verenmodel.
    expect(Math.abs(m / r.blum.cantilever!.maxMomentKnM - 1)).toBeLessThan(0.05);
  });

  it("de verplaatsing blijft ruim onder die van de bron: één beddingsconstante is stijver dan de drietakkige veer", () => {
    // Vastgelegd als bekende afwijking, niet als toets op de bronwaarde.
    for (const branch of [0, 1, 2] as const) {
      const mm = ok(riverWall(branch)).sls.headDisplacementM * 1000;
      expect(mm).toBeGreaterThan(10); expect(mm).toBeLessThan(published.displacementMm);
    }
    expect(ok(riverWall(2)).sls.headDisplacementM).toBeGreaterThan(ok(riverWall(0)).sls.headDisplacementM);
  });

  it("de beddingsconstante verandert het moment nauwelijks, de waterstandstoeslag wel", () => {
    const base = Math.abs(ok(riverWall(0)).uls.maxMoment.value);
    expect(Math.abs(Math.abs(ok(riverWall(2)).uls.maxMoment.value) / base - 1)).toBeLessThan(0.02);
    const shifted = ok({ ...riverWall(0), factors: { ...FACTOR_SETS[2].factors, deltaWaterHighM: 0.05, deltaWaterLowM: 0.25 } });
    expect(Math.abs(shifted.uls.maxMoment.value)).toBeGreaterThan(1.04 * base);
  });
});
