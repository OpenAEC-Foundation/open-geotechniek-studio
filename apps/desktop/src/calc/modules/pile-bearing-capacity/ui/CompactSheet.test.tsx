import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ResultPanel } from "./ResultPanel";
import { InputPanel } from "./InputPanel";
import { computePile } from "../compute";
import { buildPileReport } from "../parts/build-report";
import { compactLayerTables, compactRows } from "../parts/compact-sheet";
import fixture from "../__fixtures__/sondering-3bm-cgeo1.json";
import type { PileInput } from "../types";
import type { Cpt, ProjectMeta } from "../../../../types/cpt";

afterEach(() => cleanup());

const meta = { title: "Uitdraai", project_number: "P1", author: "Opsteller", date: "2026-11-27", client: "", location: "" } as ProjectMeta;
const cpt = { id: "S-kort", metadata: { source_file: "S-kort.gef" }, points: [{ depth: 0, qc: 10, rf: 1 }, { depth: 40, qc: 10, rf: 1 }] } as unknown as Cpt;
const input = { ...fixture.input, cptId: cpt.id, nEd: 250 } as PileInput;
const result = computePile(input, cpt);
const ctx = { cpts: new Map([[cpt.id, cpt]]), activeCptId: cpt.id, projectMeta: meta };
const fmt = (v: number, d: number) => v.toFixed(d);
const pdfText = (bytes: Uint8Array) => new TextDecoder("latin1").decode(bytes);

describe("beknopte uitkomsten", () => {
  const rows = compactRows(input, result, fmt);
  const value = (s: string) => rows.find((r) => r.s === s)!.v;
  it("geeft dezelfde getallen als het resultaat, met de formule één keer per grootheid", () => {
    expect(result.ok).toBe(true);
    expect(value("F_nk;d")).toBe(`${result.negKleef.fnkD.toFixed(0)} kN`);
    expect(value("R_b;cal;max")).toBe(`${result.base.rbCalMax.toFixed(0)} kN`);
    expect(value("R_s;cal;max")).toBe(`${result.shaft.rsCalMax.toFixed(0)} kN`);
    expect(value("R_c;net;d")).toBe(`${result.summary.rcNetD.toFixed(0)} kN`);
    expect(value("u.c.")).toBe(result.summary.unityCheck.toFixed(2));
    expect(new Set(rows.map((r) => r.s)).size).toBe(rows.length);
    expect(rows.find((r) => r.s === "u.c.")!.f).toBe(`N_Ed / R_c;net;d = 250 / ${result.summary.rcNetD.toFixed(0)}`);
  });
  it("zet de lagen in een tabel waarvan de som het totaal is", () => {
    const t = compactLayerTables(input, result, fmt, (k) => k);
    expect(t.neg.rows).toHaveLength(result.negKleef.layers.length);
    expect(t.neg.sum[t.neg.sum.length - 1]).toBe(result.negKleef.fnkRep.toFixed(1));
    expect(t.shaft.rows).toHaveLength(result.shaft.perLayer.length);
    expect(t.shaft.sum[t.shaft.sum.length - 1]).toBe(result.shaft.rsCalMax.toFixed(1));
    expect(t.neg.rows.reduce((a, r) => a + Number(r[r.length - 1]), 0)).toBeCloseTo(result.negKleef.fnkRep, 0);
  });
  it("laat zakking en veerwaarde weg als die niet zijn bepaald", () => {
    const wood = { ...input, pileTypeId: "timber-uniform", diameterMm: 220, timberTaper: { toeDiameterMm: 150, lengthM: 5 } } as PileInput;
    const r = computePile(wood, cpt);
    expect(r.ok).toBe(true);
    expect(compactRows(wood, r, fmt).some((x) => x.group === "settlement" || x.group === "spring")).toBe(false);
  });
});

describe("rekenblad: beknopt of uitgebreid", () => {
  it("toont standaard tabellen en één blok opmerkingen, zonder de uitgeschreven formules", () => {
    const { container } = render(<ResultPanel input={input} result={result} />);
    expect(screen.getByRole("heading", { name: "Uitgangspunten" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tussenwaarden per laag" })).toBeInTheDocument();
    const results = screen.getByRole("table", { name: "Uitkomsten" });
    expect(within(results).getByText(`${result.summary.rcNetD.toLocaleString("nl", { maximumFractionDigits: 0 })} kN`)).toBeInTheDocument();
    expect(container.querySelectorAll(".pile-formula")).toHaveLength(0);
    expect(container.querySelectorAll(".pile-warnings")).toHaveLength(1);
    expect(container.querySelectorAll(".pile-warnings li")).toHaveLength(result.warnings.length);
    expect(screen.getByText(/Conclusie:/)).toBeInTheDocument();
    const compactLength = container.textContent!.length;
    cleanup();
    const full = render(<ResultPanel input={{ ...input, reportDetail: "full" }} result={result} />);
    expect(full.container.querySelectorAll(".pile-formula").length).toBeGreaterThan(10);
    expect(screen.queryByRole("table", { name: "Uitkomsten" })).toBeNull();
    expect(compactLength).toBeLessThan(full.container.textContent!.length);
  });
  it("laat de omvang kiezen in de invoer, standaard beknopt", () => {
    let next: PileInput | undefined;
    render(<InputPanel input={input} result={result} onChange={(v) => { next = v; }} />);
    const select = screen.getByRole("combobox", { name: "Omvang van de uitdraai" }) as HTMLSelectElement;
    expect(select.value).toBe("compact");
    fireEvent.change(select, { target: { value: "full" } });
    expect(next!.reportDetail).toBe("full");
  });
});

describe("uitdraai: beknopt of uitgebreid", () => {
  const compact = pdfText(buildPileReport(input, result, ctx));
  const full = pdfText(buildPileReport({ ...input, reportDetail: "full" }, result, ctx));
  const pages = (text: string) => Number(text.match(/\/Count (\d+)/)?.[1]);
  it("is beknopt korter en houdt samenvatting, concept-label en eindtoets", () => {
    expect(pages(compact)).toBeLessThanOrEqual(pages(full));
    expect(compact.length).toBeLessThan(full.length);
    for (const text of ["SAMENVATTING", "Uitgangspunten", "Uitkomsten", "Opmerkingen", "CONCEPT ALPHA", "Indicatieve rekentoets"]) expect(compact, text).toContain(text);
    // De volledige afleiding houdt haar eigen koppen.
    for (const text of ["FUNDERINGSPAAL", "Lastzakkingslijn 1:"]) { expect(full, text).toContain(text); expect(compact, text).not.toContain(text); }
    expect(full).not.toContain("Uitkomsten");
  });
  it("zet de sterktetoets in beide vormen als tabel in de uitdraai", () => {
    const checked = { ...input, strengthCheck: { enabled: true, steelGrade: "S355" } } as PileInput;
    const r = computePile(checked, cpt);
    expect(r.strength!.governing).not.toBeNull();
    for (const detail of ["compact", "full"] as const) {
      const text = pdfText(buildPileReport({ ...checked, reportDetail: detail }, r, ctx));
      expect(text).toContain("Sterkte van de paal");
      expect(text).toContain("Normaalkracht stalen buis");
    }
    expect(compact).not.toContain("Sterkte van de paal");
  });
});

describe("sterktetoets op het scherm", () => {
  it("toont de tabel alleen als de toets is aangevinkt en neemt hem op in de samenvatting", () => {
    render(<ResultPanel input={input} result={result} />);
    expect(screen.queryByRole("table", { name: "Sterkte van de paal" })).toBeNull();
    cleanup();
    const checked = { ...input, strengthCheck: { enabled: true } } as PileInput;
    const r = computePile(checked, cpt);
    render(<ResultPanel input={checked} result={r} />);
    const table = screen.getByRole("table", { name: "Sterkte van de paal" });
    expect(within(table).getByText("Normaalkracht stalen buis")).toBeInTheDocument();
    expect(within(table).getByText(/EN 1993-1-1 art\. 6\.2\.4/)).toBeInTheDocument();
    expect(within(table).getAllByText("voldoet").length).toBeGreaterThan(0);
    expect(screen.getByText("Uitgangspunten en wat niet is getoetst")).toBeInTheDocument();
  });
  it("zet de toets aan met een vinkje en biedt dan de staalsoort", () => {
    let next: PileInput | undefined;
    const view = render(<InputPanel input={input} result={result} onChange={(v) => { next = v; }} />);
    expect(screen.queryByRole("combobox", { name: "Staalsoort" })).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Sterkte van de paal toetsen" }));
    expect(next!.strengthCheck).toEqual({ enabled: true });
    view.rerender(<InputPanel input={next!} result={result} onChange={(v) => { next = v; }} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Staalsoort" }), { target: { value: "S355" } });
    expect(next!.strengthCheck).toEqual({ enabled: true, steelGrade: "S355" });
  });
});
