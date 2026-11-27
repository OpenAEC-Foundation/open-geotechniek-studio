// De methode van Blum tegen handberekeningen en tegen een onafhankelijke liggerberekening; zie VERIFICATIE.md.
import { describe, expect, it } from "vitest";
import { solveBeam } from "../laterally-loaded-pile/beam";
import { blum } from "./blum";

/** Homogene, droge, niet-cohesieve grond: actief vanaf de kop, passief vanaf de ontgraving. */
const homogeneous = (ka: number, kp: number, gamma: number, h: number, q = 0) => (z: number) => ka * (q + gamma * z) - (z > h ? kp * gamma * (z - h) : 0);

describe("Blum", () => {
  it("onverankerd: voetpunt, belastingnulpunt, toeslag en grootste moment volgens de gesloten formules", () => {
    const ka = 1 / 3, kp = 3, gamma = 18, h = 3, r = blum(homogeneous(ka, kp, gamma, h), h, null, 15, 0.002).cantilever!;
    // Moment om het voetpunt: Ka·(h + d)³ = Kp·d³, dus d = h / ((Kp/Ka)^(1/3) − 1) = 2,7776 m.
    const d = h / (Math.cbrt(kp / ka) - 1), u = (h * ka) / (kp - ka);
    expect(d).toBeCloseTo(2.7776, 4); expect(u).toBeCloseTo(0.375, 12);
    expect(r.theoreticalToeM).toBeCloseTo(h + d, 3); expect(r.zeroLoadM).toBeCloseTo(h + u, 3);
    expect(r.requiredToeM).toBeCloseTo(h + u + 1.2 * (d - u), 3);
    // Dwarskracht nul op Ka·(h + x)² = Kp·x², x = 1,5 m: M = γ·(Ka·4,5³ − Kp·1,5³)/6 = 60,75 kNm/m.
    expect(r.maxMomentKnM).toBeCloseTo(60.75, 2); expect(r.maxMomentAtM).toBeCloseTo(4.5, 2);
    // Vervangende kracht in het voetpunt: het overschot aan passieve gronddruk.
    expect(r.toeForceKn).toBeCloseTo(0.5 * gamma * (kp * d ** 2 - ka * (h + d) ** 2), 1);
    expect(r.anchorKn).toBe(0);
  });

  it("verankerd, vrij opgelegde voet: momentenevenwicht om het anker en horizontaal evenwicht", () => {
    const ka = 1 / 3, kp = 3, gamma = 18, h = 6, a = 1, r = blum(homogeneous(ka, kp, gamma, h), h, a, 20, 0.002).free!;
    // Onafhankelijk: nulpunt van Ea·(2(h + d)/3 − a) − Ep·(h + 2d/3 − a) met bisectie.
    const residual = (d: number) => 0.5 * ka * gamma * (h + d) ** 2 * ((2 * (h + d)) / 3 - a) - 0.5 * kp * gamma * d ** 2 * (h + (2 * d) / 3 - a);
    let lo = 0.1, hi = 6;
    for (let k = 0; k < 80; k++) { const mid = (lo + hi) / 2; if (residual(mid) > 0) lo = mid; else hi = mid; }
    const d = (lo + hi) / 2, anchor = 0.5 * gamma * (ka * (h + d) ** 2 - kp * d ** 2);
    expect(r.theoreticalToeM).toBeCloseTo(h + d, 3); expect(r.requiredToeM).toBe(r.theoreticalToeM);
    expect(r.anchorKn).toBeCloseTo(anchor, 1); expect(r.toeForceKn).toBe(0);
    // Dwarskracht nul onder het anker: ½·Ka·γ·z² = A; moment daar: A·(z − a) − Ka·γ·z³/6.
    const z = Math.sqrt((2 * anchor) / (ka * gamma));
    expect(r.maxMomentAtM).toBeCloseTo(z, 2); expect(r.maxMomentKnM).toBeCloseTo(anchor * (z - a) - (ka * gamma * z ** 3) / 6, 1);
  });

  it("verankerd, ingeklemde voet: een ligger die in het voetpunt is ingeklemd geeft dezelfde ankerkracht en daar geen moment", () => {
    const ka = 1 / 3, kp = 3, gamma = 18, h = 6, a = 1, net = homogeneous(ka, kp, gamma, h, 10), r = blum(net, h, a, 20, 0.002);
    const fixed = r.fixed!, free = r.free!, toe = fixed.theoreticalToeM;
    expect(toe).toBeGreaterThan(free.theoreticalToeM); expect(fixed.anchorKn).toBeLessThan(free.anchorKn); expect(fixed.maxMomentKnM).toBeLessThan(free.maxMomentKnM);
    expect(fixed.requiredToeM).toBeCloseTo(fixed.zeroLoadM + 1.2 * (toe - fixed.zeroLoadM), 9);
    // Liggeroplosser: 180 gelijke elementen met de belasting in het midden en een stijve veer bij het anker. De ligger is zo stijf
    // gekozen dat de veer over één elementlengte de hoekverdraaiing niet merkbaar tegenhoudt.
    const count = 180, l = toe / count, band = Math.round(a / l);
    const beam = solveBeam({ lengthM: toe, eiKnM2: 5e7, maxElementM: toe, headForceKn: 0, headMomentKnM: 0, headFixedRotation: false, toeFixed: true,
      layers: Array.from({ length: count }, (_, k) => ({ topM: k * l, bottomM: (k + 1) * l, lineLoadKnM: net((k + 0.5) * l), lineSpringKnM2: k === band ? 1e9 : 0 })) });
    expect(-beam.elements[band].soilReactionKn).toBeGreaterThan(0);
    expect(Math.abs(-beam.elements[band].soilReactionKn / fixed.anchorKn - 1)).toBeLessThan(0.02);
    expect(Math.abs(beam.toeMomentKnM)).toBeLessThan(0.02 * fixed.maxMomentKnM);
    expect(Math.abs(Math.abs(beam.toeReactionKn) / fixed.toeForceKn - 1)).toBeLessThan(0.02);
  });

  it("gepubliceerd collegevoorbeeld, vrije opleg: 10 m kerende hoogte, anker op 3 m, q = 10 kPa, φ = 35°, γ = 18 kN/m³ (Rankine)", () => {
    // Uitkomsten in de publicatie: D = 2,80 m, A = 172 kN/m, dwarskracht nul op 7,88 m, Mmax = 359,24 kNm/m,
    // gerekend met de afgeronde Ka = 0,27 en Kp = 3,69.
    const r = blum(homogeneous(0.27, 3.69, 18, 10, 10), 10, 3, 30, 0.002).free!;
    expect(Math.abs((r.theoreticalToeM - 10) / 2.8 - 1)).toBeLessThan(0.02);
    expect(Math.abs(r.anchorKn / 172 - 1)).toBeLessThan(0.02);
    expect(Math.abs(r.maxMomentAtM - 7.88)).toBeLessThan(0.05);
    expect(Math.abs(r.maxMomentKnM / 359.24 - 1)).toBeLessThan(0.02);
  });

  it("zonder voldoende passieve weerstand binnen het rekenbereik is er geen uitkomst", () => {
    expect(blum(homogeneous(0.4, 0.5, 18, 3), 3, null, 12).cantilever).toBeNull();
    expect(blum(homogeneous(0.4, 0.5, 18, 3), 3, 1, 12).free).toBeNull();
  });
});
