import { describe, expect, it } from "vitest";
import { solveCalibration, type Calibration } from "./calibration";
import { buildDigitizedCpt, digitizedOf, digitizedReportGroup, recordProblems } from "./record";
import { averageReadings, buildPoints } from "./series";
import { binarize, detectGridLines, drawSegment, eraseRows, fromTraceRows, removeThinLines, snap, snapToGrid, suggestAxisPoints, toTraceRows, traceLine, tracePixels, traceRowCount, type Bitmap } from "./trace";
import { fromRecord, toRecord } from "./work";
import { at, sampleRecord, STRAIGHT } from "./__fixtures__/sample";

const W = 200, H = 300;

/** Ruitjespapier (1 px, om de 20 px) met een 3 px dikke meetlijn x = f(y). */
function sheet(f: (y: number) => number, yFrom = 20, yTo = 280): Bitmap {
  const data = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (y % 20 === 0 || x % 20 === 0) data[y * W + x] = 1;
  for (let y = yFrom; y < yTo; y++) { const x = Math.round(f(y)); for (let d = -1; d <= 1; d++) for (let e = -1; e <= 1; e++) data[(y + e) * W + x + d] = 1; }
  return { width: W, height: H, data };
}
const curve = (y: number) => 60 + 30 * Math.sin(y / 25);

describe("sondering uit scan", () => {
  it("maakt van donkere pixels een masker", () => {
    const rgba = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255, 90, 90, 90, 255, 0, 0, 0, 0]);
    expect([...binarize(rgba, 4, 1).data]).toEqual([1, 0, 1, 0]);
  });

  it("vindt de rasterlijnen en stelt de buitenste voor als ijkpunten", () => {
    const grid = detectGridLines(sheet(curve));
    expect(grid.rows).toHaveLength(15);
    expect(grid.cols).toHaveLength(10);
    expect(grid.rows[1]).toBe(20);
    // Diepte-as langs de linker lijn van boven naar onder, waarde-as langs de bovenste lijn van links naar rechts.
    expect(suggestAxisPoints(grid)).toEqual({
      depth: { a: { x: 0, y: 0 }, b: { x: 0, y: 280 } },
      value: { a: { x: 0, y: 0 }, b: { x: 180, y: 0 } },
    });
    // Zonder raster is er niets voor te stellen: de gebruiker klikt de ijkpunten zelf aan.
    expect(suggestAxisPoints({ rows: [], cols: [] })).toBeNull();
    expect(suggestAxisPoints({ rows: [10, 200], cols: [30] })).toBeNull();
  });

  it("geeft met de voorgestelde ijkpunten en de waarden van de buitenste lijnen een bruikbare ijking", () => {
    const points = suggestAxisPoints(detectGridLines(sheet(curve)))!;
    // De buitenste lijnen: 0 en 14 m (280 px, 20 px per meter) en 0 en 18 MPa (180 px, 10 px per MPa).
    const m = solveCalibration({ depth: { ...points.depth, va: 0, vb: 14 }, value: { ...points.value, va: 0, vb: 18 } })!;
    const readings = averageReadings([{ x: 60, y: 100 }], m, "depth", 0, 0.02);
    expect(readings).toEqual([{ depth: 5, value: expect.closeTo(6, 9) }]);
  });

  it("klikt vast op een rasterlijn binnen de tolerantie", () => {
    expect(snap(43, [20, 40, 60])).toBe(40);
    expect(snap(50, [20, 40, 60])).toBe(50);
    // Een aangeklikt ijkpunt: elke richting voor zich.
    expect(snapToGrid({ x: 43, y: 150 }, { rows: [100, 200], cols: [20, 40, 60] })).toEqual({ x: 40, y: 150 });
    expect(snapToGrid({ x: 58, y: 196 }, { rows: [100, 200], cols: [20, 40, 60] })).toEqual({ x: 60, y: 200 });
  });

  it("poetst het raster weg en volgt de meetlijn", () => {
    const mask = removeThinLines(sheet(curve));
    expect(detectGridLines(mask).rows).toHaveLength(0);
    const trace = traceLine(mask, curve(22), 22, { xMin: 0, xMax: W, yEnd: H });
    for (let y = 25; y < 275; y++) expect(Math.abs(trace[y] - curve(y))).toBeLessThanOrEqual(2);
  });

  it("stopt waar de lijn ophoudt", () => {
    const mask = removeThinLines(sheet(curve, 20, 150));
    const trace = traceLine(mask, curve(22), 22, { xMin: 0, xMax: W, yEnd: H, maxGapRows: 30 });
    expect(Number.isFinite(trace[140])).toBe(true);
    expect(Number.isNaN(trace[160])).toBe(true);
    expect(Number.isNaN(trace[290])).toBe(true);
    // Ook als het blad ophoudt voordat de overbrugging op is: onder het eind van de lijn staat niets.
    const short = traceLine(mask, curve(22), 22, { xMin: 0, xMax: W, yEnd: 170, maxGapRows: 30 });
    expect(Number.isFinite(short[140])).toBe(true);
    expect(Number.isNaN(short[160])).toBe(true);
  });

  it("loopt door een horizontale piek naar het verste eind", () => {
    const m = sheet(() => 50);
    for (let x = 50; x <= 150; x++) for (let e = -1; e <= 1; e++) m.data[(100 + e) * W + x] = 1;
    for (let y = 100; y < 280; y++) for (let d = -1; d <= 1; d++) { m.data[y * W + 50 + d] = y % 20 === 0 ? 1 : 0; m.data[y * W + 150 + d] = 1; }
    const trace = traceLine(removeThinLines(m), 50, 22, { xMin: 0, xMax: W, yEnd: 270 });
    expect(Math.abs(trace[60] - 50)).toBeLessThanOrEqual(1);
    expect(Math.abs(trace[200] - 150)).toBeLessThanOrEqual(2);
  });

  it("blijft bij een dikke horizontale streep aan het verste eind, ongeacht het aantal beeldrijen", () => {
    for (const thickness of [4, 5, 6]) {
      const data = new Uint8Array(W * H);
      const dot = (x: number, y: number) => { for (let d = -2; d <= 2; d++) for (let e = -2; e <= 2; e++) data[(y + e) * W + x + d] = 1; };
      for (let y = 20; y < 100; y++) dot(50, y);
      for (let x = 50; x <= 150; x++) for (let e = 0; e < thickness; e++) data[(100 + e) * W + x] = 1;
      for (let y = 100; y < 280; y++) dot(150, y);
      const trace = traceLine({ width: W, height: H, data }, 50, 22, { xMin: 0, xMax: W, yEnd: 270 });
      expect(Math.abs(trace[60] - 50), `dikte ${thickness}`).toBeLessThanOrEqual(1);
      expect(Math.abs(trace[200] - 150), `dikte ${thickness}`).toBeLessThanOrEqual(2);
    }
  });

  it("tekent en wist met de hand", () => {
    const trace = new Float32Array(100).fill(NaN);
    drawSegment(trace, 10, 20, 30, 40);
    expect(trace[20]).toBe(10);
    expect(trace[30]).toBe(20);
    expect(trace[40]).toBe(30);
    drawSegment(trace, 80, 60, 50, 50);
    expect(trace[55]).toBe(65);
    eraseRows(trace, 35, 25);
    expect(Number.isNaN(trace[30])).toBe(true);
    expect(trace[40]).toBe(30);
  });

  it("rekent de lijn om naar diepte en conusweerstand: het gemiddelde per stap", () => {
    // Beeldrij 0 is NAP +1 m en rij 100 is NAP -1 m; kolom 10 is 0 MPa en kolom 110 is 20 MPa.
    const cal: Calibration = { depth: { a: { x: 10, y: 0 }, b: { x: 10, y: 100 }, va: 1, vb: -1 }, value: { a: { x: 10, y: 0 }, b: { x: 110, y: 0 }, va: 0, vb: 20 } };
    const trace = new Float32Array(101).fill(NaN);
    for (let y = 0; y <= 100; y++) trace[y] = 60;
    trace[100] = 5; // links van de nullijn: geen negatieve qc
    const pixels = tracePixels(trace);
    // Maaiveld NAP +0,5 m: wat daarboven ligt, valt weg.
    const nap = averageReadings(pixels, solveCalibration(cal)!, "nap", 0.5, 0.1);
    expect(nap[0]).toEqual({ depth: 0, value: expect.closeTo(10, 9) });
    expect(nap[nap.length - 1].depth).toBe(1.5);
    // De laatste stap: rijen 98, 99 en 100 met 10, 10 en 0 MPa.
    expect(nap[nap.length - 1].value).toBeCloseTo(20 / 3, 9);
    const depth = averageReadings(pixels, solveCalibration({ ...cal, depth: { ...cal.depth, va: 0, vb: 2 } })!, "depth", 0, 0.5);
    expect(depth.map((p) => p.depth)).toEqual([0, 0.5, 1, 1.5, 2]);
    // De laatste stap (vanaf 1,75 m): rijen 88 tot en met 100, twaalf keer 10 MPa en één keer 0: 120 / 13 = 9,231.
    const points = buildPoints({ qc: depth, step: 0.5, interpolation: "linear", groundLevelNap: 0 });
    expect(points.map((p) => [p.depth, p.qc])).toEqual([[0, 10], [0.5, 10], [1, 10], [1.5, 10], [2, 9.231]]);
    // Zonder bruikbare ijking is er geen afbeelding en dus geen meetreeks.
    expect(solveCalibration({ ...cal, value: { ...cal.value, b: cal.value.a } })).toBeNull();
    expect(averageReadings(pixels, solveCalibration(cal)!, "depth", 0, 0)).toEqual([]);
  });

  it("bewaart de lijn zonder de lege rijen erboven en eronder en zet haar terug", () => {
    const trace = new Float32Array(12).fill(NaN);
    trace[3] = 10.126; trace[4] = 11; trace[6] = 12;
    const rows = toTraceRows(trace)!;
    expect(rows).toEqual({ top: 3, x: [10.13, 11, null, 12] });
    expect(traceRowCount(trace)).toBe(3);
    const back = fromTraceRows(JSON.parse(JSON.stringify(rows)), 12);
    expect(tracePixels(back).map((p) => p.y)).toEqual([3, 4, 6]);
    expect(back[3]).toBeCloseTo(10.13, 5);
    expect(toTraceRows(new Float32Array(5).fill(NaN))).toBeUndefined();
    // Een lijn die langer is dan het blad, valt buiten het blad weg.
    expect(traceRowCount(fromTraceRows(rows, 5))).toBe(2);
  });
});

describe("gevolgde lijn als gedigitaliseerde sondering", () => {
  /** Lijn op de rechte grafiek van het voorbeeld: 5 MPa tot 7,5 m, daarna 12 MPa tot 20 m. */
  const traced = () => {
    const trace = new Float32Array(1100).fill(NaN);
    for (let y = at(0, 0).y; y <= at(0, 20).y; y++) trace[y] = at(y < at(0, 7.5).y ? 5 : 12, 0).x;
    return sampleRecord({ qc: { calibration: STRAIGHT, points: [], method: "trace", trace: toTraceRows(trace) } });
  };

  it("geeft dezelfde soort sondering als aangeklikte punten, met het gemiddelde per stap", () => {
    const cpt = buildDigitizedCpt(traced());
    // 0 tot 20 m op 0,2 m: 101 waarden.
    expect(cpt.points).toHaveLength(101);
    expect(cpt.points[0]).toEqual({ depth: 0, depth_nap: -0.5, qc: 5 });
    // De stap rond 7,4 m loopt van 7,3 tot 7,5 m en ligt geheel in de 5 MPa; die rond 7,6 m geheel in de 12 MPa.
    expect(cpt.points.find((p) => p.depth === 7.4)!.qc).toBe(5);
    expect(cpt.points.find((p) => p.depth === 7.6)!.qc).toBe(12);
    expect(cpt.points[100]).toEqual({ depth: 20, depth_nap: -20.5, qc: 12 });
    expect(cpt.metadata.extra!["Meetreeks"]).toBe("stap 0,2 m, gemiddelde van de gevolgde lijn per stap");
    const row = (label: string) => digitizedReportGroup(cpt)!.rows.find((r) => r.label === label)?.value;
    expect(row("Gevolgde lijn")).toBe("qc over 1001 beeldrijen; fs en Rf zijn niet overgenomen");
    expect(row("Aangeklikte punten")).toBeUndefined();
  });

  it("is na opslaan en inlezen weer te openen met dezelfde lijn", () => {
    const record = traced();
    const cpt = buildDigitizedCpt(record);
    const read = digitizedOf(JSON.parse(JSON.stringify(cpt)))!;
    expect(read).toEqual(record);
    const { work, header } = fromRecord(read);
    expect(work.qc.method).toBe("trace");
    expect(traceRowCount(work.qc.trace)).toBe(1001);
    expect(buildDigitizedCpt(toRecord(work, header, read.image))).toEqual(cpt);
  });

  it("vraagt om een lijn als die er nog niet is", () => {
    expect(recordProblems(sampleRecord({ qc: { calibration: STRAIGHT, points: [at(5, 0), at(5, 2)], method: "trace" } })).map((p) => p.kind)).toEqual(["qcTrace"]);
    expect(recordProblems(traced())).toEqual([]);
  });
});
