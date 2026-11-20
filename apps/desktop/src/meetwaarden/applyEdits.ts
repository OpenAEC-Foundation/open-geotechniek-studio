// De bewerkingen toepassen op de oorspronkelijke meetwaarden. Zuiver: de invoer blijft onaangeroerd,
// dezelfde invoer geeft dezelfde uitkomst, en de volgorde van de lijst is de volgorde van toepassen.
import type { Cpt, MeasurementPoint } from "../types/cpt";
import { CHANNELS, type Channel, type DepthSpan, type EditEffect, type EditOp, type MeasurementEdit } from "./types";

const EPS = 1e-9;
/** Een losse meetwaarde hoort bij het dichtstbijzijnde meetpunt binnen deze afstand (m). */
export const POINT_SNAP_M = 0.0051;
/** Afronding van berekende waarden, zodat 0,1 + 0,2 geen 0,30000000000000004 wordt. */
const tidy = (v: number) => Number(v.toFixed(6));

/** Wrijvingsgetal zoals de lezers van GEF en BRO het afleiden als de kolom ontbreekt: Rf = 100 · fs / qc. */
export function derivedRf(p: Pick<MeasurementPoint, "qc" | "fs">): number | undefined {
  return p.qc !== undefined && p.fs !== undefined && p.qc > 0 ? (100 * p.fs) / p.qc : undefined;
}

/**
 * Of het wrijvingsgetal van dit punt in de bron is afgeleid en dus mee moet veranderen met qc en fs.
 * Een gemeten Rf-kolom is afgerond en wijkt daardoor af van 100 · fs / qc; een afgeleide waarde niet.
 * Zonder Rf geldt het punt als afgeleid, zodat de waarde ontstaat zodra qc en fs dat toelaten.
 */
export function rfIsDerived(p: MeasurementPoint): boolean {
  if (p.rf == null) return true;
  const expected = derivedRf(p);
  return expected !== undefined && Math.abs(p.rf - expected) <= 1e-9 * Math.max(1, Math.abs(p.rf));
}

const inRange = (depth: number, from: number, to: number) => depth >= from - EPS && depth <= to + EPS;

/** Aaneengesloten stukken van de reeks waarvan de punten zijn gemarkeerd. */
function spans(points: MeasurementPoint[], hit: (p: MeasurementPoint, i: number) => boolean): DepthSpan[] {
  const out: DepthSpan[] = [];
  let open: DepthSpan | null = null;
  points.forEach((p, i) => {
    if (!hit(p, i)) { open = null; return; }
    if (open) { open.from = Math.min(open.from, p.depth); open.to = Math.max(open.to, p.depth); }
    else out.push(open = { from: p.depth, to: p.depth });
  });
  return out;
}

const median = (sorted: number[]) => {
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * Uitschieters volgens het Hampel-filter (Hampel 1974; Pearson 2002, "Outliers in process modeling and
 * identification", IEEE Trans. Control Systems Technology 10(1)): een waarde is een uitschieter als zij
 * meer dan `threshold` maal 1,4826 · MAD afwijkt van de mediaan van haar venster. Het venster bestaat uit
 * de waarde zelf en `halfWindow` geldige buren aan elke kant; buren buiten het traject tellen mee als
 * omgeving. Geeft de indexen in `points` terug. Is de MAD nul (meer dan de helft van het venster is gelijk
 * aan de mediaan), dan is elke afwijkende waarde een uitschieter.
 */
export function findOutliers(points: MeasurementPoint[], channel: Channel, from: number, to: number, halfWindow: number, threshold: number): number[] {
  const k = Math.max(1, Math.round(halfWindow));
  const valid = points.flatMap((p, index) => (p[channel] != null ? [{ index, value: p[channel] as number, depth: p.depth }] : []));
  const out: number[] = [];
  valid.forEach((item, at) => {
    if (!inRange(item.depth, from, to)) return;
    const window = valid.slice(Math.max(0, at - k), at + k + 1).map((v) => v.value);
    if (window.length < 3) return;
    const center = median([...window].sort((a, b) => a - b));
    const mad = median(window.map((v) => Math.abs(v - center)).sort((a, b) => a - b));
    const deviation = Math.abs(item.value - center);
    if (deviation > EPS && deviation > threshold * 1.4826 * mad) out.push(item.index);
  });
  return out;
}

export interface AppliedEdits {
  /** De bewerkte sondering; zonder bewerkingen de invoer zelf. */
  cpt: Cpt;
  /** Per bewerking wat zij deed, in dezelfde volgorde als de lijst. */
  effects: EditEffect[];
}

/** Past de bewerkingen op volgorde toe en houdt per bewerking bij wat er veranderde. */
export function applyEditsDetailed(cpt: Cpt, edits: ReadonlyArray<Pick<MeasurementEdit, "op">>): AppliedEdits {
  if (!edits.length) return { cpt, effects: [] };
  // Werkkopie: elk punt is een eigen object; `parameters` (de ruwe bronwaarden) blijft gedeeld en ongewijzigd.
  let points: MeasurementPoint[] = cpt.points.map((p) => ({ ...p }));
  const derived = new WeakSet<MeasurementPoint>();
  for (const p of points) if (rfIsDerived(p)) derived.add(p);
  const effects: EditEffect[] = [];

  /** Zet één waarde; qc en fs trekken een afgeleid wrijvingsgetal mee, een eigen Rf staat daarna los. */
  const setChannel = (p: MeasurementPoint, channel: Channel, value: number | undefined) => {
    if (value === undefined) delete p[channel]; else p[channel] = value;
    if (channel === "rf") derived.delete(p);
    else if ((channel === "qc" || channel === "fs") && derived.has(p)) {
      const rf = derivedRf(p);
      if (rf === undefined) delete p.rf; else p.rf = rf;
    }
  };
  const remove = (hit: (p: MeasurementPoint) => boolean): EditEffect => {
    const marks = spans(points, hit), before = points.length;
    points = points.filter((p) => !hit(p));
    return { affected: before - points.length, marks };
  };
  const change = (hit: (p: MeasurementPoint, i: number) => boolean, apply: (p: MeasurementPoint) => void): EditEffect => {
    const marks = spans(points, hit);
    let affected = 0;
    points.forEach((p, i) => { if (hit(p, i)) { apply(p); affected++; } });
    return { affected, marks };
  };

  for (const { op } of edits) {
    switch (op.kind) {
      case "remove-range":
        effects.push(remove((p) => inRange(p.depth, op.from, op.to)));
        break;
      case "trim-top":
        effects.push(remove((p) => p.depth < op.depth - EPS));
        break;
      case "trim-bottom":
        effects.push(remove((p) => p.depth > op.depth + EPS));
        break;
      case "invalidate-range": {
        const channels = op.channels.length ? op.channels : CHANNELS;
        effects.push(change(
          (p) => inRange(p.depth, op.from, op.to) && channels.some((c) => p[c] != null),
          (p) => { for (const c of channels) setChannel(p, c, undefined); },
        ));
        break;
      }
      case "zero-shift":
        effects.push(change(
          (p) => p[op.channel] != null && inRange(p.depth, op.from ?? -Infinity, op.to ?? Infinity),
          (p) => setChannel(p, op.channel, tidy((p[op.channel] as number) + op.offset)),
        ));
        break;
      case "depth-shift":
        for (const p of points) {
          p.depth = tidy(p.depth + op.offset);
          if (p.depth_nap != null) p.depth_nap = tidy(p.depth_nap - op.offset);
        }
        // Eerdere markeringen schuiven mee: zij horen bij dezelfde meetpunten.
        for (const e of effects) e.marks = e.marks.map((m) => ({ from: tidy(m.from + op.offset), to: tidy(m.to + op.offset) }));
        effects.push({ affected: points.length, marks: [] });
        break;
      case "set-value": {
        let nearest = -1;
        points.forEach((p, i) => { if (nearest < 0 || Math.abs(p.depth - op.depth) < Math.abs(points[nearest].depth - op.depth)) nearest = i; });
        const p = nearest >= 0 && Math.abs(points[nearest].depth - op.depth) <= POINT_SNAP_M ? points[nearest] : null;
        if (!p) { effects.push({ affected: 0, marks: [] }); break; }
        const before = p[op.channel] ?? null;
        setChannel(p, op.channel, op.value ?? undefined);
        effects.push({ affected: 1, before, after: op.value, marks: [{ from: p.depth, to: p.depth }] });
        break;
      }
      case "remove-outliers": {
        const hits = new Set(findOutliers(points, op.channel, op.from, op.to, op.halfWindow, op.threshold));
        effects.push(change((_, i) => hits.has(i), (p) => setChannel(p, op.channel, undefined)));
        break;
      }
    }
  }
  return { cpt: { ...cpt, points }, effects };
}

/** De bewerkte sondering: de bewerkingen op volgorde toegepast op het origineel. */
export function applyEdits(cpt: Cpt, edits: ReadonlyArray<Pick<MeasurementEdit, "op">>): Cpt {
  return applyEditsDetailed(cpt, edits).cpt;
}

/** Waarom een bewerking zo niet kan; leeg = in orde. De teksten zijn sleutels voor de vertaling. */
export type OpProblem = "number" | "range" | "noOffset" | "window" | "negativeDepth";
export function opProblems(op: EditOp, points: MeasurementPoint[]): OpProblem[] {
  const out = new Set<OpProblem>();
  const num = (...values: Array<number | undefined>) => { if (values.some((v) => v !== undefined && !Number.isFinite(v))) out.add("number"); };
  switch (op.kind) {
    case "remove-range": case "invalidate-range":
      num(op.from, op.to); if (op.to < op.from) out.add("range"); break;
    case "trim-top": case "trim-bottom": num(op.depth); break;
    case "zero-shift":
      num(op.offset, op.from, op.to);
      if (op.offset === 0) out.add("noOffset");
      if (op.from !== undefined && op.to !== undefined && op.to < op.from) out.add("range");
      break;
    case "depth-shift":
      num(op.offset);
      if (op.offset === 0) out.add("noOffset");
      // De grafiek en de berekeningen rekenen met diepte onder maaiveld; boven maaiveld bestaat daar niet.
      else if (Number.isFinite(op.offset) && points.some((p) => p.depth + op.offset < -EPS)) out.add("negativeDepth");
      break;
    case "set-value": num(op.depth, op.value ?? undefined); break;
    case "remove-outliers":
      num(op.from, op.to, op.halfWindow, op.threshold);
      if (op.to < op.from) out.add("range");
      if (!(op.halfWindow >= 1) || !(op.threshold > 0)) out.add("window");
      break;
  }
  return [...out];
}
