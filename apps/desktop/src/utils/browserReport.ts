import { drawCover, drawBackCover } from "./browserReportBrand";
import { drawOverviewMap } from "./browserReportMap";
import { drawReportChart } from "./browserReportChart";
import { jsPDF } from "jspdf";
import type { Cpt, ProjectMeta } from "../types/cpt";
import { DEFAULT_SECTIONS, type ReportSections } from "../store/reportSectionsState";
import { zones } from "./browserCore";
/** Local vector report. Includes native axis geometry and an RD grid fallback when map services are unavailable. */
export async function generateBrowserReport(cpts: Cpt[], project: ProjectMeta, sections: ReportSections = DEFAULT_SECTIONS): Promise<Uint8Array> {
    if (!cpts.length)
        throw new Error("Geen sonderingen geopend.");
    if (!Object.values(sections).some(Boolean))
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
    const num = (v?: number) => v != null && Number.isFinite(v) ? v.toFixed(2) : "—";
    if (sections.cover) {
        page("");
        drawCover(doc, cpts[0], project);
    }
    if (sections.coordTable) {
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
    if (sections.map) {
        page("Overzichtskaart");
        await drawOverviewMap(doc, cpts);
    }
    if (sections.perCpt)
        for (const c of cpts) {
            page("");
            chartPages.add(doc.getNumberOfPages());
            drawReportChart(doc, c, project);
        }
    if (sections.sbtLegend) {
        page("Robertson SBT legenda");
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
                line(`${k}: ${v}`);
            line("");
        }
    }
    if (sections.cover) {
        page("");
        drawBackCover(doc);
    }
    for (let i = 1; i <= doc.getNumberOfPages(); i++) {
        if (chartPages.has(i)) continue;
        if (sections.cover && (i === 1 || i === doc.getNumberOfPages()))
            continue;
        doc.setPage(i);
        doc.setTextColor(100);
        doc.setFontSize(8);
        doc.text(`${project.project_number} | ${i} / ${doc.getNumberOfPages()}`, 15, 290);
    }
    return new Uint8Array(doc.output("arraybuffer"));
}
