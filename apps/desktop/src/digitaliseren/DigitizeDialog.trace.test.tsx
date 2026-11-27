// Het scherm "Sondering digitaliseren" met de lijn volgen: de keuze van de werkwijze bij de stap
// "punten", tekenen en wissen, en een sondering uit de eerdere werkwijze "uit scan" bijwerken.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { loadCptSnapshot, useCptStore } from "../store/useCptStore";
import { DigitizeDialog, DigitizeHost } from "./DigitizeDialog";
import { migrateScanCpt } from "./migrate";
import { buildDigitizedCpt, digitizedOf } from "./record";
import { openDigitizer } from "./store";
import { sampleRecord } from "./__fixtures__/sample";
import { scanCpt } from "./__fixtures__/scanCpt";

const reset = () => useCptStore.setState({ documents: [], activeDocId: null, cpts: new Map(), activeCptId: null });
const pressed = (name: string) => screen.getByRole("button", { name }).getAttribute("aria-pressed");

describe("DigitizeDialog: lijn volgen en punten aanklikken in één scherm", () => {
  beforeEach(reset);
  afterEach(() => { cleanup(); reset(); vi.restoreAllMocks(); });

  it("beide lintknoppen openen hetzelfde scherm; 'Uit scan' begint met de lijn volgen", () => {
    render(<DigitizeHost />);
    fireEvent(window, new CustomEvent("ogs:open-digitizer", { detail: {} }));
    expect(screen.getByRole("heading", { name: "Sondering digitaliseren" })).toBeInTheDocument();
    cleanup();
    render(<DigitizeHost />);
    act(() => { openDigitizer(undefined, "trace"); });
    expect(screen.getAllByRole("heading", { name: "Sondering digitaliseren" })).toHaveLength(1);
  });

  it("biedt bij de stap punten de keuze tussen de lijn volgen en punten aanklikken", () => {
    loadCptSnapshot(buildDigitizedCpt(sampleRecord()), "S-1961-07");
    const { container } = render(<DigitizeDialog cptId="S-1961-07" onClose={() => {}} />);
    expect(pressed("Punten aanklikken")).toBe("true");
    expect(container.querySelectorAll(".dig-marker-point")).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "Lijn automatisch volgen" }));
    expect(pressed("Lijn automatisch volgen")).toBe("true");
    // De aangeklikte punten verdwijnen uit beeld; de gereedschappen voor de lijn komen ervoor in de plaats.
    expect(container.querySelectorAll(".dig-marker-point")).toHaveLength(0);
    for (const name of ["Lijn volgen", "Tekenen", "Wissen", "Lijn wissen"]) expect(screen.getByRole("button", { name })).toBeInTheDocument();
    expect(screen.getByTestId("dig-count")).toHaveTextContent("Lijn over 0 beeldrijen voor qc");
    // Zonder lijn kan er niet worden opgeslagen.
    fireEvent.click(screen.getByRole("button", { name: "5Opslaan" }));
    expect(screen.getByText("Volg of teken eerst de qc-lijn.")).toBeInTheDocument();
    // Terug naar punten aanklikken: de punten staan er nog.
    fireEvent.click(screen.getByRole("button", { name: "3Punten" }));
    fireEvent.click(screen.getByRole("button", { name: "Punten aanklikken" }));
    expect(container.querySelectorAll(".dig-marker-point")).toHaveLength(4);
  });

  it("tekent en wist de lijn met de muis, met ongedaan maken, en slaat haar op", () => {
    loadCptSnapshot(buildDigitizedCpt(sampleRecord()), "S-1961-07");
    const onClose = vi.fn();
    const { container } = render(<DigitizeDialog cptId="S-1961-07" onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Lijn automatisch volgen" }));
    fireEvent.click(screen.getByRole("button", { name: "Tekenen" }));
    const svg = container.querySelector(".dig-svg")!;
    // In de test heeft het vlak geen afmeting: zoom 1, dus schermpixels zijn beeldpixels.
    // Rechte lijn op 10 MPa (x = 300) van 0 m (y = 50) tot 4 m (y = 250).
    fireEvent.mouseDown(svg, { button: 0, clientX: 300, clientY: 50 });
    fireEvent.mouseMove(svg, { clientX: 300, clientY: 150 });
    fireEvent.mouseMove(svg, { clientX: 300, clientY: 250 });
    fireEvent.mouseUp(svg, { button: 0, clientX: 300, clientY: 250 });
    expect(screen.getByTestId("dig-count")).toHaveTextContent("Lijn over 201 beeldrijen voor qc");
    expect(screen.getByTestId("dig-trace-qc")).toBeInTheDocument();
    // Wissen van 3 m (y = 200) tot voorbij het eind.
    fireEvent.click(screen.getByRole("button", { name: "Wissen" }));
    fireEvent.mouseDown(svg, { button: 0, clientX: 400, clientY: 201 });
    fireEvent.mouseMove(svg, { clientX: 400, clientY: 260 });
    fireEvent.mouseUp(svg, { button: 0, clientX: 400, clientY: 260 });
    expect(screen.getByTestId("dig-count")).toHaveTextContent("Lijn over 151 beeldrijen voor qc");
    fireEvent.click(screen.getByRole("button", { name: "Ongedaan maken" }));
    expect(screen.getByTestId("dig-count")).toHaveTextContent("Lijn over 201 beeldrijen voor qc");
    expect(screen.getByText("Meetreeks: 21 waarden van 0.00 tot 4.00 m onder maaiveld.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "5Opslaan" }));
    fireEvent.click(screen.getByRole("button", { name: "Sondering bijwerken" }));
    expect(onClose).toHaveBeenCalled();
    const saved = useCptStore.getState().cpts.get("S-1961-07")!;
    expect(digitizedOf(saved)!.qc.method).toBe("trace");
    // De aangeklikte punten blijven bewaard voor als de gebruiker terug wil.
    expect(digitizedOf(saved)!.qc.points).toHaveLength(4);
    expect(saved.points).toHaveLength(21);
    expect(saved.points.every((p) => p.qc === 10)).toBe(true);
  });

  it("opent een sondering uit de eerdere werkwijze op een leeg blad en werkt haar bij", () => {
    loadCptSnapshot(migrateScanCpt(scanCpt()), "S-12");
    const onClose = vi.fn();
    const { container } = render(<DigitizeDialog cptId="S-12" onClose={onClose} />);
    expect(screen.getByRole("heading", { name: "Gedigitaliseerde sondering S-12 bijwerken" })).toBeInTheDocument();
    expect(pressed("Lijn automatisch volgen")).toBe("true");
    expect(screen.getByTestId("dig-count")).toHaveTextContent("Lijn over 101 beeldrijen voor qc");
    expect(screen.getByText("Meetreeks: 101 waarden van 1.00 tot 3.00 m onder maaiveld.")).toBeInTheDocument();
    // Er is geen scan: volgen kan niet, tekenen wel.
    expect(screen.getByText("Er is geen scan om te volgen. Tekenen en wissen kan wel.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "1Onderlegger" }));
    expect(screen.getByText(/de scan en de ijking zijn daarbij niet bewaard/)).toBeInTheDocument();

    // Bijtekenen: 2 MPa (x = 100) van 3,02 m (rij 151) tot 4,00 m (rij 200).
    fireEvent.click(screen.getByRole("button", { name: "3Punten" }));
    fireEvent.click(screen.getByRole("button", { name: "Tekenen" }));
    const svg = container.querySelector(".dig-svg")!;
    fireEvent.mouseDown(svg, { button: 0, clientX: 100, clientY: 151 });
    fireEvent.mouseMove(svg, { clientX: 100, clientY: 200 });
    fireEvent.mouseUp(svg, { button: 0, clientX: 100, clientY: 200 });
    expect(screen.getByTestId("dig-count")).toHaveTextContent("Lijn over 151 beeldrijen voor qc");

    fireEvent.click(screen.getByRole("button", { name: "4Gegevens" }));
    expect(screen.getByLabelText("Soort sondering")).toHaveValue("unknown");
    fireEvent.click(screen.getByRole("button", { name: "5Opslaan" }));
    fireEvent.click(screen.getByRole("button", { name: "Sondering bijwerken" }));
    expect(onClose).toHaveBeenCalled();
    const saved = useCptStore.getState().cpts.get("S-12")!;
    // Het bestaande deel is ongewijzigd; het bijgetekende deel komt erachter.
    expect(saved.points.slice(0, 101)).toEqual(scanCpt().points);
    expect(saved.points).toHaveLength(151);
    expect(saved.points[150]).toEqual({ depth: 4, depth_nap: -4.4, qc: 2 });
    expect(digitizedOf(saved)).toMatchObject({ coneKind: "unknown", image: { synthetic: true } });
    expect(useCptStore.getState().documents).toHaveLength(1);
  });
});
