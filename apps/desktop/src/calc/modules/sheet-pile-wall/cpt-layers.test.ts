// Omzetting van een sondering naar het grondprofiel van de damwand: tabelwaarden (NEN 9997-1 tabel 2.b, CUR 166
// tabel 3.3), de keuze van grondsoort en vastheid, en de laaggrenzen met samenvoegen en kleinste dikte.
import { describe, expect, it } from "vitest";
import type { Cpt } from "../../../types/cpt";
import { computeWall, normalizeWallInput, wallExample } from "./compute";
import { TABLE_2B, TABLE_3_3, cqc, getTableRow, khRowFor, overriddenKeys, tableRowFor, wallProfileFromCpt } from "./cpt-layers";
import { layerColor } from "./scene";

/** Sondering met punten om de 2 cm: per stuk [boven, onder, qc, Rf]. */
function cpt(parts: Array<[number, number, number, number]>, ground = 0): Cpt {
  const points: Cpt["points"] = [];
  for (const [top, bottom, qc, rf] of parts) for (let d = top; d < bottom - 1e-9; d += 0.02) points.push({ depth: Math.round(d * 100) / 100, qc, rf });
  const last = parts[parts.length - 1];
  points.push({ depth: last[1], qc: last[2], rf: last[3] });
  return { id: "S1", metadata: { source_file: "S1.gef", ground_level_nap: ground }, points };
}

describe("NEN 9997-1 tabel 2.b (linkerwaarden)", () => {
  // Bron: NEN 9997-1:2012 met C1, tabel 2.b; per regel γ, γsat, qc, φ′, c′, cu.
  const cases: Array<[string, number, number, number, number, number, number]> = [
    ["t2b-zand-schoon-los", 17, 19, 5, 30, 0, 0], ["t2b-zand-schoon-matig", 18, 20, 15, 32.5, 0, 0], ["t2b-zand-schoon-vast", 19, 21, 25, 35, 0, 0],
    ["t2b-zand-zsk", 18, 20, 12, 27, 0, 0], ["t2b-zand-ssk", 18, 20, 8, 25, 0, 0],
    ["t2b-klei-schoon-slap", 14, 14, 0.5, 17.5, 0, 25], ["t2b-klei-schoon-matig", 17, 17, 1, 17.5, 5, 50], ["t2b-klei-schoon-vast", 19, 19, 2, 17.5, 13, 100],
    ["t2b-klei-zz-slap", 15, 15, 0.7, 22.5, 0, 40], ["t2b-klei-zz-matig", 18, 18, 1.5, 22.5, 5, 80], ["t2b-klei-zz-vast", 20, 20, 2.5, 22.5, 13, 120],
    ["t2b-klei-sz", 18, 18, 1, 27.5, 0, 0], ["t2b-klei-org-slap", 13, 13, 0.2, 15, 0, 10], ["t2b-klei-org-matig", 15, 15, 0.5, 15, 0, 25],
    ["t2b-veen-nv-slap", 10, 10, 0.1, 15, 1, 10], ["t2b-veen-mv-matig", 12, 12, 0.2, 15, 2.5, 20],
    ["t2b-leem-zz-slap", 19, 19, 1, 27.5, 0, 50], ["t2b-leem-zz-matig", 20, 20, 2, 27.5, 1, 100], ["t2b-leem-zz-vast", 21, 21, 3, 27.5, 2.5, 200], ["t2b-leem-sz", 19, 19, 2, 27.5, 0, 50],
    ["t2b-grind-zs-los", 17, 19, 15, 32.5, 0, 0], ["t2b-grind-zs-matig", 18, 20, 25, 35, 0, 0], ["t2b-grind-zs-vast", 19, 21, 30, 37.5, 0, 0],
    ["t2b-grind-ss-los", 18, 20, 10, 30, 0, 0], ["t2b-grind-ss-matig", 19, 21, 15, 32.5, 0, 0], ["t2b-grind-ss-vast", 20, 22, 25, 35, 0, 0],
  ];
  it.each(cases)("%s", (id, gamma, gammaSat, qcMpa, phi, c, cu) => {
    expect(getTableRow(id)).toMatchObject({ gamma, gammaSat, qcMpa, phi, c, cu });
  });
  it("bevat precies de geteste regels; omrekening van qc alleen bij grind, zand, leem en sterk zandige klei (voetnoot g)", () => {
    expect(TABLE_2B.map((r) => r.id).sort()).toEqual(cases.map((c) => c[0]).sort());
    expect(TABLE_2B.filter((r) => r.stressCorrected).map((r) => r.main + "/" + r.mix)).not.toContain("klei/schoon");
    expect(getTableRow("t2b-klei-sz")!.stressCorrected).toBe(true);
    // Rechterwaarden van γ en γsat (alleen voor σ′v bij de omrekening van qc).
    expect(getTableRow("t2b-zand-schoon-vast")).toMatchObject({ gammaHigh: 20, gammaSatHigh: 22 });
    expect(getTableRow("t2b-veen-nv-slap")).toMatchObject({ gammaHigh: 12, gammaSatHigh: 12 });
    expect(getTableRow("t2b-grind-ss-vast")).toMatchObject({ gammaHigh: 21, gammaSatHigh: 22.5 });
    expect(getTableRow("t2b-zand-schoon-matig")).toMatchObject({ gammaHigh: 18, gammaSatHigh: 20 });
  });
});

describe("CUR 166 tabel 3.3 (laag gemiddelde)", () => {
  it.each([
    ["zand-los", 12000, undefined, undefined], ["zand-matig", 20000, undefined, undefined], ["zand-vast", 40000, undefined, undefined],
    ["klei-slap", 2000, 800, 500], ["klei-matig", 4000, 2000, 800], ["klei-vast", 6000, 4000, 2000], ["veen-slap", 1000, 500, 250], ["veen-matig", 2000, 800, 500],
  ])("%s", (id, kh1, kh2, kh3) => {
    const r = TABLE_3_3.find((x) => x.id === id)!;
    expect([r.kh1, r.kh2, r.kh3]).toEqual([kh1, kh2, kh3]);
  });
  it("regel bij een grondsoort: zand op qc, klei en veen op cu, leem geen", () => {
    expect(khRowFor(getTableRow("t2b-zand-schoon-matig")!, 17.5)!.id).toBe("zand-matig");
    expect(khRowFor(getTableRow("t2b-zand-schoon-los")!, 3)!.id).toBe("zand-los");
    expect(khRowFor(getTableRow("t2b-klei-schoon-matig")!, 1)!.id).toBe("klei-matig");
    expect(khRowFor(getTableRow("t2b-klei-schoon-vast")!, 2)!.id).toBe("klei-matig"); // cu 100 < 200
    expect(khRowFor(getTableRow("t2b-klei-org-slap")!, 0.2)!.id).toBe("klei-slap");
    expect(khRowFor(getTableRow("t2b-veen-mv-matig")!, 0.2)!.id).toBe("veen-slap"); // cu 20 < 30
    expect(khRowFor(getTableRow("t2b-leem-zz-matig")!, 2)).toBeUndefined();
  });
});

describe("grondsoort en vastheid uit zone en qc", () => {
  it("C_qc = (100/σ′v)^0,67 (voetnoot g); voorbeeld van de norm: 9 MPa bij σ′v = 50 kPa geeft circa 14,4 MPa", () => {
    expect(cqc(100)).toBeCloseTo(1, 9);
    expect(9 * cqc(50)).toBeCloseTo(14.32, 2);
  });
  it("klei op de gemeten qc, zonder omrekening", () => {
    expect(tableRowFor(3, 0.8, 2.5, 20).row.id).toBe("t2b-klei-schoon-slap");
    expect(tableRowFor(3, 1.2, 2.5, 20).row.id).toBe("t2b-klei-schoon-matig");
    expect(tableRowFor(3, 2.5, 2.5, 20)).toMatchObject({ row: { id: "t2b-klei-schoon-vast" }, qcEntryMpa: 2.5 });
    expect(tableRowFor(4, 1.6, 2, 20).row.id).toBe("t2b-klei-zz-matig");
  });
  it("zand op de omgerekende qc: dezelfde qc is bij geringe korrelspanning vaster", () => {
    expect(tableRowFor(6, 10, 0.8, 100).row.id).toBe("t2b-zand-schoon-los");
    expect(tableRowFor(6, 10, 0.8, 50).row.id).toBe("t2b-zand-schoon-matig");
    expect(tableRowFor(6, 20, 0.8, 50).row.id).toBe("t2b-zand-schoon-vast");
    expect(tableRowFor(5, 6, 1.5, 100).row.id).toBe("t2b-zand-ssk");
    expect(tableRowFor(5, 6, 1.5, 30).row.id).toBe("t2b-zand-zsk");
  });
  it("organisch: veen bij Rf ≥ 5 %, anders organische klei", () => {
    expect(tableRowFor(2, 0.3, 6, 20).row.id).toBe("t2b-veen-mv-matig");
    expect(tableRowFor(2, 0.15, 6, 20).row.id).toBe("t2b-veen-nv-slap");
    expect(tableRowFor(2, 0.3, 4, 20).row.id).toBe("t2b-klei-org-slap");
  });
});

describe("sondering naar lagen", () => {
  // Klei 0–4 m met een zandlens van 2,0–2,2 m, vastere klei 4,0–4,5 m, zand 4,5–10 m. Maaiveld NAP +1, water NAP 0.
  const s = cpt([[0, 2, 0.8, 2.5], [2, 2.2, 2.5, 0.8], [2.2, 4, 0.8, 2.5], [4, 4.5, 1.5, 2.5], [4.5, 10, 12, 0.8]], 1);
  it("grenzen, samenvoegen van gelijke lagen en de dunne lens bij de dikste buurlaag", () => {
    const { layers } = wallProfileFromCpt(s, { minThicknessM: 0.3, waterNap: 0 });
    expect(layers.map((l) => l.soilId)).toEqual(["t2b-klei-schoon-slap", "t2b-klei-schoon-matig", "t2b-zand-schoon-matig"]);
    // Grenzen halverwege twee meetpunten: 3,99 en 4,49 m onder het maaiveld op NAP +1.
    expect(layers.map((l) => l.topNap)).toEqual([1, -2.99, -3.49]);
    expect(layers[0].source).toMatchObject({ cptId: "S1", zone: 3, depthTopM: 0, depthBottomM: 3.99, rowId: "t2b-klei-schoon-slap", khRowId: "klei-slap" });
    expect(layers[0]).toMatchObject({ gamma: 14, gammaSat: 14, phi: 17.5, c: 0, cu: 25, delta: 11.7, kh: 2000, kh2: 800, kh3: 500, zone: 3 });
    // Zand 4,49–10 m: σ′v in het midden (7,245 m) = 14·1 + 4·2,99 + 7·0,5 + 10·2,755 = 57,0 kPa; 12 × (100/57,0)^0,67 = 17,49 MPa → matig.
    expect(layers[2].source).toMatchObject({ sigmaVEffKpa: 57, qcEntryMpa: 17.49, khRowId: "zand-matig" });
    expect(layers[2]).toMatchObject({ gamma: 18, gammaSat: 20, phi: 32.5, kh: 20000 });
    expect(layers[2].kh2).toBeUndefined();
  });
  it("kleinste laagdikte: de dunne vaste klei gaat op in het zand eronder", () => {
    const { layers } = wallProfileFromCpt(s, { minThicknessM: 0.6, waterNap: 0 });
    expect(layers.map((l) => l.soilId)).toEqual(["t2b-klei-schoon-slap", "t2b-zand-schoon-matig"]);
    expect(layers[1].topNap).toBe(-2.99);
    expect(layers[1].source!.zone).toBe(6);
  });
  it("zonder kleinste dikte blijft de lens een eigen laag", () => {
    const { layers } = wallProfileFromCpt(s, { minThicknessM: 0, waterNap: 0 });
    expect(layers.map((l) => l.source!.zone)).toEqual([3, 5, 3, 3, 6]);
    expect(layers[1].topNap).toBe(-0.99);
  });
  it("de lagen rekenen in de damwand", () => {
    const { layers } = wallProfileFromCpt(s, { minThicknessM: 0.3, waterNap: 0 });
    const r = computeWall({ ...wallExample(1), layersHigh: layers });
    expect(r.ok).toBe(true);
  });
  it("een veranderde waarde is eigen invoer", () => {
    const [first] = wallProfileFromCpt(s, { minThicknessM: 0.3, waterNap: 0 }).layers;
    expect(overriddenKeys(first)).toEqual([]);
    expect(overriddenKeys({ ...first, phi: 20, kh: 3000 })).toEqual(["phi", "kh"]);
  });
});

describe("handmatige lagen", () => {
  it("blijven ongewijzigd: geen herkomst, dezelfde waarden en dezelfde uitkomst", () => {
    const input = wallExample();
    const before = JSON.parse(JSON.stringify(input.layersHigh));
    expect(normalizeWallInput(input).layersHigh).toEqual(before);
    const r = computeWall(input);
    expect(r.ok && r.uls.maxMoment.value).toBeCloseTo((computeWall(JSON.parse(JSON.stringify(input))) as { uls: { maxMoment: { value: number } } }).uls.maxMoment.value, 9);
    expect(input.layersHigh).toEqual(before);
    expect(input.layersHigh.every((l) => l.source === undefined && l.zone === undefined)).toBe(true);
  });
  it("krijgen de kleur van de zone bij hun grondsoort, zoals in de sondeergrafiek", () => {
    expect(layerColor({ soilId: "sand-medium" })).toBe("#ff9800");
    expect(layerColor({ soilId: "t2b-klei-schoon-matig" })).toBe("#4caf50");
    expect(layerColor({ soilId: "peat", zone: undefined })).toBe("#795548");
  });
});
