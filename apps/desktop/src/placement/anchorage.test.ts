// Ankers en stempels van een geplaatste damwand in het projectmodel: de ankerstaaf op ware lengte met de gekozen
// verankering, en een stempel tot de overkant van de bouwkuip of, zonder overkant, half en gemarkeerd.
import { describe, expect, it } from "vitest";
import type * as THREE from "three";
import type { CalculationInstance } from "../calc/framework/types";
import type { SoilModel } from "../components/soil3d/soilModel";
import { wallExample, type WallInput } from "../calc/modules/sheet-pile-wall/compute";
import { defaultAnchorage } from "../calc/modules/sheet-pile-wall/tie-anchorage";
import { calcSpec, type CalcSpec } from "./calcGeometry";
import { wallSides } from "./geometry";
import { OPEN_MARK, buildPlacedScene, strutReach, type PlacedItem } from "./scene3d";
import type { WallPlacement } from "./types";

// Bouwkuip 20 × 10 m tegen de klok in, in RD rond de oorsprong van een model zonder draaiing.
const PIT = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 }];
const model = { origin: { x: 0, y: 0 }, rotation: 0, span: 100 } as unknown as SoilModel;
const calc = (input: WallInput, placement: WallPlacement): CalculationInstance => ({ id: "w", moduleId: "sheet-pile-wall", name: "Kuip", input, placement, createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z" });
const item = (c: CalculationInstance): PlacedItem => ({ calc: c, placement: c.placement!, spec: calcSpec(c) as CalcSpec, color: "#888", status: "pending", statusText: "" });
const ex = wallExample();
const withPile: WallInput = { ...ex, anchor: { ...ex.anchor, kind: "tie", angleDeg: 0, anchorage: { ...defaultAnchorage("pile", { levelNap: -1, groundNap: 0, toeNap: -9 }), lengthM: 12 } } };
const strut: WallInput = { ...ex, anchor: { ...ex.anchor, kind: "strut" } };

describe("ankerstaaf met verankering in de plaatsing", () => {
  it("leest de lengte en de verankering uit de berekening; zonder type blijft het schematisch", () => {
    const s = calcSpec(calc(withPile, { kind: "wall", points: PIT, closed: true, excavation: "inside" }));
    expect(s?.kind).toBe("wall");
    if (s?.kind !== "wall") return;
    expect(s.wall.supports[0]).toMatchObject({ kind: "tie", lengthM: 12 });
    expect(s.wall.supports[0].tie?.type).toBe("pile"); expect(s.wall.supports[0].rodDiameterM).toBeCloseTo(0.04, 3);
    const plain = calcSpec(calc(ex, { kind: "wall", points: PIT, closed: true, excavation: "inside" }));
    if (plain?.kind === "wall") { expect(plain.wall.supports[0].tie).toBeNull(); expect(plain.wall.supports[0].lengthM).toBeNull(); }
  });

  it("tekent per anker de staaf en de paal naar de hoge zijde (buiten de kuip)", () => {
    const it0 = item(calc(withPile, { kind: "wall", points: PIT, closed: true, excavation: "inside" }));
    const g = buildPlacedScene(model, [it0], { piles: true, walls: true, pit: false, anchors: true, footings: true }, "#000").build(1);
    const piles: THREE.Object3D[] = [];
    g.traverse((o) => { if (o.userData.anchorage === "pile") piles.push(o); });
    // H.o.h. 2,8 m vanaf 1,4 m: 7 ankers op een zijde van 20 m en 4 op een zijde van 10 m, samen 22.
    expect(piles).toHaveLength(22);
    // Elke paal staat buiten de kuip: de onderste zijde (y = 0) heeft de hoge zijde op y < 0.
    for (const p of piles) { const y = -p.position.z, x = p.position.x; expect(x < 0 || x > 20 || y < 0 || y > 10).toBe(true); }
  });
});

describe("stempels", () => {
  it("in een gesloten kuip tot de overkant, één keer per paar tegenover elkaar", () => {
    const it0 = item(calc(strut, { kind: "wall", points: PIT, closed: true, excavation: "inside" })), byId = new Map([["w", it0]]);
    const sides = wallSides(it0.placement as WallPlacement);
    const p = (k: number) => ({ x: sides[k].a.x + sides[k].t.x * 5, y: sides[k].a.y + sides[k].t.y * 5 });
    expect(strutReach(it0, sides[0], p(0), -1, PIT, byId)).toEqual({ lengthM: 10, open: false });
    expect(strutReach(it0, sides[2], p(2), -1, PIT, byId)).toBeNull();
  });

  it("zonder overkant (open lijn): halve, schematische lengte met de rode markering", () => {
    const line: WallPlacement = { kind: "wall", points: [{ x: 0, y: 0 }, { x: 20, y: 0 }], closed: false, excavation: "left" };
    const it0 = item(calc(strut, line)), sides = wallSides(line);
    expect(strutReach(it0, sides[0], { x: 5, y: 0 }, -1, line.points, new Map([["w", it0]]))).toEqual({ lengthM: 0.4 * 9, open: true });
    const g = buildPlacedScene(model, [it0], { piles: true, walls: true, pit: false, anchors: true, footings: true }, "#000").build(1);
    const marks: THREE.Object3D[] = [];
    g.traverse((o) => { if (o.userData.open) marks.push(o); });
    expect(marks.length).toBeGreaterThan(0);
    expect(((marks[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).color.getHex()).toBe(OPEN_MARK);
  });
});
