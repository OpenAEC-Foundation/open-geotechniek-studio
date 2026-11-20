// PDF-uitdraai trekpaal, met dezelfde kop, voet en opmaak als het paaldraagvermogenrapport.
// Met een tabel: de gekozen voorbeelden volledig uitgewerkt, daarna de tabellen per paalmaat.
import { jsPDF } from "jspdf";
import type { ProjectContext } from "../../framework/types";
import { TOTAL_PAGES_TOKEN, formula, kv, makeCursor, nl, paragraph, sectionTitle, table, type Cursor } from "../pile-bearing-capacity/parts/pile-report-pdf";
import { SOIL_LABELS, computeTension, correlationFactors, type TensionInput, type TensionOk, type TensionResult } from "./compute";
import { cellInput, computeTensionTable, sizeLabel, type TensionTable } from "./table";

const NORM = "NEN 9997-1 art. 7.6.3";
const reportDate = (iso: string | undefined) => (iso || new Date().toISOString().slice(0, 10)).slice(0, 10).split("-").reverse().join("-");
const nap = (v: number) => nl(v, 2);
/** Maximaal zoveel sonderingen naast elkaar op A4. */
const CPT_COLUMNS = 7;

export function tensionReportFileName(input: TensionInput): string {
  return `trekpaal-${input.cptId ?? "tabel"}`;
}

export function buildTensionReport(input: TensionInput, result: TensionResult, ctx: ProjectContext): Uint8Array {
  const meta = ctx.projectMeta;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const c = makeCursor(doc, {
    number: meta.project_number || "-", description: meta.title || "Trekpalen", norm: NORM, date: reportDate(meta.date),
    author: meta.author || "Open Geotechniek Studio", onderdeel: "Trekpalen",
  });
  if (!input.table) {
    if (!result.ok) throw new Error(result.error);
    renderSheet(c, input, result);
  } else {
    const t = computeTensionTable(input, ctx.cpts);
    const picks = t.config.examples.filter((e) => ctx.cpts.has(e.cptId));
    if (!picks.length && result.ok) renderSheet(c, input, result);
    picks.forEach((e, k) => {
      const cell = cellInput(input, e.cptId, e.sizeMm, e.toeNap);
      const r = computeTension({ ...cell, cptCount: Math.max(1, t.config.cptIds.length) }, ctx.cpts.get(e.cptId)!, t.xi3);
      if (!r.ok) throw new Error(`Sondering ${e.cptId}, ${e.sizeMm} mm op NAP ${nap(e.toeNap)} m is niet berekenbaar: ${r.error}`);
      if (k > 0) c.newPage();
      renderSheet(c, cell, r, `Sondering ${e.cptId}, ${sizeLabel(input, e.sizeMm)} mm, punt NAP ${nap(e.toeNap)} m`);
    });
    renderTables(c, input, t, picks.length > 0 || result.ok);
  }
  if (typeof doc.putTotalPages === "function") doc.putTotalPages(TOTAL_PAGES_TOKEN);
  return new Uint8Array(doc.output("arraybuffer"));
}

function renderSheet(c: Cursor, i: TensionInput, r: TensionOk, title?: string): void {
  const f = r.factors, type = r.pileType;
  sectionTitle(c, title ?? `Trekpaal op sondering ${i.cptId ?? "-"}`, NORM);
  kv(c, "Paaltype", `${type.name}; α_t = ${nl(type.alphaT, 4)} in zand (tabel 7.c)`);
  kv(c, "Afmeting", `${type.isCircular ? "diameter" : "zijde"} ${nl(i.sizeMm, 0)} mm; omtrek ${nl(r.perimeterM, 3)} m; D_eq ${nl(r.equivalentDiameterM, 3)} m`);
  kv(c, "Paalkop en paalpunt", `NAP ${nap(i.pileTopNap)} m en NAP ${nap(i.pileToeNap)} m; lengte ${nl(i.pileTopNap - i.pileToeNap, 2)} m`);
  kv(c, "Grondwaterstand", `NAP ${nap(i.waterNap)} m`);
  if (i.excavationNap !== undefined) kv(c, "Ontgraving", `tot NAP ${nap(i.excavationNap)} m; reductie q_c: ${i.excavationReduction === "linear" ? "lineair (geheid na ontgraven)" : i.excavationReduction === "sqrt" ? "wortel (paal voor ontgraven of trillingsarm)" : "geen (sondering na ontgraven)"}`);
  kv(c, "Bovenkant trekzone", `NAP ${nap(r.tensionTopNap)} m`);
  kv(c, "Klei en leem", i.includeCohesive ? `tellen mee volgens tabel 7.d${i.halveCohesive ? ", met halve α_t" : ""}` : "tellen niet mee");
  kv(c, "Belasting", `F_t;d = ${nl(i.ftDKn, 0)} kN; F_t;max;rep = ${nl(i.ftMaxRepKn, 0)} kN; F_t;min;rep = ${nl(i.ftMinRepKn, 0)} kN`);
  kv(c, "Paalgroep", r.group ? `stramien ${nl(i.group!.spacingXM, 2)} × ${nl(i.group!.spacingYM, 2)} m; invloedsoppervlak A = ${nl(r.group.areaM2, 2)} m²; f_1 = ${nl(r.group.f1, 2)}${i.group!.edge ? "; rand- of hoekpaal" : ""}` : "alleenstaande paal: f_1 = f_2 = 1, geen kluittoets");

  sectionTitle(c, "Factoren");
  formula(c, "γ_m;var;qc", "1 + 0,25 · (F_t;max;rep − F_t;min;rep) / F_t;max;rep, tussen 1,0 en 1,5", null, nl(f.gammaVar, 2));
  const xi = correlationFactors(i.cptCount, i.stiffStructure);
  kv(c, "Correlatiefactor", `ξ = ${nl(f.xi, 2)} (tabel A.10 bij ${i.cptCount} sondering${i.cptCount === 1 ? "" : "en"}, ${i.stiffStructure ? "stijf" : "niet-stijf"} bouwwerk: ξ_3 = ${nl(xi.xi3, 2)}, ξ_4 = ${nl(xi.xi4, 2)})`);
  formula(c, "q_c;z;d", "q_c;z;a / (ξ · γ_m;var;qc · γ_s;t)", `q_c;z;a / (${nl(f.xi, 2)} × ${nl(f.gammaVar, 2)} × ${nl(f.gammaSt, 2)})`, `q_c;z;a / ${nl(f.xi * f.gammaVar * f.gammaSt, 3)}`);

  sectionTitle(c, "Trekweerstand per laag", "art. 7.6.3.3");
  const rows = r.layers.filter((l) => l.inTensionZone);
  table(c, [
    { label: "Van [m NAP]", width: 13, align: "right" }, { label: "Tot [m NAP]", width: 13, align: "right" }, { label: "Grond", width: 11 },
    { label: "q_c [MPa]", width: 11, align: "right" }, { label: "q_c;a [MPa]", width: 12, align: "right" }, { label: "q_c;d [kPa]", width: 12, align: "right" },
    { label: "α_t", width: 11, align: "right" }, ...(r.group ? [{ label: "σ'_v;d [kPa]", width: 14, align: "right" as const }, { label: "f_2", width: 9, align: "right" as const }] : []),
    { label: "ΔR_t;d [kN]", width: 13, align: "right" },
  ], rows.map((l) => [nap(l.topNap), nap(l.bottomNap), SOIL_LABELS[l.soil], nl(l.qcMpa, 2), nl(l.qcAppliedMpa, 2), nl(l.qcDesignKpa, 0), l.alphaT ? nl(l.alphaT, 4) : "-",
    ...(r.group ? [nl(l.sigmaTopDesignKpa, 1), l.alphaT && l.soil === "sand" ? nl(l.f2, 3) : "-"] : []), nl(r.group ? l.rGroupKn : l.rSingleKn, 1)]),
  { size: 7, summaryRow: ["Som", "", "", "", "", "", "", ...(r.group ? ["", ""] : []), nl(r.rFrictionKn, 1)] });
  paragraph(c, "q_c;a: na reductie voor ontgraving en afsnuiten (piek boven 12 MPa naar 12 MPa; pakket dikker dan 1 m naar 15 MPa). ΔR_t;d = O_s · f_1 · f_2 · α_t · q_c;d · Δz.", { italic: true, size: 7.5 });

  sectionTitle(c, "Toets", "art. 7.6.3.1");
  kv(c, "Wrijving alleenstaande paal", `${nl(r.rSingleKn, 1)} kN`);
  if (r.group) {
    kv(c, "Wrijving in de groep (met f_2)", `${nl(r.rFrictionKn, 1)} kN`);
    kv(c, "Kluitgewicht R_t;kluit;d", `${nl(r.group.rKluitKn, 1)} kN (kegelhoogte ${nl(r.group.coneHeightM, 2)} m, halve tophoek ${nl(r.group.halfAngleDeg, 0)}°)`);
  }
  kv(c, "Paalgewicht G'_paal;d", type.displacement === "full" ? `${nl(r.gPileKn, 1)} kN` : "telt niet mee (niet grondverdringend)");
  formula(c, "R_t;d", r.group ? "min(R_t;wrijving;d ; R_t;kluit;d) + G'_paal;d" : "R_t;wrijving;d + G'_paal;d",
    r.group ? `min(${nl(r.rFrictionKn, 1)} ; ${nl(r.group.rKluitKn, 1)}) + ${nl(r.gPileKn, 1)}` : `${nl(r.rFrictionKn, 1)} + ${nl(r.gPileKn, 1)}`, `${nl(r.rtDKn, 1)} kN`);
  if (i.ftDKn > 0) formula(c, "F_t;d ≤ R_t;d", `${nl(i.ftDKn, 0)} ≤ ${nl(r.rtDKn, 0)} kN`, null, `u.c. ${nl(r.unityCheck ?? 0, 2)}: ${r.passes ? "voldoet" : "voldoet niet"}`);
  for (const w of r.warnings) paragraph(c, `Let op: ${w}`, { italic: true, size: 7.5 });
  paragraph(c, "De grondsoort per laag komt uit de indicatieve laagindeling van de sondering. Volumegewichten met een partiële factor 1,1; onder water verminderd met 10 kN/m³.", { italic: true, size: 7.5 });
}

function renderTables(c: Cursor, input: TensionInput, t: TensionTable, newPage: boolean): void {
  if (newPage) c.newPage();
  sectionTitle(c, "Trekweerstandtabellen", NORM);
  paragraph(c, `Rekenwaarde van de trekweerstand R_t;d per paalmaat, puntniveau en sondering. Per sondering gerekend met ξ_3 = ${nl(t.xi3, 2)}; de eindwaarde is het laagste van het gemiddelde met ξ_3 en de laagste sondering met ξ_4 = ${nl(t.xi4, 2)} (${t.config.cptIds.length} sondering${t.config.cptIds.length === 1 ? "" : "en"}, ${input.stiffStructure ? "stijf" : "niet-stijf"} bouwwerk).${input.ftDKn > 0 ? ` F_t;d = ${nl(input.ftDKn, 0)} kN.` : ""}`);
  t.config.sizesMm.forEach((sizeMm, si) => {
    const cells = t.cells[si], ids = cells[0]?.perCpt.map((p) => p.cptId) ?? [];
    for (let start = 0; start < Math.max(1, ids.length); start += CPT_COLUMNS) {
      const part = ids.slice(start, start + CPT_COLUMNS), last = start + CPT_COLUMNS >= ids.length;
      sectionTitle(c, `${sizeLabel(input, sizeMm)} mm: R_t;d [kN]${ids.length > CPT_COLUMNS ? ` (sonderingen ${start + 1} tot ${start + part.length})` : ""}`);
      table(c, [{ label: "Punt [m NAP]", width: 15 }, ...part.map((id) => ({ label: id, width: 13, align: "right" as const })),
        ...(last ? [{ label: "Gem. (ξ_3)", width: 14, align: "right" as const }, { label: "Min. (ξ_4)", width: 14, align: "right" as const }, { label: "R_t;d", width: 12, align: "right" as const },
          ...(input.ftDKn > 0 ? [{ label: "u.c.", width: 10, align: "right" as const }] : [])] : [])],
      cells.map((cell) => [nap(cell.toeNap), ...cell.perCpt.slice(start, start + CPT_COLUMNS).map((p) => (p.mean.ok ? nl(p.mean.rtDKn, 0) : "n.b.")),
        ...(last ? [cell.meanKn === null ? "-" : nl(cell.meanKn, 0), cell.minKn === null ? "-" : nl(cell.minKn, 0), cell.rtDKn === null ? "-" : nl(cell.rtDKn, 0),
          ...(input.ftDKn > 0 ? [cell.unityCheck === null ? "-" : nl(cell.unityCheck, 2)] : [])] : [])]), { size: 7 });
    }
  });
  paragraph(c, "n.b.: niet berekend, bijvoorbeeld omdat de sondering niet tot het puntniveau reikt. Een niveau zonder alle sonderingen krijgt geen eindwaarde.", { italic: true, size: 7.5 });
}
