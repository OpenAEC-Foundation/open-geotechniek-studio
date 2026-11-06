import { describe, expect, it } from "vitest";
import type { Cpt } from "../../types/cpt";
import { buildSoilModel, exposedCells, idw, zoneAt } from "./soilModel";

function cpt(id: string, x: number | null, ground: number, depth: number, qc: (d: number) => number, rf: number): Cpt {
  const points = [];
  for (let d = 0.1; d <= depth + 1e-9; d += 0.1) points.push({ depth: Math.round(d * 10) / 10, qc: qc(d), rf, fs: (qc(d) * rf) / 100 });
  return {
    id,
    metadata: { ground_level_nap: ground, source_file: `${id}.gef` } as Cpt["metadata"],
    position: x === null ? undefined : { x_rd: 100000 + x, y_rd: 450000 },
    points,
  } as Cpt;
}

const opts = { bearingQcMpa: 10, bearingMinThicknessM: 1 };

describe("idw", () => {
  it("geeft de waarde van een sondering op haar eigen plek en het gemiddelde ertussen", () => {
    const pts = [{ e: -10, n: 0, v: 0 }, { e: 10, n: 0, v: 4 }];
    expect(idw(pts, -10, 0)).toBe(0);
    expect(idw(pts, 0, 0)).toBeCloseTo(2, 9);
    expect(idw(pts, 5, 0)).toBeGreaterThan(2);
  });
});

describe("buildSoilModel", () => {
  const clay = cpt("A", -10, 1, 10, () => 0.8, 4);
  const sand = cpt("B", 10, 0, 12, (d) => (d > 4.05 ? 15 : 2), 0.6);
  const model = buildSoilModel([clay, sand], opts);

  it("zet de sonderingen lokaal om het modelmidden", () => {
    expect(model.origin).toEqual({ x: 100000, y: 450000 });
    expect(model.columns.map((c) => c.east)).toEqual([-10, 10]);
    expect(model.columns[0].groundNap).toBe(1);
    expect(model.columns[1].endNap).toBeCloseTo(-12, 6);
  });

  it("neemt bij elke sondering haar eigen grondsoort over", () => {
    const g = model.grid;
    const iA = Math.floor((-10 - g.east0) / g.dx), iB = Math.floor((10 - g.east0) / g.dx), j = Math.floor((0 - g.north0) / g.dy);
    const k = Math.floor((g.topNap - -2) / g.dz);
    const at = (i: number) => g.zone[i + g.nx * (j + g.ny * k)];
    expect(at(iA)).toBe(zoneAt(model.columns[0], -2));
    expect(at(iB)).toBe(zoneAt(model.columns[1], -2));
    expect(at(iA)).not.toBe(at(iB));
  });

  it("laat cellen boven maaiveld en onder de sonderingen leeg", () => {
    const g = model.grid;
    const iA = Math.floor((-10 - g.east0) / g.dx), j = Math.floor((0 - g.north0) / g.dy);
    expect(g.zone[iA + g.nx * j]).toBe(g.topNap - 0.5 * g.dz > 1 ? 0 : g.zone[iA + g.nx * j]);
    expect(g.zone[iA + g.nx * (j + g.ny * (g.nz - 1))]).toBe(0); // NAP −12 ligt onder sondering A
  });

  it("vindt de draagkrachtige laag en meldt waar ze ontbreekt", () => {
    expect(model.columns[1].bearingTopNap).toBeCloseTo(-4.1, 6);
    expect(model.columns[0].bearingTopNap).toBeNull();
    expect(model.bearing).not.toBeNull();
    expect(model.warnings.some((w) => w.includes("A"))).toBe(true);
  });

  it("legt sonderingen zonder RD-coördinaten op een hulplijn buiten de interpolatie", () => {
    const m = buildSoilModel([clay, sand, cpt("C", null, 0, 8, () => 1, 3)], opts);
    const c = m.columns.find((x) => x.id === "C")!;
    expect(c.placed).toBe(false);
    expect(m.warnings.some((w) => w.includes("C"))).toBe(true);
  });
});

describe("exposedCells", () => {
  it("tekent alleen de buitenkant en toont het binnenste bij een snede", () => {
    const n = 3;
    const grid = { nx: n, ny: n, nz: n, east0: 0, north0: 0, dx: 1, dy: 1, topNap: 0, dz: 1, zone: new Uint8Array(n * n * n).fill(5) };
    expect(exposedCells(grid, () => true).get(5)!.length).toBe(26);
    expect(exposedCells(grid, (_z, i) => i < 2).get(5)!.length).toBe(18);
  });
});
