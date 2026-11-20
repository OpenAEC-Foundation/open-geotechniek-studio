import { describe, expect, it } from "vitest";
import type { Cpt, ProjectMeta } from "../types/cpt";
import { parseGef } from "../types/gefParser";
import { generateBrowserReport } from "../utils/browserReport";
import fixture from "./__fixtures__/magnetometer-synthetisch.gef?raw";
import { analyseMagnetometer, DEFAULT_MAG_SETTINGS, withMagSettings } from "./analysis";
import { magnetometerData } from "./channels";
import { settingsRows, zoneRows } from "./magnetometerReport";
import { buildTracks, depthMaxOf, depthWindow, niceRange } from "./tracks";

const project: ProjectMeta = { title: "Magnetometer", client: "", location: "", project_number: "1", author: "", date: "2026-11-20" };
const off = { cover: false, coordTable: false, map: false, perCpt: false, sbtLegend: false, metadata: false, texts: false };
const content = (bytes: Uint8Array) => new TextDecoder("windows-1252").decode(bytes);
const pages = (pdf: string) => Number(/\/Count (\d+)/.exec(pdf)?.[1]);
const settings = { ...DEFAULT_MAG_SETTINGS, backgroundFrom: 0, backgroundTo: 4 };
const mag = withMagSettings(parseGef(fixture, "magnetometer-synthetisch.gef"), settings);
const plain: Cpt = { id: "S-GEWOON", metadata: { source_file: "s.gef" }, points: [{ depth: 0, qc: 1 }, { depth: 9, qc: 11 }] };

describe("magnetometerpagina in het sondeerrapport", () => {
  it("maakt één pagina per magnetometersondering en slaat gewone sonderingen over", async () => {
    const pdf = content(await generateBrowserReport([plain, mag], project, { ...off, magnetometer: true }));
    expect(pages(pdf)).toBe(1);
    for (const text of ["Magnetometersondering MAG-SYN-01", "Instellingen", "Zones boven de drempel \\(1\\)", "Totale veldsterkte", "0.00 m tot 4.00 m onder maaiveld", "geen beoordeling"])
      expect(pdf).toContain(text);
    expect(pdf).not.toContain("S-GEWOON");
  });

  it("laat de pagina weg als het onderdeel uit staat", async () => {
    const pdf = content(await generateBrowserReport([mag], project, { ...off, coordTable: true }));
    expect(pdf).not.toContain("Magnetometersondering");
  });

  it("noemt de gebruikte instellingen en de zones met boven- en onderkant en piek", () => {
    const data = magnetometerData(mag)!, analysis = analyseMagnetometer(data, settings);
    const rows = Object.fromEntries(settingsRows(data, analysis, settings));
    expect(rows["Kanalen in het bestand"]).toBe("Bx, By, Bz, inclinatie, declinatie");
    expect(rows["Totale veldsterkte"]).toContain("berekend uit de componenten");
    expect(rows["Achtergrondveld"]).toMatch(/^4894\d\.\d nT \(mediaan van 81 waarden\)$/);
    expect(rows["Drempel afwijking"]).toContain("50.0 nT");
    expect(rows["Drempel gradiënt"]).toContain("100.0 nT/m");
    const [zone] = zoneRows(analysis.zones);
    expect(zone).toHaveLength(8);
    expect(Number(zone[1])).toBeLessThan(8);
    expect(Number(zone[2])).toBeGreaterThan(8);
    // Uiterste afwijking -403 nT op 8,15 m (op 8,00 m precies: -368 nT).
    expect(zone[3]).toBe("-403");
    expect(zone[4]).toBe("8.15");
    expect(zone[7]).toBe("afwijking + gradiënt");
  });
});

describe("sporen en diepte-as", () => {
  it("geeft qc, componenten, totaalveld, gradiënt, inclinatie en declinatie als sporen", () => {
    const data = magnetometerData(mag)!, analysis = analyseMagnetometer(data, settings);
    const tracks = buildTracks(mag, data, analysis, settings);
    expect(tracks.map((t) => t.key)).toEqual(["qc", "components", "total", "gradient", "inclination", "declination"]);
    expect(tracks[1].lines.map((l) => l.key)).toEqual(["x", "y", "z"]);
    // By is overal 600 nT: afwijking van de mediaan is 0.
    expect(tracks[1].lines[1].offset).toBe(600);
    expect(tracks[1].lines[1].values.every((v) => v === 0)).toBe(true);
    const total = tracks[2];
    expect(total.guides.map((g) => g.kind)).toEqual(["background", "threshold", "threshold"]);
    expect(total.guides[2].value - total.guides[0].value).toBe(50);
    for (const track of tracks)
      for (const line of track.lines)
        for (const v of line.values) if (v != null) { expect(v).toBeGreaterThanOrEqual(track.min); expect(v).toBeLessThanOrEqual(track.max); }
  });

  it("gebruikt dezelfde diepte-as en zoom als de sondeergrafiek", () => {
    // Einddiepte 15 m: ceil(15 x 1,02 + 0,5) = 16 m; zoom 2 toont de helft rond het midden.
    expect(depthMaxOf([0, 15])).toBe(16);
    expect(depthWindow(16, 1, 0)).toEqual({ top: 0, bottom: 16 });
    expect(depthWindow(16, 2, 1)).toEqual({ top: 5, bottom: 13 });
  });

  it("rondt de schaal af op hele stappen", () => {
    // (48993 - 48574) / 4 = 105 -> stap 200.
    expect(niceRange(48574, 48993)).toEqual({ min: 48400, max: 49000, step: 200 });
    expect(niceRange(-830, 830)).toEqual({ min: -1000, max: 1000, step: 500 });
    // Een constante reeks krijgt een marge van 1 aan weerszijden.
    expect(niceRange(5, 5)).toEqual({ min: 4, max: 6, step: 0.5 });
  });
});
