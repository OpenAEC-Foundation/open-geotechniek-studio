import type { PileInput } from "../types";
import { ct } from "../../../i18n";

/** diameterMm is de diameter van een ronde paal of de zijlengte van een vierkante paal. */
export function pileGeometry(diameterMm: number, isCircular: boolean) {
  if (!Number.isFinite(diameterMm) || diameterMm <= 0) {
    throw new RangeError(ct("calcPileCore", "errors.pileSizeInvalid", "De paalafmeting moet eindig en groter dan nul zijn"));
  }
  const areaMm2 = isCircular ? Math.PI / 4 * diameterMm ** 2 : diameterMm ** 2;
  return {
    areaMm2,
    perimeterM: (isCircular ? Math.PI : 4) * diameterMm / 1000,
    equivalentDiameterMm: isCircular ? diameterMm : Math.sqrt(4 * areaMm2 / Math.PI),
  };
}

export type ShaftGeometry = Pick<PileInput, "diameterMm" | "pileTopNap" | "timberTaper" | "concreteExtension">;

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
  return (isCircular ? Math.PI : 4) * shaftDiameterAtNap(input, nap) / 1000;
}

/** Exact lengtegemiddelde van de schachtomtrek tussen twee niveaus. Splitst
 *  op de las (opzetter/hout) en op de overgang taps/constant; binnen elk
 *  stuk verloopt de omtrek lineair, dus de trapeziumregel is exact. */
export function meanShaftPerimeter(input: ShaftGeometry, isCircular: boolean, topNap: number, bottomNap: number): number {
  const ext = input.concreteExtension;
  if (!input.timberTaper && !ext) return pileGeometry(input.diameterMm, isCircular).perimeterM;
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
