import { describe, expect, it } from "vitest";
import type { Cpt, ProjectMeta } from "../types/cpt";
import { generateIfcContent } from "./browserIfc";
import { parseProjectFile } from "../types/projectFile";

const project: ProjectMeta = { title: "Proef 'A'", client: "Opdrachtgever", location: "Locatie", project_number: "P1", author: "Auteur", date: "2026-10-14" };
const cpt: Cpt = { id: "S'1", metadata: { source_file: "test.gef" }, position: { x_rd: 120000, y_rd: 450000, z_nap: -1 }, points: [{ depth: 1, qc: 4, fs: 0.04, rf: 1 }, { depth: 2, u2: 0.02 }] };

describe("browser IFC-uitwisseling", () => {
  it("weigert de schema-ongeldige STEP-export", () => {
    expect(() => generateIfcContent([cpt], project, "ifc4x3")).toThrow("uitgeschakeld");
  });
  it("IFCX behoudt alle meetkanalen en kan opnieuw als project worden geopend", () => {
    const enriched = {...cpt,metadata:{...cpt.metadata,extra:{"ogs:validation":"diagnostic fixture"}},points:cpt.points.map(p=>({...p,parameters:{unknown:123}}))};
    const output = generateIfcContent([enriched], project, "ifcx");
    const result = parseProjectFile(output);
    expect(result.project.title).toBe(project.title);
    expect(result.cpts?.[0].id).toBe(cpt.id);
    expect(result.cpts?.[0].metadata.extra?.["ogs:validation"]).toBe("diagnostic fixture");
    expect(result.cpts?.[0].points[0].parameters?.unknown).toBe(123);
    expect(result.cpts?.[0].position).toEqual(cpt.position);
    expect(result.cpts?.[0].points[1]).toMatchObject({ depth: 2, qc: null, u2: 0.02 });
  });
  it("geeft dezelfde deterministische project-ID bij herhaalde snapshots", () => {
    const a=JSON.parse(generateIfcContent([cpt],project,"ifcx"));
    const b=JSON.parse(generateIfcContent([cpt],project,"ifcx"));
    expect(a.objects[0].id).toBe(b.objects[0].id);
    expect(a.header.note).toContain("not a standard IFC model");
  });
});
