import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import IfcxPreviewDialog from "./IfcxPreviewDialog";
import * as cptStoreModule from "../../store/useCptStore";
import { useCptStore, serializeActiveProject, type ProjectDocument } from "../../store/useCptStore";
import { serializeActiveProject as realSerialize } from "../../store/projectSerialization";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(() => { throw new Error("Geen Tauri-runtime"); }) }));
vi.mock("../../utils/platform", () => ({ IS_TAURI: false }));


function project(id: string): ProjectDocument {
  return { kind: "project", id, title: id, meta: { title: id, client: "", location: "", author: "", project_number: "", date: "2026-10-14" },
    cpts: new Map(), bores: new Map(), activeCptId: null,
    savedLayout: { deliverable: { name: "Bewaarde tekening" } } };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(cptStoreModule, "serializeActiveProject").mockImplementation(realSerialize);
  useCptStore.setState({ documents: [project("A"), project("B")], activeDocId: "A" });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("projectpreview zonder Tauri", () => {
  it("toont de gedeelde browseropslag inclusief huidig schema en aanvullende secties", async () => {
    const { container } = render(<IfcxPreviewDialog open onClose={() => {}} />);
    await waitFor(() => expect(container.querySelector(".ifcx-preview-content")).not.toBeNull());
    const preview = JSON.parse(container.querySelector(".ifcx-preview-content")!.textContent!);
    expect(preview.header.schema).toBe("ifcgis-0.4");
    expect(preview.project.title).toBe("A");
    expect(preview.deliverable.name).toBe("Bewaarde tekening");
    expect(preview.calculations).toEqual([]);
    expect(invoke).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Kopieer JSON" })).toBeEnabled();
  });
  it("negeert een oud async resultaat na wisselen naar een ander project", async () => {
    let resolveOld!: (text: string) => void;
    vi.mocked(serializeActiveProject).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    const { container } = render(<IfcxPreviewDialog open onClose={() => {}} />);
    act(() => useCptStore.setState({ activeDocId: "B" }));
    await waitFor(() => expect(container.querySelector(".ifcx-preview-content")?.textContent).toContain('"title": "B"'));
    await act(async () => { resolveOld("oud resultaat"); });
    expect(container.querySelector(".ifcx-preview-content")?.textContent).toContain('"title": "B"');
    expect(screen.queryByText("oud resultaat")).toBeNull();
  });
  it("negeert een fout van een gesloten preview bij opnieuw openen", async () => {
    let rejectOld!: (error: Error) => void;
    vi.mocked(serializeActiveProject).mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectOld = reject; }));
    const view = render(<IfcxPreviewDialog open onClose={() => {}} />);
    view.rerender(<IfcxPreviewDialog open={false} onClose={() => {}} />);
    view.rerender(<IfcxPreviewDialog open onClose={() => {}} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Kopieer JSON" })).toBeEnabled());
    await act(async () => { rejectOld(new Error("oude fout")); });
    expect(screen.queryByText("oude fout")).toBeNull();
  });
});
