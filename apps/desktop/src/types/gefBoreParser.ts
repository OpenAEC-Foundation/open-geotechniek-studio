import {decodeBoreCode,parseSoilCode} from "@bedrock-engineer/gef-parser/bore-codes";
import type { Bore, BoreLayer } from "./bore";

// CUR GEF-BORE-Report 1.0.0, sections 2.2 / 2.3 and examples in section 3.
// https://publicwiki.deltares.nl/download/attachments/102204318/GEF-Bore.pdf
export function looksLikeGefBore(content: string): boolean {
  const header = content.split(/^\s*#EOH\s*=?\s*$/im)[0];
  return /^\s*#(?:REPORTCODE|PROCEDURECODE)\s*=\s*GEF-BORE(?:-Report)?\b/im.test(header);
}

function unquote(value: string): string {
  return value.trim().replace(/^['"‘’]|['"‘’]$/g, "").trim();
}


export function parseGefBore(content: string, filename: string): Bore {
  if (!looksLikeGefBore(content)) throw new Error("Geen GEF-BORE-bestand.");
  const end = /^\s*#EOH\s*=?[^\S\r\n]*$/im.exec(content);
  if (!end) throw new Error("GEF-boring mist #EOH.");
  const header = new Map<string, string[]>();
  for (const line of content.slice(0, end.index).split(/\r?\n/)) {
    const match = /^\s*#(\w+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1].toUpperCase();
    header.set(key, [...(header.get(key) ?? []), match[2].trim()]);
  }
  const first = (key: string) => header.get(key)?.[0];
  const parts = (value?: string) => value?.split(",").map(v => v.trim()) ?? [];
  const text = new Map((header.get("MEASUREMENTTEXT") ?? []).map(v => { const p = parts(v); return [Number(p[0]), p[1]]; }));
  const columns = (header.get("COLUMNINFO") ?? []).map(v => {
    const p = parts(v);
    return { index: Number(p[0]) - 1, unit: p[1], label: p[2] ?? "", quantity: Number(p[3]) };
  });
  // Explicit labels resolve the inconsistent quantity-1 example in section 2.2.1.10.
  const top = columns.find(c => /bovenkant|top|upper/i.test(c.label)) ?? columns.find(c => c.quantity === 1);
  const base = columns.find(c => /onderkant|bottom|base|lower/i.test(c.label)) ?? columns.find(c => c.quantity === 2);
  if (!top || !base || top.index === base.index) throw new Error("GEF-boring mist kolommen voor boven- en onderkant laag.");
  const factor = (unit: string) => unit === "m" ? 1 : unit === "cm" ? 0.01 : unit === "mm" ? 0.001 : NaN;
  if (!Number.isFinite(factor(top.unit)) || !Number.isFinite(factor(base.unit))) throw new Error("Onbekende diepte-eenheid in GEF-boring.");
  const count = Number(first("COLUMN") ?? columns.length);
  const colSep = unquote(first("COLUMNSEPARATOR") ?? ";");
  const recSep = unquote(first("RECORDSEPARATOR") ?? "!");
  const voids = new Map((header.get("COLUMNVOID") ?? []).map(v => { const p = parts(v); return [Number(p[0]) - 1, Number(p[1])]; }));
  const body = content.slice(end.index + end[0].length);
  const records = recSep ? body.split(recSep) : body.split(/\r?\n/);
  const layers: BoreLayer[] = [];
  for (const record of records) {
    if (!record.trim()) continue;
    const values = colSep ? record.trim().split(colSep) : record.trim().split(/\s+/);
    const topRaw = Number(values[top.index]?.trim().replace(",", "."));
    const baseRaw = Number(values[base.index]?.trim().replace(",", "."));
    const topDepth = topRaw * factor(top.unit), baseDepth = baseRaw * factor(base.unit);
    const description = unquote(values.slice(count).join(colSep).replace(/;\s*$/, ""));
    if (!values[top.index]?.trim() || !values[base.index]?.trim() || !Number.isFinite(topDepth) || !Number.isFinite(baseDepth) ||
        topDepth < 0 || baseDepth <= topDepth || topDepth < (layers[layers.length - 1]?.base_depth ?? 0) ||
        voids.get(top.index) === topRaw || voids.get(base.index) === baseRaw || !description) {
      throw new Error(`Ongeldige laag ${layers.length + 1} in GEF-boring: controleer diepten en grondbeschrijving.`);
    }
    const code = description.split(";")[0].trim(),classification=parseSoilCode(code);
    layers.push({ top_depth: topDepth, base_depth: baseDepth, soil_name: decodeBoreCode(code), description, soil_code:code,
      classification:{system:"NEN5104",...classification} });
  }
  if (!layers.length) throw new Error("GEF-boring bevat geen lagen.");
  const xy = parts(first("XYID")), z = parts(first("ZID")), project = parts(first("PROJECTID"));
  const position = Number(xy[0]) === 31000 && xy.length >= 3 && Number.isFinite(Number(xy[1])) && Number.isFinite(Number(xy[2]))
    ? { x_rd: Number(xy[1]), y_rd: Number(xy[2]), z_nap: Number(z[0]) === 31000 && z[1] && Number.isFinite(Number(z[1])) ? Number(z[1]) : undefined }
    : undefined;
  return {
    id: first("TESTID") || filename.replace(/\.gef$/i, ""), position,
    final_depth: layers[layers.length - 1].base_depth, layers,
    metadata: { source_file: filename, project_name: project[0], project_number: project[1],
      start_date: text.get(16) ?? text.get(2), description_date: text.get(5), end_date: text.get(19),
      bore_method: text.get(31), description_procedure: parts(first("MEASUREMENTCODE"))[0],
      extra: Object.fromEntries([...header].map(([key, values]) => [key, values.join(" | ")])) },
  };
}
