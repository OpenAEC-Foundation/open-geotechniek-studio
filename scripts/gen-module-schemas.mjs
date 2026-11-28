// Generates the JSON Schemas of the calculation inputs from the TypeScript types
// of the modules themselves: the input type is the return type of `defaultInput`
// of each headless module (apps/desktop/src/calc/modules/*/headless.ts).
// Output: packages/core/src/generated/schemas.json. Run by build-core.mjs.
//
// Descriptions come from the JSDoc of each field (or a trailing // comment);
// the unit from "[...]" in that text or, failing that, from the name suffix
// (Nap, Mm, Kn, Kpa, ...). Defaults are added at runtime from defaultInput().
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

const root = new URL("../", import.meta.url);
const require = createRequire(new URL("apps/desktop/package.json", root));
const ts = require("typescript");
const modulesDir = fileURLToPath(new URL("apps/desktop/src/calc/modules/", root));

export const MODULE_SOURCES = {
  "pile-bearing-capacity": ["pile-bearing-capacity/headless.ts", "pileHeadless"],
  "tension-pile": ["tension-pile/headless.ts", "tensionHeadless"],
  "laterally-loaded-pile": ["laterally-loaded-pile/headless.ts", "lateralHeadless"],
  "driving-assessment": ["driving-assessment/headless.ts", "drivingHeadless"],
  "spread-foundation": ["spread-foundation/headless.ts", "spreadHeadless"],
  "sheet-pile-wall": ["sheet-pile-wall/headless.ts", "wallHeadless"],
  "foundation-advice": ["foundation-advice/headless.ts", "adviceHeadless"],
  "pad-foundation": ["pad-foundation/headless.ts", "padHeadless"],
  settlement: ["settlement/headless.ts", "settlementHeadless"],
  kalendering: ["kalendering/headless.ts", "kalenderingHeadless"],
};

const SUFFIX_UNITS = [
  [/Nap$/, "m NAP"], [/Cm2PerM$/, "cm²/m"], [/KgPerM2$/, "kg/m²"], [/M2PerM2$/, "m²/m²"], [/KnM2$/, "kNm²"], [/KnM3$/, "kN/m³"],
  // KnM is a moment [kNm] for moments, a line load or reaction [kN/m] otherwise.
  [/(^m[A-Z].*|[Mm]oment.*)KnM$/, "kNm"], [/KnPerM$|KnM$/, "kN/m"], [/Knm$|KnMm$/, "kNm"], [/Kn$/, "kN"], [/Kpa$/, "kPa"], [/Mpa$/, "MPa"],
  [/Mm2$/, "mm²"], [/Mm$/, "mm"], [/M2$/, "m²"], [/Deg$/, "°"], [/Pct$/, "%"], [/Kg$/, "kg"], [/Years$/, "jaar"], [/M$/, "m"],
];

function unitOf(name, text) {
  const m = /\[([^\]]{1,24})\]/.exec(text ?? "");
  if (m && !/^\d/.test(m[1])) return m[1].trim();
  const ex = /^Voorbeeld: [-−]?\d[\d.,]*\s*(kN|kPa|MPa|mm|m|kNm|°)/.exec(text ?? "");
  if (ex) return ex[1];
  // Partial factors and correlation factors are dimensionless (gammaM, xi3, psiM).
  if (/^(gamma|xi|psi|eta)/.test(name) && !/^gamma(Sat|Dry|Wet)?$/.test(name)) return undefined;
  for (const [re, unit] of SUFFIX_UNITS) if (re.test(name)) return unit;
  return undefined;
}

export function generateSchemas() {
  const files = Object.values(MODULE_SOURCES).map(([f]) => path.join(modulesDir, f));
  const program = ts.createProgram(files, {
    target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true, jsx: ts.JsxEmit.ReactJSX, resolveJsonModule: true, allowImportingTsExtensions: true, noEmit: true, skipLibCheck: true,
  });
  const checker = program.getTypeChecker();
  const out = {};
  for (const [id, [file, exportName]] of Object.entries(MODULE_SOURCES)) {
    const sf = program.getSourceFile(path.join(modulesDir, file));
    if (!sf) throw new Error(`Source missing: ${file}`);
    const moduleSymbol = checker.getSymbolAtLocation(sf);
    const sym = checker.getExportsOfModule(moduleSymbol).find((s) => s.name === exportName);
    if (!sym) throw new Error(`${exportName} not exported by ${file}`);
    const modType = checker.getTypeOfSymbol(sym);
    const di = modType.getProperty("defaultInput");
    const sig = checker.getTypeOfSymbol(di).getCallSignatures()[0];
    const inputType = checker.getReturnTypeOfSignature(sig);
    out[id] = new Walker(checker).root(inputType, id);
  }
  return out;
}

class Walker {
  constructor(checker) { this.checker = checker; this.defs = {}; this.names = new Map(); this.busy = new Set(); }
  root(type, id) {
    const schema = this.walk(type, 0, true);
    return { $schema: "https://json-schema.org/draft/2020-12/schema", $id: `urn:openaec:geotechniek:${id}:input`, ...schema, ...(Object.keys(this.defs).length ? { $defs: this.defs } : {}) };
  }
  text(sym) {
    const doc = ts.displayPartsToString(sym.getDocumentationComment(this.checker)).trim();
    if (doc) return doc.replace(/\s+/g, " ");
    const decl = sym.declarations?.[0];
    if (!decl) return undefined;
    const sfText = decl.getSourceFile().getFullText();
    const end = decl.getEnd();
    const line = sfText.slice(end, sfText.indexOf("\n", end) === -1 ? undefined : sfText.indexOf("\n", end));
    const m = /^\s*;?\s*\/\/\s*(.+)$/.exec(line.replace(/\r$/, ""));
    if (!m) return undefined;
    const note = m[1].trim();
    // "// 324 kN" is an example value, not a description.
    const ex = /^[-−]?\d[\d.,]*\s*(kN|kPa|MPa|mm|m|kNm|°)?\b/.exec(note);
    return ex ? `Voorbeeld: ${note}` : note;
  }
  named(type) {
    const sym = type.aliasSymbol ?? type.getSymbol();
    if (!sym) return null;
    const name = sym.getName();
    if (!name || name.startsWith("__") || ["Array", "ReadonlyArray", "Record", "Partial", "Required", "Pick", "Omit"].includes(name)) return null;
    if (!(type.flags & ts.TypeFlags.Object) && !type.aliasSymbol) return null;
    if (type.aliasTypeArguments?.length || type.typeArguments?.length) return null;
    return name;
  }
  walk(type, depth, top = false) {
    const c = this.checker, F = ts.TypeFlags;
    if (depth > 12) return {};
    if (type.flags & F.Any || type.flags & F.Unknown) return {};
    if (type.flags & F.String) return { type: "string" };
    if (type.flags & F.Number) return { type: "number" };
    if (type.flags & F.Boolean) return { type: "boolean" };
    if (type.flags & F.Null) return { type: "null" };
    if (type.flags & F.StringLiteral) return { const: type.value };
    if (type.flags & F.NumberLiteral) return { const: type.value };
    if (type.flags & F.BooleanLiteral) return { const: c.typeToString(type) === "true" };
    if (type.isUnion()) {
      let members = type.types.filter((t) => !(t.flags & F.Undefined) && !(t.flags & F.Void));
      // boolean shows up as true | false.
      const bools = members.filter((t) => t.flags & F.BooleanLiteral);
      if (bools.length === 2) members = [...members.filter((t) => !(t.flags & F.BooleanLiteral)), "boolean"];
      const parts = members.map((t) => (t === "boolean" ? { type: "boolean" } : this.walk(t, depth + 1)));
      if (parts.length === 1) return parts[0];
      if (parts.every((p) => "const" in p)) return { enum: parts.map((p) => p.const) };
      const consts = parts.filter((p) => "const" in p), rest = parts.filter((p) => !("const" in p));
      const simple = rest.every((p) => typeof p.type === "string" && Object.keys(p).length === 1);
      if (!consts.length && simple) return { type: [...new Set(rest.map((p) => p.type))] };
      const merged = consts.length ? [{ enum: consts.map((p) => p.const) }, ...rest] : rest;
      return { anyOf: merged };
    }
    if (type.flags & F.Object) {
      if (c.isArrayType(type)) return { type: "array", items: this.walk(c.getTypeArguments(type)[0], depth + 1) };
      if (c.isTupleType(type)) { const items = c.getTypeArguments(type).map((t) => this.walk(t, depth + 1)); return { type: "array", prefixItems: items, minItems: items.length, maxItems: items.length }; }
      if (type.getCallSignatures().length) return {};
      const name = top ? null : this.named(type);
      if (name) {
        const key = this.defKey(name, type);
        if (!this.defs[key] && !this.busy.has(key)) { this.busy.add(key); this.defs[key] = this.object(type, depth); this.busy.delete(key); }
        return { $ref: `#/$defs/${key}` };
      }
      return this.object(type, depth);
    }
    if (type.flags & F.Intersection) return this.object(type, depth);
    return {};
  }
  defKey(name, type) {
    const seen = this.names.get(name);
    if (!seen) { this.names.set(name, [type]); return name; }
    const i = seen.indexOf(type);
    if (i >= 0) return i ? `${name}${i + 1}` : name;
    seen.push(type);
    return `${name}${seen.length}`;
  }
  object(type, depth) {
    const c = this.checker;
    const props = {}, required = [];
    for (const p of c.getPropertiesOfType(type)) {
      const decl = p.valueDeclaration ?? p.declarations?.[0];
      const pt = decl ? c.getTypeOfSymbolAtLocation(p, decl) : c.getTypeOfSymbol(p);
      if (pt.getCallSignatures?.().length) continue;
      const schema = this.walk(pt, depth + 1);
      const text = this.text(p), unit = unitOf(p.name, text);
      if (text) schema.description = text;
      if (unit && (schema.type === "number" || (Array.isArray(schema.type) && schema.type.includes("number")) || schema.items?.type === "number")) schema["x-unit"] = unit;
      props[p.name] = schema;
      if (!(p.flags & ts.SymbolFlags.Optional)) required.push(p.name);
    }
    const out = { type: "object", properties: props };
    if (required.length) out.required = required;
    const index = c.getIndexInfosOfType(type);
    if (index.length) out.additionalProperties = this.walk(index[0].type, depth + 1);
    return out;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const schemas = generateSchemas();
  const target = fileURLToPath(new URL("packages/core/src/generated/schemas.json", root));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(schemas, null, 1) + "\n");
  console.log(`Wrote ${Object.keys(schemas).length} input schemas`);
}
