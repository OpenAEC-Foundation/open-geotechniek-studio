// Handmatig invoeren en bewerken van een boring: het formulier werkt op een concept met tekstvelden,
// dat pas bij opslaan een boring wordt. Wat de gebruiker niet aanraakt, blijft zoals het was gelezen.
import i18next from "i18next";
import type { Bore, BoreLayer } from "../types/bore";
import { classifyLayer, layerSoilFields, type AdmixtureLetter, type MainSoil, type SoilClass } from "./nen5104";

const tr = (key: string, nl: string, vars?: Record<string, unknown>) => i18next.t(`boring:${key}`, { defaultValue: nl, ...vars }) as string;

/** Bronvermelding van een boring die in de app zelf is ingevoerd. */
export const MANUAL_SOURCE = "handmatig ingevoerd";

export interface DraftAdmixture { letter: AdmixtureLetter | ""; grade: number }
export interface DraftLayer {
  top: string; base: string; main: MainSoil;
  /** Eerste en tweede toevoeging; een lege letter betekent geen. */
  admixtures: [DraftAdmixture, DraftAdmixture];
  /** Vrije benaming, alleen voor grond buiten de vijf hoofdgrondsoorten. */
  name: string; colour: string; remark: string;
  /** De gelezen laag; zijn grondsoort blijft staan zolang de keuze niet is gewijzigd. */
  original?: BoreLayer; soilChanged?: boolean;
}
export interface BoreDraft {
  id: string; date: string; method: string; x: string; y: string; z: string; finalDepth: string; groundwater: string;
  layers: DraftLayer[];
  original?: Bore;
}

const str = (v: number | undefined) => v != null && Number.isFinite(v) ? String(v) : "";
/** Getal uit een invoerveld; komma of punt als decimaalteken. Leeg geeft undefined, onzin geeft NaN. */
export function num(value: string): number | undefined {
  const text = value.trim().replace(",", ".");
  if (!text) return undefined;
  return /^[-+]?(\d+\.?\d*|\.\d+)$/.test(text) ? Number(text) : NaN;
}

export function draftLayer(layer: BoreLayer): DraftLayer {
  const soil = classifyLayer(layer), [a, b] = soil.admixtures;
  const adm = (x?: SoilClass["admixtures"][number]): DraftAdmixture => x ? { letter: x.letter, grade: x.grade ?? 2 } : { letter: "", grade: 1 };
  return { top: str(layer.top_depth), base: str(layer.base_depth), main: soil.main, admixtures: [adm(a), adm(b)],
    name: soil.main === "X" ? layer.soil_name : "", colour: layer.colour ?? "", remark: layer.description ?? "", original: layer };
}

export function draftFromBore(bore: Bore): BoreDraft {
  return {
    id: bore.id, date: (bore.metadata.start_date ?? "").slice(0, 10), method: bore.metadata.bore_method ?? "",
    x: str(bore.position?.x_rd), y: str(bore.position?.y_rd), z: str(bore.position?.z_nap),
    finalDepth: str(bore.final_depth), groundwater: str(bore.groundwater_depth),
    layers: [...bore.layers].sort((p, q) => p.top_depth - q.top_depth).map(draftLayer), original: bore,
  };
}

/** Eerste vrije boornummer: B01, B02, … */
export function nextBoreId(taken: Iterable<string>): string {
  const used = new Set(taken);
  for (let i = 1; ; i++) { const id = `B${String(i).padStart(2, "0")}`; if (!used.has(id)) return id; }
}

export function emptyDraft(taken: Iterable<string> = []): BoreDraft {
  return { id: nextBoreId(taken), date: new Date().toISOString().slice(0, 10), method: "", x: "", y: "", z: "", finalDepth: "", groundwater: "", layers: [newLayer([])] };
}

/** Nieuwe laag die aansluit op de onderkant van de laatste, één meter dik. */
export function newLayer(layers: DraftLayer[]): DraftLayer {
  const last = layers.length ? num(layers[layers.length - 1].base) : 0;
  const top = last != null && Number.isFinite(last) ? last : 0;
  return { top: String(top), base: String(+(top + 1).toFixed(2)), main: "Z", admixtures: [{ letter: "", grade: 1 }, { letter: "", grade: 1 }], name: "", colour: "", remark: "", soilChanged: true };
}

export function draftSoil(layer: DraftLayer): SoilClass {
  const seen = new Set<string>();
  return { main: layer.main, admixtures: layer.main === "X" ? [] : layer.admixtures.filter((a) => a.letter && !seen.has(a.letter) && seen.add(a.letter)).map((a) => ({ letter: a.letter as AdmixtureLetter, grade: a.grade })) };
}

/** Wat er aan het concept niet klopt, in gewone taal; leeg = kan worden opgeslagen. */
export function draftProblems(draft: BoreDraft, otherIds: Iterable<string> = []): string[] {
  const out: string[] = [];
  if (!draft.id.trim()) out.push(tr("problem.id", "Vul een boornummer in."));
  else if (new Set(otherIds).has(draft.id.trim())) out.push(tr("problem.duplicate", "Boornummer {{id}} bestaat al.", { id: draft.id.trim() }));
  const x = num(draft.x), y = num(draft.y);
  if (Number.isNaN(x) || Number.isNaN(y) || (x == null) !== (y == null)) out.push(tr("problem.xy", "Vul X en Y allebei in als getal, of laat ze allebei leeg."));
  else if (x == null && draft.z.trim()) out.push(tr("problem.zNeedsXy", "Vul bij de maaiveldhoogte ook X en Y in."));
  for (const [label, value] of [[tr("field.groundLevel", "Maaiveld (m NAP)"), draft.z], [tr("field.finalDepth", "Einddiepte (m -mv)"), draft.finalDepth], [tr("field.groundwater", "Grondwaterstand (m -mv)"), draft.groundwater]] as const)
    if (Number.isNaN(num(value))) out.push(tr("problem.notNumber", "{{field}}: geen getal.", { field: label }));
  let previous = 0;
  draft.layers.forEach((layer, i) => {
    const top = num(layer.top), base = num(layer.base), n = i + 1;
    if (top == null || base == null || Number.isNaN(top) || Number.isNaN(base)) { out.push(tr("problem.layerNumbers", "Laag {{n}}: vul boven- en onderkant in als getal.", { n })); return; }
    if (top < 0) out.push(tr("problem.layerAbove", "Laag {{n}}: de bovenkant ligt boven het maaiveld.", { n }));
    if (base <= top) out.push(tr("problem.layerOrder", "Laag {{n}}: de onderkant moet dieper liggen dan de bovenkant.", { n }));
    else if (i > 0 && top < previous - 1e-9) out.push(tr("problem.layerOverlap", "Laag {{n}}: overlapt de laag erboven (die eindigt op {{depth}} m).", { n, depth: previous.toFixed(2) }));
    previous = Math.max(previous, base);
  });
  const final = num(draft.finalDepth), water = num(draft.groundwater);
  if (final != null && Number.isFinite(final) && final < previous - 1e-9) out.push(tr("problem.finalDepth", "De einddiepte is ondieper dan de diepste laag ({{depth}} m).", { depth: previous.toFixed(2) }));
  if (water != null && Number.isFinite(water) && water < 0) out.push(tr("problem.waterNegative", "De grondwaterstand is een diepte onder maaiveld en kan niet negatief zijn."));
  return out;
}

/** De boring die uit het concept volgt. Alleen aanroepen als `draftProblems` leeg is. */
export function boreFromDraft(draft: BoreDraft): Bore {
  const layers: BoreLayer[] = draft.layers.map((layer) => {
    const keep = layer.original && !layer.soilChanged;
    const soil = keep
      ? { soil_name: layer.original!.soil_name, soil_code: layer.original!.soil_code, classification: layer.original!.classification, secondary: layer.original!.secondary }
      : layer.main === "X" ? { soil_name: layer.name.trim() || "Overig" } : layerSoilFields(draftSoil(layer));
    const out: BoreLayer = { top_depth: num(layer.top)!, base_depth: num(layer.base)!, ...soil };
    if (layer.colour.trim()) out.colour = layer.colour.trim();
    if (layer.remark.trim()) out.description = layer.remark.trim();
    for (const key of Object.keys(out) as Array<keyof BoreLayer>) if (out[key] === undefined) delete out[key];
    return out;
  }).sort((p, q) => p.top_depth - q.top_depth);
  const x = num(draft.x), y = num(draft.y), z = num(draft.z), water = num(draft.groundwater);
  const deepest = layers.reduce((d, l) => Math.max(d, l.base_depth), 0);
  const base = draft.original;
  const bore: Bore = {
    ...base,
    id: draft.id.trim(),
    final_depth: num(draft.finalDepth) ?? (deepest || undefined),
    layers,
    metadata: { ...(base?.metadata ?? { source_file: MANUAL_SOURCE }), start_date: draft.date || undefined, bore_method: draft.method.trim() || undefined },
  };
  if (x != null && y != null) bore.position = { x_rd: x, y_rd: y, ...(z != null ? { z_nap: z } : {}) };
  else delete bore.position;
  if (water != null) bore.groundwater_depth = water; else delete bore.groundwater_depth;
  if (bore.final_depth === undefined) delete bore.final_depth;
  for (const key of ["start_date", "bore_method"] as const) if (bore.metadata[key] === undefined) delete bore.metadata[key];
  return bore;
}
