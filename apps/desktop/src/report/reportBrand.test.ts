import { afterEach, describe, expect, it } from "vitest";
import { jsPDF } from "jspdf";
import { DEFAULT_BRAND, loadOrganizationBrand, mergeBrand, registerBrandSource, useReportBrand } from "./reportBrand";
import { drawCover } from "../utils/browserReportBrand";

afterEach(() => { registerBrandSource(null); useReportBrand.getState().reset(); });
const project = { title: "Proef", client: "", location: "", project_number: "", author: "", date: "2026-11-06" };
const cpt = { id: "S1", metadata: { source_file: "S1.gef" }, points: [] } as never;
const coverText = () => { const doc = new jsPDF({ compress: false }); drawCover(doc, cpt, project); return doc.output(); };

describe("huisstijl rapport", () => {
  it("valt terug op OpenAEC en vult ontbrekende of ongeldige velden aan", () => {
    expect(mergeBrand({})).toEqual(DEFAULT_BRAND);
    expect(mergeBrand({ organization: "  Ingenieursbureau X ", accent: [300, 0, 0] as never, logoDataUrl: "http://x/logo.png" }))
      .toMatchObject({ organization: "Ingenieursbureau X", accent: DEFAULT_BRAND.accent, logoDataUrl: undefined });
  });
  it("zet de huisstijl van de organisatie op het voorblad", async () => {
    expect(coverText()).toContain("OpenAEC");
    registerBrandSource({ id: "bedrijf", label: "bedrijfsinstance", load: async () => ({ organization: "Ingenieursbureau X", website: "ib-x.nl", tagline: "" }) });
    expect(await loadOrganizationBrand()).toBe(true);
    expect(useReportBrand.getState().source).toBe("bedrijf");
    const pdf = coverText();
    expect(pdf).toContain("Ingenieursbureau X");
    expect(pdf).toContain("ib-x.nl");
    expect(pdf).not.toContain("Build free");
  });
  it("houdt de vorige huisstijl en meldt het als de bron faalt", async () => {
    registerBrandSource({ id: "bedrijf", label: "bedrijfsinstance", load: async () => { throw new Error("offline"); } });
    expect(await loadOrganizationBrand()).toBe(false);
    expect(useReportBrand.getState()).toMatchObject({ source: "standaard", error: "Huisstijl van bedrijfsinstance niet geladen: offline" });
  });
});
