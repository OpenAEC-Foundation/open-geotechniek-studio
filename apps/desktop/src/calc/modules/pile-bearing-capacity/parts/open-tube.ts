// Punt van een open stalen buispaal (NEN 9997-1:2016+C2:2017).
//
// Art. 7.6.2.3(d): de draagkracht van een open buispaal is de som van de
// schachtwrijving op de buiten- en de binnenwand en de draagkracht van de
// onderrand van de buis; de binnenwrijving mag niet groter zijn dan de
// puntdraagkracht met een vaste grondprop.
// Art. 7.6.2.1(13): bij open buizen met openingen groter dan 500 mm zonder
// voorzieningen voor propvorming is de puntweerstand begrensd op de kleinste
// van de binnenwrijving tegen de prop en de puntweerstand over de volle
// doorsnede (inclusief prop).
//
// De lengte van de prop en daarmee de binnenwrijving volgen niet uit de
// invoer. Het programma rekent daarom twee grenzen, met q_b;max zoals voor
// een gesloten paal met dezelfde buitendiameter (D_eq = D):
//  - zonder prop: R_b = q_b;max · A_ring; de binnenwrijving telt niet mee
//    (ondergrens van 7.6.2.3(d), want de binnenwrijving is ≥ 0);
//  - met prop:    R_b = q_b;max · (A_ring + η · A_binnen), met een factor η
//    (0 < η ≤ 1) die de gebruiker invult en onderbouwt. η = 1 is de volle
//    doorsnede, de bovengrens van 7.6.2.3(d).
import type { BaseResistanceResult, OpenTubeInput } from "../types";

export interface OpenTubeAreas {
  /** Staalring π/4 · (D² − (D − 2t)²) [mm²]. */
  ringMm2: number;
  /** Binnendoorsnede π/4 · (D − 2t)² [mm²]. */
  innerMm2: number;
  /** Volle doorsnede π/4 · D² [mm²]. */
  fullMm2: number;
}

export function openTubeAreas(diameterMm: number, wallMm: number): OpenTubeAreas {
  const inner = Math.max(0, diameterMm - 2 * wallMm);
  const fullMm2 = Math.PI / 4 * diameterMm ** 2, innerMm2 = Math.PI / 4 * inner ** 2;
  return { ringMm2: fullMm2 - innerMm2, innerMm2, fullMm2 };
}

/** Geldige propfactor: 0 < η ≤ 1. */
export const validPlugFactor = (f: number | undefined): f is number => typeof f === "number" && Number.isFinite(f) && f > 0 && f <= 1;

/** Puntoppervlak dat meetelt [mm²]. Met prop zonder geldige factor: undefined (niet rekenen). */
export function openTubeBaseArea(areas: OpenTubeAreas, open: OpenTubeInput | undefined): number | undefined {
  if (!open?.plug) return areas.ringMm2;
  if (!validPlugFactor(open.plugFactor)) return undefined;
  return areas.ringMm2 + open.plugFactor * areas.innerMm2;
}

/** Puntweerstand van de open buis: dezelfde q_b;max, een ander oppervlak. */
export function applyOpenTube(base: BaseResistanceResult, areas: OpenTubeAreas, open: OpenTubeInput | undefined): BaseResistanceResult {
  const abMm2 = openTubeBaseArea(areas, open);
  if (abMm2 === undefined) throw new RangeError("plug factor missing");
  const plug = !!open?.plug;
  return { ...base, abMm2, rbCalMax: abMm2 * base.qbMaxMpa / 1000,
    openTube: { plug, ...(plug ? { plugFactor: open!.plugFactor } : {}), ...areas } };
}
