// Vrije teksten van het sondeerrapport: welke er in het rapport komen en de voorbeeldtekst per onderdeel.
// De rapporttaal is Nederlands, net als de vaste koppen van het rapport.
import type { Cpt, ProjectMeta, ReportTexts } from "../types/cpt";
import { groundwaterFromFile, standardFromFile, TEST_REPORT_STANDARD } from "./cptTestReport";

export type ReportTextKey = keyof ReportTexts;
export const REPORT_TEXT_KEYS: ReportTextKey[] = ["introduction", "levelling", "groundwater"];
export const REPORT_TEXT_TITLES: Record<ReportTextKey, string> = {
  introduction: "Inleiding",
  levelling: "Waterpassing",
  groundwater: "Grondwaterstand",
};

/** De teksten die in het rapport komen, in vaste volgorde; een lege tekst valt weg. */
export function reportTextChapters(texts?: ReportTexts | null): Array<{ key: ReportTextKey; title: string; body: string }> {
  return REPORT_TEXT_KEYS.flatMap((key) => {
    const body = texts?.[key]?.replace(/\r\n?/g, "\n").trim();
    return body ? [{ key, title: REPORT_TEXT_TITLES[key], body }] : [];
  });
}

const nlDate = (iso: string) => iso.slice(0, 10).split("-").map((part) => part.padStart(2, "0")).reverse().join("-");
const comma = (v: number, decimals = 2) => v.toFixed(decimals).replace(".", ",");
const nap = (v: number) => `NAP ${v >= 0 ? "+" : "-"}${comma(Math.abs(v))} m`;

/** Wanneer er gesondeerd is: de datums uit de bestanden, anders de projectdatum. */
function period(project: ProjectMeta, cpts: Cpt[]): string {
  const dates = [...new Set(cpts.map((c) => c.metadata.date).filter((d): d is string => !!d && /^\d{4}-\d{1,2}-\d{1,2}/.test(d))
    .map((d) => d.slice(0, 10).split("-").map((part) => part.padStart(2, "0")).join("-")))].sort();
  if (dates.length === 1) return `op ${nlDate(dates[0])}`;
  if (dates.length > 1) return `in de periode van ${nlDate(dates[0])} tot en met ${nlDate(dates[dates.length - 1])}`;
  return /^\d{4}-\d{2}-\d{2}/.test(project.date) ? `op ${nlDate(project.date)}` : "op [datum]";
}

/**
 * Een standaardtekst met de gegevens van het project, als vertrekpunt voor de gebruiker.
 * Wat nog niet bekend is, staat tussen rechte haken zodat het opvalt.
 */
export function sampleReportText(key: ReportTextKey, project: ProjectMeta, cpts: Cpt[]): string {
  const n = cpts.length;
  const count = n === 1 ? "1 sondering" : `${n} sonderingen`;
  const client = project.client.trim() || "[opdrachtgever]";
  const location = project.location.trim() || "[locatie]";
  const when = period(project, cpts);

  if (key === "introduction") {
    const title = project.title.trim();
    const number = project.project_number.trim();
    const deepest = cpts.reduce((max, c) => c.points.reduce((value, p) => Math.max(value, p.depth), max), 0);
    const standards = cpts.map(standardFromFile);
    const byStandard = n > 0 && standards.every((s) => s?.includes("22476-1"));
    return [
      `In opdracht van ${client} ${n === 1 ? "is" : "zijn"} ${when} ter plaatse van ${location} ${count} uitgevoerd`
        + `${title ? ` voor het project ${title}` : ""}${number ? ` (projectnummer ${number})` : ""}.`,
      n > 0 && deepest > 0
        ? `De ${n === 1 ? "sondering is" : "sonderingen zijn"} uitgevoerd${byStandard ? ` volgens ${TEST_REPORT_STANDARD}` : ""} tot een diepte van maximaal ${comma(deepest, 1)} m beneden maaiveld.`
        : "",
      "Dit rapport bevat de resultaten van het onderzoek: de ligging en hoogte van de sondeerpunten en per sondering de sondeergrafiek.",
    ].filter(Boolean).join(" ");
  }

  if (key === "levelling") {
    const levels = cpts.map((c) => c.metadata.ground_level_nap ?? c.position?.z_nap).filter((v): v is number => v != null && Number.isFinite(v));
    const method = "[Vermeld hier de meetmethode, bijvoorbeeld GPS of waterpassing vanaf een vast punt.]";
    if (!levels.length)
      return `Van de ${count} ter plaatse van ${location} is in de bestanden geen maaiveldhoogte ten opzichte van NAP vastgelegd. `
        + "[Vermeld hier hoe en ten opzichte van welk referentievlak de hoogte is bepaald.]";
    const low = Math.min(...levels), high = Math.max(...levels);
    const range = levels.length === 1 || low === high ? `De maaiveldhoogte bedraagt ${nap(low)}` : `De maaiveldhoogte varieert van ${nap(low)} tot ${nap(high)}`;
    return [
      `De maaiveldhoogte ter plaatse van de ${n === 1 ? "sondering" : "sonderingen"} bij ${location} is ingemeten ten opzichte van NAP.`,
      levels.length < n ? `Van ${levels.length} van de ${count} is de hoogte bekend.` : "",
      `${range} en staat per sondering in de coördinatentabel en op de sondeergrafiek.`,
      method,
    ].filter(Boolean).join(" ");
  }

  const recorded = cpts.map((c) => ({ id: c.id, level: groundwaterFromFile(c) })).filter((item): item is { id: string; level: string } => !!item.level);
  const closing = "De grondwaterstand wisselt met het seizoen en de neerslag; de genoemde waarde is een momentopname.";
  if (!recorded.length)
    return `Tijdens de uitvoering ${when} ter plaatse van ${location} is in de sondeerbestanden geen grondwaterstand vastgelegd. `
      + `[Vermeld hier de waargenomen grondwaterstand ten opzichte van maaiveld of NAP en de wijze van meten, bijvoorbeeld in het sondeergat of in een peilbuis.] ${closing}`;
  return `Tijdens de uitvoering ${when} ter plaatse van ${location} is bij ${recorded.length} van de ${count} een grondwaterstand in het bestand vastgelegd: `
    + `${recorded.map((item) => `${item.id}: ${item.level}`).join("; ")}. `
    + `[Vermeld hier ten opzichte van welk vlak de stand is gemeten en de wijze van meten.] ${closing}`;
}
