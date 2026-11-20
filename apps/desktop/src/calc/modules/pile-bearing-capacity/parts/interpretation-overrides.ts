// Aanpassingen van de grondlaaginterpretatie binnen één paalberekening.
//
// De gebruiker kiest een dieptetraject van een sondering en haalt daar een
// terugval in de conusweerstand uit, of wijzigt er de grondsoort. Dit bestand
// past die aanpassingen toe op een kopie: de sondering in het project en het
// grondprofiel in de invoer blijven ongewijzigd. De rest van de berekening
// rekent met het resultaat alsof het de meting was.
//
// Regels:
//  - Een aanpassing geldt alleen voor de sondering met hetzelfde id.
//  - Aanpassingen worden in lijstvolgorde toegepast. Overlappen twee
//    trajecten, dan wint de latere. Een latere lineaire interpolatie neemt
//    zijn randwaarden uit de reeks zoals die op dat moment is, dus inclusief
//    eerdere aanpassingen.
//  - Een traject wordt begrensd op het bereik van de sondering. Blijft er
//    minder dan MIN_RANGE_M over, dan wordt de aanpassing overgeslagen
//    (status "outsideRange").
//  - Niveaus zijn m NAP; diepte = maaiveld − niveau, zoals in de rekenkern.
import type { Cpt, MeasurementPoint } from "../../../../types/cpt";
import type { AppliedOverride, InterpretationOverride, SoilKind, SoilLayer } from "../types";
import { SOIL_DEFAULTS } from "../catalog";

/** Breedte van de overgang aan de rand van een vaste waarde [m]. */
export const EDGE_M = 1e-4;
/** Kleinste traject dat nog wordt toegepast [m]. */
export const MIN_RANGE_M = 0.01;
const SAME_M = 1e-9;

type Point = MeasurementPoint;
const qcOf = (p: Point) => p.qc ?? 0;

/** Lineair geïnterpoleerde qc op een diepte; buiten de reeks de eindwaarde. */
function valueAt(points: Point[], depth: number): number {
  let hi = points.findIndex((p) => p.depth >= depth);
  if (hi === 0) return qcOf(points[0]);
  if (hi < 0) return qcOf(points[points.length - 1]);
  const a = points[hi - 1], b = points[hi];
  return qcOf(a) + (depth - a.depth) / (b.depth - a.depth) * (qcOf(b) - qcOf(a));
}

/** Voegt een punt in op een diepte, tenzij daar al een punt ligt. Wijzigt `points`. */
function ensurePoint(points: Point[], depth: number, qc: number): void {
  const hi = points.findIndex((p) => p.depth >= depth - SAME_M);
  if (hi < 0) return;
  if (Math.abs(points[hi].depth - depth) <= SAME_M || hi === 0) return;
  const a = points[hi - 1], b = points[hi];
  const point: Point = { depth, qc };
  if (a.depth_nap !== undefined && b.depth_nap !== undefined) {
    point.depth_nap = a.depth_nap + (depth - a.depth) / (b.depth - a.depth) * (b.depth_nap - a.depth_nap);
  }
  points.splice(hi, 0, point);
}

/**
 * Vervangt qc tussen twee diepten [m onder maaiveld]. De diepten moeten binnen
 * de reeks liggen. Lineair: een rechte lijn tussen de waarden op de randen.
 * Vast: de waarde over het hele traject, met op elke rand een sprong over
 * EDGE_M zodat de meting buiten het traject gelijk blijft en de diepten
 * strikt oplopend blijven.
 */
export function applyQcOverride(points: Point[], topDepth: number, bottomDepth: number, qc: NonNullable<InterpretationOverride["qc"]>): Point[] {
  const out = [...points];
  const first = out[0].depth, last = out[out.length - 1].depth;
  const qTop = valueAt(out, topDepth), qBottom = valueAt(out, bottomDepth);
  ensurePoint(out, topDepth, qTop);
  ensurePoint(out, bottomDepth, qBottom);
  const fixed = qc.mode === "fixed" ? qc.valueMpa : null;
  if (fixed !== null) {
    if (topDepth > first + SAME_M && !out.some((p) => p.depth > topDepth + SAME_M && p.depth <= topDepth + EDGE_M)) ensurePoint(out, topDepth + EDGE_M, fixed);
    if (bottomDepth < last - SAME_M && !out.some((p) => p.depth < bottomDepth - SAME_M && p.depth >= bottomDepth - EDGE_M)) ensurePoint(out, bottomDepth - EDGE_M, fixed);
  }
  for (let i = 0; i < out.length; i++) {
    const d = out[i].depth;
    const inside = d > topDepth + SAME_M && d < bottomDepth - SAME_M;
    // Begint of eindigt het traject op de rand van de sondering, dan hoort dat eindpunt erbij.
    const atEnd = fixed !== null && ((Math.abs(d - topDepth) <= SAME_M && topDepth <= first + SAME_M) || (Math.abs(d - bottomDepth) <= SAME_M && bottomDepth >= last - SAME_M));
    if (!inside && !atEnd) continue;
    out[i] = { ...out[i], qc: fixed ?? qTop + (d - topDepth) / (bottomDepth - topDepth) * (qBottom - qTop) };
  }
  return out;
}

/** Kleinste, grootste en gemiddelde qc van de reeks tussen twee diepten. */
function measuredStats(points: Point[], topDepth: number, bottomDepth: number) {
  const samples = [{ depth: topDepth, qc: valueAt(points, topDepth) },
    ...points.filter((p) => p.depth > topDepth && p.depth < bottomDepth).map((p) => ({ depth: p.depth, qc: qcOf(p) })),
    { depth: bottomDepth, qc: valueAt(points, bottomDepth) }];
  let area = 0;
  for (let i = 1; i < samples.length; i++) area += (samples[i].depth - samples[i - 1].depth) * (samples[i].qc + samples[i - 1].qc) / 2;
  const values = samples.map((s) => s.qc);
  return { measuredMinMpa: Math.min(...values), measuredMaxMpa: Math.max(...values), measuredMeanMpa: area / (bottomDepth - topDepth) };
}

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

export interface EffectiveInterpretation {
  /** Sondering met aangepaste qc; dezelfde verwijzing als er niets is gewijzigd. */
  cpt: Cpt | null;
  /** Grondprofiel met aangepaste lagen; dezelfde verwijzing als er niets is gewijzigd. */
  layers: SoilLayer[];
  /** Alle aanpassingen van deze sondering, ook de overgeslagen, in lijstvolgorde. */
  applied: AppliedOverride[];
}

function isValid(o: InterpretationOverride): boolean {
  if (![o.topNap, o.bottomNap].every(Number.isFinite) || o.topNap === o.bottomNap) return false;
  if (!o.qc && !o.soilKind) return false;
  if (o.qc?.mode === "fixed" && !(Number.isFinite(o.qc.valueMpa) && o.qc.valueMpa >= 0)) return false;
  if (o.soilKind && !(o.soilKind in SOIL_DEFAULTS)) return false;
  return true;
}

function compute(cpt: Cpt, layers: SoilLayer[], overrides: InterpretationOverride[]): EffectiveInterpretation {
  const groundNap = cpt.metadata.ground_level_nap ?? 0;
  const measured = cpt.points;
  const usable = measured.length >= 2 && measured.every((p, i) => Number.isFinite(p.depth) && (i === 0 || p.depth > measured[i - 1].depth));
  let points = measured, outLayers = layers;
  const applied: AppliedOverride[] = [];
  for (const override of overrides) {
    const top = Math.max(override.topNap, override.bottomNap), bottom = Math.min(override.topNap, override.bottomNap);
    if (!isValid(override)) { applied.push({ override, status: "invalid", topNap: top, bottomNap: bottom }); continue; }
    const topNap = usable ? Math.min(top, groundNap - measured[0].depth) : top;
    const bottomNap = usable ? Math.max(bottom, groundNap - measured[measured.length - 1].depth) : bottom;
    if (!usable || topNap - bottomNap < MIN_RANGE_M) { applied.push({ override, status: "outsideRange", topNap: top, bottomNap: bottom }); continue; }
    const entry: AppliedOverride = { override, status: "applied", topNap, bottomNap };
    if (override.qc) {
      const topDepth = groundNap - topNap, bottomDepth = groundNap - bottomNap;
      points = applyQcOverride(points, topDepth, bottomDepth, override.qc);
      entry.qc = { ...measuredStats(measured, topDepth, bottomDepth),
        topMpa: override.qc.mode === "fixed" ? override.qc.valueMpa : valueAt(points, topDepth),
        bottomMpa: override.qc.mode === "fixed" ? override.qc.valueMpa : valueAt(points, bottomDepth) };
    }
    if (override.soilKind) {
      entry.soil = { before: kindsIn(outLayers, topNap, bottomNap), after: override.soilKind };
      outLayers = applySoilOverride(outLayers, topNap, bottomNap, override.soilKind);
    }
    applied.push(entry);
  }
  return { cpt: points === measured ? cpt : { ...cpt, points }, layers: outLayers, applied };
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
  const result = compute(cpt, layers, overrides.filter((o) => o.cptId === cpt.id));
  cache.set(cpt, { layers, overrides, result });
  return result;
}

/** Aantal aanpassingen in de invoer voor één sondering. */
export function countOverrides(overrides: InterpretationOverride[] | undefined, cptId: string | null | undefined): number {
  return overrides?.filter((o) => o.cptId === cptId).length ?? 0;
}
