// IJking en meetreeks van een gedigitaliseerde sondering, met gevallen die met de hand na te rekenen zijn.
import { describe, expect, it } from "vitest";
import { calibrationGrid, calibrationProblem, niceStep, solveCalibration, toPixel, toValues, type Calibration, type Px } from "./calibration";
import { buildPoints, gridDepths, normalizeReadings, readingsFromPixels, valueAt } from "./series";
import { buildDigitizedCpt, DIGITIZED_KEY, digitizedImageOf, digitizedLabel, digitizedNote, digitizedOf, digitizedReportGroup, recordProblems, type DigitizedRecord } from "./record";
import { calibrationOf, emptyHeader, emptyWork, fromRecord, num, previewLine, toRecord } from "./work";
import { buildTestReport } from "../utils/cptTestReport";
import { at, sampleRecord, STRAIGHT } from "./__fixtures__/sample";

const rotate = (p: Px, degrees: number, about: Px = { x: 300, y: 500 }): Px => {
  const r = (degrees * Math.PI) / 180, dx = p.x - about.x, dy = p.y - about.y;
  return { x: about.x + dx * Math.cos(r) - dy * Math.sin(r), y: about.y + dx * Math.sin(r) + dy * Math.cos(r) };
};
const mapCalibration = (c: Calibration, f: (p: Px) => Px): Calibration => ({
  depth: { ...c.depth, a: f(c.depth.a), b: f(c.depth.b) }, value: { ...c.value, a: f(c.value.a), b: f(c.value.b) },
});

describe("ijking", () => {
  it("rekent een rechte scan om: 20 px per MPa en 50 px per meter", () => {
    const m = solveCalibration(STRAIGHT)!;
    // x = 300 ligt 200 px rechts van de as: 200 / 20 = 10 MPa. y = 550 ligt 500 px onder 0 m: 500 / 50 = 10 m.
    expect(toValues(m, { x: 300, y: 550 }).value).toBeCloseTo(10, 9);
    expect(toValues(m, { x: 300, y: 550 }).depth).toBeCloseTo(10, 9);
    expect(toValues(m, { x: 140, y: 75 })).toEqual({ value: expect.closeTo(2, 9), depth: expect.closeTo(0.5, 9) });
  });

  it("geeft bij een scheve scan (3 graden gedraaid) dezelfde waarden", () => {
    const turn = (p: Px) => rotate(p, 3);
    const m = solveCalibration(mapCalibration(STRAIGHT, turn))!;
    for (const [qc, depth] of [[0, 0], [10, 10], [3.4, 17.26], [25, 1.5]]) {
      const r = toValues(m, turn(at(qc, depth)));
      expect(r.value).toBeCloseTo(qc, 8);
      expect(r.depth).toBeCloseTo(depth, 8);
    }
    // Zonder rekening te houden met de draaiing zou het punt (10 MPa, 10 m) ruim 0,5 m en 1 MPa verschuiven.
    const naive = toValues(solveCalibration(STRAIGHT)!, turn(at(25, 1.5)));
    expect(Math.abs(naive.depth - 1.5)).toBeGreaterThan(0.3);
  });

  it("klopt ook als de assen niet haaks staan en de ijkpunten elders op de as liggen", () => {
    // Scheefgetrokken blad: x' = x + 0,1·y. De ijkpunten liggen op 2 en 18 m en op 5 en 15 MPa.
    const shear = (p: Px) => ({ x: p.x + 0.1 * p.y, y: p.y });
    const c: Calibration = {
      depth: { a: shear(at(0, 2)), b: shear(at(0, 18)), va: 2, vb: 18 },
      value: { a: shear(at(5, 0)), b: shear(at(15, 0)), va: 5, vb: 15 },
    };
    const r = toValues(solveCalibration(c)!, shear(at(7.5, 12.34)));
    expect(r.value).toBeCloseTo(7.5, 8);
    expect(r.depth).toBeCloseTo(12.34, 8);
  });

  it("rekent een diepte-as in m NAP en een as die van rechts naar links loopt", () => {
    // Maaiveld op NAP +1,20 m: y = 50 is NAP +1,20 en y = 1050 is NAP -18,80. De qc-as is gespiegeld.
    const c: Calibration = {
      depth: { a: { x: 100, y: 50 }, b: { x: 100, y: 1050 }, va: 1.2, vb: -18.8 },
      value: { a: { x: 500, y: 50 }, b: { x: 100, y: 50 }, va: 0, vb: 20 },
    };
    const r = toValues(solveCalibration(c)!, { x: 400, y: 550 });
    expect(r.depth).toBeCloseTo(-8.8, 9);
    expect(r.value).toBeCloseTo(5, 9);
  });

  it("gaat van waarde en diepte terug naar hetzelfde pixel", () => {
    const m = solveCalibration(mapCalibration(STRAIGHT, (p) => rotate(p, -4)))!;
    const p = toPixel(m, 12.5, 7.25), back = toValues(m, p);
    expect(back.value).toBeCloseTo(12.5, 9);
    expect(back.depth).toBeCloseTo(7.25, 9);
  });

  it("meldt wat er aan de ijking ontbreekt", () => {
    expect(calibrationProblem(STRAIGHT)).toBeNull();
    expect(calibrationProblem({ ...STRAIGHT, depth: { ...STRAIGHT.depth, b: STRAIGHT.depth.a } })).toBe("depthPoints");
    expect(calibrationProblem({ ...STRAIGHT, value: { ...STRAIGHT.value, b: { x: NaN, y: NaN } } })).toBe("valuePoints");
    expect(calibrationProblem({ ...STRAIGHT, depth: { ...STRAIGHT.depth, vb: 0 } })).toBe("depthValues");
    expect(calibrationProblem({ ...STRAIGHT, value: { ...STRAIGHT.value, vb: NaN } })).toBe("valueValues");
    // Beide assen langs dezelfde lijn: geen afbeelding mogelijk.
    expect(calibrationProblem({ ...STRAIGHT, value: { ...STRAIGHT.value, a: { x: 100, y: 60 }, b: { x: 103, y: 900 } } })).toBe("parallel");
    expect(solveCalibration({ ...STRAIGHT, depth: { ...STRAIGHT.depth, vb: 0 } })).toBeNull();
  });

  it("tekent rasterlijnen op ronde waarden, met het getal op de as", () => {
    expect(niceStep(21, 24)).toBe(1);
    expect(niceStep(30, 24)).toBe(2);
    expect(niceStep(0.9, 24)).toBe(0.05);
    const grid = calibrationGrid(solveCalibration(STRAIGHT)!, STRAIGHT, 600, 1100);
    // Het blad loopt van -1 tot 21 m: lijnen op elke meter.
    const ten = grid.depth.find((l) => l.label === "10")!;
    expect(ten.from.y).toBeCloseTo(550, 6);
    expect(ten.to.y).toBeCloseTo(550, 6);
    expect(ten.at.x).toBeCloseTo(100, 6);
    // Het blad loopt van -5 tot 25 MPa: lijnen om de 2 MPa, het getal op de qc-as (y = 50).
    const qc10 = grid.value.find((l) => l.label === "10")!;
    expect(qc10.from.x).toBeCloseTo(300, 6);
    expect(qc10.at.y).toBeCloseTo(50, 6);
  });
});

describe("meetreeks", () => {
  const m = solveCalibration(STRAIGHT)!;

  it("interpoleert lineair naar de stap", () => {
    // Twee punten: 2 MPa op 1,00 m en 6 MPa op 1,10 m. Op een stap van 0,02 m stijgt qc 0,8 MPa per stap.
    const { readings } = normalizeReadings(readingsFromPixels([at(2, 1), at(6, 1.1)], m, "depth", 0));
    const points = buildPoints({ qc: readings, step: 0.02, interpolation: "linear", groundLevelNap: 0.5 });
    expect(points.map((p) => p.depth)).toEqual([1, 1.02, 1.04, 1.06, 1.08, 1.1]);
    expect(points.map((p) => p.qc)).toEqual([2, 2.8, 3.6, 4.4, 5.2, 6]);
    expect(points.map((p) => p.depth_nap)).toEqual([-0.5, -0.52, -0.54, -0.56, -0.58, -0.6]);
    expect(points.every((p) => p.fs === undefined && p.rf === undefined)).toBe(true);
  });

  it("begint en eindigt op veelvouden van de stap binnen het bereik van de punten", () => {
    const { readings } = normalizeReadings([{ depth: 0.33, value: 1 }, { depth: 1.07, value: 2 }]);
    expect(gridDepths(readings, 0.2)).toEqual([0.4, 0.6, 0.8, 1]);
    expect(gridDepths(readings, 1)).toEqual([1]);
    expect(gridDepths(readings.slice(0, 1), 0.2)).toEqual([]);
  });

  it("houdt bij trapsgewijs elke aflezing vast tot de volgende", () => {
    // Mechanische sondering, afgelezen per 0,2 m: 4, 9 en 5 MPa.
    const readings = [{ depth: 1, value: 4 }, { depth: 1.2, value: 9 }, { depth: 1.4, value: 5 }];
    const stepwise = buildPoints({ qc: readings, step: 0.1, interpolation: "step", groundLevelNap: 0 });
    expect(stepwise.map((p) => [p.depth, p.qc])).toEqual([[1, 4], [1.1, 4], [1.2, 9], [1.3, 9], [1.4, 5]]);
    const linear = buildPoints({ qc: readings, step: 0.1, interpolation: "linear", groundLevelNap: 0 });
    expect(linear.map((p) => p.qc)).toEqual([4, 6.5, 9, 7, 5]);
    // Op de stap van de aflezingen zelf geven beide keuzes de aflezingen terug.
    expect(buildPoints({ qc: readings, step: 0.2, interpolation: "step", groundLevelNap: 0 }).map((p) => p.qc)).toEqual([4, 9, 5]);
    expect(valueAt(readings, 0.9, "step")).toBeUndefined();
    expect(valueAt(readings, 1.5, "linear")).toBeUndefined();
  });

  it("sorteert op diepte en laat bij dezelfde diepte het laatst aangeklikte punt tellen", () => {
    const n = normalizeReadings([{ depth: 2, value: 5 }, { depth: 1, value: 3 }, { depth: 2.0004, value: 7 }, { depth: 3, value: -0.4 }]);
    expect(n.reordered).toBe(true);
    expect(n.duplicates).toBe(1);
    // Een negatieve aflezing wordt nul.
    expect(n.readings).toEqual([{ depth: 1, value: 3 }, { depth: 2, value: 7 }, { depth: 3, value: 0 }]);
    expect(normalizeReadings([{ depth: 1, value: 3 }, { depth: 2, value: 5 }])).toMatchObject({ reordered: false, duplicates: 0 });
  });

  it("geeft bij een as in m NAP dezelfde reeks als bij diepte onder maaiveld", () => {
    // Maaiveld NAP +1,20 m; dezelfde pixels, de as nu in NAP (y = 50 is +1,20 en y = 1050 is -18,80).
    const nap = solveCalibration({ ...STRAIGHT, depth: { ...STRAIGHT.depth, va: 1.2, vb: -18.8 } })!;
    const pixels = [at(2, 1), at(8, 3), at(4, 5.5)];
    const below = normalizeReadings(readingsFromPixels(pixels, m, "depth", 1.2)).readings;
    const fromNap = normalizeReadings(readingsFromPixels(pixels, nap, "nap", 1.2)).readings;
    expect(fromNap).toEqual(below);
    expect(below[1]).toEqual({ depth: 3, value: 8 });
    const points = buildPoints({ qc: fromNap, step: 0.5, interpolation: "linear", groundLevelNap: 1.2 });
    // 3,00 m onder maaiveld is NAP 1,20 - 3,00 = -1,80 m.
    expect(points.find((p) => p.depth === 3)).toMatchObject({ depth_nap: -1.8, qc: 8 });
  });

  it("neemt fs of Rf mee waar de tweede reeks loopt en leidt de andere af", () => {
    const qc = [{ depth: 1, value: 10 }, { depth: 2, value: 20 }];
    // fs 0,1 MPa bij qc 10 MPa: Rf = 100 · 0,1 / 10 = 1 %. De fs-reeks loopt maar tot 1,5 m.
    const withFs = buildPoints({ qc, second: { kind: "fs", readings: [{ depth: 1, value: 0.1 }, { depth: 1.5, value: 0.3 }] }, step: 0.5, interpolation: "linear", groundLevelNap: 0 });
    expect(withFs).toMatchObject([{ depth: 1, qc: 10, fs: 0.1, rf: 1 }, { depth: 1.5, qc: 15, fs: 0.3, rf: 2 }, { depth: 2, qc: 20 }]);
    expect(withFs[2].fs).toBeUndefined();
    // Rf 2 % bij qc 15 MPa: fs = 2 · 15 / 100 = 0,3 MPa.
    const withRf = buildPoints({ qc, second: { kind: "rf", readings: [{ depth: 1, value: 2 }, { depth: 2, value: 2 }] }, step: 0.5, interpolation: "linear", groundLevelNap: 0 });
    expect(withRf.map((p) => [p.rf, p.fs])).toEqual([[2, 0.2], [2, 0.3], [2, 0.4]]);
  });
});

describe("gedigitaliseerde sondering", () => {
  it("maakt een gewone sondering met de herkomst en de invoer in de metadata", () => {
    const cpt = buildDigitizedCpt(sampleRecord(), "data:image/jpeg;base64,AAAA");
    expect(cpt.id).toBe("S-1961-07");
    expect(cpt.metadata).toMatchObject({ date: "1961-05-17", ground_level_nap: -0.5, source_file: "rapport-1234.pdf" });
    expect(cpt.position).toEqual({ x_rd: 155000, y_rd: 463000, z_nap: -0.5 });
    // 0 tot 20 m op 0,2 m: 101 waarden.
    expect(cpt.points).toHaveLength(101);
    expect(cpt.points[0]).toEqual({ depth: 0, depth_nap: -0.5, qc: 5 });
    // Halverwege de sprong van 5 naar 12 MPa tussen 7,4 en 7,6 m ligt geen stap; op 7,4 m 5 en op 7,6 m 12 MPa.
    expect(cpt.points.find((p) => p.depth === 7.4)!.qc).toBe(5);
    expect(cpt.points.find((p) => p.depth === 7.6)!.qc).toBe(12);
    expect(cpt.points[100]).toEqual({ depth: 20, depth_nap: -20.5, qc: 12 });
    expect(cpt.metadata.extra!["Herkomst"]).toBe("gedigitaliseerd van rapport 1234 d.d. 17-05-1961");
    expect(cpt.metadata.extra!["Soort sondering"]).toContain("mechanisch");
    expect(cpt.metadata.extra![DIGITIZED_KEY]).toBeTruthy();
    expect(digitizedImageOf(cpt)).toBe("data:image/jpeg;base64,AAAA");
  });

  it("is na opslaan en inlezen weer te openen met dezelfde ijkpunten en punten", () => {
    const record = sampleRecord({
      depthMode: "nap", interpolation: "step",
      qc: { calibration: { ...STRAIGHT, depth: { ...STRAIGHT.depth, va: -0.5, vb: -20.5 } }, points: [at(5, 0), at(12, 7.6), at(12, 20)] },
      second: { kind: "rf", calibration: { depth: { a: { x: 520, y: 50 }, b: { x: 520, y: 1050 }, va: -0.5, vb: -20.5 }, value: { a: { x: 520, y: 50 }, b: { x: 580, y: 50 }, va: 0, vb: 6 } }, points: [{ x: 540, y: 100 }, { x: 550, y: 900 }] },
    });
    const cpt = buildDigitizedCpt(record, "data:image/jpeg;base64,AAAA");
    // Zoals het projectbestand de sondering bewaart: als JSON.
    const reopened = JSON.parse(JSON.stringify(cpt));
    const read = digitizedOf(reopened)!;
    expect(read).toEqual(record);
    // Het scherm leest de invoer in en geeft bij opslaan dezelfde invoer en dezelfde sondering terug.
    const { work, header } = fromRecord(read);
    expect(work.shareDepth).toBe(false);
    expect(header).toMatchObject({ id: "S-1961-07", groundLevel: "-0,5", step: "0,2", coneKind: "mechanical", depthMode: "nap", interpolation: "step" });
    expect(toRecord(work, header, read.image)).toEqual(record);
    expect(buildDigitizedCpt(toRecord(work, header, read.image), digitizedImageOf(reopened))).toEqual(cpt);
    expect(reopened.points.some((p: { rf?: number }) => p.rf !== undefined)).toBe(true);
  });

  it("herkent een gemeten bestand en onleesbare gegevens als niet gedigitaliseerd", () => {
    expect(digitizedOf({ id: "A", metadata: { source_file: "a.gef" }, points: [] })).toBeNull();
    expect(digitizedOf({ id: "A", metadata: { source_file: "a", extra: { [DIGITIZED_KEY]: "{kapot" } }, points: [] })).toBeNull();
    expect(digitizedOf({ id: "A", metadata: { source_file: "a", extra: { [DIGITIZED_KEY]: JSON.stringify({ version: 1, id: "A" }) } }, points: [] })).toBeNull();
    expect(digitizedLabel(null)).toBeNull();
    expect(digitizedNote(undefined)).toBeNull();
  });

  it("meldt wat er nog ontbreekt", () => {
    const kinds = (r: DigitizedRecord) => recordProblems(r).map((p) => p.kind);
    expect(kinds(sampleRecord())).toEqual([]);
    expect(kinds(sampleRecord({ origin: "  " }))).toEqual(["origin"]);
    expect(kinds(sampleRecord({ id: "", groundLevelNap: NaN, step: 0 }))).toEqual(["id", "groundLevel", "step"]);
    expect(kinds(sampleRecord({ yRd: undefined }))).toEqual(["position"]);
    expect(kinds(sampleRecord({ qc: { calibration: STRAIGHT, points: [at(5, 1)] } }))).toEqual(["qcPoints"]);
    // Twee punten binnen één stap: er valt geen veelvoud van de stap tussen.
    expect(kinds(sampleRecord({ qc: { calibration: STRAIGHT, points: [at(5, 1.05), at(6, 1.15)] } }))).toEqual(["noSeries"]);
    expect(recordProblems(sampleRecord({ second: { kind: "fs", calibration: { ...STRAIGHT, value: { ...STRAIGHT.value, vb: 0 } }, points: [] } })))
      .toEqual([{ kind: "secondCalibration", problem: "valueValues" }, { kind: "secondPoints" }]);
    expect(() => buildDigitizedCpt(sampleRecord({ origin: "" }))).toThrow();
  });

  it("vermeldt in grafiek, rapport en paalberekening dat de sondering gedigitaliseerd is, met het soort sondering", () => {
    const cpt = buildDigitizedCpt(sampleRecord());
    expect(digitizedLabel(cpt)).toBe("gedigitaliseerd (mechanisch)");
    expect(digitizedLabel(buildDigitizedCpt(sampleRecord({ coneKind: "electrical" })))).toBe("gedigitaliseerd (elektrisch)");
    expect(digitizedNote(cpt)).toContain("gedigitaliseerd van papier of scan (soort: mechanisch; herkomst: gedigitaliseerd van rapport 1234 d.d. 17-05-1961)");
    const group = digitizedReportGroup(cpt)!;
    expect(group.title).toBe("Gedigitaliseerde sondering");
    const row = (label: string) => group.rows.find((r) => r.label === label)?.value;
    expect(row("Herkomst")).toBe("gedigitaliseerd van rapport 1234 d.d. 17-05-1961");
    expect(row("Soort sondering")).toContain("mechanisch");
    expect(row("IJking qc")).toBe("diepte-as 0 en 20 m onder maaiveld; waarde-as 0 en 20 MPa");
    expect(row("Aangeklikte punten")).toBe("4 voor qc; fs en Rf zijn niet overgenomen");
    expect(row("Meetreeks")).toBe("101 waarden op een stap van 0,2 m, lineair tussen de aangeklikte punten");
    // De rubriek staat in het testrapport van de sondering; een gemeten bestand heeft haar niet.
    const titles = (c: typeof cpt) => buildTestReport(c, { title: "", client: "", location: "", project_number: "", author: "", date: "" }).map((g) => g.title);
    expect(titles(cpt)).toContain("Gedigitaliseerde sondering");
    expect(titles({ id: "A", metadata: { source_file: "a.gef" }, points: [{ depth: 1, qc: 2 }] })).not.toContain("Gedigitaliseerde sondering");
  });
});

describe("werktoestand van het scherm", () => {
  it("leest getallen met een komma en laat lege velden afvallen", () => {
    expect(num("0,2")).toBe(0.2);
    expect(num(" -1.25 ")).toBe(-1.25);
    expect(num("")).toBeNaN();
    const work = emptyWork();
    expect(calibrationProblem(calibrationOf(work, "qc"))).toBe("depthPoints");
    expect(recordProblems(toRecord(work, emptyHeader(), { name: "", width: 0, height: 0 })).map((p) => p.kind))
      .toEqual(["qcCalibration", "qcPoints", "id", "groundLevel", "origin"]);
    expect(emptyHeader()).toMatchObject({ coneKind: "mechanical", step: "0,2", interpolation: "linear" });
  });

  it("laat de tweede reeks de diepte-as van qc gebruiken", () => {
    const { work } = fromRecord(sampleRecord());
    const second = { ...work, secondKind: "fs" as const, shareDepth: true, second: { ...work.second, value: { a: { x: 520, y: 50 }, b: { x: 580, y: 50 }, va: "0", vb: "0,3" } } };
    expect(calibrationOf(second, "second").depth).toEqual(STRAIGHT.depth);
    expect(calibrationProblem(calibrationOf(second, "second"))).toBeNull();
    expect(calibrationProblem(calibrationOf({ ...second, shareDepth: false }, "second"))).toBe("depthPoints");
  });

  it("tekent de lijn door de punten op volgorde van diepte, recht of trapsgewijs", () => {
    const { work } = fromRecord(sampleRecord({ qc: { calibration: STRAIGHT, points: [at(12, 3), at(5, 1), at(8, 2)] } }));
    const round = (line: { points: Px[] }) => line.points.map((p) => [Math.round(p.x), Math.round(p.y)]);
    expect(round(previewLine(work, "qc", "linear"))).toEqual([at(5, 1), at(8, 2), at(12, 3)].map((p) => [p.x, p.y]));
    // Trapsgewijs: eerst recht omlaag tot de volgende aflezing, dan opzij.
    expect(round(previewLine(work, "qc", "step"))).toEqual([at(5, 1), at(5, 2), at(8, 2), at(8, 3), at(12, 3)].map((p) => [p.x, p.y]));
    const loose = previewLine({ ...work, qc: { ...work.qc, value: { ...work.qc.value, vb: "" } } }, "qc", "linear");
    expect(loose.calibrated).toBe(false);
    expect(loose.points).toHaveLength(3);
  });
});
