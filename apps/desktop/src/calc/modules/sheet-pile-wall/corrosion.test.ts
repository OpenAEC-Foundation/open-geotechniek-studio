// Afroesting in de damwandmodule: zonder verlies precies de huidige uitkomst, twee zones met elk hun eigen grootste
// snedekrachten, de stijfheid alleen met het vinkje, en referentie nr. 3 van docs/damwand/referentieberekeningen.md
// (VERIFICATIE.md, hoofdstuk 11).
import { describe, expect, it } from "vitest";
import { NO_CORROSION, type CorrosionFace } from "../../shared/corrosion";
import { FACTOR_SETS, REPRESENTATIVE, computeWall, wallExample, type WallInput, type WallLayer, type WallOk } from "./compute";

const custom = (mm: number): CorrosionFace => ({ ...NO_CORROSION, source: "custom", customMm: mm });
const table = (env: CorrosionFace["environment"], life: CorrosionFace["lifeYears"]): CorrosionFace => ({ ...NO_CORROSION, source: "table", environment: env, lifeYears: life });
const ok = (i: WallInput): WallOk => { const r = computeWall(i); if (!r.ok) throw new Error(r.error); return r; };
const by = (r: WallOk, id: string) => r.checks.filter((c) => c.id === id);

describe("afroesting damwand", () => {
  it("dikteverlies 0 geeft exact de huidige uitkomsten", () => {
    const base = wallExample(), before = computeWall(base);
    const after = computeWall({ ...base, corrosion: { high: custom(0), low: table("soil-undisturbed", 5), zoned: true, zoneNap: -3, highBelow: custom(0), lowBelow: NO_CORROSION, reducedStiffness: true } });
    expect(after).toEqual({ ...before, corrosion: null });
  });

  it("één zone: buiging met het profiel na afroesting, krachtsverdeling ongewijzigd", () => {
    const base = wallExample(), r0 = ok(base), r = ok({ ...base, corrosion: { high: custom(1), low: custom(1), zoned: false, zoneNap: 0, highBelow: NO_CORROSION, lowBelow: NO_CORROSION, reducedStiffness: false, classChoice: 3 } });
    expect(r.uls.maxMoment).toEqual(r0.uls.maxMoment); expect(r.eiKnM2).toBe(r0.eiKnM2);
    const z = r.corrosion!.zones[0];
    expect(z.sheet.basis).toBe("contour"); expect(z.sheet.profile.flangeMm).toBeCloseTo(z.sheet.original.flangeMm! - 2, 9);
    expect(by(r, "bending")[0].resistance).toBeLessThan(by(r0, "bending")[0].resistance);
    expect(by(r, "bending")[0].steps.some((s) => s.symbol === "Δt")).toBe(true);
  });

  it("met het vinkje rekent de krachtsverdeling met EI na afroesting", () => {
    const base = wallExample(), c = { high: custom(1), low: custom(1), zoned: false, zoneNap: 0, highBelow: NO_CORROSION, lowBelow: NO_CORROSION, reducedStiffness: true };
    const r = ok({ ...base, corrosion: c });
    expect(r.eiKnM2).toBeCloseTo((210000 * r.corrosion!.zones[0].sheet.profile.iCm4PerM! * 1e4) / 1e9, 6);
    expect(r.eiKnM2).toBeLessThan(r.corrosion!.eiOriginalKnM2);
  });

  it("twee zones: elke zone met haar eigen grootste moment", () => {
    const base = wallExample(), split = -2.5;
    const r = ok({ ...base, corrosion: { high: custom(0.5), low: custom(2), zoned: true, zoneNap: split, highBelow: custom(0.3), lowBelow: custom(0.3), reducedStiffness: false, classChoice: 3 } });
    const bending = by(r, "bending");
    expect(bending).toHaveLength(2);
    const top = Math.max(...r.uls.samples.filter((q) => q.nap >= split).map((q) => Math.abs(q.momentKnM))), low = Math.max(...r.uls.samples.filter((q) => q.nap <= split).map((q) => Math.abs(q.momentKnM)));
    expect(bending[0].load).toBeCloseTo(top, 9); expect(bending[1].load).toBeCloseTo(low, 9);
    expect(bending[0].title).toContain("boven NAP"); expect(bending[1].title).toContain("onder NAP");
    expect(bending[0].resistance).toBeLessThan(bending[1].resistance);
  });
});

// Referentie nr. 3: dezelfde invoer als reference-cases.test.ts (rekenwaarden zoals de bron, stap 6.3).
function layers(low: boolean): WallLayer[] {
  const u = (top: number, bottom: number) => (low ? { excessTop: top, excessBottom: bottom } : {});
  return [
    { topNap: 20.5, name: "dijksmateriaal", gamma: 18, gammaSat: 18, phi: 22.5, c: 0, delta: 15, undrained: false, cu: 0, kh: 2000, kh2: 800, kh3: 500 },
    { topNap: 19.5, name: "zand, opgebracht", gamma: 18, gammaSat: 20, phi: 30, c: 0, delta: 20, undrained: false, cu: 0, kh: 20000, kh2: 10000, kh3: 5000, ...u(0, 5.37) },
    { topNap: 16, name: "klei, zandhoudend", gamma: 18, gammaSat: 18, phi: 22.5, c: 3, delta: 15, undrained: false, cu: 0, kh: 4000, kh2: 2000, kh3: 800, ...u(5.37, 17.56) },
    { topNap: 10, name: "zand en grind, vast", gamma: 19, gammaSat: 21, phi: 35, c: 0, delta: 23.3, undrained: false, cu: 0, kh: 40000, kh2: 20000, kh3: 10000, ...u(17.56, 17.56) },
  ];
}
const riverWall = (corrosion?: WallInput["corrosion"]): WallInput => {
  const base = wallExample();
  return { ...base, groundHighNap: 20.5, groundLowNap: 18.65, excavationNap: 18.65, waterHighNap: 20.44, waterLowNap: 18.65, surchargeKpa: 0, wallTopNap: 20.5, toeNap: 13, profileId: "GU 8N", grade: "S240GP",
    layersHigh: layers(false), lowSameAsHigh: false, layersLow: layers(true), anchor: { ...base.anchor, enabled: false }, factors: { ...FACTOR_SETS[2].factors, gammaK: 1.3, deltaWaterHighM: 0.05, deltaWaterLowM: 0.25 },
    eiFactor: 0.66, gammaWater: 9.81, passiveMethod: "straight", corrosion };
};

describe("referentie nr. 3 met afroesting (GU 8N, S240GP, 1,2 mm per zijde in 100 jaar)", () => {
  const soil = table("soil-undisturbed", 100);
  it("tabelwaarde onverstoorde grond, 100 jaar = 1,2 mm, de waarde van de bron", () => {
    const r = ok(riverWall({ high: soil, low: soil, zoned: false, zoneNap: 0, highBelow: NO_CORROSION, lowBelow: NO_CORROSION, reducedStiffness: false, classChoice: 3 }));
    expect(r.corrosion!.zones[0].lossHighMm).toBe(1.2); expect(r.corrosion!.zones[0].lossLowMm).toBe(1.2);
  });
  it("klasse 3 na afroesting: M_c;Rd = W_el;red · f_y = 125,5 kNm/m tegen 122,46 van de bron (+2,5 %)", () => {
    const r = ok(riverWall({ high: soil, low: soil, zoned: false, zoneNap: 0, highBelow: NO_CORROSION, lowBelow: NO_CORROSION, reducedStiffness: false, classChoice: 3 })), b = by(r, "bending")[0];
    expect(Math.abs(b.resistance / 122.46 - 1)).toBeLessThan(0.03); expect(b.resistance).toBeGreaterThan(122.46);
    // Bron: u.c. 89,75 / 122,46 = 0,73; de module met haar eigen moment (87,7 kNm/m) 0,70.
    expect(b.uc).toBeGreaterThan(0.68); expect(b.uc).toBeLessThan(0.74);
    expect(r.corrosion!.zones[0].sheet.profile.classes!.S240GP).toBe(3);
  });
  it("zonder keuze rekent de module met de ongunstigste klasse (4): dan geen buigtoets, wel een melding", () => {
    const r = ok(riverWall({ high: soil, low: soil, zoned: false, zoneNap: 0, highBelow: NO_CORROSION, lowBelow: NO_CORROSION, reducedStiffness: false }));
    expect(by(r, "bending")).toHaveLength(0); expect(r.warnings.some((w) => w.includes("klasse 3 of 4"))).toBe(true);
  });
  it("zonder afroesting blijft de profieltoets van hoofdstuk 10 (224,4 kNm/m)", () => {
    expect(by(ok(riverWall()), "bending")[0].resistance).toBeCloseTo(224.4, 6);
    expect(REPRESENTATIVE.gammaM0).toBe(1);
  });
});
