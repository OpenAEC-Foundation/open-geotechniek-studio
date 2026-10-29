/** EN 1997-1 Annex D, drained analytical method. All soil/load inputs are DESIGN values.
 * Source: European Commission JRC EUR 26227 EN (2013), §3.3.1, printed pp. 22–24.
 * Rectangular horizontal base, centric vertical compression, homogeneous soil, level ground.
 * No automatic National Annex factors, groundwater model, settlement or structural concrete design.
 */
export interface PadInput {
  widthM: number;
  lengthM: number;
  verticalDesignLoadKn: number;
  frictionDesignDeg: number;
  cohesionDesignKpa: number;
  surchargeDesignKpa: number;
  effectiveUnitWeightKnM3: number;
  resistanceFactor: number;
}
export type PadResult =
  | { ok: false; error: string }
  | {
      ok: true;
      widthM: number;
      lengthM: number;
      areaM2: number;
      nq: number;
      nc: number;
      ngamma: number;
      sq: number;
      sc: number;
      sgamma: number;
      cohesionTermKpa: number;
      surchargeTermKpa: number;
      weightTermKpa: number;
      resistancePressureKpa: number;
      resistanceKn: number;
      appliedPressureKpa: number;
      utilization: number;
      passes: boolean;
      rotated: boolean;
    };
export const padExample: PadInput = {
  widthM: 2,
  lengthM: 2,
  verticalDesignLoadKn: 500,
  frictionDesignDeg: 30,
  cohesionDesignKpa: 0,
  surchargeDesignKpa: 20,
  effectiveUnitWeightKnM3: 10,
  resistanceFactor: 1.4,
};
export function computePad(input: PadInput): PadResult {
  if (
    !input ||
    Object.values(input).some(
      (value) => typeof value !== "number" || !Number.isFinite(value),
    ) ||
    !(
      [
        "widthM",
        "lengthM",
        "verticalDesignLoadKn",
        "frictionDesignDeg",
        "cohesionDesignKpa",
        "surchargeDesignKpa",
        "effectiveUnitWeightKnM3",
        "resistanceFactor",
      ] as const
    ).every((key) => Number.isFinite(input[key]))
  )
    return { ok: false, error: "Vul voor alle velden een eindig getal in." };
  if (
    input.widthM <= 0 ||
    input.lengthM <= 0 ||
    input.verticalDesignLoadKn <= 0
  )
    return {
      ok: false,
      error: "Poermaten en verticale drukbelasting moeten groter zijn dan nul.",
    };
  if (input.frictionDesignDeg < 0 || input.frictionDesignDeg > 45)
    return {
      ok: false,
      error:
        "Dit werkblad ondersteunt een ontwerpwrijvingshoek van 0 tot en met 45°.",
    };
  if (
    input.cohesionDesignKpa < 0 ||
    input.surchargeDesignKpa < 0 ||
    input.effectiveUnitWeightKnM3 < 0
  )
    return {
      ok: false,
      error:
        "Cohesie, effectieve bovenbelasting en effectief volumegewicht mogen niet negatief zijn.",
    };
  if (input.resistanceFactor < 1)
    return {
      ok: false,
      error: "De opgegeven weerstandsfactor γR;v moet minimaal 1,0 zijn.",
    };
  const widthM = Math.min(input.widthM, input.lengthM),
    lengthM = Math.max(input.widthM, input.lengthM),
    ratio = widthM / lengthM,
    areaM2 = widthM * lengthM;
  const phi = (input.frictionDesignDeg * Math.PI) / 180,
    tangent = Math.tan(phi);
  const nMinusOne = Math.expm1(
    Math.PI * tangent + 2 * Math.log(Math.tan(Math.PI / 4 + phi / 2)),
  );
  const nq = input.frictionDesignDeg === 0 ? 1 : nMinusOne + 1;
  const nc = input.frictionDesignDeg === 0 ? Math.PI + 2 : nMinusOne / tangent;
  const ngamma = 2 * (nq - 1) * tangent,
    sq = 1 + ratio * Math.sin(phi),
    sgamma = 1 - 0.3 * ratio;
  const sc =
    input.frictionDesignDeg === 0
      ? 1 + ratio / (Math.PI + 2)
      : 1 + (ratio * nq * Math.sin(phi)) / nMinusOne;
  const cohesionTermKpa = input.cohesionDesignKpa * nc * sc;
  const surchargeTermKpa = input.surchargeDesignKpa * nq * sq;
  const weightTermKpa =
    0.5 * input.effectiveUnitWeightKnM3 * widthM * ngamma * sgamma;
  const resistancePressureKpa =
    (cohesionTermKpa + surchargeTermKpa + weightTermKpa) /
    input.resistanceFactor;
  const resistanceKn = resistancePressureKpa * areaM2,
    appliedPressureKpa = input.verticalDesignLoadKn / areaM2;
  if (resistanceKn <= 0)
    return {
      ok: false,
      error:
        "Dit grondmodel levert geen positieve draagkracht. Controleer de ontwerpwaarden.",
    };
  const utilization = input.verticalDesignLoadKn / resistanceKn;
  if (
    ![
      areaM2,
      nq,
      nc,
      ngamma,
      sq,
      sc,
      sgamma,
      resistancePressureKpa,
      resistanceKn,
      appliedPressureKpa,
      utilization,
    ].every(Number.isFinite)
  )
    return {
      ok: false,
      error: "De invoer ligt buiten het numerieke bereik van dit rekenmodel.",
    };
  return {
    ok: true,
    widthM,
    lengthM,
    areaM2,
    nq,
    nc,
    ngamma,
    sq,
    sc,
    sgamma,
    cohesionTermKpa,
    surchargeTermKpa,
    weightTermKpa,
    resistancePressureKpa,
    resistanceKn,
    appliedPressureKpa,
    utilization,
    passes: utilization <= 1,
    rotated: input.widthM > input.lengthM,
  };
}
