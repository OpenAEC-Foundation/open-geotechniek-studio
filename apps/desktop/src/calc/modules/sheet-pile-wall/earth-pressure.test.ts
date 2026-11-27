// Gronddrukcoëfficiënten tegen de gesloten formules; de getallen staan uitgeschreven in VERIFICATIE.md.
import { describe, expect, it } from "vitest";
import { coefficients, k0Jaky, kCurved, kaStraight, kpStraight } from "./earth-pressure";

const rad = (d: number) => (d * Math.PI) / 180;

describe("gronddrukcoëfficiënten", () => {
  it("zonder wandwrijving zijn recht en gekromd glijvlak gelijk aan Rankine", () => {
    for (const phi of [20, 25, 30, 35, 40]) {
      const ka = Math.tan(rad(45 - phi / 2)) ** 2, kp = Math.tan(rad(45 + phi / 2)) ** 2;
      expect(kaStraight(phi, 0)).toBeCloseTo(ka, 12); expect(kpStraight(phi, 0)).toBeCloseTo(kp, 10);
      expect(kCurved(phi, 0, false).kn).toBeCloseTo(ka, 10); expect(kCurved(phi, 0, true).kn).toBeCloseTo(kp, 10);
    }
    expect(kaStraight(30, 0)).toBeCloseTo(1 / 3, 12); expect(kpStraight(30, 0)).toBeCloseTo(3, 10); expect(k0Jaky(30)).toBeCloseTo(0.5, 12);
  });

  it("Coulomb met wandwrijving: horizontale component van de tabelwaarde (φ = 30°, δ = 20°)", () => {
    // Coulomb: Ka = 0,2973 en Kp = 6,105 langs de richting van de resultante; horizontaal maal cos δ.
    expect(kaStraight(30, 20)).toBeCloseTo(0.2973 * Math.cos(rad(20)), 3);
    expect(kpStraight(30, 20)).toBeCloseTo(6.105 * Math.cos(rad(20)), 2);
  });

  it("gekromd glijvlak: met de hand ingevulde formule van bijlage C.2", () => {
    // φ = 30°, δ = 20°: 2m_w = arccos(sin 20 / sin 30) − 50° = −3,16°; v = 30° + 1,58° = 0,5512 rad;
    // Kp = (1 + 0,5·sin 26,84°) / (1 − 0,5) · e^(2·0,5512·tan 30°) = 2,4515 · 1,8899 = 4,633.
    expect(kCurved(30, 20, true).kn).toBeCloseTo(4.633, 3);
    // δ = φ = 30°: m_w = −30°, v = 60°: Kp = (1 − 0,25) / 0,5 · e^(2·1,0472·0,5774) = 1,5 · 3,351 = 5,026.
    expect(kCurved(30, 30, true).kn).toBeCloseTo(5.026, 3);
    // De cohesieterm volgt uit Kc = (Kp − 1)·cot φ; zonder wandwrijving is dat 2·√Kp.
    expect(kCurved(30, 0, true).kc).toBeCloseTo(2 * Math.sqrt(3), 10);
  });

  it("gekromd geeft bij grote wandwrijving een lagere passieve coëfficiënt dan recht, en groeit met δ", () => {
    for (const phi of [25, 30, 35, 40]) {
      const delta = (2 * phi) / 3;
      expect(kCurved(phi, delta, true).kn).toBeLessThan(kpStraight(phi, delta));
      expect(kCurved(phi, delta, true).kn).toBeGreaterThan(kCurved(phi, delta / 2, true).kn);
      // Actief ligt het gekromde glijvlak binnen enkele procenten van Coulomb.
      expect(Math.abs(kCurved(phi, delta, false).kn / kaStraight(phi, delta) - 1)).toBeLessThan(0.05);
    }
  });

  it("keuze van het glijvlak: recht tot δ = φ′/3, daarboven gekromd", () => {
    expect(coefficients(30, 10, "auto").passive).toBe("straight"); expect(coefficients(30, 10, "auto").kp).toBeCloseTo(kpStraight(30, 10), 12);
    expect(coefficients(30, 10.1, "auto").passive).toBe("curved"); expect(coefficients(30, 20, "auto").kp).toBeCloseTo(kCurved(30, 20, true).kn, 12);
    expect(coefficients(30, 20, "straight").kp).toBeCloseTo(kpStraight(30, 20), 12); expect(coefficients(30, 5, "curved").passive).toBe("curved");
    // De wandwrijving wordt begrensd op φ′; actief altijd met het rechte glijvlak.
    expect(coefficients(30, 45, "auto").kp).toBeCloseTo(kCurved(30, 30, true).kn, 12); expect(coefficients(30, 20, "curved").ka).toBeCloseTo(kaStraight(30, 20), 12);
    expect(coefficients(30, 20, "auto").kac).toBeCloseTo(2 * Math.sqrt(kaStraight(30, 20)), 12);
  });
});
