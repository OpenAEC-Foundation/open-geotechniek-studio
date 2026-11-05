/** Materiaalkleuren voor paaltekeningen (scherm en rapport). */
export type PileMaterial = "concrete" | "steel" | "wood";
export const MATERIAL_COLORS: Record<PileMaterial, { fill: string; rgb: [number, number, number]; dark: string }> = {
  concrete: { fill: "#a9abaf", rgb: [169, 171, 175], dark: "#6b6e73" },
  steel: { fill: "#b5543c", rgb: [181, 84, 60], dark: "#7d3423" },
  wood: { fill: "#b9864f", rgb: [185, 134, 79], dark: "#7e5427" },
};
export const materialColor = (m: string | undefined) => MATERIAL_COLORS[(m as PileMaterial) in MATERIAL_COLORS ? (m as PileMaterial) : "steel"];
