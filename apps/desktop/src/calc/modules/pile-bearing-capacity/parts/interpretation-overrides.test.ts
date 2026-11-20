import { describe, expect, it } from "vitest";
import { applyOverrides, applyQcOverride, applySoilOverride, EDGE_M } from "./interpretation-overrides";
import { QcProfile } from "./qc-profile";
import { computePile } from "../compute";
import { computeCapacityMatrix } from "../capacity-table";
import { buildPileReport } from "./build-report";
import fixture from "../__fixtures__/sondering-3bm-cgeo1.json";
import type { InterpretationOverride, PileInput, SoilLayer } from "../types";
import type { Cpt } from "../../../../types/cpt";

const GROUND = -0.5;
/** 5 MPa boven NAP -8 m, 12 MPa daaronder, met een terugval naar 3 MPa tussen NAP -10 en -11 m. */
const makeCpt = (id: string): Cpt => ({
  id,
  metadata: { source_file: "test", ground_level_nap: GROUND },
  points: Array.from({ length: 251 }, (_, i) => {
    const depth = i * 0.1, level = GROUND - depth;
    return { depth, depth_nap: level, qc: level > -8 ? 5 : level < -10 && level > -11 ? 3 : 12, fs: 0.05 };
  }),
});
const cpt = makeCpt("S1");
const sand = { kind: "sand-wet", gammaK: 20, gammaW: 10, phi: 32.5 } as const;
const layers: SoilLayer[] = [
  { kind: "clay", startNap: 0, endNap: -8, gammaK: 18, gammaW: 10, phi: 22.5 },
  { ...sand, startNap: -8, endNap: -14 },
];
const input = { ...fixture.input, cptId: "S1", soilProfile: [...fixture.input.soilProfile, { ...sand, startNap: -8, endNap: -14 }] } as PileInput;
const ov = (patch: Partial<InterpretationOverride>): InterpretationOverride => ({ id: "a", cptId: "S1", topNap: -9.75, bottomNap: -11.25, ...patch });
const at = (c: Cpt, nap: number) => new QcProfile(c).at(GROUND - nap);

describe("applyOverrides — conusweerstand", () => {
  it("lege lijst of ontbrekend veld geeft dezelfde sondering en lagen terug", () => {
    for (const list of [undefined, []]) {
      const r = applyOverrides(cpt, layers, list);
      expect(r.cpt).toBe(cpt);
      expect(r.layers).toBe(layers);
      expect(r.applied).toEqual([]);
    }
  });

  it("vervangt qc door een rechte lijn tussen de waarden aan boven- en onderrand", () => {
    // Randen liggen op een flank van de meting: de randwaarden zijn de gemeten waarden daar.
    const dipCpt: Cpt = { ...cpt, points: cpt.points.map((p) => ({ ...p, qc: p.depth >= 9.5 && p.depth <= 10.5 ? 2 : 10 + p.depth })) };
    const r = applyOverrides(dipCpt, layers, [ov({ topNap: -9.75, bottomNap: -11.25, qc: { mode: "interpolate" } })]);
    const top = 10 + 9.25, bottom = 10 + 10.75;
    expect(at(r.cpt!, -9.75)).toBeCloseTo(top, 9);
    expect(at(r.cpt!, -11.25)).toBeCloseTo(bottom, 9);
    expect(at(r.cpt!, -10.5)).toBeCloseTo((top + bottom) / 2, 9);
    // Buiten het traject blijft de meting staan.
    expect(at(r.cpt!, -9.6)).toBeCloseTo(at(dipCpt, -9.6), 9);
    expect(at(r.cpt!, -11.4)).toBeCloseTo(at(dipCpt, -11.4), 9);
    expect(r.applied[0]).toMatchObject({ status: "applied", topNap: -9.75, bottomNap: -11.25 });
    expect(r.applied[0].qc!.measuredMinMpa).toBe(2);
    expect(r.applied[0].qc!.topMpa).toBeCloseTo(top, 9);
    expect(r.applied[0].qc!.bottomMpa).toBeCloseTo(bottom, 9);
  });

  it("haalt een terugval eruit: het gemiddelde over het traject stijgt naar de randwaarde", () => {
    const r = applyOverrides(cpt, layers, [ov({ qc: { mode: "interpolate" } })]);
    const profile = new QcProfile(r.cpt!);
    expect(profile.average(GROUND + 9.75, GROUND + 11.25)).toBeCloseTo(12, 9);
    expect(r.applied[0].qc).toMatchObject({ measuredMinMpa: 3, measuredMaxMpa: 12, topMpa: 12, bottomMpa: 12 });
    expect(r.applied[0].qc!.measuredMeanMpa).toBeGreaterThan(3);
    expect(r.applied[0].qc!.measuredMeanMpa).toBeLessThan(12);
  });

  it("zet een vaste waarde met scherpe randen, zonder de meting ernaast te wijzigen", () => {
    const r = applyOverrides(cpt, layers, [ov({ qc: { mode: "fixed", valueMpa: 8 } })]);
    expect(at(r.cpt!, -9.75 - 2 * EDGE_M)).toBe(8);
    expect(at(r.cpt!, -10.5)).toBe(8);
    expect(at(r.cpt!, -11.25 + 2 * EDGE_M)).toBe(8);
    expect(at(r.cpt!, -9.75)).toBeCloseTo(12, 9);
    expect(at(r.cpt!, -9.7)).toBeCloseTo(12, 9);
    expect(at(r.cpt!, -11.3)).toBeCloseTo(12, 9);
    expect(new QcProfile(r.cpt!).average(GROUND + 9.75, GROUND + 11.25)).toBeCloseTo(8, 2);
    // Diepten blijven strikt oplopend.
    expect(r.cpt!.points.every((p, i, all) => i === 0 || p.depth > all[i - 1].depth)).toBe(true);
  });

  it("laat de bron ongewijzigd", () => {
    const before = JSON.stringify(cpt), layersBefore = JSON.stringify(layers);
    applyOverrides(cpt, layers, [ov({ qc: { mode: "fixed", valueMpa: 8 }, soilKind: "peat" })]);
    expect(JSON.stringify(cpt)).toBe(before);
    expect(JSON.stringify(layers)).toBe(layersBefore);
  });

  it("bij overlap wint de latere aanpassing", () => {
    const r = applyOverrides(cpt, layers, [
      ov({ id: "a", topNap: -9, bottomNap: -11, qc: { mode: "fixed", valueMpa: 8 } }),
      ov({ id: "b", topNap: -10, bottomNap: -12, qc: { mode: "fixed", valueMpa: 20 } }),
    ]);
    expect(at(r.cpt!, -9.5)).toBe(8);
    expect(at(r.cpt!, -10.5)).toBe(20);
    expect(at(r.cpt!, -11.5)).toBe(20);
    expect(at(r.cpt!, -12.5)).toBeCloseTo(12, 9);
    expect(r.applied.map((a) => a.status)).toEqual(["applied", "applied"]);
  });

  it("begrenst een traject op het bereik van de sondering", () => {
    const r = applyOverrides(cpt, layers, [ov({ topNap: 5, bottomNap: -2, qc: { mode: "fixed", valueMpa: 1 } })]);
    expect(r.applied[0]).toMatchObject({ status: "applied", topNap: GROUND, bottomNap: -2 });
    expect(at(r.cpt!, GROUND)).toBe(1);
    expect(at(r.cpt!, -1)).toBe(1);
    expect(at(r.cpt!, -2.1)).toBeCloseTo(5, 9);
  });

  it("slaat een traject buiten de sondering over", () => {
    for (const range of [{ topNap: 5, bottomNap: 2 }, { topNap: -40, bottomNap: -45 }]) {
      const r = applyOverrides(cpt, layers, [ov({ ...range, qc: { mode: "fixed", valueMpa: 1 }, soilKind: "peat" })]);
      expect(r.applied[0].status).toBe("outsideRange");
      expect(r.cpt).toBe(cpt);
      expect(r.layers).toBe(layers);
    }
  });

  it("weigert een ongeldig traject, een ongeldige waarde en een aanpassing zonder wijziging", () => {
    const bad = [
      ov({ topNap: Number.NaN, qc: { mode: "interpolate" } }),
      ov({ topNap: -10, bottomNap: -10, qc: { mode: "interpolate" } }),
      ov({ qc: { mode: "fixed", valueMpa: -1 } }),
      ov({ qc: { mode: "fixed", valueMpa: Number.NaN } }),
      ov({ comment: "alleen een opmerking" }),
    ];
    const r = applyOverrides(cpt, layers, bad);
    expect(r.applied.map((a) => a.status)).toEqual(bad.map(() => "invalid"));
    expect(r.cpt).toBe(cpt);
  });

  it("neemt alleen de aanpassingen van deze sondering", () => {
    const r = applyOverrides(cpt, layers, [ov({ cptId: "S2", qc: { mode: "fixed", valueMpa: 1 } })]);
    expect(r.cpt).toBe(cpt);
    expect(r.applied).toEqual([]);
  });

  it("werkt op de losse puntenreeks", () => {
    const points = applyQcOverride(cpt.points, 9.25, 10.75, { mode: "fixed", valueMpa: 7 });
    expect(points.length).toBeGreaterThan(cpt.points.length);
    expect(points.find((p) => Math.abs(p.depth - 10) < 1e-9)!.qc).toBe(7);
  });
});

describe("applyOverrides — grondsoort", () => {
  it("splitst een laag in drie delen bij een traject binnen de laag", () => {
    const out = applySoilOverride(layers, -10, -11, "clay");
    expect(out.map((l) => [l.kind, l.startNap, l.endNap])).toEqual([
      ["clay", 0, -8], ["sand-wet", -8, -10], ["clay", -10, -11], ["sand-wet", -11, -14],
    ]);
    // De nieuwe laag krijgt de standaardwaarden van zijn grondsoort; de rest houdt zijn eigen waarden.
    expect(out[2]).toMatchObject({ gammaK: 18, gammaW: 10, phi: 22.5 });
    expect(out[3]).toMatchObject({ gammaK: 20, gammaW: 10, phi: 32.5 });
  });

  it("verlegt een laaggrens bij een traject dat aan de grens begint", () => {
    const out = applySoilOverride(layers, -8, -9, "clay");
    expect(out.map((l) => [l.kind, l.startNap, l.endNap])).toEqual([
      ["clay", 0, -8], ["clay", -8, -9], ["sand-wet", -9, -14],
    ]);
  });

  it("vervangt alles binnen een traject over meer lagen door één laag", () => {
    const out = applySoilOverride(layers, -6, -10, "peat");
    expect(out.map((l) => [l.kind, l.startNap, l.endNap])).toEqual([
      ["clay", 0, -6], ["peat", -6, -10], ["sand-wet", -10, -14],
    ]);
  });

  it("voegt een laag toe onder het profiel", () => {
    const out = applySoilOverride(layers, -14, -18, "sand-wet");
    expect(out[out.length - 1]).toMatchObject({ kind: "sand-wet", startNap: -14, endNap: -18 });
    expect(out).toHaveLength(3);
  });

  it("houdt het profiel geldig: van boven naar beneden zonder overlap", () => {
    const r = applyOverrides(cpt, layers, [
      ov({ id: "a", topNap: -5, bottomNap: -9, soilKind: "peat" }),
      ov({ id: "b", topNap: -8.5, bottomNap: -12, soilKind: "sand-wet" }),
    ]);
    expect(r.layers.map((l) => [l.kind, l.startNap, l.endNap])).toEqual([
      ["clay", 0, -5], ["peat", -5, -8.5], ["sand-wet", -8.5, -12], ["sand-wet", -12, -14],
    ]);
    expect(r.applied[0].soil).toEqual({ before: ["clay", "sand-wet"], after: "peat" });
    expect(r.applied[1].soil).toEqual({ before: ["peat", "sand-wet"], after: "sand-wet" });
    expect(r.cpt).toBe(cpt);
  });
});

describe("computePile met aanpassingen", () => {
  const base = computePile(input, cpt);
  const dip: InterpretationOverride = ov({ topNap: -9.9, bottomNap: -11.1, qc: { mode: "interpolate" }, comment: "lokale terugval" });

  it("rekent zonder veld en met een lege lijst identiek", () => {
    expect(base.ok).toBe(true);
    expect(base.interpretation).toBeUndefined();
    expect(computePile({ ...input, interpretationOverrides: [] }, cpt)).toEqual(base);
  });

  it("rekent met de aangepaste conusweerstand en meldt de aanpassing", () => {
    const adjusted = computePile({ ...input, interpretationOverrides: [dip] }, cpt);
    expect(adjusted.ok).toBe(true);
    expect(adjusted.shaft.rsCalMax).toBeGreaterThan(base.shaft.rsCalMax);
    expect(adjusted.interpretation).toHaveLength(1);
    expect(adjusted.interpretation![0].status).toBe("applied");
    expect(adjusted.warnings.length).toBe(base.warnings.length + 1);
    // Gelijk aan rekenen met een sondering waarin de terugval al ontbreekt.
    const clean: Cpt = { ...cpt, points: cpt.points.map((p) => ({ ...p, qc: GROUND - p.depth > -8 ? 5 : 12 })) };
    const reference = computePile(input, clean);
    expect(adjusted.shaft.rsCalMax).toBeCloseTo(reference.shaft.rsCalMax, 6);
    expect(adjusted.base.rbCalMax).toBeCloseTo(reference.base.rbCalMax, 6);
  });

  it("rekent met de gewijzigde grondsoort", () => {
    const peat = computePile({ ...input, interpretationOverrides: [ov({ topNap: -9, bottomNap: -12, soilKind: "peat" })] }, cpt);
    expect(peat.ok).toBe(true);
    expect(peat.shaft.perLayer.some((l) => l.layer.kind === "peat")).toBe(true);
    expect(peat.shaft.rsCalMax).not.toBeCloseTo(base.shaft.rsCalMax, 3);
  });

  it("meldt een aanpassing die niet is toegepast", () => {
    const r = computePile({ ...input, interpretationOverrides: [ov({ topNap: -50, bottomNap: -55, qc: { mode: "interpolate" } })] }, cpt);
    expect(r.summary.rcNetD).toBe(base.summary.rcNetD);
    expect(r.interpretation![0].status).toBe("outsideRange");
    expect(r.warnings.length).toBe(base.warnings.length + 1);
  });

  it("zet de aanpassingen met traject en toelichting in de uitdraai, en alleen als ze er zijn", () => {
    const meta = { title: "Test", project_number: "1", author: "Test", date: "2026-11-20" } as never;
    const ctx = { cpts: new Map([[cpt.id, cpt]]), activeCptId: cpt.id, projectMeta: meta };
    const text = (i: PileInput) => new TextDecoder("latin1").decode(buildPileReport(i, computePile(i, cpt), ctx));
    const adjusted = text({ ...input, interpretationOverrides: [{ ...dip, soilKind: "clay" }] });
    expect(adjusted).toContain("Aanpassingen aan de grondlaaginterpretatie");
    expect(adjusted).toContain("lokale terugval");
    expect(adjusted).toContain("-9,90 / -11,10");
    expect(text(input)).not.toContain("Aanpassingen aan de grondlaaginterpretatie");
  });

  it("geldt in de tabel alleen voor de eigen sondering", () => {
    const other = makeCpt("S2");
    const cpts = new Map([[cpt.id, cpt], [other.id, other]]);
    const config = { cptIds: ["S1", "S2"], toeNaps: [input.pileToeNap] };
    const plain = computeCapacityMatrix(input, cpts, config);
    const withDip = computeCapacityMatrix({ ...input, interpretationOverrides: [dip] }, cpts, config);
    const rc = (m: typeof plain, i: number) => m.cpts[i].cells[0][0].result.summary.rcNetD;
    expect(rc(withDip, 0)).toBeGreaterThan(rc(plain, 0));
    expect(rc(withDip, 1)).toBe(rc(plain, 1));
    expect(withDip.cpts[1].cells[0][0].result.interpretation).toBeUndefined();
  });
});
