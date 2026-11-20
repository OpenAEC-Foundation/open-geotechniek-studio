// PDF-uitdraai fundering op staal, met dezelfde kop, voet en opmaak als de andere rekenbladen.
import { jsPDF } from "jspdf";
import type { ProjectContext } from "../../framework/types";
import { TOTAL_PAGES_TOKEN, formula, kv, makeCursor, nl, paragraph, sectionTitle, table } from "../pile-bearing-capacity/parts/pile-report-pdf";
import { DEFAULT_FACTORS } from "./catalog";
import type { SpreadInput, SpreadResult } from "./compute";

const NORM = "NEN 9997-1 art. 6.5";
const reportDate = (iso: string | undefined) => (iso || new Date().toISOString().slice(0, 10)).slice(0, 10).split("-").reverse().join("-");
const nap = (v: number) => nl(v, 2);
/** Tekens die de standaardletters van de PDF niet kennen. */
const plain = (s: string) => s.replace(/π/g, "pi").replace(/⅔/g, "2/3").replace(/′/g, "'").replace(/½/g, "0,5");

export function spreadReportFileName(input: SpreadInput): string {
  return `fundering-op-staal-${input.shape === "strip" ? "strook" : "poer"}`;
}

export function buildSpreadReport(i: SpreadInput, r: SpreadResult, ctx: ProjectContext): Uint8Array {
  if (!r.ok) throw new Error(r.error);
  const meta = ctx.projectMeta, f = { ...DEFAULT_FACTORS, ...i.factors }, unit = r.unit, mUnit = r.strip ? "kNm/m" : "kNm";
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const c = makeCursor(doc, {
    number: meta.project_number || "-", description: meta.title || "Fundering op staal", norm: NORM, date: reportDate(meta.date),
    author: meta.author || "Open Geotechniek Studio", onderdeel: "Fundering op staal",
  });

  sectionTitle(c, `Fundering op staal: ${r.strip ? "strook" : "poer"}`, NORM);
  kv(c, "Afmetingen", r.strip ? `B = ${nl(i.widthM)} m, per strekkende meter` : `B x L = ${nl(i.widthM)} x ${nl(i.lengthM)} m`);
  kv(c, "Niveaus", `aanleg NAP ${nap(i.foundationNap)} m; maaiveld lage zijde NAP ${nap(i.groundNap)} m; grondwater NAP ${nap(i.waterNap)} m`);
  kv(c, "Dekking", `${nl(r.coverM)} m; sigma'v;z;d = ${nl(r.qKpa, 1)} kPa`);
  if (i.slopeDeg > 0 || i.baseTiltDeg > 0) kv(c, "Hellingen", `maaiveld beta = ${nl(i.slopeDeg, 1)} graden; onderkant fundering alpha = ${nl(i.baseTiltDeg, 1)} graden`);
  kv(c, "Belasting (rekenwaarden)", `Vd = ${nl(i.vDKn, 1)} ${unit}; Hd = ${nl(i.hDKn, 1)} ${unit}${r.strip ? "" : ` evenwijdig aan ${i.hDirection}`}, ${nl(i.hArmM)} m boven het funderingsvlak; Md = ${nl(i.momentDKnm, 1)} ${mUnit}`);
  kv(c, "Excentriciteit van Vd", r.strip ? `${nl(i.eccBM, 3)} m` : `${nl(i.eccBM, 3)} m in B en ${nl(i.eccLM, 3)} m in L`);
  kv(c, "Effectief draagvlak", r.strip ? `b' = ${nl(r.dims.bRawM)} m (eB = ${nl(r.dims.eccBM, 3)} m)` : `b' x l' = ${nl(r.dims.bRawM)} x ${nl(r.dims.lRawM)} m (eB = ${nl(r.dims.eccBM, 3)} m, eL = ${nl(r.dims.eccLM, 3)} m)`);
  kv(c, "Afschuiven", `Vd;min = ${nl(i.vMinDKn ?? i.vDKn, 1)} ${unit}; ${i.castInPlace ? "in het werk gestort, delta = phi'd" : "glad of prefab, delta = 2/3 phi'd"}; Rp;d = ${nl(i.passiveDKn, 1)} ${unit}`);
  kv(c, "Materiaalfactoren", `gamma_phi' = ${nl(f.gammaPhi)} (op tan phi'); gamma_c' = ${nl(f.gammaC)}; gamma_cu = ${nl(f.gammaCu)}; gamma_gamma = ${nl(f.gammaGamma)} (tabel A.4a); grondgewicht bij doorponsen ${nl(f.gammaGPunch)}`);

  sectionTitle(c, "Grondlagen (representatieve waarden)");
  table(c, [{ label: "Bovenkant [m NAP]", width: 16, align: "right" }, { label: "Grondsoort", width: 30 }, { label: "gamma [kN/m3]", width: 13, align: "right" }, { label: "gamma;sat [kN/m3]", width: 14, align: "right" },
    { label: "phi' [gr]", width: 11, align: "right" }, { label: "c' [kPa]", width: 11, align: "right" }, { label: "cu [kPa]", width: 11, align: "right" }],
  r.layers.map((l) => [nap(l.topNap), l.name, nl(l.gamma, 1), nl(l.gammaSat, 1), nl(l.phi, 1), nl(l.c, 1), nl(l.cu, 1)]), { size: 7.5 });

  sectionTitle(c, "Overzicht van de toetsen");
  table(c, [{ label: "Toets", width: 60 }, { label: "Belasting", width: 20, align: "right" }, { label: "Weerstand", width: 20, align: "right" }, { label: "u.c.", width: 10, align: "right" }, { label: "Oordeel", width: 16 }],
    r.checks.map((k) => [k.title, `${nl(k.loadKn, k.unit === "m" ? 3 : 1)} ${k.unit}`, `${nl(k.resistanceKn, k.unit === "m" ? 3 : 1)} ${k.unit}`, nl(k.uc, 2), k.passes ? "voldoet" : "voldoet niet"]), { size: 7.5 });
  paragraph(c, `Maatgevend: ${r.governing.title.toLowerCase()}, u.c. ${nl(r.governing.uc, 2)}.${r.overturning ? "" : " De kanteltoets (EQU) is niet uitgevoerd: de representatieve belastingen daarvoor zijn niet ingevuld."}`);
  for (const w of r.warnings) paragraph(c, `Let op: ${plain(w)}`, { italic: true, size: 7.5 });

  const d = r.drained;
  sectionTitle(c, "Invloedsdiepte", "art. 6.5.2.2");
  paragraph(c, d.zeManual ? `De invloedsdiepte is met de hand vastgezet op ze = ${nl(d.zeM)} m.` : `De invloedsdiepte hangt af van phi'gem;rep en Hd/Vd, en het gemiddelde weer van de invloedsdiepte. Begonnen is met ze = 1,5 b'; ${d.converged ? `na ${d.iterations.length} stappen verandert ze niet meer` : `na ${d.iterations.length} stappen is de iteratie NIET geconvergeerd`}: ze = ${nl(d.zeM)} m, tot NAP ${nap(i.foundationNap - d.zeM)} m.`);
  table(c, [{ label: "Stap", width: 8, align: "right" }, { label: "ze aangenomen [m]", width: 18, align: "right" }, { label: "phi'gem;rep [gr]", width: 16, align: "right" }, { label: "phi'gem;d [gr]", width: 16, align: "right" },
    { label: "c'gem;d [kPa]", width: 16, align: "right" }, { label: "gamma'gem;d [kN/m3]", width: 18, align: "right" }, { label: "ze uit tabel [m]", width: 18, align: "right" }],
  d.iterations.map((s) => [String(s.step), nl(s.zeM, 3), nl(s.phiRepDeg, 2), nl(s.phiD, 2), nl(s.cD, 2), nl(s.gammaD, 2), nl(s.zeNextM, 3)]), { size: 7.5 });
  paragraph(c, "Gewogen gemiddelde: het gewicht van een laag is de laagdikte maal de afstand van het laagmidden tot de invloedsdiepte.", { italic: true, size: 7.5 });

  for (const k of r.checks) {
    sectionTitle(c, k.title, k.article.startsWith("art.") ? `NEN 9997-1 ${k.article}` : k.article);
    if (k.rows) table(c, [{ label: "Van [m NAP]", width: 13, align: "right" }, { label: "Tot [m NAP]", width: 13, align: "right" }, { label: "Laag", width: 30 }, { label: "h [m]", width: 9, align: "right" }, { label: "z [m]", width: 9, align: "right" },
      { label: "phi'd [gr]", width: 11, align: "right" }, { label: "c'd [kPa]", width: 11, align: "right" }, { label: "gamma'd [kN/m3]", width: 14, align: "right" }],
    k.rows.map((w) => [nap(w.topNap), nap(w.bottomNap), `${w.name}${w.submerged ? " (nat)" : ""}`, nl(w.thicknessM, 2), nl(w.zM, 2), nl(w.phiD, 2), nl(w.cD, 2), nl(w.gammaD, 2)]), { size: 7 });
    for (const s of k.steps) formula(c, plain(s.symbol), plain(s.formula), s.filled ? plain(s.filled) : null, plain(s.result));
  }
  paragraph(c, "Zettingen, algehele stabiliteit, zijdelings wegpersen en het ontwerp van de betonvoet zijn geen onderdeel van deze berekening.", { italic: true, size: 7.5 });

  if (typeof doc.putTotalPages === "function") doc.putTotalPages(TOTAL_PAGES_TOKEN);
  return new Uint8Array(doc.output("arraybuffer"));
}
