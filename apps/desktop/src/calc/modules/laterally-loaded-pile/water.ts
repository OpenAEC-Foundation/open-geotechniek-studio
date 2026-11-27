// Paal in open water: de paal staat tussen de kop en de waterbodem vrij in het water (geen grondveren), de grond begint
// op de waterbodem. De korrelspanning in de grond volgt dan uit het effectieve volumegewicht vanaf de waterbodem; het
// water erboven geeft geen bovenbelasting (het verhoogt de totale en de waterspanning even veel). In deze module komt
// de korrelspanning alleen voor in de grensweerstand volgens Brinch Hansen (γ′ · z, z vanaf de waterbodem).
//
// Stroming (optioneel): sleepkracht per meter paal q = ½ · ρ · C_D · D · u(z)², verdeeld van de waterbodem tot het
// waterpeil (begrensd tot de paalkop), als rekenwaarde q_d = γ · q in de richting van H of ertegenin. Snelheidsprofiel:
// uniform, of u(h) = u_opp · (h / d)^n met h de hoogte boven de bodem, d de waterdiepte en n de exponent (1/7 als
// voorstel; machtsprofiel voor een turbulente stroming). Niet meegenomen: golfbelasting (Morison, traagheidsterm),
// wervelafschudding en andere dynamische effecten, aangroei anders dan via C_D, kolkvorming.
import { ct } from '../../i18n';
import type { LateralInput } from './compute';

export interface CurrentLoad {
  /** Stroomsnelheid [m/s]; bij het machtsprofiel de snelheid aan het wateroppervlak. */
  speedMs: number;
  profile: 'uniform' | 'power';
  /** Exponent n van het machtsprofiel u(h) = u · (h/d)^n. */
  exponent: number;
  /** Dichtheid water [kg/m³]: 1000 zoet, 1025 zout. */
  densityKgM3: number;
  /** Weerstandscoëfficiënt C_D [–]; leeg = niet ingevuld (verplicht zodra u > 0). */
  cd: number | null;
  /** 1: in de richting van H; −1: ertegenin. */
  sign: 1 | -1;
  /** Partiële factor op de stromingslast (rekenwaarde = factor × representatieve last). */
  factor: number;
}
export interface WaterBed {
  enabled: boolean;
  /** Waterbodem en waterpeil [m NAP]. */
  bedNap: number;
  waterNap: number;
  current?: CurrentLoad;
}
export const DEFAULT_CURRENT: CurrentLoad = { speedMs: 0, profile: 'uniform', exponent: 1 / 7, densityKgM3: 1000, cd: null, sign: 1, factor: 1.5 };

export interface WaterInfo {
  bedNap: number; waterNap: number; bedDepthM: number;
  /** Vrije lengte van de paalkop tot de waterbodem [m]. */
  freeLengthM: number;
  current: null | {
    widthM: number; cd: number; densityKgM3: number; speedMs: number; profile: CurrentLoad['profile']; exponent: number; factor: number; sign: 1 | -1;
    /** Belaste zone, diepte onder de kop [m]. */
    topM: number; bottomM: number;
    /** Representatieve last per meter aan het wateroppervlak (grootste waarde) [kN/m]. */
    qMaxKnM: number;
    /** Rekenwaarde van de resultante [kN] (met factor en teken) en haar aangrijppunt [m NAP]. */
    resultantKn: number; resultantNap: number;
  };
}

/** Breedte die de stroming ziet: de paalbreedte; bij een damwandprofiel de werkende breedte. */
const exposedWidth = (input: LateralInput) => input.section.kind === 'sheet-pile' ? input.springWidthM : input.section.diameterMm / 1000;

/** Representatieve sleepkracht per meter [kN/m] op hoogte h boven de bodem bij waterdiepte d. */
export function currentLoadKnM(c: CurrentLoad, widthM: number, heightM: number, depthM: number): number {
  const u = c.profile === 'power' ? c.speedMs * Math.pow(Math.max(0, Math.min(1, heightM / depthM)), c.exponent) : c.speedMs;
  return 0.5 * c.densityKgM3 * (c.cd ?? 0) * widthM * u * u / 1000;
}

/** Waterbodem en stroming voor de rekenkern; null zonder (aangevinkte) waterbodem. */
export function waterInfo(input: LateralInput): null | { bedDepthM: number; lineLoad?: { topM: number; bottomM: number; at: (z: number) => number }; info: WaterInfo } {
  const w = input.waterBed;
  if (!w?.enabled) return null;
  const head = input.headNap ?? 0;
  if (![w.bedNap, w.waterNap].every(Number.isFinite)) throw new Error(ct('calcLateral', 'errors.waterLevels', 'Vul het niveau van de waterbodem en het waterpeil in.'));
  const bedDepthM = head - w.bedNap;
  if (!(bedDepthM >= 0 && bedDepthM < input.lengthM)) throw new Error(ct('calcLateral', 'errors.bedOutsidePile', 'De waterbodem moet tussen de paalkop en de paalpunt liggen.'));
  const info: WaterInfo = { bedNap: w.bedNap, waterNap: w.waterNap, bedDepthM, freeLengthM: bedDepthM, current: null };
  const c = w.current, depthM = w.waterNap - w.bedNap;
  if (!c || !(c.speedMs > 0) || !(depthM > 0)) return { bedDepthM, info };
  if (!(c.cd !== null && Number.isFinite(c.cd) && c.cd > 0)) throw new Error(ct('calcLateral', 'errors.currentCd', 'Stroming: vul de weerstandscoëfficiënt C_D in.'));
  if (!(Number.isFinite(c.speedMs) && c.densityKgM3 > 0 && c.factor > 0 && (c.sign === 1 || c.sign === -1) && (c.profile === 'uniform' || (c.profile === 'power' && c.exponent > 0 && c.exponent <= 1))))
    throw new Error(ct('calcLateral', 'errors.currentInput', 'Ongeldige invoer voor de stroming.'));
  const widthM = exposedWidth(input), topM = Math.max(0, head - w.waterNap), bottomM = bedDepthM;
  const at = (z: number) => c.sign * c.factor * currentLoadKnM(c, widthM, bedDepthM - z, depthM);
  // Resultante en aangrijppunt met Simpson (het machtsprofiel is aan de bodem niet glad: 2000 stappen).
  let F = 0, M = 0;
  if (bottomM > topM) {
    const n = 2000, h = (bottomM - topM) / n;
    for (let i = 0; i <= n; i++) { const z = topM + i * h, wgt = (i === 0 || i === n ? 1 : i % 2 ? 4 : 2) * h / 3, q = at(z); F += wgt * q; M += wgt * q * z; }
  }
  const resultantNap = F !== 0 ? head - M / F : head - (topM + bottomM) / 2;
  info.current = { widthM, cd: c.cd, densityKgM3: c.densityKgM3, speedMs: c.speedMs, profile: c.profile, exponent: c.exponent, factor: c.factor, sign: c.sign,
    topM, bottomM, qMaxKnM: currentLoadKnM(c, widthM, depthM, depthM), resultantKn: F, resultantNap };
  return { bedDepthM, lineLoad: bottomM > topM ? { topM, bottomM, at } : undefined, info };
}
