import { describe, expect, it } from "vitest";
import type { Cpt, MeasurementPoint } from "../types/cpt";
import { applyEdits, applyEditsDetailed, derivedRf, findOutliers, opProblems, rfIsDerived } from "./applyEdits";
import type { EditOp } from "./types";

/** Tien meetpunten op 1,0 .. 1,9 m; qc = 10 MPa, fs = 0,1 MPa, dus afgeleid Rf = 100 · 0,1 / 10 = 1 %. */
function cpt(patch: (p: MeasurementPoint, i: number) => void = () => {}): Cpt {
  const points = Array.from({ length: 10 }, (_, i) => {
    const p: MeasurementPoint = { depth: Number((1 + i / 10).toFixed(1)), depth_nap: Number((-1 - i / 10).toFixed(1)), qc: 10, fs: 0.1, rf: 1, u2: 0.02, inclination: 0.5, parameters: { source_record: i + 1 } };
    patch(p, i);
    return p;
  });
  return { id: "S01", metadata: { source_file: "S01.gef", ground_level_nap: 0 }, points };
}
const run = (c: Cpt, ...ops: EditOp[]) => applyEditsDetailed(c, ops.map((op) => ({ op })));
const depths = (c: Cpt) => c.points.map((p) => p.depth);

describe("applyEdits", () => {
  it("laat het origineel onaangeroerd en geeft zonder bewerkingen dezelfde sondering terug", () => {
    const original = cpt(), frozen = JSON.stringify(original);
    expect(applyEdits(original, [])).toBe(original);
    run(original, { kind: "remove-range", from: 1.2, to: 1.4 }, { kind: "zero-shift", channel: "qc", offset: 1 },
      { kind: "depth-shift", offset: 0.5 }, { kind: "set-value", depth: 2.0, channel: "fs", value: 0.3 },
      { kind: "invalidate-range", from: 0, to: 9, channels: [] });
    expect(JSON.stringify(original)).toBe(frozen);
  });

  it("verwijdert een traject, grenzen inbegrepen", () => {
    const { cpt: out, effects } = run(cpt(), { kind: "remove-range", from: 1.2, to: 1.4 });
    expect(depths(out)).toEqual([1.0, 1.1, 1.5, 1.6, 1.7, 1.8, 1.9]);
    expect(effects[0]).toEqual({ affected: 3, marks: [{ from: 1.2, to: 1.4 }] });
  });

  it("maakt een traject ongeldig per kanaal; de punten blijven staan", () => {
    const { cpt: out, effects } = run(cpt(), { kind: "invalidate-range", from: 1.5, to: 1.6, channels: ["u2"] });
    expect(out.points).toHaveLength(10);
    expect(out.points[5].u2).toBeUndefined();
    expect(out.points[6].u2).toBeUndefined();
    expect(out.points[5].qc).toBe(10);
    expect(out.points[4].u2).toBe(0.02);
    expect(effects[0].affected).toBe(2);
  });

  it("maakt met een lege kanaallijst alle kanalen ongeldig", () => {
    const { cpt: out } = run(cpt(), { kind: "invalidate-range", from: 1.0, to: 1.0, channels: [] });
    expect(out.points[0]).toEqual({ depth: 1.0, depth_nap: -1.0, parameters: { source_record: 1 } });
  });

  it("kapt de bovenkant en de onderkant af; het punt op de grens blijft", () => {
    expect(depths(run(cpt(), { kind: "trim-top", depth: 1.3 }).cpt)).toEqual([1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9]);
    const bottom = run(cpt(), { kind: "trim-bottom", depth: 1.3 });
    expect(depths(bottom.cpt)).toEqual([1.0, 1.1, 1.2, 1.3]);
    expect(bottom.effects[0]).toEqual({ affected: 6, marks: [{ from: 1.4, to: 1.9 }] });
  });

  it("verschuift het nulpunt van een kanaal met een constante, ook alleen in een traject", () => {
    const all = run(cpt(), { kind: "zero-shift", channel: "u2", offset: -0.005 }).cpt;
    expect(all.points.map((p) => p.u2)).toEqual(Array(10).fill(0.015));
    const part = run(cpt(), { kind: "zero-shift", channel: "inclination", offset: 0.25, from: 1.8 });
    expect(part.cpt.points.map((p) => p.inclination)).toEqual([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.75, 0.75]);
    expect(part.effects[0].affected).toBe(2);
  });

  it("leidt Rf opnieuw af na een bewerking van qc of fs als Rf in de bron ook was afgeleid", () => {
    // qc 10 -> 12,5 MPa bij fs 0,1 MPa: Rf = 100 · 0,1 / 12,5 = 0,8 %.
    const qc = run(cpt(), { kind: "zero-shift", channel: "qc", offset: 2.5 }).cpt;
    expect(qc.points[0].rf).toBeCloseTo(0.8, 12);
    // fs 0,1 -> 0,25 MPa bij qc 10 MPa op één punt: Rf = 2,5 %.
    const fs = run(cpt(), { kind: "set-value", depth: 1.4, channel: "fs", value: 0.25 }).cpt;
    expect(fs.points[4].rf).toBeCloseTo(2.5, 12);
    expect(fs.points[3].rf).toBe(1);
    // Zonder qc is er geen wrijvingsgetal meer.
    const gone = run(cpt(), { kind: "invalidate-range", from: 1.0, to: 1.0, channels: ["qc"] }).cpt;
    expect(gone.points[0].rf).toBeUndefined();
    expect(gone.points[0].fs).toBe(0.1);
  });

  it("laat een gemeten Rf met rust en een handmatig gezette Rf ook", () => {
    // Rf-kolom uit de bron, afgerond: 1,1 % in plaats van de afgeleide 1 %.
    const measured = cpt((p) => { p.rf = 1.1; });
    expect(rfIsDerived(measured.points[0])).toBe(false);
    expect(run(measured, { kind: "zero-shift", channel: "qc", offset: 10 }).cpt.points[0].rf).toBe(1.1);
    const manual = run(cpt(), { kind: "set-value", depth: 1.0, channel: "rf", value: 3 }, { kind: "zero-shift", channel: "qc", offset: 10 }).cpt;
    expect(manual.points[0].rf).toBe(3);
    expect(manual.points[1].rf).toBeCloseTo(0.5, 12);
  });

  it("herkent een afgeleid wrijvingsgetal aan Rf = 100 · fs / qc, zoals de lezers het afleiden", () => {
    expect(derivedRf({ qc: 8, fs: 0.12 })).toBeCloseTo(1.5, 12);
    expect(derivedRf({ qc: 0, fs: 0.12 })).toBeUndefined();
    expect(derivedRf({ qc: 8 })).toBeUndefined();
    expect(rfIsDerived({ depth: 1, qc: 8, fs: 0.12, rf: (100 * 0.12) / 8 })).toBe(true);
    expect(rfIsDerived({ depth: 1, qc: 8, fs: 0.12 })).toBe(true);
  });

  it("verschuift alle dieptes, ook ten opzichte van NAP", () => {
    const { cpt: out, effects } = run(cpt(), { kind: "depth-shift", offset: 0.25 });
    expect(out.points[0]).toMatchObject({ depth: 1.25, depth_nap: -1.25 });
    expect(out.points[9]).toMatchObject({ depth: 2.15, depth_nap: -2.15 });
    expect(effects[0]).toEqual({ affected: 10, marks: [] });
  });

  it("corrigeert één meetwaarde en onthoudt oud en nieuw", () => {
    const { cpt: out, effects } = run(cpt(), { kind: "set-value", depth: 1.702, channel: "qc", value: 14 });
    expect(out.points[7].qc).toBe(14);
    expect(out.points.filter((p) => p.qc !== 10)).toHaveLength(1);
    expect(effects[0]).toEqual({ affected: 1, before: 10, after: 14, marks: [{ from: 1.7, to: 1.7 }] });
    // Geen meetpunt op die diepte: niets verandert.
    expect(run(cpt(), { kind: "set-value", depth: 1.75, channel: "qc", value: 14 }).effects[0].affected).toBe(0);
    // Een waarde ongeldig maken.
    const cleared = run(cpt(), { kind: "set-value", depth: 1.7, channel: "u2", value: null });
    expect(cleared.cpt.points[7].u2).toBeUndefined();
    expect(cleared.effects[0]).toMatchObject({ before: 0.02, after: null });
  });

  it("maakt uitschieters in een traject ongeldig en laat de rest staan", () => {
    // Eén piek van 40 MPa in een reeks van 10 MPa: mediaan 10, MAD 0, dus de piek is de enige uitschieter.
    const spiky = cpt((p, i) => { if (i === 4) { p.qc = 40; p.rf = 0.25; } });
    const { cpt: out, effects } = run(spiky, { kind: "remove-outliers", from: 1.0, to: 1.9, channel: "qc", halfWindow: 3, threshold: 3 });
    expect(out.points.map((p) => p.qc)).toEqual([10, 10, 10, 10, undefined, 10, 10, 10, 10, 10]);
    expect(out.points[4].rf).toBeUndefined();
    expect(effects[0]).toEqual({ affected: 1, marks: [{ from: 1.4, to: 1.4 }] });
    // Buiten het traject wordt niets verwijderd.
    expect(run(spiky, { kind: "remove-outliers", from: 1.6, to: 1.9, channel: "qc", halfWindow: 3, threshold: 3 }).effects[0].affected).toBe(0);
  });

  it("is afhankelijk van de volgorde van de bewerkingen", () => {
    const shift: EditOp = { kind: "depth-shift", offset: 0.5 }, trim: EditOp = { kind: "trim-top", depth: 1.5 };
    // Eerst verschuiven (1,5 .. 2,4 m), dan afkappen op 1,5 m: alles blijft.
    expect(run(cpt(), shift, trim).cpt.points).toHaveLength(10);
    // Eerst afkappen op 1,5 m (vijf punten weg), dan verschuiven.
    const other = run(cpt(), trim, shift).cpt;
    expect(depths(other)).toEqual([2.0, 2.1, 2.2, 2.3, 2.4]);
  });

  it("schuift eerdere markeringen mee met een latere diepteverschuiving", () => {
    const { effects } = run(cpt(), { kind: "invalidate-range", from: 1.2, to: 1.3, channels: ["fs"] }, { kind: "depth-shift", offset: 1 });
    expect(effects[0].marks).toEqual([{ from: 2.2, to: 2.3 }]);
  });
});

describe("findOutliers", () => {
  it("volgt het Hampel-filter: afwijking groter dan drempel · 1,4826 · MAD van de mediaan van het venster", () => {
    // Venster rond de 9 (halve breedte 2): 1, 2, 9, 4, 5 -> mediaan 4; afwijkingen 3, 2, 5, 0, 1 -> MAD 2.
    // Grens bij drempel 1,5: 1,5 · 1,4826 · 2 = 4,45 < 5, dus uitschieter; bij drempel 2: 5,93 > 5, dus niet.
    const points = [1, 2, 9, 4, 5].map((qc, i) => ({ depth: i, qc }));
    expect(findOutliers(points, "qc", 2, 2, 2, 1.5)).toEqual([2]);
    expect(findOutliers(points, "qc", 2, 2, 2, 2)).toEqual([]);
  });

  it("slaat punten zonder waarde over en vraagt minstens drie waarden in het venster", () => {
    expect(findOutliers([{ depth: 0, qc: 1 }, { depth: 1, qc: 50 }], "qc", 0, 1, 2, 3)).toEqual([]);
    const gaps = [{ depth: 0, qc: 5 }, { depth: 1 }, { depth: 2, qc: 5 }, { depth: 3, qc: 30 }, { depth: 4, qc: 5 }, { depth: 5, qc: 5 }];
    expect(findOutliers(gaps, "qc", 0, 5, 2, 3)).toEqual([3]);
  });
});

describe("opProblems", () => {
  const points = cpt().points;
  it("keurt een omgekeerd traject, een verschuiving van nul en een negatieve diepte af", () => {
    expect(opProblems({ kind: "remove-range", from: 2, to: 1 }, points)).toEqual(["range"]);
    expect(opProblems({ kind: "zero-shift", channel: "qc", offset: 0 }, points)).toEqual(["noOffset"]);
    expect(opProblems({ kind: "depth-shift", offset: -1.2 }, points)).toEqual(["negativeDepth"]);
    expect(opProblems({ kind: "depth-shift", offset: -1 }, points)).toEqual([]);
    expect(opProblems({ kind: "set-value", depth: NaN, channel: "qc", value: 1 }, points)).toEqual(["number"]);
    expect(opProblems({ kind: "remove-outliers", from: 1, to: 2, channel: "qc", halfWindow: 0, threshold: 3 }, points)).toEqual(["window"]);
  });
});
