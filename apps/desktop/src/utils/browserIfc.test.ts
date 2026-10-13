import { describe, expect, it } from "vitest";
import type { Cpt, ProjectMeta } from "../types/cpt";
import { generateIfcContent } from "./browserIfc";
import { parseProjectFile } from "../types/projectFile";

const project: ProjectMeta = { title: "Proef 'A'", client: "Opdrachtgever", location: "Locatie", project_number: "P1", author: "Auteur", date: "2026-10-14" };
const cpt: Cpt = { id: "S'1", metadata: { source_file: "test.gef" }, position: { x_rd: 120000, y_rd: 450000, z_nap: -1 }, points: [{ depth: 1, qc: 4, fs: 0.04, rf: 1 }, { depth: 2, u2: 0.02 }] };

describe("browser IFC-uitwisseling", () => {
  it("schrijft STEP-entiteiten met RD/NAP plaatsing, meetreeksen en oplosbare verwijzingen", () => {
    const output = generateIfcContent([cpt, { ...cpt, id: "S2" }], project, "ifc4x3");
    expect(output).toContain("IFCPROJECT('");
    expect(output).toContain("'Proef ''A'''");
    expect(output).toContain("'S''1'");
    expect(output).toContain("IFCCARTESIANPOINT((120000.000,450000.000,-1.000))");
    expect(output).toContain("IFCPRESSUREMEASURE(4.0000),$");
    expect(output.match(/IFCBUILDINGELEMENTPROXY/g)).toHaveLength(2);
    const ids = [...output.matchAll(/^#(\d+) = /gm)].map(match => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const reference of output.matchAll(/#(\d+)/g)) expect(ids).toContain(reference[1]);
    expect(output).toMatch(/END-ISO-10303-21;\n$/);
  });
  it("IFCX behoudt alle meetkanalen en kan opnieuw als project worden geopend", () => {
    const output = generateIfcContent([cpt], project, "ifcx");
    const result = parseProjectFile(output);
    expect(result.project.title).toBe(project.title);
    expect(result.cpts?.[0].id).toBe(cpt.id);
    expect(result.cpts?.[0].position).toEqual(cpt.position);
    expect(result.cpts?.[0].points[1]).toMatchObject({ depth: 2, qc: null, u2: 0.02 });
  });
  it("gebruikt dezelfde deterministische object-ID in beide formaten", () => {
    const json = JSON.parse(generateIfcContent([cpt], project, "ifcx"));
    const step = generateIfcContent([cpt], project, "ifc4x3");
    expect(step).toContain(`IFCPROJECT('${json.objects[0].id}'`);
    expect(step).toContain(`IFCBUILDINGELEMENTPROXY('${json.objects[2].guid}'`);
    expect(json.header.note).toContain("not schema-valid");
  });
});
