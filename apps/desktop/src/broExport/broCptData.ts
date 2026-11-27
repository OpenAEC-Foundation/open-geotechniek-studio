// Meetreeks van een sondering in de 25 vaste BRO-kolommen, uit wat de lezers per meetpunt bewaren.
import type { Cpt, MeasurementPoint } from "../types/cpt";
import { COLUMN_INDEX, RESULT_COLUMNS } from "./broCptSpec";

export interface BroCptTable {
  /** Eén rij per meetpunt, 25 kolommen; null = geen waarde. */
  rows: (number | null)[][];
  /** Per kolom: is de parameter bepaald (ten minste één waarde)? */
  determined: boolean[];
  /** Wat niet kon worden overgenomen (niet-blokkerend). */
  notes: string[];
}

/**
 * GEF-kwantiteiten (CUR GEF-CPT-Report 1.1.2, #COLUMNINFO) die één op één een BRO-kolom zijn,
 * met de eenheden waarin de bronwaarde zonder omrekening kan worden overgenomen.
 * Sondeerlengte, conusweerstand, wrijving, wrijvingsgetal, u2, hellingresultante en diepte
 * komen uit de al omgerekende velden van het meetpunt en staan hier daarom niet in.
 */
const GEF_EXTRA: Record<number, { key: string; units: string[] }> = {
  5: { key: "u1", units: ["mpa"] },
  7: { key: "u3", units: ["mpa"] },
  9: { key: "inclNs", units: ["deg", "°", "graden", "degrees", "degree"] },
  10: { key: "inclEw", units: ["deg", "°", "graden", "degrees", "degree"] },
  12: { key: "elapsedTime", units: ["s", "sec"] },
  13: { key: "correctedQc", units: ["mpa"] },
  14: { key: "netQc", units: ["mpa"] },
  15: { key: "poreRatio", units: ["-", "", "1"] },
  21: { key: "inclX", units: ["deg", "°", "graden", "degrees", "degree"] },
  22: { key: "inclY", units: ["deg", "°", "graden", "degrees", "degree"] },
  23: { key: "electricCond", units: ["s/m"] },
};
/** Kwantiteiten die via de omgerekende velden van het meetpunt lopen. */
const GEF_CORE = new Set([1, 2, 3, 4, 6, 8, 11]);

const num = (v: number | null | undefined): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function gefColumns(cpt: Cpt): { index: number; unit: string; name: string; quantity: number }[] {
  let headers: Record<string, string[]> = {};
  try { headers = JSON.parse(cpt.metadata.extra?.["ogs:gef-headers"] ?? "{}"); } catch { /* geen GEF-kop */ }
  return (headers.COLUMNINFO ?? []).map((line) => {
    const [index, unit, name, quantity] = line.split(",").map((v) => v.trim());
    return { index: Number(index), unit: unit ?? "", name: name ?? "", quantity: Number(quantity) };
  }).filter((c) => Number.isInteger(c.index) && Number.isInteger(c.quantity));
}

/** Gemeten waarde, ook als de app het punt als voorgeboord heeft gemaskeerd (de bronwaarde blijft dan bewaard). */
const measured = (p: MeasurementPoint, field: "qc" | "fs" | "rf" | "u2"): number | null => num(p[field] ?? p.parameters?.[`source_${field}`]);

export function broCptTable(cpt: Cpt): BroCptTable {
  const notes: string[] = [];
  const first = cpt.points.find((p) => p.parameters)?.parameters ?? {};
  const fromBro = "length" in first && !("column_1" in first);
  const fromGef = "column_1" in first;
  const width = RESULT_COLUMNS.length;
  const set = (row: (number | null)[], key: string, value: number | null) => { row[COLUMN_INDEX[key]] = value; };
  let rows: (number | null)[][];

  if (fromBro) {
    // De BRO-lezer bewaart per meetpunt alle 25 bronkolommen onder dezelfde sleutels.
    rows = cpt.points.map((p) => RESULT_COLUMNS.map((c) => num(p.parameters?.[c.key])));
  } else {
    const columns = fromGef ? gefColumns(cpt) : [];
    const has = (q: number) => columns.some((c) => c.quantity === q);
    const extras = columns.flatMap((c) => {
      const map = GEF_EXTRA[c.quantity];
      if (!map) {
        if (!GEF_CORE.has(c.quantity)) notes.push(`GEF-kolom ${c.index} (${c.name || `kwantiteit ${c.quantity}`}) heeft geen BRO-kolom en wordt niet weggeschreven.`);
        return [];
      }
      if (!map.units.includes(c.unit.toLowerCase().replace(/\s*\(.*\)\s*$/, ""))) {
        notes.push(`GEF-kolom ${c.index} (${c.name}) staat in ${c.unit || "een onbekende eenheid"} en wordt niet weggeschreven.`);
        return [];
      }
      return [{ index: c.index, key: map.key }];
    });
    rows = cpt.points.map((p) => {
      const row: (number | null)[] = Array(width).fill(null);
      const length = num(p.parameters?.penetration_length_m ?? p.parameters?.length);
      set(row, "length", length);
      // Diepte is een eigen kolom als de bron die had, of als ze van de sondeerlengte afwijkt.
      if (!fromGef || has(11) || (length != null && Math.abs(length - p.depth) > 1e-9)) set(row, "depth", num(p.depth));
      set(row, "qc", measured(p, "qc"));
      set(row, "fs", measured(p, "fs"));
      if (!fromGef || has(4)) set(row, "rf", measured(p, "rf"));
      set(row, "u2", measured(p, "u2"));
      set(row, "inclination", num(p.inclination));
      for (const extra of extras) set(row, extra.key, num(p.parameters?.[`column_${extra.index}`]));
      return row;
    });
    // Is de diepte overal gelijk aan de sondeerlengte en had de bron geen dieptekolom, dan is ze niet bepaald.
    if (!fromGef && rows.every((r) => r[COLUMN_INDEX.depth] === r[COLUMN_INDEX.length])) for (const r of rows) set(r, "depth", null);
  }
  return { rows, determined: RESULT_COLUMNS.map((_, i) => rows.some((r) => r[i] != null)), notes };
}

/** Getal met het aantal decimalen van de catalogus; -0 wordt 0. */
export function formatMeasure(value: number, decimals: number): string {
  const text = value.toFixed(decimals);
  return /^-0(\.0+)?$/.test(text) ? text.slice(1) : text;
}
