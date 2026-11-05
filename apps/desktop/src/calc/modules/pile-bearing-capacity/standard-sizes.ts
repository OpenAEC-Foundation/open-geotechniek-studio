// Gangbare maten voor paalsystemen. De invoer biedt ze als keuzelijst aan;
// een eigen maat blijft altijd mogelijk.

/** Buitendiameters van stalen buispalen [mm], volgens de gangbare buisreeks. */
export const STEEL_TUBE_OD = [168.3, 193.7, 219.1, 244.5, 273, 323.9, 355.6, 406.4, 457, 508, 559, 610];

/** Prefab betonpalen, vierkant [mm]. */
export const PREFAB_SQUARE = [180, 220, 250, 290, 320, 350, 400, 450];

/** Houten palen: diameter bij de las of kop [mm]; de punt is standaard Ø150. */
export const TIMBER_HEAD = [160, 180, 200, 220, 240, 260];
export const TIMBER_TOE_MM = 150;

/** Betonopzetters op houten palen. */
export const EXTENSION_PRESETS = [
  { id: "rond-280", label: "Rond Ø280", sizeMm: 280, isCircular: true },
  { id: "rond-180", label: "Rond Ø180", sizeMm: 180, isCircular: true },
  { id: "vierkant-250", label: "Vierkant 250×250", sizeMm: 250, isCircular: false },
] as const;
export const EXTENSION_LENGTHS_M = [1.5, 2, 2.5, 4];

/** Dichtstbijzijnde maat uit een reeks. */
export const nearest = (list: readonly number[], v: number) => list.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a, list[0]);

/** Opmaak van een maat met decimale komma (168,3). */
export const sizeText = (v: number) => String(v).replace(".", ",");
