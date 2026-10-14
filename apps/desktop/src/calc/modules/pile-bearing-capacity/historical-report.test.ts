import { describe, expect, it } from "vitest";
import { generatePileReport, type PileReportInputs } from "./parts/pile-report-pdf";
import { computeMultiCptSummary } from "./parts/multi-cpt-summary";
import { computePile } from "./compute";
import fixture from "./__fixtures__/sondering-3bm-cgeo1.json";
import type { PileInput } from "./types";

function report(): PileReportInputs {
  const input: PileInput = { ...fixture.input as PileInput, standard: "nen-6743-1991", pileTypeId: "concrete-prefab-prestressed-driven", gammaM: 1.25 };
  const result = computePile(input, { id: "synthetisch", metadata: { source_file: "synthetisch" }, points: [{ depth: 0, qc: 5 }, { depth: 40, qc: 5 }] });
  return {
    project: { number: "test", description: "Historisch profiel", norm: "NEN 6743:1991", date: "2026-10-06", author: "Test" },
    sonderingen: [{ name: "S1", input, result }],
    summary: computeMultiCptSummary({ cases: [{ cptId: "S1", rbCalMax: result.base.rbCalMax, rsCalMax: result.shaft.rsCalMax, rcCal: result.summary.rcCal }], gammaM: input.gammaM, nEd: input.nEd }),
    pileTypeName: "Prefab betonpaal", factors: { alphaP: 1, alphaS: .01, alphaT: 0 },
  };
}

describe("historische rapportage", () => {
  it("rapporteert historische draagkracht zonder moderne statistische eindanalyse", () => {
    const bytes = generatePileReport(report());
    const text = new TextDecoder("latin1").decode(bytes);
    expect(text).toContain("Historische draagkracht");
    expect(text).not.toContain("Tabel A.10b");
    expect(text.includes("7.3.2.2")).toBe(false);
  });
  it("weigert gemengde normen in één rapport", () => {
    const args = report();
    args.sonderingen.push({ ...args.sonderingen[0], input: { ...args.sonderingen[0].input, standard: "nen-9997-2017" } });
    expect(() => generatePileReport(args)).toThrow(/norm/i);
  });
  it("weigert nog niet geverifieerde historische paalgroepen", () => {
    const item = { cptId: "S", rbCalMax: 100, rsCalMax: 100, rcCal: 200 };
    expect(() => computeMultiCptSummary({ cases: [item, item], gammaM: 1.2, nEd: 100, standard: "nen-6743-2006" })).toThrow(/paalgroep/);
  });
});
