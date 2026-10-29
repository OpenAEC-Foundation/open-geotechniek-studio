/** Normalized Qt/Fr/Bq and Robertson–Wride Ic (n=1 reference formulation).
 * Robertson & Cabal, Guide to In-Situ Testing, 2nd ed. 2022, Fig. 16 / glossary.
 * This does not infer sensitive/cemented zones 1, 8, 9 from Ic alone.
 */
export interface NormalizedInput {
  qcMpa: number;
  fsMpa: number;
  u2Mpa: number;
  areaRatio: number;
  totalStressKpa: number;
  waterPressureKpa: number;
}
export function zoneForIc(ic: number): { number: number; name: string } | null {
  if (!Number.isFinite(ic) || ic < 0) return null;
  return ic > 3.6
    ? { number: 2, name: "Organische grond" }
    : ic >= 2.95
      ? { number: 3, name: "Klei" }
      : ic >= 2.6
        ? { number: 4, name: "Siltmengsel" }
        : ic >= 2.05
          ? { number: 5, name: "Zandmengsel" }
          : ic >= 1.31
            ? { number: 6, name: "Zand" }
            : { number: 7, name: "Grindhoudend zand" };
}
export function normalizeCpt(
  input: NormalizedInput,
):
  | { ok: false; error: string }
  | {
      ok: true;
      qtMpa: number;
      netResistanceKpa: number;
      effectiveStressKpa: number;
      Qt: number;
      Fr: number;
      Bq: number;
      Ic: number;
      zone: { number: number; name: string };
      normalizationExponent: 1;
    } {
  if (
    !input ||
    ![
      "qcMpa",
      "fsMpa",
      "u2Mpa",
      "areaRatio",
      "totalStressKpa",
      "waterPressureKpa",
    ].every((key) => Number.isFinite(input[key as keyof NormalizedInput]))
  )
    return { ok: false, error: "Vul alle meetwaarden en spanningen in." };
  if (
    input.areaRatio <= 0 ||
    input.areaRatio > 1 ||
    input.qcMpa <= 0 ||
    input.fsMpa <= 0 ||
    input.totalStressKpa < 0
  )
    return {
      ok: false,
      error: "Vereist: qc en fs > 0, 0 < a ≤ 1 en totale spanning ≥ 0.",
    };
  const qtMpa = input.qcMpa + (1 - input.areaRatio) * input.u2Mpa;
  const netResistanceKpa = qtMpa * 1000 - input.totalStressKpa,
    effectiveStressKpa = input.totalStressKpa - input.waterPressureKpa;
  if (netResistanceKpa <= 0 || effectiveStressKpa <= 0)
    return {
      ok: false,
      error:
        "Netto conusweerstand en effectieve verticale spanning moeten positief zijn.",
    };
  const Qt = netResistanceKpa / effectiveStressKpa,
    Fr = (100 * input.fsMpa * 1000) / netResistanceKpa,
    Bq = (input.u2Mpa * 1000 - input.waterPressureKpa) / netResistanceKpa;
  const Ic = Math.hypot(3.47 - Math.log10(Qt), Math.log10(Fr) + 1.22),
    zone = zoneForIc(Ic);
  if (
    ![qtMpa, netResistanceKpa, effectiveStressKpa, Qt, Fr, Bq, Ic].every(
      Number.isFinite,
    ) ||
    !zone
  )
    return { ok: false, error: "Punt ligt buiten het numerieke bereik." };
  return {
    ok: true,
    qtMpa,
    netResistanceKpa,
    effectiveStressKpa,
    Qt,
    Fr,
    Bq,
    Ic,
    zone,
    normalizationExponent: 1,
  };
}
