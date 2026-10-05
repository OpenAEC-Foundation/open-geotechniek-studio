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
