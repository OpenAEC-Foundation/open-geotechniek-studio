import i18next from "i18next";
import type { Cpt } from "./cpt";

const m = (key: string, nl: string, vars?: Record<string, unknown>) =>
  i18next.t(`import:${key}`, { defaultValue: nl, ...vars }) as string;

/** Eén meting van een dissipatietest: tijd in s, conusweerstand en waterspanning in MPa. */
export interface DissipationPoint {
  t: number;
  qc?: number;
  u?: number;
}

/**
 * Dissipatietest uit een GEF-DISS-bestand: het verloop van de waterspanning in de tijd terwijl de conus
 * stilstaat op één diepte. Hoort bij een sondering (#PARENT).
 */
export interface DissipationTest {
  id: string;
  source_file: string;
  /** Bestandsnaam van de sondering waar de test bij hoort. */
  parent_file?: string;
  /** Sondeerlengte waarop de test is gedaan, in m. */
  depth_m?: number;
  date?: string;
  /** Waterspanningskanaal: u1 (conuspunt), u2 (achter de conus) of u3. */
  u_channel?: "u1" | "u2" | "u3";
  points: DissipationPoint[];
}

export const DISSIPATION_KEY = "ogs:dissipation-tests";

export function looksLikeGefDissipation(text: string): boolean {
  return /^\s*#REPORTCODE\s*=\s*GEF-DISS/im.test(text.slice(0, 8192));
}

/** Bestandsnaam die op een dissipatietest wijst, zoals `S01_DIS_01.gef`. */
export const isDissipationName = (name: string) => /(^|[\s_.-])diss?([\s_.\d-]|$)/i.test(name.split(/[\\/]/).pop() ?? name);

/** Dissipatietests achteraan, zodat ze bij het openen van meerdere bestanden de sondering al vinden. */
export function dissipationLast<T>(items: T[], name: (item: T) => string): T[] {
  return [...items].sort((a, b) => Number(isDissipationName(name(a))) - Number(isDissipationName(name(b))));
}

const TIME: Record<string, number> = { s: 1, sec: 1, sek: 1, min: 60, h: 3600, uur: 3600 };
const PRESSURE: Record<string, number> = { mpa: 1, kpa: 0.001, pa: 0.000001 };

export function parseGefDissipation(text: string, filename: string): DissipationTest {
  const lines = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");
  const header = new Map<string, string[]>();
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const match = /^\s*#(\w+)\s*=?\s*(.*)$/.exec(lines[i]);
    if (!match) continue;
    const key = match[1].toUpperCase();
    if (key === "EOH") { start = i + 1; break; }
    header.set(key, [...(header.get(key) ?? []), match[2].trim()]);
  }
  if (start < 0) throw new Error(m("gef.missingEoh", "GEF parse-fout: ontbrekende #EOH= terminator"));
  const first = (key: string) => header.get(key)?.[0];

  // Kolommen op GEF-kwantiteit: 12 tijd, 2 conusweerstand, 5/6/7 waterspanning u1/u2/u3.
  const columns = new Map<number, { index: number; factor?: number }>();
  for (const value of header.get("COLUMNINFO") ?? []) {
    const parts = value.split(",").map((p) => p.trim());
    const index = Number(parts[0]), quantity = Number(parts[3]);
    if (!Number.isInteger(index) || !Number.isInteger(quantity)) continue;
    const unit = (parts[1] ?? "").toLowerCase();
    const factor = quantity === 12 ? TIME[unit] : [2, 5, 6, 7].includes(quantity) ? PRESSURE[unit] : undefined;
    columns.set(quantity, { index, factor });
  }
  const time = columns.get(12);
  const uQuantity = [5, 6, 7].find((q) => columns.has(q));
  if (!time || uQuantity === undefined)
    throw new Error(m("gef.dissipationColumns", "{{file}}: dissipatietest zonder tijd- of waterspanningskolom.", { file: filename }));
  for (const [quantity, col] of columns)
    if ((quantity === 12 || quantity === 2 || quantity === uQuantity) && col.factor === undefined)
      throw new Error(m("gef.dissipationUnit", "{{file}}: onbekende eenheid in kolom {{column}}.", { file: filename, column: col.index }));

  const voids = new Map<number, number>();
  for (const value of header.get("COLUMNVOID") ?? []) {
    const [col, v] = value.split(",").map((p) => Number(p.trim()));
    if (Number.isFinite(col) && Number.isFinite(v)) voids.set(col, v);
  }
  const columnSeparator = first("COLUMNSEPARATOR");
  const recordSeparator = first("RECORDSEPARATOR");
  const read = (values: string[], quantity: number): number | undefined => {
    const col = columns.get(quantity);
    if (!col || col.factor === undefined) return undefined;
    const value = Number(values[col.index - 1]);
    if (!Number.isFinite(value) || voids.get(col.index) === value) return undefined;
    return value * col.factor;
  };
  const points: DissipationPoint[] = [];
  for (const line of lines.slice(start)) {
    let row = line.trim();
    if (!row) continue;
    if (recordSeparator && row.endsWith(recordSeparator)) row = row.slice(0, -recordSeparator.length).trim();
    const values = columnSeparator ? row.split(columnSeparator).map((v) => v.trim()) : row.split(/\s+/);
    const t = read(values, 12);
    if (t === undefined) continue;
    points.push({ t, qc: read(values, 2), u: read(values, uQuantity) });
  }
  if (!points.some((p) => p.u !== undefined))
    throw new Error(m("gef.dissipationEmpty", "{{file}}: dissipatietest zonder waterspanningsmetingen.", { file: filename }));

  const parent = first("PARENT")?.split(",").map((p) => p.trim());
  const depth = parent?.[1] ? Number(parent[1]) : NaN;
  const date = first("STARTDATE")?.split(",").map((v) => v.trim().padStart(2, "0")).join("-");
  return {
    id: first("TESTID")?.trim() || filename,
    source_file: filename,
    parent_file: parent?.[0] || undefined,
    depth_m: Number.isFinite(depth) ? depth : undefined,
    date,
    u_channel: uQuantity === 5 ? "u1" : uQuantity === 6 ? "u2" : "u3",
    points,
  };
}

/** Kenmerken van de test: hoogste en laatste waterspanning, en de tijd tot de helft van de afname (t50). */
export interface DissipationSummary {
  u_max: number;
  t_u_max: number;
  u_end: number;
  t_end: number;
  /** Waterspanning halverwege tussen het maximum en de laatste meting. */
  u50: number;
  /** Tijd (vanaf het begin van de test) waarop u50 wordt bereikt, in s; ontbreekt als de waterspanning niet daalt. */
  t50?: number;
}

/**
 * t50 ten opzichte van de laatste meting: dat is een benadering van het evenwicht, dus indicatief als de test
 * kort is gestopt. Bij een stijgend begin (dilatant gedrag) telt de afname vanaf het maximum.
 */
export function summarizeDissipation(test: DissipationTest): DissipationSummary | undefined {
  const pts = test.points.filter((p): p is DissipationPoint & { u: number } => p.u !== undefined);
  if (pts.length < 2) return undefined;
  let peak = 0;
  pts.forEach((p, i) => { if (p.u > pts[peak].u) peak = i; });
  const last = pts[pts.length - 1];
  const u50 = last.u + (pts[peak].u - last.u) / 2;
  let t50: number | undefined;
  if (pts[peak].u - last.u > 1e-6) {
    for (let i = peak + 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      if (a.u >= u50 && b.u <= u50) {
        t50 = b.u === a.u ? a.t : a.t + ((a.u - u50) / (a.u - b.u)) * (b.t - a.t);
        break;
      }
    }
  }
  return { u_max: pts[peak].u, t_u_max: pts[peak].t, u_end: last.u, t_end: last.t, u50, t50 };
}

export function dissipationTestsOf(cpt: Cpt): DissipationTest[] {
  const raw = cpt.metadata.extra?.[DISSIPATION_KEY];
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

/** Voegt de test aan de sondering toe; een test uit hetzelfde bestand wordt vervangen. Gesorteerd op diepte. */
export function withDissipationTest(cpt: Cpt, test: DissipationTest): Cpt {
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const tests = [...dissipationTestsOf(cpt).filter((t) => !same(t.source_file, test.source_file)), test]
    .sort((a, b) => (a.depth_m ?? Infinity) - (b.depth_m ?? Infinity));
  return { ...cpt, metadata: { ...cpt.metadata, extra: { ...cpt.metadata.extra, [DISSIPATION_KEY]: JSON.stringify(tests) } } };
}

const stem = (name: string) => (name.split(/[\\/]/).pop() ?? name).toLowerCase().replace(/\.(gef|xml|ifcgeo)$/i, "");
const compact = (id: string) => id.toLowerCase().replace(/\s+/g, "");

/** Hoort deze test bij de sondering? Op bestandsnaam uit #PARENT, anders op test-id of het begin van de bestandsnaam. */
export function belongsToCpt(test: DissipationTest, cpt: Cpt): boolean {
  const cptFile = stem(cpt.metadata.source_file ?? "");
  if (test.parent_file && cptFile && stem(test.parent_file) === cptFile) return true;
  if (compact(test.id) && compact(test.id) === compact(cpt.id)) return true;
  const own = stem(test.source_file);
  return !!cptFile && own.startsWith(cptFile) && /^[\s_.-]/.test(own.slice(cptFile.length));
}
