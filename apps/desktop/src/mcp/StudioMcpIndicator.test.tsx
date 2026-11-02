import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { StudioMcpStatusView, type StudioMcpStatus } from "./StudioMcpIndicator";
afterEach(cleanup);
const available: StudioMcpStatus = { available: true, connectedClients: 0, clientNames: [], activeTool: null, lastActivity: null, error: null };
it("toont beschikbaar zonder ten onrechte een verbinding te melden", () => {
  render(<StudioMcpStatusView status={available} desktop />);
  expect(screen.getByRole("status")).toHaveTextContent("MCP beschikbaar");
  expect(screen.queryByText("MCP verbonden")).toBeNull();
});
it("toont een echte verbinding en de actieve opdracht", () => {
  const { rerender } = render(<StudioMcpStatusView status={{ ...available, connectedClients: 1, clientNames: ["Rekenassistent"] }} desktop />);
  expect(screen.getByRole("status")).toHaveTextContent("MCP verbonden");
  expect(screen.getByRole("status").title).toContain("Rekenassistent");
  rerender(<StudioMcpStatusView status={{ ...available, connectedClients: 1, activeTool: "studio_save_project" }} desktop />);
  expect(screen.getByRole("status")).toHaveTextContent("MCP bezig");
  expect(screen.getByRole("status")).toHaveTextContent("Project opslaan");
  expect(screen.getByRole("status").title).toContain("Project opslaan");
});
it("toont na verbreken weer beschikbaar en toont fouten expliciet", () => {
  const { rerender } = render(<StudioMcpStatusView status={{ ...available, connectedClients: 1 }} desktop />);
  rerender(<StudioMcpStatusView status={available} desktop />);
  expect(screen.getByRole("status")).toHaveTextContent("MCP beschikbaar");
  rerender(<StudioMcpStatusView status={{ ...available, available: false, error: "Verbinding verbroken" }} desktop />);
  expect(screen.getByRole("status")).toHaveTextContent("MCP fout");
  expect(screen.getByRole("status").title).toContain("Verbinding verbroken");
});
it("meldt in de browser geen desktop-MCP-verbinding", () => {
  render(<StudioMcpStatusView status={available} desktop={false} />);
  expect(screen.getByRole("status")).toHaveTextContent("MCP niet beschikbaar");
});
it("blijft de werkelijke uitvoering tonen als de antwoordtermijn is verstreken", () => {
  render(<StudioMcpStatusView status={{ ...available, connectedClients: 1, activeTool: "studio_open_file", error: "De antwoordtermijn is verstreken; uitvoering loopt nog" }} desktop />);
  expect(screen.getByRole("status")).toHaveTextContent("MCP bezig · Bestand openen");
  expect(screen.getByRole("status").title).toContain("uitvoering loopt nog");
});
