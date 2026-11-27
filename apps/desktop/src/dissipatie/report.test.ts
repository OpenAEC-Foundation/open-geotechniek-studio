import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseBroCptXml } from "../types/broCptParser";
import type { ProjectMeta } from "../types/cpt";
import { DEFAULT_SECTIONS } from "../store/reportSectionsState";
import { generateBrowserReport } from "../utils/browserReport";
import { analyseDissipation } from "./analysis";
import { buildChartModel } from "./chart";
import { withTestChange } from "./cptDissipation";
import { summaryRows } from "./summary";

const cpt = parseBroCptXml(readFileSync(resolve(__dirname, "__fixtures__", "sondering-met-dissipatie.xml"), "utf-8"), "sondering-met-dissipatie.xml");
const project: ProjectMeta = { title: "Dissipatie", client: "", location: "", project_number: "7", author: "", date: "2026-11-20" };
const none = { cover: false, coordTable: false, map: false, perCpt: false, sbtLegend: false, metadata: false, texts: false };
const content = (bytes: Uint8Array) => new TextDecoder("windows-1252").decode(bytes);
const pages = (pdf: string) => Number(/\/Count (\d+)/.exec(pdf)?.[1]);

describe("dissipatietests in het sondeerrapport", () => {
  it("staat standaard uit en geeft aangezet één pagina per test", async () => {
    expect(DEFAULT_SECTIONS.dissipation).toBe(false);
    const pdf = content(await generateBrowserReport([cpt], project, { ...none, dissipation: true }));
    expect(pages(pdf)).toBe(2);
    for (const text of ["Dissipatietest CPT-TEST-DISSIPATIE - 5.34 m", "Dissipatietest CPT-TEST-DISSIPATIE - 9.80 m", "Kerngetallen", "Teh & Houlsby \\(1991\\)", "Indicatieve afleiding", "Sully et al., 1999"])
      expect(pdf).toContain(text);
    // Zonder het onderdeel komt er geen dissipatiepagina.
    const without = content(await generateBrowserReport([cpt], project, { ...none, coordTable: true }));
    expect(without).not.toContain("Dissipatietest");
  });

  it("neemt de keuzes van de gebruiker over (wortel-tijd, ingevulde u_0)", async () => {
    const changed = withTestChange(cpt, cpt.dissipation_tests![0].id, { settings: { timeAxis: "sqrt", u0Mode: "manual", u0Kpa: 45 } });
    const pdf = content(await generateBrowserReport([changed], project, { ...none, dissipation: true }));
    expect(pdf).toContain("Wortel van de tijd");
    expect(pdf).toContain("45.0 kPa");
    expect(pdf).toContain("ingevuld");
  });
});

describe("grafiek en kerngetallen", () => {
  const result = analyseDissipation(cpt.dissipation_tests![0], 1500);
  it("log-as: hele decaden, t50 op de plaats van 100 s en U = 0,5 halverwege u_0 en u_i", () => {
    const model = buildChartModel(result, "log")!;
    // Metingen van 1 tot 6000 s: decaden 1 .. 10000, dus 100 s ligt halverwege.
    expect(model.xTicks.filter((tick) => !tick.minor).map((tick) => tick.label)).toEqual(["1", "10", "100", "1000", "10000"]);
    expect(model.t50X).toBeCloseTo(0.5, 9);
    expect(model.u50Y).toBeCloseTo((model.u0Y! + model.uiY!) / 2, 9);
    expect(model.uTicks.map((tick) => tick.label)).toEqual(["0", "0.25", "0.5", "0.75", "1"]);
    // De meting op t = 0 staat op de linkerrand.
    expect(model.line[0].x).toBe(0);
    expect(model.startX).toBeNull();
  });
  it("wortel-tijd: t50 = 100 s ligt op √t = 10", () => {
    const model = buildChartModel(result, "sqrt")!;
    const top = Number(model.xTicks[model.xTicks.length - 1].label);
    expect(top).toBeGreaterThanOrEqual(Math.sqrt(6000));
    expect(model.t50X).toBeCloseTo(10 / top, 9);
  });
  it("bij een verloop dat eerst oploopt staat het begin van de telling op de piek", () => {
    const model = buildChartModel(analyseDissipation(cpt.dissipation_tests![1]), "log")!;
    expect(model.startX).toBeGreaterThan(0);
    expect(model.t50X!).toBeGreaterThan(model.startX!);
  });
  it("kerngetallen als tekst", () => {
    const rows = Object.fromEntries(summaryRows(cpt.dissipation_tests![0], result).map((row) => [row.key, row.value]));
    expect(rows).toMatchObject({ depth: "5.34 m", channel: "u2", ui: "210.0 kPa", u0: "50.0 kPa", u50: "130.0 kPa", t50: "100 s", t50Star: "0.245 (u2)", coneArea: "1500 mm²", radius: "21.85 mm", ir: "100", ch: "1.17e-5", chYear: "369" });
  });
});
