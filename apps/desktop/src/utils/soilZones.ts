import type { Zone } from "../types/cpt";
import { pt } from "./panelsI18n";
/** Robertson thresholds and layer merging match cpt-core. */
export const zones: Zone[] = [
  ["Gevoelig fijnkorrelig", "#00BCD4"],
  ["Organisch / veen", "#795548"],
  ["Klei", "#4CAF50"],
  ["Silt mengsels", "#8BC34A"],
  ["Zand mengsels", "#FFC107"],
  ["Zand", "#FF9800"],
  ["Grof zand / grind", "#FF5722"],
  ["Zeer vast zand/klei", "#F44336"],
  ["Zeer vast fijnkorrelig", "#9C27B0"],
].map(([name, color], i) => ({ number: i + 1, name, color }));
/**
 * Zonenaam in de actieve taal voor weergave (legenda, tabellen). De data
 * houdt de Nederlandse naam; die is ook de terugval voor onbekende zones.
 */
export function zoneName(number: number, fallback?: string): string {
  const zone = zones.find((z) => z.number === number);
  const nl = zone?.name ?? fallback ?? String(number);
  if (!zone) return nl;
  return pt(`zones.z${number}`, nl);
}
export function classify(qc?: number, rf?: number): Zone | null {
  if (
    qc == null ||
    rf == null ||
    !Number.isFinite(qc) ||
    !Number.isFinite(rf) ||
    qc <= 0 ||
    rf < 0
  )
    return null;
  let n: number;
  if (qc > 25) n = rf < 1 ? 7 : 8;
  else if (qc > 10) n = rf < 0.5 ? 7 : rf < 1.5 ? 6 : rf < 3 ? 5 : 8;
  else if (qc > 5) n = rf < 1 ? 6 : rf < 2 ? 5 : rf < 4 ? 4 : rf < 6 ? 3 : 9;
  else if (qc > 2) n = rf < 1 ? 5 : rf < 2.5 ? 4 : rf < 5 ? 3 : 2;
  else if (qc > 0.5) n = rf < 1 ? 4 : rf < 3 ? 3 : 2;
  else n = rf < 2 ? 3 : rf < 5 ? 2 : 1;
  return zones[n - 1];
}
