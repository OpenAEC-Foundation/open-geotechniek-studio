// Paalklassefactoren NEN 9997-1:2025 (+C1:2025), tabel 7.c — DE ENE TABEL.
//
// Hier staat per paaltype (id uit catalog.ts) wat er voor de editie 2025
// bekend is. Een waarde komt er alleen in als ze in een betrouwbare bron is
// gelezen; de vindplaatsen staan in PAALFACTOREN-2025.md. Er wordt niets
// geschat of uit de editie 2017 overgenomen.
//
// Aanvullen: vul bij het paaltype alle velden in (alphaP, alphaS, alphaT,
// beta, s, settlementLine) en noem de bron. Zodra een regel volledig is, is
// het type bij de editie 2025 te kiezen. Een onvolledige regel wordt nooit
// gebruikt om mee te rekenen. Zijn alle typen uit COMMON_TYPES_2025 volledig,
// dan wordt 2025 vanzelf de standaard voor nieuwe berekeningen.

export interface Factors2025 {
  /** Paalklassefactor punt. */
  alphaP: number;
  /** Paalklassefactor schacht, zand en grindhoudend zand. */
  alphaS: number;
  /** Paalklassefactor trek. */
  alphaT: number;
  /** Paalvoetvormfactor. */
  beta: number;
  /** Factor voor de vorm van de doorsnede van de paalvoet. */
  s: number;
  /** Lastzakkingslijn volgens de tabel. */
  settlementLine: 1 | 2 | 3;
  /** Vindplaats: tabel en rij in de norm, of URL en plaats in het document. */
  source: string;
}

export type FactorTable2025 = Record<string, Partial<Factors2025>>;

export const FACTORS_2025: FactorTable2025 = {
  // Prefab betonpaal, geheid (vierkant / rond)
  "concrete-prefab-prestressed-driven": {},
  "concrete-prefab-round": {},
  // Stalen buispaal, gesloten punt, geheid
  "steel-pipe-driven-closed-2017": {},
  // Vibropaal: mantelbuis terugheiend / trillend getrokken
  "concrete-driven-casing-hammered": {},
  "concrete-driven-casing-vibrated": {},
  // Schroefpaal met verloren punt: getrokken buis / blijvende stalen buis
  "concrete-screw-displacement": {},
  "steel-screw-permanent-casing": {},
  // Schroefinjectiepaal
  "steel-screw-grout": {},
  // Grondverdringende schroefpaal en verbuisde avegaarpaal (DPA)
  "concrete-screw-soil-displacing": {},
  "concrete-auger-cased": {},
  // Avegaarpaal en boorpaal
  "concrete-auger": {},
  "concrete-bored": {},
  // Houten paal
  "timber-uniform": {},
};

/** Gangbare typen: zijn deze volledig, dan wordt 2025 de standaard voor nieuwe berekeningen. */
export const COMMON_TYPES_2025 = [
  "concrete-prefab-prestressed-driven",
  "steel-pipe-driven-closed-2017",
  "concrete-driven-casing-hammered",
  "concrete-screw-displacement",
  "steel-screw-grout",
  "concrete-auger",
  "concrete-bored",
  "timber-uniform",
] as const;

const NUMERIC = ["alphaP", "alphaS", "alphaT", "beta", "s"] as const;

/** Volledige en geldige regel, anders undefined. */
export function factors2025(pileTypeId: string, table: FactorTable2025 = FACTORS_2025): Factors2025 | undefined {
  const f = table[pileTypeId];
  if (!f) return undefined;
  if (!NUMERIC.every((k) => typeof f[k] === "number" && Number.isFinite(f[k]))) return undefined;
  if (!(f.alphaP! > 0) || f.alphaS! < 0 || f.alphaT! < 0 || !(f.beta! > 0) || f.beta! > 1 || !(f.s! > 0)) return undefined;
  if (f.settlementLine !== 1 && f.settlementLine !== 2 && f.settlementLine !== 3) return undefined;
  if (!f.source?.trim()) return undefined;
  return f as Factors2025;
}

/** Zijn alle gangbare typen volledig ingevuld? */
export function table2025Complete(table: FactorTable2025 = FACTORS_2025): boolean {
  return COMMON_TYPES_2025.every((id) => !!factors2025(id, table));
}
