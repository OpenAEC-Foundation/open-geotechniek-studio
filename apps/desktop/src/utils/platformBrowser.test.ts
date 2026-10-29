import { expect, it, vi } from "vitest";
import type { Cpt } from "../types/cpt";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(() => { throw new Error("Native runtime unavailable"); }) }));
import { cpt, reports, IS_TAURI } from "./platform";
import { invoke } from "@tauri-apps/api/core";
it("generates layers and report without touching native runtime", async () => {
    expect(IS_TAURI).toBe(false);
    const value: Cpt = { id: "A", metadata: { source_file: "a.gef" }, points: [{ depth: 0, qc: 8, rf: .7 }, { depth: 1, qc: 8, rf: .7 }] };
    expect((await cpt.detectLayers(value))[0].zone_number).toBe(6);
    const pdf = await reports.preview([value], { title: "Rapport", author: "", client: "", location: "", project_number: "", date: "2026-10-14" });
    expect(new TextDecoder().decode(pdf.subarray(0, 5))).toBe("%PDF-");
    expect(invoke).not.toHaveBeenCalled();
});
