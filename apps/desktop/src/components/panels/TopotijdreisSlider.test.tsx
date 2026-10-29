import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import TopotijdreisSlider from "./TopotijdreisSlider";
afterEach(() => { cleanup(); vi.useRealTimers(); });
it("bewaart jaar en transparantie bij terugkeer naar de kaart", () => {
  vi.useFakeTimers();
  render(<TopotijdreisSlider />);
  fireEvent.click(screen.getByLabelText("Topotijdreis aan/uit"));
  fireEvent.change(screen.getByLabelText("Transparantie historische kaart"), { target: { value: "45" } });
  act(() => vi.advanceTimersByTime(250));
  cleanup();
  render(<TopotijdreisSlider />);
  expect(screen.getByLabelText("Topotijdreis aan/uit")).toBeChecked();
  expect(screen.getByLabelText("Transparantie historische kaart")).toHaveValue("45");
  expect(screen.getByLabelText("Jaartal historische kaart")).toHaveValue("29");
});
