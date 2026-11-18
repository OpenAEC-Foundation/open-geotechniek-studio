import { describe, expect, it } from "vitest";
import { SHEET_PILES, SHEET_PILE_GRADES, findGrade, findSheetPile, sheetPileCatalog, wallMomentCapacity, wallStiffness } from "./sheetPiles";

describe("damwandbibliotheek", () => {
  it("bevat de reeksen van de vijf fabrikanten, elk met een bron", () => {
    const catalog = sheetPileCatalog();
    expect([...catalog.keys()].sort()).toEqual(["ArcelorMittal", "JFE Steel", "Nippon Steel", "Nucor Skyline", "terra infrastructure"]);
    expect([...catalog.get("ArcelorMittal")!.keys()].sort()).toEqual(["AS 500", "AU", "AZ", "GU", "PU"]);
    expect(SHEET_PILES.every((p) => p.source.startsWith("http"))).toBe(true);
    expect(new Set(SHEET_PILES.map((p) => `${p.manufacturer}|${p.id}`)).size).toBe(SHEET_PILES.length);
  });

  it("heeft samenhangende waarden: W ≈ I/(h/2) en massa ≈ 7850 kg/m³ · oppervlak", () => {
    for (const p of SHEET_PILES) {
      if (p.iCm4PerM !== null && p.welCm3PerM !== null && p.wallHeightMm !== null) {
        const w = p.iCm4PerM / (p.wallHeightMm / 20);
        expect(Math.abs(w / p.welCm3PerM - 1), p.id).toBeLessThan(0.05);
      }
      if (p.areaCm2PerM !== null && p.massKgPerM2 !== null) {
        expect(Math.abs((p.areaCm2PerM * 0.785) / p.massKgPerM2 - 1), p.id).toBeLessThan(0.03);
      }
    }
  });

  it("geeft de catalogusgegevens van een bekend profiel terug", () => {
    const az = findSheetPile("az 18-700")!;
    expect(az.manufacturer).toBe("ArcelorMittal");
    expect(az.iCm4PerM).toBe(37800);
    expect(az.welCm3PerM).toBe(1800);
    expect(wallStiffness(az)).toBeCloseTo(79380, 0);
  });

  it("rekent de momentcapaciteit elastisch of plastisch volgens de doorsnedeklasse", () => {
    expect(findGrade("S355GP")?.fyMPa).toBe(355);
    expect(SHEET_PILE_GRADES.length).toBeGreaterThanOrEqual(7);
    const az = findSheetPile("AZ 18-700")!;
    const m = wallMomentCapacity(az, "S355GP")!;
    const cls = az.classes?.S355GP;
    const w = cls === 1 || cls === 2 ? az.wplCm3PerM! : az.welCm3PerM!;
    expect(m.mRd).toBeCloseTo((w * 355) / 1000, 3);
    expect(m.basis).toBe(cls === 1 || cls === 2 ? "plastisch" : "elastisch");
    expect(wallMomentCapacity(findSheetPile("AS 500-9.5")!, "S355GP")).toBeNull();
  });
});
