import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SettingsPanel } from "./SettingsPanel";
import { InputPanel } from "./InputPanel";
import { computePile } from "../compute";
import fixture from "../__fixtures__/sondering-3bm-cgeo1.json";
import type { PileInput } from "../types";
import type { Cpt } from "../../../../types/cpt";

const cpt = fixture.cpt as unknown as Cpt;
const input = { ...fixture.input, cptId: cpt.id, pileTypeId: "steel-pipe-driven-closed-2017", diameterMm: 219.1 } as PileInput;
const result = computePile(input, cpt);

describe("instellingen paaldraagvermogen", () => {
  it("zet een projectwaarde voor een paalfactor en vult de rest met tabelwaarden", () => {
    const onChange = vi.fn();
    const { rerender } = render(<SettingsPanel input={input} result={result} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("αs project"), { target: { value: "0.012" } });
    const next = onChange.mock.lastCall![0] as PileInput;
    expect(next.projectFactors).toMatchObject({ alphaS: 0.012, alphaP: 0.7, beta: 1, source: "Instellingen van de berekening" });
    rerender(<SettingsPanel input={next} result={result} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Tabelwaarden gebruiken" }));
    expect(onChange.mock.lastCall![0].projectFactors).toBeUndefined();
  });
  it("past de maatreeks per paaltype aan en de invoer biedt die aan", () => {
    const onChange = vi.fn();
    render(<SettingsPanel input={input} result={result} onChange={onChange} />);
    const field = screen.getByLabelText("Maatreeks paaltype [mm]");
    fireEvent.change(field, { target: { value: "219,1 273 406,4" } });
    fireEvent.blur(field);
    const next = onChange.mock.lastCall![0] as PileInput;
    expect(next.presets?.sizesMm?.["steel-pipe-driven-closed-2017"]).toEqual([219.1, 273, 406.4]);
    render(<InputPanel input={next} result={result} onChange={vi.fn()} />);
    expect([...screen.getByLabelText("Buismaat").querySelectorAll("option")].map((o) => o.textContent)).toEqual(["Ø219,1 mm", "Ø273 mm", "Ø406,4 mm"]);
  });
  it("voegt een opzetter en een lengte toe die de houten paal daarna aanbiedt", () => {
    const onChange = vi.fn();
    render(<SettingsPanel input={input} result={result} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Opzetter" }));
    expect(onChange.mock.lastCall![0].presets.extensions).toEqual([{ sizeMm: 280, isCircular: true }, { sizeMm: 180, isCircular: true }, { sizeMm: 250, isCircular: false }, { sizeMm: 220, isCircular: true }]);
    const lengths = screen.getByLabelText("Lengtes opzetter [m]");
    fireEvent.change(lengths, { target: { value: "1 3" } });
    fireEvent.keyDown(lengths, { key: "Enter" });
    expect(onChange.mock.lastCall![0].presets.extensionLengthsM).toEqual([1, 3]);
  });
});
