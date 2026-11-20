import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { VisualPanel } from "./VisualPanel";
import { ResultPanel } from "./ResultPanel";
import { computePile } from "../compute";
import { useCptStore } from "../../../../store/useCptStore";
import fixture from "../__fixtures__/sondering-3bm-cgeo1.json";
import type { InterpretationOverride, PileInput } from "../types";
import type { Cpt } from "../../../../types/cpt";

afterEach(() => { cleanup(); useCptStore.setState({ cpts: new Map() }); });

const cpt: Cpt = {
  id: "S1",
  metadata: { source_file: "test", ground_level_nap: -0.5 },
  points: Array.from({ length: 251 }, (_, i) => ({ depth: i * 0.1, depth_nap: -0.5 - i * 0.1, qc: i < 75 ? 5 : i > 95 && i < 105 ? 3 : 12 })),
};
const input = { ...fixture.input, cptId: cpt.id, soilProfile: [...fixture.input.soilProfile, { kind: "sand-wet", startNap: -8, endNap: -14, gammaK: 20, gammaW: 10, phi: 32.5 }] } as PileInput;
const override: InterpretationOverride = { id: "o1", cptId: "S1", topNap: -9.9, bottomNap: -11.1, qc: { mode: "interpolate" }, soilKind: "clay", comment: "lokale terugval" };
const type = (label: string, value: string) => {
  const field = screen.getByLabelText(label);
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
};

it("slaat een getypt traject met toelichting op in de invoer van de berekening", () => {
  useCptStore.setState({ cpts: new Map([[cpt.id, cpt]]) });
  const onChange = vi.fn();
  render(<VisualPanel input={input} result={computePile(input, cpt)} onChange={onChange} />);
  expect(screen.getByText("zoals gemeten")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Traject aanpassen" }));
  expect(screen.getByRole("button", { name: "Opslaan" })).toBeDisabled();
  type("Bovenkant traject [m NAP]", "-9,9");
  type("Onderkant traject [m NAP]", "-11.1");
  fireEvent.change(screen.getByLabelText("Toelichting bij de aanpassing"), { target: { value: "lokale terugval" } });
  fireEvent.click(screen.getByRole("button", { name: "Opslaan" }));
  expect(onChange).toHaveBeenCalledTimes(1);
  const saved = (onChange.mock.calls[0][0] as PileInput).interpretationOverrides!;
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ cptId: "S1", topNap: -9.9, bottomNap: -11.1, qc: { mode: "interpolate" }, comment: "lokale terugval" });
  expect(saved[0].soilKind).toBeUndefined();
  // De sondering in het project is niet aangeraakt.
  expect(useCptStore.getState().cpts.get("S1")).toBe(cpt);
});

it("toont de aanpassing in de tekening en laat bewerken, verwijderen en terugzetten toe", () => {
  useCptStore.setState({ cpts: new Map([[cpt.id, cpt]]) });
  const adjusted = { ...input, interpretationOverrides: [override, { ...override, id: "o2", cptId: "S2" }] };
  const onChange = vi.fn();
  const { container } = render(<VisualPanel input={adjusted} result={computePile(adjusted, cpt)} onChange={onChange} />);
  expect(screen.getByText("1 aanpassing(en) voor deze sondering")).toBeInTheDocument();
  expect(screen.getByText("lokale terugval")).toBeInTheDocument();
  // Gemeten lijn en aangepaste lijn staan allebei in de grafiek.
  expect(container.querySelector(".pile-cpt-qc-curve--base")).not.toBeNull();
  expect(container.querySelector(".pile-cpt-qc-curve--adjusted")).not.toBeNull();
  expect(container.querySelector(".pile-cpt-interp-band")).not.toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Aanpassing A1 bewerken" }));
  expect(screen.getByLabelText("Bovenkant traject [m NAP]")).toHaveValue("-9.9");
  fireEvent.change(screen.getByLabelText("Conusweerstand"), { target: { value: "fixed" } });
  type("Vaste conusweerstand [MPa]", "10");
  fireEvent.click(screen.getByRole("button", { name: "Opslaan" }));
  expect((onChange.mock.calls[0][0] as PileInput).interpretationOverrides![0]).toMatchObject({ id: "o1", qc: { mode: "fixed", valueMpa: 10 }, soilKind: "clay" });

  fireEvent.click(screen.getByRole("button", { name: "Aanpassing A1 verwijderen" }));
  expect((onChange.mock.calls[1][0] as PileInput).interpretationOverrides!.map((o) => o.id)).toEqual(["o2"]);
  // Terugzetten laat de aanpassingen van andere sonderingen staan.
  fireEvent.click(screen.getByRole("button", { name: "Alles terugzetten" }));
  expect((onChange.mock.calls[2][0] as PileInput).interpretationOverrides!.map((o) => o.id)).toEqual(["o2"]);
});

it("meldt de aanpassingen duidelijk bij het resultaat", () => {
  const adjusted = { ...input, interpretationOverrides: [override] };
  render(<ResultPanel input={adjusted} result={computePile(adjusted, cpt)} />);
  const note = screen.getByRole("note", { name: "Aanpassingen aan de grondlaaginterpretatie" });
  expect(note).toHaveTextContent("lokale terugval");
  expect(note).toHaveTextContent("Grondsoort: Zand nat → Klei nat");
  expect(note).toHaveTextContent("lineair van 12,0 naar 12,0 MPa");
});

it("toont zonder aanpassingen geen melding bij het resultaat", () => {
  render(<ResultPanel input={input} result={computePile(input, cpt)} />);
  expect(screen.queryByRole("note", { name: "Aanpassingen aan de grondlaaginterpretatie" })).toBeNull();
});
