// De meetlijn van een gescande sondeergrafiek automatisch volgen: de algoritmes, los van het scherm.
//
// Een oude sondeergrafiek is een donkere meetlijn op ruitjespapier. De stappen:
//   1. donkere pixels zoeken (drempel op de helderheid);
//   2. de dunne rasterlijnen wegpoetsen met een opening (eroderen, daarna weer aandikken): de dikkere
//      meetlijn blijft over;
//   3. de rasterlijnen zelf terugvinden als rijen en kolommen die bijna helemaal donker zijn; daarmee
//      stelt het scherm de ijkpunten voor en klikken ijkpunten vast op het raster;
//   4. de meetlijn volgen, beeldrij voor beeldrij omlaag: steeds de donkere run die het dichtst bij de
//      vorige positie ligt. Een horizontale streep (een piek) is één lange run; de lijn loopt er dan
//      doorheen naar het verste eind.
// Het resultaat is per beeldrij één x-positie. De gebruiker kan stukken overtekenen of wissen; de
// ijking (`calibration.ts`) rekent de pixels daarna om naar diepte en meetwaarde.
import type { Px } from "./calibration";

export interface Bitmap { width: number; height: number; /** 1 = donker. */ data: Uint8Array }
/** Per beeldrij de x van de meetlijn; NaN waar geen lijn is. */
export type Trace = Float32Array;
/** De lijn zoals zij wordt bewaard: de x per beeldrij vanaf rij `top`, `null` waar geen lijn is. */
export interface TraceRows { top: number; x: Array<number | null> }

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

export interface AxisPoints { depth: { a: Px; b: Px }; value: { a: Px; b: Px } }

/**
 * Voorstel voor de vier ijkpunten uit het gevonden raster: de diepte-as langs de linker rasterlijn van
 * de bovenste tot de onderste lijn, de waarde-as langs de bovenste rasterlijn van de linker tot de
 * rechter lijn. `null` als er geen raster is gevonden (minder dan twee lijnen in een richting).
 */
export function suggestAxisPoints(grid: { rows: number[]; cols: number[] }): AxisPoints | null {
  if (grid.rows.length < 2 || grid.cols.length < 2) return null;
  const top = grid.rows[0], bottom = grid.rows[grid.rows.length - 1], left = grid.cols[0], right = grid.cols[grid.cols.length - 1];
  return { depth: { a: { x: left, y: top }, b: { x: left, y: bottom } }, value: { a: { x: left, y: top }, b: { x: right, y: top } } };
}

/** Een aangeklikt ijkpunt op het dichtstbijzijnde kruispunt of de dichtstbijzijnde lijn van het raster. */
export function snapToGrid(p: Px, grid: { rows: number[]; cols: number[] }, tolerance = 6): Px {
  return { x: snap(p.x, grid.cols, tolerance), y: snap(p.y, grid.rows, tolerance) };
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
  let prev = startX, missed = 0, wasLong = false;
  // Een gat wordt overbrugd met de laatste positie; blijft de lijn weg, dan
  // gaan die overbruggingsrijen er weer af en stopt het volgen.
  const miss = (y: number): boolean => {
    into[y] = prev; wasLong = false;
    if (++missed <= maxGapRows) return false;
    for (let k = y; k > y - missed; k--) into[k] = NaN;
    missed = 0;
    return true;
  };
  const end = Math.min(mask.height, options.yEnd);
  for (let y = Math.max(0, Math.round(startY)); y < end; y++) {
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
    // Een dikke streep beslaat meer beeldrijen: alleen op de eerste gaat de lijn naar het verste eind,
    // op de volgende blijft zij aan dat eind (anders springt zij per rij heen en weer).
    const farEnd = Math.abs(best[1] - prev) > Math.abs(best[0] - prev);
    const x = long ? ((farEnd !== wasLong) ? best[1] : best[0]) : (best[0] + best[1]) / 2;
    wasLong = long;
    into[y] = x;
    prev = x;
  }
  // Houdt de lijn vlak voor het eind van het blad op, dan blijft er geen overbrugging onder haar staan.
  for (let k = end - 1; k > end - 1 - missed; k--) into[k] = NaN;
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

/** De pixels van de lijn, één per beeldrij waar een lijn is. */
export function tracePixels(trace: Trace): Px[] {
  const out: Px[] = [];
  for (let y = 0; y < trace.length; y++) if (Number.isFinite(trace[y])) out.push({ x: trace[y], y });
  return out;
}

/** Aantal beeldrijen met een lijn. */
export const traceRowCount = (trace: Trace | null | undefined) => { let n = 0; if (trace) for (const x of trace) if (Number.isFinite(x)) n++; return n; };

/** De lijn om te bewaren: zonder de lege rijen erboven en eronder, x op een honderdste pixel. */
export function toTraceRows(trace: Trace): TraceRows | undefined {
  let top = 0, end = trace.length;
  while (top < end && !Number.isFinite(trace[top])) top++;
  while (end > top && !Number.isFinite(trace[end - 1])) end--;
  if (top === end) return undefined;
  return { top, x: Array.from(trace.subarray(top, end), (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null)) };
}

/** De bewaarde lijn terug op een blad van `height` beeldrijen. */
export function fromTraceRows(rows: TraceRows | undefined, height: number): Trace {
  const trace = new Float32Array(Math.max(0, Math.round(height))).fill(NaN);
  if (rows) rows.x.forEach((x, i) => { const y = rows.top + i; if (x !== null && Number.isFinite(x) && y >= 0 && y < trace.length) trace[y] = x; });
  return trace;
}
