import { beforeEach, describe, expect, it } from "vitest";
import type { Bore } from "../types/bore";
import type { Cpt, ProjectMeta } from "../types/cpt";
import { newProjectDocument, useCptStore } from "../store/useCptStore";
import { generateBrowserReport } from "../utils/browserReport";
import { saveBore } from "./boreStore";

const cpts: Cpt[] = [{ id: "S1", metadata: { source_file: "S1.gef" }, points: [{ depth: 0, qc: 1, fs: 0.02 }, { depth: 12, qc: 14, fs: 0.1 }] }];
const project: ProjectMeta = { title: "Rapport met boringen", client: "Klant", location: "Locatie", project_number: "42", author: "", date: "2026-11-02" };
const off = { cover: false, coordTable: false, map: false, perCpt: false, sbtLegend: false, metadata: false, texts: false };
const bore = (id: string): Bore => ({
  id, position: { x_rd: 120000, y_rd: 450000, z_nap: 1.5 }, final_depth: 5, groundwater_depth: 1.2,
  layers: [
    { top_depth: 0, base_depth: 0.8, soil_name: "Zand, zwak siltig", soil_code: "Zs1", colour: "bruin" },
    { top_depth: 0.8, base_depth: 2.5, soil_name: "Klei, zwak zandig", soil_code: "Kz1" },
    { top_depth: 2.5, base_depth: 5, soil_name: "Veen", soil_code: "V" },
  ],
  metadata: { source_file: "handmatig", start_date: "2026-11-03", bore_method: "Pulsboring" },
});
const content = (bytes: Uint8Array) => new TextDecoder("windows-1252").decode(bytes);
const pages = (pdf: string) => Number(/\/Count (\d+)/.exec(pdf)?.[1]);

describe("boorstaat in het rapport", () => {
  beforeEach(() => useCptStore.setState({ documents: [], activeDocId: null }));

  it("geeft elke boring een eigen pagina met kop, beschrijvingen en legenda", async () => {
    const pdf = content(await generateBrowserReport(cpts, project, { ...off, bores: [bore("B01"), bore("B02")] }));
    expect(pages(pdf)).toBe(2);
    for (const text of ["Boorstaat B01", "Boorstaat B02", "03-11-2026", "Pulsboring", "NAP 1.50 m", "1 : 25", "0.00 - 0.80  Zand, zwak siltig", "0.80 - 2.50  Klei, zwak zandig", "kleur bruin", "Legenda", "Grondwaterstand"])
      expect(pdf).toContain(text);
    expect(pdf.indexOf("Boorstaat B01")).toBeLessThan(pdf.indexOf("Boorstaat B02"));
  });

  it("tekent de kolom als vectoren: gevulde vlakken, arceerlijnen en punten, geen afbeelding", async () => {
    const pdf = content(await generateBrowserReport(cpts, project, { ...off, bores: [bore("B01")] }));
    expect(pdf).not.toContain("/Subtype /Image");
    // Kleur van zand, klei en veen als vulkleur (rg) in de paginastroom.
    for (const fill of ["0.98 0.89 0.42 rg", "0.49 0.77 0.5 rg", "0.66 0.45 0.31 rg"]) expect(pdf).toContain(fill);
    expect((pdf.match(/ l\r?\nS/g) ?? []).length).toBeGreaterThan(50);
  });

  it("neemt zonder opgegeven lijst de boringen van het actieve project", async () => {
    newProjectDocument();
    saveBore(bore("B11"));
    const pdf = content(await generateBrowserReport(cpts, project, { ...off, perCpt: true }));
    expect(pages(pdf)).toBe(2);
    expect(pdf).toContain("Boorstaat B11");
  });

  it("laat de boorstaten weg als het onderdeel uit staat", async () => {
    const pdf = content(await generateBrowserReport(cpts, project, { ...off, perCpt: true, boreLogs: false, bores: [bore("B01")] }));
    expect(pages(pdf)).toBe(1);
    expect(pdf).not.toContain("Boorstaat B01");
  });

  it("maakt ook een rapport van alleen boringen", async () => {
    const pdf = content(await generateBrowserReport([], project, { ...off, cover: true, coordTable: true, map: true, bores: [bore("B01")] }));
    expect(pdf).toContain("Boorstaat B01");
    await expect(generateBrowserReport([], project, { ...off, bores: [] })).rejects.toThrow("Geen sonderingen geopend.");
  });
});
