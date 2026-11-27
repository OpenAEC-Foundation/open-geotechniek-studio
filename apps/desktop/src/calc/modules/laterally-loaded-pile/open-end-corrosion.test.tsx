import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LateralCorrosion } from "./LateralCorrosion";
import type { LateralInput } from "./compute";

const tube = { kind: "steel-tube", diameterMm: 406.4, wallMm: 10 } as unknown as LateralInput["section"];

describe("afroesting bij een open buis", () => {
  it("stelt bij een open buis 2 kanten voor zolang er niets is ingevuld", () => {
    render(<LateralCorrosion input={{ section: tube, openEnd: true } as LateralInput} />);
    fireEvent.click(screen.getByText("Afroesting"));
    expect((screen.getByLabelText("Aangetast") as HTMLSelectElement).value).toBe("2");
  });
  it("houdt bij een gesloten buis 1 kant en volgt altijd een eigen keuze", () => {
    const { unmount } = render(<LateralCorrosion input={{ section: tube } as LateralInput} />);
    fireEvent.click(screen.getByText("Afroesting"));
    expect((screen.getByLabelText("Aangetast") as HTMLSelectElement).value).toBe("1");
    unmount();
    const onChange = vi.fn();
    render(<LateralCorrosion input={{ section: tube, openEnd: true, corrosion: { sides: 1 } } as unknown as LateralInput} onChange={onChange} />);
    fireEvent.click(screen.getByText("Afroesting"));
    expect((screen.getByLabelText("Aangetast") as HTMLSelectElement).value).toBe("1");
  });
});
