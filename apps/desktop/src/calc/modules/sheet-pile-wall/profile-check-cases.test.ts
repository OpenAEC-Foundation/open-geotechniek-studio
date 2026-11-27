// Profieltoets (NEN-EN 1993-5: buiging, dwarskracht, buiging met normaalkracht) met profielen die een exacte
// contour uit de fabriekstekening hebben, naast de eis of de uitkomst van een openbare berekening. Bron, invoer
// en de uitleg per verschil staan in VERIFICATIE.md, hoofdstuk 10; de nummers zijn die van
// docs/damwand/referentieberekeningen.md. Het weerstandsmoment wordt hier ook uit de contour zelf berekend, als
// onafhankelijke controle op de tabelwaarde die de toets gebruikt.
import { describe, expect, it } from "vitest";
import { findGrade, findSheetPile } from "../../library/sheetPiles";
import { contourModuli, drawingContour } from "../../library/sheetPileContour";
import { blum } from "./blum";
import { steelChecks, wallExample, type WallInput, type WallRun } from "./compute";

/** Alleen de grootheden die de profieltoets leest: moment, dwarskracht en de verticale ankercomponent per m wand. */
const loads = (mKnM: number, vKn: number, verticalKn = 0) => ({ maxMoment: { value: mKnM, nap: 0 }, maxShear: { value: vKn, nap: 0 }, anchor: verticalKn ? { horizontalKn: 0, axialKn: 0, perAnchorKn: 0, verticalKn, displacementM: 0 } : null }) as unknown as WallRun;
const input = (profileId: string, grade: string): WallInput => ({ ...wallExample(), profileId, manufacturer: findSheetPile(profileId)!.manufacturer, grade, betaB: 1, normalForceKn: 0, factors: { ...wallExample().factors, gammaM0: 1 } });
function check(profileId: string, grade: string, mKnM: number, vKn: number, verticalKn = 0) {
  const p = findSheetPile(profileId)!, fy = findGrade(grade)!.fyMPa, { checks } = steelChecks(input(profileId, grade), p, fy, loads(mKnM, vKn, verticalKn));
  const by = (id: string) => checks.find((c) => c.id === id)!;
  return { p, fy, bending: by("bending"), shear: by("shear"), normal: by("normal") };
}

describe("profieltoets met profielen uit de fabriekstekening, naast openbare berekeningen", () => {
  it("nr. 1, bouwkuip: AZ 18-700 in S240GP; de bron rekent elastisch (M_r;d = 432 = W_el·f_y), de module plastisch (klasse 2)", () => {
    // Bron: M_s;d = 410 kNm/m tegen M_r;d = 432 kNm/m; D_s;d = 122 kN/m. Geen normaalkracht opgegeven.
    const c = check("AZ 18-700", "S240GP", 410, 122), w = contourModuli(c.p);
    expect(drawingContour(c.p)).toBeDefined();
    // Elastisch uit de contour: 1 800 cm³/m · 240 N/mm² = 432 kNm/m, de waarde van de bron.
    expect((w.welCm3PerM * c.fy) / 1000).toBeCloseTo(432, -1); expect(Math.abs((w.welCm3PerM * c.fy) / 1000 / 432 - 1)).toBeLessThan(0.005);
    // De module: klasse 2 bij S240GP, dus W_pl = 2 116 cm³/m: M_c;Rd = 507,8 kNm/m, u.c. 0,81 (bron 410/432 = 0,95).
    expect(c.bending.resistance).toBeCloseTo(507.84, 1); expect(c.bending.uc).toBeCloseTo(410 / 507.84, 3);
    expect(Math.abs((w.wplCm3PerM * c.fy) / 1000 / c.bending.resistance - 1)).toBeLessThan(0.01);
    // Dwarskracht: A_v = 9 · (420 − 9) / 0,7 = 5 284 mm²/m, V_pl;Rd = 732 kN/m, u.c. 0,17.
    expect(c.shear.resistance).toBeCloseTo((((9 * 411) / 0.7) * 240) / Math.sqrt(3) / 1000, 6); expect(c.shear.uc).toBeLessThan(0.2);
  });

  it("nr. 26, collegevoorbeeld vrije opleg: M_max en de ankerkracht van de bron, met AZ 13-770 in S355GP", () => {
    // Bron: M_max = 359,24 kNm/m; A = 172 kN/m horizontaal, anker onder 10°. De bron geeft geen profiel en geen dwarskracht;
    // V komt uit de Blum-uitwerking van de module (zelfde invoer, nagerekend in blum.test.ts).
    const net = (z: number) => 0.27 * (10 + 18 * z) - (z > 10 ? 3.69 * 18 * (z - 10) : 0), free = blum(net, 10, 3, 30, 0.002).free!;
    const vertical = 172 * Math.tan((10 * Math.PI) / 180), c = check("AZ 13-770", "S355GP", 359.24, free.maxShearKn, vertical), w = contourModuli(c.p);
    // Benodigd elastisch weerstandsmoment bij S355: 359,24·10⁶ / 355 = 1 012 cm³/m; AZ 13-770 heeft er volgens de contour 1 300.
    const required = (359.24 * 1e3) / c.fy;
    expect(required).toBeCloseTo(1012, 0); expect(w.welCm3PerM).toBeGreaterThan(required);
    // Klasse 3 bij S355GP: elastisch, M_c;Rd = 1 300 · 355 = 461,5 kNm/m, u.c. 0,78.
    expect(c.bending.resistance).toBeCloseTo(461.5, 1); expect(c.bending.uc).toBeCloseTo(0.778, 3);
    // Normaalkracht 30,3 kN/m tegen N_pl;Rd = 125,8 · 355 / 10 = 4 466 kN/m: n = 0,0068; klasse 3 lineair, M_N;Rd = 458,4 kNm/m.
    expect(vertical).toBeCloseTo(30.33, 2); expect(c.normal.resistance).toBeCloseTo(461.5 * (1 - vertical / 4465.9), 0); expect(c.normal.passes).toBe(true);
    expect(c.shear.passes).toBe(true); expect(free.maxShearKn).toBeGreaterThan(100);
  });

  it("nr. 25, handboekvoorbeeld: benodigd W = 16,39 in³/ft bij 0,5·f_y (50 ksi); PZ 22 uit de fabriekstekening voldoet", () => {
    // Bron: M_max = 34 149 ft-lb per ft, toelaatbare spanning 0,5 · 50 ksi: S = 34 149 · 12 / 25 000 = 16,39 in³/ft.
    const s = (34149 * 12) / 25000, perM = (s * 16.387064) / 0.3048, p = findSheetPile("PZ 22")!, w = contourModuli(p);
    expect(s).toBeCloseTo(16.39, 2); expect(perM).toBeCloseTo(881.3, 0);
    // PZ 22: W_el uit de contour 985 cm³/m (tabel 973); in de vorm van de bron u.c. = 881 / 985 = 0,89.
    expect(Math.abs(w.welCm3PerM / p.welCm3PerM! - 1)).toBeLessThan(0.05); expect(perM / w.welCm3PerM).toBeLessThan(0.95);
    // Met de module in S355GP (f_y 355 tegen 345 N/mm²), zonder klasse in de bibliotheek dus elastisch: M = 151,9 kNm/m tegen 345,4 kNm/m.
    const m = (34149 * 1.3558179) / 0.3048 / 1000, c = check("PZ 22", "S355GP", m, 0);
    expect(m).toBeCloseTo(151.9, 1); expect(c.bending.resistance).toBeCloseTo((973 * 355) / 1000, 1); expect(c.bending.uc).toBeLessThan(0.5);
  });
});
