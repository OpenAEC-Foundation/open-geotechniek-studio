// Export van de draagvermogentabel voor Pile Plan Studio: twee CSV-bestanden volgens het standaard-tabelcontract
// (UTF-8, komma als scheiding, punt als decimaalteken, kopregel optioneel):
//   sonderingen.csv       ID,X,Y              — numerieke ID, RD (EPSG:28992) in millimeters
//   funderingsadvies.csv  CPT ID,Tip,Size,FRD — paalpunt in m NAP (hele mm), maat in mm, Rc;net;d in kN
// Een ontbrekende weerstand krijgt een lege FRD-cel (Pile Plan Studio slaat die rij over met een waarschuwing),
// zodat die nooit met een berekende nul verward wordt.
import type { Cpt } from "../../../types/cpt";
import { invalidReason, type CapacityMatrix } from "./capacity-table";

export interface PilePlanMissing { cptId: string; sizeMm: number; toeNap: number; reason: string }
export interface PilePlanExport {
  cptsCsv: string;
  adviceCsv: string;
  /** Sonderingsnaam en de numerieke ID in beide bestanden. */
  ids: { cptId: string; id: number }[];
  /** Sonderingen zonder bruikbare RD-positie; ze staan in geen van beide bestanden. */
  noPosition: string[];
  /** Combinaties zonder berekende weerstand (lege FRD-cel). */
  missing: PilePlanMissing[];
  /** Aantal rijen met een berekende weerstand. */
  rows: number;
}

/**
 * Numerieke ID per sondering: de cijfers aan het eind van de naam (DKM101 → 101) als die voor alle sonderingen
 * uniek en groter dan nul zijn, anders 1, 2, 3, … in de volgorde van de tabel.
 */
export function pilePlanIds(cptIds: string[]): Map<string, number> {
  const tail = cptIds.map((id) => { const m = /(\d+)\D*$/.exec(id); return m ? Number(m[1]) : NaN; });
  const usable = tail.every((n) => Number.isSafeInteger(n) && n > 0) && new Set(tail).size === tail.length;
  return new Map(cptIds.map((id, i) => [id, usable ? tail[i] : i + 1]));
}

const mm = (v: number) => String(Math.round(v * 1000));
const tip = (v: number) => (Math.round(v * 1000) / 1000).toFixed(3);
const kn = (v: number) => (Math.round(v * 10) / 10).toFixed(1);

/** Beide CSV-bestanden uit de gerekende tabel van het hoofdtype. */
export function buildPilePlanExport(m: CapacityMatrix, cpts: Map<string, Cpt>): PilePlanExport {
  const ids = pilePlanIds(m.cpts.map((c) => c.cptId));
  const noPosition: string[] = [];
  const cptRows: string[] = ["ID,X,Y"], adviceRows: string[] = ["CPT ID,Tip,Size,FRD"];
  const missing: PilePlanMissing[] = [];
  let rows = 0;
  for (const c of m.cpts) {
    const pos = cpts.get(c.cptId)?.position;
    if (!pos || !Number.isFinite(pos.x_rd) || !Number.isFinite(pos.y_rd)) { noPosition.push(c.cptId); continue; }
    const id = ids.get(c.cptId)!;
    cptRows.push(`${id},${mm(pos.x_rd)},${mm(pos.y_rd)}`);
    m.sizesMm.forEach((size, si) => m.toeNaps.forEach((toe, li) => {
      const r = c.cells[si][li].result;
      const ok = !c.missing && r.ok && Number.isFinite(r.summary.rcNetD);
      adviceRows.push(`${id},${tip(toe)},${Math.round(size)},${ok ? kn(r.summary.rcNetD) : ""}`);
      if (ok) rows += 1;
      else missing.push({ cptId: c.cptId, sizeMm: size, toeNap: toe, reason: c.missing ? "sondering ontbreekt" : invalidReason(r.error, r.errorCode) });
    }));
  }
  return {
    cptsCsv: cptRows.join("\n") + "\n", adviceCsv: adviceRows.join("\n") + "\n",
    ids: m.cpts.filter((c) => !noPosition.includes(c.cptId)).map((c) => ({ cptId: c.cptId, id: ids.get(c.cptId)! })),
    noPosition, missing, rows,
  };
}
