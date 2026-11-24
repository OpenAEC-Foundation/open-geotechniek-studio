import { expect, it } from "vitest";
import { buildPilePlanExport, pilePlanIds } from "./pile-plan-export";
import { computeCapacityMatrix } from "./capacity-table";
import { pileBearingCapacityModule } from "./module";
import type { PileInput } from "./types";
import type { Cpt } from "../../../types/cpt";

const cpt = (id: string, qc: number, pos?: { x_rd: number; y_rd: number }): Cpt => ({
  id, metadata: { source_file: id, ground_level_nap: 0 }, position: pos,
  points: Array.from({ length: 151 }, (_, i) => ({ depth: i * 0.1, depth_nap: -i * 0.1, qc })),
});
const cpts = new Map([
  ["DKM101", cpt("DKM101", 10, { x_rd: 155000.1234, y_rd: 463000.5 })],
  ["DKM102", cpt("DKM102", 15, { x_rd: 155020, y_rd: 463010 })],
  ["DKM103", cpt("DKM103", 12)],
]);
const base = pileBearingCapacityModule.defaultInput({ cpts, activeCptId: "DKM101", projectMeta: { title: "", client: "", location: "", project_number: "", author: "", date: "" } }) as PileInput;

it("geeft elke sondering een numerieke ID: de cijfers aan het eind, anders een volgnummer", () => {
  expect([...pilePlanIds(["DKM101", "DKM102"]).values()]).toEqual([101, 102]);
  expect([...pilePlanIds(["S1", "T1"]).values()]).toEqual([1, 2]);
  expect([...pilePlanIds(["CPT000000012345", "CPT000000012346"]).values()]).toEqual([12345, 12346]);
  expect([...pilePlanIds(["Noord", "Zuid"]).values()]).toEqual([1, 2]);
  expect([...pilePlanIds(["A0", "B5"]).values()]).toEqual([1, 2]);
});

it("schrijft de twee bestanden volgens het contract van Pile Plan Studio", () => {
  const m = computeCapacityMatrix(base, cpts, { cptIds: ["DKM101", "DKM102", "DKM103"], toeNaps: [-13, -14.25], sizesMm: [220, 290], targetKn: { minKn: 100, maxKn: 200 } });
  const out = buildPilePlanExport(m, cpts);
  expect(out.cptsCsv).toBe("ID,X,Y\n101,155000123,463000500\n102,155020000,463010000\n");
  const lines = out.adviceCsv.trim().split("\n");
  expect(lines[0]).toBe("CPT ID,Tip,Size,FRD");
  // 2 sonderingen met positie × 2 maten × 2 niveaus
  expect(lines).toHaveLength(1 + 8);
  expect(lines[1]).toMatch(/^101,-13\.000,220,\d+\.\d$/);
  expect(lines.some((l) => l.startsWith("102,-14.250,290,"))).toBe(true);
  const rc = m.cpts[1].cells[1][0].result.summary.rcNetD;
  expect(lines).toContain(`102,-13.000,290,${(Math.round(rc * 10) / 10).toFixed(1)}`);
  expect(out.ids).toEqual([{ cptId: "DKM101", id: 101 }, { cptId: "DKM102", id: 102 }]);
  expect(out.noPosition).toEqual(["DKM103"]);
  expect(out.rows).toBe(8);
  expect(out.missing).toEqual([]);
});

it("laat een ontbrekende weerstand leeg in plaats van nul", () => {
  // −40 m ligt onder het einde van de sondering (15 m): niet te berekenen
  const m = computeCapacityMatrix(base, cpts, { cptIds: ["DKM101"], toeNaps: [-13, -40], sizesMm: [220], targetKn: { minKn: 100, maxKn: 200 } });
  const out = buildPilePlanExport(m, cpts);
  expect(out.adviceCsv.trim().split("\n")[2]).toBe("101,-40.000,220,");
  expect(out.missing).toHaveLength(1);
  expect(out.missing[0]).toMatchObject({ cptId: "DKM101", sizeMm: 220, toeNap: -40 });
  expect(out.rows).toBe(1);
});
