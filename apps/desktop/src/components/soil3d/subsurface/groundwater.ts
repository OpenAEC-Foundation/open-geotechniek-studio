// Grondwater uit de BRO: peilbuizen (GMW) met filterdiepte via de PDOK OGC API, meetreeksen (GLD) als CSV.
// Per filter: gemiddelde, uitersten, laatste meting en een benadering van GHG en GLG (gemiddelde van de drie hoogste
// en laagste standen per volledig gemeten hydrologisch jaar, april tot en met maart). In welk pakket een filter staat, volgt uit de
// filterhoogte en de pakketten van REGIS.
import type { Bbox } from "./regis";

const PDOK = "https://api.pdok.nl/tno/bro-grondwatermonitoring-in-samenhang-karakteristieken/ogc/v1/collections";
const BRO_CSV = "https://publiek.broservices.nl/gm/gld/v1/objectsAsCsv";
const CRS = encodeURIComponent("http://www.opengis.net/def/crs/EPSG/0/28992");

export interface WellStats {
  n: number;
  first: string;
  last: string;
  mean: number;
  min: number;
  max: number;
  lastValue: number;
  /** Gemiddelde over de laatste vijf jaar met metingen. */
  recentMean: number;
  /** Benadering van GHG en GLG (gemiddeld hoogste en laagste grondwaterstand), null bij te weinig jaren. */
  ghg: number | null;
  glg: number | null;
  years: number;
}
export interface Well {
  /** GMW-nummer met buisnummer, bijv. GMW000000019798-1. */
  id: string;
  broId: string;
  tube: number;
  x: number;
  y: number;
  /** Bovenkant en onderkant filter [m NAP]. */
  screenTop: number | null;
  screenBottom: number | null;
  gld: string[];
  stats: WellStats | null;
  /** Watervoerend pakket van het filter (1, 2, …); 0 = deklaag; null = onbekend. */
  aquifer: number | null;
}

export function expand(b: Bbox, m: number): Bbox {
  return { xmin: b.xmin - m, ymin: b.ymin - m, xmax: b.xmax + m, ymax: b.ymax + m };
}

const bboxQuery = (b: Bbox) => `bbox=${[b.xmin, b.ymin, b.xmax, b.ymax].map((v) => Math.round(v)).join(",")}&bbox-crs=${CRS}&crs=${CRS}`;

interface Feature { properties: Record<string, unknown>; geometry: { coordinates: [number, number] } | null }

async function features(collection: string, b: Bbox, signal?: AbortSignal): Promise<Feature[]> {
  const r = await fetch(`${PDOK}/${collection}/items?f=json&limit=200&${bboxQuery(b)}`, { signal });
  if (!r.ok) throw new Error(`Grondwatergegevens niet bereikbaar (${r.status}).`);
  return ((await r.json()) as { features?: Feature[] }).features ?? [];
}

/** Meetreeks uit het compacte CSV-formaat: regels "tijdstip","stand",… met de stand in m NAP. */
export function parseGldCsv(text: string): { t: Date; v: number }[] {
  const out: { t: Date; v: number }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^"(\d{4}-\d{2}-\d{2}T[^"]+)","(-?[\d.]+)"/.exec(line);
    if (!m) continue;
    const t = new Date(m[1]), v = Number(m[2]);
    if (!Number.isNaN(t.getTime()) && Number.isFinite(v)) out.push({ t, v });
  }
  return out.sort((a, b) => a.t.getTime() - b.t.getTime());
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function seriesStats(series: { t: Date; v: number }[]): WellStats | null {
  if (!series.length) return null;
  const vs = series.map((s) => s.v);
  const last = series[series.length - 1];
  const fiveYearsBefore = new Date(last.t);
  fiveYearsBefore.setFullYear(fiveYearsBefore.getFullYear() - 5);
  // Hydrologisch jaar: 1 april tot en met 31 maart.
  // Alleen jaren met metingen in minstens tien maanden tellen mee, zodat een half jaar het beeld niet scheeftrekt.
  const byYear = new Map<number, { v: number[]; months: Set<number> }>();
  for (const s of series) {
    const y = s.t.getMonth() >= 3 ? s.t.getFullYear() : s.t.getFullYear() - 1;
    const e = byYear.get(y) ?? { v: [], months: new Set<number>() };
    e.v.push(s.v); e.months.add(s.t.getMonth());
    byYear.set(y, e);
  }
  const years = [...byYear.entries()].filter(([, e]) => e.months.size >= 10).map(([y, e]) => [y, e.v] as const).sort((a, b) => a[0] - b[0]).slice(-8);
  const hi = years.map(([, v]) => mean([...v].sort((a, b) => b - a).slice(0, 3)));
  const lo = years.map(([, v]) => mean([...v].sort((a, b) => a - b).slice(0, 3)));
  return {
    n: series.length,
    first: series[0].t.toISOString().slice(0, 10),
    last: last.t.toISOString().slice(0, 10),
    mean: mean(vs),
    min: Math.min(...vs),
    max: Math.max(...vs),
    lastValue: last.v,
    recentMean: mean(series.filter((s) => s.t >= fiveYearsBefore).map((s) => s.v)),
    ghg: years.length >= 3 ? mean(hi) : null,
    glg: years.length >= 3 ? mean(lo) : null,
    years: years.length,
  };
}

/** Peilbuizen met filter in het gebied, met de statistiek van hun meetreeksen (de dichtstbijzijnde `maxSeries`). */
export async function fetchWells(b: Bbox, center: { x: number; y: number }, maxSeries = 12, signal?: AbortSignal): Promise<Well[]> {
  const [tubes, glds] = await Promise.all([features("gm_gmw_monitoringtube", b, signal), features("gm_gld", b, signal)]);
  const gldByTube = new Map<number, string[]>();
  for (const g of glds) {
    const fk = Number(g.properties.gm_gmw_monitoringtube_fk), id = String(g.properties.bro_id ?? "");
    if (id) gldByTube.set(fk, [...(gldByTube.get(fk) ?? []), id]);
  }
  const wells: Well[] = tubes.filter((f) => f.geometry).map((f) => {
    const p = f.properties, [x, y] = f.geometry!.coordinates;
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    return {
      id: `${p.gmw_bro_id}-${p.tube_number}`, broId: String(p.gmw_bro_id), tube: Number(p.tube_number), x, y,
      screenTop: num(p.screen_top_position), screenBottom: num(p.screen_bottom_position),
      gld: gldByTube.get(Number(p.gm_gmw_monitoringtube_pk)) ?? [], stats: null, aquifer: null,
    };
  });
  const dist = (w: Well) => Math.hypot(w.x - center.x, w.y - center.y);
  const measured = wells.filter((w) => w.gld.length).sort((a, c) => dist(a) - dist(c)).slice(0, maxSeries);
  await Promise.all(measured.map(async (w) => {
    try {
      const parts = await Promise.all(w.gld.map(async (id) => {
        const r = await fetch(`${BRO_CSV}/${id}?rapportagetype=compact`, { signal });
        return r.ok ? parseGldCsv(await r.text()) : [];
      }));
      w.stats = seriesStats(parts.flat().sort((a, c) => a.t.getTime() - c.t.getTime()));
    } catch { w.stats = null; }
  }));
  return wells.sort((a, c) => dist(a) - dist(c));
}

/** Pakket van een filter op basis van het midden van het filter. */
export function wellAquifer(screenMid: number | null, packs: { index: number; top: number | null; bottom: number | null }[]): number | null {
  if (screenMid === null || !packs.length) return null;
  for (const p of packs) if (p.top !== null && p.bottom !== null && screenMid <= p.top && screenMid >= p.bottom) return p.index;
  const first = packs.find((p) => p.index === 1);
  if (first?.top !== null && first?.top !== undefined && screenMid > first.top) return 0;
  return null;
}
