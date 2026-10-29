import { afterEach, describe, expect, it, vi } from "vitest";
import { writeFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import fixture from "./__fixtures__/native-core.json";
import type { Cpt } from "../types/cpt";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(() => { throw new Error("Afzonderlijke native rekenroute aangeroepen"); }) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn(async () => "C:/rapport.pdf") }));
vi.mock("@tauri-apps/plugin-fs", () => ({ writeFile: vi.fn(async () => {}) }));
const cpts: Cpt[] = [fixture.cpt as unknown as Cpt, {
  id: "S2", metadata: { source_file: "S2.gef", ground_level_nap: -1, extra: { PROJECT: "Controle" } },
  position: { x_rd: 120000, y_rd: 450000 },
  points: [{ depth: 0, qc: 1, fs: .03, rf: 3 }, { depth: 20, qc: 18, fs: .2, rf: 1 }],
}];
const project = { title: "Gedeeld sonderingsrapport", author: "Auteur", client: "Klant", location: "Locatie", project_number: "42", date: "2026-10-14" };
const sections = { cover: true, coordTable: true, map: true, perCpt: true, sbtLegend: true, metadata: true };
const content = (bytes: Uint8Array) => new TextDecoder("windows-1252").decode(bytes)
  .replace(/\/ID\s*\[\s*<[^>]+>\s*<[^>]+>\s*\]/g, "/ID []")
  .replace(/\/CreationDate\s*\([^)]*\)/g, "/CreationDate ()");
async function platform(desktop: boolean) {
  vi.resetModules();
  vi.stubGlobal("isTauri", desktop);
  return import("./platform");
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.clearAllMocks(); });

describe("gelijke reken- en rapportuitvoer in desktop en browser", () => {
  it("maakt dezelfde laagindeling en alle PDF-pagina's, inclusief meerdere sonderingen", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Kaartdienst offline"); }));
    const browser = await platform(false);
    const browserLayers = await browser.cpt.detectLayers(cpts[0]);
    const browserPdf = await browser.reports.preview(cpts, project, sections);
    const desktop = await platform(true);
    expect(desktop.IS_TAURI).toBe(true);
    expect(await desktop.cpt.detectLayers(cpts[0])).toEqual(fixture.layers);
    expect(browserLayers).toEqual(fixture.layers);
    const desktopPdf = await desktop.reports.preview(cpts, project, sections);
    expect(content(desktopPdf)).toEqual(content(browserPdf));
    expect(content(desktopPdf)).toContain("/Count 8");
    for (const text of ["Gedeeld sonderingsrapport", "Coördinatentabel", "Overzichtskaart", "Sondering S2", "Indicatieve qc/Rf-legenda", "Controle"])
      expect(content(desktopPdf)).toContain(text);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("schrijft op desktop precies het gegenereerde rapport en respecteert de sectiekeuze", async () => {
    const desktop = await platform(true);
    const selected = { ...sections, cover: false, coordTable: false, map: false, sbtLegend: false, metadata: false };
    await desktop.reports.save(cpts, project, selected);
    expect(writeFile).toHaveBeenCalledOnce();
    const [path, bytes] = vi.mocked(writeFile).mock.calls[0];
    expect(path).toBe("C:/rapport.pdf");
    expect(content(bytes as Uint8Array)).toContain("/Count 2");
    expect(content(bytes as Uint8Array)).not.toContain("Coördinatentabel");
    expect(invoke).not.toHaveBeenCalled();
  });
});
