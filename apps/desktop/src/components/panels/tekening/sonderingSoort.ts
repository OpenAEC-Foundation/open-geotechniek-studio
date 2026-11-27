/**
 * Kind of cone penetration test shown on the drawing.
 *
 *   conus        cone resistance only
 *   kleef        with local sleeve friction
 *   water        with pore pressure
 *   kleef-water  with sleeve friction and pore pressure
 */
export type SonderingSoort = "conus" | "kleef" | "water" | "kleef-water";

export const SONDERING_SOORTEN: readonly SonderingSoort[] = [
  "conus",
  "kleef",
  "water",
  "kleef-water",
];

/** Default for a newly planned test: nearly every electrical cone measures sleeve friction. */
export const DEFAULT_SONDERING_SOORT: SonderingSoort = "kleef";

export function isSonderingSoort(v: unknown): v is SonderingSoort {
  return typeof v === "string" && (SONDERING_SOORTEN as readonly string[]).includes(v);
}

export const soortHasFriction = (s: SonderingSoort): boolean => s === "kleef" || s === "kleef-water";
export const soortHasPorePressure = (s: SonderingSoort): boolean => s === "water" || s === "kleef-water";

export function soortFromFlags(friction: boolean, porePressure: boolean): SonderingSoort {
  if (friction && porePressure) return "kleef-water";
  if (friction) return "kleef";
  if (porePressure) return "water";
  return "conus";
}

/**
 * Kind of a stored marker or grid. Drawings saved before the kind existed
 * only carry the sleeve-friction flag; that flag decides between the first
 * two kinds, so an old drawing looks the same as before.
 */
export function resolveSoort(soort: unknown, legacyFriction?: boolean): SonderingSoort {
  if (isSonderingSoort(soort)) return soort;
  return legacyFriction ? "kleef" : "conus";
}

const measured = (v: number | null | undefined): boolean => typeof v === "number" && Number.isFinite(v);

/** Kind of a test read from a file, derived from the measured columns. */
export function soortFromPoints(points: readonly { fs?: number | null; u2?: number | null }[]): SonderingSoort {
  let friction = false;
  let pore = false;
  for (const p of points) {
    if (!friction && measured(p.fs)) friction = true;
    if (!pore && measured(p.u2)) pore = true;
    if (friction && pore) break;
  }
  return soortFromFlags(friction, pore);
}

// Kind chosen in the ribbon for the next planned test or grid. Module level so
// it survives the remounts of both the ribbon tab and the drawing view.
let placeSoort: SonderingSoort = DEFAULT_SONDERING_SOORT;
export const getPlaceSoort = (): SonderingSoort => placeSoort;
export function setPlaceSoort(s: SonderingSoort): void {
  placeSoort = s;
}
