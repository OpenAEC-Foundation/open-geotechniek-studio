// apps/desktop/src/calc/modules/pile-bearing-capacity/parts/base-resistance.ts
import type { Cpt } from "../../../../types/cpt";
import type { PileTypeSpec, BaseResistanceResult } from "../types";
import { pileGeometry } from "./geometry";
import { QcProfile } from "./qc-profile";

interface Args {
  /** Trajectkeuze. "minimum-qb" (standaard): eindpunt van traject I zo dat qb;max
   *  minimaal is (NEN 9997-1:2016+C2:2017, art. 7.6.2.3(e)). "legacy-qci": eindpunt
   *  zo dat qc;I;gem minimaal is; niet normconform, alleen ter vergelijking met
   *  referentieberekeningen die zo kiezen (zie NUMERIEKE-VERIFICATIE.md). */
  method?: "legacy-qci" | "minimum-qb";
  pileToeDepth: number;        // depth onder maaiveld in m
  diameterMm: number;
  /** Tweede zijde van een rechthoekige paalvoet [mm]; ontbrekend = vierkant of rond. */
  sideBMm?: number;
  pileType: PileTypeSpec;
  /** Eigen keuze, geen normregel: qc in traject I en II vóór de middeling op deze
   *  waarde begrenzen [MPa]. Traject III volgt via het lopende minimum vanzelf. */
  qcCapMpa?: number;
}

/**
 * 4D-8D-methode, NEN 9997-1:2016+C2:2017, art. 7.6.2.3(e). Samenvatting, geen
 * normcitaat:
 *
 *   q_b;max = ½ · α_p · β · s · ((q_c;I;gem + q_c;II;gem) / 2 + q_c;III;gem) ≤ 15 MPa
 *
 *   traject I   : paalpunt tot 0,7..4 Deq eronder, rekenkundig gemiddelde.
 *   traject II  : van het eindpunt van traject I naar boven tot de paalpunt; de
 *                 in rekening te brengen qc is nooit hoger dan de eronder
 *                 liggende waarde (lopend minimum, beginnend bij de gemeten qc
 *                 op het eindpunt van traject I; geen extra begrenzing op q_c;I).
 *   traject III : van de paalpunt naar boven tot 8 Deq erboven; lopend minimum,
 *                 beginnend bij de laagste in rekening gebrachte waarde van
 *                 traject II (avegaarpaal 2017: start ten hoogste 2 MPa).
 *
 * De afkapregels hierboven gelden voor beide trajectkeuzes. Kandidaten voor het
 * eindpunt van traject I: stappen van 0,01 Deq, beide grenzen en de meetpunten
 * daartussen (een discrete minimumbepaling). Het onderzoek naar de trajectkeuze
 * staat in NUMERIEKE-VERIFICATIE.md.
 */

/** Puntweerstand uit reeds bepaalde trajectgemiddelden. */
export function computeBaseResistanceFromAverages(
  args: Omit<Args, "pileToeDepth"> & Pick<BaseResistanceResult, "qcIGemMpa" | "qcIIGemMpa" | "qcIIIGemMpa">,
): Pick<BaseResistanceResult, "deqMm" | "abMm2" | "qbMaxMpaRaw" | "qbMaxMpa" | "rbCalMax"> {
  const geometry = pileGeometry(args.diameterMm, args.pileType.isCircular, args.sideBMm);
  const { alphaP, beta, s } = args.pileType;
  const qbMaxMpaRaw = 0.5 * alphaP * beta * s * ((args.qcIGemMpa + args.qcIIGemMpa) / 2 + args.qcIIIGemMpa);
  const qbMaxMpa = Math.min(qbMaxMpaRaw, 15);
  return {
    deqMm: geometry.equivalentDiameterMm,
    abMm2: geometry.areaMm2,
    qbMaxMpaRaw,
    qbMaxMpa,
    rbCalMax: geometry.areaMm2 * qbMaxMpa / 1000,
  };
}

export function computeBaseResistance(cpt: Cpt, args: Args): BaseResistanceResult {
  const profile = new QcProfile(cpt);
  const deq = pileGeometry(args.diameterMm, args.pileType.isCircular, args.sideBMm).equivalentDiameterMm / 1000;
  const toe = args.pileToeDepth;
  const top = Math.max(0, toe - 8 * deq);
  const cap = args.qcCapMpa ?? Infinity;
  const averageI = (dc: number) => Number.isFinite(cap) ? profile.averageCapped(toe, toe + dc, cap) : profile.average(toe, toe + dc);
  const evaluate = (dc: number, capture = false): BaseResistanceResult => {
    const qcIGemMpa = averageI(dc);
    // Begrenzen van elke qc op `cap` en daarna het lopende minimum nemen is gelijk
    // aan het lopende minimum met beginwaarde `cap`.
    const ii = profile.walkUp(toe + dc, toe, cap, capture);
    const iii = profile.walkUp(toe, top, Math.min(ii.finalMin, args.pileType.qcIIIStartCapMpa ?? Infinity), capture);
    const averages = { qcIGemMpa, qcIIGemMpa: ii.avg, qcIIIGemMpa: iii.avg };
    return { ...computeBaseResistanceFromAverages({ ...args, ...averages }), ...averages,
      criticalDepthM: dc, zoneIIITopDepthM: top, clippedQcCurve: capture ? [...iii.clippedPoints, ...ii.clippedPoints] : undefined };
  };
  // Het eindpunt blijft binnen de meetgegevens; compute.ts eist ten minste 0,7 Deq.
  const lastDepth = profile.depths[profile.depths.length - 1] ?? toe;
  const lower = .7 * deq, upper = Math.max(lower, Math.min(4 * deq, lastDepth - toe));
  const candidates = new Set<number>([lower, upper]);
  for (let i = 1; i < 330; i++) if ((.7 + i * .01) * deq < upper) candidates.add((.7 + i * .01) * deq);
  for (const depth of profile.depths) if (depth > toe + lower && depth < toe + upper) candidates.add(depth - toe);
  const sorted = [...candidates].sort((a, b) => a - b);
  if (args.method !== "legacy-qci") {
    let best = evaluate(lower);
    for (const dc of sorted) {
      const value = evaluate(dc);
      if (value.qbMaxMpaRaw < best.qbMaxMpaRaw - 1e-12) best = value;
    }
    return evaluate(best.criticalDepthM, true);
  }
  let bestDc = lower, bestQcI = averageI(lower);
  for (const dc of sorted) {
    const q = averageI(dc);
    if (q < bestQcI - 1e-12) { bestQcI = q; bestDc = dc; }
  }
  return evaluate(bestDc, true);
}
