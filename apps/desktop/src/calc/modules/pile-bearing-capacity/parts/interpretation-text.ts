// Omschrijving van een aanpassing van de grondlaaginterpretatie, gedeeld door
// het tekenpaneel, het resultaat op het scherm en de uitdraai.
import type { AppliedOverride } from "../types";
import { soilLabel } from "../catalog";
import { ct, fmtNumber } from "../../../i18n";

const tr = (key: string, nl: string, vars?: Record<string, unknown>) => ct("calcPile", `interp.${key}`, nl, vars);
const nap = (v: number) => (Number.isFinite(v) ? fmtNumber(v, 2) : "–");
const mpa = (v: number) => fmtNumber(v, 1);

/** Traject als "NAP -10,00 tot -11,50 m". */
export function overrideRange(a: Pick<AppliedOverride, "topNap" | "bottomNap">): string {
  return tr("range", "NAP {{top}} tot {{bottom}} m", { top: nap(a.topNap), bottom: nap(a.bottomNap) });
}

/**
 * Wat er is gewijzigd, als oude → nieuwe waarde; één regel per onderdeel.
 * `qcSymbol`: "qc" op het scherm, "q_c" in de uitdraai (subscript).
 */
export function overrideChanges(a: AppliedOverride, qcSymbol = "qc"): string[] {
  if (a.status === "outsideRange") return [tr("notApplied.outsideRange", "Niet toegepast: het traject valt buiten de sondering.")];
  if (a.status === "invalid") return [tr("notApplied.invalid", "Niet toegepast: ongeldig traject of geen wijziging opgegeven.")];
  const lines: string[] = [];
  if (a.qc) {
    const vars = { qc: qcSymbol, min: mpa(a.qc.measuredMinMpa), max: mpa(a.qc.measuredMaxMpa), mean: mpa(a.qc.measuredMeanMpa), top: mpa(a.qc.topMpa), bottom: mpa(a.qc.bottomMpa) };
    lines.push(a.override.qc?.mode === "fixed"
      ? tr("change.qcFixed", "{{qc}}: gemeten {{min}}–{{max}} MPa (gemiddeld {{mean}}) → vaste waarde {{top}} MPa", vars)
      : tr("change.qcLinear", "{{qc}}: gemeten {{min}}–{{max}} MPa (gemiddeld {{mean}}) → lineair van {{top}} naar {{bottom}} MPa", vars));
  }
  if (a.soil) {
    lines.push(tr("change.soil", "Grondsoort: {{before}} → {{after}}", {
      before: a.soil.before.length ? a.soil.before.map(soilLabel).join(", ") : tr("change.noLayer", "geen laag"),
      after: soilLabel(a.soil.after),
    }));
  }
  return lines;
}
