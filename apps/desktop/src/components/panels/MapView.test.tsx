import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, fireEvent, screen } from "@testing-library/react";
import * as L from "leaflet";
import MapView from "./MapView";
import { useCptStore, addBroToActiveProject } from "../../store/useCptStore";
vi.mock("../../store/useCptStore", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../store/useCptStore")>(),
  addBroToActiveProject: vi.fn(async () => ({ id: "CPT" })),
}));
vi.mock("../../utils/pdokWfs", () => ({fetchBagPanden: vi.fn(async () => null), fetchKadasterPercelen: vi.fn(async () => null)}));
vi.mock("../../utils/platform", () => ({bro: {fetchCpts: vi.fn(async () => ["CPT1", "CPT2"].map(id => ({id, lat: 51.814, lon: 4.66, kind: "cpt", extra: {}}))), fetchBores: vi.fn(async () => [])}}));
describe("kaart bij tabwissels", () => {
  beforeEach(() => {
    vi.mocked(addBroToActiveProject).mockClear();
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    vi.useFakeTimers();
    useCptStore.setState({ documents: [], activeDocId: null, cpts: new Map(), lastMapView: null });
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
  it("herstelt viewport zonder document", () => {
    useCptStore.setState({ lastMapView: {lat: 52.2, lon: 5.3, zoom: 14} });
    const setView = vi.spyOn(L.Map.prototype, "setView");
    render(<MapView />);
    expect(setView).toHaveBeenCalledWith([52.2, 5.3], 14);
  });
  it("voegt meerdere gekozen BRO-sonderingen toe zonder tabwissel", async () => {
    const switchTab = vi.fn();
    window.addEventListener("ogs:ribbon-switch", switchTab);
    const view = render(<MapView />);
    await act(async () => { await Promise.resolve(); });
    for (const marker of Array.from(view.container.querySelectorAll(".bro-sondering-icon"))) {
      fireEvent.click(marker);
      fireEvent.click(screen.getByText("Selecteer / deselecteer voor toevoegen"));
    }
    expect(screen.getByText("2 BRO-sondering(en) geselecteerd")).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByText("Voeg selectie toe aan project")));
    expect(addBroToActiveProject).toHaveBeenNthCalledWith(1, "CPT1");
    expect(addBroToActiveProject).toHaveBeenNthCalledWith(2, "CPT2");
    expect(screen.queryByText("Voeg selectie toe aan project")).not.toBeInTheDocument();
    expect(switchTab).not.toHaveBeenCalled();
    window.removeEventListener("ogs:ribbon-switch", switchTab);
  });
  it("behoudt mislukte selectie zodat toevoegen opnieuw kan", async () => {
    vi.mocked(addBroToActiveProject).mockResolvedValueOnce({ id: "CPT1" } as Awaited<ReturnType<typeof addBroToActiveProject>>).mockRejectedValueOnce(new Error("Geen verbinding"));
    const view = render(<MapView />);
    await act(async () => { await Promise.resolve(); });
    for (const marker of Array.from(view.container.querySelectorAll(".bro-sondering-icon"))) {
      fireEvent.click(marker);
      fireEvent.click(screen.getByText("Selecteer / deselecteer voor toevoegen"));
    }
    await act(async () => fireEvent.click(screen.getByText("Voeg selectie toe aan project")));
    expect(screen.getByText("1 BRO-sondering(en) geselecteerd")).toBeInTheDocument();
    expect(screen.getByText(/1 toegevoegd.*Geen verbinding/)).toBeInTheDocument();
    expect(addBroToActiveProject).toHaveBeenCalledTimes(2);
  });
  it("houdt uitgeschakelde overlays uit na terugkeer", () => {
    const addTo = vi.spyOn(L.TileLayer.prototype, "addTo");
    render(<MapView />);
    act(() => window.dispatchEvent(new CustomEvent("ogs:layer-toggle", {detail: {view: "map", id: "luchtfoto-actueel", enabled: false}})));
    cleanup();
    addTo.mockClear();
    render(<MapView />);
    act(() => vi.advanceTimersByTime(1000));
    const urls = addTo.mock.instances.map(layer => (layer as unknown as {_url: string})._url);
    expect(urls.some(url => url?.includes("Actueel_ortho25"))).toBe(false);
  });
});
