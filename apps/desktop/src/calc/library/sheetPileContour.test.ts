// De contour van de damwandprofielen: maatvast in b, h, t en s, en in doorsnede en traagheidsmoment gelijk aan de tabel.
import { describe, expect, it } from "vitest";
import { SHEET_PILES, findSheetPile } from "./sheetPiles";
import { contourProperties, contourSectionProperties, sheetContour, sheetGeometry, thicken } from "./sheetPileContour";

describe("contour van een damwandprofiel", () => {
  it("omtrek van een strook: rechte plaat, en een knik met verstek", () => {
    expect(contourProperties([thicken([{ x: 0, y: 0 }, { x: 100, y: 0 }], [10])])).toEqual({ areaMm2: 1000, inertiaMm4: (100 * 10 ** 3) / 12 });
    // Haakse knik van twee platen van 10 mm: 2·100·10 langs de hartlijn, het verstek telt de hoek één keer.
    const corner = thicken([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], [10, 10]);
    expect(corner).toHaveLength(6); expect(contourProperties([corner]).areaMm2).toBeCloseTo(2000, 6);
    // Een plaat op 50 mm van de as: I = A·e² + b·t³/12.
    expect(contourProperties([thicken([{ x: 0, y: 50 }, { x: 200, y: 50 }], [8])]).inertiaMm4).toBeCloseTo(1600 * 2500 + (200 * 8 ** 3) / 12, 6);
  });

  it("Z-plank: breedte, hoogte en plaatdikten uit de tabel; sloten aan de flens op de buitenvezel, om en om", () => {
    const p = findSheetPile("AZ 18-700")!, c = sheetContour(p, 2, { exact: false }), g = c.geometry;
    expect([g.widthMm, g.heightMm, g.flangeThicknessMm, g.webThicknessMm]).toEqual([700, 420, 9, 9]); expect(c.widthMm).toBe(1400);
    expect(c.lockPoints.map((q) => [q.x, q.y])).toEqual([[0, 205.5], [700, -205.5], [1400, 205.5]]);
    const ys = c.plates.flat().map((q) => q.y), xs = c.plates.flat().map((q) => q.x);
    // Buitenmaat van de platen: precies de wandhoogte en de breedte van twee planken.
    expect(Math.max(...ys)).toBeCloseTo(210, 6); expect(Math.min(...ys)).toBeCloseTo(-210, 6); expect(Math.min(...xs)).toBeCloseTo(0, 6); expect(Math.max(...xs)).toBeCloseTo(1400, 6);
    // De tabel geeft de flensbreedte niet: afgeleid uit A en I, en dus schematisch.
    expect(g.basis).toBe("derived"); expect(g.flangeMm).toBeGreaterThan(0.3 * 700); expect(g.flangeMm).toBeLessThan(0.7 * 700);
    expect(g.webAngleDeg).toBeCloseTo((Math.atan2(411, 700 - g.flangeMm) * 180) / Math.PI, 9); expect(g.lockAreaMm2).toBeGreaterThan(0);
  });

  it("U-plank: sloten op de neutrale lijn, de flens om en om aan weerszijden", () => {
    const p = findSheetPile("AU 18")!, c = sheetContour(p, 2, { exact: false });
    expect(c.lockPoints.map((q) => q.y)).toEqual([0, 0, 0]);
    expect(c.centerlines[0][1].y).toBeCloseTo((441 - 10.5) / 2, 9); expect(c.centerlines[1][1].y).toBeCloseTo(-(441 - 10.5) / 2, 9);
    expect(c.centerlines[0][2].x - c.centerlines[0][1].x).toBeCloseTo(c.geometry.flangeMm, 9);
    expect(c.geometry.basis).toBe("derived");
  });

  it("alle Z- en U-profielen met volledige tabelwaarden: A en I uit de getekende contour binnen 2 % van de bibliotheek", () => {
    const complete = SHEET_PILES.filter((p) => (p.shape === "Z" || p.shape === "U") && p.widthMm && p.wallHeightMm && p.flangeMm && p.webMm && p.areaCm2PerM && p.iCm4PerM);
    expect(complete.length).toBeGreaterThan(150);
    const derived = complete.filter((p) => sheetGeometry(p).basis === "derived");
    // Het platenmodel past op vrijwel elk profiel; de rest valt terug op de vaste verhouding.
    expect(derived.length).toBeGreaterThan(0.9 * complete.length);
    for (const p of derived) {
      const out = contourSectionProperties(p, { exact: false }), g = sheetGeometry(p);
      expect(Math.abs(out.areaCm2PerM / p.areaCm2PerM! - 1), `${p.id} A`).toBeLessThan(0.02);
      expect(Math.abs(out.iCm4PerM / p.iCm4PerM! - 1), `${p.id} I`).toBeLessThan(0.02);
      expect(g.flangeMm, p.id).toBeGreaterThan(0.05 * p.widthMm!); expect(g.flangeMm, p.id).toBeLessThan(0.95 * p.widthMm!);
      expect(g.webAngleDeg, p.id).toBeGreaterThan(20); expect(g.webAngleDeg, p.id).toBeLessThan(89);
    }
  });

  it("een flensbreedte uit een tabel gaat voor; zonder plaatdikten of bij een hoedprofiel blijft de vorm schematisch", () => {
    const p = findSheetPile("AZ 18-700")!;
    expect(sheetGeometry({ ...p, flangeWidthMm: 350 })).toMatchObject({ basis: "table", flangeMm: 350 });
    expect(sheetGeometry({ shape: "U", widthMm: 750, wallHeightMm: 408 })).toMatchObject({ basis: "schematic", flangeMm: 300, lockAreaMm2: 0 });
    const hat = SHEET_PILES.find((x) => x.shape === "hat")!, c = sheetContour(hat, 2);
    expect(c.geometry.basis).toBe("schematic"); expect(c.lockPoints.every((q) => q.y < 0)).toBe(true);
    const flat = SHEET_PILES.find((x) => x.shape === "straight")!;
    expect(sheetContour(flat, 3, { exact: false }).centerlines).toHaveLength(3); expect(sheetContour(flat, 1, { exact: false }).lockPoints.map((q) => q.y)).toEqual([0, 0]);
  });
});
