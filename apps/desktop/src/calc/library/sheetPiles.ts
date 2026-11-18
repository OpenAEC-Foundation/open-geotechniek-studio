// Bibliotheek van warmgewalste stalen damwandprofielen (schema ogs.sheetpiles/1).
//
// Alle waarden zijn per m wand en komen uit de catalogi van de fabrikanten; per profiel staat de bron (met pagina)
// in `source`. De bibliotheek is de basis voor damwandberekeningen: buigstijfheid EI en elastisch of plastisch
// moment per m wand.
import data from "./sheet-piles.json";

export type SheetPileShape = "Z" | "U" | "hat" | "straight";

export interface SheetPileProfile {
  id: string;
  manufacturer: string;
  series: string;
  shape: SheetPileShape;
  /** Breedte van één enkele plank [mm]; een dubbele plank is 2×. */
  widthMm: number | null;
  /** Hoogte van de wand [mm]. */
  wallHeightMm: number | null;
  flangeMm: number | null;
  webMm: number | null;
  areaCm2PerM: number | null;
  massKgPerM2: number | null;
  /** Traagheidsmoment per m wand [cm⁴/m]. */
  iCm4PerM: number | null;
  /** Elastisch weerstandsmoment per m wand [cm³/m]. */
  welCm3PerM: number | null;
  /** Plastisch weerstandsmoment per m wand [cm³/m]; null als de fabrikant het niet geeft. */
  wplCm3PerM: number | null;
  coatingM2PerM2?: number;
  /** Doorsnedeklasse (NEN-EN 1993-5) per staalsoort, als de catalogus die geeft. */
  classes?: Record<string, number>;
  /** Karakteristieke slotsterkte van rechte profielen [kN/m]. */
  interlockRkKnPerM?: number;
  /** Alleen op aanvraag leverbaar. */
  onRequest?: boolean;
  note?: string;
  source: string;
}

export interface SteelGrade { grade: string; fyMPa: number; fuMPa: number; standard?: string; source?: string }

interface Library { schema: string; sources: unknown[]; grades: SteelGrade[]; profiles: SheetPileProfile[] }
const lib = data as unknown as Library;

export const SHEET_PILES: readonly SheetPileProfile[] = lib.profiles;
export const SHEET_PILE_GRADES: readonly SteelGrade[] = lib.grades;
export const SHEET_PILE_SOURCES = lib.sources;

/** Elasticiteitsmodulus van staal [MPa]. */
export const E_STEEL_MPA = 210_000;

export function findSheetPile(id: string, manufacturer?: string): SheetPileProfile | undefined {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  return SHEET_PILES.find((p) => norm(p.id) === norm(id) && (!manufacturer || p.manufacturer === manufacturer));
}

export function findGrade(grade: string): SteelGrade | undefined {
  return SHEET_PILE_GRADES.find((g) => g.grade.replace(/\s+/g, "").toUpperCase() === grade.replace(/\s+/g, "").toUpperCase());
}

/** Fabrikant → reeksen → profielen, voor keuzelijsten. */
export function sheetPileCatalog(includeOnRequest = true): Map<string, Map<string, SheetPileProfile[]>> {
  const out = new Map<string, Map<string, SheetPileProfile[]>>();
  for (const p of SHEET_PILES) {
    if (!includeOnRequest && p.onRequest) continue;
    const series = out.get(p.manufacturer) ?? new Map<string, SheetPileProfile[]>();
    series.set(p.series, [...(series.get(p.series) ?? []), p]);
    out.set(p.manufacturer, series);
  }
  return out;
}

/** Buigstijfheid per m wand [kNm²/m]; null zonder I (rechte profielen). */
export function wallStiffness(p: SheetPileProfile, eMPa = E_STEEL_MPA): number | null {
  // E [N/mm²] · I [cm⁴] = E·I·1e4 [N·mm²] → ·1e-9 [kN·m²]
  return p.iCm4PerM === null ? null : (eMPa * p.iCm4PerM * 1e4) / 1e9;
}

/**
 * Momentcapaciteit per m wand [kNm/m]: W·fy/γM0. Plastisch alleen voor doorsnedeklasse 1 of 2 bij deze staalsoort
 * en als Wpl bekend is; anders elastisch. Klasse 4 vraagt een aparte toets en geeft null.
 */
export function wallMomentCapacity(p: SheetPileProfile, grade: string, gammaM0 = 1.0): { mRd: number; basis: "plastisch" | "elastisch" } | null {
  const g = findGrade(grade);
  if (!g || p.welCm3PerM === null) return null;
  const cls = p.classes?.[g.grade];
  if (cls === 4) return null;
  const plastic = (cls === 1 || cls === 2) && p.wplCm3PerM !== null;
  const w = plastic ? p.wplCm3PerM! : p.welCm3PerM;
  // W [cm³] · fy [N/mm²] = W·1e3 [mm³]·fy [N/mm²] = N·mm → ·1e-6 kNm
  return { mRd: (w * 1e3 * g.fyMPa) / 1e6 / gammaM0, basis: plastic ? "plastisch" : "elastisch" };
}
