// Gangbare maten voor paalsystemen. De invoer biedt ze als keuzelijst aan;
// een eigen maat blijft altijd mogelijk.
import { ct } from "../../i18n";

/** Buitendiameters van stalen buispalen [mm], volgens de gangbare buisreeks. */
export const STEEL_TUBE_OD = [168.3, 193.7, 219.1, 244.5, 273, 323.9, 355.6, 406.4, 457, 508, 559, 610];

/** Mantelbuizen voor in de grond gevormde palen [mm]: dezelfde buisreeks, vanaf Ø323,9. */
export const CASING_OD = STEEL_TUBE_OD.filter((d) => d > 300);

/** Prefab betonpalen, vierkant [mm]. */
export const PREFAB_SQUARE = [180, 220, 250, 290, 320, 350, 400, 450];

/** Houten palen: diameter bij de las of kop [mm]; de punt is standaard Ø150. */
export const TIMBER_HEAD = [160, 180, 200, 220, 240, 260];
export const TIMBER_TOE_MM = 150;
/** Gezaagde houten palen a × b [mm]: een beginreeks van vierkante en rechthoekige
 *  doorsneden. Geen normreeks; in de instellingen aan te vullen. */
export const TIMBER_RECT: ReadonlyArray<readonly [number, number]> = [
  [100, 100], [120, 120], [150, 150], [180, 180], [200, 200], [220, 220], [250, 250], [300, 300],
  [100, 150], [100, 200], [150, 200], [150, 250], [200, 250], [200, 300],
];
/** Opmaak van een doorsnede a × b. */
export const rectText = (a: number, b: number) => `${sizeText(a)}×${sizeText(b)}`;

/** Betonopzetters op houten palen. */
export const EXTENSION_PRESETS = [
  { id: "rond-280", label: "Rond Ø280", sizeMm: 280, isCircular: true },
  { id: "rond-180", label: "Rond Ø180", sizeMm: 180, isCircular: true },
  { id: "rond-220", label: "Rond Ø220", sizeMm: 220, isCircular: true },
  { id: "rond-250", label: "Rond Ø250", sizeMm: 250, isCircular: true },
  { id: "rond-480", label: "Rond Ø480", sizeMm: 480, isCircular: true },
  { id: "vierkant-220", label: "Vierkant 220×220", sizeMm: 220, isCircular: false },
  { id: "vierkant-250", label: "Vierkant 250×250", sizeMm: 250, isCircular: false },
  { id: "vierkant-320", label: "Vierkant 320×320", sizeMm: 320, isCircular: false },
  { id: "vierkant-480", label: "Vierkant 480×480", sizeMm: 480, isCircular: false },
] as const;
export const EXTENSION_LENGTHS_M = [1.5, 2, 2.5, 4];

/** Dichtstbijzijnde maat uit een reeks. */
export const nearest = (list: readonly number[], v: number) => list.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a, list[0]);

/** Opmaak van een maat met decimale komma (168,3). */
export function sizeText(v: number) { return String(v).replace(".", ","); }

/** Standaard maatreeks per paaltype; andere typen hebben geen standaardreeks. */
export const DEFAULT_SIZES: Record<string, number[]> = {
  "concrete-prefab-prestressed-driven": PREFAB_SQUARE,
  "timber-uniform": TIMBER_HEAD,
  "steel-pipe-driven-closed": STEEL_TUBE_OD,
  "steel-pipe-driven-closed-2017": STEEL_TUBE_OD,
  "steel-screw-permanent-casing": STEEL_TUBE_OD,
  // In de grond gevormd met een stalen mantelbuis: de buisreeks vanaf Ø323,9.
  "concrete-driven-casing-hammered": CASING_OD,
  "concrete-driven-casing-vibrated": CASING_OD,
  "concrete-screw-displacement": CASING_OD,
  "concrete-screw-soil-displacing": CASING_OD,
};

export interface Presets {
  sizesMm?: Record<string, number[]>;
  extensions?: Array<{ sizeMm: number; isCircular: boolean }>;
  extensionLengthsM?: number[];
  timberToeMm?: number;
  rectSizesMm?: Array<[number, number]>;
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
  const rect: ReadonlyArray<readonly [number, number]> = presets?.rectSizesMm?.length ? presets.rectSizesMm : TIMBER_RECT;
  return {
    // Gezaagd hout: de vierkante doorsneden uit de reeks a × b (voor de draagvermogentabel).
    sizes: pileTypeId === "timber-square" ? [...new Set(rect.filter(([a, b]) => a === b).map(([a]) => a))].sort((a, b) => a - b)
      : presets?.sizesMm?.[pileTypeId] ?? DEFAULT_SIZES[pileTypeId],
    rect,
    extensions: (presets?.extensions?.length ? presets.extensions : EXTENSION_PRESETS).map(extensionPreset),
    extensionLengths: presets?.extensionLengthsM?.length ? presets.extensionLengthsM : EXTENSION_LENGTHS_M,
    timberToeMm: presets?.timberToeMm ?? TIMBER_TOE_MM,
  };
}
