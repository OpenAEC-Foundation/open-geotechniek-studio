// Paalklassefactoren αt voor zand en grindhoudend zand (NEN 9997-1 tabel 7.c, editie 2017).
// In de editie van 2025 zijn de factoren voor onder meer schroefinjectie-, avegaar- en
// geheide stalen palen verlaagd; die waarden staan hier nog niet in.

export interface TensionPileType {
  id: string;
  name: string;
  alphaT: number;
  isCircular: boolean;
  /** Grondverdringing: bepaalt de tophoek van de kluit en of het paalgewicht meetelt. */
  displacement: "full" | "low" | "none";
  /** Volumegewicht van de paal voor het eigen gewicht [kN/m³]; 0 = telt niet mee. */
  pileWeightKnM3: number;
  /** Standaardmaten [mm]. */
  sizesMm: number[];
  note?: string;
}

const ROUND_TUBES = [168, 193, 219, 273, 324, 356, 406, 457, 508];
const ROUND_CAST = [300, 350, 400, 450, 500, 550, 600];

export const TENSION_PILE_TYPES: TensionPileType[] = [
  { id: "prefab-concrete", name: "Prefab beton, geheid", alphaT: 0.007, isCircular: false, displacement: "full", pileWeightKnM3: 24, sizesMm: [220, 250, 290, 320, 350, 400, 450] },
  { id: "steel-tube-closed", name: "Stalen buis met gesloten punt, geheid", alphaT: 0.007, isCircular: true, displacement: "full", pileWeightKnM3: 24, sizesMm: ROUND_TUBES,
    note: "Het paalgewicht gaat uit van een met beton gevulde buis." },
  { id: "timber", name: "Hout, geheid", alphaT: 0.007, isCircular: true, displacement: "full", pileWeightKnM3: 0, sizesMm: [120, 140, 160, 180] },
  { id: "vibro-redriven", name: "In de grond gevormd, buis teruggeheid (vibro)", alphaT: 0.012, isCircular: true, displacement: "full", pileWeightKnM3: 24, sizesMm: ROUND_CAST },
  { id: "vibro-vibrated", name: "In de grond gevormd, buis trillend getrokken", alphaT: 0.010, isCircular: true, displacement: "full", pileWeightKnM3: 24, sizesMm: ROUND_CAST },
  { id: "screw-lost-tip", name: "Geschroefd met verloren punt, grondverdringend", alphaT: 0.009, isCircular: true, displacement: "full", pileWeightKnM3: 24, sizesMm: ROUND_CAST },
  { id: "screw-injection", name: "Schroefinjectiepaal (groutschil, D ≥ 300 mm)", alphaT: 0.009, isCircular: true, displacement: "low", pileWeightKnM3: 0, sizesMm: [300, 350, 400, 450],
    note: "Bij een schroefblad kleiner dan 400 mm geldt volgens CUR 236 αt = 0,008; pas zo nodig een eigen αt toe." },
  { id: "mv-pile", name: "MV-paal (profiel met groutschil)", alphaT: 0.012, isCircular: false, displacement: "low", pileWeightKnM3: 0, sizesMm: [300, 350, 400, 450] },
  { id: "cfa", name: "Avegaarpaal", alphaT: 0.0045, isCircular: true, displacement: "none", pileWeightKnM3: 0, sizesMm: ROUND_CAST },
  { id: "bored", name: "Boorpaal met steunvloeistof", alphaT: 0.0045, isCircular: true, displacement: "none", pileWeightKnM3: 0, sizesMm: [500, 600, 800, 1000, 1200] },
  { id: "steel-open", name: "Open stalen buis of profiel, geheid", alphaT: 0.0045, isCircular: true, displacement: "low", pileWeightKnM3: 0, sizesMm: ROUND_TUBES },
  { id: "screw-tube", name: "Stalen buis met schroefpunt, zonder grout", alphaT: 0.0045, isCircular: true, displacement: "low", pileWeightKnM3: 0, sizesMm: ROUND_TUBES },
];

export function getTensionPileType(id: string): TensionPileType | undefined {
  return TENSION_PILE_TYPES.find((t) => t.id === id);
}
