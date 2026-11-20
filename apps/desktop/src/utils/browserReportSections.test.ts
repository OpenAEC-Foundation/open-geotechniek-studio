import { describe, expect, it } from "vitest";
import type { Cpt, ProjectMeta } from "../types/cpt";
import { generateBrowserReport } from "./browserReport";
import { pdfText } from "./browserReportSections";

const cpts: Cpt[] = [
  { id: "S1", metadata: { source_file: "S1.gef", ground_level_nap: 0.5 }, points: [{ depth: 0, qc: 1, fs: 0.02 }, { depth: 12, qc: 14, fs: 0.1 }] },
  { id: "S2", metadata: { source_file: "S2.gef" }, points: [{ depth: 0, qc: 2 }, { depth: 9, qc: 11 }] },
];
const project: ProjectMeta = { title: "Rapport met teksten", client: "Klant", location: "Locatie", project_number: "42", author: "", date: "2026-11-02" };
const only = { cover: false, coordTable: true, map: false, perCpt: false, sbtLegend: false, metadata: false };
const content = (bytes: Uint8Array) => new TextDecoder("windows-1252").decode(bytes);
const pages = (pdf: string) => Number(/\/Count (\d+)/.exec(pdf)?.[1]);

describe("vrije teksten in het rapport", () => {
  it("zet de ingevulde teksten als hoofdstuk voor de coördinatentabel", async () => {
    const pdf = content(await generateBrowserReport(cpts, { ...project, report_texts: { introduction: "Dit is de inleiding van het onderzoek.", groundwater: "Het grondwater stond op 1,20 m." } }, only));
    expect(pages(pdf)).toBe(2);
    for (const text of ["Toelichting", "Inleiding", "Dit is de inleiding van het onderzoek.", "Grondwaterstand", "Het grondwater stond op 1,20 m."]) expect(pdf).toContain(text);
    expect(pdf).not.toContain("Waterpassing");
    expect(pdf.indexOf("Toelichting")).toBeLessThan(pdf.indexOf("Coördinatentabel"));
  });

  it("laat het hoofdstuk weg als alle teksten leeg zijn of het onderdeel uit staat", async () => {
    const empty = content(await generateBrowserReport(cpts, { ...project, report_texts: { introduction: "  ", levelling: "\n" } }, only));
    expect(pages(empty)).toBe(1);
    expect(empty).not.toContain("Toelichting");
    const off = content(await generateBrowserReport(cpts, { ...project, report_texts: { introduction: "Niet tonen." } }, { ...only, texts: false }));
    expect(off).not.toContain("Niet tonen.");
  });

  it("laat een lange tekst doorlopen op een vervolgpagina", async () => {
    const sentence = "De sonderingen zijn uitgevoerd vanaf het bestaande maaiveld en geven een beeld van de opbouw van de ondergrond ter plaatse. ";
    const long = Array.from({ length: 30 }, (_, i) => `Alinea ${i + 1}. ${sentence.repeat(4)}`).join("\n\n");
    const pdf = content(await generateBrowserReport(cpts, { ...project, report_texts: { introduction: long } }, only));
    expect(pages(pdf)).toBeGreaterThan(2);
    expect(pdf).toContain("Toelichting - vervolg");
    expect(pdf).toContain("Alinea 30.");
  });

  it("maakt met alleen teksten een rapport, en weigert een rapport zonder enig onderdeel", async () => {
    const none = { ...only, coordTable: false };
    const pdf = content(await generateBrowserReport(cpts, { ...project, report_texts: { levelling: "Ingemeten met GPS." } }, none));
    expect(pages(pdf)).toBe(1);
    expect(pdf).toContain("Waterpassing");
    await expect(generateBrowserReport(cpts, project, none)).rejects.toThrow("Selecteer ten minste");
  });

  it("gebruikt voor een document zonder project de teksten uit de onderdelenkeuze", async () => {
    const pdf = content(await generateBrowserReport(cpts, project, { ...only, reportTexts: { introduction: "Tekst bij een losse sondering." } }));
    expect(pdf).toContain("Tekst bij een losse sondering.");
  });

  it("vervangt tekens die het lettertype van de PDF niet kent", () => {
    expect(pdfText("qc ≥ 10 MPa – “vast”… café €")).toBe('qc >= 10 MPa - "vast"... café €');
    expect(pdfText("Łódź")).toBe("?ód?");
  });
});

describe("testrapport in het rapport", () => {
  it("staat standaard uit", async () => {
    expect(content(await generateBrowserReport(cpts, project, only))).not.toContain("Testrapport");
  });

  it("geeft per sondering een pagina en noemt ontbrekende gegevens als ontbrekend", async () => {
    const pdf = content(await generateBrowserReport(cpts, project, { ...only, coordTable: false, testReport: true }));
    expect(pages(pdf)).toBe(2);
    for (const text of ["Testrapport sondering S1", "Testrapport sondering S2", "NEN-EN-ISO 22476-1", "Algemeen", "Apparatuur", "Uitvoering", "Referentiemetingen", "Resultaten", "NAP +0.50 m"])
      expect(pdf).toContain(text);
    // Conustype, norm, coördinaten en nulpunten staan niet in deze sonderingen.
    expect(pdf.split("(niet in het bestand)").length - 1).toBeGreaterThan(30);
  });
});
