// Afroesting: tabelwaarden, het naar binnen schuiven van een omtrek, het profiel na afroesting en de klasse. Bron van de
// tabelwaarden: NEN-EN 1993-5 tabel 4-1 en 4-2 (aanbevolen waarden), niet tegen de normtekst gelegd.
import { describe, expect, it } from "vitest";
import { findSheetPile } from "../library/sheetPiles";
import { polygonModuli } from "../library/sheetPileContour";
import { CORROSION_ENVIRONMENTS, catalogRatioRange, corrodedSheetPile, corrodedTube, faceLossMm, offsetPolygon, tableLossMm } from "./corrosion";
import { rowOk, sheetVerification } from "./corrosion-verification";

describe("dikteverlies", () => {
  it("tabelwaarden per milieu en levensduur; verdichte aanvulling de helft van niet verdicht", () => {
    expect(tableLossMm("soil-undisturbed", 100)).toBe(1.2);
    expect(tableLossMm("soil-undisturbed", 5)).toBe(0);
    expect(tableLossMm("sea-splash", 100)).toBe(7.5);
    expect(tableLossMm("fresh-water", 50)).toBe(0.9);
    expect(tableLossMm("soil-undisturbed", 30)).toBeNull();
    const loose = CORROSION_ENVIRONMENTS.find((e) => e.id === "fill-loose")!, dense = CORROSION_ENVIRONMENTS.find((e) => e.id === "fill-compacted")!;
    dense.lossMm.forEach((v, k) => expect(v).toBeCloseTo(loose.lossMm[k]! / 2, 9));
    // Elke rij heeft vijf kolommen die met de levensduur oplopen.
    for (const e of CORROSION_ENVIRONMENTS) { expect(e.lossMm).toHaveLength(5); for (let k = 1; k < 5; k++) expect(e.lossMm[k]!).toBeGreaterThanOrEqual(e.lossMm[k - 1]!); }
    expect(faceLossMm({ source: "custom", environment: "soil-undisturbed", lifeYears: 50, customMm: 2.5 })).toBe(2.5);
    expect(faceLossMm({ source: "none", environment: "sea-splash", lifeYears: 100, customMm: 9 })).toBe(0);
  });
});

describe("omtrek naar binnen", () => {
  it("vlakke plaat, met de hand: 10 mm dik, 1 mm boven en 2 mm onder eraf", () => {
    const plate = [{ x: 0, y: -5 }, { x: 1000, y: -5 }, { x: 1000, y: 5 }, { x: 0, y: 5 }], m = polygonModuli([offsetPolygon(plate, 1, 2)], 1000);
    expect(m.areaCm2PerM).toBeCloseTo(70, 9); expect(m.iCm4PerM).toBeCloseTo((1000 * 343) / 12 / 1e4, 9);
    expect(m.welCm3PerM).toBeCloseTo((1000 * 49) / 6 / 1e3, 9); expect(m.wplCm3PerM).toBeCloseTo(12.25, 6); expect(m.neutralAxisMm).toBeCloseTo(0.5, 9);
    // Met de klok mee ingevoerd geeft hetzelfde.
    expect(polygonModuli([offsetPolygon([...plate].reverse(), 1, 2)], 1000).areaCm2PerM).toBeCloseTo(70, 9);
  });
});

describe("damwandprofiel na afroesting", () => {
  it("zonder verlies het profiel zelf", () => {
    const p = findSheetPile("GU 8N")!;
    expect(corrodedSheetPile(p, 0, 0).profile).toBe(p);
  });
  it("met de contour opnieuw gerekend; de benadering zonder contour ligt in dezelfde orde", () => {
    const p = findSheetPile("GU 8N")!, c = corrodedSheetPile(p, 1.2, 1.2), a = corrodedSheetPile({ ...p, id: "geen contour" }, 1.2, 1.2);
    expect(c.basis).toBe("contour"); expect(a.basis).toBe("approx");
    expect(c.profile.flangeMm).toBeCloseTo(5.1, 9); expect(c.profile.webMm).toBeCloseTo(4.7, 9);
    // W_el 770 → 523 cm³/m (68 %); A 103,1 → 69,1 cm²/m.
    expect(c.profile.welCm3PerM!).toBeCloseTo(523, -1); expect(c.profile.areaCm2PerM!).toBeCloseTo(69.1, 0);
    expect(Math.abs(a.profile.welCm3PerM! / c.profile.welCm3PerM! - 1)).toBeLessThan(0.02);
  });
  it("de klasse verschuift door afroesting: GU 8N in S240GP van 2 naar 3 of 4", () => {
    const p = findSheetPile("GU 8N")!;
    // Catalogus: klasse 2 bij S270GP, 3 bij S320GP: b/t_f ligt tussen 37·ε(320) = 31,7 en 37·ε(270) = 34,5.
    const [lo, hi] = catalogRatioRange(p);
    expect(lo).toBeCloseTo(37 * Math.sqrt(235 / 320), 6); expect(hi).toBeCloseTo(37 * Math.sqrt(235 / 270), 6);
    const c = corrodedSheetPile(p, 1.2, 1.2);
    expect(c.classRange.S240GP).toEqual([3, 4]); expect(c.uncertainGrades).toContain("S240GP"); expect(c.profile.classes!.S240GP).toBe(4);
    expect(corrodedSheetPile(p, 1.2, 1.2, 3).profile.classes!.S240GP).toBe(3);
    // Een keuze buiten het bereik wordt begrensd: klasse 2 kan niet meer.
    expect(corrodedSheetPile(p, 1.2, 1.2, 2).profile.classes!.S240GP).toBe(3);
    // Weinig afroesting laat de klasse staan.
    expect(corrodedSheetPile(p, 0.05, 0).profile.classes!.S240GP).toBe(2);
  });
  it("te veel verlies of geen plaatdikte geeft een melding", () => {
    const p = findSheetPile("GU 8N")!;
    expect(() => corrodedSheetPile(p, 4, 4)).toThrow(); expect(() => corrodedSheetPile({ ...p, flangeMm: null }, 1, 1)).toThrow();
  });
});

describe("buis na afroesting", () => {
  it("buiten: diameter 2 Δ kleiner; binnen alleen de wand", () => {
    expect(corrodedTube(323.9, 10, 1.2, 0)).toEqual({ diameterMm: 321.5, wallMm: 8.8 });
    const two = corrodedTube(323.9, 10, 1.2, 1.2); expect(two.diameterMm).toBeCloseTo(321.5, 9); expect(two.wallMm).toBeCloseTo(7.6, 9);
    expect(() => corrodedTube(323.9, 10, 5, 5)).toThrow();
  });
});

describe("verificatietabel damwandprofielen", () => {
  it("alle regels in orde", () => {
    const rows = sheetVerification();
    expect(rows.length).toBeGreaterThan(10);
    for (const r of rows) expect(rowOk(r), `${r.id} ${r.quantity}: verwacht ${r.expected}, module ${r.actual}`).toBe(true);
  });
});
