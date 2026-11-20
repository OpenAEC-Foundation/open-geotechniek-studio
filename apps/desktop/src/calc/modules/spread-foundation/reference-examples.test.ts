// Twintig openbare, uitgewerkte rekenvoorbeelden van een fundering op staal, nagerekend met de
// module. Ze komen uit andere bronnen dan V1 tot en met V14 in compute.test.ts; VOORBEELDEN.md
// geeft per geval de herkomst, de invoer, het verschil in procenten en het oordeel.
//
// De bronnen volgen NEN-EN 1997-1 bijlage D of DIN 4017, met eigen partiële factoren. De module
// rekent daarom met de factoren van de bron (meestal 1,0, soms 1,2 / 1,25 / 1,8 op de sterkte)
// en met γγ = 1,0. Gelijk aan de module zijn in die bronnen: Nq, Nc, Nγ = 2·(Nq − 1)·tan φ'
// (DIN: Nb0 = (Nq − 1)·tan φ' bij een term γ·b'·Nb0, dus de helft van Nγ), de vormfactoren,
// b' = B − 2e, de rekenwaarde via tan φ' en de ongedraineerde formule. Anders zijn de
// hellingfactoren bij gedraineerd draagvermogen:
//
//   bronnen   iq = (1 − x)^m, iγ = (1 − x)^(m + 1), m = (2 + b'/l')/(1 + b'/l') voor H // b'
//             en (2 + l'/b')/(1 + l'/b') voor H // l'; x = H/(V + A'·c'·cot φ'), DIN: x = H/V
//   module    H // b': iq = (1 − 0,70·x)³, iγ = (1 − x)³; H // l': iq = iγ = 1 − x
//
// Bij een gedraineerd geval met horizontale belasting is de einduitkomst dus niet één-op-één
// vergelijkbaar. De test rekent dan (a) de keten van de bron na met Nq, Nc, Nγ en de
// vormfactoren van de module en de hellingfactoren volgens de formule van de bron, en legt
// (b) de eigen uitkomst van de module vast met het verschil in procenten.
//
// Marges: waar de keten gelijk is, de afronding van het afgedrukte getal van de bron (een halve
// eenheid van de laatste decimaal). Bij de nagerekende keten van de bron 0,1 %, of meer waar de
// bron met afgeronde tussenwaarden doorrekent; dat staat er dan bij. Het vastgelegde verschil
// van de module is geen marge maar een meetwaarde, op 0,1 procentpunt.
import { describe, expect, it } from "vitest";
import { DEFAULT_FACTORS } from "./catalog";
import { computeSpread, drainedBearing, type DrainedBearing, type SpreadInput, type SpreadLayer, type SpreadOk } from "./compute";

const L = (topNap: number, name: string, gamma: number, gammaSat: number, phi: number, c = 0, cu = 0): SpreadLayer => ({ topNap, name, gamma, gammaSat, phi, c, cu });
/** Alle partiële factoren op de grond 1,0: de bron rekent met karakteristieke waarden of met eigen rekenwaarden. */
const ONE = { ...DEFAULT_FACTORS, gammaPhi: 1, gammaC: 1, gammaCu: 1, gammaGamma: 1 };
/** Materiaalfactoren 1,25 op tan φ' en c' (NEN-EN 1997-1 tabel A.4, set M2), zoals in vier van de bronnen. */
const M2 = { ...ONE, gammaPhi: 1.25, gammaC: 1.25 };
const base: SpreadInput = {
  cptId: null, shape: "strip", widthM: 1, lengthM: 1, foundationNap: 0, groundNap: 0, waterNap: -50, vDKn: 100, hDKn: 0, hDirection: "B", hArmM: 0, eccBM: 0, eccLM: 0, momentDKnm: 0,
  slopeDeg: 0, baseTiltDeg: 0, castInPlace: true, passiveDKn: 0, gapPossible: false, factors: ONE, layers: [L(0, "zand", 18, 20, 32.5)],
};
const run = (patch: Partial<SpreadInput>): SpreadOk => { const r = computeSpread({ ...base, ...patch }); if (!r.ok) throw new Error(r.error); return r; };
const check = (r: SpreadOk, id: string) => { const c = r.checks.find((x) => x.id === id); if (!c) throw new Error(`toets ${id} ontbreekt`); return c; };
/** Binnen `pct` procent van de waarde uit de bron. */
const within = (actual: number, expected: number, pct: number) => expect(Math.abs(actual - expected) / Math.abs(expected) * 100).toBeLessThanOrEqual(pct);
/** Verschil van de module met de bron in procenten. */
const diffPct = (module: number, source: number) => (module / source - 1) * 100;
const rad = (d: number) => (d * Math.PI) / 180;

/** Exponent m van NEN-EN 1997-1 bijlage D en DIN 4017 voor H in de richting van `along`, loodrecht op `across`. */
const mExp = (along: number, across: number) => (2 + along / across) / (1 + along / across);
/**
 * σ'max met Nq, Nc, Nγ en de vormfactoren van de module, en de hellingfactoren van de bron:
 * iq = (1 − x)^m, iγ = (1 − x)^(m + 1), ic = (iq·Nq − 1)/(Nq − 1) (gelijk aan iq − (1 − iq)/(Nc·tan φ')).
 */
function sourceChain(b: DrainedBearing, p: { cD: number; qKpa: number; gammaD: number; bEffM: number }, x: number, m: number) {
  const iq = (1 - x) ** m, igamma = (1 - x) ** (m + 1), ic = (iq * b.nq - 1) / (b.nq - 1);
  const termC = p.cD * b.nc * b.sc * ic, termQ = p.qKpa * b.nq * b.sq * iq, termGamma = 0.5 * p.gammaD * p.bEffM * b.ngamma * b.sgamma * igamma;
  return { iq, igamma, ic, termC, termQ, termGamma, sigma: termC + termQ + termGamma };
}
const chainOf = (r: SpreadOk, x: number, m: number) => sourceChain(r.drained.bearing, { cD: r.drained.cD, qKpa: r.qKpa, gammaD: r.drained.gammaD, bEffM: r.dims.bEffM }, x, m);

describe("ongedraineerd draagvermogen", () => {
  // R1. C. Smith en M. Gilbert (University of Sheffield), "Ultimate Limit State design to Eurocode 7 using
  // numerical methods, Part II", Ground Engineering, november 2011, blz. 26-27, figuur 3 en tabel 3.
  // https://eprints.whiterose.ac.uk/94144/1/ULS_Design_Ground_Engineering_Part_II.pdf
  // Strook B = 2 m op klei, cu = 60 kPa met factor 1,0, geen dekking (de bovenbelasting telt als gunstig
  // en krijgt factor 0). Bron: R = Nc·cu·B = 617 kN/m (afgedrukt als geheel getal: marge 0,5 kN/m).
  it("R1: strook op klei zonder dekking (Smith en Gilbert 2011)", () => {
    const r = run({ widthM: 2, vDKn: 594, layers: [L(0, "klei", 20, 20, 20, 0, 60)] });
    expect(r.undrained!.resistanceKn).toBeCloseTo(617, 0);
    expect(check(r, "bearing-undrained").loadKn / r.undrained!.resistanceKn).toBeLessThan(1); // bron: 594 ≤ 617, veilig
  });

  // R2. HTW Dresden, lesmateriaal bodemmechanica, "17. Übung: Grundbruch", uitwerking, geval a
  // (Anfangsstandsicherheit). https://www.zaft.htw-dresden.de/bodenmechanik/17uebung_Grundbruch/17uebung_gbr_l.pdf
  // Rechthoek 3,0 × 5,0 m, 1,5 m diep in zand (γ = 18), op klei met cu = 90 kPa. Nk = 595 kN,
  // excentriciteit in twee richtingen (ex = 200/595 = 0,336 m, ey = 150/595 = 0,252 m), resultante van de
  // horizontale krachten Tk = 158,114 kN. Bron: b' = 2,328 m, a' = 4,496 m, νc = 1,104, ic = 0,956,
  // RN;k = a'·b'·(γ·d + 5,142·cu·ic·νc) = 5392,046 kN (drie decimalen; de invoer Tk is op drie decimalen
  // afgerond, daarom een marge van 0,01 kN).
  const htw17: Partial<SpreadInput> = { shape: "pad", widthM: 3, lengthM: 5, groundNap: 1.5, waterNap: 0, vDKn: 595, hDKn: 158.114, eccBM: 200 / 595, eccLM: 150 / 595, layers: [L(1.5, "zand", 18, 20, 32.5), L(0, "klei", 20, 20, 25, 10, 90)] };
  it("R2: rechthoek met dubbele excentriciteit en horizontale belasting, ongedraineerd (HTW Dresden, oefening 17a)", () => {
    const r = run(htw17), u = r.undrained!;
    expect(r.dims.bRawM).toBeCloseTo(2.328, 3); expect(r.dims.lRawM).toBeCloseTo(4.496, 3); expect(r.qKpa).toBeCloseTo(27, 9);
    expect(u.bearing.sc).toBeCloseTo(1.104, 3); expect(u.bearing.ic).toBeCloseTo(0.956, 3);
    expect(Math.abs(u.resistanceKn - 5392.046)).toBeLessThan(0.01);
  });

  // R3. Zelfde oefening, geval b (Langzeitstandsicherheit): φ' = 25°, c' = 10 kPa, γ' = 10 kN/m³ onder de
  // voet. Bron: Nd0 = 10,662, Nb0 = 4,506, Nc0 = 20,721; νd = 1,219, νb = 0,845, νc = 1,241; tan δ = Tk/Nk
  // (δ = 14,882°), m = ma·cos²ω + mb·sin²ω = 1,373 met ω = arctan(50/150); id = 0,654, ib = 0,48, ic = 0,619;
  // RN;k = 4513,475 kN.
  // Vergelijkbaar: de effectieve afmetingen, de draagkracht- en vormfactoren, en de keten van de bron.
  // Niet vergelijkbaar: de einduitkomst. De module kent één richting voor H en andere hellingfactoren;
  // met H // B komt zij op 4506,7 kN (−0,2 %, toeval), met H // L op 5830,3 kN (+29,2 %).
  it("R3: hetzelfde geval gedraineerd; hellingfactoren volgens DIN 4017 (HTW Dresden, oefening 17b)", () => {
    const rB = run(htw17), rL = run({ ...htw17, hDirection: "L" }), b = rB.drained.bearing;
    expect(b.nq).toBeCloseTo(10.662, 3); expect(b.ngamma / 2).toBeCloseTo(4.506, 3); expect(b.nc).toBeCloseTo(20.721, 3);
    expect(b.sq).toBeCloseTo(1.219, 3); expect(b.sgamma).toBeCloseTo(0.845, 3); expect(b.sc).toBeCloseTo(1.241, 2); // bron: 1,241, module 1,2415
    const { bEffM: bE, lEffM: lE } = rB.dims, omega = Math.atan(50 / 150);
    const m = mExp(lE, bE) * Math.cos(omega) ** 2 + mExp(bE, lE) * Math.sin(omega) ** 2;
    expect(m).toBeCloseTo(1.373, 3);
    const src = chainOf(rB, 158.114 / 595, m);
    expect(src.iq).toBeCloseTo(0.654, 3); expect(src.igamma).toBeCloseTo(0.48, 2); expect(src.ic).toBeCloseTo(0.619, 3);
    within(src.sigma * rB.dims.areaM2, 4513.475, 0.1);
    // De module zelf: de uitkomst van de bron ligt tussen H // B en H // L.
    expect(diffPct(rB.drained.resistanceKn, 4513.475)).toBeCloseTo(-0.1, 1);
    expect(diffPct(rL.drained.resistanceKn, 4513.475)).toBeCloseTo(29.2, 1);
  });

  // R4. L. Ernst, "Strip Foundation In Clay {Design Of Soil And Concrete}", Structural Basics (bijgewerkt
  // 13 januari 2024). https://www.structuralbasics.com/strip-foundation-clay-concrete/
  // Strook 1,4 m, 0,5 m diep, grondwater aan maaiveld (γ' = 18 − 10 = 8 kN/m³, q = 4 kPa), cu = 90 kPa met
  // γcu = 1,8 (cu;d = 50 kPa). Bron: R/A = (π + 2)·cu;d + q = 261,1 kPa en Rd = 365,5 kN/m.
  const clay = (cu: number) => [L(0.5, "klei", 18, 18, 20, 0, cu)];
  it("R4: strook op klei met dekking en grondwater (Structural Basics, strook in klei)", () => {
    const r = run({ widthM: 1.4, groundNap: 0.5, waterNap: 0.5, vDKn: 322.7, layers: clay(90), factors: { ...ONE, gammaCu: 1.8 } }), u = r.undrained!;
    expect(u.cuD).toBeCloseTo(50, 9); expect(r.qKpa).toBeCloseTo(4, 9);
    expect(u.bearing.sigmaMaxKpa).toBeCloseTo(261.1, 1); expect(u.resistanceKn).toBeCloseTo(365.5, 1);
    expect(check(r, "bearing-undrained").uc).toBeCloseTo(0.88, 2); // bron: 322,7/365,5 = 0,88
  });

  // R5. L. Ernst, "Pad Foundation In Clay [Design Of Soil And Concrete]", Structural Basics (bijgewerkt
  // 2 augustus 2023). https://www.structuralbasics.com/pad-foundation-clay-concrete/
  // Vierkante poer 1,7 m, 0,5 m diep, grondwater aan maaiveld, cu = 100 kPa met γcu = 1,8 (55,6 kPa).
  // Bron: sc = 1,2; R/A = 346,8 kPa; Rd = 1002 kN (geheel getal: marge 0,5 kN).
  it("R5: vierkante poer op klei, vormfactor 1,2 (Structural Basics, poer in klei)", () => {
    const r = run({ shape: "pad", widthM: 1.7, lengthM: 1.7, groundNap: 0.5, waterNap: 0.5, vDKn: 948.3, layers: clay(100), factors: { ...ONE, gammaCu: 1.8 } }), u = r.undrained!;
    expect(u.cuD).toBeCloseTo(55.6, 1); expect(u.bearing.sc).toBeCloseTo(1.2, 9);
    expect(u.bearing.sigmaMaxKpa).toBeCloseTo(346.8, 1); expect(u.resistanceKn).toBeCloseTo(1002, 0);
  });
});

describe("gedraineerd draagvermogen, verticale belasting", () => {
  // R6 en R7. A. Bond en A. Harris, "Decoding Eurocode 7", Taylor & Francis 2008, hoofdstuk 10,
  // voorbeeld 10.1 "Pad footing on dry sand". Ingezien in een openbaar gedeelde kopie van het hoofdstuk:
  // https://www.slideshare.net/slideshow/design-of-footings-solved-examples-pdf/274545860
  // Poer 1,5 × 2,5 m, 0,5 m diep in droog zand, φ'k = 35°, γ = 18 kN/m³, centrische last.
  // DA1-1 (factoren 1,0): Nq = 33,3, Nc = 46,1, Nγ = 45,2, sq = 1,34, sc = 1,35, sγ = 0,82;
  //   dekkingsterm 402,8 kPa, gewichtsterm 500,7 kPa, samen 903,5 kPa.
  // DA1-2 (γφ' = 1,25): φ'd = 29,3°, Nq = 16,9, Nc = 28,4, Nγ = 17,8, sq = 1,29, sc = 1,31;
  //   196,9 + 197,5 = 394,4 kPa.
  const bh: Partial<SpreadInput> = { shape: "pad", widthM: 1.5, lengthM: 2.5, groundNap: 0.5, layers: [L(0.5, "zand", 18, 18, 35)] };
  it("R6: rechthoekige poer op droog zand, karakteristieke sterkte (Bond en Harris, voorbeeld 10.1, DA1-1)", () => {
    const r = run({ ...bh, vDKn: 1818.3 }), b = r.drained.bearing;
    expect(b.nq).toBeCloseTo(33.3, 1); expect(b.nc).toBeCloseTo(46.1, 1); expect(b.ngamma).toBeCloseTo(45.2, 1);
    expect(b.sq).toBeCloseTo(1.34, 2); expect(b.sc).toBeCloseTo(1.35, 2); expect(b.sgamma).toBeCloseTo(0.82, 9);
    expect(b.termQ).toBeCloseTo(402.8, 1); expect(b.termGamma).toBeCloseTo(500.7, 1); expect(b.sigmaMaxKpa).toBeCloseTo(903.5, 1);
    expect(check(r, "bearing-drained").uc).toBeCloseTo(0.54, 2); // bron: benuttingsgraad 54 %
  });
  it("R7: dezelfde poer met γφ' = 1,25 op tan φ' (Bond en Harris, voorbeeld 10.1, DA1-2)", () => {
    const r = run({ ...bh, vDKn: 1431.9, factors: M2 }), b = r.drained.bearing;
    expect(r.drained.phiD).toBeCloseTo(29.3, 1);
    expect(b.nq).toBeCloseTo(16.9, 1); expect(b.nc).toBeCloseTo(28.4, 1); expect(b.ngamma).toBeCloseTo(17.8, 1);
    expect(b.sq).toBeCloseTo(1.29, 2); expect(b.sc).toBeCloseTo(1.31, 2);
    expect(b.termQ).toBeCloseTo(196.9, 1); expect(b.termGamma).toBeCloseTo(197.5, 1); expect(b.sigmaMaxKpa).toBeCloseTo(394.4, 1);
    expect(check(r, "bearing-drained").uc).toBeCloseTo(0.97, 2); // bron: 97 %
  });

  // R8. L. Ernst, "Pad Foundation Design: Sand & Concrete Verification Under Vertical Load", Structural
  // Basics (bijgewerkt 30 april 2023). https://www.structuralbasics.com/pad-foundation-sand-concrete/
  // Vierkante poer 2,1 m, 0,5 m diep; zand φ = 35° met γφ = 1,2 op tan φ (φ'd = 30,26°); dekking met
  // γ = 18 kN/m³ (q = 9 kPa), onder de voet γ' = 18 − 10 = 8 kN/m³ (grondwater op aanlegniveau).
  // Bron: Nq = 18,96, Nγ = 20,96, sq = 1,504, sγ = 0,7; R/A = 379,9 kPa; Rd = 1675 kN. (De bron drukt bij
  // Rd per abuis 427,4 kPa af; 1675 kN volgt uit 379,9 kPa · 2,1 · 2,1.)
  it("R8: vierkante poer op zand met grondwater op aanlegniveau (Structural Basics, poer in zand)", () => {
    const r = run({ shape: "pad", widthM: 2.1, lengthM: 2.1, groundNap: 0.5, waterNap: 0, vDKn: 1592, layers: [L(0.5, "zand", 18, 18, 35)], factors: { ...ONE, gammaPhi: 1.2 } }), b = r.drained.bearing;
    expect(r.drained.phiD).toBeCloseTo(30.26, 2); expect(r.qKpa).toBeCloseTo(9, 9); expect(r.drained.gammaD).toBeCloseTo(8, 9);
    expect(b.nq).toBeCloseTo(18.96, 2); expect(b.ngamma).toBeCloseTo(20.96, 2); expect(b.sq).toBeCloseTo(1.504, 3); expect(b.sgamma).toBeCloseTo(0.7, 9);
    expect(b.sigmaMaxKpa).toBeCloseTo(379.9, 1); expect(r.drained.resistanceKn).toBeCloseTo(1675, 0);
    expect(check(r, "bearing-drained").uc).toBeCloseTo(0.95, 2); // bron: 1592/1675 = 0,95
  });

  // R9 en R10. Structville, "Design of Biaxial Eccentrically Loaded Pad Footing" (rekenblad volgens
  // NEN-EN 1997-1 bijlage D.4). https://structville.com/design-of-biaxial-eccentrically-loaded-pad-footing
  // Vierkante poer 1,5 m, onderkant 1,1 m onder maaiveld (q = 18·1,1 = 19,8 kPa), c'k = 15 kPa, φ'k = 25°,
  // γ = 18 kN/m³. Momenten in twee richtingen.
  // Combinatie 1: Fd = 1166,0 kN, ex = 46 mm, ey = 38 mm, L'x = 1409 mm, L'y = 1423 mm, A' = 2,005 m²;
  //   Nq = 10,662, Nc = 20,721, Nγ = 9,011; sq = 1,418, sγ = 0,703, sc = 1,462; 834,0 kPa.
  // Combinatie 2 (γφ' = γc' = 1,25): Fd = 889,2 kN, L'x = 1406 mm, L'y = 1421 mm, A' = 1,997 m²;
  //   φ'd = 20,458°, c'd = 12 kPa, Nq = 6,698, Nc = 15,273, Nγ = 4,251; sq = 1,346, sc = 1,407; 474,1 kPa.
  const sv: Partial<SpreadInput> = { shape: "pad", widthM: 1.5, lengthM: 1.5, groundNap: 1.1, layers: [L(1.1, "grond", 18, 18, 25, 15)] };
  it("R9: vierkante poer met cohesie en excentriciteit in twee richtingen (Structville, combinatie 1)", () => {
    const r = run({ ...sv, vDKn: 1166, eccBM: (1.35 * 25 + 1.5 * 13) / 1166, eccLM: (1.35 * 21 + 1.5 * 11) / 1166 }), b = r.drained.bearing;
    expect(r.dims.bEffM).toBeCloseTo(1.409, 3); expect(r.dims.lEffM).toBeCloseTo(1.423, 3); expect(r.dims.areaM2).toBeCloseTo(2.005, 3);
    expect(b.nq).toBeCloseTo(10.662, 3); expect(b.nc).toBeCloseTo(20.721, 3); expect(b.ngamma).toBeCloseTo(9.011, 3);
    expect(b.sq).toBeCloseTo(1.418, 3); expect(b.sgamma).toBeCloseTo(0.703, 3); expect(b.sc).toBeCloseTo(1.462, 3);
    expect(b.sigmaMaxKpa).toBeCloseTo(834.0, 1);
  });
  it("R10: dezelfde poer met γφ' = γc' = 1,25 (Structville, combinatie 2)", () => {
    const r = run({ ...sv, vDKn: 889.2, eccBM: (25 + 1.3 * 13) / 889.2, eccLM: (21 + 1.3 * 11) / 889.2, factors: M2 }), b = r.drained.bearing;
    expect(r.dims.bEffM).toBeCloseTo(1.406, 3); expect(r.dims.lEffM).toBeCloseTo(1.421, 3); expect(r.dims.areaM2).toBeCloseTo(1.997, 3);
    expect(r.drained.phiD).toBeCloseTo(20.458, 3); expect(r.drained.cD).toBeCloseTo(12, 9);
    expect(b.nq).toBeCloseTo(6.698, 3); expect(b.nc).toBeCloseTo(15.273, 3); expect(b.ngamma).toBeCloseTo(4.251, 3);
    expect(b.sq).toBeCloseTo(1.346, 3); expect(b.sc).toBeCloseTo(1.407, 3);
    expect(b.sigmaMaxKpa).toBeCloseTo(474.1, 1);
  });

  // R11 en R12. C. Sachpazis, "Pad Footing Analysis & Design (EN1997-1:2004)", rekenvoorbeeld van
  // 15 april 2014. https://www.slideshare.net/slideshow/sachpazis-pad-footing-analysis-design-en199712004/33546017
  // Poer 1,5 × 2,5 m, onderkant 0,6 m onder maaiveld (q = 12 kPa), c'k = 25 kPa, φ'k = 25°, γ = 20 kN/m³,
  // moment in de lengterichting (e = 60 mm, l' = 2380 mm).
  // Combinatie 1: Fd = 587,4 kN; sq = 1,266, sγ = 0,811, sc = 1,294; 941,9 kPa.
  // Combinatie 2: Fd = 466,3 kN; φ'd = 20,458°, c'd = 20 kPa; sq = 1,220, sc = 1,259; 534,3 kPa.
  const sp: Partial<SpreadInput> = { shape: "pad", widthM: 1.5, lengthM: 2.5, groundNap: 0.6, layers: [L(0.6, "grond", 20, 20, 25, 25)] };
  it("R11: rechthoekige poer met cohesie en excentriciteit in de lengterichting (Sachpazis, poer, combinatie 1)", () => {
    const r = run({ ...sp, vDKn: 587.4, eccLM: (1.35 * 15 + 1.5 * 10) / 587.4 }), b = r.drained.bearing;
    expect(r.dims.lRawM).toBeCloseTo(2.38, 3); expect(r.dims.areaM2).toBeCloseTo(3.57, 3); expect(r.qKpa).toBeCloseTo(12, 9);
    expect(b.sq).toBeCloseTo(1.266, 3); expect(b.sgamma).toBeCloseTo(0.811, 3); expect(b.sc).toBeCloseTo(1.294, 3);
    expect(b.sigmaMaxKpa).toBeCloseTo(941.9, 1);
  });
  it("R12: dezelfde poer met γφ' = γc' = 1,25 (Sachpazis, poer, combinatie 2)", () => {
    const r = run({ ...sp, vDKn: 466.3, eccLM: (15 + 1.3 * 10) / 466.3, factors: M2 }), b = r.drained.bearing;
    expect(r.drained.cD).toBeCloseTo(20, 9); expect(b.sq).toBeCloseTo(1.22, 3); expect(b.sc).toBeCloseTo(1.259, 3);
    expect(b.sigmaMaxKpa).toBeCloseTo(534.3, 1);
  });
});

describe("gedraineerd draagvermogen met horizontale belasting: andere hellingfactoren dan de bron", () => {
  // R13 en R14. HTW Dresden, lesmateriaal funderingstechniek, "Flächengründung 2", funderingsblok van een
  // brugpijler (as 80), versie 25 oktober 2015; gewapende variant (Übung 1.1-2) en ongewapende variant.
  // https://www.zaft.htw-dresden.de/grundbau/11_u_slf2/11_u_slf2_21l.pdf
  // https://www.zaft.htw-dresden.de/grundbau/11_u_slf2/11_u_slf2_1l.pdf
  // Rivierkiezel φ' = 37,5°, c' = 0, grondwater: de bron rekent de dekking en de grond met γ' = 10 kN/m³.
  // Horizontale belasting en moment in de lengterichting. Bron: Nd0 = 45,811, Nb0 = 34,385.
  // Gewapend: 3,75 × 8,25 m, d = 2,05 m, Vk = 29394,531 kN, Mk = 9764,672 kNm (ey = 0,332 m, a' = 7,586 m),
  //   Hk = 765,44 kN; νd = 1,301, νb = 0,852, id = 0,965, ib = 0,94; RN;k = 62931,253 kN.
  // Ongewapend: 3,75 × 8,50 m, d = 5,25 m, Vk = 30855,063 kN, Mk = 11536,448 kNm (a' = 7,752 m),
  //   Hk = 223,335 kN (na aftrek van de reactie op de kopse kant); νd = 1,294, νb = 0,855, id = 0,99,
  //   ib = 0,983; RN;k = 121147,877 kN.
  // Niet vergelijkbaar: de hellingfactoren. Bron: (1 − H/V)^m met m = 1,33 (H // a'); module: 1 − H/V.
  const gravel = [L(10, "kiezel", 20, 20, 37.5)];
  const pier: Partial<SpreadInput> = { shape: "pad", widthM: 3.75, lengthM: 8.25, groundNap: 2.05, waterNap: 2.05, hDirection: "L", layers: gravel };
  it("R13: brugpijler, gewapend blok, H en moment in de lengterichting (HTW Dresden, oefening 1.1-2)", () => {
    const r = run({ ...pier, vDKn: 29394.531, hDKn: 765.44, eccLM: 9764.672 / 29394.531 }), b = r.drained.bearing;
    expect(r.dims.lRawM).toBeCloseTo(7.586, 3); expect(r.qKpa).toBeCloseTo(20.5, 9);
    expect(b.nq).toBeCloseTo(45.811, 3); expect(b.ngamma / 2).toBeCloseTo(34.385, 3); expect(b.sq).toBeCloseTo(1.301, 3); expect(b.sgamma).toBeCloseTo(0.852, 3);
    const src = chainOf(r, 765.44 / 29394.531, mExp(r.dims.lEffM, r.dims.bEffM));
    expect(src.iq).toBeCloseTo(0.965, 3); expect(src.igamma).toBeCloseTo(0.94, 2);
    within(src.sigma * r.dims.areaM2, 62931.253, 0.1);
    expect(b.iq).toBeCloseTo(1 - 765.44 / 29394.531, 9); // module: lineair
    expect(diffPct(r.drained.resistanceKn, 62931.253)).toBeCloseTo(2.1, 1);
  });
  // Dezelfde oefening, afschuiven en kantelen. Afschuiven: δ = ⅔·φ' = 25°, Vk = 28468,531 kN,
  // Rh;k = Vk·tan 25° = 13275,094 kN. Kantelen (EQU): Mdst;d = 1,1·9764,672 = 10741,139 kNm,
  // Mstb;d = 0,9·28468,531·8,25/2 = 105689,422 kNm. Gelijke formules; de marge is de afronding van de bron.
  it("R13: afschuiven met ⅔·φ' en kantelen met 0,9 en 1,1 in dezelfde oefening", () => {
    const r = run({ ...pier, vDKn: 28468.531, hDKn: 956.8, castInPlace: false, vGRepKn: 28468.531, mGRepKnm: 9764.672 });
    expect(check(r, "sliding-drained").resistanceKn).toBeCloseTo(13275.094, 2);
    expect(r.overturning!.mDstD).toBeCloseTo(10741.139, 2); expect(r.overturning!.mStbD).toBeCloseTo(105689.422, 2);
    expect(r.overturning!.uc).toBeCloseTo(0.102, 3);
  });
  it("R14: brugpijler, ongewapend blok met 5,25 m dekking (HTW Dresden, oefening Flächengründung 2, deel 1)", () => {
    const r = run({ ...pier, lengthM: 8.5, groundNap: 5.25, waterNap: 5.25, vDKn: 30855.063, hDKn: 223.335, eccLM: 11536.448 / 30855.063 }), b = r.drained.bearing;
    expect(r.dims.lRawM).toBeCloseTo(7.752, 3); expect(r.qKpa).toBeCloseTo(52.5, 9);
    expect(b.sq).toBeCloseTo(1.294, 3); expect(b.sgamma).toBeCloseTo(0.855, 3);
    const src = chainOf(r, 223.335 / 30855.063, mExp(r.dims.lEffM, r.dims.bEffM));
    expect(src.iq).toBeCloseTo(0.99, 2); expect(src.igamma).toBeCloseTo(0.983, 3);
    within(src.sigma * r.dims.areaM2, 121147.877, 0.1);
    expect(diffPct(r.drained.resistanceKn, 121147.877)).toBeCloseTo(0.4, 1);
  });

  // R15. HTW Dresden, lesmateriaal funderingstechniek, oefening 13 "Schwergewichtsmauer", versie 25 april
  // 2021, par. 4 "Sicherheit gegen Grundbruch". https://www.zaft.htw-dresden.de/grundbau/13_u_mwl2/13_u_mwl2l.pdf
  // Strook 1,5 m onder een keermuur: Vk = 170,337 kN/m, Mk = 61,699 kNm/m (e = 0,362 m, b' = 0,776 m),
  // Hk = 40,877 kN/m; 1,0 m dekking met γ = 20; onder de voet φ' = 30°, c' = 12 kPa, γ' = 10 kN/m³.
  // Bron: Nd0 = 18,401, Nc0 = 30,14, Nb0 = 10,047; tan δ = Hk/Vk (δ = 13,494°), m = 2: id = 0,578,
  // ib = 0,439, ic = 0,553; Rv;k = 346,622 kN/m.
  // Niet vergelijkbaar: DIN 4017 rekent de hellingfactoren met H/V; de module (en bijlage D) met
  // H/(V + A'·c'·cot φ'), waardoor de cohesie de reductie verkleint. Zonder cohesie is iγ gelijk.
  it("R15: strook onder een keermuur met cohesie, excentriciteit en horizontale belasting (HTW Dresden, oefening 13)", () => {
    const r = run({ widthM: 1.5, groundNap: 1, waterNap: 0, vDKn: 170.337, hDKn: 40.877, eccBM: 61.699 / 170.337, layers: [L(1, "aanvulling", 20, 20, 30), L(0, "grond", 20, 20, 30, 12)] }), b = r.drained.bearing;
    expect(r.dims.eccBM).toBeCloseTo(0.362, 3); expect(r.dims.bEffM).toBeCloseTo(0.776, 3);
    expect(b.nq).toBeCloseTo(18.401, 3); expect(b.nc).toBeCloseTo(30.14, 2); expect(b.ngamma / 2).toBeCloseTo(10.047, 3);
    const src = chainOf(r, 40.877 / 170.337, 2);
    expect(src.iq).toBeCloseTo(0.578, 3); expect(src.igamma).toBeCloseTo(0.439, 3); expect(src.ic).toBeCloseTo(0.553, 3);
    within(src.sigma * r.dims.areaM2, 346.622, 0.1);
    // Zonder de cohesieterm in de noemer geeft de module dezelfde iγ, en een iq die 0,4 % afwijkt.
    const noC = drainedBearing({ bEffM: r.dims.bEffM, lEffM: 1, ratio: 0, vKn: 170.337, hKn: 40.877, hAlongWidth: true, phiD: 30, cD: 0, gammaD: 10, qKpa: 20, slopeDeg: 0, baseTiltDeg: 0 });
    expect(noC.igamma).toBeCloseTo(src.igamma, 9); within(noC.iq, src.iq, 0.5);
    expect(diffPct(r.drained.resistanceKn, 346.622)).toBeCloseTo(5.5, 1);
  });

  // R16, R17 en R18. A.J. Bond, B. Schuppener, G. Scarpelli en T.L.L. Orr, "Eurocode 7: Geotechnical
  // Design. Worked examples", JRC Scientific and Policy Report EUR 26227 EN (2013), bijlage A.4
  // (T-vormige keermuur), onderdeel "Bearing resistance", blz. 123-127.
  // https://eurocodes.jrc.ec.europa.eu/sites/default/files/2021-12/2013_06_WS_GEOa.pdf
  // (V14 in compute.test.ts gebruikt uit dit voorbeeld alleen de kantelmomenten.)
  // Strook B = 3,9 m, onderkant 0,8 m diep, droge grond γ = 19 kN/m³, φ'k = 32,5°, c' = 0.
  // De plaats van de resultante volgt uit de momenten om de teen: x = (Mstb − Mdst)/N, e = B/2 − x.
  // DA1-1: N = 716,9, H = 274,6 kN/m, Mstb 1068, Mdst 332,5: B' = 2,05 m; Nq = 24,6, Nγ = 30,1;
  //   iq = (1 − H/N)² = 0,38, iγ = 0,23; 142,2 + 137,6 = 279,8 kPa; 574 kN/m.
  // DA1-2 (γφ' = 1,25, φ'd = 27°): N = 557, H = 274,7, Mdst 336,4: B' = 2,63 m; Nq = 13,2, Nγ = 12,4;
  //   iq = 0,26, iγ = 0,13; 51,6 + 40,4 = 92 kPa; 242 kN/m.
  // DA2* (karakteristiek): N = 530,5, H = 202, Mstb 1055,5, Mdst 242,8: B' = 3,06 m; iq = 0,38, iγ = 0,23;
  //   143,3 + 207,8 = 351,1 kPa; 1076 kN/m.
  // Gelijk: B', Nq, Nγ, iγ en dus de gewichtsterm. Anders: iq, (1 − H/N)² tegen (1 − 0,70·H/N)³ in de module.
  // De bron rekent door met afgeronde tussenwaarden (factoren op twee decimalen): marge op de keten 0,5 %.
  const wall: Partial<SpreadInput> = { widthM: 3.9, groundNap: 0.8, layers: [L(0.8, "grond", 19, 19, 32.5)] };
  const jrc = (n: number, h: number, mStb: number, mDst: number, factors = ONE) => run({ ...wall, vDKn: n, hDKn: h, eccBM: 1.95 - (mStb - mDst) / n, factors });
  it("R16: strook onder een T-vormige keermuur, DA1-1 (EUR 26227 EN, voorbeeld A.4)", () => {
    const r = jrc(716.9, 274.6, 1068, 332.5), b = r.drained.bearing, src = chainOf(r, 274.6 / 716.9, 2);
    expect(r.dims.eccBM).toBeCloseTo(0.92, 2); expect(r.dims.bEffM).toBeCloseTo(2.05, 2);
    expect(b.nq).toBeCloseTo(24.6, 1); expect(b.ngamma).toBeCloseTo(30.1, 1);
    expect(src.iq).toBeCloseTo(0.38, 2); expect(src.igamma).toBeCloseTo(0.23, 2); expect(b.igamma).toBeCloseTo(src.igamma, 9);
    expect(b.termGamma).toBeCloseTo(137.6, 1); // gewichtsterm: gelijk
    within(src.termQ, 142.2, 0.5); within(src.sigma, 279.8, 0.5); within(src.sigma * r.dims.areaM2, 574, 0.5);
    expect(diffPct(b.termQ, 142.2)).toBeCloseTo(3.0, 1); // dekkingsterm: iq 0,392 tegen 0,381
    expect(diffPct(b.sigmaMaxKpa, 279.8)).toBeCloseTo(1.5, 1);
  });
  it("R17: dezelfde muur met γφ' = 1,25, DA1-2 (EUR 26227 EN, voorbeeld A.4)", () => {
    const r = jrc(557, 274.7, 1068, 336.4, M2), b = r.drained.bearing, src = chainOf(r, 274.7 / 557, 2);
    expect(r.drained.phiD).toBeCloseTo(27, 1); expect(r.dims.eccBM).toBeCloseTo(0.64, 2); expect(r.dims.bEffM).toBeCloseTo(2.63, 2);
    expect(b.nq).toBeCloseTo(13.2, 1); expect(b.ngamma).toBeCloseTo(12.4, 1);
    expect(src.iq).toBeCloseTo(0.26, 2); expect(src.igamma).toBeCloseTo(0.13, 2); expect(b.igamma).toBeCloseTo(src.igamma, 9);
    expect(b.termGamma).toBeCloseTo(40.4, 1);
    within(src.termQ, 51.6, 0.5); within(src.sigma, 92, 0.5); within(src.sigma * r.dims.areaM2, 242, 0.5);
    expect(diffPct(b.termQ, 51.6)).toBeCloseTo(9.2, 1); // H/N = 0,49: iq 0,281 tegen 0,257
    expect(diffPct(b.sigmaMaxKpa, 92)).toBeCloseTo(5.2, 1);
  });
  it("R18: dezelfde muur met karakteristieke belasting, DA2* (EUR 26227 EN, voorbeeld A.4)", () => {
    const r = jrc(530.5, 202, 1055.5, 242.8), b = r.drained.bearing, src = chainOf(r, 202 / 530.5, 2);
    expect(r.dims.eccBM).toBeCloseTo(0.42, 2); expect(r.dims.bEffM).toBeCloseTo(3.06, 2);
    expect(src.iq).toBeCloseTo(0.38, 2); expect(b.igamma).toBeCloseTo(src.igamma, 9);
    within(b.termGamma, 207.8, 0.5); // bron rekent met iγ = 0,23 afgerond en een iets andere B'
    within(src.termQ, 143.3, 0.5); within(src.sigma, 351.1, 0.5); within(src.sigma * r.dims.areaM2, 1076, 0.5);
    expect(diffPct(b.sigmaMaxKpa, 351.1)).toBeCloseTo(1.1, 1);
  });

  // R19 en R20. C. Sachpazis, "Strip Foundation Analysis and Design example (EN1997-1:2004)".
  // https://www.slideshare.net/slideshow/sachpazis-strip-foundation-analysis-en199712004example/30972151
  // Strook 0,8 m, onderkant 0,4 m onder maaiveld (q = 8 kPa), c'k = 17 kPa, φ'k = 25°, γ = 20 kN/m³.
  // De bron geeft het moment om de rand van de strook: e = M/F − 0,4 m.
  // Combinatie 1: F = 165,6, H = 13,5 kN/m, M = 89,2 kNm/m: e = 139 mm, b' = 523 mm; m = 1,657;
  //   iq = 0,882, iγ = 0,817, ic = 0,870; 420,0 kPa.
  // Combinatie 2 (γφ' = γc' = 1,25): F = 132,1, H = 10,0, M = 69,8: e = 129 mm, b' = 543 mm; m = 1,648;
  //   iq = 0,894, iγ = 0,835, ic = 0,875; 248,9 kPa.
  // De bron rekent de strook als een rechthoek van 1 m lengte en neemt daardoor m = (2 + b'/1)/(1 + b'/1)
  // in plaats van m = 2 voor een strook. Met m = 2 is iγ gelijk aan die van de module.
  // Het afgedrukte moment heeft vier cijfers: b' is daardoor op 0,5 mm onzeker, marge op de keten 0,2 %.
  const strip: Partial<SpreadInput> = { widthM: 0.8, groundNap: 0.4, layers: [L(0.4, "grond", 20, 20, 25, 17)] };
  const xOf = (r: SpreadOk) => r.drained.hKn / (r.drained.vKn + r.dims.areaM2 * r.drained.cD / Math.tan(rad(r.drained.phiD)));
  it("R19: strook met cohesie, excentriciteit en horizontale belasting (Sachpazis, strook, combinatie 1)", () => {
    const r = run({ ...strip, vDKn: 165.6, hDKn: 13.5, eccBM: 89.2 / 165.6 - 0.4 }), b = r.drained.bearing, m = mExp(r.dims.bEffM, 1);
    expect(r.dims.eccBM).toBeCloseTo(0.139, 3); expect(r.dims.bEffM).toBeCloseTo(0.523, 3); expect(m).toBeCloseTo(1.657, 3);
    const src = chainOf(r, xOf(r), m);
    expect(src.iq).toBeCloseTo(0.882, 3); expect(src.igamma).toBeCloseTo(0.817, 3); expect(src.ic).toBeCloseTo(0.87, 3);
    within(src.sigma, 420.0, 0.2);
    expect(b.igamma).toBeCloseTo(chainOf(r, xOf(r), 2).igamma, 9); // bijlage D met m = 2 (strook): iγ gelijk
    expect(diffPct(b.sigmaMaxKpa, 420.0)).toBeCloseTo(-3.3, 1);
  });
  it("R20: dezelfde strook met γφ' = γc' = 1,25 (Sachpazis, strook, combinatie 2)", () => {
    const r = run({ ...strip, vDKn: 132.1, hDKn: 10, eccBM: 69.8 / 132.1 - 0.4, factors: M2 }), b = r.drained.bearing, m = mExp(r.dims.bEffM, 1);
    // De bron drukt e = 129 mm én b' = 543 mm af; uit het afgedrukte moment volgt e = 128,4 mm (b' = 543,2 mm).
    expect(r.drained.cD).toBeCloseTo(13.6, 9); expect(Math.abs(r.dims.eccBM - 0.129)).toBeLessThan(0.001); expect(r.dims.bEffM).toBeCloseTo(0.543, 3); expect(m).toBeCloseTo(1.648, 3);
    const src = chainOf(r, xOf(r), m);
    expect(src.iq).toBeCloseTo(0.894, 3); expect(src.igamma).toBeCloseTo(0.835, 3); expect(src.ic).toBeCloseTo(0.875, 3);
    within(src.sigma, 248.9, 0.2);
    expect(diffPct(b.sigmaMaxKpa, 248.9)).toBeCloseTo(-3.2, 1);
    // Gevolg voor de toets: de bron voldoet (243,5 ≤ 248,9 kPa), de module net niet.
    expect(check(r, "bearing-drained").passes).toBe(false); expect(check(r, "bearing-drained").uc).toBeCloseTo(1.01, 2);
  });
});
