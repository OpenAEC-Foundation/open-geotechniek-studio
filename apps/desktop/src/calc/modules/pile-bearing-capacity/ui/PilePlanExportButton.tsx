import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Cpt } from "../../../../types/cpt";
import type { CapacityMatrix } from "../capacity-table";
import { buildPilePlanExport, type PilePlanExport } from "../pile-plan-export";
import { IS_TAURI } from "../../../../utils/platform";
import { downloadBlobAsFile } from "../../../../utils/browserSave";
import { numberLocale } from "../../../i18n";

/** Schrijft één CSV-bestand: in de app via een opslagvenster, in de browser als download. Null = geannuleerd. */
async function writeCsv(name: string, text: string, folder: string | null, filterName: string): Promise<string | null> {
  if (!IS_TAURI) { downloadBlobAsFile(new Blob([text], { type: "text/csv;charset=utf-8" }), name); return name; }
  const { save } = await import("@tauri-apps/plugin-dialog");
  const path = await save({ defaultPath: folder ? `${folder}/${name}` : name, filters: [{ name: filterName, extensions: ["csv"] }] });
  if (!path) return null;
  const { writeTextFile } = await import("@tauri-apps/plugin-fs");
  await writeTextFile(path, text);
  return path;
}

/**
 * Knop bij de draagvermogentabel: de sonderingslocaties en de weerstanden als twee CSV-bestanden voor Pile Plan
 * Studio, met daaronder wat er is geschreven en wat ontbreekt.
 */
export function PilePlanExportButton({ m, cpts }: { m: CapacityMatrix; cpts: Map<string, Cpt> }) {
  const { t } = useTranslation("calcPile");
  const [done, setDone] = useState<(PilePlanExport & { files: string[] }) | null>(null);
  const [error, setError] = useState("");
  const nap = (v: number) => v.toLocaleString(numberLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const run = async () => {
    setError("");
    try {
      const out = buildPilePlanExport(m, cpts);
      if (!out.ids.length) { setDone(null); setError(t("pilePlan.noneWithPosition", "Geen van de sonderingen heeft een RD-positie; er is niets geëxporteerd.")); return; }
      const filter = t("pilePlan.filter", "CSV voor Pile Plan Studio");
      const first = await writeCsv("sonderingen.csv", out.cptsCsv, null, filter);
      if (!first) return;
      const folder = IS_TAURI ? first.replace(/[\\/][^\\/]*$/, "") : null;
      const second = await writeCsv("funderingsadvies.csv", out.adviceCsv, folder, filter);
      if (!second) { setDone({ ...out, files: [first] }); return; }
      setDone({ ...out, files: [first, second] });
    } catch (e) { setDone(null); setError(e instanceof Error ? e.message : String(e)); }
  };
  return <div className="capacity-export">
   <button type="button" onClick={run}>{t("pilePlan.button", "Exporteer voor Pile Plan Studio (CSV)")}</button>
   <span className="capacity-export-hint">{t("pilePlan.hint", "Twee bestanden: sonderingen.csv (ID, X, Y in RD, millimeters) en funderingsadvies.csv (CPT ID, punt in m NAP, maat in mm, Rc;net;d in kN) van het hoofdtype.")}</span>
   {error && <p role="alert" className="capacity-grid-error">{error}</p>}
   {done && <div role="status" className="capacity-export-result">
    <p>{done.files.length === 2
     ? t("pilePlan.written", "Geschreven: {{cpts}} sonderingen en {{rows}} weerstanden. X en Y staan in RD in millimeters.", { cpts: done.ids.length, rows: done.rows })
     : t("pilePlan.onlyFirst", "Alleen sonderingen.csv is geschreven; funderingsadvies.csv is geannuleerd.")}</p>
    <p>{t("pilePlan.ids", "Sonderings-ID's in beide bestanden: {{list}}", { list: done.ids.map((x) => `${x.cptId} → ${x.id}`).join(", ") })}</p>
    {done.noPosition.length > 0 && <p className="capacity-grid-error">{t("pilePlan.noPosition", "Zonder RD-positie, niet geëxporteerd: {{list}}", { list: done.noPosition.join(", ") })}</p>}
    {done.missing.length > 0 && <details>
     <summary>{t("pilePlan.missing", "{{n}} combinaties zonder berekende weerstand (lege FRD-cel, geen nul)", { n: done.missing.length })}</summary>
     <ul>{done.missing.slice(0, 40).map((x, i) => <li key={i}>{x.cptId} · {x.sizeMm} mm · NAP {nap(x.toeNap)}: {x.reason}</li>)}</ul>
     {done.missing.length > 40 && <p>{t("pilePlan.more", "en nog {{n}}", { n: done.missing.length - 40 })}</p>}
    </details>}
   </div>}
  </div>;
}
