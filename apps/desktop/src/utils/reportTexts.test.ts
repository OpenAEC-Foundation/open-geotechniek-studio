import { describe, expect, it } from "vitest";
import type { Cpt, ProjectMeta } from "../types/cpt";
import { parseGef } from "../types/gefParser";
import { reportTextChapters, sampleReportText } from "./reportTexts";

const project: ProjectMeta = { title: "Nieuwbouw Dijkzicht", client: "Gemeente Voorbeeld", location: "Kadeweg 4 te Ergens", project_number: "P-2217", author: "", date: "2026-11-02" };
const cpt = (id: string, date: string | undefined, ground: number | undefined, depth: number): Cpt => ({
  id, metadata: { source_file: `${id}.gef`, date, ground_level_nap: ground }, points: [{ depth: 0, qc: 1 }, { depth, qc: 12 }],
});
const cpts = [cpt("S1", "2026-10-28", 0.84, 18.4), cpt("S2", "2026-10-29", -0.35, 22.1), cpt("S3", "2026-10-29", 0.1, 20)];

describe("vrije teksten van het rapport", () => {
  it("laat lege teksten weg en houdt de vaste volgorde aan", () => {
    expect(reportTextChapters(undefined)).toEqual([]);
    expect(reportTextChapters({ introduction: "  \n ", levelling: "", groundwater: undefined })).toEqual([]);
    const chapters = reportTextChapters({ groundwater: " Stand op 1,20 m. ", introduction: "Eerste regel.\r\nTweede regel." });
    expect(chapters.map((c) => c.title)).toEqual(["Inleiding", "Grondwaterstand"]);
    expect(chapters[0].body).toBe("Eerste regel.\nTweede regel.");
    expect(chapters[1].body).toBe("Stand op 1,20 m.");
  });

  it("vult de voorbeeldtekst van de inleiding met aantal, datum, locatie en opdrachtgever", () => {
    const text = sampleReportText("introduction", project, cpts);
    for (const part of ["Gemeente Voorbeeld", "Kadeweg 4 te Ergens", "3 sonderingen", "van 28-10-2026 tot en met 29-10-2026", "Nieuwbouw Dijkzicht", "P-2217", "22,1 m"])
      expect(text).toContain(part);
    // De norm staat er alleen als elk bestand die zelf noemt.
    expect(text).not.toContain("22476");
  });

  it("gebruikt het enkelvoud, de projectdatum en zichtbare invulplekken als gegevens ontbreken", () => {
    const text = sampleReportText("introduction", { ...project, client: "", location: " " }, [cpt("S1", undefined, undefined, 12)]);
    expect(text).toContain("In opdracht van [opdrachtgever] is op 02-11-2026 ter plaatse van [locatie] 1 sondering uitgevoerd");
  });

  it("noemt in de waterpassing het bereik van de maaiveldhoogten en anders dat ze ontbreken", () => {
    const text = sampleReportText("levelling", project, cpts);
    expect(text).toContain("varieert van NAP -0,35 m tot NAP +0,84 m");
    expect(text).toContain("Kadeweg 4 te Ergens");
    expect(sampleReportText("levelling", project, [cpt("S1", undefined, undefined, 5)])).toContain("geen maaiveldhoogte ten opzichte van NAP vastgelegd");
    expect(sampleReportText("levelling", project, [cpts[0], cpt("S9", undefined, undefined, 5)])).toContain("Van 1 van de 2 sonderingen is de hoogte bekend.");
  });

  it("neemt een grondwaterstand alleen over als het bestand die geeft", () => {
    expect(sampleReportText("groundwater", project, cpts)).toContain("geen grondwaterstand vastgelegd");
    const gef = parseGef(`#GEFID= 1, 1, 0
#TESTID= S7
#COLUMN= 2
#COLUMNINFO= 1, m, sondeerlengte, 1
#COLUMNINFO= 2, MPa, conusweerstand, 2
#MEASUREMENTTEXT= 6, NEN-EN-ISO 22476-1 klasse 2, norm
#MEASUREMENTVAR= 14, 1.350000, m, grondwaterstand
#EOH=
0.1 2.5
0.2 3.5`, "S7.gef");
    const text = sampleReportText("groundwater", project, [gef]);
    expect(text).toContain("bij 1 van de 1 sondering een grondwaterstand in het bestand vastgelegd: S7: 1.35 m");
    expect(sampleReportText("introduction", project, [gef])).toContain("volgens NEN-EN-ISO 22476-1");
  });
});
