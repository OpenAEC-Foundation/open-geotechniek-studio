// Verificatie van de afroesting van damwandprofielen: handgerekende gevallen en referentie nr. 3 van
// docs/damwand/referentieberekeningen.md, live doorgerekend met de rekenkern (corrosion.ts). Dezelfde tabel staat in
// VERIFICATIE.md van de damwand en wordt getoetst in corrosion-verification.test.ts; in de app toont het blok
// "Verificatie" bij de afroesting hem (CorrosionVerification.tsx).
import { findSheetPile } from "../library/sheetPiles";
import { contourSectionProperties, polygonModuli, sectionPolygons, type Pt } from "../library/sheetPileContour";
import { corrodedSheetPile, offsetPolygon } from "./corrosion";

export interface VerificationRow {
  /** Geval, bv. "D1". */
  id: string;
  /** Invoer in het kort. */
  input: string;
  /** Grootheid met eenheid, bv. "A [cm²/m]". */
  quantity: string;
  expected: number;
  actual: number;
  /** Toegestaan relatief verschil (0,001 = 0,1 %); bij een klasse 0. */
  tolerance: number;
  /** Bron of formule van de verwachte waarde. */
  basis: string;
}
export const rowOk = (r: VerificationRow) => (r.tolerance === 0 ? r.actual === r.expected : Math.abs(r.actual - r.expected) <= r.tolerance * Math.max(Math.abs(r.expected), 1e-9));
export const rowDiff = (r: VerificationRow) => (r.expected === 0 ? r.actual - r.expected : r.actual / r.expected - 1);

/** Lengte van de randen van een omtrek die naar +y en naar −y kijken [mm] (tegen de klok in). */
function faceLengths(poly: Pt[]): { pos: number; neg: number } {
  const area = poly.reduce((s, p, k) => { const q = poly[(k + 1) % poly.length]; return s + (p.x * q.y - q.x * p.y) / 2; }, 0), sign = area < 0 ? -1 : 1;
  let pos = 0, neg = 0;
  poly.forEach((p, k) => { const q = poly[(k + 1) % poly.length], len = Math.hypot(q.x - p.x, q.y - p.y), out = (-(q.x - p.x) / (len || 1)) * sign; if (out > 1e-6) pos += len; else if (out < -1e-6) neg += len; });
  return { pos, neg };
}

export function sheetVerification(): VerificationRow[] {
  const rows: VerificationRow[] = [];
  // D1: vlakke plaat 1 000 × 10 mm, afroesting 1,0 mm boven en 2,0 mm onder. Met de hand: t = 7 mm, de plaat loopt van
  // y = −3 tot +4: A = 1 000 · 7 = 7 000 mm², I = 1 000 · 7³ / 12, e = 3,5 mm, W_el = I / e, W_pl = 1 000 · 7² / 4.
  const plate: Pt[] = [{ x: 0, y: -5 }, { x: 1000, y: -5 }, { x: 1000, y: 5 }, { x: 0, y: 5 }];
  const m = polygonModuli([offsetPolygon(plate, 1, 2)], 1000), d1 = "plaat 1000 × 10 mm, Δ 1,0 / 2,0 mm";
  rows.push(
    { id: "D1", input: d1, quantity: "A [cm²/m]", expected: 70, actual: m.areaCm2PerM, tolerance: 1e-9, basis: "1 000 · 7 mm" },
    { id: "D1", input: d1, quantity: "I [cm⁴/m]", expected: (1000 * 7 ** 3) / 12 / 1e4, actual: m.iCm4PerM, tolerance: 1e-9, basis: "b · t³ / 12" },
    { id: "D1", input: d1, quantity: "W_el [cm³/m]", expected: (1000 * 7 ** 2) / 6 / 1e3, actual: m.welCm3PerM, tolerance: 1e-9, basis: "b · t² / 6" },
    { id: "D1", input: d1, quantity: "W_pl [cm³/m]", expected: (1000 * 7 ** 2) / 4 / 1e3, actual: m.wplCm3PerM, tolerance: 1e-6, basis: "b · t² / 4" },
    { id: "D1", input: d1, quantity: "zwaartelijn [mm]", expected: 0.5, actual: m.neutralAxisMm, tolerance: 1e-9, basis: "(4 − 3) / 2" },
  );
  // D2 en D3: profielen met een exacte contour. A met de hand uit de omtrek: per rand lengte maal het verlies van die
  // zijde, A_red ≈ A − Δ₁ · L₊ − Δ₂ · L₋ (zonder de kleine hoekcorrecties). W_el met de dunwandige vuistregel
  // W · (t_f − Δ) / t_f, die alleen de flens verkleint: een grovere controle.
  const contourCase = (id: string, profileId: string, l1: number, l2: number) => {
    const p = findSheetPile(profileId)!, c = corrodedSheetPile(p, l1, l2), { polygons, widthMm } = sectionPolygons(p, {}), before = contourSectionProperties(p);
    const lengths = polygons.map(faceLengths).reduce((s, f) => ({ pos: s.pos + f.pos, neg: s.neg + f.neg }), { pos: 0, neg: 0 });
    const aHand = before.areaCm2PerM - ((l1 * lengths.pos + l2 * lengths.neg) / 100) / (widthMm / 1000);
    const aModule = polygonModuli(c.polygons!, widthMm).areaCm2PerM, input = `${profileId}, Δ ${String(l1).replace(".", ",")} / ${String(l2).replace(".", ",")} mm`;
    rows.push(
      { id, input, quantity: "A uit de contour [cm²/m]", expected: aHand, actual: aModule, tolerance: 0.01, basis: "A − Δ₁ L₊ − Δ₂ L₋" },
      { id, input, quantity: "t_f [mm]", expected: p.flangeMm! - l1 - l2, actual: c.profile.flangeMm!, tolerance: 1e-9, basis: "t_f − Δ₁ − Δ₂" },
      { id, input, quantity: "W_el [cm³/m]", expected: (p.welCm3PerM! * (p.flangeMm! - l1 - l2)) / p.flangeMm!, actual: c.profile.welCm3PerM!, tolerance: 0.06, basis: "W · (t_f − Δ) / t_f, dunwandig" },
    );
  };
  contourCase("D2", "AZ 18-700", 1.2, 1.2);
  contourCase("D3", "PU 18", 2.0, 0);
  // D4: referentie nr. 3 (GU 8N, S240GP, 1,2 mm per zijde in 100 jaar): toelaatbaar 122,46 kNm/m. De bron rekent
  // elastisch; in de module met klasse 3 na afroesting: M_c;Rd = W_el;red · f_y.
  const gu = findSheetPile("GU 8N")!, ref = corrodedSheetPile(gu, 1.2, 1.2, 3), auto = corrodedSheetPile(gu, 1.2, 1.2);
  rows.push(
    { id: "D4", input: "GU 8N S240GP, Δ 1,2 / 1,2 mm, klasse 3", quantity: "M_c;Rd [kNm/m]", expected: 122.46, actual: (ref.profile.welCm3PerM! * 240) / 1000, tolerance: 0.03, basis: "referentie nr. 3 (2022)" },
    { id: "D4", input: "GU 8N S240GP, Δ 1,2 / 1,2 mm", quantity: "klasse na afroesting, laagst", expected: 3, actual: auto.classRange.S240GP[0], tolerance: 0, basis: "b/t_f uit de catalogus · 7,5 / 5,1" },
    { id: "D4", input: "GU 8N S240GP, Δ 1,2 / 1,2 mm", quantity: "klasse na afroesting, automatisch", expected: 4, actual: auto.profile.classes!.S240GP, tolerance: 0, basis: "ongunstigste van 3 en 4" },
  );
  // D5: zonder afroesting precies het profiel uit de bibliotheek.
  const none = corrodedSheetPile(gu, 0, 0);
  rows.push({ id: "D5", input: "GU 8N, Δ 0", quantity: "W_pl [cm³/m]", expected: gu.wplCm3PerM!, actual: none.profile.wplCm3PerM!, tolerance: 0, basis: "tabel" });
  return rows;
}
