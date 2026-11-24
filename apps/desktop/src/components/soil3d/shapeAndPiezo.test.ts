import { describe, expect, it } from "vitest";
import { buildSoilModel, convexHull, fitRotation, fromRd, medianSpacing, rdExtent, toRd } from "./soilModel";
import { piezoLayout } from "./scene";
import { describePiezo, selectionBox } from "./selection";
import { monthlyMeans, type Well } from "./subsurface/groundwater";
import { emptySubsurface, type SubsurfaceData } from "./subsurface/store";
import type { RegisGrid } from "./subsurface/regis";
import type { Cpt } from "../../types/cpt";

const cpt = (id: string, x: number, y: number): Cpt => ({
  id, metadata: { source_file: id, ground_level_nap: 0 }, position: { x_rd: x, y_rd: y },
  points: Array.from({ length: 150 }, (_, i) => { const d = Math.round((i + 1)) / 10, qc = d < 8 ? 0.8 : 15, rf = d < 8 ? 4 : 0.6; return { depth: d, qc, rf, fs: (qc * rf) / 100 }; }),
} as Cpt);
/** Raster van 3 × 3 sonderingen met 20 m tussenafstand, gedraaid over `deg` graden rond (155000, 463000). */
const grid = (deg: number) => {
  const a = (deg * Math.PI) / 180, out: Cpt[] = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const u = (i - 1) * 20, v = (j - 1) * 20;
    out.push(cpt(`S${i}${j}`, 155000 + u * Math.cos(a) - v * Math.sin(a), 463000 + u * Math.sin(a) + v * Math.cos(a)));
  }
  return out;
};
const opts = { bearingQcMpa: 10, bearingMinThicknessM: 1 };

describe("modelvorm volgt de sonderingen", () => {
  it("draait mee met een raster onder 45° en houdt de RD-posities exact", () => {
    const m = buildSoilModel(grid(45), opts);
    expect(Math.abs(m.rotation)).toBeCloseTo(Math.PI / 4, 6);
    // het raster ligt nu langs de modelassen: alle sonderingen op −20, 0 of 20
    for (const c of m.columns) for (const v of [c.east, c.north]) expect(Math.min(...[-20, 0, 20].map((k) => Math.abs(v - k)))).toBeLessThan(1e-6);
    for (const c of m.columns) {
      const src = grid(45).find((x) => x.id === c.id)!.position!;
      const p = toRd(m, c.east, c.north);
      expect(p.x).toBeCloseTo(src.x_rd, 6);
      expect(p.y).toBeCloseTo(src.y_rd, 6);
    }
    // de modelrechthoek is veel kleiner dan het rechte kader eromheen
    const recht = buildSoilModel(grid(45), { ...opts, fitShape: false });
    expect(recht.rotation).toBe(0);
    const area = (x: typeof m) => x.grid.nx * x.grid.dx * x.grid.ny * x.grid.dy;
    expect(area(m)).toBeLessThan(area(recht) * 0.7);
  });

  it("laat een regelmatig raster langs RD een recht, gevuld blok", () => {
    const m = buildSoilModel(grid(0), opts);
    expect(m.rotation).toBe(0);
    // driekwart van de tussenafstand van 20 m: de cellen tussen de sonderingen blijven gevuld
    expect(m.reach).toBe(15);
    expect(m.ground.values.every(Number.isFinite)).toBe(true);
  });

  it("laat een opstelling in een L-vorm de lege hoek leeg", () => {
    const l = [[0, 0], [20, 0], [40, 0], [0, 20], [0, 40]].map(([x, y], i) => cpt(`L${i}`, 155000 + x, 463000 + y));
    const m = buildSoilModel(l, opts), g = m.grid;
    const cellAt = (east: number, north: number) => Math.floor((east - g.east0) / g.dx) + g.nx * Math.floor((north - g.north0) / g.dy);
    const filled = (c: number) => Array.from({ length: g.nz }, (_, k) => g.zone[c + g.nx * g.ny * k]).some((z) => z > 0);
    // lokale coördinaten van de hoek bij (40, 40) en van een sondering
    const corner = fromRd(m, 155040, 463040), arm = fromRd(m, 155020, 463000);
    expect(filled(cellAt(corner.east, corner.north))).toBe(false);
    expect(Number.isNaN(m.ground.values[cellAt(corner.east, corner.north)])).toBe(true);
    expect(filled(cellAt(arm.east, arm.north))).toBe(true);
    // zonder vormaanpassing blijft het hele blok gevuld
    const blok = buildSoilModel(l, { ...opts, fitShape: false });
    expect(blok.reach).toBeNull();
    expect(blok.ground.values.every(Number.isFinite)).toBe(true);
  });

  it("rekent RD heen en terug en geeft het omsluitende kader van een gedraaide rechthoek", () => {
    const frame = { origin: { x: 1000, y: 2000 }, rotation: 0.4 };
    const p = toRd(frame, 12, -7), q = fromRd(frame, p.x, p.y);
    expect(q.east).toBeCloseTo(12, 9);
    expect(q.north).toBeCloseTo(-7, 9);
    const e = rdExtent({ origin: { x: 0, y: 0 }, rotation: Math.PI / 4 }, -1, 1, -1, 1);
    expect(e.xmax).toBeCloseTo(Math.SQRT2, 9);
    expect(e.ymin).toBeCloseTo(-Math.SQRT2, 9);
  });

  it("vindt de omhullende, de draaiing van een lijn en de gangbare tussenafstand", () => {
    expect(convexHull([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: 0.5, y: 0.5 }])).toHaveLength(4);
    expect(fitRotation([{ x: 0, y: 0 }, { x: 100, y: 100 * Math.tan(0.3) }])).toBeCloseTo(0.3, 6);
    expect(fitRotation([{ x: 0, y: 0 }])).toBe(0);
    expect(medianSpacing([{ east: 0, north: 0 }, { east: 10, north: 0 }, { east: 30, north: 0 }])).toBe(10);
  });
});

const regis: RegisGrid = {
  source: "REGIS II", ground: Array(16).fill(0),
  x0: 154800, y0: 462800, cell: 100, nx: 4, ny: 4,
  units: [
    { name: "Holoceen", kind: "deklaag", top: Array(16).fill(0), bottom: Array(16).fill(-4), kh: Array(16).fill(0.1), kv: Array(16).fill(0.01) },
    { name: "Boxtel zand", kind: "watervoerend", top: Array(16).fill(-4), bottom: Array(16).fill(-20), kh: Array(16).fill(10), kv: Array(16).fill(1) },
    { name: "Waalre klei", kind: "scheidend", top: Array(16).fill(-20), bottom: Array(16).fill(-26), kh: Array(16).fill(0.01), kv: Array(16).fill(0.001) },
    { name: "Peize zand", kind: "watervoerend", top: Array(16).fill(-26), bottom: Array(16).fill(-60), kh: Array(16).fill(20), kv: Array(16).fill(2) },
  ],
};
const well = (id: string, aquifer: number, monthly?: [string, number][]): Well => ({
  id, broId: id, tube: 1, x: 155050, y: 463020, screenTop: -8, screenBottom: -9, gld: ["GLD1"], aquifer,
  stats: { n: 24, first: "2020-01-01", last: "2021-12-01", mean: -1.2, min: -1.6, max: -0.8, lastValue: -1.1, recentMean: -1.2, ghg: null, glg: null, years: 1 },
  monthly,
});
const sub = (patch: Partial<SubsurfaceData> = {}): SubsurfaceData => ({
  ...emptySubsurface(), regis, ...patch,
  groundwater: { phreaticNap: -0.6, heads: [-1.25, -1.3], source: "metingen", ...(patch.groundwater ?? {}) },
});

describe("peilbuizen per pakket naast het model", () => {
  const model = buildSoilModel(grid(45), opts);

  it("zet elke vastgelegde stand in een eigen buis, naast elkaar en trapsgewijs lager", () => {
    const row = piezoLayout(model, sub(), 2)!;
    expect(row.tubes.map((t) => t.index)).toEqual([0, 1, 2]);
    const g = model.grid;
    for (const t of row.tubes) expect(t.east).toBeGreaterThan(g.east0 + g.nx * g.dx);
    const easts = row.tubes.map((t) => t.east);
    expect(new Set(easts).size).toBe(3);
    expect(row.tubes[0].top).toBeGreaterThan(row.tubes[1].top);
    expect(row.tubes[1].top).toBeGreaterThan(row.tubes[2].top);
    // het filter staat in het eigen pakket
    expect(row.tubes[1].filterTop).toBeLessThanOrEqual(-4);
    expect(row.tubes[1].filterBottom).toBeGreaterThanOrEqual(-20);
    expect(row.tubes[2].filterTop).toBeLessThanOrEqual(-26);
    expect(row.tubes[2]).toMatchObject({ packTop: -26, packBottom: -60 });
    expect(row.tubes[0].filterTop).toBeLessThan(-0.6);
    expect(row.bottom).toBe(Math.min(...row.tubes.map((t) => t.filterBottom)));
  });

  it("laat pakketten zonder stand weg en tekent niets zonder standen", () => {
    expect(piezoLayout(model, sub({ groundwater: { phreaticNap: null, heads: [null, -1.3], source: "handmatig" } }), 2)!.tubes.map((t) => t.index)).toEqual([2]);
    expect(piezoLayout(model, sub({ groundwater: { phreaticNap: null, heads: [], source: null } }), 2)).toBeNull();
    expect(piezoLayout(model, null, 2)).toBeNull();
  });

  it("geeft bij aanklikken het verloop van de peilbuizen in dat pakket", () => {
    const monthly: [string, number][] = [["2020-01", -1.1], ["2020-02", -1.4], ["2020-03", -1.0]];
    const data = sub({ wells: [well("A-1", 1, monthly), well("B-1", 1), well("C-1", 2, monthly)] });
    const [main, history, ...perWell] = describePiezo(1, model, data);
    expect(main.rows.find(([k]) => k === "Stand")?.[1]).toBe("NAP -1,25 m");
    expect(main.rows.find(([k]) => k.startsWith("Pakket"))?.[1]).toBe("NAP -4,00 tot -20,00 m");
    expect(history.chart?.series.map((s) => s.id)).toEqual(["A-1"]);
    expect(history.chart?.series[0].points).toHaveLength(3);
    expect(history.chart?.head).toBe(-1.25);
    expect(perWell.map((g) => g.title)).toEqual(["A-1", "B-1"]);
    expect(perWell[0].color).toBe(history.chart?.series[0].color);
    expect(perWell[1].color).toBeUndefined();
    expect(history.rows.find(([k]) => k === "Variatie")?.[1]).toBe("0,80 m");
    expect(history.note).toMatch(/opnieuw op/);
    expect(selectionBox({ kind: "piezo", index: 1, point: { east: 0, north: 0, nap: 0 } }, model, data, 2)).not.toBeNull();
    // pakket zonder meetreeks
    expect(describePiezo(0, model, sub({ wells: [] }))[1].note).toMatch(/Geen peilbuis/);
  });

  it("vat een meetreeks samen als maandgemiddelden", () => {
    const t = (s: string) => new Date(s);
    expect(monthlyMeans([{ t: t("2021-03-01T00:00:00Z"), v: -1 }, { t: t("2021-03-20T00:00:00Z"), v: -2 }, { t: t("2021-04-02T00:00:00Z"), v: -0.5 }]))
      .toEqual([["2021-03", -1.5], ["2021-04", -0.5]]);
  });
});
