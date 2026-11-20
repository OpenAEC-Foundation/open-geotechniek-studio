// Het paneel voor de grondlaaginterpretatie in het rekenblad van de trekpaal.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { InputPanel, ResultPanel, VisualPanel } from "./panels";
import { TensionTable } from "./TensionTable";
import { computeTension, type TensionInput, type TensionOverride } from "./compute";
import { useCptStore } from "../../../store/useCptStore";
import { fixtureCpt as cpt, fixtureInput as input } from "./interpretation.fixture";

afterEach(() => { cleanup(); vi.restoreAllMocks(); useCptStore.setState({ cpts: new Map() }); });

const dip: TensionOverride = { id: "o1", cptId: "S1", topNap: -11.9, bottomNap: -13, qc: { mode: "interpolate" }, soilKind: "sand", comment: "lokale terugval" };
const adjusted: TensionInput = { ...input, interpretationOverrides: [dip] };
const load = () => useCptStore.setState({ cpts: new Map([[cpt.id, cpt]]) });
const type = (label: string, value: string) => {
  const field = screen.getByLabelText(label);
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
};

it("slaat een getypt traject met grondsoort en toelichting op in de invoer", () => {
  load();
  const onChange = vi.fn();
  render(<VisualPanel input={input} result={computeTension(input, cpt)} onChange={onChange} />);
  expect(screen.getByText("zoals gemeten")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Traject aanpassen" }));
  expect(screen.getByRole("button", { name: "Opslaan" })).toBeDisabled();
  type("Bovenkant traject [m NAP]", "-11,9");
  type("Onderkant traject [m NAP]", "-13");
  // De keuzelijst biedt de grondsoorten van de trekpaalberekening.
  const soil = screen.getByLabelText("Grondsoort van het traject");
  expect(within(soil).getAllByRole("option").map((o) => o.textContent)).toEqual(["ongewijzigd", "Zand", "Klei", "Leem", "Veen"]);
  fireEvent.change(soil, { target: { value: "peat" } });
  fireEvent.change(screen.getByLabelText("Toelichting bij de aanpassing"), { target: { value: "lokale terugval" } });
  fireEvent.click(screen.getByRole("button", { name: "Opslaan" }));
  expect(onChange).toHaveBeenCalledTimes(1);
  const saved = (onChange.mock.calls[0][0] as TensionInput).interpretationOverrides!;
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ cptId: "S1", topNap: -11.9, bottomNap: -13, qc: { mode: "interpolate" }, soilKind: "peat", comment: "lokale terugval" });
});

it("slepen in de grafiek kiest het traject", () => {
  load();
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ top: 0, left: 0, width: 420, height: 620, right: 420, bottom: 620, x: 0, y: 0, toJSON: () => ({}) });
  render(<VisualPanel input={input} result={computeTension(input, cpt)} onChange={vi.fn()} />);
  expect(screen.queryByTestId("tp-interp-capture")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Traject aanpassen" }));
  // De as loopt van NAP +0,50 m (y = 22) tot -22,00 m (y = 606): 584 eenheden over 22,5 m.
  const yOf = (nap: number) => 22 + (0.5 - nap) / 22.5 * 584;
  const capture = screen.getByTestId("tp-interp-capture");
  fireEvent.pointerDown(capture, { clientY: yOf(-12), pointerId: 1 });
  fireEvent.pointerMove(capture, { clientY: yOf(-13), pointerId: 1 });
  fireEvent.pointerUp(capture, { clientY: yOf(-13), pointerId: 1 });
  expect(screen.getByLabelText("Bovenkant traject [m NAP]")).toHaveValue("-12");
  expect(screen.getByLabelText("Onderkant traject [m NAP]")).toHaveValue("-13");
});

it("toont de aanpassing bij de tekening en op het resultaatblad, en zet alles terug", () => {
  load();
  const onChange = vi.fn();
  const result = computeTension(adjusted, cpt);
  const { container } = render(<><VisualPanel input={adjusted} result={result} onChange={onChange} /><ResultPanel input={adjusted} result={result} /></>);
  expect(screen.getByText("1 aanpassing(en) voor deze sondering")).toBeInTheDocument();
  expect(screen.getAllByText("lokale terugval").length).toBeGreaterThanOrEqual(2);
  expect(screen.getAllByText("Grondsoort: Zand → Zand").length).toBeGreaterThanOrEqual(2);
  expect(screen.getByRole("note", { name: "Aanpassingen aan de grondlaaginterpretatie" })).toBeInTheDocument();
  // De meting blijft zichtbaar naast de lijn waarmee is gerekend.
  expect(container.querySelector(".tp-qc--measured")).not.toBeNull();
  expect(container.querySelector(".tp-interp-band")).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Alles terugzetten" }));
  expect((onChange.mock.calls[0][0] as TensionInput).interpretationOverrides).toBeUndefined();
});

it("zonder aanpassingen staat er geen overzicht op het resultaatblad en geen tweede lijn in de tekening", () => {
  load();
  const result = computeTension(input, cpt);
  const { container } = render(<><InputPanel input={input} result={result} onChange={vi.fn()} /><VisualPanel input={input} result={result} /><ResultPanel input={input} result={result} /></>);
  expect(screen.queryByRole("note", { name: "Aanpassingen aan de grondlaaginterpretatie" })).toBeNull();
  expect(container.querySelector(".tp-qc--measured")).toBeNull();
  // Alleen lezen: geen knop om aan te passen.
  expect(screen.queryByRole("button", { name: "Traject aanpassen" })).toBeNull();
});

it("de tabel merkt een aangepaste sondering", () => {
  const cpts = new Map([[cpt.id, cpt], ["S2", { ...cpt, id: "S2" }]]);
  const tableInput: TensionInput = { ...adjusted, table: { cptIds: ["S1", "S2"], toeNaps: [-20], sizesMm: [290] } };
  render(<TensionTable input={tableInput} ctx={{ cpts, activeCptId: "S1", projectMeta: {} as never }} onChange={vi.fn()} onOpen={vi.fn()} focus={null} onFocus={vi.fn()} />);
  expect(screen.getAllByText(/aangepast/)).toHaveLength(1);
});
