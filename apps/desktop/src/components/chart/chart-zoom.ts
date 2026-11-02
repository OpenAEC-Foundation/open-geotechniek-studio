/** Breedteschaal voor het hoofdblad, relatief aan de verticale fitstand. */
export function chartWidthScale(zoom: number, scaleColumns: boolean): number {
  return scaleColumns ? Math.max(1, zoom) : 1;
}

/** Aszoom blijft bij de bestaande weergave gekoppeld aan de dieptezoom. */
export function chartAxisZoom(zoom: number, scaleColumns: boolean): number {
  return scaleColumns ? 1 : zoom;
}
