import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CalculationsView } from "./CalculationsView";
import { newProjectDocument, useCptStore } from "../../../store/useCptStore";
import { useCalculationsStore } from "../store";
import { getCalcModule } from "../registry";
import type { PanelProps } from "../types";
import type { PileInput, PileResult } from "../../modules/pile-bearing-capacity/types";

vi.mock("../../../utils/platform", () => ({ IS_TAURI: false }));
vi.mock("../../modules/pile-bearing-capacity/ui/VisualPanel", () => ({
  VisualPanel: ({ input, onChange }: PanelProps<PileInput, PileResult>) =>
    <button onClick={() => onChange?.({ ...input, pileToeNap: -20 })}>Paalpunt verschuiven</button>,
}));
beforeEach(() => {
  vi.useFakeTimers();
  useCptStore.setState({ documents: [], activeDocId: null, cpts: new Map(), activeCptId: null });
  useCalculationsStore.setState({ byDoc: new Map(), activeCalcId: null });
  newProjectDocument();
});
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); });

it("toont paalinvoer, sondering en uitkomsten met een werkende grafiekkoppeling", () => {
  const state = useCptStore.getState();
  const input = getCalcModule("pile-bearing-capacity")!.defaultInput(state);
  useCalculationsStore.getState().addCalculation(state.activeDocId!, "pile-bearing-capacity", "Paal A", input);
  render(<CalculationsView />);
  expect(screen.getByRole("region", { name: "Invoer" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Sondering" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Resultaten" })).toBeInTheDocument();
  expect(screen.getByText("Geotechniek / Paaldraagvermogen")).toBeInTheDocument();
  expect(screen.getByText("Concept")).toBeInTheDocument();
  act(() => fireEvent.click(screen.getByRole("button", { name: "Paalpunt verschuiven" })));
  expect(useCalculationsStore.getState().getList(state.activeDocId!)[0].input).toMatchObject({ pileToeNap: -20 });
});
