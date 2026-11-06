import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NumField, NumberInput } from "./SheetForm";

describe("getalveld", () => {
  it("rekent niet door tijdens het typen, ook niet bij tussenstanden als '-' of '-1'", () => {
    const onChange = vi.fn();
    render(<NumField aria-label="Paalpunt" value={-16} onChange={onChange} />);
    const field = screen.getByLabelText("Paalpunt");
    for (const v of ["-1", "-", "-8"]) fireEvent.change(field, { target: { value: v } });
    expect(onChange).not.toHaveBeenCalled();
    expect(field).toHaveValue("-8");
    fireEvent.blur(field);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ target: { value: "-8" } });
  });
  it("neemt over met Enter, accepteert een komma en zet terug met Esc", () => {
    const onChange = vi.fn();
    render(<NumField aria-label="Las" value={-3} onChange={onChange} />);
    const field = screen.getByLabelText("Las");
    fireEvent.change(field, { target: { value: "-2,75" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith({ target: { value: "-2.75" } });
    fireEvent.change(field, { target: { value: "99" } });
    fireEvent.keyDown(field, { key: "Escape" });
    fireEvent.blur(field);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
  it("neemt een ongeldige of lege waarde niet over, behalve leeg bij een optioneel veld", () => {
    const onChange = vi.fn(), optional = vi.fn();
    render(<><NumField aria-label="Diameter" value={220} onChange={onChange} /><NumField aria-label="EA" placeholder="optioneel" value={5000} onChange={optional} /></>);
    const d = screen.getByLabelText("Diameter");
    fireEvent.change(d, { target: { value: "abc" } });
    expect(d).toHaveAttribute("aria-invalid", "true");
    fireEvent.blur(d);
    fireEvent.change(d, { target: { value: "" } });
    fireEvent.blur(d);
    expect(onChange).not.toHaveBeenCalled();
    expect(d).toHaveValue("220");
    const ea = screen.getByLabelText("EA");
    fireEvent.change(ea, { target: { value: "" } });
    fireEvent.blur(ea);
    expect(optional).toHaveBeenCalledWith({ target: { value: "" } });
  });
  it("NumberInput geeft een getal door na het verlaten", () => {
    const onChange = vi.fn();
    render(<NumberInput label="H" value={30} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("H"), { target: { value: "-" } });
    fireEvent.change(screen.getByLabelText("H"), { target: { value: "-45" } });
    fireEvent.blur(screen.getByLabelText("H"));
    expect(onChange).toHaveBeenCalledWith(-45);
  });
});
