import { APP_VERSION } from "../version";
import { validationOf } from "../validation/report";
import { paginateCpt } from "./reportPagination";
import { drawCover, drawBackCover } from "./browserReportBrand";
import { drawOverviewMap } from "./browserReportMap";
import { drawReportChart } from "./browserReportChart";
import { jsPDF } from "jspdf";
import type { Cpt, ProjectMeta } from "../types/cpt";
import { DEFAULT_SECTIONS, type ReportSections } from "../store/reportSectionsState";
import { zones } from "./browserCore";
import { drawTestReport, drawTextChapters, type ReportFlow } from "./browserReportSections";
import { reportTextChapters } from "./reportTexts";
import { drawDissipationPages } from "../dissipatie/report";
import { drawMagnetometerPages } from "../magnetometer/magnetometerReport";
import { drawBoorstaatPage } from "../boorstaat/boorstaatPdf";
/** Local vector report. Includes native axis geometry and an RD grid fallback when map services are unavailable.
 *  Without app state: the bores for the bore logs come only from `sections.bores`, so this also runs headless. */
export async function generateCptReport(cpts: Cpt[], project: ProjectMeta, sections: ReportSections = DEFAULT_SECTIONS): Promise<Uint8Array> {
    const bores = sections.boreLogs === false ? [] : sections.bores ?? [];
    if (!cpts.length && !bores.length)
        throw new Error("Geen sonderingen geopend.");
    // Teksten staan standaard aan, maar tellen pas als onderdeel wanneer er ook tekst is.
    const textChapters = sections.texts === false ? [] : reportTextChapters(sections.reportTexts ?? project.report_texts);
    if (!textChapters.length && !bores.length && !Object.keys(DEFAULT_SECTIONS).some((key) => key !== "texts" && key !== "boreLogs" && sections[key as keyof ReportSections] === true))
        throw new Error("Selecteer ten minste één rapportonderdeel.");
    const doc = new jsPDF({ unit: "mm", format: "a4", compress: false });
    doc.setProperties({ title: project.title, author: project.author });
    let pages = 0, y = 30;
    const chartPages = new Set<number>();
    function page(title: string) {
        if (pages++)
            doc.addPage();
        doc.setTextColor(25);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(17);
        doc.text(title, 15, 19);
        doc.setFontSize(9);
        y = 30;
    }
    function line(value: string) {
        for (const row of doc.splitTextToSize(value, 180) as string[]) {
            if (y > 275)
                page("Vervolg");
            doc.text(row, 15, y);
            y += 5;
        }
    }
    const flow: ReportFlow = { doc, page, get y() { return y; }, set y(value: number) { y = value; } };
    const num = (v?: number) => v != null && Number.isFinite(v) ? v.toFixed(2) : "—";
    if (sections.cover) {
        page("");
        drawCover(doc, cpts[0] ?? null, sections.coverTitle ? { ...project, title: sections.coverTitle } : project);
    }
    drawTextChapters(flow, textChapters);
    if (sections.coordTable && cpts.length) {
        page("Coördinatentabel");
        const widths = [38, 29, 29, 25, 25, 34];
        const headers = ["Sondering", "X-RD [m]", "Y-RD [m]", "Z-NAP [m]", "Diepte [m]", "Datum"];
        function row(cells: string[], heading = false) {
            const wrapped = cells.map((cell, i) => doc.splitTextToSize(cell, widths[i] - 3) as string[]);
            const height = Math.max(...wrapped.map(lines => lines.length)) * 4 + 4;
            if (y + height > 275) { page("Coördinatentabel - vervolg"); row(headers, true); }
            doc.setFontSize(8);
            doc.setFont("helvetica", heading ? "bold" : "normal");
            let x = 15;
            wrapped.forEach((lines, i) => {
                doc.setDrawColor(190); doc.rect(x, y, widths[i], height);
                doc.text(lines, x + 1.5, y + 4); x += widths[i];
            });
            y += height;
        }
        row(headers, true);
        for (const c of cpts) row([c.id, num(c.position?.x_rd), num(c.position?.y_rd), num(c.position?.z_nap ?? c.metadata.ground_level_nap), num(c.points.reduce((a, p) => Math.max(a, p.depth), 0)), c.metadata.date?.split("-").reverse().join("-") ?? "—"]);
    }
    if (sections.map && cpts.length) {
        page("Overzichtskaart");
        await drawOverviewMap(doc, cpts, { basemap: sections.basemap !== false });
    }
    if (sections.perCpt)
        for (const c of cpts) {
            for (const part of paginateCpt(c, sections.chartScale)) {
                page("");
                chartPages.add(doc.getNumberOfPages());
                drawReportChart(doc, part.cpt, project, part.span);
            }
        }
    for (const bore of bores) drawBoorstaatPage(flow, bore);
    if (sections.testReport)
        for (const c of cpts) drawTestReport(flow, c, project);
    if (sections.dissipation)
        for (const c of cpts) drawDissipationPages(flow, c);
    if (sections.magnetometer)
        for (const c of cpts) drawMagnetometerPages(flow, c);
    if (sections.sbtLegend) {
        page("Indicatieve qc/Rf-legenda");
        for (const z of zones) {
            doc.setFillColor(z.color);
            doc.rect(15, y - 3, 4, 4, "F");
            doc.text(`${z.number}. ${z.name}`, 22, y);
            y += 8;
        }
    }
    if (sections.metadata) {
        page("Metadata-overzicht");
        for (const c of cpts) {
            line(`Sondering ${c.id}`);
            for (const [k, v] of Object.entries(c.metadata)) {
                if (k === "extra")
                    continue;
                if (v != null)
                    line(`${k}: ${v}`);
            }
            for (const [k, v] of Object.entries(c.metadata.extra ?? {}))
                if (!k.startsWith("ogs:")) line(`${k}: ${v}`);
            const validation=validationOf(c);
            if(validation){line(`Validatie: ${validation.diagnostics.filter(d=>d.severity==='error').length} fouten, ${validation.diagnostics.filter(d=>d.severity==='warning').length} waarschuwingen; ${validation.voids} voids, ${validation.omittedRecords} weggelaten records.`);
              for(const diagnostic of validation.diagnostics.filter(d=>d.severity!=='info'))line(`${diagnostic.code}: ${diagnostic.message}`);
            }
            line("");
        }
    }
    if (sections.cover) {
        page("");
        drawBackCover(doc);
    }
    for (let i = 1; i <= doc.getNumberOfPages(); i++) {
        if (chartPages.has(i)) {
            doc.setPage(i);doc.setTextColor(100);doc.setFontSize(6);
            doc.text(`Open Geotechniek Studio ${APP_VERSION} | Indicatieve qc/Rf-indeling; geen genormaliseerde Robertson-classificatie`,15,292);
            continue;
        }
        if (sections.cover && (i === 1 || i === doc.getNumberOfPages()))
            continue;
        doc.setPage(i);
        doc.setTextColor(100);
        doc.setFontSize(8);
        doc.text(`${project.project_number} | ${APP_VERSION} | ${i} / ${doc.getNumberOfPages()}`, 15, 290);
    }
    return new Uint8Array(doc.output("arraybuffer"));
}
