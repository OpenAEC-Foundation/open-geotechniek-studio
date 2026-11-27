// Aanpassingen van de grondlaaginterpretatie binnen één berekening, gedeeld
// door de rekenmodules die op een sondering rekenen.
//
// De gebruiker kiest een dieptetraject van een sondering en haalt daar een
// terugval in de conusweerstand uit, of wijzigt er de grondsoort. Dit bestand
// past die aanpassingen toe op een kopie: de sondering in het project en het
// grondprofiel van de module blijven ongewijzigd. De rest van de berekening
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
//
// De grondsoorten en de vorm van het grondprofiel verschillen per module; die
// geeft daarom een `SoilAdapter` mee die een traject één grondsoort geeft.
import type { Cpt, MeasurementPoint } from "../../../types/cpt";

/**
 * Aanpassing van de grondlaaginterpretatie voor één dieptetraject van één
 * sondering. Hoort bij de berekening: de sondering zelf blijft ongewijzigd.
 * `K` is de grondsoort van de module.
 */
export interface InterpretationOverride<K extends string = string> {
  id: string;
  /** Sondering waarvoor de aanpassing geldt. */
  cptId: string;
  /** Boven- en onderkant van het traject [m NAP]. */
  topNap: number;
  bottomNap: number;
  /** Conusweerstand in het traject: lineair tussen de randwaarden, of een vaste waarde. */
  qc?: { mode: "interpolate" } | { mode: "fixed"; valueMpa: number };
  /** Grondsoort van het traject; verlegt een laaggrens of voegt een laag toe. */
  soilKind?: K;
  /** Waarom de aanpassing is gedaan. */
  comment?: string;
}

/** Een aanpassing zoals hij in de berekening is verwerkt, voor scherm en uitdraai. */
export interface AppliedOverride<K extends string = string> {
  override: InterpretationOverride<K>;
  /** `outsideRange`: het traject valt buiten de sondering; `invalid`: geen geldig traject of geen wijziging. */
  status: "applied" | "outsideRange" | "invalid";
  /** Traject na begrenzing op het bereik van de sondering [m NAP]. */
  topNap: number;
  bottomNap: number;
  qc?: {
    /** Gemeten waarden in het traject [MPa]. */
    measuredMinMpa: number; measuredMaxMpa: number; measuredMeanMpa: number;
    /** Nieuwe waarde aan boven- en onderrand [MPa]. */
    topMpa: number; bottomMpa: number;
  };
  soil?: { before: K[]; after: K };
}

/** Wat een module over zijn grondprofiel moet kunnen: `L` is de lagenlijst, `K` de grondsoort. */
export interface SoilAdapter<K extends string, L> {
  isKind: (kind: string) => boolean;
  /** Grondsoorten die het profiel binnen het traject heeft, van boven naar beneden, zonder herhaling. */
  kindsIn: (layers: L, topNap: number, bottomNap: number) => K[];
  /** Geeft het traject één grondsoort; geeft een nieuwe lagenlijst terug. */
  apply: (layers: L, topNap: number, bottomNap: number, kind: K) => L;
}

export interface EffectiveInterpretation<K extends string, L> {
  /** Sondering met aangepaste qc; dezelfde verwijzing als er niets is gewijzigd. */
  cpt: Cpt | null;
  /** Grondprofiel met aangepaste lagen; dezelfde verwijzing als er niets is gewijzigd. */
  layers: L;
  /** Alle aanpassingen van deze sondering, ook de overgeslagen, in lijstvolgorde. */
  applied: AppliedOverride<K>[];
}

/** Breedte van de overgang aan de rand van een vaste waarde [m]. */
export const EDGE_M = 1e-4;
/** Kleinste traject dat nog wordt toegepast [m]. */
export const MIN_RANGE_M = 0.01;
const SAME_M = 1e-9;

type Point = MeasurementPoint;
const qcOf = (p: Point) => p.qc ?? 0;

/** Lineair geïnterpoleerde qc op een diepte; buiten de reeks de eindwaarde. */
function valueAt(points: Point[], depth: number): number {
  const hi = points.findIndex((p) => p.depth >= depth);
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

function isValid(o: InterpretationOverride, isKind: (kind: string) => boolean): boolean {
  if (![o.topNap, o.bottomNap].every(Number.isFinite) || o.topNap === o.bottomNap) return false;
  if (!o.qc && !o.soilKind) return false;
  if (o.qc?.mode === "fixed" && !(Number.isFinite(o.qc.valueMpa) && o.qc.valueMpa >= 0)) return false;
  if (o.soilKind && !isKind(o.soilKind)) return false;
  return true;
}

/**
 * Past de aanpassingen van één sondering toe op een kopie van die sondering
 * en van het grondprofiel. Zonder aanpassingen voor deze sondering komen de
 * sondering en het profiel ongewijzigd (dezelfde verwijzing) terug.
 */
export function applyOverridesWith<K extends string, L>(
  cpt: Cpt | null | undefined, layers: L, overrides: InterpretationOverride<K>[] | undefined, soil: SoilAdapter<K, L>,
): EffectiveInterpretation<K, L> {
  const own = cpt ? overrides?.filter((o) => o.cptId === cpt.id) ?? [] : [];
  if (!cpt || !own.length) return { cpt: cpt ?? null, layers, applied: [] };
  const groundNap = cpt.metadata.ground_level_nap ?? 0;
  const measured = cpt.points;
  const usable = measured.length >= 2 && measured.every((p, i) => Number.isFinite(p.depth) && (i === 0 || p.depth > measured[i - 1].depth));
  let points = measured, outLayers = layers;
  const applied: AppliedOverride<K>[] = [];
  for (const override of own) {
    const top = Math.max(override.topNap, override.bottomNap), bottom = Math.min(override.topNap, override.bottomNap);
    if (!isValid(override, soil.isKind)) { applied.push({ override, status: "invalid", topNap: top, bottomNap: bottom }); continue; }
    const topNap = usable ? Math.min(top, groundNap - measured[0].depth) : top;
    const bottomNap = usable ? Math.max(bottom, groundNap - measured[measured.length - 1].depth) : bottom;
    if (!usable || topNap - bottomNap < MIN_RANGE_M) { applied.push({ override, status: "outsideRange", topNap: top, bottomNap: bottom }); continue; }
    const entry: AppliedOverride<K> = { override, status: "applied", topNap, bottomNap };
    if (override.qc) {
      const topDepth = groundNap - topNap, bottomDepth = groundNap - bottomNap;
      points = applyQcOverride(points, topDepth, bottomDepth, override.qc);
      entry.qc = { ...measuredStats(measured, topDepth, bottomDepth),
        topMpa: override.qc.mode === "fixed" ? override.qc.valueMpa : valueAt(points, topDepth),
        bottomMpa: override.qc.mode === "fixed" ? override.qc.valueMpa : valueAt(points, bottomDepth) };
    }
    if (override.soilKind) {
      entry.soil = { before: soil.kindsIn(outLayers, topNap, bottomNap), after: override.soilKind };
      outLayers = soil.apply(outLayers, topNap, bottomNap, override.soilKind);
    }
    applied.push(entry);
  }
  return { cpt: points === measured ? cpt : { ...cpt, points }, layers: outLayers, applied };
}

/** Aantal aanpassingen in de invoer voor één sondering. */
export function countOverrides(overrides: Array<{ cptId: string }> | undefined, cptId: string | null | undefined): number {
  return overrides?.filter((o) => o.cptId === cptId).length ?? 0;
}
