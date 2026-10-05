// apps/desktop/src/calc/modules/pile-bearing-capacity/parts/shaft-friction.ts
import type { Cpt } from "../../../../types/cpt";
import type { PileTypeSpec, SoilLayer, ShaftFrictionResult } from "../types";
import { QS_MAX_PER_SOIL } from "../catalog";
import { pileGeometry } from "./geometry";
import { QcProfile } from "./qc-profile";

interface Args {
  qcCapMpa?: number;
  /** Historische zandprocedure: alleen alphaS × de begrensde qc. */
  useSoilStressCap?: boolean;
  pileType: PileTypeSpec;
  diameterMm: number;
  negKleefBottomNap: number;
  pileToeNap: number;
}

/** NEN 9997-1 §7.6.2.3: voor de schachtwrijving wordt de in rekening te
 *  brengen conusweerstand begrensd op 15 MPa. Conform de externe
 *  referentie-berekening passen we de begrenzing toe op het LAAG-
 *  GEMIDDELDE q_c;j;gem (niet per meetpunt) — per-punt cappen drukte
 *  S1 in de verificatieset 7% onder de referentiewaarde. (De aanvullende
 *  12 MPa-regel voor dikke zandpakketten laten we buiten beschouwing.) */
const QC_CAP_SHAFT_MPA = 15;

export function computeShaftFriction(
  cpt: Cpt,
  args: Args,
  soilProfile: SoilLayer[],
): ShaftFrictionResult {
  const Os = pileGeometry(args.diameterMm, args.pileType.isCircular).perimeterM;

  // Schachtwrijvings-zone: tussen negKleefBottomNap en pileToeNap
  // (alleen POSITIEVE schachtwrijving)
  const zoneTop = args.negKleefBottomNap;
  const zoneBot = args.pileToeNap;
  const layersInZone = soilProfile.filter(
    (l) => l.endNap < zoneTop && l.startNap > zoneBot,
  );

  const groundNap = cpt.metadata.ground_level_nap ?? 0;

  const profile = new QcProfile(cpt);

  const perLayer = layersInZone.map((l) => {
    const layerTop = Math.min(l.startNap, zoneTop);
    const layerBot = Math.max(l.endNap, zoneBot);
    const thickness = layerTop - layerBot;
    // Laag-gemiddelde qc, begrensd op 15 MPa (zie const-comment boven).
    const topDepth = groundNap - layerTop, bottomDepth = groundNap - layerBot;
    const qcGemMpa = args.qcCapMpa === undefined
      ? Math.min(profile.average(topDepth, bottomDepth), QC_CAP_SHAFT_MPA)
      : profile.averageCapped(topDepth, bottomDepth, args.qcCapMpa);
    const qsRaw = args.pileType.alphaS * qcGemMpa;
    const qsCap = args.useSoilStressCap === false ? Infinity : QS_MAX_PER_SOIL[l.kind];
    const qsMpa = Math.min(qsRaw, qsCap);
    const rsLayer = Os * qsMpa * thickness * 1000; // kN: m × MPa × m × 1000 = kN
    return { layer: l, qcGemMpa, qsMpa, rsLayer };
  });

  const rsCalMax = perLayer.reduce((s, l) => s + l.rsLayer, 0);

  return { perLayer, rsCalMax };
}
