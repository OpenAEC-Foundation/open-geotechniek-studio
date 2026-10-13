import { expect, it } from "vitest";
import { classify, detectLayers } from "./browserCore";
import { generateBrowserReport } from "./browserReport";
import type { Cpt } from "../types/cpt";
const sample: Cpt = { id: "T", metadata: { source_file: "test.gef", extra: { COMPANY: "Meetbedrijf" } }, points: Array.from({ length: 53 }, (_, i) => ({ depth: i * .02, qc: i >= 25 && i < 28 ? 1.5 : 8, rf: i >= 25 && i < 28 ? 6 : .7 })) };
it.each([[.5, 2, 2], [.5, 5, 1], [1, 1, 3], [1, 3, 2], [3, 8, 2], [8, .7, 6], [8, 6, 9], [25, 1, 6], [26, 1, 8]])("native classification %s %s", (qc, rf, zone) => expect(classify(qc, rf)?.number).toBe(zone));
it("merges thin layers and coalesces adjoining sand", () => expect(detectLayers(sample)).toEqual([{ depth_top: 0, depth_bottom: 1.04, zone_number: 6, zone_name: "Zand", zone_color: "#FF9800" }]));
it("skips absent and invalid measurements", () => expect(detectLayers({ ...sample, points: [{ depth: 0 }, { depth: 1, qc: 0, rf: 1 }] })).toEqual([]));
const project = { title: "Proefproject", client: "Klant", location: "Locatie", project_number: "123", author: "Auteur", date: "2026-10-14" };
it("creates PDF with all selected sections", async () => {
    const bytes = await generateBrowserReport([sample], project, { cover: true, coordTable: true, map: true, perCpt: true, sbtLegend: true, metadata: true });
    const content = new TextDecoder("windows-1252").decode(bytes);
    expect(content.startsWith("%PDF-")).toBe(true);
    for (const title of ["Proefproject", "Coördinatentabel", "Overzichtskaart", "Sondering T", "Robertson SBT", "Meetbedrijf"])
        expect(content).toContain(title);
});
it("omits deselected sections", async () => {
    const content = new TextDecoder().decode(await generateBrowserReport([sample], project, { cover: false, coordTable: false, map: false, perCpt: false, sbtLegend: false, metadata: true }));
    expect(content).toContain("Meetbedrijf");
    expect(content).not.toContain("Overzichtskaart");
    expect(content).not.toContain("Robertson SBT");
});
it("rejects empty section selection", async () => expect(generateBrowserReport([sample], project, { cover: false, coordTable: false, map: false, perCpt: false, sbtLegend: false, metadata: false })).rejects.toThrow("onderdeel"));
