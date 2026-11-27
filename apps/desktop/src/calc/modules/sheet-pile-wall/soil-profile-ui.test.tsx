// Invoer van de grondlagen uit de sondering: sondering per zijde, voorstel met bevestiging, herkomst per laag,
// keuze van een tabelregel, en de qc-kolom in de doorsnede.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCptStore } from "../../../store/useCptStore";
import type { Cpt } from "../../../types/cpt";
import { computeWall, wallExample, type WallInput, type WallOk } from "./compute";
import { InputPanel, VisualPanel } from "./panels";

function cpt(id: string, ground: number): Cpt {
  const points: Cpt["points"] = [];
  for (let d = 0; d <= 12 + 1e-9; d += 0.02) { const depth = Math.round(d * 100) / 100; points.push(depth < 3 ? { depth, qc: 0.7, rf: 2.5 } : { depth, qc: 14, rf: 0.8 }); }
  return { id, metadata: { source_file: `${id}.gef`, ground_level_nap: ground }, points };
}
const ok = (i: WallInput): WallOk => { const r = computeWall(i); if (!r.ok) throw new Error(r.error); return r; };

beforeEach(() => useCptStore.setState({ cpts: new Map([["S1", cpt("S1", 0)], ["S2", cpt("S2", -0.5)]]) as never }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("grondlagen uit de sondering", () => {
  it("vervangt handmatige lagen alleen na bevestiging", () => {
    const input = { ...wallExample(), cptId: "S1" }, onChange = vi.fn();
    render(<InputPanel input={input} result={ok(input)} onChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "Voorstel uit sondering" }));
    expect(confirm).toHaveBeenCalledOnce(); expect(onChange).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Voorstel uit sondering" }));
    const next = onChange.mock.lastCall?.[0] as WallInput;
    // Gelijke qc in het zand: met de omrekening naar σ′v = 100 kPa ondiep vast, dieper matig en los (voetnoot g).
    expect(next.layersHigh.map((l) => l.soilId)).toEqual(["t2b-klei-schoon-slap", "t2b-zand-schoon-vast", "t2b-zand-schoon-matig", "t2b-zand-schoon-los"]);
    expect(next.layersHigh[0]).toMatchObject({ topNap: 0, kh: 2000, kh2: 800, kh3: 500, source: { cptId: "S1", zone: 3 } });
    expect(next.lowSameAsHigh).toBe(true);
    expect(computeWall(next).ok).toBe(true);
  });

  it("een eigen sondering voor de lage zijde en de kleinste laagdikte", () => {
    const input = { ...wallExample(), cptId: "S1" }, onChange = vi.fn();
    const view = render(<InputPanel input={input} result={ok(input)} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Sondering lage zijde"), { target: { value: "S2" } });
    expect(onChange.mock.lastCall?.[0].cptIdLow).toBe("S2");
    fireEvent.change(screen.getByLabelText("Kleinste laagdikte [m]"), { target: { value: "0,5" } });
    fireEvent.blur(screen.getByLabelText("Kleinste laagdikte [m]"));
    expect(onChange.mock.lastCall?.[0].layerMinThicknessM).toBe(0.5);
    const two = { ...input, cptIdLow: "S2" };
    view.rerender(<InputPanel input={two} result={ok(two)} onChange={onChange} />);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Voorstel uit sondering" }));
    const next = onChange.mock.lastCall?.[0] as WallInput;
    expect(next.lowSameAsHigh).toBe(false);
    expect(next.layersLow[0]).toMatchObject({ topNap: -0.5, source: { cptId: "S2" } });
  });

  it("toont de herkomst per laag en laat een tabelregel kiezen", () => {
    const base = { ...wallExample(), cptId: "S1" }, onChange = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const view = render(<InputPanel input={base} result={ok(base)} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Voorstel uit sondering" }));
    const input = onChange.mock.lastCall?.[0] as WallInput;
    view.rerender(<InputPanel input={input} result={ok(input)} onChange={onChange} />);
    const sources = screen.getByRole("table", { name: "Herkomst, hoge zijde" });
    expect(within(sources).getByText("Klei, schoon, slap")).toBeInTheDocument();
    expect(within(sources).getByText("klei, slap (cu 25 kPa)")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Grondsoort laag 1, hoge zijde"), { target: { value: "t2b-veen-nv-slap" } });
    expect(onChange.mock.lastCall?.[0].layersHigh[0]).toMatchObject({ soilId: "t2b-veen-nv-slap", gamma: 10, phi: 15, c: 1, cu: 10, delta: 0, kh: 1000, kh2: 500, kh3: 250, source: undefined });
  });

  it("qc van de sondering naast de doorsnede, op verzoek", () => {
    const input = { ...wallExample(), cptId: "S1" };
    const { container } = render(<VisualPanel input={input} result={ok(input)} />);
    expect(container.querySelector(".sw-qc")).toBeNull();
    fireEvent.click(screen.getByLabelText("qc van de sondering naast de doorsnede"));
    expect(container.querySelectorAll(".sw-qc-line")).toHaveLength(1);
    expect(container.querySelectorAll(".sw-layer").length).toBeGreaterThanOrEqual(4);
  });
});
