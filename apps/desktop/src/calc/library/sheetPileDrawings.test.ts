// De exacte contouren uit de CAD-tekeningen van de fabrikanten (sheet-pile-contours.json), getoetst aan de
// profieltabel van dezelfde fabrikant: A binnen 3 %, I, W_el en W_pl binnen 5 %. A, I, W_el en W_pl worden hier
// rechtstreeks uit de opgeslagen omtrekken berekend (veelhoek, Green); de tabelwaarden komen uit de catalogi in
// sheet-piles.json. Bij AS 500 geeft de catalogus geen A per m wand: de toets gaat dan via de massa (staal 7850 kg/m³).
import { describe, expect, it } from "vitest";
import { SHEET_PILES, findSheetPile } from "./sheetPiles";
import { DRAWING_CONTOUR_IDS, contourModuli, contourSectionProperties, drawingContour, sheetContour, sheetGeometry } from "./sheetPileContour";

const rel = (v: number, ref: number) => v / ref - 1;

describe("exacte contour uit de fabriekstekening", () => {
  it("elke contour hoort bij een profiel van dezelfde fabrikant en noemt bron, bestand en ophaaldatum", () => {
    expect(DRAWING_CONTOUR_IDS.length).toBeGreaterThanOrEqual(120);
    for (const id of DRAWING_CONTOUR_IDS) {
      const p = findSheetPile(id)!, c = drawingContour(p)!;
      expect(p, id).toBeDefined(); expect(c.manufacturer, id).toBe(p.manufacturer);
      expect(c.url, id).toMatch(/^https:\/\//); expect(c.file.length, id).toBeGreaterThan(3); expect(c.retrieved, id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // De getekende strook is een geheel aantal planken breed; punten op 0,01 mm.
      expect(c.pitchMm / p.widthMm!, id).toBeCloseTo(c.planks.length, 9);
      for (const plank of c.planks) { expect(plank.length % 2, id).toBe(0); for (const v of plank) expect(Math.abs(v * 100 - Math.round(v * 100)), id).toBeLessThan(1e-6); }
    }
  });

  it("A binnen 3 % en I binnen 5 % van de profieltabel, voor elk profiel met een contour", () => {
    for (const id of DRAWING_CONTOUR_IDS) {
      const p = findSheetPile(id)!, out = contourSectionProperties(p), refA = p.areaCm2PerM ?? p.massKgPerM2! / 0.785;
      expect(Math.abs(rel(out.areaCm2PerM, refA)), `${id} A ${out.areaCm2PerM.toFixed(1)} / ${refA.toFixed(1)}`).toBeLessThan(0.03);
      if (p.iCm4PerM) expect(Math.abs(rel(out.iCm4PerM, p.iCm4PerM)), `${id} I ${out.iCm4PerM.toFixed(0)} / ${p.iCm4PerM}`).toBeLessThan(0.05);
    }
  });

  it("W_el = I / e en W_pl om de plastische neutrale lijn binnen 5 % van de profieltabel", () => {
    let plastic = 0;
    for (const id of DRAWING_CONTOUR_IDS) {
      const p = findSheetPile(id)!, w = contourModuli(p);
      if (p.welCm3PerM) expect(Math.abs(rel(w.welCm3PerM, p.welCm3PerM)), `${id} Wel ${w.welCm3PerM.toFixed(0)} / ${p.welCm3PerM}`).toBeLessThan(0.05);
      if (p.wplCm3PerM) { plastic++; expect(Math.abs(rel(w.wplCm3PerM, p.wplCm3PerM)), `${id} Wpl ${w.wplCm3PerM.toFixed(0)} / ${p.wplCm3PerM}`).toBeLessThan(0.05); }
    }
    expect(plastic).toBeGreaterThan(100);
  });

  it("narekenbaar: AZ 18-700 uit de tekening, en de contour ligt symmetrisch om de as van de wand", () => {
    // Catalogus: A = 139,2 cm²/m, I = 37 800 cm⁴/m, W_el = 1 800 cm³/m, W_pl = 2 116 cm³/m; uit de tekening A = 139,4 cm²/m.
    const p = findSheetPile("AZ 18-700")!, s = contourSectionProperties(p), w = contourModuli(p);
    expect(s.areaCm2PerM).toBeCloseTo(139.4, 0); expect(s.iCm4PerM / 37800).toBeCloseTo(1, 3);
    expect(w.welCm3PerM / 1800).toBeCloseTo(1, 2); expect(w.wplCm3PerM / 2116).toBeCloseTo(1, 2);
    // Dubbele plank: zwaartelijn en plastische neutrale lijn vallen op de as van de wand (y = 0).
    expect(Math.abs(w.neutralAxisMm)).toBeLessThan(0.05); expect(Math.abs(w.plasticAxisMm)).toBeLessThan(0.5);
    const ys = sheetContour(p, 2).plates.flat().map((q) => q.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(420, 0);
  });

  it("de wand wordt uit de getekende strook herhaald; sloten zitten in de omtrek", () => {
    const p = findSheetPile("PU 18")!, c = sheetContour(p, 5), d = drawingContour(p)!;
    expect(c.geometry.basis).toBe("drawing"); expect(c.plates).toHaveLength(5); expect(c.locks).toHaveLength(0); expect(c.widthMm).toBe(5 * 600);
    expect(c.plates[2][0].x - c.plates[0][0].x).toBeCloseTo(d.pitchMm, 9); expect(c.plates[3][7].y).toBeCloseTo(c.plates[1][7].y, 9);
    // De schematische hartlijn ligt aan dezelfde kant als de getekende flens.
    const flange = c.centerlines[0][1], near = c.plates[0].filter((q) => Math.abs(q.x - flange.x) < 40);
    expect(Math.sign(near.reduce((s, q) => s + q.y, 0))).toBe(Math.sign(flange.y));
  });

  it("zonder contour blijft de vorm de afgeleide of schematische, met de markering", () => {
    const without = SHEET_PILES.filter((p) => !drawingContour(p));
    expect(without.map((p) => p.id)).toEqual(expect.arrayContaining(["JFESP-2", "NS-SP-10H", "TKL 602 +0,5", "TKL 606 A"]));
    for (const p of without) {
      const c = sheetContour(p, 2);
      expect(c.geometry.basis, p.id).not.toBe("drawing"); expect(c.geometry.basis, p.id).toBe(sheetGeometry(p).basis); expect(c.locks.length, p.id).toBe(c.lockPoints.length);
    }
  });
});

// De schematische contour is uit A en I van de tabel afgeleid; W daaruit is dus geen onafhankelijke controle,
// alleen een toets van de tekenfunctie: de vlakke platen geven W binnen 10 % van de tabel.
describe("schematische contour (niet onafhankelijk): W uit de afgeleide platen", () => {
  it("W_el en W_pl van de afgeleide vorm binnen 10 % van de tabel", () => {
    const derived = SHEET_PILES.filter((p) => sheetGeometry(p).basis === "derived");
    for (const p of derived) {
      const w = contourModuli(p, { exact: false });
      if (p.welCm3PerM) expect(Math.abs(rel(w.welCm3PerM, p.welCm3PerM)), `${p.id} Wel ${w.welCm3PerM.toFixed(0)} / ${p.welCm3PerM}`).toBeLessThan(0.1);
      if (p.wplCm3PerM) expect(Math.abs(rel(w.wplCm3PerM, p.wplCm3PerM)), `${p.id} Wpl ${w.wplCm3PerM.toFixed(0)} / ${p.wplCm3PerM}`).toBeLessThan(0.1);
    }
  });
});
