import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useStudioMcp } from "./useStudioMcp";
import { StudioMcpIndicator, type StudioMcpStatus } from "./StudioMcpIndicator";
import { useCptStore } from "../store/useCptStore";

const callbacks = vi.hoisted(() => new Map<string, (event: { payload: unknown }) => void>());
vi.mock("../utils/platform", () => ({ IS_TAURI: true }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
const ready: StudioMcpStatus = { available: true, connectedClients: 0, clientNames: [], activeTool: null, lastActivity: null, error: null };
const changeView = vi.fn();
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); callbacks.clear();
  vi.mocked(invoke).mockImplementation(async name => name === "get_studio_mcp_status" ? ready : null);
  vi.mocked(listen).mockImplementation(async (name, callback) => { callbacks.set(name, callback as (event: { payload: unknown }) => void); return () => { callbacks.delete(name); }; });
  useCptStore.setState({ documents: [], activeDocId: null, cpts: new Map(), activeCptId: null });
});
afterEach(async () => { await act(async () => cleanup()); vi.clearAllTimers(); vi.useRealTimers(); });

it("registreert de ontvanger vóór ready en bevestigt wijzigingen in de echte documentstore", async () => {
  const { unmount } = renderHook(() => useStudioMcp(changeView));
  await act(async () => {});
  expect(callbacks.has("ogs:mcp-request")).toBe(true);
  expect(invoke).toHaveBeenCalledWith("studio_mcp_ready", { ready: true });
  await act(async () => callbacks.get("ogs:mcp-request")!({ payload: { id: "r1", tool: "studio_new_project", arguments: { title: "MCP project" } } }));
  expect(useCptStore.getState().projectMeta.title).toBe("MCP project");
  expect(invoke).toHaveBeenCalledWith("complete_studio_mcp_request", expect.objectContaining({ id: "r1", error: null, result: expect.objectContaining({ projectMeta: expect.objectContaining({ title: "MCP project" }) }) }));
  await act(async () => unmount());
  expect(invoke).toHaveBeenCalledWith("studio_mcp_ready", { ready: false });
  expect(callbacks.has("ogs:mcp-request")).toBe(false);
});
it("beantwoordt een ongeldige opdracht met een fout zonder een document aan te maken", async () => {
  renderHook(() => useStudioMcp(changeView)); await act(async () => {});
  await act(async () => callbacks.get("ogs:mcp-request")!({ payload: { id: "r2", tool: "run_script", arguments: {} } }));
  expect(useCptStore.getState().documents).toHaveLength(0);
  expect(invoke).toHaveBeenCalledWith("complete_studio_mcp_request", { id: "r2", result: null, error: expect.stringContaining("Onbekende") });
});
it("activeert MCP niet als het venster tijdens de luisterregistratie sluit", async () => {
  let complete!: (stop: () => void) => void;
  const stop = vi.fn();
  vi.mocked(listen).mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  const { unmount } = renderHook(() => useStudioMcp(changeView)); unmount();
  await act(async () => complete(stop));
  expect(stop).toHaveBeenCalled();
  expect(invoke).not.toHaveBeenCalledWith("studio_mcp_ready", { ready: true });
});
it("laat een oud statusantwoord een nieuwe MCP-verbinding niet overschrijven", async () => {
  let complete!: (value: StudioMcpStatus) => void;
  vi.mocked(invoke).mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  render(<StudioMcpIndicator />); await act(async () => {});
  await act(async () => callbacks.get("ogs:mcp-status")!({ payload: { ...ready, connectedClients: 1, clientNames: ["Rekenassistent"] } }));
  expect(screen.getByRole("status")).toHaveTextContent("MCP verbonden");
  await act(async () => complete(ready));
  expect(screen.getByRole("status")).toHaveTextContent("MCP verbonden");
  vi.mocked(invoke).mockRejectedValueOnce(new Error("Native verbinding weg"));
  await act(async () => { vi.advanceTimersByTime(5000); });
  expect(screen.getByRole("status")).toHaveTextContent("MCP fout");
});
