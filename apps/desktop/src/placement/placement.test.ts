import { describe, expect, it } from "vitest";
import type { Cpt } from "../types/cpt";
import type { CalculationInstance } from "../calc/framework/types";
import { fromIfcxArray, toIfcxArray } from "../calc/framework/persistence";
import { buildSoilModel, toRd } from "../components/soil3d/soilModel";
import { buildContent } from "../components/soil3d/scene";
import { DEFAULT_SOIL3D } from "../components/soil3d/useSoil3DStore";
import { getCalcModule } from "../calc/framework/registry";
import { calcSpec } from "./calcGeometry";
import { inPit, pointInPolygon, polylineLength, rayToPolygon, rectangleCorners, signedArea, wallHatch, wallSides } from "./geometry";
import { buildPlacedScene, cellInExcavation, pits, placedItems, scenePoint, toLocal } from "./scene3d";
import { finishDrawing } from "./mapLayer";
import { placementEntities } from "./dwg";
import { placedIfcx, prismMesh } from "./ifcx";
import { hasGeometry, parsePlacement, placementKindFor, type WallPlacement } from "./types";

const calc = (over: Partial<CalculationInstance>): CalculationInstance => ({
  id: "c1", moduleId: "pile-bearing-capacity", name: "Palen A", input: {}, createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z", ...over,
});

// Bouwkuip 20 × 10 m, tegen de klok in getekend.
const PIT = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 }];

describe("opslaan en openen", () => {
  it("bewaart palen, damwand en fundering bij de berekening en leest ze ongewijzigd terug", () => {
    const list = [
      calc({ placement: { kind: "piles", positions: [{ id: "P1", x: 100010.5, y: 450002.25, cptId: "A" }, { id: "P2", label: "hoek", x: 100012, y: 450003 }] } }),
      calc({ id: "c2", moduleId: "sheet-pile-wall", placement: { kind: "wall", points: PIT, closed: true, excavation: "inside", sideCalcIds: [null, "c3", null, null] } }),
      calc({ id: "c3", moduleId: "spread-foundation", placement: { kind: "footing", x: 5, y: 6, angleDeg: 30, lengthM: 12 } }),
    ];
    const saved = JSON.parse(JSON.stringify(toIfcxArray(list)));
    expect(saved[0].placement.positions).toHaveLength(2);
    const back = fromIfcxArray(saved);
    expect(back.map((c) => c.placement)).toEqual(list.map((c) => c.placement));
  });

  it("opent een oud project zonder plaatsing: geen veld, en ook niet bij opslaan", () => {
    const old = [{ id: "u1", module_id: "pile-bearing-capacity", name: "Oud", input: { pileTopNap: 0 }, created_at: "2025-01-01T00:00:00Z", updated_at: "2025-01-01T00:00:00Z" }];
    const back = fromIfcxArray(old);
    expect(back[0].placement).toBeUndefined();
    expect("placement" in toIfcxArray(back)[0]).toBe(false);
  });

  it("laat een beschadigde plaatsing weg en houdt bruikbare punten", () => {
    expect(parsePlacement({ kind: "piles", positions: [{ x: 1, y: 2 }, { x: "a", y: 2 }, null] })).toEqual({ kind: "piles", positions: [{ id: "P1", x: 1, y: 2 }] });
    expect(parsePlacement({ kind: "onbekend" })).toBeUndefined();
    expect(parsePlacement("tekst")).toBeUndefined();
    // Een "gesloten" lijn van twee punten is een open lijn; de kant volgt de vorm.
    expect(parsePlacement({ kind: "wall", points: [{ x: 0, y: 0 }, { x: 1, y: 0 }], closed: true, excavation: "inside" })).toEqual({ kind: "wall", points: [{ x: 0, y: 0 }, { x: 1, y: 0 }], closed: false, excavation: "right" });
    expect(hasGeometry(parsePlacement({ kind: "footing", x: 1, y: 2 }))).toBe(true);
    expect(hasGeometry({ kind: "footing", x: NaN, y: 0, angleDeg: 0 })).toBe(false);
  });

  it("koppelt de modules aan de soort plaatsing", () => {
    expect(placementKindFor("tension-pile")).toBe("piles");
    expect(placementKindFor("laterally-loaded-pile")).toBe("piles");
    expect(placementKindFor("sheet-pile-wall")).toBe("wall");
    expect(placementKindFor("spread-foundation")).toBe("footing");
    expect(placementKindFor("foundation-advice")).toBeNull();
  });
});

describe("RD naar het lokale stelsel van het grondmodel", () => {
  it("zonder draaiing: verschuiving t.o.v. de oorsprong; in de scène is noord −z", () => {
    const model = { origin: { x: 100000, y: 450000 }, rotation: 0 };
    expect(toLocal(model, { x: 100012, y: 449995 })).toEqual({ x: 12, y: -5 });
    const v = scenePoint({ x: 12, y: -5 }, -3, 2);
    expect([v.x, v.y, v.z]).toEqual([12, -6, 5]);
  });

  it("met een gedraaid model (90° tegen de klok in): RD-noord wordt lokaal −oost, en terug", () => {
    const model = { origin: { x: 100000, y: 450000 }, rotation: Math.PI / 2 };
    const p = toLocal(model, { x: 100000, y: 450010 });
    expect(p.x).toBeCloseTo(10, 9);
    expect(p.y).toBeCloseTo(0, 9);
    const q = toLocal(model, { x: 100010, y: 450000 });
    expect(q.x).toBeCloseTo(0, 9);
    expect(q.y).toBeCloseTo(-10, 9);
    const rd = toRd(model, p.x, p.y);
    expect(rd.x).toBeCloseTo(100000, 9);
    expect(rd.y).toBeCloseTo(450010, 9);
  });
});

describe("bouwkuip", () => {
  it("oppervlak en omtrek van de veelhoek", () => {
    expect(signedArea(PIT)).toBe(200);
    expect(signedArea([...PIT].reverse())).toBe(-200);
    expect(polylineLength(PIT, true)).toBe(60);
    expect(polylineLength(PIT, false)).toBe(50);
  });

  it("de kant van de ontgraving wijst naar binnen, ook als de kuip met de klok mee getekend is", () => {
    for (const pts of [PIT, [...PIT].reverse()]) {
      const sides = wallSides({ points: pts, closed: true, excavation: "inside" });
      expect(sides).toHaveLength(4);
      for (const s of sides) {
        const mid = { x: (s.a.x + s.b.x) / 2 + s.low.x * 0.5, y: (s.a.y + s.b.y) / 2 + s.low.y * 0.5 };
        expect(pointInPolygon(mid, PIT)).toBe(true);
      }
      for (const s of wallSides({ points: pts, closed: true, excavation: "outside" })) {
        const mid = { x: (s.a.x + s.b.x) / 2 + s.low.x * 0.5, y: (s.a.y + s.b.y) / 2 + s.low.y * 0.5 };
        expect(pointInPolygon(mid, PIT)).toBe(false);
      }
    }
  });

  it("open lijn: links en rechts in de tekenrichting", () => {
    const line = { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], closed: false };
    expect(wallSides({ ...line, excavation: "left" })[0].low).toEqual({ x: -0, y: 1 });
    expect(wallSides({ ...line, excavation: "right" })[0].low).toEqual({ x: 0, y: -1 });
  });

  it("arcering staat aan de kerende kant: buiten een kuip met de ontgraving binnen", () => {
    const ticks = wallHatch({ points: PIT, closed: true, excavation: "inside" }, 1, 0.6);
    expect(ticks).toHaveLength(60);
    for (const [, q] of ticks) expect(pointInPolygon(q, PIT)).toBe(false);
  });

  it("cellen binnen de kuip en boven het ontgravingsniveau vallen weg, de rest blijft", () => {
    const list = [{ poly: PIT, excavationNap: -3 }];
    expect(cellInExcavation(list, 10, 5, -1)).toBe(true);
    expect(cellInExcavation(list, 10, 5, -4)).toBe(false);
    expect(cellInExcavation(list, 25, 5, -1)).toBe(false);
    expect(inPit({ closed: true, excavation: "outside" }, PIT, { x: 10, y: 5 })).toBe(false);
  });

  it("een stempel loopt tot de overkant: 10 m dwars over een kuip van 20 × 10 m", () => {
    expect(rayToPolygon({ x: 5, y: 0 }, { x: 0, y: 1 }, PIT)).toBeCloseTo(10, 9);
    expect(rayToPolygon({ x: 5, y: 0 }, { x: 0, y: -1 }, PIT)).toBeNull();
  });

  it("hoeken van een fundering van 2 × 4 m onder 90°", () => {
    const c = rectangleCorners(0, 0, 2, 4, 90).map((p) => ({ x: Math.round(p.x * 1e9) / 1e9 + 0, y: Math.round(p.y * 1e9) / 1e9 + 0 }));
    expect(c).toEqual([{ x: 1, y: -2 }, { x: 1, y: 2 }, { x: -1, y: 2 }, { x: -1, y: -2 }]);
  });

  it("tekenen op de kaart: punten worden palen, een gesloten lijn een bouwkuip", () => {
    const calcs = [calc({ placement: { kind: "piles", positions: [{ id: "P1", x: 0, y: 0 }] } }), calc({ id: "w", moduleId: "sheet-pile-wall" })];
    const piles = finishDrawing({ calcId: "c1", kind: "piles", points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] }, false, calcs);
    expect(piles).toEqual({ kind: "piles", positions: [{ id: "P1", x: 0, y: 0 }, { id: "P2", x: 1, y: 1 }, { id: "P3", x: 2, y: 2 }] });
    expect(finishDrawing({ calcId: "w", kind: "wall", points: PIT }, true, calcs)).toEqual({ kind: "wall", points: PIT, closed: true, excavation: "inside" });
    expect((finishDrawing({ calcId: "w", kind: "wall", points: PIT.slice(0, 2) }, true, calcs) as WallPlacement).closed).toBe(false);
  });
});

function cpt(id: string, dx: number, dy: number): Cpt {
  const points = [];
  for (let d = 0.1; d <= 14 + 1e-9; d += 0.1) points.push({ depth: Math.round(d * 10) / 10, qc: d > 8 ? 15 : 0.8, rf: d > 8 ? 0.6 : 4, fs: 0 });
  return { id, metadata: { ground_level_nap: 0, source_file: `${id}.gef` } as Cpt["metadata"], position: { x_rd: 100000 + dx, y_rd: 450000 + dy }, points } as Cpt;
}

describe("in het grondmodel", () => {
  const cpts = [cpt("A", 0, 0), cpt("B", 30, 0), cpt("C", 0, 30), cpt("D", 30, 30)];
  const model = buildSoilModel(cpts, { bearingQcMpa: 10, bearingMinThicknessM: 1 });
  const ctx = { cpts: new Map(cpts.map((c) => [c.id, c])), activeCptId: "A", projectMeta: {} as never };
  const pileMod = getCalcModule("pile-bearing-capacity")!, wallMod = getCalcModule("sheet-pile-wall")!, spreadMod = getCalcModule("spread-foundation")!;
  const pileInput = { ...(pileMod.defaultInput(ctx) as object), pileTopNap: -0.5, pileToeNap: -12 };
  const wallInput = wallMod.defaultInput(ctx) as { wallTopNap: number; toeNap: number; excavationNap: number };
  const rd = (x: number, y: number) => ({ x: 100000 + x, y: 450000 + y });
  const calcs = [
    calc({ id: "p", input: pileInput, placement: { kind: "piles", positions: [{ id: "P1", ...rd(5, 5) }, { id: "P2", ...rd(8, 5) }] } }),
    calc({ id: "w", moduleId: "sheet-pile-wall", name: "Kuip", input: wallInput, placement: { kind: "wall", points: [rd(10, 10), rd(20, 10), rd(20, 18), rd(10, 18)], closed: true, excavation: "inside" } }),
    calc({ id: "f", moduleId: "spread-foundation", name: "Poer", input: spreadMod.defaultInput(ctx), placement: { kind: "footing", ...rd(25, 25), angleDeg: 0 } }),
  ];

  it("leest kop, punt, wand en fundering uit de invoer van de berekening", () => {
    const p = calcSpec(calcs[0]);
    expect(p).toMatchObject({ kind: "piles", pile: { topNap: -0.5, toeNap: -12 } });
    const w = calcSpec(calcs[1]);
    expect(w?.kind).toBe("wall");
    if (w?.kind === "wall") {
      expect(w.wall.topNap).toBe(wallInput.wallTopNap);
      expect(w.wall.toeNap).toBe(wallInput.toeNap);
      expect(w.wall.excavationNap).toBeLessThanOrEqual(wallInput.excavationNap);
    }
    expect(calcSpec(calcs[2])?.kind).toBe("footing");
    expect(calcSpec(calc({ input: { pileTopNap: -1 } }))).toBeNull();
  });

  it("zet palen, wand en fundering in de scène en snijdt de kuip uit het grondmodel", () => {
    const items = placedItems(calcs, ctx as never);
    expect(items.map((i) => i.calc.id)).toEqual(["p", "w", "f"]);
    const placed = buildPlacedScene(model, items, { piles: true, walls: true, pit: true, anchors: true, footings: true }, "#000", calcs);
    const pitList = pits(model, items);
    expect(pitList).toHaveLength(1);
    const centre = toLocal(model, rd(15, 14));
    const ex = pitList[0].excavationNap;
    expect(placed.hideCell?.(centre.x, centre.y, ex + 0.1)).toBe(true);
    expect(placed.hideCell?.(centre.x, centre.y, ex - 0.1)).toBe(false);
    const outside = toLocal(model, rd(5, 5));
    expect(placed.hideCell?.(outside.x, outside.y, ex + 0.1)).toBe(false);
    const g = placed.build(2);
    const tags = new Set<string>();
    g.traverse((o) => { if (o.userData.kind === "placed") tags.add(o.userData.calcId as string); });
    expect([...tags].sort()).toEqual(["f", "p", "w"]);
    // De paal staat op zijn RD-plaats van kop tot punt (overhoogte 2).
    const shaft = g.children.find((o) => o.userData.calcId === "p")!.children[0];
    const at = toLocal(model, rd(5, 5));
    expect(shaft.position.x).toBeCloseTo(at.x, 6);
    expect(shaft.position.z).toBeCloseTo(-at.y, 6);
    expect(shaft.position.y).toBeCloseTo(((-0.5 - 12) / 2) * 2, 6);
    // Het grondmodel bouwt met de uitbreiding zonder fout op en bevat de objecten.
    const root = buildContent(model, DEFAULT_SOIL3D, [], null, "#000", null, null, placed);
    let found = false;
    root.traverse((o) => { if (o.userData.placedRoot) found = true; });
    expect(found).toBe(true);
  });

  it("gaat mee in de CAD-export en de IFCX als eenvoudige elementen", () => {
    const ents = placementEntities(calcs);
    expect(ents.filter((e) => e.layer === "PALEN" && e.type === "polyline")).toHaveLength(2);
    expect(ents.filter((e) => e.layer === "DAMWANDEN" && e.type === "polyline")[0].closed).toBe(true);
    expect(ents.filter((e) => e.layer === "DAMWANDEN_ARCERING").length).toBeGreaterThan(20);
    expect(ents.some((e) => e.layer === "FUNDERINGEN")).toBe(true);
    const els = placedIfcx(calcs, model.origin);
    expect(els.filter((e) => e.ifcClass === "IfcPile")).toHaveLength(2);
    expect(els.filter((e) => e.ifcClass === "IfcWall")).toHaveLength(4);
    expect(els.filter((e) => e.ifcClass === "IfcFooting")).toHaveLength(1);
    const pile = els.find((e) => e.ifcClass === "IfcPile")!;
    const zs = pile.mesh.points.map((p) => p[2]);
    expect(Math.min(...zs)).toBe(-12);
    expect(Math.max(...zs)).toBe(-0.5);
    expect(pile.mesh.points[0][0]).toBeCloseTo(5 + 100000 - model.origin.x + (calcSpec(calcs[0]) as { pile: { sizeM: number } }).pile.sizeM / 2, 2);
  });

  it("prisma: gesloten mesh met 2n punten en 4n − 4 driehoeken", () => {
    const m = prismMesh([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], -1, 0);
    expect(m.points).toHaveLength(8);
    expect(m.faceVertexIndices.length / 3).toBe(12);
  });
});
