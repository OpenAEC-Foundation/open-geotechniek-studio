import { describe, expect, it } from "vitest";
import type { Cpt } from "../../../types/cpt";
import { buildSoilModel } from "../soilModel";
import { buildSubsurfaceIfcx } from "./ifcx";
import { emptySubsurface, parseSubsurface } from "./store";
import type { RegisGrid } from "./regis";
import { levelsFromWells, assignAquifers } from "./actions";
import type { Well } from "./groundwater";

function cpt(id: string, dx: number, qc: (d: number) => number, rf: number): Cpt {
  const points = [];
  for (let i = 1; i <= 120; i++) { const d = i / 10; points.push({ depth: d, qc: qc(d), rf, fs: (qc(d) * rf) / 100 }); }
  return { id, metadata: { ground_level_nap: 1, source_file: `${id}.gef` } as Cpt["metadata"], position: { x_rd: 126300 + dx, y_rd: 426650 }, points } as Cpt;
}

const model = buildSoilModel([cpt("S1", -10, () => 0.8, 4), cpt("S2", 10, (d) => (d > 4 ? 15 : 2), 0.6)], { bearingQcMpa: 10, bearingMinThicknessM: 1 });
const regis: RegisGrid = {
  source: "REGIS II", x0: 126200, y0: 426600, cell: 100, nx: 2, ny: 1, ground: [1, 1],
  units: [
    { name: "NUhlc", kind: "deklaag", top: [1, 1], bottom: [-8, -8], kh: [null, null], kv: [null, null] },
    { name: "NUKRz2", kind: "watervoerend", top: [-8, -8], bottom: [-30, -30], kh: [20, 20], kv: [null, null] },
  ],
};

describe("IFCX van het ondergrondmodel", () => {
  const sub = { ...emptySubsurface(), regis, groundwater: { phreaticNap: -0.6, heads: [-1.2], source: "handmatig" as const } };
  const doc = buildSubsurfaceIfcx({ model, subsurface: sub, project: { title: "Testproject", number: "P-1", author: "Tester" }, timestamp: "2026-11-07T10:00:00Z" });
  const byClass = (code: string) => doc.data.filter((e) => (e.attributes?.["bsi::ifc::class"] as { code: string } | undefined)?.code === code);

  it("volgt de opbouw van IFCX-alfa met IFC 4.3-klassen", () => {
    expect(doc.header).toMatchObject({ ifcxVersion: "ifcx_alpha", author: "Tester", timestamp: "2026-11-07T10:00:00Z" });
    expect(doc.imports.map((i) => i.uri)).toContain("https://ifcx.dev/@standards.buildingsmart.org/ifc/core/ifc@v5a.ifcx");
    expect(byClass("IfcProject")).toHaveLength(1);
    expect(byClass("IfcSite")).toHaveLength(1);
    expect(byClass("IfcGeomodel")).toHaveLength(1);
    expect(byClass("IfcBorehole").map((e) => e.attributes!["bsi::ifc::prop::name"])).toEqual(["S1", "S2"]);
    expect((byClass("IfcGeomodel")[0].attributes!["bsi::ifc::class"] as { uri: string }).uri).toContain("/ifc/4.3/class/IfcGeomodel");
  });

  it("geeft het pakket en het grondwater als strata met stijghoogte en doorlatendheid", () => {
    const strata = byClass("IfcGeotechnicalStratum");
    const water = strata.find((e) => e.attributes!["ogs::ifc4x3::predefinedType"] === "WATER")!;
    expect(water.attributes!["ogs::ifc4x3::pset::Pset_GeotechnicalStratumCommon"]).toEqual({ PiezometricHead: -0.6 });
    const pack = strata.find((e) => e.attributes!["bsi::ifc::prop::name"] === "1e watervoerend pakket")!;
    expect(pack.attributes!["ogs::ifc4x3::pset::Pset_GeotechnicalStratumCommon"]).toEqual({ PiezometricHead: -1.2 });
    expect((pack.attributes!["ogs::ifc4x3::pset::Pset_SolidStratumCapacity"] as { HydraulicConductivity: number }).HydraulicConductivity).toBeCloseTo(20 / 86400, 9);
    expect(strata.length).toBeGreaterThanOrEqual(model.zonesPresent.length + 2);
  });

  it("heeft bij elk stratum een geldige mesh in RD en NAP met een kleur", () => {
    const paths = new Set(doc.data.map((e) => e.path));
    for (const e of doc.data.filter((x) => x.attributes?.["usd::usdgeom::mesh"])) {
      const m = e.attributes!["usd::usdgeom::mesh"] as { points: number[][]; faceVertexIndices: number[] };
      expect(m.faceVertexIndices.length % 3).toBe(0);
      expect(Math.max(...m.faceVertexIndices)).toBeLessThan(m.points.length);
      for (const [x, y] of m.points.slice(0, 20)) { expect(x).toBeGreaterThan(126000); expect(y).toBeGreaterThan(426000); }
      expect(paths.has(e.inherits!.material)).toBe(true);
    }
  });

  it("is herhaalbaar: dezelfde invoer geeft hetzelfde bestand", () => {
    const again = buildSubsurfaceIfcx({ model, subsurface: sub, project: { title: "Testproject", number: "P-1", author: "Tester" }, timestamp: "2026-11-07T10:00:00Z" });
    expect(JSON.stringify(again)).toBe(JSON.stringify(doc));
  });
});

describe("ondergrond in het projectbestand en grondwater uit metingen", () => {
  it("leest een bewaard blok terug en negeert onbekende schema's", () => {
    const stored = JSON.parse(JSON.stringify({ ...emptySubsurface(), regis, groundwater: { phreaticNap: -0.5, heads: [], source: "handmatig" } }));
    expect(parseSubsurface(stored).regis?.units).toHaveLength(2);
    expect(parseSubsurface({ schema: "iets anders" }).regis).toBeNull();
  });

  it("kent filters toe aan deklaag of pakket en leidt de standen af", () => {
    const st = (m: number) => ({ n: 100, first: "2010-01-01", last: "2020-01-01", mean: m, min: m - 1, max: m + 1, lastValue: m, recentMean: m, ghg: null, glg: null, years: 0 });
    const wells: Well[] = [
      { id: "A-1", broId: "A", tube: 1, x: 126250, y: 426650, screenTop: -1, screenBottom: -2, gld: ["G1"], stats: st(-0.4), aquifer: null },
      { id: "B-1", broId: "B", tube: 1, x: 126350, y: 426650, screenTop: -15, screenBottom: -17, gld: ["G2"], stats: st(-1.1), aquifer: null },
    ];
    const placed = assignAquifers(wells, regis);
    expect(placed.map((w) => w.aquifer)).toEqual([0, 1]);
    expect(levelsFromWells(placed, 1)).toEqual({ phreaticNap: -0.4, heads: [-1.1], source: "metingen" });
  });
});
