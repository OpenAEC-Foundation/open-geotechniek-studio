// Beknopte uitdraai: dezelfde getallen als de volledige afleiding, als tabellen.
// Per soort grootheid staat de formule één keer; de lagen staan in een tabel.
// Het rekenblad op het scherm en de PDF gebruiken allebei deze gegevens.
// Notatie: "R_c;cal" met sub- en superscript zoals report/reportText die zet.
import type { PileInput, PileResult } from "../types";
import { resolvePileType } from "../catalog";
import { isHistorical } from "../standards";
import { pileGeometry } from "./geometry";
import type { CheckRow, Note, StrengthResult } from "./strength-check";

export type CompactGroup = "negSkin" | "base" | "shaft" | "capacity" | "settlement" | "spring";
export interface CompactRow { group: CompactGroup; s: string; f: string; v: string }
export interface LayerTable { head: string[]; rows: string[][]; sum: string[]; formula: string }
type Fmt = (value: number, digits: number) => string;

export const COMPACT_GROUP_NL: Record<CompactGroup, string> = {
  negSkin: "Negatieve kleef", base: "Puntdraagvermogen", shaft: "Schachtwrijving", capacity: "Draagvermogen", settlement: "Zakking", spring: "Veerwaarde",
};

/** Norm-artikel per onderdeel, voor de kop van de tabel. */
export function compactArticle(group: CompactGroup, standard: PileInput["standard"]): string {
  const h = isHistorical(standard), old = standard === "nen-6743-1991";
  switch (group) {
    case "negSkin": return h ? (old ? "NEN 6740:1991 art. 11.5.1" : "NEN 6743-1:2006 art. 7.2") : "art. 7.3.2.2 (d)";
    case "base": return h ? (old ? "art. 5.3.3.1" : "art. 5.4.2.2") : "art. 7.6.2.3 (e)";
    case "shaft": return h ? (old ? "art. 5.3.3.2" : "art. 5.4.2.3") : "art. 7.6.2.3 (c)";
    case "capacity": return h ? "NEN 6743" : "art. 7.6.2.3";
    case "settlement": return "art. 7.6.4.2";
    default: return "";
  }
}

/** Tussenwaarden per laag: negatieve kleef en positieve schachtwrijving. */
export function compactLayerTables(input: PileInput, result: PileResult, fmt: Fmt, soilName: (kind: PileResult["negKleef"]["layers"][number]["layer"]["kind"]) => string): { neg: LayerTable; shaft: LayerTable } {
  const type = resolvePileType(input);
  const os = result.negKleef.meanPerimeterM ?? pileGeometry(input.diameterMm, type?.isCircular ?? true, input.sideBMm).perimeterM;
  const posTop = input.posKleefTopNap ?? input.negKleefBottomNap;
  return {
    neg: {
      head: ["Laag", "h [m]", "O_s [m]", "σ_v;gem [kPa]", "K_0·tan δ", "F_s;nk [kN]"],
      rows: result.negKleef.layers.map((l) => [soilName(l.layer.kind), fmt(l.thickness, 2), fmt(l.perimeterM ?? os, 3), fmt(l.thickness > 0 ? l.sigmaGemRep / l.thickness : 0, 1), fmt(l.k0TanDelta, 3), fmt(l.fsNkRep, 1)]),
      sum: ["Σ", "", "", "", "", fmt(result.negKleef.fnkRep, 1)],
      formula: "F_s;nk;i = O_s;i · K_0·tan δ_i · σ_v;gem;i · h_i",
    },
    shaft: {
      head: ["Laag", "Van [m NAP]", "Tot [m NAP]", "O_s [m]", "q_c;gem [MPa]", "q_s [MPa]", "R_s [kN]"],
      rows: result.shaft.perLayer.map((l) => [soilName(l.layer.kind), fmt(Math.min(l.layer.startNap, posTop), 2), fmt(Math.max(l.layer.endNap, input.pileToeNap), 2), fmt(l.perimeterM ?? os, 3), fmt(l.qcGemMpa, 2), fmt(l.qsMpa, 3), fmt(l.rsLayer, 1)]),
      sum: ["Σ", "", "", "", "", "", fmt(result.shaft.rsCalMax, 1)],
      formula: "R_s;j = O_s;j · q_s;j · h_j, q_s;j = α_s · q_c;j;gem",
    },
  };
}

/** Uitkomsten: per grootheid het symbool, de formule en de waarde. */
export function compactRows(input: PileInput, result: PileResult, fmt: Fmt): CompactRow[] {
  const { negKleef: nk, base, shaft, settlement: st, spring, summary } = result;
  const type = resolvePileType(input);
  const rows: CompactRow[] = [];
  const add = (group: CompactGroup, s: string, f: string, v: string) => rows.push({ group, s, f, v });
  const kn = (v: number, d = 0) => `${fmt(v, d)} kN`;

  add("negSkin", "F_nk;rep", "Σ F_s;nk;i", kn(nk.fnkRep));
  add("negSkin", "F_nk;d", `γ_f,nk · F_nk;rep, γ_f,nk = ${fmt(input.gammaFnk, 2)}`, kn(nk.fnkD));

  add("base", "q_c;I;gem / q_c;II;gem / q_c;III;gem", `trajecten I, II en III; D_eq = ${fmt(base.deqMm, 0)} mm`, `${fmt(base.qcIGemMpa, 2)} / ${fmt(base.qcIIGemMpa, 2)} / ${fmt(base.qcIIIGemMpa, 2)} MPa`);
  add("base", "q_b;max", `½ · α_p · β · s · ((q_c;I;gem + q_c;II;gem) / 2 + q_c;III;gem) ≤ 15 MPa; α_p = ${fmt(type?.alphaP ?? 0, 2)}, β = ${fmt(type?.beta ?? 1, 2)}, s = ${fmt(type?.s ?? 1, 2)}`,
    `${fmt(base.qbMaxMpa, 2)} MPa${base.qbMaxMpaRaw > 15 ? ` (${fmt(base.qbMaxMpaRaw, 2)} afgekapt)` : ""}`);
  add("base", "R_b;cal;max", `A_b · q_b;max, A_b = ${fmt(base.abMm2, 0)} mm²`, kn(base.rbCalMax));

  add("shaft", "R_s;cal;max", `Σ R_s;j, α_s = ${fmt(type?.alphaS ?? 0, 4)}`, kn(shaft.rsCalMax));

  add("capacity", "R_c;cal", "R_b;cal;max + R_s;cal;max", kn(summary.rcCal));
  add("capacity", "R_c;k", summary.historicalXi === undefined ? `R_c;cal / ξ_3, ξ_3 = ${fmt(summary.xi3, 2)}` : `ξ · R_c;cal, ξ = ${fmt(summary.historicalXi, 2)}`, kn(summary.rcK));
  add("capacity", "R_c;d", `R_c;k / γ_m, γ_m = ${fmt(input.gammaM, 2)}`, kn(summary.rcD));
  add("capacity", "R_c;net;d", "R_c;d − F_nk;d", kn(summary.rcNetD));
  add("capacity", "u.c.", `N_Ed / R_c;net;d = ${fmt(input.nEd, 0)} / ${fmt(summary.rcNetD, 0)}`, fmt(summary.unityCheck, 2));

  if (st.available !== false) {
    const wp = st.sls;
    add("settlement", "F_c;tot", "N_k + F_nk;d", kn(wp.fcTot));
    add("settlement", "s_b", `lastzakkingslijn 1; R_b = ${fmt(wp.rbMobil, 0)} kN, R_s = ${fmt(wp.rsMobil, 0)} kN`, `${fmt(wp.sbMm, 1)} mm`);
    add("settlement", "s_el", `L · F_gem / EA; F_gem = ${fmt(wp.fgem, 0)} kN, EA = ${fmt(st.eaKn ?? 0, 0)} kN`, `${fmt(wp.selMm, 1)} mm`);
    add("settlement", "s_1", "s_b + s_el", `${fmt(wp.s1Mm, 1)} mm`);
    add("settlement", "s_1;uls", `F_c;tot = ${fmt(st.uls.fcTot, 0)} kN`, `${fmt(st.uls.s1Mm, 1)} mm`);
    add("spring", "k_1", "F_c;tot / s_1", `${fmt(spring.kSlsKnPerM, 0)} kN/m`);
    add("spring", "k_min / k_max", "k_1 / √2 en k_1 · √2", `${fmt(spring.kMinKnPerM, 0)} / ${fmt(spring.kMaxKnPerM, 0)} kN/m`);
  }
  return rows;
}

// ─── Sterktetoets: tabelrijen voor scherm en PDF ─────────────────

export const STRENGTH_STATUS_NL: Record<CheckRow["status"], string> = {
  ok: "voldoet", fail: "voldoet niet", outside: "valt buiten deze toetsing", na: "niet getoetst", info: "ter informatie",
};
const fill = (n: Note) => n.nl.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(n.vars?.[k] ?? ""));
export const noteText = fill;
export const ucString = (uc: number | null, fmt: Fmt) => (uc === null ? "-" : uc === Infinity ? "∞" : uc > 99 ? "> 99" : fmt(uc, 2));
const quantity = (q: CheckRow["demand"], fmt: Fmt) => (!q ? "-" : Number.isFinite(q.v) ? `${q.s} = ${fmt(q.v, q.d ?? 1)}${q.u ? ` ${q.u}` : ""}` : q.s);

/** Rijen van de sterktetabel en per toets de tussenwaarden als één regel (Nederlands, voor de PDF). */
export function strengthTable(strength: StrengthResult, fmt: Fmt, nap: (zM: number) => string) {
  return {
    head: ["Toets", "Artikel", "Rekenwaarde", "Weerstand", "u.c.", "Oordeel"],
    rows: strength.rows.map((r) => [r.zM === undefined ? r.label : `${r.label} (${nap(r.zM)})`, r.article.replace(/NEN-EN /g, "EN "), quantity(r.demand, fmt), quantity(r.resistance, fmt), ucString(r.uc, fmt), STRENGTH_STATUS_NL[r.status]]),
    steps: strength.rows.filter((r) => r.steps.length || r.note).map((r) => {
      const steps = r.steps.map((s) => `${s.s}${s.f ? ` = ${s.f}` : ""} = ${fmt(s.v, s.d ?? 1)}${s.u ? ` ${s.u}` : ""}`).join("; ");
      return `${r.label}: ${[steps, r.note ? fill(r.note) : ""].filter(Boolean).join(". ")}`;
    }),
    notes: strength.notes.map(fill),
  };
}
