// REGIS II (TNO): hydrogeologisch model van Nederland, 100 × 100 m, via OPeNDAP (open, CC-BY).
//
// Per cel geeft REGIS de boven- en onderkant (m NAP) en de doorlatendheid van elke eenheid. De naam van een eenheid
// eindigt op z (zand: watervoerend), k (klei: scheidend), c (complex), v (veen) of b (bruinkool). Daaruit volgen de
// watervoerende pakketten: aaneengesloten zandeenheden, gescheiden door een scheidende laag.
export const REGIS_URL = "https://www.dinodata.nl/opendap/REGIS/REGIS.nc";
const CELL = 100, Y_ORIGIN = 300_000, LAYERS = 132, NODATA = -9999;

export interface Bbox { xmin: number; ymin: number; xmax: number; ymax: number }
export type UnitKind = "deklaag" | "watervoerend" | "scheidend";
export interface RegisUnit {
  name: string;
  kind: UnitKind;
  /** Per cel (index j·nx + i, i naar het oosten, j naar het noorden); null = eenheid niet aanwezig. */
  top: (number | null)[];
  bottom: (number | null)[];
  /** Horizontale en verticale doorlatendheid [m/d]. */
  kh: (number | null)[];
  kv: (number | null)[];
}
export interface RegisGrid {
  source: "REGIS II";
  /** Linkeronderhoek van cel (0, 0) in RD [m]. */
  x0: number;
  y0: number;
  cell: number;
  nx: number;
  ny: number;
  /** Maaiveld per cel [m NAP]. */
  ground: (number | null)[];
  /** Eenheden van boven naar beneden, alleen die ergens in het gebied voorkomen. */
  units: RegisUnit[];
}

export function unitKind(name: string): UnitKind {
  if (/hlc$/i.test(name)) return "deklaag";
  if (/z\d*$/.test(name) || /q$/.test(name)) return "watervoerend";
  return "scheidend";
}

/** Celindexen die het gebied bedekken; begrensd tot `max` cellen per richting rond het midden. */
export function regisRange(b: Bbox, max = 12) {
  const clamp = (lo: number, hi: number) => {
    if (hi - lo + 1 <= max) return [lo, hi];
    const mid = Math.floor((lo + hi) / 2);
    return [mid - Math.floor(max / 2) + 1, mid + Math.ceil(max / 2)];
  };
  const [i0, i1] = clamp(Math.floor(b.xmin / CELL), Math.floor(b.xmax / CELL));
  const [j0, j1] = clamp(Math.floor((b.ymin - Y_ORIGIN) / CELL), Math.floor((b.ymax - Y_ORIGIN) / CELL));
  return { i0, i1, j0, j1 };
}

export function regisUrl(b: Bbox): string {
  const { i0, i1, j0, j1 } = regisRange(b);
  const sel = `[0:1:${LAYERS - 1}][${j0}:1:${j1}][${i0}:1:${i1}]`;
  const q = ["top", "bottom", "kh", "kv"].map((v) => `${v}${sel}`).join(",");
  return `${REGIS_URL}.ascii?${q.replace(/\[/g, "%5B").replace(/\]/g, "%5D")}`;
}

/**
 * Leest het ASCII-antwoord van OPeNDAP. Regels zien eruit als
 * `top.top[top.layer="NUhlc"][top.y=426600], 1.83, 2.61` (waarden van west naar oost).
 */
export function parseRegisAscii(text: string, b: Bbox): RegisGrid {
  const { i0, i1, j0, j1 } = regisRange(b);
  const nx = i1 - i0 + 1, ny = j1 - j0 + 1;
  const y0 = Y_ORIGIN + j0 * CELL;
  const vars = new Map<string, Map<string, (number | null)[]>>();
  const order: string[] = [];
  const row = /^(\w+)\.\1\[\1\.layer="([^"]+)"\]\[\1\.y=(-?[\d.]+)\],\s*(.*)$/;
  for (const line of text.split(/\r?\n/)) {
    const m = row.exec(line.trim());
    if (!m) continue;
    const [, v, layer, yStr, rest] = m;
    const j = Math.round((Number(yStr) - y0) / CELL);
    if (j < 0 || j >= ny) continue;
    const values = rest.split(",").map((s) => Number(s.trim()));
    let byLayer = vars.get(v);
    if (!byLayer) { byLayer = new Map(); vars.set(v, byLayer); }
    let cells = byLayer.get(layer);
    if (!cells) { cells = new Array(nx * ny).fill(null); byLayer.set(layer, cells); if (v === "top") order.push(layer); }
    values.slice(0, nx).forEach((val, i) => { cells![j * nx + i] = Number.isFinite(val) && val !== NODATA ? val : null; });
  }
  const get = (v: string, layer: string) => vars.get(v)?.get(layer) ?? new Array(nx * ny).fill(null);
  const units: RegisUnit[] = order
    .filter((name) => name !== "mv")
    .map((name) => ({ name, kind: unitKind(name), top: get("top", name), bottom: get("bottom", name), kh: get("kh", name), kv: get("kv", name) }))
    .filter((u) => u.top.some((t, k) => t !== null && u.bottom[k] !== null && t > (u.bottom[k] as number)));
  if (!vars.size) throw new Error("REGIS gaf geen gegevens voor dit gebied.");
  return { source: "REGIS II", x0: i0 * CELL, y0, cell: CELL, nx, ny, ground: get("top", "mv"), units };
}

export async function fetchRegis(b: Bbox, signal?: AbortSignal): Promise<RegisGrid> {
  const r = await fetch(regisUrl(b), { signal });
  if (!r.ok) throw new Error(`REGIS niet bereikbaar (${r.status}).`);
  return parseRegisAscii(await r.text(), b);
}

export interface Aquifer {
  /** 1 = eerste watervoerend pakket. */
  index: number;
  /** Per cel; null = pakket ontbreekt in die cel. */
  top: (number | null)[];
  bottom: (number | null)[];
  /** Doorlaatvermogen kD [m²/d] en dikte-gewogen kh [m/d] per cel. */
  kD: (number | null)[];
  kh: (number | null)[];
  units: string[];
}

/**
 * Watervoerende pakketten per cel: aaneengesloten watervoerende eenheden; een scheidende laag dunner dan
 * `minAquitardM` onderbreekt een pakket niet. Alles boven het eerste pakket is de deklaag.
 */
export function aquifers(grid: RegisGrid, max = 3, minAquitardM = 1): Aquifer[] {
  const cells = grid.nx * grid.ny;
  const out: Aquifer[] = Array.from({ length: max }, (_, i) => ({
    index: i + 1, top: new Array(cells).fill(null), bottom: new Array(cells).fill(null), kD: new Array(cells).fill(null), kh: new Array(cells).fill(null), units: [],
  }));
  for (let c = 0; c < cells; c++) {
    let current = -1, open = false;
    for (const u of grid.units) {
      const t = u.top[c], bt = u.bottom[c];
      if (t === null || bt === null || t <= bt) continue;
      if (u.kind === "watervoerend") {
        if (!open) { current += 1; open = true; if (current >= max) break; out[current].top[c] = t; }
        const a = out[current];
        a.bottom[c] = bt;
        const d = t - bt, k = u.kh[c] ?? 0;
        a.kD[c] = (a.kD[c] ?? 0) + k * d;
        if (!a.units.includes(u.name)) a.units.push(u.name);
      } else if (open && (u.kind === "deklaag" || t - bt >= minAquitardM)) {
        open = false;
      }
    }
    for (const a of out) if (a.kD[c] !== null && a.top[c] !== null && a.bottom[c] !== null) a.kh[c] = a.kD[c]! / (a.top[c]! - a.bottom[c]!);
  }
  return out.filter((a) => a.top.some((t) => t !== null));
}

/** Waarde van een celveld op een punt in RD; null buiten het raster of zonder waarde. */
export function cellValue(grid: Pick<RegisGrid, "x0" | "y0" | "cell" | "nx" | "ny">, values: (number | null)[], x: number, y: number): number | null {
  const i = Math.floor((x - grid.x0) / grid.cell), j = Math.floor((y - grid.y0) / grid.cell);
  if (i < 0 || j < 0 || i >= grid.nx || j >= grid.ny) return null;
  return values[j * grid.nx + i];
}
