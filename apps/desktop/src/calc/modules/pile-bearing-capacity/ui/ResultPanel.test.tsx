import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ResultPanel } from "./ResultPanel";
import { computePile } from "../compute";
import fixture from "../__fixtures__/sondering-3bm-cgeo1.json";
import type { PileInput } from "../types";
import { useCptStore } from "../../../../store/useCptStore";
import { downloadPdf } from "../../../../utils/downloadPdf";

vi.mock("../../../../utils/downloadPdf", () => ({ downloadPdf: vi.fn(async () => true) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("neemt projectgegevens mee in de uitdraai en vermeldt concept op iedere pagina", async () => {
  const input = { ...fixture.input, cptId: "S-uitdraai" } as PileInput;
  const cpt = { id: input.cptId!, metadata: { source_file: "S-uitdraai.gef" }, points: [{ depth: 0, qc: 10, rf: 1 }, { depth: 40, qc: 10, rf: 1 }] };
  useCptStore.setState({ cpts: new Map([[cpt.id,cpt]]), projectMeta: {
    title: "Uitdraai project", project_number: "P-uitdraai", author: "Opsteller", date: "2026-10-14", client: "", location: "",
  } });
  render(<ResultPanel input={input} result={computePile(input,cpt)} />);
  fireEvent.click(screen.getByRole("button", { name: /Download PDF-rapport/ }));
  await waitFor(() => expect(downloadPdf).toHaveBeenCalledOnce());
  const text = new TextDecoder("latin1").decode(vi.mocked(downloadPdf).mock.calls[0][1]);
  for (const value of ["Uitdraai project", "P-uitdraai", "Opsteller", "SAMENVATTING"])
    expect(text.includes(value),value).toBe(true);
  const pages = Number(text.match(/\/Count (\d+)/)?.[1]);
  expect(pages).toBeGreaterThan(1);
  expect((text.match(/CONCEPT/g) ?? []).length).toBeGreaterThanOrEqual(pages);
  expect((text.match(/re\s+W\s+n/g) ?? []).length).toBeGreaterThanOrEqual(2);
});
