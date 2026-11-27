import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import ReportPreview from "./ReportPreview";
import { newProjectDocument, useCptStore } from "../../store/useCptStore";
import { getCurrentReportSections } from "../../store/reportSectionsState";
import type { Cpt } from "../../types/cpt";

const preview = vi.hoisted(() => vi.fn(async () => new Uint8Array([37, 80, 68, 70])));
vi.mock("../../utils/platform", () => ({ IS_TAURI: false, reports: { preview, open: vi.fn() } }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null) }));

const cpt: Cpt = { id: "S1", metadata: { source_file: "S1.gef", date: "2026-10-28" }, points: [{ depth: 0, qc: 1 }, { depth: 15, qc: 12 }] };

beforeEach(() => {
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:rapport", revokeObjectURL: () => {} }));
  useCptStore.setState({ documents: [], activeDocId: null, cpts: new Map(), activeCptId: null });
  newProjectDocument();
  useCptStore.getState().setProjectMeta({ client: "Gemeente Voorbeeld", location: "Kadeweg 4 te Ergens" });
  const id = useCptStore.getState().activeDocId;
  useCptStore.setState((s) => ({ cpts: new Map([[cpt.id, cpt]]), documents: s.documents.map((d) => (d.id === id && d.kind === "project" ? { ...d, cpts: new Map([[cpt.id, cpt]]) } : d)) }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

it("vult met Voorbeeldtekst een tekst in met de projectgegevens en bewaart die in het project", async () => {
  await act(async () => { render(<ReportPreview />); });
  const box = screen.getByRole("textbox", { name: "Inleiding" }) as HTMLTextAreaElement;
  expect(box.value).toBe("");
  await act(async () => { fireEvent.click(screen.getAllByRole("button", { name: "Voorbeeldtekst" })[0]); });
  const text = useCptStore.getState().projectMeta.report_texts?.introduction ?? "";
  expect(text).toContain("In opdracht van Gemeente Voorbeeld is op 28-10-2026 ter plaatse van Kadeweg 4 te Ergens 1 sondering uitgevoerd");
  expect(box.value).toBe(text);
  // Een ingevuld vak wordt niet zomaar overschreven.
  expect(screen.getAllByRole("button", { name: "Voorbeeldtekst" })[0]).toBeDisabled();
});

it("bewaart een getypte tekst bij het verlaten van het vak en geeft de vinkjes door", async () => {
  await act(async () => { render(<ReportPreview />); });
  const box = screen.getByRole("textbox", { name: "Grondwaterstand" });
  await act(async () => { fireEvent.change(box, { target: { value: "Grondwater op 1,20 m beneden maaiveld." } }); });
  expect(useCptStore.getState().projectMeta.report_texts).toBeUndefined();
  await act(async () => { fireEvent.blur(box); });
  expect(useCptStore.getState().projectMeta.report_texts).toEqual({ groundwater: "Grondwater op 1,20 m beneden maaiveld." });

  expect(screen.getByRole("checkbox", { name: "Teksten" })).toBeChecked();
  const testReport = screen.getByRole("checkbox", { name: "Testrapport" });
  expect(testReport).not.toBeChecked();
  await act(async () => { fireEvent.click(testReport); });
  expect(getCurrentReportSections().testReport).toBe(true);
  // De achtergrondvoorvertoning van het project roept dezelfde functie aan zonder onderdelenkeuze.
  const calls = preview.mock.calls as unknown as Array<[unknown, unknown, { testReport?: boolean } | undefined]>;
  expect(calls.some((call) => call[2]?.testReport === true)).toBe(true);
});
