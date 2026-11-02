// apps/desktop/src/calc/modules/pile-bearing-capacity/parts/summary.ts
import type { PileInput, SummaryResult } from "../types";
import { historicalXi } from "../standards";

export interface SummaryArgs {
  standard?: PileInput["standard"];
  rbCalMax: number;
  rsCalMax: number;
  fnkD: number;
  nEd: number;
  gammaM: number;
}

export function computeSummary(args: SummaryArgs): SummaryResult {
  // Tabel A.10a n=1: ξ3 = ξ4 = 1.39
  const xi3 = 1.39;
  const xi4 = 1.39;
  const rcCal = args.rbCalMax + args.rsCalMax;
  const xi = historicalXi(args.standard);
  const rcK = xi === undefined ? rcCal / xi3 : xi * rcCal;
  const rcD = rcK / args.gammaM;
  const rcNetD = rcD - args.fnkD;
  const unityCheck = rcNetD > 0 ? args.nEd / rcNetD : Infinity;
  return {
    historicalXi: xi,
    xi3,
    xi4,
    rcCal,
    rcK,
    rcD,
    rcNetD,
    unityCheck,
    passes: unityCheck <= 1,
  };
}
