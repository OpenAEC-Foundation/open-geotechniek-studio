import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { InputPanel } from "./InputPanel";
import { ResultPanel } from "./ResultPanel";
import { computePile } from "../compute";
import { generatePileReport } from "../parts/pile-report-pdf";
import { computeMultiCptSummary } from "../parts/multi-cpt-summary";
import { PILE_SYSTEMS, applyPileSystem } from "../pile-systems";
import fixture from "../__fixtures__/sondering-3bm-cgeo1.json";
import type { PileInput } from "../types";
import type { Cpt } from "../../../../types/cpt";

afterEach(() => cleanup());

const input = fixture.input as PileInput;
const cpt = { id: "S", metadata: { source_file: "S.gef", ground_level_nap: 0 }, points: [{ depth: 0, qc: 8, rf: 1 }, { depth: 40, qc: 8, rf: 1 }] } as unknown as Cpt;
const result = computePile(input, null);
const tile = (name: string) => screen.getByRole("radio", { name: new RegExp(`^${name}`) });

describe("paalsysteem kiezen", () => {
  it("toont elk paalsysteem als tegel met een schetsje van de vorm", () => {
    render(<InputPanel input={input} result={result} />);
    const tiles = within(screen.getByRole("radiogroup", { name: "Paalsysteem" })).getAllByRole("radio");
    expect(tiles).toHaveLength(PILE_SYSTEMS.length);
    for (const t of tiles) expect(t.querySelector("svg.pile-sketch")).not.toBeNull();
    expect(tile("Stalen buispaal, gesloten punt")).toBeChecked();
    expect(tile("Houten paal met betonopzetter")).not.toBeChecked();
  });

  it("toont alleen de velden die bij het systeem horen", () => {
    const { rerender } = render(<InputPanel input={input} result={result} />);
    // Stalen buis: buismaat, wanddikte en voetplaat.
    expect(screen.getByLabelText("Buismaat")).toBeInTheDocument();
    expect(screen.getByLabelText("Wanddikte [mm]")).toBeInTheDocument();
    expect(screen.getByLabelText(/Puntafmeting/)).toBeInTheDocument();
    // Prefab beton: zijlengte uit de reeks, geen wanddikte, geen losse voet, geen houtvelden.
    rerender(<InputPanel input={applyPileSystem(input, "prefab-concrete")} result={result} />);
    expect(screen.getByLabelText("Zijlengte [mm]")).toBeInTheDocument();
    expect(screen.getByLabelText("Standaardmaat")).toBeInTheDocument();
    expect(screen.queryByLabelText("Wanddikte [mm]")).toBeNull();
    expect(screen.queryByLabelText(/Puntafmeting/)).toBeNull();
    expect(screen.queryByLabelText("Las [m NAP]")).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "Tapse houten paal" })).toBeNull();
    // Schroefpaal met blijvende buis: buis met wanddikte en een schroefpunt als puntafmeting.
    rerender(<InputPanel input={applyPileSystem(input, "screw-permanent-casing")} result={result} />);
    expect(screen.getByLabelText("Wanddikte [mm]")).toBeInTheDocument();
    expect(screen.getByLabelText(/Puntafmeting/)).toBeInTheDocument();
    // Hout zonder opzetter: tapsheid, geen las.
    rerender(<InputPanel input={applyPileSystem(input, "timber")} result={result} />);
    expect(screen.getByRole("checkbox", { name: "Tapse houten paal" })).toBeChecked();
    expect(screen.getByLabelText("Kopdiameter [mm]")).toBeInTheDocument();
    expect(screen.queryByLabelText("Las [m NAP]")).toBeNull();
    // Hout met opzetter: de las en de opzettermaat erbij.
    rerender(<InputPanel input={applyPileSystem(input, "timber-extension")} result={result} />);
    expect(screen.getByLabelText("Las [m NAP]")).toBeInTheDocument();
    expect(screen.getByLabelText("Opzetter")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Vierkant 320×320" })).toBeInTheDocument();
  });

  it("houdt een al ingevulde puntafmeting zichtbaar bij een systeem zonder losse voet", () => {
    render(<InputPanel input={{ ...applyPileSystem(input, "prefab-concrete"), baseDiameterMm: 400 }} result={result} />);
    expect(screen.getByLabelText(/Puntafmeting/)).toHaveValue("400");
  });

  it("kiest een systeem met de bijbehorende tabelrij en wist wat bij het vorige hoorde", () => {
    const onChange = vi.fn();
    render(<InputPanel input={{ ...input, baseDiameterMm: 250, projectFactors: { alphaP: 0.5, alphaS: 0.01, alphaT: 0, beta: 1, s: 1, source: "x", edition: "2017" } }} result={result} onChange={onChange} />);
    fireEvent.click(tile("Vibropaal"));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ pileTypeId: "concrete-driven-casing-hammered", projectFactors: undefined, baseDiameterMm: undefined, concreteExtension: undefined }));
  });

  it("laat een systeem zonder rij in de tabel van 2017 alleen kiezen met projectfactoren, en zegt waarom", () => {
    const onChange = vi.fn();
    render(<InputPanel input={input} result={result} onChange={onChange} />);
    fireEvent.click(tile("DPA-paal"));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("DPA-paal heeft geen eigen rij in tabel 7.c");
    fireEvent.click(screen.getByRole("button", { name: "Kiezen met projectfactoren" }));
    const next = onChange.mock.lastCall![0] as PileInput;
    expect(next.pileTypeId).toBe("concrete-auger-cased");
    expect(next.projectFactors).toEqual(expect.objectContaining({ alphaP: 0, source: "", edition: "2017" }));
    // Zonder ingevulde factoren en bron wordt er niet gerekend.
    expect(computePile({ ...next, axialStiffnessKn: 2_000_000 }, cpt).ok).toBe(false);
  });

  it("legt bij de editie 2025 uit waarom een systeem niet te kiezen is", () => {
    const onChange = vi.fn();
    const in2025 = { ...input, standard: "nen-9997-2025" as const };
    render(<InputPanel input={in2025} result={computePile(in2025, cpt)} onChange={onChange} />);
    expect(screen.getByRole("option", { name: "NEN 9997-1:2025 + C1:2025 — paalklassefactoren 2025" })).toBeInTheDocument();
    fireEvent.click(tile("Prefab betonpaal"));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/Voor Prefab betonpaal staan de paalklassefactoren van NEN 9997-1:2025 nog niet in de tabel/);
    fireEvent.click(screen.getByRole("button", { name: "Kiezen met projectfactoren" }));
    expect(onChange.mock.lastCall![0]).toEqual(expect.objectContaining({ pileTypeId: "concrete-prefab-prestressed-driven", projectFactors: expect.objectContaining({ edition: "2025" }) }));
  });
});

describe("omtrek per laag in resultaat en uitdraai", () => {
  const wood: PileInput = { ...input, cptId: cpt.id, pileTypeId: "timber-uniform", diameterMm: 220, concreteExtension: { jointNap: -2.5, sizeMm: 320, isCircular: false } };
  const r = computePile(wood, cpt);

  it("toont in het resultaat per laag de gebruikte omtrek", () => {
    expect(r.ok).toBe(true);
    render(<ResultPanel input={wood} result={r} />);
    const table = screen.getAllByRole("table").find((t) => within(t).queryByRole("columnheader", { name: /^Os/ }))!;
    const rows = within(table).getAllByRole("row").slice(1);
    // Laag naast de opzetter 4 × 0,32 = 1,280 m; daaronder het hout π × 0,22 = 0,691 m.
    expect(within(rows[0]).getByText("1.280")).toBeInTheDocument();
    expect(within(rows[1]).getByText("0.691")).toBeInTheDocument();
  });

  it("neemt de omtrek per laag op in de uitdraai", () => {
    const bytes = generatePileReport({
      project: { number: "test", description: "Hout met opzetter", norm: "NEN 9997-1", date: "2026-11-20", author: "Test" },
      sonderingen: [{ name: "S", input: wood, result: r }],
      summary: computeMultiCptSummary({ cases: [{ cptId: "S", rbCalMax: r.base.rbCalMax, rsCalMax: r.shaft.rsCalMax, rcCal: r.summary.rcCal }], gammaM: wood.gammaM, nEd: wood.nEd }),
      pileTypeName: "Houten paal", factors: { alphaP: 0.7, alphaS: 0.01, alphaT: 0.007 },
    });
    const text = new TextDecoder("latin1").decode(bytes);
    expect(text).toContain("O_s [m]");
    expect(text).toContain("1,280");
    expect(text).toContain("0,691");
  });
});
