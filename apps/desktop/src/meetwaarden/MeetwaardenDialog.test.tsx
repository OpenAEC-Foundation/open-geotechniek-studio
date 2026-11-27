import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import MeetwaardenDialog, { EMPTY_FORM, opFromForm, parseNumber } from "./MeetwaardenDialog";
import { openProjectFromContent, useCptStore } from "../store/useCptStore";
import { activeProjectPayload } from "../store/projectSerialization";
import type { Cpt } from "../types/cpt";
import { kindLabel } from "./logbook";
import { editLogOf, originalOf } from "./state";

const source = (): Cpt => ({
  id: "S01",
  metadata: { source_file: "S01.gef" },
  points: Array.from({ length: 10 }, (_, i) => ({ depth: Number((1 + i / 10).toFixed(1)), qc: 10 + i, fs: 0.1, rf: (100 * 0.1) / (10 + i) })),
});
const project = { title: "Proef", client: "", location: "", project_number: "", author: "A. Meetman", date: "2026-11-20" };
const initial = useCptStore.getState();
afterEach(() => { cleanup(); useCptStore.setState(initial, true); });

const current = () => useCptStore.getState().cpts.get("S01")!;
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("formulier", () => {
  it("leest getallen met komma of punt", () => {
    expect(parseNumber(" 1,25 ")).toBe(1.25);
    expect(parseNumber("-0.5")).toBe(-0.5);
    expect(parseNumber("")).toBeUndefined();
    expect(parseNumber("1,2,3")).toBeNaN();
  });

  it("maakt pas een bewerking als de verplichte velden zijn ingevuld", () => {
    expect(opFromForm(EMPTY_FORM)).toBeNull();
    expect(opFromForm({ ...EMPTY_FORM, from: "2", to: "2,5" })).toEqual({ kind: "remove-range", from: 2, to: 2.5 });
    expect(opFromForm({ ...EMPTY_FORM, kind: "invalidate-range", from: "2", to: "3", channel: "" })).toEqual({ kind: "invalidate-range", from: 2, to: 3, channels: [] });
    expect(opFromForm({ ...EMPTY_FORM, kind: "zero-shift", channel: "u2", offset: "-0,01" })).toEqual({ kind: "zero-shift", channel: "u2", offset: -0.01 });
    expect(opFromForm({ ...EMPTY_FORM, kind: "set-value", depth: "4", channel: "fs" })).toEqual({ kind: "set-value", depth: 4, channel: "fs", value: null });
    expect(opFromForm({ ...EMPTY_FORM, kind: "remove-outliers", from: "1", to: "9" })).toEqual({ kind: "remove-outliers", from: 1, to: 9, channel: "qc", halfWindow: 5, threshold: 3 });
  });

  it("heeft de teksten ook in een andere taal", () => {
    expect(kindLabel("trim-top", "en")).toBe("Trim top");
    expect(kindLabel("trim-top", "de")).toBe("Oben abschneiden");
  });
});

describe("scherm Meetwaarden bewerken", () => {
  it("past een bewerking toe op de sondering in het project, met logboek, en maakt haar ongedaan", async () => {
    await openProjectFromContent(JSON.stringify({ project, cpts: [source()] }), "proef.json");
    render(<MeetwaardenDialog open onClose={() => {}} />);
    expect(screen.getByText("Nog geen bewerkingen op deze sondering.")).toBeTruthy();
    // De opsteller van het project staat al ingevuld als degene die bewerkt.
    expect((screen.getByLabelText("Wie") as HTMLInputElement).value).toBe("A. Meetman");

    fireEvent.change(screen.getByLabelText("Soort"), { target: { value: "trim-top" } });
    type("Behouden vanaf diepte (m)", "1,2");
    expect(screen.getByText(/raakt 2 van 10 meetpunten/)).toBeTruthy();
    // Zonder reden kan de bewerking niet worden toegepast.
    const apply = screen.getByRole("button", { name: "Toepassen" }) as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    type("Reden (verplicht)", "Voorboring tot 1,2 m");
    expect(apply.disabled).toBe(false);
    fireEvent.click(apply);

    expect(current().points).toHaveLength(8);
    expect(editLogOf(current()).edits).toMatchObject([{ by: "A. Meetman", reason: "Voorboring tot 1,2 m", op: { kind: "trim-top", depth: 1.2 } }]);
    expect(screen.getByText("Bovenkant afgekapt: alles boven 1.20 m vervalt")).toBeTruthy();
    expect(screen.getByText("geraakte meetpunten: 2")).toBeTruthy();

    // Opslaan en heropenen: het project draagt de bewerkte waarden, het logboek en het origineel.
    const saved = JSON.stringify(activeProjectPayload());
    useCptStore.setState(initial, true);
    await openProjectFromContent(saved, "proef.json");
    expect(current().points).toHaveLength(8);
    expect(editLogOf(current()).edits).toHaveLength(1);
    expect(originalOf(current()).points).toEqual(source().points);

    fireEvent.click(screen.getByRole("button", { name: "Laatste ongedaan maken" }));
    expect(current().points).toEqual(source().points);
    expect(editLogOf(current()).edits).toHaveLength(0);
  });

  it("corrigeert een losse meetwaarde op het dichtstbijzijnde meetpunt en toont oud en nieuw", async () => {
    await openProjectFromContent(JSON.stringify({ project, cpts: [source()] }), "proef.json");
    render(<MeetwaardenDialog open onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Soort"), { target: { value: "set-value" } });
    type("Diepte (m)", "1.502");
    expect(screen.getByText("Meetpunt op 1.50 m, huidige waarde: 15 MPa.")).toBeTruthy();
    type("Nieuwe waarde (MPa)", "12");
    expect(screen.getByText(/15 MPa → 12 MPa/)).toBeTruthy();
    type("Reden (verplicht)", "Storing");
    fireEvent.click(screen.getByRole("button", { name: "Toepassen" }));
    expect(current().points[5]).toMatchObject({ depth: 1.5, qc: 12 });
    expect(current().points[5].rf).toBeCloseTo(100 * 0.1 / 12, 12);
    expect(editLogOf(current()).edits[0].op).toEqual({ kind: "set-value", depth: 1.5, channel: "qc", value: 12 });
  });
});
