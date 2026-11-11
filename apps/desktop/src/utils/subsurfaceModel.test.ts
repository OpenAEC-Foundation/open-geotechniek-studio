import { describe, expect, it } from "vitest";
import type { Cpt } from "../types/cpt";
import { buildSubsurfaceModel } from "./subsurfaceModel";

/** Synthetische sondering: klei (qc 1, Rf 2) boven, zand (qc 15, Rf 0.4) onder. */
function cpt(id: string, x: number, y: number, surface: number, interface_: number): Cpt {
  const points = [];
  for (let d = 0; d <= 10 + 1e-9; d += 0.1) {
    const sand = d >= interface_;
    points.push({ depth: d, qc: sand ? 15 : 1, rf: sand ? 0.4 : 2 });
  }
  return {
    id,
    metadata: { source_file: `${id}.gef` },
    position: { x_rd: x, y_rd: y, z_nap: surface },
    points,
  };
}

describe("buildSubsurfaceModel", () => {
  const a = cpt("A", 100000, 400000, 1, 4);
  const b = cpt("B", 100020, 400000, 0, 6);
  const model = buildSubsurfaceModel([a, b], { cellSize: 1, layerThickness: 0.5, marginM: 2 });

  it("zet laagindeling om naar NAP", () => {
    const ma = model.cpts.find((c) => c.id === "A")!;
    expect(ma.surface).toBe(1);
    expect(ma.layers[0].top).toBeCloseTo(1);
    expect(ma.layers[ma.layers.length - 1].bottom).toBeCloseTo(-9, 1);
    expect(model.zones).toEqual(expect.arrayContaining([3, 7]));
  });

  it("neemt bij een sondering de eigen laagopbouw over", () => {
    const g = model.grid!;
    const zoneAt = (x: number, z: number) => {
      const ix = Math.floor((x - g.x0) / g.dx);
      const iy = Math.floor((400000 - g.y0) / g.dx);
      const iz = Math.floor((g.zTop - z) / g.dz);
      return g.cells[ix + g.nx * (iy + g.ny * iz)];
    };
    // Bij A: klei tot -3 m NAP, daarna zand.
    expect(zoneAt(100000.2, -1.2)).toBe(3);
    expect(zoneAt(100000.2, -4.2)).toBe(7);
    // Bij B: klei tot -6 m NAP.
    expect(zoneAt(100019.8, -4.2)).toBe(3);
    expect(zoneAt(100019.8, -7.2)).toBe(7);
    // Boven het maaiveld blijft het raster leeg.
    expect(zoneAt(100019.8, 0.8)).toBe(0);
  });

  it("slaat sonderingen zonder positie over", () => {
    const noPos = { ...cpt("C", 0, 0, 0, 3), position: undefined };
    const m = buildSubsurfaceModel([a, noPos]);
    expect(m.skipped).toEqual(["C"]);
    expect(m.cpts).toHaveLength(1);
    expect(m.grid).not.toBeNull();
  });

  it("geeft geen raster zonder bruikbare sonderingen", () => {
    expect(buildSubsurfaceModel([]).grid).toBeNull();
  });
});
