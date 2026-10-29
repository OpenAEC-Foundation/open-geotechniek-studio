import { maskPreExcavation } from "./bedrockCompatibility";
import type { Cpt, MeasurementPoint } from "./cpt";
import {
  attachValidation,
  type ValidationReport,
  type Diagnostic,
} from "../validation/report";

/** CUR GEF-CPT-Report 1.1.2, §3.4. Unknown columns and headers are retained. */
const fields: Record<number, string> = {
  1: "penetration_length",
  2: "qc",
  3: "fs",
  4: "rf",
  5: "u1",
  6: "u2",
  7: "u3",
  8: "inclination",
  9: "inclination_ns",
  10: "inclination_ew",
  11: "corrected_depth",
  12: "time",
  13: "corrected_qc",
  14: "net_qc",
  15: "pore_ratio",
  16: "cone_resistance_number",
  17: "unit_weight",
  18: "initial_pore_pressure",
  19: "total_vertical_stress",
  20: "effective_vertical_stress",
  21: "inclination_x",
  22: "inclination_y",
  23: "electric_conductivity",
};
interface Column {
  index: number;
  quantity: number;
  unit: string;
  name: string;
  line: number;
}
export function looksLikeGef(text: string): boolean {
  return /^\s*#(?:GEFID|TESTID)\s*=/im.test(
    text.slice(0, 4096).replace(/^\uFEFF/, ""),
  );
}
export function parseGef(text: string, filename: string): Cpt {
  const report: ValidationReport = {
    format: "GEF-CPT",
    diagnostics: [],
    records: 0,
    points: 0,
    voids: 0,
    omittedRecords: 0,
    measurementVariables: {},
    coordinateSystem: {},
  };
  const diag = (
    severity: Diagnostic["severity"],
    code: string,
    message: string,
    line?: number,
    record?: number,
    column?: number,
  ) =>
    report.diagnostics.push({ severity, code, message, line, record, column });
  if (text.startsWith("\uFEFF")) {
    diag("info", "BOM", "UTF-8 BOM verwijderd.", 1);
    text = text.slice(1);
  }
  if (/[\uFFFD]|Ã[\u0080-\u00BF]|Â[\u0080-\u00BF]/.test(text))
    diag(
      "warning",
      "ENCODING",
      "Mogelijk onjuiste tekencodering; controleer de oorspronkelijke tekst.",
    );
  const lines = text.replace(/\r\n?/g, "\n").split("\n"),
    header = new Map<string, Array<{ value: string; line: number }>>();
  let start = -1;
  const unparsedHeader: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const match = /^\s*#(\w+)\s*=?\s*(.*)$/.exec(lines[i]);
    if (!match) {
      if (lines[i].trim()) {
        unparsedHeader.push(lines[i]);
        diag(
          "warning",
          "HEADER_LINE",
          "Onherkende headerregel bewaard.",
          i + 1,
        );
      }
      continue;
    }
    const key = match[1].toUpperCase();
    if (key === "EOH") {
      start = i + 1;
      break;
    }
    header.set(key, [
      ...(header.get(key) ?? []),
      { value: match[2].trim(), line: i + 1 },
    ]);
  }
  if (start < 0)
    throw new Error("GEF parse-fout: ontbrekende #EOH= terminator");
  const first = (key: string) => header.get(key)?.[0]?.value;
  const extra: Record<string, string> = {};
  if (unparsedHeader.length)
    extra["ogs:unparsed-header"] = unparsedHeader.join("\n");
  for (const [key, values] of header)
    extra[key] = values.map((v) => v.value).join(" | ");
  for (const required of ["GEFID", "TESTID", "COLUMN", "COLUMNINFO"])
    if (!header.has(required))
      diag(
        "error",
        "MISSING_HEADER",
        `Verplichte header #${required} ontbreekt.`,
      );
  const number = (
    raw: string,
    line?: number,
    record?: number,
    column?: number,
  ): number | undefined => {
    let value = raw.trim();
    if (!value) {
      diag(
        "warning",
        "EMPTY_NUMBER",
        "Lege meetwaarde wordt void.",
        line,
        record,
        column,
      );
      return undefined;
    }
    if (/^[-+]?\d{1,3}(\.\d{3})+,\d+$/.test(value)) {
      value = value.replace(/\./g, "").replace(",", ".");
      diag(
        "warning",
        "NUMBER_LOCALE",
        "Duizendtalscheiding en decimale komma omgezet.",
        line,
        record,
        column,
      );
    } else if (/^[-+]?\d{1,3}(,\d{3})+\.\d+$/.test(value)) {
      value = value.replace(/,/g, "");
      diag(
        "warning",
        "NUMBER_LOCALE",
        "Duizendtalscheiding omgezet.",
        line,
        record,
        column,
      );
    } else if (/^[-+]?\d+,\d+(?:[eE][-+]?\d+)?$/.test(value)) {
      value = value.replace(",", ".");
      diag(
        "warning",
        "DECIMAL_COMMA",
        "Decimale komma omgezet.",
        line,
        record,
        column,
      );
    }
    if (
      !/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/.test(value) ||
      !Number.isFinite(Number(value))
    ) {
      diag(
        "warning",
        "INVALID_NUMBER",
        `Ongeldig getal '${raw}' wordt void; kolom blijft behouden.`,
        line,
        record,
        column,
      );
      return undefined;
    }
    return Number(value);
  };
  const columns: Column[] = [];
  const quantities = new Set<number>(),
    indices = new Set<number>();
  for (const item of header.get("COLUMNINFO") ?? []) {
    const parts = item.value.split(",").map((v) => v.trim()),
      index = Number(parts[0]),
      quantity = Number(parts[3]);
    if (!Number.isInteger(index) || index < 1 || !Number.isInteger(quantity)) {
      diag("error", "COLUMNINFO", "Ongeldige kolomdefinitie.", item.line);
      continue;
    }
    if (indices.has(index) || quantities.has(quantity))
      diag(
        "warning",
        "DUPLICATE_QUANTITY",
        "Dubbele kolom of kwantiteit; eerste waarde heeft voorrang.",
        item.line,
        undefined,
        index,
      );
    indices.add(index);
    quantities.add(quantity);
    columns.push({
      index,
      quantity,
      unit: parts[1],
      name: parts[2],
      line: item.line,
    });
    if (!fields[quantity])
      diag(
        "warning",
        "UNKNOWN_COLUMN",
        `Kwantiteit ${quantity} is onbekend; bewaard in parameters.`,
        item.line,
        undefined,
        index,
      );
  }
  const unitFactors = new Map<number, number>();
  for (const col of columns) {
    const unit = col.unit?.trim().toLowerCase().replace(/\s*\(.*\)\s*$/, "");
    const choices: Record<string,number> | undefined = [1,11].includes(col.quantity) ? {m:1,cm:0.01,mm:0.001}
      : [2,3,5,6,7,13,14].includes(col.quantity) ? {mpa:1,kpa:0.001,pa:0.000001}
      : [8,9,10,21,22].includes(col.quantity) ? {deg:1,'°':1,graden:1,degree:1,rad:180/Math.PI}
      : col.quantity===4 ? {'%':1,percent:1,'-':100} : undefined;
    if (!choices) continue;
    const factor=choices[unit];
    unitFactors.set(col.index,factor ?? NaN);
    if(factor===undefined)diag('error','UNKNOWN_UNIT',`Eenheid ${col.unit} voor kwantiteit ${col.quantity} onbekend; alleen oorspronkelijke parameters bewaard.`,col.line,undefined,col.index);
    else if(factor!==1)diag('warning','UNIT_CONVERSION',`Kolom ${col.index}: ${col.unit} omgezet naar interne eenheid met factor ${factor}; oorspronkelijke waarden blijven in parameters.`,col.line,undefined,col.index);
  }
  const interpreted=(col:Column,value:number|undefined):number|undefined=> {
    if(value===undefined)return undefined;
    const factor=unitFactors.get(col.index)??1;
    return Number.isFinite(factor)?value*factor:undefined;
  };
  const voids = new Map<number, number>();
  for (const item of header.get("COLUMNVOID") ?? []) {
    const [col, value] = item.value.split(",");
    const v = number(value ?? "", item.line);
    if (v !== undefined) voids.set(Number(col), v);
  }
  for (const item of header.get("MEASUREMENTVAR") ?? []) {
    const [key, value, unit, ...description] = item.value
      .split(",")
      .map((v) => v.trim());
    report.measurementVariables![key] = {
      value: number(value, item.line) ?? null,
      unit,
      description: description.join(","),
    };
  }
  const xy = first("XYID")
      ?.split(",")
      .map((v) => v.trim()),
    z = first("ZID")
      ?.split(",")
      .map((v) => v.trim());
  report.coordinateSystem = { xy: xy?.[0], z: z?.[0] };
  let x: number | undefined, y: number | undefined, ground: number | undefined;
  if (xy) {
    if (xy[0] === "31000") {
      x = number(xy[1] ?? "");
      y = number(xy[2] ?? "");
    } else
      diag(
        "warning",
        "UNKNOWN_XY_CRS",
        `XYID ${xy[0]} is geen RD (31000); locatie wordt niet stil omgezet.`,
      );
  }
  if (z) {
    if (z[0] === "31000") ground = number(z[1] ?? "");
    else
      diag(
        "warning",
        "UNKNOWN_Z_DATUM",
        `ZID ${z[0]} is geen NAP (31000); hoogte niet als NAP gebruikt.`,
      );
    if (ground === undefined)
      diag("warning", "MISSING_GROUND", "ZID zonder geldige maaiveldhoogte.");
  }
  const declared = Number(first("COLUMN")),
    expected =
      Number.isInteger(declared) && declared > 0
        ? declared
        : Math.max(0, ...columns.map((c) => c.index));
  for (let i = 1; i <= expected; i++)
    if (!indices.has(i))
      diag(
        "warning",
        "MISSING_COLUMNINFO",
        `Kolom ${i} heeft geen COLUMNINFO; ruwe waarde blijft onder column_${i} bewaard.`,
        undefined,
        undefined,
        i,
      );
  let colSep = first("COLUMNSEPARATOR")?.replace(/^['"]|['"]$/g, ""),
    recSep = first("RECORDSEPARATOR")?.replace(/^['"]|['"]$/g, "");
  if (colSep === "\\t" || colSep?.toLowerCase() === "tab") colSep = "\t";
  if (recSep === "\\n") recSep = "\n";
  if (colSep && colSep.length !== 1)
    throw new Error("GEF: COLUMNSEPARATOR moet één teken zijn.");
  if (recSep && recSep.length !== 1)
    throw new Error("GEF: RECORDSEPARATOR moet één teken zijn.");
  const body = lines.slice(start).join("\n"),
    records = body.split(recSep || "\n"),
    points: MeasurementPoint[] = [];
  const ranges = new Map<number, { min: number; max: number }>();
  let line = start + 1,
    previousLength = 0,
    corrected = 0;
  for (const raw of records) {
    const lineAt = line + ((raw.match(/^\s*/)?.[0].match(/\n/g)?.length) ?? 0);
    line +=
      (raw.match(/\n/g)?.length ?? 0) + (recSep === "\n" || !recSep ? 1 : 0);
    let value = raw.trim();
    if (!value) continue;
    report.records++;
    const record = report.records;
    if (!recSep && /[;!*]$/.test(value)) {
      value = value.replace(/[;!*]+$/, "");
      diag(
        "warning",
        "RECORD_TERMINATOR",
        "Niet gedeclareerd eindteken verwijderd.",
        lineAt,
        record,
      );
    }
    const tokens =
      colSep && !/\s/.test(colSep) ? value.split(colSep) : value.split(/\s+/);
    if (colSep && !/\s/.test(colSep) && tokens.length === expected + 1 && tokens[tokens.length - 1].trim() === "") {
      tokens.pop();
      diag("info", "TRAILING_COLUMN_SEPARATOR", "Afsluitend kolomscheidingsteken gelezen als recordopmaak; geen extra meetkolom.", lineAt, record, expected + 1);
    }
    if (tokens.length !== expected)
      diag(
        "error",
        "COLUMN_COUNT",
        `Verwacht ${expected} kolommen, ontvangen ${tokens.length}; ontbrekende velden blijven void.`,
        lineAt,
        record,
      );
    const nums = tokens.map((tok, i) => number(tok, lineAt, record, i + 1));
    for (let i = 0; i < nums.length; i++) {
      const v = nums[i];
      if (v === undefined) continue;
      if (v === -999999 || v === voids.get(i + 1)) {
        nums[i] = undefined;
        report.voids++;
        diag("info", "VOID", "Void-waarde gefilterd.", lineAt, record, i + 1);
      } else {
        const prev = ranges.get(i + 1);
        ranges.set(i + 1, {
          min: Math.min(prev?.min ?? v, v),
          max: Math.max(prev?.max ?? v, v),
        });
      }
    }
    const p: MeasurementPoint = {
      depth: 0,
      parameters: Object.fromEntries(
        nums.map((v, i) => [`column_${i + 1}`, v ?? null]),
      ),
    };
    p.parameters!.source_record=record;
    const seen = new Set<string>();
    for (const col of columns) {
      const v = interpreted(col,nums[col.index - 1]),
        field = fields[col.quantity] ?? `quantity_${col.quantity}`;
      if (!(`${col.quantity}` in p.parameters!))
        p.parameters![`${col.quantity}`] = nums[col.index - 1] ?? null;
      if (v !== undefined && !seen.has(field)) {
        seen.add(field);
        if (["qc", "fs", "rf", "u2", "inclination"].includes(field))
          (p as unknown as Record<string, unknown>)[field] = v;
      }
    }
    const get = (q: number) => {
      const col = columns.find((c) => c.quantity === q);
      return col ? interpreted(col, nums[col.index - 1]) : undefined;
    };
    const measured = get(11),
      length = get(1);
    if(length!==undefined)p.parameters!.penetration_length_m=length;
    let depth = measured ?? length;
    if (depth === undefined) {
      report.omittedRecords++;
      diag(
        "error",
        "MISSING_DEPTH",
        "Record zonder diepte weggelaten.",
        lineAt,
        record,
      );
      continue;
    }
    if (depth < 0) {
      diag(
        "warning",
        "NEGATIVE_DEPTH",
        "Negatieve diepte naar positieve afstand onder maaiveld omgezet.",
        lineAt,
        record,
      );
      depth = Math.abs(depth);
    }
    if (length !== undefined && length < 0 && measured !== undefined)diag("warning","NEGATIVE_PENETRATION","Negatieve sondeerlengte; gecorrigeerde diepte blijft leidend.",lineAt,record,columns.find(c=>c.quantity===1)?.index);
    if (measured !== undefined) {report.depthMethod = "corrected-depth";corrected=depth;previousLength=Math.abs(length??depth);}
    else {
      let angle = get(8);
      const ns = get(9) ?? get(21),
        ew = get(10) ?? get(22);
      if (angle === undefined && ns !== undefined && ew !== undefined)
        angle =
          (Math.atan(
            Math.hypot(
              Math.tan((ns * Math.PI) / 180),
              Math.tan((ew * Math.PI) / 180),
            ),
          ) *
            180) /
          Math.PI;
      if (angle !== undefined && Math.abs(angle) < 90) {
        // The first penetration is a reference-level offset, including any pre-excavation.
        // Only measured intervals after it are corrected (Bedrock/pygef convention).
        corrected = points.length===0 ? depth : corrected + (depth - previousLength) * Math.cos((angle * Math.PI) / 180);
        previousLength = depth;
        depth = corrected;
        report.depthMethod = "inclination-corrected";
      } else {
        if (columns.some(c=>[8,9,10,21,22].includes(c.quantity)))
          diag(
            "warning",
            "MISSING_INCLINATION",
            "Helling ontbreekt of is ongeldig; dit interval is verticaal aangenomen.",
            lineAt,
            record,
          );
        corrected += depth - previousLength;
        previousLength = depth;
        depth = corrected;
        report.depthMethod = "penetration-length";
      }
    }
    p.depth = depth;
    if (ground !== undefined) p.depth_nap = ground - depth;
    if (
      p.rf === undefined &&
      p.qc !== undefined &&
      p.fs !== undefined &&
      p.qc > 0
    )
      p.rf = (100 * p.fs) / p.qc;
    if (points.length && depth < points[points.length - 1].depth)
      diag(
        "warning",
        "DEPTH_ORDER",
        "Diepte neemt af; bronvolgorde blijft behouden.",
        lineAt,
        record,
      );
    points.push(p);
  }
  if (report.depthMethod === "inclination-corrected")
    diag(
      "warning",
      "INCLINATION_CORRECTION",
      "Diepte geïntegreerd uit sondeerlengte en hellingresultante; controleer de meetmethode.",
    );
  const count = Number(first("LASTSCAN"));
  if (first("LASTSCAN") && count !== report.records)
    diag(
      "warning",
      "LASTSCAN",
      `LASTSCAN ${count} wijkt af van ${report.records} records.`,
    );
  for (const item of header.get("COLUMNMINMAX") ?? []) {
    const [col, min, max] = item.value.split(",").map(Number),
      range = ranges.get(col);
    if (
      range &&
      (Math.abs(range.min - min) > 1e-6 || Math.abs(range.max - max) > 1e-6)
    )
      diag(
        "warning",
        "COLUMNMINMAX",
        `Kolom ${col}: gemeten min/max wijkt af van de header.`,
        item.line,
        undefined,
        col,
      );
  }
  const preVariable=report.measurementVariables?.["13"];
  const preFactor=preVariable ? ({m:1,cm:0.01,mm:0.001} as Record<string,number>)[preVariable.unit.trim().toLowerCase().replace(/\s*\(.*\)\s*$/, "")] : undefined;
  const preDepth=preVariable?.value!=null && preFactor!=null ? preVariable.value*preFactor:undefined;
  if(preVariable && preFactor==null)diag('error','UNKNOWN_PRE_EXCAVATION_UNIT',`Voorontgravingsdiepte met onbekende eenheid ${preVariable.unit} alleen als bronwaarde bewaard.`);
  const masked=maskPreExcavation(points,preDepth,"penetration");
  for(const record of masked.masked)diag("info","PRE_EXCAVATED","Meetkanalen in voorontgraven grond gemaskeerd; oorspronkelijke waarden blijven in parameters.",undefined,record);
  report.points = points.length;
  const date = (first("STARTDATE") ?? first("FILEDATE"))
    ?.split(",")
    .map((v) => v.trim().padStart(2, "0"))
    .join("-");
  return attachValidation(
    {
      id: first("TESTID") ?? "Unknown",
      metadata: {
        pre_excavated_depth_m:
          preDepth,
        removed_layers: (header.get("SPECIMENVAR") ?? []).flatMap((item) => {
          const parts = item.value.split(","),
            bottom = number(parts[1] ?? "", item.line);
          return bottom === undefined
            ? []
            : [
                {
                  bottom_depth_m: bottom,
                  description: parts.slice(3).join(",").trim(),
                },
              ];
        }),
        quality_regime:(header.get("MEASUREMENTTEXT")??[]).find(item=>item.value.split(",")[0].trim()==="115")?.value.split(",")[1]?.trim(),
        source_file: filename,
        project_name: first("PROJECTNAME"),
        project_number: first("PROJECTID"),
        date,
        equipment: first("COMPANYID")?.split(",")[0],
        ground_level_nap: ground,
        extra,
      },
      position:
        x !== undefined && y !== undefined
          ? { x_rd: x, y_rd: y, z_nap: ground }
          : undefined,
      points:masked.points,
    },
    report,
  );
}
