// Waar de bewerkingen wonen: in de uitbreidbare metadata van de sondering zelf, zodat ze met elk
// projectbestand en elke momentopname meegaan. `points` van de sondering zijn altijd de bewerkte
// meetwaarden (dat gebruikt de rest van de app); het origineel staat ernaast en wordt nooit gewijzigd.
import type { Cpt, MeasurementPoint } from "../types/cpt";
import { applyEditsDetailed } from "./applyEdits";
import { EDIT_KINDS, type DepthSpan, type EditEffect, type MeasurementEdit } from "./types";

/** Het logboek: de bewerkingen op volgorde, met per bewerking wat zij deed. Klein, dus goedkoop te lezen. */
export const EDITS_KEY = "ogs:measurement-edits";
/** De oorspronkelijke meetpunten; staat er alleen als er bewerkingen zijn. */
export const ORIGINAL_KEY = "ogs:measurement-original";

export interface EditLog {
  edits: MeasurementEdit[];
  /** Per bewerking het effect; zelfde volgorde en lengte als `edits`. */
  effects: EditEffect[];
  /** Aantal meetpunten in het origineel. */
  originalCount: number;
}

const EMPTY: EditLog = { edits: [], effects: [], originalCount: 0 };
const cache = new WeakMap<Cpt, EditLog>();

function validEdit(value: unknown): value is MeasurementEdit {
  const e = value as MeasurementEdit;
  return !!e && typeof e === "object" && typeof e.id === "string" && typeof e.at === "string" && typeof e.by === "string"
    && typeof e.reason === "string" && !!e.op && typeof e.op === "object" && EDIT_KINDS.includes(e.op.kind);
}

/** Het logboek van een sondering; leeg als er niets is bewerkt of de gegevens onleesbaar zijn. */
export function editLogOf(cpt: Cpt): EditLog {
  const raw = cpt.metadata.extra?.[EDITS_KEY];
  if (!raw) return EMPTY;
  const known = cache.get(cpt);
  if (known) return known;
  let log = EMPTY;
  try {
    const value = JSON.parse(raw);
    if (value && Array.isArray(value.edits) && value.edits.every(validEdit) && value.edits.length) {
      const edits = value.edits as MeasurementEdit[];
      const effects: EditEffect[] = edits.map((_, i) => {
        const e = value.effects?.[i];
        return { affected: Number(e?.affected) || 0, before: e?.before, after: e?.after,
          marks: Array.isArray(e?.marks) ? (e.marks as DepthSpan[]).filter((m) => Number.isFinite(m?.from) && Number.isFinite(m?.to)) : [] };
      });
      log = { edits, effects, originalCount: Number(value.originalCount) || 0 };
    }
  } catch { /* onleesbaar logboek: de sondering blijft bruikbaar zoals zij is */ }
  cache.set(cpt, log);
  return log;
}

export const isEdited = (cpt: Cpt) => editLogOf(cpt).edits.length > 0;

/** Alle markeringen van de bewerkte reeks, voor de grafiek. */
export function editMarksOf(cpt: Cpt): DepthSpan[] {
  return editLogOf(cpt).effects.flatMap((e) => e.marks);
}

function withoutKeys(cpt: Cpt): Cpt["metadata"] {
  const extra = { ...cpt.metadata.extra };
  delete extra[EDITS_KEY];
  delete extra[ORIGINAL_KEY];
  const metadata = { ...cpt.metadata, extra };
  if (!Object.keys(extra).length) delete (metadata as Partial<Cpt["metadata"]>).extra;
  return metadata;
}

/** De sondering met haar oorspronkelijke meetwaarden en zonder logboek. */
export function originalOf(cpt: Cpt): Cpt {
  const raw = cpt.metadata.extra?.[ORIGINAL_KEY];
  if (!editLogOf(cpt).edits.length || !raw) return cpt.metadata.extra?.[EDITS_KEY] || raw ? { ...cpt, metadata: withoutKeys(cpt) } : cpt;
  let points: MeasurementPoint[] = cpt.points;
  try {
    const value = JSON.parse(raw);
    if (Array.isArray(value) && value.every((p) => p && typeof p.depth === "number")) points = value;
  } catch { /* zonder leesbaar origineel gelden de huidige meetwaarden als uitgangspunt */ }
  return { ...cpt, points, metadata: withoutKeys(cpt) };
}

/** Legt een lijst bewerkingen vast op het gegeven origineel; een lege lijst geeft het origineel terug. */
function store(original: Cpt, edits: MeasurementEdit[]): Cpt {
  if (!edits.length) return original;
  const { cpt, effects } = applyEditsDetailed(original, edits);
  const log: EditLog = { edits, effects, originalCount: original.points.length };
  const result: Cpt = {
    ...cpt,
    metadata: { ...cpt.metadata, extra: { ...cpt.metadata.extra, [EDITS_KEY]: JSON.stringify({ version: 1, ...log }), [ORIGINAL_KEY]: JSON.stringify(original.points) } },
  };
  cache.set(result, log);
  return result;
}

/** Vervangt de hele lijst bewerkingen; het origineel blijft het uitgangspunt. */
export function withEdits(cpt: Cpt, edits: MeasurementEdit[]): Cpt {
  return store(originalOf(cpt), edits);
}

export const addEdit = (cpt: Cpt, edit: MeasurementEdit) => withEdits(cpt, [...editLogOf(cpt).edits, edit]);
/** Maakt één gekozen bewerking ongedaan; de latere bewerkingen worden opnieuw toegepast. */
export const removeEdit = (cpt: Cpt, id: string) => withEdits(cpt, editLogOf(cpt).edits.filter((e) => e.id !== id));
export const undoLastEdit = (cpt: Cpt) => withEdits(cpt, editLogOf(cpt).edits.slice(0, -1));
/** Alles herstellen: terug naar de oorspronkelijke meetwaarden. */
export const resetEdits = (cpt: Cpt) => originalOf(cpt);

/**
 * De huidige `points` zijn van buitenaf vervangen door nieuwe bronwaarden (bijvoorbeeld records die bij de
 * validatie zijn in- of uitgesloten): neem die als nieuw origineel en pas de bewerkingen opnieuw toe.
 */
export function rebaseEdits(cpt: Cpt): Cpt {
  const { edits } = editLogOf(cpt);
  return edits.length ? store({ ...cpt, metadata: withoutKeys(cpt) }, edits) : cpt;
}

/** Een nieuwe logboekregel met tijdstip en eigen id. */
export function newEdit(op: MeasurementEdit["op"], by: string, reason: string, at = new Date()): MeasurementEdit {
  const id = globalThis.crypto?.randomUUID?.() ?? `${at.getTime().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return { id, at: at.toISOString(), by: by.trim(), reason: reason.trim(), op };
}
