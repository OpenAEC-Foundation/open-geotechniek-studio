import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { DEFAULT_DRAG_SNAP_M, DRAG_SNAP_KEY, normalizeSnap, snapNap, useDragSnapStore } from "./useDragSnapStore";
import { useCptStore } from "./useCptStore";
import { VisualPanel as TensionVisual } from "../calc/modules/tension-pile/panels";
import { tensionPileModule } from "../calc/modules/tension-pile/module";
import { pileBearingCapacityModule } from "../calc/modules/pile-bearing-capacity/module";
import type { TensionInput } from "../calc/modules/tension-pile/compute";
import type { PileInput } from "../calc/modules/pile-bearing-capacity/types";
import type { Cpt } from "../types/cpt";

const cpt: Cpt = {
  id: "S1", metadata: { source_file: "S1.gef", ground_level_nap: 0 }, position: { x_rd: 155000, y_rd: 463000 },
  points: Array.from({ length: 201 }, (_, k) => ({ depth: k * 0.1, depth_nap: -k * 0.1, qc: k < 80 ? 1 : 15, fs: 0.05, rf: 1 })),
} as Cpt;
const meta = { title: "", client: "", location: "", project_number: "", author: "", date: "" };

/** jsdom heeft geen lay-out: geef het svg-element een vaste maat, gelijk aan zijn viewBox. */
function sizeSvg(svg: SVGSVGElement, w: number, h: number) {
  svg.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: w, bottom: h, width: w, height: h, toJSON: () => ({}) }) as DOMRect;
}

afterEach(() => { cleanup(); act(() => useDragSnapStore.setState({ snapM: DEFAULT_DRAG_SNAP_M })); });

describe("snapafstand", () => {
  it("rondt naar het raster zonder drijvendekommastaart", () => {
    expect(snapNap(-14.13, 0.25)).toBe(-14.25);
    expect(snapNap(-14.12, 0.25)).toBe(-14);
    expect(snapNap(4.1000000000000005, 0.05)).toBe(4.1);
    expect(snapNap(-3.337, 0)).toBe(-3.34);
    expect(snapNap(-3.4, 0.5)).toBe(-3.5);
  });
  it("leest en bewaart een geldige afstand en valt anders terug op 0,25 m", () => {
    expect(DEFAULT_DRAG_SNAP_M).toBe(0.25);
    expect(normalizeSnap("0,1")).toBe(0.1);
    expect(normalizeSnap(0)).toBe(0);
    expect(normalizeSnap(-1)).toBe(0.25);
    expect(normalizeSnap("x")).toBe(0.25);
    expect(normalizeSnap(12)).toBe(5);
    act(() => useDragSnapStore.getState().setSnapM(0.5));
    expect(useDragSnapStore.getState().snapM).toBe(0.5);
    expect(JSON.parse(window.localStorage.getItem(`ogs:${DRAG_SNAP_KEY}`) ?? "null")).toBe(0.5);
  });
});

describe("slepen in de grafiek van de trekpaal", () => {
  beforeEach(() => { act(() => useCptStore.setState({ cpts: new Map([["S1", cpt]]) })); });

  const setup = () => {
    let current: TensionInput = { ...(tensionPileModule.defaultInput({ cpts: new Map([["S1", cpt]]), activeCptId: "S1", projectMeta: meta }) as TensionInput), cptId: "S1", pileTopNap: -1, pileToeNap: -12 };
    const changes: TensionInput[] = [];
    const result = tensionPileModule.compute(current, { cpts: new Map([["S1", cpt]]), activeCptId: "S1", projectMeta: meta }) as never;
    const view = render(<TensionVisual input={current} result={result} onChange={(n) => { changes.push(n); current = n; }} />);
    const svg = view.container.querySelector("svg")!;
    sizeSvg(svg, 420, 620);
    return { view, svg, changes };
  };

  it("verplaatst de paalpunt in stappen van de ingestelde snapafstand", () => {
    const { view, changes } = setup();
    // grepen: grondwater, paalpunt, paalkop (geen ontgraving in deze invoer)
    const hits = view.container.querySelectorAll(".tp-hit");
    expect(hits).toHaveLength(3);
    expect(hits[1].querySelector("title")?.textContent).toMatch(/Sleep om te verplaatsen \(snapt op 0,25 m\)/);
    const toe = hits[1];
    fireEvent.mouseDown(toe!, { clientY: 300 });
    fireEvent.mouseMove(window, { clientY: 337 });
    const last = changes[changes.length - 1];
    expect(last.pileToeNap).not.toBe(-12);
    expect(Math.abs(last.pileToeNap / 0.25 - Math.round(last.pileToeNap / 0.25))).toBeLessThan(1e-9);
    expect(last.pileToeNap).toBeLessThan(-12);
    fireEvent.mouseUp(window);
  });

  it("volgt een andere snapafstand uit de instellingen", () => {
    act(() => useDragSnapStore.setState({ snapM: 1 }));
    const { view, changes } = setup();
    fireEvent.mouseDown(view.container.querySelectorAll(".tp-hit")[0], { clientY: 200 });
    fireEvent.mouseMove(window, { clientY: 260 });
    const last = changes[changes.length - 1];
    expect(Number.isInteger(last.waterNap)).toBe(true);
    fireEvent.mouseUp(window);
  });

  it("laat de paalpunt niet boven de paalkop komen", () => {
    const { view, changes } = setup();
    fireEvent.mouseDown(view.container.querySelectorAll(".tp-hit")[1], { clientY: 400 });
    fireEvent.mouseMove(window, { clientY: -2000 });
    expect(changes[changes.length - 1].pileToeNap).toBeLessThan(-1);
    fireEvent.mouseUp(window);
  });
});

describe("slepen in de grafiek van de drukpaal", () => {
  it("snapt op de ingestelde afstand", async () => {
    const { VisualPanel } = await import("../calc/modules/pile-bearing-capacity/ui/VisualPanel");
    const ctx = { cpts: new Map([["S1", cpt]]), activeCptId: "S1", projectMeta: meta };
    act(() => useCptStore.setState({ cpts: ctx.cpts }));
    let input: PileInput = { ...(pileBearingCapacityModule.defaultInput(ctx) as PileInput), cptId: "S1" };
    const changes: PileInput[] = [];
    const result = pileBearingCapacityModule.compute(input, ctx) as import("../calc/modules/pile-bearing-capacity/types").PileResult;
    const view = render(<VisualPanel input={input} result={result} onChange={(n: PileInput) => { changes.push(n); input = n; }} />);
    const svg = view.container.querySelector("svg")!;
    const vb = svg.viewBox.baseVal;
    sizeSvg(svg, vb.width || 600, vb.height || 800);
    const hits = view.container.querySelectorAll(".pile-niveau-hitbox");
    expect(hits.length).toBeGreaterThan(0);
    fireEvent.mouseDown(hits[hits.length - 1], { clientY: 300 });
    fireEvent.mouseMove(window, { clientY: 333 });
    fireEvent.mouseUp(window);
    expect(changes.length).toBeGreaterThan(0);
    expect(Math.abs(changes[0].pileToeNap / 0.25 - Math.round(changes[0].pileToeNap / 0.25))).toBeLessThan(1e-9);
  });
});
