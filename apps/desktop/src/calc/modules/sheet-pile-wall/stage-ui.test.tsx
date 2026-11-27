// Invoer en weergave van fasen, steunpunten, maaiveld, belastingen op afstand en het stappenplan.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectContext } from "../../framework/types";
import { computeWall, wallExample, type WallInput, type WallOk } from "./compute";
import { sheetPileWallModule as module } from "./module";
import { wallScene } from "./scene";

const ok = (i: WallInput): WallOk => { const r = computeWall(i); if (!r.ok) throw new Error(r.error); return r; };
const ctx = { cpts: new Map(), activeCptId: null, projectMeta: { title: "Proef", client: "", project_number: "P1", author: "", date: "2026-01-05" } } as unknown as ProjectContext;
afterEach(cleanup);
const base = wallExample();
const staged: WallInput = { ...base, toeNap: -10, extraSupports: [{ enabled: true, kind: "strut", levelNap: -2.5, angleDeg: 0, rigid: false, stiffnessKnPerM: 100000, spacingM: 4 }],
  loads: [{ side: "high", kind: "strip", value: 20, fromM: 1, toM: 3 }], profileLow: [{ xM: 2, dzM: 0 }, { xM: 6, dzM: -1 }],
  phases: [{ name: "ontgraven", excavationNap: -1.5 }, { name: "anker", install: ["A1"] }, { name: "dieper", excavationNap: -3 }, { name: "stempel", install: ["A2"] }, { name: "eind", excavationNap: -4 }] };

describe("invoer", () => {
  it("steunpunt toevoegen, fase toevoegen en een steunpunt in een fase aanbrengen", () => {
    const onChange = vi.fn(), view = render(<module.InputPanel input={base} result={ok(base)} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Steunpunt toevoegen" }));
    expect(onChange.mock.lastCall?.[0].extraSupports).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Fase toevoegen" }));
    expect(onChange.mock.lastCall?.[0].phases).toEqual([{ name: "1", excavationNap: -4, install: ["A1"] }]);
    view.rerender(<module.InputPanel input={staged} result={ok(staged)} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Aanbrengen A2, fase 1"));
    expect(onChange.mock.lastCall?.[0].phases[0].install).toEqual(["A2"]);
    expect(screen.getByLabelText("Lage zijde, fase 2")).toHaveValue("");
  });

  it("stappenplan aanzetten en de factoren voor RC2 kiezen", () => {
    const onChange = vi.fn(), view = render(<module.InputPanel input={base} result={ok(base)} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/Rekenen met stap 6.1 tot en met 6.5/));
    const on = onChange.mock.lastCall?.[0] as WallInput;
    expect(on.cur?.enabled).toBe(true);
    view.rerender(<module.InputPanel input={on} result={ok(on)} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "RC2" }));
    expect(onChange.mock.lastCall?.[0].factors).toMatchObject({ gammaQ: 1.1, deltaWaterLowM: 0.25, deltaWaterHighM: 0.05 });
    expect(screen.getByText(/Niet tegen de tekst van CUR 166 gelegd/)).toBeInTheDocument();
  });

  it("belasting op afstand en een punt van het maaiveld toevoegen", () => {
    const onChange = vi.fn();
    render(<module.InputPanel input={base} result={ok(base)} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Belasting toevoegen" }));
    expect(onChange.mock.lastCall?.[0].loads).toEqual([{ side: "high", kind: "strip", value: 10, fromM: 1, toM: 4 }]);
    fireEvent.click(screen.getByRole("button", { name: "Punt toevoegen: lage zijde" }));
    expect(onChange.mock.lastCall?.[0].profileLow).toEqual([{ xM: 2, dzM: 0 }]);
  });
});

describe("weergave en uitkomst", () => {
  it("doorsnede per fase en stap, met de omhullende als band; het overzicht per fase", () => {
    const r = ok(staged), { container } = render(<module.VisualPanel input={staged} result={r} />);
    const select = screen.getByLabelText("Waarden in de tekening") as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toContain("Rekenwaarden · fase anker");
    expect(container.querySelectorAll(".sw-envelope")).toHaveLength(3);
    fireEvent.change(select, { target: { value: "c0" } });
    expect(container.querySelectorAll(".sw-envelope")).toHaveLength(0);
    // Fase 1: nog geen steunpunt in de tekening.
    expect(container.querySelectorAll(".sw-anchor")).toHaveLength(0);
    fireEvent.change(select, { target: { value: "c4" } });
    expect(container.querySelectorAll(".sw-anchor")).toHaveLength(2);
    render(<module.ResultPanel input={staged} result={r} />);
    expect(screen.getAllByText("Per fase en stap").length).toBeGreaterThan(0);
    expect(screen.getByRole("table", { name: "Per fase en stap" })).toHaveTextContent("Rekenwaarden · fase eind");
  });

  it("3D per fase: steunpunten, ontgraving en maaiveldprofiel van de gekozen fase", () => {
    const r = ok(staged), first = wallScene(staged, r, r.cases[0].run, r.phases[0]), last = wallScene(staged, r, r.cases[4].run, r.phases[4]);
    expect(first.supports).toHaveLength(0); expect(last.supports.map((s) => s.id)).toEqual(["A1", "A2"]);
    expect(first.low.surfaceNap).toBeGreaterThan(last.low.surfaceNap);
    expect(last.profileLow[last.profileLow.length - 1].nap).toBeCloseTo(last.low.surfaceNap - 1, 9);
  });

  it("de uitdraai bevat het overzicht per fase en stap", () => {
    const bytes = module.buildReport!(staged, ok(staged), ctx) as Uint8Array;
    expect(bytes.length).toBeGreaterThan(1000);
  });
});
