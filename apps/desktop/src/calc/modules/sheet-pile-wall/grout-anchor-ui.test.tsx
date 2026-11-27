// Groutanker in het rekenblad: invoer, uitkomsten, doorsnede en uitdraai.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectContext } from "../../framework/types";
import { DEFAULT_GROUT, computeWall, wallExample, type WallInput, type WallOk } from "./compute";
import { sheetPileWallModule as module } from "./module";

const ctx = { cpts: new Map(), activeCptId: null, projectMeta: { title: "Proef", client: "", project_number: "P1", author: "", date: "2026-01-05" } } as unknown as ProjectContext;
const ok = (i: WallInput): WallOk => { const r = computeWall(i); if (!r.ok) throw new Error(r.error); return r; };
const grouted = (): WallInput => { const base = wallExample(); return { ...base, anchor: { ...base.anchor, kind: "grout", grout: { ...DEFAULT_GROUT, shaftFrictionKpa: 200 } } }; };
afterEach(cleanup);

describe("groutanker in het rekenblad", () => {
  it("invoer: soort steun kiezen; bij een groutanker de lengten, het trekelement, de voorspanning en de factoren", () => {
    const input = wallExample(), onChange = vi.fn();
    const view = render(<module.InputPanel input={input} result={ok(input)} onChange={onChange} />);
    expect(screen.getByLabelText("Soort steun")).toHaveValue("tie");
    fireEvent.change(screen.getByLabelText("Soort steun"), { target: { value: "grout" } });
    expect(onChange.mock.lastCall?.[0].anchor.kind).toBe("grout");
    // Zonder schachtwrijving rekent het blad niet: er is geen tabelwaarde.
    const first = onChange.mock.lastCall?.[0] as WallInput, pending = computeWall(first);
    expect(pending.ok).toBe(false);
    view.rerender(<module.InputPanel input={first} result={pending} onChange={onChange} />);
    expect(screen.queryByLabelText(/Starre steun/)).toBeNull(); expect(screen.queryByLabelText("Veerstijfheid per anker [kN/m]")).toBeNull();
    expect(screen.getByLabelText("Vrije ankerlengte [m]")).toHaveValue("6");
    expect(screen.getByLabelText("Schachtwrijving groutlichaam [kPa]")).toHaveValue("0");
    fireEvent.change(screen.getByLabelText("Trekelement"), { target: { value: "y1050" } });
    expect(onChange.mock.lastCall?.[0].anchor.grout).toMatchObject({ gradeId: "y1050", tendonType: "bar", fMPa: 950, eMPa: 205000 });
    expect(screen.getByText(/niet tegen de tekst van NEN 9997-1 en CUR 166 gelegd\.$/)).toBeInTheDocument();
    const input2 = grouted();
    view.rerender(<module.InputPanel input={input2} result={ok(input2)} onChange={onChange} />);
    expect(screen.getByText(/k = 19\.500 kN\/m per anker/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Soort steun"), { target: { value: "strut" } });
    const strut = { ...input2, anchor: { ...input2.anchor, kind: "strut" as const } };
    view.rerender(<module.InputPanel input={strut} result={ok(strut)} onChange={onChange} />);
    expect(screen.queryByLabelText("Hoek met de horizontaal [°]")).toBeNull();
  });

  it("invoer: drie takken per laag en wateroverspanning per laag", () => {
    const input = wallExample(), onChange = vi.fn();
    render(<module.InputPanel input={input} result={ok(input)} onChange={onChange} />);
    const kh2 = screen.getByLabelText("kh2 laag 1, hoge zijde");
    fireEvent.change(kh2, { target: { value: "10000" } }); fireEvent.blur(kh2);
    expect(onChange.mock.lastCall?.[0].layersHigh[0].kh2).toBe(10000);
    const excess = screen.getByLabelText("onder, laag 1, hoge zijde");
    fireEvent.change(excess, { target: { value: "12" } }); fireEvent.blur(excess);
    expect(onChange.mock.lastCall?.[0].layersHigh[0].excessBottom).toBe(12);
    expect(screen.getByLabelText("Reductiefactor op EI")).toHaveValue("1"); expect(screen.getByLabelText("Volumegewicht water [kN/m³]")).toHaveValue("10");
  });

  it("uitkomsten en tekening: het blok groutanker, de drie toetsen, het groutlichaam en het glijvlak", () => {
    const input = grouted(), r = ok(input);
    render(<module.ResultPanel input={input} result={r} />);
    const block = screen.getByRole("table", { name: "Uitwerking van het groutanker" });
    expect(block).toHaveTextContent("19.500 kN/m"); expect(block).toHaveTextContent("Groutlichaam in Zand, matig");
    const summary = screen.getByRole("table", { name: "Overzicht van de toetsen" });
    for (const title of ["Trekelement van het groutanker", "Houdkracht van het groutlichaam", "Groutlichaam buiten het actieve glijvlak"]) expect(summary).toHaveTextContent(title);
    cleanup();
    render(<module.VisualPanel input={input} result={r} />);
    const svg = screen.getByRole("img", { name: /Doorsnede/ });
    expect(svg.querySelectorAll("line.sw-anchor-grout")).toHaveLength(1); expect(svg.querySelectorAll("line.sw-anchor-free")).toHaveLength(1); expect(svg.querySelectorAll(".sw-slip line")).toHaveLength(1);
    expect(svg.querySelectorAll(".sw-waling")).toHaveLength(1);
    // Op schaal: het groutlichaam is even lang getekend als de vrije lengte (beide 6 m).
    const length = (el: Element) => Math.hypot(Number(el.getAttribute("x2")) - Number(el.getAttribute("x1")), Number(el.getAttribute("y2")) - Number(el.getAttribute("y1")));
    expect(length(svg.querySelector("line.sw-anchor-grout")!)).toBeCloseTo(length(svg.querySelector("line.sw-anchor-free")!), 6);
  });

  it("uitdraai: een eigen blok voor het groutanker met invoer, krachten en toetsen", () => {
    const input = grouted(), text = new TextDecoder("latin1").decode(module.buildReport!(input, ok(input), ctx));
    for (const part of ["met groutankers", "Groutanker", "Trekelement van het groutanker", "Houdkracht van het groutlichaam", "Groutlichaam buiten het actieve glijvlak", "Actief glijvlak"]) expect(text).toContain(part);
  });
});
