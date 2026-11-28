// A small JSON Schema validator for the subset the generated input schemas use
// (type, const, enum, anyOf, properties, required, items, prefixItems,
// additionalProperties as schema, $ref to #/$defs), and a JSON-safe copy of results.

export type JsonSchema = Record<string, any>;

export interface SchemaValidation { valid: boolean; errors: string[] }

function typeOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "number") return Number.isInteger(v) ? "integer" : "number";
  return typeof v;
}

function matchesType(t: string, v: unknown): boolean {
  const actual = typeOf(v);
  return t === actual || (t === "number" && actual === "integer");
}

/** Validates a value against a schema; at most `limit` messages. */
export function validateSchema(schema: JsonSchema, value: unknown, limit = 50): SchemaValidation {
  const errors: string[] = [];
  const root = schema;
  const resolve = (s: JsonSchema): JsonSchema => {
    if (typeof s.$ref === "string" && s.$ref.startsWith("#/$defs/")) {
      const { $ref, ...rest } = s;
      return { ...root.$defs?.[$ref.slice(8)], ...rest };
    }
    return s;
  };
  const check = (s0: JsonSchema, v: unknown, path: string, out: string[]): void => {
    if (out.length >= limit || !s0) return;
    const s = resolve(s0);
    if ("const" in s && v !== s.const) { out.push(`${path}: must be ${JSON.stringify(s.const)}`); return; }
    if (Array.isArray(s.enum) && !s.enum.includes(v)) { out.push(`${path}: must be one of ${s.enum.map((e: unknown) => JSON.stringify(e)).join(", ")}`); return; }
    if (Array.isArray(s.anyOf)) {
      const ok = s.anyOf.some((alt: JsonSchema) => { const tmp: string[] = []; check(alt, v, path, tmp); return tmp.length === 0; });
      if (!ok) { out.push(`${path}: matches none of the allowed forms`); return; }
    }
    if (s.type !== undefined) {
      const types: string[] = Array.isArray(s.type) ? s.type : [s.type];
      if (!types.some((t) => matchesType(t, v))) { out.push(`${path}: expected ${types.join(" or ")}, got ${typeOf(v)}`); return; }
    }
    if (typeof v === "number" && !Number.isFinite(v)) out.push(`${path}: must be a finite number`);
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      for (const key of s.required ?? []) if (!(key in o) || o[key] === undefined) out.push(`${path}.${key}: is required`);
      for (const [key, val] of Object.entries(o)) {
        if (val === undefined) continue;
        if (s.properties?.[key]) check(s.properties[key], val, `${path}.${key}`, out);
        else if (s.additionalProperties && typeof s.additionalProperties === "object") check(s.additionalProperties, val, `${path}.${key}`, out);
        else if (s.additionalProperties === false) out.push(`${path}.${key}: unknown field`);
      }
    }
    if (Array.isArray(v)) {
      if (Array.isArray(s.prefixItems)) s.prefixItems.forEach((p: JsonSchema, i: number) => i < v.length && check(p, v[i], `${path}[${i}]`, out));
      else if (s.items) v.forEach((item, i) => check(s.items, item, `${path}[${i}]`, out));
      if (typeof s.minItems === "number" && v.length < s.minItems) out.push(`${path}: needs at least ${s.minItems} items`);
      if (typeof s.maxItems === "number" && v.length > s.maxItems) out.push(`${path}: allows at most ${s.maxItems} items`);
    }
  };
  check(schema, value, "input", errors);
  return { valid: errors.length === 0, errors };
}

/**
 * A copy that survives JSON.stringify without loss of structure: Map becomes an
 * object, Set an array, Date an ISO text, a typed array a plain array; non-finite
 * numbers become null (as JSON.stringify would do) and functions are dropped.
 */
export function toJsonSafe(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "undefined" || typeof value === "function" || typeof value === "symbol") return undefined;
  if (value instanceof Date) return value.toISOString();
  if (ArrayBuffer.isView(value)) return Array.from(value as unknown as ArrayLike<number>);
  const obj = value as object;
  if (seen.has(obj)) return "[circular]";
  seen.add(obj);
  try {
    if (value instanceof Map) return Object.fromEntries([...value.entries()].map(([k, v]) => [String(k), toJsonSafe(v, seen)]));
    if (value instanceof Set) return [...value].map((v) => toJsonSafe(v, seen) ?? null);
    if (Array.isArray(value)) return value.map((v) => { const x = toJsonSafe(v, seen); return x === undefined ? null : x; });
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) { const x = toJsonSafe(v, seen); if (x !== undefined) out[k] = x; }
    return out;
  } finally {
    seen.delete(obj);
  }
}
