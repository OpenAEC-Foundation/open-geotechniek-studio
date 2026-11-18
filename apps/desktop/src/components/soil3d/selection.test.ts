import { describe, expect, it } from "vitest";
import type { Cpt } from "../../types/cpt";
import { buildSoilModel } from "./soilModel";
import { describeSelection, selectionBox } from "./selection";

function cpt(id: string, dx: number, qc: (d: number) => number, rf: number): Cpt {
  const points = [];
  for (let i = 1; i <= 100; i++) { const d = i / 10; points.push({ depth: d, qc: qc(d), rf, fs: (qc(d) * rf) / 100 }); }
  return { id, metadata: { ground_level_nap: 1, source_file: `${id}.gef` } as Cpt["metadata"], position: { x_rd: 126300 + dx, y_rd: 426650 }, points } as Cpt;
}
const model = buildSoilModel([cpt("S1", -10, () => 0.8, 4), cpt("S2", 10, () => 15, 0.6)], { bearingQcMpa: 10, bearingMinThicknessM: 1 });

describe("selectie in 3D", () => {
  it("toont bij een modelcel welke sonderingen meetellen, samen 100 %", () => {
    const g = model.grid;
    const cell = model.grid.zone.findIndex((z) => z !== 0);
    const groups = describeSelection({ kind: "cell", cell, point: { east: 0, north: 0, nap: g.topNap - 1 } }, model, null);
    const shares = groups[1].rows.map(([, v]) => Number(/(\d+)%/.exec(v)![1]));
    expect(groups[0].subtitle).toContain("grondmodel");
    expect(shares.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(99);
    expect(shares.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(101);
    expect(groups[1].rows[0][0]).toMatch(/^S[12] · /);
  });

  it("geeft bij een sondering de laag en qc op het aangeklikte niveau en een kader om de kolom", () => {
    const groups = describeSelection({ kind: "cpt", cptId: "S2", point: { east: 10, north: 0, nap: -3 } }, model, null);
    expect(groups[0].title).toBe("Sondering S2");
    expect(groups[1].rows.find(([k]) => k === "qc")![1]).toBe("15,00 MPa");
    const box = selectionBox({ kind: "cpt", cptId: "S2", point: { east: 10, north: 0, nap: -3 } }, model, null, 2)!;
    expect(box.min.y).toBeCloseTo(-9 * 2, 6);
    expect(box.max.y).toBeCloseTo(1 * 2, 6);
  });
});
