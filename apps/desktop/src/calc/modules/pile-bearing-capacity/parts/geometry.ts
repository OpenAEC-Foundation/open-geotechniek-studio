import type { PileInput } from "../types";
import { ct } from "../../../i18n";

/**
 * diameterMm is de diameter van een ronde paal of de zijlengte a van een vierkante paal.
 * Met `sideBMm` is de doorsnede een rechthoek a × b: oppervlak a · b, omtrek 2 (a + b) en
 * dezelfde equivalente diameter als voor het vierkant, de cirkel met gelijk oppervlak
 * (√(4 · a · b / π) = 1,13 · a · √(b / a)).
 */
export function pileGeometry(diameterMm: number, isCircular: boolean, sideBMm?: number) {
  const rect = !isCircular && sideBMm !== undefined;
  if (!Number.isFinite(diameterMm) || diameterMm <= 0 || (rect && (!Number.isFinite(sideBMm) || sideBMm! <= 0))) {
    throw new RangeError(ct("calcPileCore", "errors.pileSizeInvalid", "De paalafmeting moet eindig en groter dan nul zijn"));
  }
  const areaMm2 = isCircular ? Math.PI / 4 * diameterMm ** 2 : rect ? diameterMm * sideBMm! : diameterMm ** 2;
  return {
    areaMm2,
    perimeterM: rect ? 2 * (diameterMm + sideBMm!) / 1000 : (isCircular ? Math.PI : 4) * diameterMm / 1000,
    equivalentDiameterMm: isCircular ? diameterMm : Math.sqrt(4 * areaMm2 / Math.PI),
  };
}

export type ShaftGeometry = Pick<PileInput, "diameterMm" | "pileTopNap" | "timberTaper" | "concreteExtension" | "sideBMm">;

/** Bovenkant van het hout: de las onder een betonopzetter, anders de paalkop. */
export function woodTopNap(input: ShaftGeometry): number {
  return input.concreteExtension?.jointNap ?? input.pileTopNap;
}

/** Diameter van het hout op een niveau; tapsheid telt vanaf de bovenkant van het hout. */
export function shaftDiameterAtNap(input: ShaftGeometry, nap: number): number {
  const taper = input.timberTaper;
  if (!taper) return input.diameterMm;
  const fraction = Math.max(0, Math.min(1, (woodTopNap(input) - nap) / taper.lengthM));
  return input.diameterMm + (taper.toeDiameterMm - input.diameterMm) * fraction;
}

/** Omtrek op een niveau. `inExtension` kiest de kant van de las: op de las
 *  zelf grenzen beton en hout, en welke omtrek geldt hangt af van het traject. */
function perimeterAt(input: ShaftGeometry, isCircular: boolean, nap: number, inExtension: boolean): number {
  const ext = input.concreteExtension;
  if (ext && inExtension) return (ext.isCircular ? Math.PI : 4) * ext.sizeMm / 1000;
  if (!isCircular && input.sideBMm !== undefined) return 2 * (shaftDiameterAtNap(input, nap) + input.sideBMm) / 1000;
  return (isCircular ? Math.PI : 4) * shaftDiameterAtNap(input, nap) / 1000;
}

/** Schachtomtrek op één niveau [m]. Boven de las geldt de betonopzetter,
 *  op en onder de las het hout (met tapsheid). */
export function shaftPerimeterAtNap(input: ShaftGeometry, isCircular: boolean, nap: number): number {
  return perimeterAt(input, isCircular, nap, !!input.concreteExtension && nap > input.concreteExtension.jointNap);
}

/** Exact lengtegemiddelde van de schachtomtrek tussen twee niveaus. Splitst
 *  op de las (opzetter/hout) en op de overgang taps/constant; binnen elk
 *  stuk verloopt de omtrek lineair, dus de trapeziumregel is exact. */
export function meanShaftPerimeter(input: ShaftGeometry, isCircular: boolean, topNap: number, bottomNap: number): number {
  const ext = input.concreteExtension;
  if (!input.timberTaper && !ext) return pileGeometry(input.diameterMm, isCircular, input.sideBMm).perimeterM;
  if (topNap <= bottomNap) return perimeterAt(input, isCircular, topNap, !!ext && topNap > ext.jointNap);
  const splits = [
    ...(ext ? [ext.jointNap] : []),
    ...(input.timberTaper ? [woodTopNap(input) - input.timberTaper.lengthM] : []),
  ].filter((nap) => nap < topNap && nap > bottomNap);
  const knots = [topNap, ...[...new Set(splits)].sort((a, b) => b - a), bottomNap];
  let integral = 0;
  for (let i = 1; i < knots.length; i++) {
    const top = knots[i - 1], bot = knots[i];
    const inExtension = !!ext && (top + bot) / 2 > ext.jointNap;
    integral += (top - bot) * (perimeterAt(input, isCircular, top, inExtension) + perimeterAt(input, isCircular, bot, inExtension)) / 2;
  }
  return integral / (topNap - bottomNap);
}
