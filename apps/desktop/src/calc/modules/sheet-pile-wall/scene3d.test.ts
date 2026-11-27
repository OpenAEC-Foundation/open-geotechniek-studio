// Aansluiting van de grond op de wand in de 3D-weergave: het grondvlak aan elke zijde eindigt precies op de
// buitenkant van de getekende contour, zonder spleet en zonder overlap. Narekenbaar: elk punt van de grondrand ligt
// op een rand van een plaatomtrek, en geen hoekpunt van het staal ligt aan de grondkant van die rand.
import { describe, expect, it } from "vitest";
import { findSheetPile } from "../../library/sheetPiles";
import { computeWall, wallExample, type WallInput, type WallOk } from "./compute";
import { plankPlan, profilePlan, soilOutline, wallFace, wallScene, type PlanOutline, type PlanPoint } from "./scene";

const ok = (i: WallInput): WallOk => { const r = computeWall(i); if (!r.ok) throw new Error(r.error); return r; };

/** Kortste afstand van een punt tot de randen van de omtrekken [m]. */
function distanceToOutlines(p: PlanPoint, outlines: PlanOutline[]): number {
  let best = Infinity;
  for (const o of outlines) for (let k = 0; k < o.points.length; k++) {
    const u = o.points[k], v = o.points[(k + 1) % o.points.length], da = v.a - u.a, dx = v.x - u.x, l2 = da * da + dx * dx;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.a - u.a) * da + (p.x - u.x) * dx) / l2)) : 0;
    best = Math.min(best, Math.hypot(p.a - (u.a + t * da), p.x - (u.x + t * dx)));
  }
  return best;
}

/** Waarde van de rand op plaats a; bij een sprong de buitenste van de twee. */
function faceAt(face: PlanPoint[], a: number, side: 1 | -1): number {
  let out = -Infinity;
  for (let k = 0; k + 1 < face.length; k++) {
    const p = face[k], q = face[k + 1];
    if (a < Math.min(p.a, q.a) - 1e-12 || a > Math.max(p.a, q.a) + 1e-12) continue;
    const x = q.a === p.a ? side * Math.max(side * p.x, side * q.x) : p.x + ((q.x - p.x) * (a - p.a)) / (q.a - p.a);
    out = Math.max(out, side * x);
  }
  return side * out;
}

/** Controle van één zijde: de rand ligt op het staal (geen spleet) en het staal steekt er niet doorheen (geen overlap). */
function checkSide(outlines: PlanOutline[], face: PlanPoint[], side: 1 | -1, a0: number, a1: number) {
  expect(face[0].a).toBeCloseTo(a0, 12); expect(face[face.length - 1].a).toBeCloseTo(a1, 12);
  for (let k = 0; k + 1 < face.length; k++) expect(face[k + 1].a).toBeGreaterThanOrEqual(face[k].a - 1e-12);
  // Elk punt van de rand ligt op het staal. Uitzondering: een sprong dwars op de wand (gelijke a) waar de grondrand
  // om de punt van een slothaak naar de volgende plank springt; daarvan liggen beide eindpunten op het staal en is de
  // sprong korter dan de slotbreedte (de holte onder de haak is de slotholte zelf).
  let worst = 0, jump = 0;
  for (let k = 0; k + 1 < face.length; k++) {
    const p = face[k], q = face[k + 1], vertical = Math.abs(q.a - p.a) < 1e-12;
    if (vertical) jump = Math.max(jump, Math.abs(q.x - p.x));
    for (const t of vertical ? [0, 1] : [0, 0.25, 0.5, 0.75, 1]) worst = Math.max(worst, distanceToOutlines({ a: p.a + t * (q.a - p.a), x: p.x + t * (q.x - p.x) }, outlines));
  }
  expect(worst).toBeLessThan(1e-9);
  expect(jump).toBeLessThan(0.03);
  for (const o of outlines) for (const q of o.points) if (q.a > a0 + 1e-9 && q.a < a1 - 1e-9) expect(side * q.x).toBeLessThanOrEqual(side * faceAt(face, q.a, side) + 1e-9);
}

describe("grond tegen de wand in 3D", () => {
  it("twee overlappende rechthoeken: de rand is de buitenkant, met de sprong op de overgang", () => {
    const outlines: PlanOutline[] = [
      { kind: "plate", points: [{ a: 0, x: -0.1 }, { a: 1, x: -0.1 }, { a: 1, x: 0.1 }, { a: 0, x: 0.1 }] },
      { kind: "plate", points: [{ a: 0.8, x: -0.3 }, { a: 2, x: -0.3 }, { a: 2, x: -0.05 }, { a: 0.8, x: -0.05 }] },
    ];
    expect(wallFace(outlines, -1, 0, 2)).toEqual([{ a: 0, x: -0.1 }, { a: 0.8, x: -0.1 }, { a: 0.8, x: -0.3 }, { a: 2, x: -0.3 }]);
    expect(wallFace(outlines, 1, 0, 2)).toEqual([{ a: 0, x: 0.1 }, { a: 1, x: 0.1 }, { a: 1, x: -0.05 }, { a: 2, x: -0.05 }]);
    // Een schuin stuk dat de andere omtrek snijdt: de knik ligt op het snijpunt.
    const slanted: PlanOutline[] = [{ kind: "plate", points: [{ a: 0, x: 0 }, { a: 1, x: 0 }, { a: 1, x: 0.2 }, { a: 0, x: 0 }] }, { kind: "plate", points: [{ a: 0, x: 0.1 }, { a: 1, x: 0.1 }, { a: 1, x: 0.05 }, { a: 0, x: 0.05 }] }];
    const top = wallFace(slanted, 1, 0, 1);
    expect(top.map((q) => [+q.a.toFixed(9), +q.x.toFixed(9)])).toEqual([[0, 0.1], [0.5, 0.1], [1, 0.2]]);
    expect(soilOutline(top, 3)).toEqual([{ a: 0, x: 3 }, ...top, { a: 1, x: 3 }]);
  });

  it("damwand met fabriekscontour (AZ 18-700): grond aan beide zijden precies op de golf, sloten in de contour", () => {
    const s = wallScene(wallExample(), ok(wallExample())), a0 = s.frontM, a1 = s.frontM + s.lengthM;
    expect(s.contourBasis).toBe("drawing");
    checkSide(s.outlines, s.faceHigh, -1, a0, a1);
    checkSide(s.outlines, s.faceLow, 1, a0, a1);
    // De buitenkant ligt op de halve wandhoogte (420 mm) van de as: de toppen van de golf aan beide zijden.
    expect(Math.min(...s.faceHigh.map((q) => q.x))).toBeCloseTo(-0.21, 3); expect(Math.max(...s.faceLow.map((q) => q.x))).toBeCloseTo(0.21, 3);
    // De sloten zitten in de getekende contour: geen losse slotblokjes in de scène.
    expect(s.outlines.filter((o) => o.kind === "lock")).toHaveLength(0);
  });

  it("schematisch profiel en houten planken: de grond sluit ook om de slotblokjes en de messing en groef", () => {
    const u = profilePlan(findSheetPile("JFESP-2")!, 2.4);
    expect(u.basis).not.toBe("drawing"); expect(u.outlines.filter((o) => o.kind === "lock").length).toBeGreaterThan(0);
    checkSide(u.outlines, wallFace(u.outlines, -1, 0.3, 2.2), -1, 0.3, 2.2);
    checkSide(u.outlines, wallFace(u.outlines, 1, 0.3, 2.2), 1, 0.3, 2.2);
    const planks = plankPlan(0.05, 1.2, true);
    expect(wallFace(planks, -1, 0.1, 1.1).every((q) => Math.abs(q.x + 0.025) < 1e-12)).toBe(true);
    expect(wallFace(planks, 1, 0.1, 1.1)).toEqual([{ a: 0.1, x: 0.025 }, { a: 1.1, x: 0.025 }]);
    // Palen zonder doorgaande wand: de as.
    expect(wallFace([], 1, 0, 2)).toEqual([{ a: 0, x: 0 }, { a: 2, x: 0 }]);
  });
});
