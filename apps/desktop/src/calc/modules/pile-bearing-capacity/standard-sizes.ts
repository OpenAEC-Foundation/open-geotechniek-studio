// Gangbare maten voor paalsystemen. De invoer biedt ze als keuzelijst aan;
// een eigen maat blijft altijd mogelijk.
import { ct } from "../../i18n";

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

/** Standaard maatreeks per paaltype; andere typen hebben geen standaardreeks. */
export const DEFAULT_SIZES: Record<string, number[]> = {
  "concrete-prefab-prestressed-driven": PREFAB_SQUARE,
  "timber-uniform": TIMBER_HEAD,
  "steel-pipe-driven-closed": STEEL_TUBE_OD,
  "steel-pipe-driven-closed-2017": STEEL_TUBE_OD,
};

export interface Presets {
  sizesMm?: Record<string, number[]>;
  extensions?: Array<{ sizeMm: number; isCircular: boolean }>;
  extensionLengthsM?: number[];
  timberToeMm?: number;
}
export interface ExtensionPreset { id: string; label: string; sizeMm: number; isCircular: boolean }
const extensionPreset = (e: { sizeMm: number; isCircular: boolean }): ExtensionPreset => ({
  id: `${e.isCircular ? "rond" : "vierkant"}-${e.sizeMm}`,
  label: e.isCircular
    ? ct("calcPileCore", "extensions.round", "Rond Ø{{size}}", { size: sizeText(e.sizeMm) })
    : ct("calcPileCore", "extensions.square", "Vierkant {{size}}×{{size}}", { size: sizeText(e.sizeMm) }),
  sizeMm: e.sizeMm, isCircular: e.isCircular,
});

/** Reeksen zoals ze voor deze berekening gelden: eigen instellingen, anders de standaard. */
export function seriesFor(pileTypeId: string, presets?: Presets) {
  return {
    sizes: presets?.sizesMm?.[pileTypeId] ?? DEFAULT_SIZES[pileTypeId],
    extensions: (presets?.extensions?.length ? presets.extensions : EXTENSION_PRESETS).map(extensionPreset),
    extensionLengths: presets?.extensionLengthsM?.length ? presets.extensionLengthsM : EXTENSION_LENGTHS_M,
    timberToeMm: presets?.timberToeMm ?? TIMBER_TOE_MM,
  };
}
