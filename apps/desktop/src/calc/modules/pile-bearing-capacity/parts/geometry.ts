import type { PileInput } from "../types";

/** diameterMm is de diameter van een ronde paal of de zijlengte van een vierkante paal. */
export function pileGeometry(diameterMm: number, isCircular: boolean) {
  if (!Number.isFinite(diameterMm) || diameterMm <= 0) {
    throw new RangeError("De paalafmeting moet eindig en groter dan nul zijn");
  }
  const areaMm2 = isCircular ? Math.PI / 4 * diameterMm ** 2 : diameterMm ** 2;
  return {
    areaMm2,
    perimeterM: (isCircular ? Math.PI : 4) * diameterMm / 1000,
    equivalentDiameterMm: isCircular ? diameterMm : Math.sqrt(4 * areaMm2 / Math.PI),
  };
}

type ShaftGeometry = Pick<PileInput, "diameterMm" | "pileTopNap" | "timberTaper">;

export function shaftDiameterAtNap(input: ShaftGeometry, nap: number): number {
  const taper = input.timberTaper;
  if (!taper) return input.diameterMm;
  const fraction = Math.max(0, Math.min(1, (input.pileTopNap - nap) / taper.lengthM));
  return input.diameterMm + (taper.toeDiameterMm - input.diameterMm) * fraction;
}

/** Exact lengtegemiddelde; splits op de overgang taps/constant. */
export function meanShaftPerimeter(input: ShaftGeometry, isCircular: boolean, topNap: number, bottomNap: number): number {
  if (!input.timberTaper || topNap <= bottomNap) return pileGeometry(shaftDiameterAtNap(input, topNap), isCircular).perimeterM;
  const transition = input.pileTopNap - input.timberTaper.lengthM;
  const knots = [topNap, ...(transition < topNap && transition > bottomNap ? [transition] : []), bottomNap];
  let integral = 0;
  for (let i = 1; i < knots.length; i++) {
    integral += (knots[i - 1] - knots[i]) * (shaftDiameterAtNap(input, knots[i - 1]) + shaftDiameterAtNap(input, knots[i])) / 2;
  }
  return (isCircular ? Math.PI : 4) * integral / (topNap - bottomNap) / 1000;
}
