// Omzetting van de eerdere opslagvorm van dissipatietests naar het veld `dissipation_tests`.
//
// Eerder stonden tests uit een GEF-dissipatiebestand als JSON-tekst in de vrije metadata van de
// sondering, onder de sleutel hieronder, met per meting de tijd `t` en één waterspanning `u` (MPa) van
// het kanaal `u_channel`. Bij het inlezen van een project of sondering gaan ze over naar het veld; de
// sleutel verdwijnt. Een sondering die het veld al heeft, blijft zoals zij is.
import type { Cpt } from "../types/cpt";
import { withDissipationTest } from "./cptDissipation";
import { DEPTH_MISSING_NOTE, gefTestId } from "./gefDissipation";
import type { DissipationPoint, DissipationTest, PoreChannel } from "./types";

export const LEGACY_DISSIPATION_KEY = "ogs:dissipation-tests";

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const text = (v: unknown) => (typeof v === "string" && v ? v : undefined);

/** Eén test uit de eerdere vorm; `null` als er geen bruikbare meetreeks in staat. */
export function fromLegacyTest(raw: unknown): DissipationTest | null {
  if (!raw || typeof raw !== "object") return null;
  const old = raw as Record<string, unknown>;
  const channel: PoreChannel = old.u_channel === "u1" || old.u_channel === "u3" ? old.u_channel : "u2";
  const points: DissipationPoint[] = [];
  for (const item of Array.isArray(old.points) ? old.points : []) {
    const p = item as Record<string, unknown> | null;
    if (!p || !finite(p.t) || p.t < 0) continue;
    const point: DissipationPoint = { time: p.t };
    if (finite(p.qc)) point.qc = p.qc;
    if (finite(p.u)) point[channel] = p.u;
    points.push(point);
  }
  if (!points.length) return null;
  points.sort((a, b) => a.time - b.time);
  const file = text(old.source_file) ?? text(old.id) ?? "dissipatietest.gef";
  const depth = finite(old.depth_m) ? old.depth_m : undefined;
  return {
    id: gefTestId(file, depth), depth: depth ?? 0, source: "gef", source_file: file, points,
    ...(text(old.parent_file) ? { parent_file: text(old.parent_file) } : {}),
    ...(text(old.id) && old.id !== old.source_file ? { test_id: text(old.id) } : {}),
    ...(text(old.date) ? { start_time: text(old.date) } : {}),
    ...(depth === undefined ? { notes: [DEPTH_MISSING_NOTE] } : {}),
  };
}

/**
 * Zet dissipatietests uit de eerdere opslagvorm bij de sondering in het veld `dissipation_tests`.
 * Geeft dezelfde sondering terug als er niets om te zetten is.
 */
export function migrateDissipation(cpt: Cpt): Cpt {
  const raw = cpt.metadata?.extra?.[LEGACY_DISSIPATION_KEY];
  if (raw === undefined) return cpt;
  let legacy: unknown[] = [];
  try {
    const value = JSON.parse(raw);
    if (Array.isArray(value)) legacy = value;
  } catch { /* onleesbaar: de sleutel verdwijnt, de sondering blijft bruikbaar */ }
  const { [LEGACY_DISSIPATION_KEY]: _old, ...extra } = cpt.metadata.extra!;
  const { extra: _extra, ...metadata } = cpt.metadata;
  let next: Cpt = { ...cpt, metadata: Object.keys(extra).length ? { ...metadata, extra } : metadata };
  // Staat een test al in het veld (zelfde bestand), dan gaat die voor: daar horen de keuzes van de gebruiker bij.
  const known = new Set((cpt.dissipation_tests ?? []).map((t) => t.source_file?.toLowerCase()));
  for (const item of legacy) {
    const test = fromLegacyTest(item);
    if (test && !known.has(test.source_file?.toLowerCase())) next = withDissipationTest(next, test);
  }
  return next;
}
