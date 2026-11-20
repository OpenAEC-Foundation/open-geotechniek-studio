// Het scherm "Sondering digitaliseren": de stappen, punten zetten met ongedaan maken, en opslaan.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { loadCptSnapshot, useCptStore } from "../store/useCptStore";
import { DigitizeDialog } from "./DigitizeDialog";
import { buildDigitizedCpt, digitizedOf } from "./record";
import { sampleRecord } from "./__fixtures__/sample";

const reset = () => useCptStore.setState({ documents: [], activeDocId: null, cpts: new Map(), activeCptId: null });

describe("DigitizeDialog", () => {
  beforeEach(reset);
  afterEach(() => { cleanup(); reset(); vi.restoreAllMocks(); });

  it("toont bij een nieuwe sondering de vijf stappen en begint bij de onderlegger", () => {
    render(<DigitizeDialog onClose={() => {}} />);
    expect(screen.getByRole("heading", { name: "Sondering digitaliseren" })).toBeInTheDocument();
    for (const name of ["1Onderlegger", "2IJken", "3Punten", "4Gegevens", "5Opslaan"]) expect(screen.getByRole("button", { name })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1Onderlegger" })).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("button", { name: "PDF of afbeelding kiezen…" })).toBeInTheDocument();
    expect(screen.getByText("Kies rechts een PDF of afbeelding met de sondeergrafiek.")).toBeInTheDocument();
    // Zonder onderlegger zijn de volgende stappen nog niet te kiezen.
    expect(screen.getByRole("button", { name: "2IJken" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Volgende" })).toBeDisabled();
  });

  it("opent een gedigitaliseerde sondering opnieuw met haar punten, raster en lijn", () => {
    loadCptSnapshot(buildDigitizedCpt(sampleRecord()), "S-1961-07");
    const { container } = render(<DigitizeDialog cptId="S-1961-07" onClose={() => {}} />);
    expect(screen.getByRole("heading", { name: "Gedigitaliseerde sondering S-1961-07 bijwerken" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "3Punten" })).toHaveAttribute("aria-current", "step");
    expect(container.querySelectorAll(".dig-marker-point")).toHaveLength(4);
    expect(screen.getByTestId("dig-count")).toHaveTextContent("4 punten voor qc");
    expect(screen.getByTestId("dig-grid").querySelectorAll("line").length).toBeGreaterThan(10);
    expect(screen.getByTestId("dig-line-qc")).toBeInTheDocument();
    expect(screen.getByText("Meetreeks: 101 waarden van 0.00 tot 20.00 m onder maaiveld.")).toBeInTheDocument();
  });

  it("zet een punt met een klik, verwijdert het met de rechtermuisknop en maakt dat ongedaan", () => {
    loadCptSnapshot(buildDigitizedCpt(sampleRecord()), "S-1961-07");
    const { container } = render(<DigitizeDialog cptId="S-1961-07" onClose={() => {}} />);
    const svg = container.querySelector(".dig-svg")!;
    const count = () => container.querySelectorAll(".dig-marker-point").length;
    // In de test heeft het vlak geen afmeting: zoom 1, dus schermpixels zijn beeldpixels.
    fireEvent.mouseDown(svg, { button: 0, clientX: 300, clientY: 700 });
    fireEvent.mouseUp(svg, { button: 0, clientX: 300, clientY: 700 });
    expect(count()).toBe(5);
    fireEvent.contextMenu(container.querySelectorAll(".dig-marker-point")[4]);
    expect(count()).toBe(4);
    fireEvent.click(screen.getByRole("button", { name: "Ongedaan maken" }));
    expect(count()).toBe(5);
    fireEvent.click(screen.getByRole("button", { name: "Ongedaan maken" }));
    expect(count()).toBe(4);
    expect(screen.getByRole("button", { name: "Ongedaan maken" })).toBeDisabled();
    // Slepen verplaatst een punt en is ook ongedaan te maken.
    const first = container.querySelectorAll(".dig-marker-point")[0];
    fireEvent.mouseDown(first, { button: 0, clientX: 200, clientY: 50 });
    fireEvent.mouseMove(svg, { clientX: 260, clientY: 80 });
    fireEvent.mouseUp(svg, { button: 0, clientX: 260, clientY: 80 });
    expect(container.querySelectorAll(".dig-marker-point")[0].getAttribute("transform")).toContain("translate(260 80)");
    expect(count()).toBe(4);
    fireEvent.click(screen.getByRole("button", { name: "Ongedaan maken" }));
    expect(container.querySelectorAll(".dig-marker-point")[0].getAttribute("transform")).toContain("translate(200 50)");
  });

  it("vraagt om de verplichte herkomst en slaat daarna de bijgewerkte sondering op", () => {
    loadCptSnapshot(buildDigitizedCpt(sampleRecord()), "S-1961-07");
    const onClose = vi.fn();
    render(<DigitizeDialog cptId="S-1961-07" onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "4Gegevens" }));
    expect(screen.getByLabelText("Soort sondering")).toHaveValue("mechanical");
    const origin = screen.getByLabelText("Herkomst (verplicht)");
    fireEvent.change(origin, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "5Opslaan" }));
    expect(screen.getByText("Vul de herkomst in; die is verplicht.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sondering bijwerken" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "4Gegevens" }));
    fireEvent.change(screen.getByLabelText("Herkomst (verplicht)"), { target: { value: "gedigitaliseerd van rapport 77 d.d. 01-02-1958" } });
    fireEvent.change(screen.getByLabelText("Soort sondering"), { target: { value: "electrical" } });
    fireEvent.click(screen.getByRole("button", { name: "5Opslaan" }));
    fireEvent.click(screen.getByRole("button", { name: "Sondering bijwerken" }));
    expect(onClose).toHaveBeenCalled();
    const saved = useCptStore.getState().cpts.get("S-1961-07")!;
    expect(digitizedOf(saved)).toMatchObject({ origin: "gedigitaliseerd van rapport 77 d.d. 01-02-1958", coneKind: "electrical", step: 0.02 });
    // 0 tot 20 m op 0,02 m.
    expect(saved.points).toHaveLength(1001);
    expect(useCptStore.getState().documents).toHaveLength(1);
  });
});
