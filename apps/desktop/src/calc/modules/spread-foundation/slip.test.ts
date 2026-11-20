// Het bezwijkvlak in de tekening: geometrie van Prandtl, geschaald naar ze en ae uit de berekening.
import { describe, expect, it } from "vitest";
import { influenceRatios } from "./compute";
import { prandtlRatios, slipSurface } from "./slip";

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

describe("bezwijkvlak", () => {
  it("de reikwijdte van Prandtl is de invloedsbreedte uit de tabel, de diepte de invloedsdiepte", () => {
    for (const phi of [5, 10, 20, 30, 35]) {
      const nat = prandtlRatios(phi), table = influenceRatios(phi, 0);
      expect(nat.ae).toBeCloseTo(table.ae, 2);
      expect(nat.ze).toBeCloseTo(table.ze, 1);
    }
    // Bij 40° en 45° geeft de tabel een iets kleinere diepte dan het vlak van Prandtl (2,33 en 2,95 tegen 2,35 en 3,00).
    expect(prandtlRatios(45).ze).toBeCloseTo(3.0, 2);
    expect(prandtlRatios(45).ae).toBeCloseTo(11.61, 1);
    expect(prandtlRatios(0).ze).toBeCloseTo(Math.SQRT1_2, 12); expect(prandtlRatios(0).ae).toBeCloseTo(1, 12);
  });

  it("gedraineerd: wig onder 45° + φ'/2, logaritmische spiraal over 90°, passieve wig onder 45° − φ'/2", () => {
    const b = 2, phi = 30, nat = prandtlRatios(phi);
    const s = slipSurface({ bEffM: b, phiDeg: phi, zeM: nat.ze * b, aeM: nat.ae * b, oneSided: true, points: 64 });
    const [side] = s.sides, pole = { x: b / 2, z: 0 };
    expect(s.kind).toBe("logspiral"); expect(s.sides).toHaveLength(1);
    const [left, apex, right] = side.wedge;
    expect(left).toEqual({ x: -1, z: 0 }); expect(right).toEqual(pole);
    expect(apex.x).toBeCloseTo(0, 9); expect(apex.z).toBeCloseTo(Math.tan(Math.PI / 3), 9);
    const first = side.transition[0], last = side.transition[side.transition.length - 1];
    expect(dist(last, pole) / dist(first, pole)).toBeCloseTo(Math.exp((Math.PI / 2) * Math.tan(Math.PI / 6)), 9);
    expect(Math.atan2(last.z, last.x - pole.x) * 180 / Math.PI).toBeCloseTo(30, 9); // 45° − φ'/2
    expect(side.passive[1].z).toBe(0);
    expect(s.reachM).toBeCloseTo(nat.ae * b, 9);
    expect(s.maxDepthM).toBeCloseTo(nat.ze * b, 9);
    expect(Math.max(...side.transition.map((p) => p.z))).toBeCloseTo(nat.ze * b, 2);
  });

  it("ongedraineerd: een cirkelboog met straal b'/√2", () => {
    const s = slipSurface({ bEffM: 2, phiDeg: 0, zeM: Math.SQRT2, aeM: 2, oneSided: true });
    expect(s.kind).toBe("circle");
    for (const p of s.sides[0].transition) expect(dist(p, { x: 1, z: 0 })).toBeCloseTo(Math.SQRT2, 9);
    expect(s.maxDepthM).toBeCloseTo(Math.SQRT2, 9); expect(s.reachM).toBeCloseTo(2, 9);
  });

  it("schaalt naar de invloedsdiepte en -breedte uit de berekening, en beweegt mee met b' en φ'", () => {
    const s = slipSurface({ bEffM: 2.32, phiDeg: 31.2, zeM: 3.66, aeM: 9.8, oneSided: true });
    expect(s.maxDepthM).toBeCloseTo(3.66, 6); expect(s.reachM).toBeCloseTo(9.8, 6);
    expect(Math.max(...s.sides[0].transition.map((p) => p.z))).toBeCloseTo(3.66, 1);
    const inclined = slipSurface({ bEffM: 2.32, phiDeg: 31.2, zeM: 2.0, aeM: 5.0, oneSided: true });
    expect(inclined.maxDepthM).toBeLessThan(s.maxDepthM); expect(inclined.reachM).toBeLessThan(s.reachM);
    const wider = slipSurface({ bEffM: 3, phiDeg: 31.2, zeM: 3.66, aeM: 9.8, oneSided: true });
    expect(wider.sides[0].wedge[0].x).toBe(-1.5);
  });

  it("zonder horizontale belasting, excentriciteit of helling is het vlak tweezijdig en symmetrisch", () => {
    const s = slipSurface({ bEffM: 1, phiDeg: 30, zeM: 1.59, aeM: 4.29, oneSided: false });
    expect(s.sides.map((x) => x.dir)).toEqual([1, -1]);
    s.sides[0].transition.forEach((p, k) => { expect(s.sides[1].transition[k].x).toBeCloseTo(-p.x, 12); expect(s.sides[1].transition[k].z).toBe(p.z); });
  });
});
