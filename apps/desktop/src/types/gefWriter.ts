import { APP_VERSION } from "../version";
import type { Cpt, MeasurementPoint } from "./cpt";
import { validationOf } from "../validation/report";
interface Column {
  quantity: number;
  unit: string;
  name: string;
  sourceIndex?: number;
  factor: number;
}
const clean = (value: unknown) => {
  const text = String(value ?? "");
  if (/[\r\n]/.test(text))
    throw new Error(
      "GEF-header bevat een regeleinde; exporteer een JSON-snapshot om de volledige tekst te bewaren.",
    );
  return text;
};
const canonical = (
  quantity: number,
  rawUnit: string,
): { unit: string; factor: number } => {
  const value = rawUnit
    .trim()
    .toLowerCase()
    .replace(/\s*\(.*\)\s*$/, "");
  const choices: [number[], string, Record<string, number>][] = [
    [[1, 11], "m", { m: 1, cm: 0.01, mm: 0.001 }],
    [[2, 3, 5, 6, 7, 13, 14], "MPa", { mpa: 1, kpa: 0.001, pa: 0.000001 }],
    [[4], "%", { "%": 1, percent: 1, "-": 100 }],
    [
      [8, 9, 10, 21, 22],
      "deg",
      { deg: 1, "°": 1, graden: 1, degree: 1, rad: 180 / Math.PI },
    ],
  ];
  const group = choices.find(([numbers]) => numbers.includes(quantity));
  if (!group) return { unit: rawUnit, factor: 1 };
  if (group[2][value] == null)
    throw new Error(
      `Onbekende eenheid ${rawUnit} voor kwantiteit ${quantity}; GEF-export gestopt.`,
    );
  return { unit: group[1], factor: group[2][value] };
};
/** CUR GEF-CPT-Report 1.1.2 export. Original numeric columns are retained when
 * their source layout exists; normalized CPT snapshots expose the core channels.
 * Refuse ambiguous/invalid source layouts instead of claiming a complete export. */
export function exportGef(cpt: Cpt): { text: string; warnings: string[] } {
  const validation = validationOf(cpt),
    warnings: string[] = [];
  if (
    !cpt.id?.trim() ||
    !cpt.points.length ||
    cpt.points.some((p) => !Number.isFinite(p.depth) || p.depth < 0)
  )
    throw new Error(
      "GEF-export vereist een id en eindige niet-negatieve meetdiepten.",
    );
  if (
    validation?.diagnostics.some(
      (d) => d.severity === "error" || d.code === "INVALID_NUMBER",
    ) ||
    validation?.omittedRecords
  )
    throw new Error(
      "Herstel de bronfouten en weggelaten records vóór GEF-export. Gebruik een JSON-snapshot om de herstelgegevens te bewaren.",
    );
  const extra = cpt.metadata.extra ?? {};
  let original: Record<string, string[]> = {};
  if (extra["ogs:gef-headers"]) original = JSON.parse(extra["ogs:gef-headers"]);
  else
    for (const [key, value] of Object.entries(extra))
      if (/^[A-Z][A-Z0-9_]*$/.test(key)) original[key] = value.split(" | ");
  const columns: Column[] = (original.COLUMNINFO ?? [])
    .map((value) => {
      const [index, unit, name, quantity] = value
          .split(",")
          .map((v) => v.trim()),
        q = Number(quantity),
        i = Number(index);
      if (
        !Number.isInteger(q) ||
        q < 1 ||
        q > 23 ||
        !Number.isInteger(i) ||
        i < 1
      )
        throw new Error(
          "Onbekende of ongeldige GEF-bronkolom; volledige gegevens blijven beschikbaar als JSON-snapshot.",
        );
      return {
        quantity: q,
        name: clean(name),
        sourceIndex: i,
        ...canonical(q, unit),
      };
    })
    .sort((a, b) => a.sourceIndex! - b.sourceIndex!);
  if (columns.length) {
    if (new Set(columns.map((col) => col.quantity)).size !== columns.length)
      throw new Error(
        "Dubbele GEF-kwantiteit; export als JSON-snapshot om alle bronkolommen te bewaren.",
      );
    if (!columns.some((col) => col.quantity === 1))
      throw new Error("GEF-export mist de oorspronkelijke sondeerlengte.");
    if (columns.some((col, index) => col.sourceIndex !== index + 1))
      throw new Error("Dubbele of ontbrekende GEF-bronkolom; export gestopt.");
    if (!columns.some((col) => col.quantity === 11))
      columns.push({
        quantity: 11,
        name: "gecorrigeerde diepte",
        unit: "m",
        factor: 1,
      });
  } else {
    columns.push(
      { quantity: 1, name: "sondeerlengte", unit: "m", factor: 1 },
      { quantity: 2, name: "conusweerstand", unit: "MPa", factor: 1 },
      { quantity: 3, name: "plaatselijke wrijving", unit: "MPa", factor: 1 },
      { quantity: 4, name: "wrijvingsgetal", unit: "%", factor: 1 },
      { quantity: 6, name: "waterspanning u2", unit: "MPa", factor: 1 },
      { quantity: 8, name: "hellingresultante", unit: "deg", factor: 1 },
      { quantity: 11, name: "gecorrigeerde diepte", unit: "m", factor: 1 },
    );
    warnings.push(
      "Genormaliseerde GEF-export van kernmeetkanalen. Gebruik de JSON-snapshot voor alle oorspronkelijke BRO-velden en provenance.",
    );
  }
  const sourceValue = (point: MeasurementPoint, col: Column): number | null => {
    if (col.quantity === 11) return point.depth;
    if (col.sourceIndex != null) {
      const value = point.parameters?.[`column_${col.sourceIndex}`];
      if (value === undefined)
        throw new Error(
          "Oorspronkelijke kolomwaarden ontbreken; export als JSON-snapshot.",
        );
      return value == null ? null : value * col.factor;
    }
    if (col.quantity === 1) {
      const length =
        point.parameters?.penetration_length_m ?? point.parameters?.length;
      return length ?? point.depth;
    }
    const field = (
      { 2: "qc", 3: "fs", 4: "rf", 6: "u2", 8: "inclination" } as const
    )[col.quantity as 2 | 3 | 4 | 6 | 8];
    return field
      ? (point[field] ?? point.parameters?.[`source_${field}`] ?? null)
      : null;
  };
  const rows = cpt.points.map((point) =>
    columns.map((col) => sourceValue(point, col)),
  );
  if (
    rows.some((row) =>
      row.some((value) => value != null && !Number.isFinite(value)),
    )
  )
    throw new Error("GEF-export bevat een niet-eindige waarde.");
  const headers: string[] = ["#GEFID= 1, 1, 0"];
  const header = (name: string, value: unknown) =>
    headers.push(`#${name}= ${clean(value)}`);
  header("COLUMN", columns.length);
  columns.forEach((col, index) => {
    header(
      "COLUMNINFO",
      `${index + 1}, ${clean(col.unit)}, ${col.name}, ${col.quantity}`,
    );
    header("COLUMNVOID", `${index + 1}, -999999`);
    const valid = rows
      .map((row) => row[index])
      .filter((v): v is number => v != null);
    if (valid.length)
      header(
        "COLUMNMINMAX",
        `${index + 1}, ${valid.reduce((a, b) => Math.min(a, b))}, ${valid.reduce((a, b) => Math.max(a, b))}`,
      );
  });
  header("COLUMNSEPARATOR", ";");
  header("RECORDSEPARATOR", "!");
  header("LASTSCAN", rows.length);
  header("REPORTCODE", "GEF-CPT-Report, 1, 1, 2");
  header("TESTID", cpt.id);
  header("FILEOWNER", "Open Geotechniek Studio");
  header(
    "PROJECTID",
    cpt.metadata.project_number ?? original.PROJECTID?.[0] ?? "Unknown",
  );
  header("FILEDATE", new Date().toISOString().slice(0, 10).replace(/-/g, ", "));
  const date = cpt.metadata.date;
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date))
    header("STARTDATE", date.replace(/-/g, ", "));
  const replaced = new Set([
    "GEFID",
    "COLUMN",
    "COLUMNINFO",
    "COLUMNVOID",
    "COLUMNMINMAX",
    "COLUMNSEPARATOR",
    "RECORDSEPARATOR",
    "LASTSCAN",
    "REPORTCODE",
    "TESTID",
    "FILEOWNER",
    "FILEDATE",
    "PROJECTID",
    "STARTDATE",
    "XYID",
    "ZID",
    "EOH",
  ]);
  for (const [key, values] of Object.entries(original))
    if (!replaced.has(key) && /^[A-Z][A-Z0-9_]*$/.test(key))
      for (const value of values) {
        if (key === "MEASUREMENTVAR" && /^\s*13\s*,/.test(value)) continue;
        header(key, value);
      }
  if (
    (original.MEASUREMENTVAR ?? []).filter((value) => /^\s*13\s*,/.test(value))
      .length > 1
  )
    throw new Error(
      "Meerdere bronwaarden voor voorontgravingsdiepte; GEF-export gestopt.",
    );
  const pre =
    cpt.metadata.pre_excavated_depth_m ?? cpt.metadata.predrilled_depth_m;
  if (pre != null)
    header("MEASUREMENTVAR", `13, ${pre}, m, voorontgraven of voorgeboord tot`);
  if (cpt.position) {
    header("XYID", `31000, ${cpt.position.x_rd}, ${cpt.position.y_rd}`);
  } else if (original.XYID)
    for (const value of original.XYID) header("XYID", value);
  const z = cpt.position?.z_nap ?? cpt.metadata.ground_level_nap;
  if (z != null) header("ZID", `31000, ${z}`);
  else if (original.ZID) for (const value of original.ZID) header("ZID", value);
  if (original.FILEOWNER)
    header(
      "COMMENT",
      `Oorspronkelijke FILEOWNER: ${original.FILEOWNER.join(" | ")}`,
    );
  if (original.FILEDATE)
    header(
      "COMMENT",
      `Oorspronkelijke FILEDATE: ${original.FILEDATE.join(" | ")}`,
    );
  header(
    "COMMENT",
    `OGS ${APP_VERSION} export; bron ${clean(cpt.metadata.source_file)}; meetpunten ${rows.length}; bronmeldingen ${validation?.diagnostics.length ?? 0}.`,
  );
  warnings.forEach((warning) => header("COMMENT", warning));
  headers.push("#EOH=");
  return {
    text:
      headers.join("\n") +
      "\n" +
      rows
        .map((row) => row.map((value) => value ?? -999999).join(";") + ";!")
        .join("\n") +
      "\n",
    warnings,
  };
}
