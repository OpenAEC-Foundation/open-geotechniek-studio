// Omzetting van een sondering uit de eerdere werkwijze "Sondering uit scan" naar een gedigitaliseerde
// sondering die weer te openen en bij te werken is.
//
// Die werkwijze bewaarde alleen het resultaat: conusweerstand op een stap van 0,02 m, de naam van de
// scan als bronbestand en één regel herkomst in de vrije metadata. De scan zelf, de ijking en het soort
// sondering zijn niet bewaard. De omzetting legt de meetwaarden daarom als lijn op een leeg blad
// (één beeldrij per stap, 50 pixels per MPa, met ruimte eronder om bij te tekenen) met een ijking
// die precies die waarden teruggeeft. De meetwaarden zelf blijven ongewijzigd; het soort sondering
// is "onbekend".
import type { Cpt } from "../types/cpt";
import type { Calibration } from "./calibration";
import { DIGITIZED_KEY, type DigitizedRecord } from "./record";

/** De vaste stap van de eerdere werkwijze [m]. */
export const SCAN_STEP = 0.02;
const PX_PER_MPA = 50;
const ROWS = 1000;
/** Diepte = beeldrij × stap; qc = x / 50. */
const SHEET: Calibration = {
  depth: { a: { x: 0, y: 0 }, b: { x: 0, y: ROWS }, va: 0, vb: ROWS * SCAN_STEP },
  value: { a: { x: 0, y: 0 }, b: { x: 10 * PX_PER_MPA, y: 0 }, va: 0, vb: 10 },
};

const SCAN_FILE = /\.(png|jpe?g|webp|pdf)$/i;
const POINT_KEYS = new Set(["depth", "qc", "depth_nap"]);

/** Komt deze sondering uit de eerdere werkwijze: een afbeelding of PDF als bron en alleen conusweerstand? */
export function isScanCpt(cpt: Cpt): boolean {
  if (cpt.metadata?.extra?.[DIGITIZED_KEY] !== undefined || !SCAN_FILE.test(cpt.metadata?.source_file ?? "")) return false;
  return cpt.points.length >= 2 && cpt.points.every((p) => typeof p.qc === "number" && Object.entries(p).every(([key, v]) => POINT_KEYS.has(key) || v == null));
}

/** Het ingevoerde zoals het scherm het nodig heeft, opgebouwd uit de meetwaarden. */
export function scanRecord(cpt: Cpt): DigitizedRecord {
  const rows = cpt.points.map((p) => ({ row: Math.round(p.depth / SCAN_STEP), x: Math.round(p.qc! * PX_PER_MPA * 100) / 100 }));
  const top = Math.min(...rows.map((r) => r.row)), bottom = Math.max(...rows.map((r) => r.row));
  const x: Array<number | null> = new Array(bottom - top + 1).fill(null);
  for (const r of rows) x[r.row - top] = r.x;
  const origin = Object.entries(cpt.metadata.extra ?? {}).find(([key]) => !key.startsWith("ogs:"))?.[1];
  const ground = cpt.metadata.ground_level_nap ?? cpt.position?.z_nap;
  return {
    version: 1,
    id: cpt.id,
    date: cpt.metadata.date || undefined,
    groundLevelNap: typeof ground === "number" && Number.isFinite(ground) ? ground : NaN,
    xRd: cpt.position?.x_rd,
    yRd: cpt.position?.y_rd,
    origin: origin?.trim() || `Overgetekend van een scan (${cpt.metadata.source_file})`,
    coneKind: "unknown",
    depthMode: "depth",
    step: SCAN_STEP,
    interpolation: "linear",
    image: { name: cpt.metadata.source_file, width: Math.max(400, Math.ceil(Math.max(...rows.map((r) => r.x))) + PX_PER_MPA), height: Math.max(ROWS + 1, bottom + 251), synthetic: true },
    qc: { calibration: SHEET, points: [], method: "trace", trace: { top, x } },
  };
}

/**
 * Geeft een sondering uit de eerdere werkwijze het ingevoerde mee, zodat zij als gedigitaliseerd wordt
 * vermeld en in het scherm te openen is. Elke andere sondering komt ongewijzigd terug.
 */
export function migrateScanCpt(cpt: Cpt): Cpt {
  if (!isScanCpt(cpt)) return cpt;
  return { ...cpt, metadata: { ...cpt.metadata, extra: { ...cpt.metadata.extra, [DIGITIZED_KEY]: JSON.stringify(scanRecord(cpt)) } } };
}
