// Grondsoorten met startwaarden voor de laagtabel, en de sets partiële factoren.
//
// De grondwaarden zijn indicatieve startwaarden in de orde van de gangbare
// tabelwaarden (lage representatieve waarden); ze zijn niet tegen de normtekst
// nagelopen (zie VERIFICATIE.md, open punten). De gebruiker past ze per laag aan.

export interface SoilType {
  id: string;
  name: string;
  /** Volumegewicht boven de grondwaterstand [kN/m³]. */
  gamma: number;
  /** Verzadigd volumegewicht [kN/m³]. */
  gammaSat: number;
  /** Hoek van inwendige wrijving φ' [°]. */
  phi: number;
  /** Effectieve cohesie c' [kPa]. */
  c: number;
  /** Ongedraineerde schuifsterkte cu [kPa]; 0 = niet-cohesief. */
  cu: number;
  color: string;
}

export const SOIL_TYPES: SoilType[] = [
  { id: "sand-loose", name: "Zand, los", gamma: 17, gammaSat: 19, phi: 30, c: 0, cu: 0, color: "#FFC107" },
  { id: "sand-medium", name: "Zand, matig", gamma: 18, gammaSat: 20, phi: 32.5, c: 0, cu: 0, color: "#FF9800" },
  { id: "sand-dense", name: "Zand, vast", gamma: 19, gammaSat: 21, phi: 35, c: 0, cu: 0, color: "#FF5722" },
  { id: "sand-clayey", name: "Zand, kleiig of siltig", gamma: 18, gammaSat: 20, phi: 27.5, c: 0, cu: 0, color: "#FFD54F" },
  { id: "loam-soft", name: "Leem, slap", gamma: 19, gammaSat: 19, phi: 27.5, c: 0, cu: 50, color: "#8BC34A" },
  { id: "loam-stiff", name: "Leem, matig tot vast", gamma: 20, gammaSat: 20, phi: 27.5, c: 1, cu: 100, color: "#7CB342" },
  { id: "clay-soft", name: "Klei, slap", gamma: 14, gammaSat: 14, phi: 17.5, c: 0, cu: 25, color: "#81C784" },
  { id: "clay-medium", name: "Klei, matig", gamma: 17, gammaSat: 17, phi: 17.5, c: 5, cu: 50, color: "#4CAF50" },
  { id: "clay-stiff", name: "Klei, vast", gamma: 19, gammaSat: 19, phi: 17.5, c: 13, cu: 100, color: "#388E3C" },
  { id: "peat", name: "Veen", gamma: 11, gammaSat: 11, phi: 15, c: 1, cu: 10, color: "#795548" },
];

export const getSoilType = (id: string | undefined): SoilType | undefined => SOIL_TYPES.find((s) => s.id === id);

/**
 * Grondsoort bij een zone uit de indicatieve laagindeling van de sondering
 * (zones 1 tot en met 9) en de gemiddelde conusweerstand van de laag [MPa].
 */
export function soilTypeForZone(zone: number, qcMpa: number): SoilType {
  const pick = (id: string) => getSoilType(id)!;
  switch (zone) {
    case 1: return pick("clay-soft");
    case 2: return pick("peat");
    case 3: return pick(qcMpa < 0.5 ? "clay-soft" : qcMpa < 1.5 ? "clay-medium" : "clay-stiff");
    case 4: return pick(qcMpa < 1.5 ? "loam-soft" : "loam-stiff");
    case 5: return pick("sand-clayey");
    case 6: return pick(qcMpa < 5 ? "sand-loose" : qcMpa < 15 ? "sand-medium" : "sand-dense");
    case 7: return pick(qcMpa < 15 ? "sand-medium" : "sand-dense");
    case 8: return pick("sand-dense");
    default: return pick("clay-stiff");
  }
}

/** Partiële factoren; γφ werkt op tan φ'. */
export interface SpreadFactors {
  gammaPhi: number;
  gammaC: number;
  gammaCu: number;
  /** Volumegewicht voor het draagvermogen. */
  gammaGamma: number;
  /** Belastingfactor op het grondgewicht boven een fictief funderingsvlak (doorponsen). */
  gammaGPunch: number;
  /** Kantelen (EQU): permanent gunstig, permanent ongunstig, veranderlijk ongunstig. */
  gammaGStb: number;
  gammaGDst: number;
  gammaQDst: number;
}

export interface FactorSet { id: "spread" | "retaining"; name: string; factors: SpreadFactors }

/** Kantelen: NEN-EN 1990 tabel A1.2(A) (EQU), zoals overgenomen in de Nederlandse bijlage. */
export const EQU_FACTORS = { gammaGStb: 0.9, gammaGDst: 1.1, gammaQDst: 1.5 };

/** NEN 9997-1 tabel A.4a, kolommen "Fundering op staal" en "Keermuur". */
export const FACTOR_SETS: FactorSet[] = [
  { id: "spread", name: "Fundering op staal", factors: { gammaPhi: 1.15, gammaC: 1.6, gammaCu: 1.35, gammaGamma: 1.1, gammaGPunch: 1.2, ...EQU_FACTORS } },
  { id: "retaining", name: "Keermuur op staal", factors: { gammaPhi: 1.2, gammaC: 1.5, gammaCu: 1.5, gammaGamma: 1.1, gammaGPunch: 1.2, ...EQU_FACTORS } },
];
export const DEFAULT_FACTORS: SpreadFactors = FACTOR_SETS[0].factors;
