// Coördinatenbestand van de landmeter of het sondeerbedrijf: per sondering x, y en optioneel de maaiveldhoogte.
// Vult de positie van sonderingen aan zonder de bronbestanden te wijzigen.
import type { Cpt } from "../types/cpt";

export interface CoordinateRow { id: string; x: number; y: number; z?: number }
export interface CoordinateMatch { cptId: string; row: CoordinateRow }
export interface CoordinateResult {
  rows: CoordinateRow[];
  matches: CoordinateMatch[];
  /** Regels zonder sondering in het project. */
  unmatched: string[];
  /** Sonderingen die niet in het bestand staan. */
  missing: string[];
  /** Regels die niet te lezen waren. */
  skipped: number;
}

const num = (text: string) => {
  const t = text.trim().replace(/\s/g, "");
  // 74.571,20 of 74571,20 of 74571.20
  const normal = /,\d+$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t;
  const v = Number(normal);
  return normal !== "" && Number.isFinite(v) ? v : null;
};

/** Leest regels "naam;x;y[;z]" met ;, tab of komma als scheiding. Een kopregel wordt overgeslagen. */
export function parseCoordinates(text: string): { rows: CoordinateRow[]; skipped: number } {
  const rows: CoordinateRow[] = [];
  let skipped = 0, first = true;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const sep = line.includes(";") ? ";" : line.includes("\t") ? "\t" : /\s{2,}/.test(line) && !line.includes(",") ? /\s+/ : ",";
    const parts = line.split(sep).map((p) => p.trim());
    const x = parts.length >= 3 ? num(parts[1]) : null, y = parts.length >= 3 ? num(parts[2]) : null;
    const isFirst = first;
    first = false;
    if (!parts[0] || x === null || y === null) {
      // Een kopregel ("naam;x;y") bovenaan is geen fout.
      if (!(isFirst && x === null && y === null)) skipped++;
      continue;
    }
    const z = parts.length >= 4 ? num(parts[3]) : null;
    rows.push({ id: parts[0], x, y, ...(z !== null ? { z } : {}) });
  }
  return { rows, skipped };
}

/** Vergelijkbare naam: zonder hoofdletters, spaties, voorloopnullen en voorvoegsels als S, CPT of DKM. */
export function normalizeId(id: string): string {
  const base = id.trim().toLowerCase().replace(/\.(gef|xml)$/, "");
  const tail = base.match(/(\d+)\D*$/);
  const bare = base.replace(/[\s_\-.]/g, "");
  return /^(s|cpt|dkm|skm|sond|sondering)?0*\d+$/.test(bare) && tail ? String(Number(tail[1])) : bare;
}

export function matchCoordinates(rows: CoordinateRow[], cpts: Cpt[], skipped = 0): CoordinateResult {
  const byExact = new Map(rows.map((r) => [r.id.trim().toLowerCase(), r]));
  const byLoose = new Map<string, CoordinateRow | null>();
  // Een losse naam die twee keer voorkomt is dubbelzinnig en telt niet.
  for (const r of rows) { const k = normalizeId(r.id); byLoose.set(k, byLoose.has(k) ? null : r); }
  const used = new Set<CoordinateRow>();
  const matches: CoordinateMatch[] = [], missing: string[] = [];
  for (const c of cpts) {
    const names = [c.id, c.metadata.source_file ?? ""].filter(Boolean);
    const row = names.map((n) => byExact.get(n.trim().toLowerCase())).find(Boolean)
      ?? names.map((n) => byLoose.get(normalizeId(n)) ?? undefined).find(Boolean)
      // Bestandsnaam met een volgnummer aan het eind, zoals 24150_12.GEF.
      ?? names.map((n) => { const m = n.replace(/\.[a-z]+$/i, "").match(/(\d+)$/); return m ? byLoose.get(String(Number(m[1]))) ?? undefined : undefined; }).find(Boolean);
    if (row && !used.has(row)) { used.add(row); matches.push({ cptId: c.id, row }); } else missing.push(c.id);
  }
  return { rows, matches, missing, skipped, unmatched: rows.filter((r) => !used.has(r)).map((r) => r.id) };
}

/** De sondering met de nieuwe positie; de maaiveldhoogte alleen als het bestand die geeft. */
export function withPosition(cpt: Cpt, row: CoordinateRow): Cpt {
  const z = row.z ?? cpt.metadata.ground_level_nap ?? cpt.position?.z_nap;
  return {
    ...cpt,
    position: { ...cpt.position, x_rd: row.x, y_rd: row.y, ...(z !== undefined ? { z_nap: z } : {}) } as Cpt["position"],
    metadata: row.z !== undefined ? { ...cpt.metadata, ground_level_nap: row.z } : cpt.metadata,
  };
}
