import { describe, expect, it } from "vitest";
import { binarize, calibrationValid, detectGridLines, drawSegment, eraseRows, removeThinLines, snap, suggestCalibration, toCptPoints, traceLine, type Bitmap, type Calibration } from "./trace";

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

  it("vindt de rasterlijnen en stelt de buitenste voor als ijklijnen", () => {
    const grid = detectGridLines(sheet(curve));
    expect(grid.rows).toHaveLength(15);
    expect(grid.cols).toHaveLength(10);
    expect(grid.rows[1]).toBe(20);
    expect(suggestCalibration(grid, W, H)).toEqual({ x1: 0, x2: 180, y1: 0, y2: 280 });
    expect(suggestCalibration({ rows: [], cols: [] }, W, H)).toEqual({ x1: 20, x2: 180, y1: 30, y2: 270 });
  });

  it("klikt vast op een rasterlijn binnen de tolerantie", () => {
    expect(snap(43, [20, 40, 60])).toBe(40);
    expect(snap(50, [20, 40, 60])).toBe(50);
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
  });

  it("loopt door een horizontale piek naar het verste eind", () => {
    const m = sheet(() => 50);
    for (let x = 50; x <= 150; x++) for (let e = -1; e <= 1; e++) m.data[(100 + e) * W + x] = 1;
    for (let y = 100; y < 280; y++) for (let d = -1; d <= 1; d++) { m.data[y * W + 50 + d] = y % 20 === 0 ? 1 : 0; m.data[y * W + 150 + d] = 1; }
    const trace = traceLine(removeThinLines(m), 50, 22, { xMin: 0, xMax: W, yEnd: 270 });
    expect(Math.abs(trace[60] - 50)).toBeLessThanOrEqual(1);
    expect(Math.abs(trace[200] - 150)).toBeLessThanOrEqual(2);
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

  it("rekent pixels om naar diepte en conusweerstand", () => {
    const cal: Calibration = { y1: 0, v1: 1, y2: 100, v2: -1, x1: 10, q1: 0, x2: 110, q2: 20 };
    expect(calibrationValid(cal)).toBe(true);
    expect(calibrationValid({ ...cal, v2: 1 })).toBe(false);
    const trace = new Float32Array(101).fill(NaN);
    for (let y = 0; y <= 100; y++) trace[y] = 60;
    trace[100] = 5; // links van de nullijn: geen negatieve qc
    const nap = toCptPoints(trace, cal, "nap", 0.5, 0.1);
    expect(nap[0]).toEqual({ depth: 0, qc: 10 });   // boven maaiveld valt weg
    expect(nap[nap.length - 1].depth).toBe(1.5);
    expect(nap[nap.length - 1].qc).toBeLessThan(10);
    const depth = toCptPoints(trace, { ...cal, v1: 0, v2: 2 }, "depth", 0, 0.5);
    expect(depth.map((p) => p.depth)).toEqual([0, 0.5, 1, 1.5, 2]);
    expect(toCptPoints(trace, { ...cal, x2: 10 }, "depth", 0)).toEqual([]);
  });
});
