// Het bezwijkvlak in de tekening: het glijlijnenveld van Prandtl en, bij een hellende belasting,
// de eenzijdige oplossing met een gedraaide hoofdspanning onder de voet (Sokolovskii 1960;
// Brinch Hansen 1961). De afleiding staat in VERIFICATIE.md; de getallen hier zijn met de hand na te rekenen.
import { describe, expect, it } from "vitest";
import { bearingFactors, drainedBearing, influenceRatios, undrainedBearing } from "./compute";
import { inclinedNq, loadRotation, mechanismRatios, prandtlRatios, slipSurface, type Pt } from "./slip";

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.z - b.z);
const toDeg = 180 / Math.PI, toRad = Math.PI / 180;
/** Hoek bij `at` tussen de richtingen naar `p` en `q` [°]. */
const angleAt = (at: Pt, p: Pt, q: Pt) => Math.acos(((p.x - at.x) * (q.x - at.x) + (p.z - at.z) * (q.z - at.z)) / (dist(at, p) * dist(at, q))) * toDeg;

describe("bezwijkvlak bij verticale belasting", () => {
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
    const s = slipSurface({ bEffM: b, phiDeg: phi, oneSided: true, points: 64 });
    const [side] = s.sides, pole = { x: b / 2, z: 0 };
    expect(s.kind).toBe("logspiral"); expect(s.sides).toHaveLength(1);
    expect(s.rotationDeg).toBe(0); expect(s.fanDeg).toBeCloseTo(90, 9); expect(s.wedgeAnglesDeg[0]).toBeCloseTo(60, 9); expect(s.wedgeAnglesDeg[1]).toBeCloseTo(60, 9); expect(s.passiveDeg).toBeCloseTo(30, 9);
    const [left, apex, right] = side.wedge;
    expect(left).toEqual({ x: -1, z: 0 }); expect(right).toEqual(pole);
    expect(apex.x).toBeCloseTo(0, 9); expect(apex.z).toBeCloseTo(Math.tan(Math.PI / 3), 9);
    const first = side.transition[0], last = side.transition[side.transition.length - 1];
    expect(dist(last, pole) / dist(first, pole)).toBeCloseTo(Math.exp((Math.PI / 2) * Math.tan(Math.PI / 6)), 9);
    expect(Math.atan2(last.z, last.x - pole.x) * toDeg).toBeCloseTo(30, 9); // 45° − φ'/2
    expect(side.passive[1].z).toBe(0);
    expect(s.reachM).toBeCloseTo(nat.ae * b, 9);
    expect(s.maxDepthM).toBeCloseTo(nat.ze * b, 9);
    expect(Math.max(...side.transition.map((p) => p.z))).toBeCloseTo(nat.ze * b, 2);
  });

  it("ongedraineerd: een cirkelboog met straal b'/√2", () => {
    const s = slipSurface({ bEffM: 2, phiDeg: 0, oneSided: true });
    expect(s.kind).toBe("circle");
    for (const p of s.sides[0].transition) expect(dist(p, { x: 1, z: 0 })).toBeCloseTo(Math.SQRT2, 9);
    expect(s.maxDepthM).toBeCloseTo(Math.SQRT2, 9); expect(s.reachM).toBeCloseTo(2, 9);
  });

  it("beweegt mee met b' en φ'", () => {
    const s = slipSurface({ bEffM: 2.32, phiDeg: 31.2, oneSided: true });
    expect(s.maxDepthM).toBeCloseTo(2.32 * prandtlRatios(31.2).ze, 9); expect(s.reachM).toBeCloseTo(2.32 * prandtlRatios(31.2).ae, 9);
    expect(slipSurface({ bEffM: 3, phiDeg: 31.2, oneSided: true }).sides[0].wedge[0].x).toBe(-1.5);
    expect(slipSurface({ bEffM: 2.32, phiDeg: 25, oneSided: true }).maxDepthM).toBeLessThan(s.maxDepthM);
  });

  it("zonder horizontale belasting, excentriciteit of helling is het vlak tweezijdig en symmetrisch", () => {
    const s = slipSurface({ bEffM: 1, phiDeg: 30, oneSided: false });
    expect(s.sides.map((x) => x.dir)).toEqual([1, -1]);
    s.sides[0].transition.forEach((p, k) => { expect(s.sides[1].transition[k].x).toBeCloseTo(-p.x, 12); expect(s.sides[1].transition[k].z).toBe(p.z); });
  });
});

describe("bezwijkvlak bij een hellende belasting", () => {
  // Uitgewerkt geval: φ' = 30°, Hd/Vd = 0,2, b' = 2 m.
  //   δ = arctan 0,2 = 11,310°; sin Δ = sin δ / sin φ' = 0,19612 / 0,5 → Δ = 23,094°; α = (Δ + δ)/2 = 17,202°
  //   wig: 60° − α = 42,798° en 60° + α = 77,202°; openingshoek 90° − α = 72,798°
  //   r0 = b'·sin 42,798° / cos 30° = 1,5691 m; r1 = r0·e^(1,27057·tan 30°) = 3,2675 m
  //   diepte = b'·sin 42,798°·e^(0,74697·tan 30°) = 2,0915 m; reikwijdte = 2·r1·cos 30° = 5,6596 m
  const b = 2, phi = 30, hv = 0.2;
  const s = slipSurface({ bEffM: b, phiDeg: phi, obliquity: hv, oneSided: false, points: 256 }), [side] = s.sides;

  it("de hoofdspanning draait over α = (Δ + δ)/2, met sin Δ = sin δ / sin φ'", () => {
    expect(loadRotation(30, 0.2) * toDeg).toBeCloseTo(17.202, 3);
    expect(loadRotation(30, 0)).toBe(0);
    // δ = φ': Δ = 90° en α = 45° + φ'/2; de voet schuift af en het mechanisme verdwijnt.
    expect(loadRotation(30, Math.tan(30 * toRad)) * toDeg).toBeCloseTo(60, 5);
    expect(loadRotation(30, 5) * toDeg).toBeCloseTo(60, 5);
    expect(mechanismRatios(30, 60 * toRad).ze).toBeCloseTo(0, 12); expect(mechanismRatios(30, 60 * toRad).ae).toBeCloseTo(0, 12);
    // Ongedraineerd: sin 2α = Hd / (A'·cu).
    expect(loadRotation(0, 0.5) * toDeg).toBeCloseTo(15, 9); expect(loadRotation(0, 1) * toDeg).toBeCloseTo(45, 9);
  });

  it("eenzijdig: wig met de gedraaide hoeken, spiraal over 90° − α, passieve wig aan de kant waarheen de belasting wijst", () => {
    expect(s.sides).toHaveLength(1); expect(side.dir).toBe(1);
    expect(s.rotationDeg).toBeCloseTo(17.202, 3); expect(s.fanDeg).toBeCloseTo(72.798, 3);
    expect(s.wedgeAnglesDeg[0]).toBeCloseTo(42.798, 3); expect(s.wedgeAnglesDeg[1]).toBeCloseTo(77.202, 3);
    const [far, apex, near] = side.wedge, pole = { x: b / 2, z: 0 };
    expect(far).toEqual({ x: -1, z: 0 }); expect(near).toEqual(pole);
    expect(angleAt(far, apex, near)).toBeCloseTo(42.798, 3); expect(angleAt(near, apex, far)).toBeCloseTo(77.202, 3);
    expect(angleAt(apex, far, near)).toBeCloseTo(60, 6); // 90° − φ'
    expect(apex.x).toBeGreaterThan(0); // de punt ligt aan de kant waarheen de belasting wijst
    const last = side.transition[side.transition.length - 1];
    expect(dist(apex, pole)).toBeCloseTo(1.5691, 4); expect(dist(last, pole)).toBeCloseTo(3.2675, 4);
    expect(angleAt(pole, apex, last)).toBeCloseTo(72.798, 3);
    // Logaritmische spiraal: r = r0·e^(θ·tan φ') op elk punt.
    side.transition.forEach((p, k) => expect(dist(p, pole)).toBeCloseTo(1.5691 * Math.exp((k / 256) * 72.798 * toRad * Math.tan(30 * toRad)), 3));
    expect(Math.atan2(last.z, last.x - pole.x) * toDeg).toBeCloseTo(30, 9);
    expect(side.passive[1]).toEqual({ x: 1 + s.reachM, z: 0 });
    expect(s.reachM).toBeCloseTo(5.6596, 3); expect(s.maxDepthM).toBeCloseTo(2.0915, 4);
    expect(Math.max(...side.transition.map((p) => p.z))).toBeCloseTo(2.0915, 3);
    expect(mechanismRatios(30, 17.202 * toRad).ze).toBeCloseTo(1.0458, 3); expect(mechanismRatios(30, 17.202 * toRad).ae).toBeCloseTo(2.83, 3);
  });

  it("bij H → 0 gaat het vlak vloeiend over in het vlak van Prandtl", () => {
    const zero = slipSurface({ bEffM: b, phiDeg: phi, oneSided: true, points: 64 });
    let previous = Infinity;
    for (const x of [1e-2, 1e-3, 1e-4, 1e-6]) {
      const near = slipSurface({ bEffM: b, phiDeg: phi, obliquity: x, oneSided: true, points: 64 });
      const gap = Math.max(...near.sides[0].transition.map((p, k) => dist(p, zero.sides[0].transition[k])), Math.abs(near.reachM - zero.reachM));
      expect(gap).toBeLessThan(previous); expect(gap).toBeLessThan(60 * x);
      previous = gap;
    }
  });

  it("diepte en reikwijdte nemen af met toenemende helling, gedraineerd en ongedraineerd", () => {
    for (const p of [0, 20, 30, 40]) {
      let last = slipSurface({ bEffM: 1, phiDeg: p, oneSided: true });
      const limit = p > 0 ? Math.tan(p * toRad) : 1;
      for (const f of [0.1, 0.25, 0.5, 0.75, 0.95]) {
        const next = slipSurface({ bEffM: 1, phiDeg: p, obliquity: f * limit, oneSided: true });
        expect(next.maxDepthM).toBeLessThan(last.maxDepthM); expect(next.reachM).toBeLessThan(last.reachM);
        expect(next.maxDepthM).toBeGreaterThan(0);
        last = next;
      }
    }
  });

  it("ongedraineerd: cirkelboog met straal b'·sin(45° − α) over 90° − α", () => {
    // Hd / (A'·cu) = 0,5: α = 15°; straal 2·sin 30° = 1 m; boog over 75°; reikwijdte 2·1·cos 45° = 1,4142 m; diepte 2·sin 30°·1 = 1 m.
    const u = slipSurface({ bEffM: 2, phiDeg: 0, obliquity: 0.5, oneSided: false }), pole = { x: 1, z: 0 };
    expect(u.kind).toBe("circle"); expect(u.sides).toHaveLength(1);
    for (const p of u.sides[0].transition) expect(dist(p, pole)).toBeCloseTo(1, 9);
    expect(u.fanDeg).toBeCloseTo(75, 9); expect(u.wedgeAnglesDeg[0]).toBeCloseTo(30, 9); expect(u.wedgeAnglesDeg[1]).toBeCloseTo(60, 9);
    expect(u.reachM).toBeCloseTo(Math.SQRT2, 9); expect(u.maxDepthM).toBeCloseTo(1, 9);
  });

  it("het draagvermogen van dit mechanisme sluit aan op de rekenregels", () => {
    // Verticaal: de Nq van Prandtl.
    for (const p of [20, 30, 40]) expect(inclinedNq(p, 0)).toBeCloseTo(bearingFactors(p).nq, 9);
    // φ' = 30°, tan δ = 0,2: Nq = (1 + 0,5·cos 34,404°)/(1 − 0,5) · e^((180° − 34,404°)·tan 30°) = 2,8251 · 4,3367 = 12,25.
    expect(inclinedNq(30, 0.2)).toBeCloseTo(12.25, 2);
    // De hellingfactor van de norm, iq = (1 − 0,70·H/V)³, benadert de verhouding Nq(δ)/Nq(0) van de exacte oplossing.
    for (const [p, hv2] of [[25, 0.1], [30, 0.1], [30, 0.2], [35, 0.2], [35, 0.3]]) {
      const exact = inclinedNq(p, hv2) / inclinedNq(p, 0);
      const iq = drainedBearing({ bEffM: 1, lEffM: 1, ratio: 0, vKn: 100, hKn: 100 * hv2, hAlongWidth: true, phiD: p, cD: 0, gammaD: 10, qKpa: 10, slopeDeg: 0, baseTiltDeg: 0 }).iq;
      expect(Math.abs(iq / exact - 1)).toBeLessThan(0.08);
    }
    // Ongedraineerd is de exacte oplossing Nc(α) = 1 + π − 2α + cos 2α; de normformule ic = ½·(1 + √(1 − H/(A'·cu))) volgt die binnen 3 %
    // en valt ermee samen bij H = 0 en bij H = A'·cu.
    for (const x of [0, 0.2, 0.5, 0.8, 1]) {
      const twoAlpha = 2 * loadRotation(0, x), exact = (1 + Math.PI - twoAlpha + Math.cos(twoAlpha)) / (2 + Math.PI);
      const ic = undrainedBearing({ bEffM: 1, lEffM: 1, ratio: 0, hKn: x * 50, cuD: 50, qKpa: 0, slopeDeg: 0, baseTiltDeg: 0 }).ic;
      expect(Math.abs(ic / exact - 1)).toBeLessThan(0.03);
      if (x === 0 || x === 1) expect(ic).toBeCloseTo(exact, 9);
    }
  });
});
