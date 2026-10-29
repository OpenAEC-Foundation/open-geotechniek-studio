export { decodeSource } from "../../../apps/desktop/src/utils/sourceEncoding";
export { normalizeCpt } from "../../../apps/desktop/src/classification/normalized";
export { computePad } from "../../../apps/desktop/src/calc/modules/pad-foundation/compute";
export { parseGefBore } from "../../../apps/desktop/src/types/gefBoreParser";
export { parseGef } from "../../../apps/desktop/src/types/gefParser";
export { computeSettlement } from "../../../apps/desktop/src/calc/modules/settlement/compute";
export { validationOf } from "../../../apps/desktop/src/validation/report";
export { detectLayers } from "../../../apps/desktop/src/utils/browserCore";
import {
  parseGef,
  looksLikeGef,
} from "../../../apps/desktop/src/types/gefParser";
import type { Cpt } from "../../../apps/desktop/src/types/cpt";
declare const __OGS_VERSION__: string;
export const version = __OGS_VERSION__;
interface Importer {
  id: string;
  matches: (content: string, filename: string) => boolean;
  parse: (content: string, filename: string) => Cpt;
}
const importers: Importer[] = [];
/** Trusted consumer-side extension. No code is accepted or executed over HTTP/MCP. */
export function registerImporter(importer: Importer): void {
  if (
    !importer.id ||
    typeof importer.matches !== "function" ||
    typeof importer.parse !== "function" ||
    importers.some((i) => i.id === importer.id)
  )
    throw new Error("Importer requires a unique id, matches and parse.");
  importers.push(importer);
}
export function validateCpt(value: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (!value || typeof value !== "object")
    return { valid: false, errors: ["CPT must be an object"] };
  const c = value as Cpt;
  if (typeof c.id !== "string" || !c.id.trim())
    errors.push("CPT id is required");
  if (!c.metadata || typeof c.metadata.source_file !== "string")
    errors.push("metadata.source_file is required");
  if (!Array.isArray(c.points) || !c.points.length)
    errors.push("points must be a non-empty array");
  else
    c.points.forEach((p, i) => {
      if (!p || !Number.isFinite(p.depth) || p.depth < 0)
        errors.push(`points[${i}].depth must be finite and non-negative`);
      else
        for (const key of ["qc", "fs", "rf", "u2", "inclination"] as const)
          if (p[key] != null && !Number.isFinite(p[key]))
            errors.push(`points[${i}].${key} must be finite`);
    });
  if (c.position && ![c.position.x_rd, c.position.y_rd].every(Number.isFinite))
    errors.push("Position must contain finite RD coordinates");
  return { valid: errors.length === 0, errors };
}
export function parseDocument(content: string, filename: string): Cpt {
  if (typeof content !== "string" || typeof filename !== "string")
    throw new Error("content and filename must be strings");
  const importer = importers.find((i) => i.matches(content, filename));
  const cpt = importer
    ? importer.parse(content, filename)
    : looksLikeGef(content)
      ? parseGef(content, filename)
      : filename.match(/\.(json|ifcgeo)$/i)
        ? JSON.parse(content)
        : null;
  if (!cpt)
    throw new Error(
      "Unsupported format. Register a trusted importer or convert the source to GEF/a CPT JSON snapshot.",
    );
  const validation = validateCpt(cpt);
  if (!validation.valid) throw new Error(validation.errors.join("; "));
  return cpt;
}
