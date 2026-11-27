// Aanpassingen van de grondlaaginterpretatie binnen één paalberekening.
//
// De regels en de bewerking van de conusweerstand staan in
// calc/shared/interpretation/overrides.ts en gelden voor alle modules. Dit
// bestand levert wat bij het grondprofiel van de paalberekening hoort: een
// traject één grondsoort geven in de lagenlijst uit de invoer.
import type { Cpt } from "../../../../types/cpt";
import type { AppliedOverride, InterpretationOverride, SoilKind, SoilLayer } from "../types";
import { SOIL_DEFAULTS } from "../catalog";
import { applyOverridesWith, type SoilAdapter } from "../../../shared/interpretation/overrides";

export { EDGE_M, MIN_RANGE_M, applyQcOverride, countOverrides } from "../../../shared/interpretation/overrides";

const SAME_M = 1e-9;

/**
 * Geeft het traject [topNap, bottomNap] één grondsoort. Bestaande lagen worden
 * op de randen gesplitst en houden daarbuiten hun eigen waarden; de nieuwe
 * laag krijgt de standaardwaarden van zijn grondsoort. Ligt het traject
 * (deels) buiten het profiel, dan komt er daar een laag bij.
 */
export function applySoilOverride(layers: SoilLayer[], topNap: number, bottomNap: number, kind: SoilKind): SoilLayer[] {
  const out: SoilLayer[] = [];
  for (const layer of layers) {
    if (layer.endNap >= topNap - SAME_M || layer.startNap <= bottomNap + SAME_M) { out.push(layer); continue; }
    if (layer.startNap > topNap + SAME_M) out.push({ ...layer, endNap: topNap });
    if (layer.endNap < bottomNap - SAME_M) out.push({ ...layer, startNap: bottomNap });
  }
  const { gammaK, gammaW, phi } = SOIL_DEFAULTS[kind];
  out.push({ kind, startNap: topNap, endNap: bottomNap, gammaK, gammaW, phi });
  return out.sort((a, b) => b.startNap - a.startNap);
}

/** Grondsoorten die het profiel binnen het traject heeft, van boven naar beneden, zonder herhaling. */
function kindsIn(layers: SoilLayer[], topNap: number, bottomNap: number): SoilKind[] {
  const kinds: SoilKind[] = [];
  for (const layer of [...layers].sort((a, b) => b.startNap - a.startNap)) {
    if (layer.endNap >= topNap - SAME_M || layer.startNap <= bottomNap + SAME_M) continue;
    if (!kinds.includes(layer.kind)) kinds.push(layer.kind);
  }
  return kinds;
}

const pileSoil: SoilAdapter<SoilKind, SoilLayer[]> = { isKind: (kind) => kind in SOIL_DEFAULTS, kindsIn, apply: applySoilOverride };

export interface EffectiveInterpretation {
  /** Sondering met aangepaste qc; dezelfde verwijzing als er niets is gewijzigd. */
  cpt: Cpt | null;
  /** Grondprofiel met aangepaste lagen; dezelfde verwijzing als er niets is gewijzigd. */
  layers: SoilLayer[];
  /** Alle aanpassingen van deze sondering, ook de overgeslagen, in lijstvolgorde. */
  applied: AppliedOverride[];
}

// Eén uitkomst per sondering onthouden: de draagvermogentabel rekent dezelfde
// sondering met dezelfde lagen en aanpassingen voor veel maten en niveaus.
const cache = new WeakMap<Cpt, { layers: SoilLayer[]; overrides: InterpretationOverride[]; result: EffectiveInterpretation }>();

/**
 * Past de aanpassingen van één sondering toe op een kopie van die sondering
 * en van het grondprofiel. Zonder aanpassingen voor deze sondering komen de
 * sondering en het profiel ongewijzigd (dezelfde verwijzing) terug.
 */
export function applyOverrides(cpt: Cpt | null | undefined, layers: SoilLayer[], overrides: InterpretationOverride[] | undefined): EffectiveInterpretation {
  if (!cpt || !overrides?.some((o) => o.cptId === cpt.id)) return { cpt: cpt ?? null, layers, applied: [] };
  const hit = cache.get(cpt);
  if (hit && hit.layers === layers && hit.overrides === overrides) return hit.result;
  const result = applyOverridesWith(cpt, layers, overrides, pileSoil);
  cache.set(cpt, { layers, overrides, result });
  return result;
}
