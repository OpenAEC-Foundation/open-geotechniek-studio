import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ResultPanel } from "./ResultPanel";
import { computePile } from "../compute";
import { buildPileReport } from "../parts/build-report";
import fixture from "../__fixtures__/sondering-3bm-cgeo1.json";
import type { PileInput } from "../types";
import type { Cpt, ProjectMeta } from "../../../../types/cpt";

afterEach(() => cleanup());

const meta = {
  title: "Uitdraai project", project_number: "P-uitdraai", author: "Opsteller", date: "2026-10-14", client: "", location: "",
} as ProjectMeta;
const cpt = { id: "S-uitdraai", metadata: { source_file: "S-uitdraai.gef" }, points: [{ depth: 0, qc: 10, rf: 1 }, { depth: 40, qc: 10, rf: 1 }] } as unknown as Cpt;

it("neemt projectgegevens mee in het rapport en vermeldt concept op iedere pagina", () => {
  const input = { ...fixture.input, cptId: cpt.id } as PileInput;
  const bytes = buildPileReport(input, computePile(input, cpt), { cpts: new Map([[cpt.id, cpt]]), activeCptId: cpt.id, projectMeta: meta });
  const text = new TextDecoder("latin1").decode(bytes);
  for (const value of ["Uitdraai project", "P-uitdraai", "Opsteller", "SAMENVATTING"])
    expect(text.includes(value), value).toBe(true);
  const pages = Number(text.match(/\/Count (\d+)/)?.[1]);
  expect(pages).toBeGreaterThan(1);
  expect((text.match(/CONCEPT/g) ?? []).length).toBeGreaterThanOrEqual(pages);
  expect((text.match(/re\s+W\s+n/g) ?? []).length).toBeGreaterThanOrEqual(2);
});

it("weigert een rapport van een mislukte berekening", () => {
  const input = { ...fixture.input, cptId: cpt.id } as PileInput;
  const failed = { ...computePile(input, cpt), ok: false, error: "Sondering te ondiep" };
  expect(() => buildPileReport(input, failed, { cpts: new Map(), activeCptId: null, projectMeta: meta })).toThrow("Sondering te ondiep");
});

it("vult de ontwerpbelasting in de u.c.-regel in en trekt een conclusie", () => {
  const input = { ...fixture.input, cptId: cpt.id, nEd: 250 } as PileInput;
  const result = computePile(input, cpt);
  render(<ResultPanel input={input} result={result} />);
  expect(screen.getByRole("heading", { name: "Uitgangspunten" })).toBeInTheDocument();
  // Toonde eerder letterlijk "(NEd)" in plaats van het getal.
  expect(screen.queryByText(/\(NEd\)/)).toBeNull();
  expect(screen.getByText(new RegExp(`^250 / ${result.summary.rcNetD.toFixed(0)}$`))).toBeInTheDocument();
  expect(screen.getByText(/Conclusie:/).parentElement).toHaveTextContent(result.summary.passes ? "de paal voldoet" : "de paal voldoet niet");
});

it("vraagt bij een houten paal zonder EA gericht om dat gegeven in plaats van een kale fout", () => {
  const input = { ...fixture.input, cptId: cpt.id, pileTypeId: "timber-uniform", axialStiffnessKn: undefined } as PileInput;
  const pending = computePile(input, cpt);
  expect(pending.ok).toBe(false);
  render(<ResultPanel input={input} result={pending} />);
  expect(screen.getByRole("heading", { name: "Nog één gegeven nodig" })).toBeInTheDocument();
  expect(screen.queryByText(/⚠️/)).toBeNull();
  cleanup();
  const done = computePile({ ...input, axialStiffnessKn: 600000 }, cpt);
  expect(done.ok).toBe(true);
  render(<ResultPanel input={{ ...input, axialStiffnessKn: 600000 }} result={done} />);
  expect(screen.getByRole("heading", { name: "Samenvatting" })).toBeInTheDocument();
});

it("beschrijft de betonopzetter in de uitgangspunten en de kleefomtrek", () => {
  const input = { ...fixture.input, cptId: cpt.id, pileTypeId: "timber-uniform", diameterMm: 220, axialStiffnessKn: undefined,
    concreteExtension: { jointNap: fixture.input.pileTopNap - 2, sizeMm: 250, isCircular: false } } as PileInput;
  const result = computePile(input, cpt);
  expect(result.ok).toBe(true);
  render(<ResultPanel input={input} result={result} />);
  expect(screen.getByText("Betonopzetter", { selector: "th" }).parentElement).toHaveTextContent("250 × 250 mm, van paalkop tot de las");
  expect(screen.getByText("(opzetter en hout)")).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: /^Zakking/ })).toBeNull();
});

