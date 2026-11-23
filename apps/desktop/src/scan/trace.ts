// Sondering uit een scan: de algoritmes, los van de schermen.
//
// Een oude sondeergrafiek is een donkere meetlijn op ruitjespapier. De
// stappen:
//   1. donkere pixels zoeken (drempel op de helderheid);
//   2. de dunne rasterlijnen wegpoetsen met een opening (eroderen, daarna
//      weer aandikken): de dikkere meetlijn blijft over;
//   3. de rasterlijnen zelf terugvinden als rijen en kolommen die bijna
//      helemaal donker zijn; daarmee stelt de dialoog de schaal voor en
//      klikken de ijklijnen vast op het raster;
//   4. de meetlijn volgen, beeldrij voor beeldrij omlaag: steeds de donkere
//      run die het dichtst bij de vorige positie ligt. Een horizontale
//      streep (een piek) is één lange run; de lijn loopt er dan doorheen
//      naar het verste eind.
// Het resultaat is per beeldrij één x-positie. De gebruiker kan stukken
// overtekenen of wissen; daarna rekent `toCptPoints` pixels om naar diepte
// en conusweerstand.

export interface Bitmap { width: number; height: number; /** 1 = donker. */ data: Uint8Array }
export interface Calibration {
  /** Twee beeldrijen met hun waarde op de diepte-as. */
  y1: number; v1: number; y2: number; v2: number;
  /** Twee beeldkolommen met hun conusweerstand [MPa]. */
  x1: number; q1: number; x2: number; q2: number;
}
/** Per beeldrij de x van de meetlijn; NaN waar geen lijn is. */
export type Trace = Float32Array;

/** Donkere pixels uit RGBA-beelddata. */
export function binarize(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number, threshold = 120): Bitmap {
  const data = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < data.length; i++, p += 4) {
    const lum = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
    data[i] = lum < threshold && rgba[p + 3] > 32 ? 1 : 0;
  }
  return { width, height, data };
}

function morph(src: Bitmap, r: number, erode: boolean): Bitmap {
  const { width: w, height: h } = src, out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = erode ? 1 : 0;
    for (let dy = -r; dy <= r && v === (erode ? 1 : 0); dy++) for (let dx = -r; dx <= r; dx++) {
      const yy = y + dy, xx = x + dx;
      const s = yy < 0 || xx < 0 || yy >= h || xx >= w ? 0 : src.data[yy * w + xx];
      if (erode ? !s : s) { v = erode ? 0 : 1; break; }
    }
    out[y * w + x] = v;
  }
  return { width: w, height: h, data: out };
}

/** Opening: lijnen dunner dan `2·radius + 1` pixels verdwijnen. */
export function removeThinLines(mask: Bitmap, radius = 1): Bitmap {
  return morph(morph(mask, radius, true), radius, false);
}

/** Rijen (horizontaal) en kolommen (verticaal) die voor minstens `fraction` donker zijn: de rasterlijnen. */
export function detectGridLines(mask: Bitmap, fraction = 0.55): { rows: number[]; cols: number[] } {
  const { width: w, height: h, data } = mask;
  const rowSum = new Uint32Array(h), colSum = new Uint32Array(w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[y * w + x]) { rowSum[y]++; colSum[x]++; }
  const peaks = (sum: Uint32Array, full: number) => {
    const out: number[] = [];
    let start = -1;
    for (let i = 0; i <= sum.length; i++) {
      const on = i < sum.length && sum[i] >= fraction * full;
      if (on && start < 0) start = i;
      if (!on && start >= 0) { out.push((start + i - 1) / 2); start = -1; }
    }
    return out;
  };
  return { rows: peaks(rowSum, w), cols: peaks(colSum, h) };
}

/** Dichtstbijzijnde rasterlijn binnen `tolerance` pixels, anders de waarde zelf. */
export function snap(value: number, lines: number[], tolerance = 6): number {
  let best = value, dist = tolerance;
  for (const l of lines) { const d = Math.abs(l - value); if (d <= dist) { best = l; dist = d; } }
  return best;
}

/** Voorstel voor de ijklijnen: de buitenste rasterlijnen, of anders de beeldranden. */
export function suggestCalibration(grid: { rows: number[]; cols: number[] }, width: number, height: number): Pick<Calibration, "x1" | "x2" | "y1" | "y2"> {
  const pick = (lines: number[], size: number) => (lines.length >= 2 ? [lines[0], lines[lines.length - 1]] : [size * 0.1, size * 0.9]);
  const [y1, y2] = pick(grid.rows, height), [x1, x2] = pick(grid.cols, width);
  return { x1, x2, y1, y2 };
}

function runsInRow(mask: Bitmap, y: number, xa: number, xb: number): [number, number][] {
  const out: [number, number][] = [];
  let start = -1;
  const row = y * mask.width;
  for (let x = xa; x <= xb; x++) {
    const on = x < xb && mask.data[row + x] === 1;
    if (on && start < 0) start = x;
    if (!on && start >= 0) { out.push([start, x - 1]); start = -1; }
  }
  return out;
}

export interface TraceOptions {
  /** Kolommen waarbinnen gezocht wordt (het plotvlak). */
  xMin: number; xMax: number;
  /** Laatste beeldrij (exclusief). */
  yEnd: number;
  /** Grootste sprong naar een losse run; verder weg houdt de lijn haar positie. */
  maxJump?: number;
  /** Na zoveel rijen zonder lijn stopt het volgen (einde van de sondering). */
  maxGapRows?: number;
}

/**
 * Volgt de meetlijn vanaf (startX, startY) omlaag en schrijft het resultaat
 * in `into` (alleen de doorlopen rijen worden overschreven).
 */
export function traceLine(mask: Bitmap, startX: number, startY: number, options: TraceOptions, into: Trace = new Float32Array(mask.height).fill(NaN)): Trace {
  const xa = Math.max(0, Math.floor(options.xMin)), xb = Math.min(mask.width, Math.ceil(options.xMax));
  const maxJump = options.maxJump ?? Math.max(20, mask.width * 0.04);
  const maxGapRows = options.maxGapRows ?? 40;
  let prev = startX, missed = 0;
  // Een gat wordt overbrugd met de laatste positie; blijft de lijn weg, dan
  // gaan die overbruggingsrijen er weer af en stopt het volgen.
  const miss = (y: number): boolean => {
    into[y] = prev;
    if (++missed <= maxGapRows) return false;
    for (let k = y; k > y - missed; k--) into[k] = NaN;
    return true;
  };
  for (let y = Math.max(0, Math.round(startY)); y < Math.min(mask.height, options.yEnd); y++) {
    const runs = runsInRow(mask, y, xa, xb);
    if (!runs.length) { if (miss(y)) break; continue; }
    let best = runs[0], bestGap = Infinity;
    for (const r of runs) {
      const gap = prev >= r[0] && prev <= r[1] ? 0 : Math.min(Math.abs(r[0] - prev), Math.abs(r[1] - prev));
      if (gap < bestGap) { best = r; bestGap = gap; }
    }
    if (bestGap > maxJump) { if (miss(y)) break; continue; }
    missed = 0;
    const long = best[1] - best[0] > 12;
    const x = long ? (Math.abs(best[1] - prev) > Math.abs(best[0] - prev) ? best[1] : best[0]) : (best[0] + best[1]) / 2;
    into[y] = x;
    prev = x;
  }
  return into;
}

/** Zet een met de hand getekend lijnstuk (van punt a naar b) in de trace. */
export function drawSegment(trace: Trace, ax: number, ay: number, bx: number, by: number): void {
  let [x0, y0, x1, y1] = [ax, ay, bx, by];
  if (y1 < y0) [x0, y0, x1, y1] = [x1, y1, x0, y0];
  const ya = Math.max(0, Math.round(y0)), yb = Math.min(trace.length - 1, Math.round(y1));
  for (let y = ya; y <= yb; y++) trace[y] = yb === ya ? x1 : x0 + ((x1 - x0) * (y - y0)) / Math.max(1e-9, y1 - y0);
}

export function eraseRows(trace: Trace, ya: number, yb: number): void {
  const a = Math.max(0, Math.round(Math.min(ya, yb))), b = Math.min(trace.length - 1, Math.round(Math.max(ya, yb)));
  for (let y = a; y <= b; y++) trace[y] = NaN;
}

export function calibrationValid(c: Calibration): boolean {
  return [c.x1, c.x2, c.y1, c.y2, c.q1, c.q2, c.v1, c.v2].every(Number.isFinite) && Math.abs(c.y2 - c.y1) > 2 && Math.abs(c.x2 - c.x1) > 2 && c.v1 !== c.v2 && c.q1 !== c.q2;
}

export const axisValue = (c: Calibration, y: number) => c.v1 + ((c.v2 - c.v1) * (y - c.y1)) / (c.y2 - c.y1);
export const qcValue = (c: Calibration, x: number) => c.q1 + ((c.q2 - c.q1) * (x - c.x1)) / (c.x2 - c.x1);

export interface ScanPoint { depth: number; qc: number }

/**
 * Rekent de trace om naar meetpunten met een vaste stap in de diepte.
 * `axis` zegt wat de diepte-as toont: m NAP (dan is `groundNap` nodig) of
 * de diepte onder maaiveld. qc is het gemiddelde van de beeldrijen binnen
 * de stap en wordt niet negatief.
 */
export function toCptPoints(trace: Trace, c: Calibration, axis: "nap" | "depth", groundNap: number, stepM = 0.02): ScanPoint[] {
  if (!calibrationValid(c)) return [];
  const buckets = new Map<number, { sum: number; n: number }>();
  for (let y = 0; y < trace.length; y++) {
    const x = trace[y];
    if (!Number.isFinite(x)) continue;
    const v = axisValue(c, y);
    const depth = axis === "nap" ? groundNap - v : v;
    if (depth < 0) continue;
    const key = Math.round(depth / stepM);
    const b = buckets.get(key) ?? { sum: 0, n: 0 };
    b.sum += Math.max(0, qcValue(c, x)); b.n++;
    buckets.set(key, b);
  }
  return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([key, b]) => ({ depth: Math.round(key * stepM * 1000) / 1000, qc: Math.round((b.sum / b.n) * 100) / 100 }));
}
