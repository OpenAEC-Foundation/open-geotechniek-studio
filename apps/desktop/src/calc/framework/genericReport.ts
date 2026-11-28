// Algemeen rekenblad als PDF voor een module zonder eigen rapport: invoer,
// kernuitkomsten en statusregel in de huisstijl van de andere rapporten.
// De headless rekenkern gebruikt dit voor de losse rekenbladen (poer, zetting,
// kalendering); de modules van de app hebben hun eigen rapport.
import { jsPDF } from "jspdf";
import type { HeadlessCalcModule, ProjectContext } from "./types";
import { TOTAL_PAGES_TOKEN, kv, makeCursor, paragraph, sectionTitle, table } from "../modules/pile-bearing-capacity/parts/pile-report-pdf";

const reportDate = (iso: string | undefined) => (iso || new Date().toISOString().slice(0, 10)).slice(0, 10).split("-").reverse().join("-");

function valueText(v: unknown): string {
  if (typeof v === "number") return Number.isFinite(v) ? v.toLocaleString("nl-NL", { maximumFractionDigits: 4 }) : "-";
  if (typeof v === "boolean") return v ? "ja" : "nee";
  if (v === null || v === undefined) return "-";
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

/** Rekenblad met de invoer, de toetsen en de statusregel van een module. */
export function buildGenericReport(mod: HeadlessCalcModule, input: unknown, result: unknown, ctx: ProjectContext): Uint8Array {
  const meta = ctx.projectMeta;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const c = makeCursor(doc, {
    number: meta.project_number || "-", description: meta.title || mod.name, norm: mod.norm, date: reportDate(meta.date),
    author: meta.author || "Open Geotechniek Studio", onderdeel: mod.name,
  });
  sectionTitle(c, mod.name, mod.norm);
  paragraph(c, mod.subtitle);
  sectionTitle(c, "Invoer");
  const fields = input && typeof input === "object" ? Object.entries(input as Record<string, unknown>) : [];
  for (const [key, value] of fields) kv(c, key, valueText(value));
  const checks = mod.checks?.(input, result) ?? [];
  if (checks.length) {
    sectionTitle(c, "Uitkomsten");
    table(c, [{ label: "Grootheid", width: 40 }, { label: "Waarde", width: 40, align: "right" }, { label: "u.c.", width: 14, align: "right" }, { label: "Oordeel", width: 20 }],
      checks.map((k) => [k.label, k.value, k.uc === undefined ? "" : valueText(Math.round(k.uc * 100) / 100), k.uc === undefined ? "" : k.uc <= 1 ? "voldoet" : "voldoet niet"]));
  }
  const status = mod.statusLine?.(result);
  if (status) paragraph(c, `Status: ${status.text}`);
  paragraph(c, "BETA RELEASE - Resultaten zijn indicatief; niet gebruiken voor vergunning of uitvoering.", { size: 8 });
  if (typeof doc.putTotalPages === "function") doc.putTotalPages(TOTAL_PAGES_TOKEN);
  return new Uint8Array(doc.output("arraybuffer"));
}
