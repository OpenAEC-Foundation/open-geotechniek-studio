/** One-dimensional, drained compression with a constant constrained modulus.
 * s = H Δσ′ / M. H in m, stress in kPa, M in MPa => s in mm.
 * Source: USACE EM 1110-1-1905 (31 July 2025), §7–7.
 */
export interface SettlementInput {
  thicknessM: number;
  stressIncreaseKpa: number;
  constrainedModulusMpa: number;
}
export type SettlementResult =
  | { ok: false; error: string }
  | { ok: true; settlementMm: number; strain: number; warning: string | null };

export function computeSettlement(input: SettlementInput): SettlementResult {
  if (!input || ![input.thicknessM, input.stressIncreaseKpa, input.constrainedModulusMpa]
    .every((value) => typeof value === 'number' && Number.isFinite(value))) {
    return { ok: false, error: 'Vul alle velden in met eindige getallen.' };
  }
  const { thicknessM: h, stressIncreaseKpa: q, constrainedModulusMpa: m } = input;
  if (h <= 0 || m <= 0 || q < 0) {
    return { ok: false, error: 'Laagdikte en modulus moeten positief zijn; spanningstoename mag niet negatief zijn.' };
  }
  const modulusKpa = m * 1000;
  if (!Number.isFinite(modulusKpa) || modulusKpa <= 0) {
    return { ok: false, error: 'De modulus valt buiten het numerieke bereik.' };
  }
  const strain = q / modulusKpa;
  const settlementMm = h * strain * 1000;
  if (!Number.isFinite(settlementMm) || !Number.isFinite(strain) || strain >= 1) {
    return { ok: false, error: 'De invoer valt buiten het model voor kleine vervormingen (rek ≥ 100% of numerieke overschrijding).' };
  }
  return { ok: true, settlementMm, strain,
    warning: strain > 0.05 ? 'Rek groter dan 5%: controleer of een constante modulus nog passend is.' : null };
}
