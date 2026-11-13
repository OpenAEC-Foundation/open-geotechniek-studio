// Draagvermogentabellen als bijlage van het paalrapport: eerst de keuzetabel
// (hoogste puntniveau per maat en sondering, met spreiding), daarna per
// sondering Rc;net;d per puntniveau en maat. Het gekozen niveau krijgt een *.
import type { CapacityMatrix, SizeChoice } from "../capacity-table";
import { invalidReason } from "../capacity-table";
import { type Cursor, nl, nlNap, paragraph, sectionTitle, table } from "./pile-report-pdf";

/** Maximaal zoveel sonderingen naast elkaar in één keuzetabel op A4. */
const CPT_COLUMNS = 7;

export function renderCapacityAppendix(c: Cursor, m: CapacityMatrix, choices: SizeChoice[], sizeLabel: (s: number) => string): void {
  c.newPage();
  sectionTitle(c, "Draagvermogentabellen");
  paragraph(c, `Netto ontwerpweerstand Rc;net;d na aftrek van negatieve kleef, per sondering, paalmaat en puntniveau. Gezocht: ${nl(m.target.minKn, 0)} tot ${nl(m.target.maxKn, 0)} kN. De keuzetabel geeft per maat het hoogste puntniveau dat de ondergrens haalt (de kortste paal die voldoet) en de spreiding van dat niveau over de sonderingen.`);

  sectionTitle(c, "Keuzetabel: puntniveau [m NAP] per maat en sondering");
  for (let start = 0; start < m.cpts.length; start += CPT_COLUMNS) {
    const ids = m.cpts.slice(start, start + CPT_COLUMNS).map((x) => x.cptId);
    const last = start + CPT_COLUMNS >= m.cpts.length;
    const cols = [{ label: "Maat [mm]", width: 14 }, ...ids.map((id) => ({ label: id, width: 16, align: "right" as const })),
      ...(last ? [{ label: "Hoogste", width: 14, align: "right" as const }, { label: "Laagste", width: 14, align: "right" as const }, { label: "Spreiding [m]", width: 15, align: "right" as const }, { label: "Gehaald", width: 12, align: "right" as const }] : [])];
    const rows = choices.map((ch) => [sizeLabel(ch.sizeMm), ...ch.perCpt.slice(start, start + CPT_COLUMNS).map((p) => p.toeNap === null ? (p.cptTooShort ? "buiten bereik" : "niet gehaald") : `${nlNapShort(p.toeNap)}${p.aboveMax ? " (ruim)" : ""}`),
      ...(last ? [ch.highestNap === null ? "-" : nlNapShort(ch.highestNap), ch.lowestNap === null ? "-" : nlNapShort(ch.lowestNap), ch.spreadM === null ? "-" : nl(ch.spreadM, 2), `${ch.reached}/${m.cpts.length}`] : [])]);
    table(c, cols, rows, { size: 7 });
  }
  paragraph(c, "(ruim): ook de kortste paal die voldoet zit boven de bovengrens; een kleinere maat ligt voor de hand.", { italic: true, size: 7.5 });

  for (const cpt of m.cpts) {
    sectionTitle(c, `Sondering ${cpt.cptId}: Rc;net;d [kN]`);
    if (cpt.missing) { paragraph(c, "Sondering ontbreekt in het project."); continue; }
    if (cpt.profileNote) paragraph(c, cpt.profileNote, { italic: true, size: 7.5 });
    const chosen = choices.map((ch) => ch.perCpt.find((p) => p.cptId === cpt.cptId)?.toeNap ?? null);
    const cols = [{ label: "Punt [m NAP]", width: 16 }, ...m.sizesMm.map((s) => ({ label: sizeLabel(s), width: 14, align: "right" as const }))];
    const rows = m.toeNaps.map((t, li) => [nlNapShort(t), ...m.sizesMm.map((_, si) => {
      const r = cpt.cells[si][li].result;
      if (!r.ok) return invalidReason(r.error, r.errorCode);
      return `${nl(r.summary.rcNetD, 0)}${chosen[si] === t ? "*" : ""}`;
    })]);
    table(c, cols, rows, { size: 7 });
  }
  paragraph(c, "* gekozen puntniveau: hoogste niveau waarop de ondergrens wordt gehaald.", { italic: true, size: 7.5 });
}

/** NAP-niveau als getal met twee decimalen, zonder voorvoegsel. */
function nlNapShort(v: number): string {
  return nlNap(v).replace(/^NAP\s*/i, "").replace(/\s*m$/, "");
}
