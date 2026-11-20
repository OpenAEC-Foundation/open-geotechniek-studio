// Leest een los GEF-bestand met een dissipatietest.
//
// Bron: CUR, GEF-CPT-Report (versie 1.1.x), samen met de algemene GEF-taaldefinitie. Een
// dissipatietest staat in een eigen bestand met de tijd als eerste kolom. De kolommen worden
// herkend aan het grootheidnummer uit #COLUMNINFO (kolom, eenheid, naam, nummer):
//   12 tijd [s]   2 conusweerstand [MPa]   5 waterspanning u1 [MPa]   6 u2 [MPa]   7 u3 [MPa]
//   1 sondeerlengte [m] (hooguit als vaste waarde, voor de diepte)
// De koppeling met de sondering staat in #PARENT (bestandsnaam van de sondering, diepte, eenheid);
// ontbreekt de diepte daar, dan geldt een vaste sondeerlengte uit de kolommen, en anders moet de
// gebruiker de diepte invullen. Onbekende kolommen en kopregels worden genegeerd.
import type { DissipationPoint, DissipationTest } from "./types";

export interface GefDissipationFile {
  test: DissipationTest;
  /** Bestandsnaam van de sondering uit #PARENT, als het bestand die noemt. */
  parentFile?: string;
  /** #TESTID van het bestand. */
  testId?: string;
}

const split = (value: string) => value.split(",").map((part) => part.trim());
const number = (value: string | undefined) => {
  const v = Number((value ?? "").replace(",", "."));
  return value != null && value.trim() !== "" && Number.isFinite(v) ? v : undefined;
};
const TIME_FACTOR: Record<string, number> = { s: 1, sec: 1, min: 60, h: 3600, uur: 3600 };
const PRESSURE_FACTOR: Record<string, number> = { mpa: 1, kpa: 0.001, pa: 1e-6, bar: 0.1 };

function headersOf(text: string): { headers: Map<string, string[]>; data: string } {
  const headers = new Map<string, string[]>();
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  let i = 0;
  for (; i < lines.length; i++) {
    const match = /^\s*#\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(lines[i]);
    if (!match) continue;
    const key = match[1].toUpperCase();
    if (key === "EOH") { i++; break; }
    headers.set(key, [...(headers.get(key) ?? []), match[2].trim()]);
  }
  return { headers, data: lines.slice(i).join("\n") };
}

/** Is dit een GEF-bestand met de tijd als eerste kolom (een dissipatietest)? */
export function looksLikeGefDissipation(text: string): boolean {
  const { headers } = headersOf(text.slice(0, 16384));
  if (!headers.has("GEFID") && !headers.has("TESTID")) return false;
  const first = (headers.get("COLUMNINFO") ?? []).map(split).find((parts) => parts[0] === "1");
  if (first && (first[3] === "12" || (first[1] ?? "").toLowerCase() in TIME_FACTOR)) return true;
  return [...(headers.get("REPORTCODE") ?? []), ...(headers.get("PROCEDURECODE") ?? [])].some((code) => /diss/i.test(code));
}

export function parseGefDissipation(text: string, filename: string): GefDissipationFile {
  const { headers, data } = headersOf(text);
  const notes: string[] = [];
  const columns = (headers.get("COLUMNINFO") ?? []).map(split)
    .map((parts) => ({ index: Number(parts[0]), unit: (parts[1] ?? "").toLowerCase(), quantity: Number(parts[3]) }))
    .filter((column) => Number.isInteger(column.index) && column.index > 0);
  if (!columns.length) throw new Error("Geen kolomdefinities (#COLUMNINFO) in het GEF-bestand.");
  // De tijd: grootheid 12, of de eerste kolom als die een tijdseenheid heeft.
  const timeColumn = columns.find((c) => c.quantity === 12) ?? columns.find((c) => c.index === 1 && c.unit in TIME_FACTOR);
  if (!timeColumn) throw new Error("Dit GEF-bestand heeft geen tijdkolom; het is geen dissipatietest.");
  const column = (quantity: number) => columns.find((c) => c.quantity === quantity);
  const channels: Array<[keyof Omit<DissipationPoint, "time">, ReturnType<typeof column>]> =
    [["qc", column(2)], ["u1", column(5)], ["u2", column(6)], ["u3", column(7)]];
  if (!channels.some(([key, c]) => key !== "qc" && c)) throw new Error("Dit GEF-bestand heeft geen kolom met waterspanning (u1, u2 of u3).");
  const lengthColumn = column(1);

  const voids = new Map<number, number>();
  for (const line of headers.get("COLUMNVOID") ?? []) {
    const [index, value] = split(line);
    const v = number(value);
    if (v != null) voids.set(Number(index), v);
  }
  const separator = headers.get("COLUMNSEPARATOR")?.[0]?.trim() || "";
  const recordSeparator = headers.get("RECORDSEPARATOR")?.[0]?.trim() || "";
  const records = recordSeparator ? data.split(recordSeparator) : data.split(/\r?\n/);
  const timeFactor = TIME_FACTOR[timeColumn.unit] ?? 1;
  if (timeColumn.unit && !(timeColumn.unit in TIME_FACTOR)) notes.push(`Tijdseenheid '${timeColumn.unit}' is onbekend; de tijd is als seconden gelezen.`);

  const points: DissipationPoint[] = [];
  const lengths: number[] = [];
  let skipped = 0;
  for (const record of records) {
    if (!record.trim()) continue;
    const cells = (separator ? record.split(separator) : record.trim().split(/[\s;]+/)).map((cell) => cell.trim());
    const value = (c: { index: number } | undefined) => {
      if (!c) return undefined;
      const v = number(cells[c.index - 1]);
      return v == null || v === voids.get(c.index) ? undefined : v;
    };
    const time = value(timeColumn);
    if (time == null || time < 0) { skipped++; continue; }
    const point: DissipationPoint = { time: time * timeFactor };
    for (const [key, c] of channels) {
      const v = value(c);
      if (v != null) point[key] = v * (PRESSURE_FACTOR[c!.unit] ?? 1);
    }
    const length = value(lengthColumn);
    if (length != null) lengths.push(length);
    points.push(point);
  }
  if (!points.length) throw new Error("Het GEF-bestand bevat geen meetwaarden met een geldige tijd.");
  if (skipped) notes.push(`${skipped} regel(s) zonder geldige tijd overgeslagen.`);
  points.sort((a, b) => a.time - b.time);

  // Diepte: uit #PARENT, anders een vaste sondeerlengte uit de kolommen.
  const parent = headers.get("PARENT")?.[0] ? split(headers.get("PARENT")![0]) : undefined;
  let depth = number(parent?.[1]);
  if (depth != null && /^(cm|mm)$/i.test(parent?.[2] ?? "")) depth *= parent![2].toLowerCase() === "cm" ? 0.01 : 0.001;
  if (depth == null && lengths.length) depth = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  if (depth == null) notes.push("De diepte van de test staat niet in het bestand; vul de diepte zelf in.");
  const testId = headers.get("TESTID")?.[0]?.trim() || undefined;
  const date = headers.get("STARTDATE")?.[0] ? split(headers.get("STARTDATE")![0]) : undefined;
  const start = date && date.length >= 3 && date.every((part) => /^\d+$/.test(part))
    ? `${date[0]}-${date[1].padStart(2, "0")}-${date[2].padStart(2, "0")}` : undefined;
  return {
    test: {
      id: `gef-${filename}-${(depth ?? 0).toFixed(2)}`, depth: depth ?? 0, source: "gef", source_file: filename, points,
      ...(start ? { start_time: start } : {}),
      ...(notes.length ? { notes } : {}),
    },
    parentFile: parent?.[0] || undefined,
    testId,
  };
}
