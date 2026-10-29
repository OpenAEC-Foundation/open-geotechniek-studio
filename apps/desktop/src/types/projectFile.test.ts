import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseGef } from "./gefParser";
import { parseProjectFile, isProjectFile, parseCptSnapshot, readJson } from "./projectFile";
import { openContentByFilename, newProjectDocument, useCptStore, serializeActiveProject, addCptToActiveProject } from "../store/useCptStore";

vi.mock("../utils/platform", () => ({ IS_TAURI: false, cpt: { parse: async (text: string, name: string) =>
  name.endsWith(".gef") ? parseGef(text, name) : parseCptSnapshot(text) } }));

const gef = `#GEFID=1,1,0
#TESTID=S-regressie
#COLUMNINFO=1,m,diepte,1
#COLUMNINFO=2,MPa,qc,2
#EOH=
0.1 2.5
0.2 3.5`;
const cpt = parseGef(gef, "sondering.gef");
const project = { title: "GEF-project", client: "", location: "", author: "", project_number: "", date: "2026-10-14" };
const payload = { header: { schema: "ifcgis-0.4" }, project, cpts: [cpt], bores: [], calculations: [] };
const ifcx = JSON.stringify({ data: [{ type: "IfcGeotechnicalStratum", description: "x".repeat(8000) }], header: { schemaIdentifiers: ["IFC4X3_ADD2"], metadata: { openGeoStudio: payload } } });

beforeEach(() => { vi.useFakeTimers(); useCptStore.setState({ documents: [], activeDocId: null, cpts: new Map(), activeCptId: null }); });

describe("projectbestanden", () => {
  it("herkent IFCX met projectgegevens voorbij de eerste 4 KB", () => {
    expect(ifcx.slice(0, 4096)).not.toContain("project");
    expect(isProjectFile(readJson(ifcx))).toBe(true);
    expect(parseProjectFile(ifcx).cpts).toEqual([cpt]);
  });
  it.each(["ifcgeo", "ifcgis", "ifcx"])("opent IFCX als project in browser voor .%s", async ext => {
    await openContentByFilename(ifcx, `test.${ext}`);
    const doc = useCptStore.getState().documents[0];
    expect(doc.kind).toBe("project");
    if (doc.kind === "project") expect(doc.cpts.get(cpt.id)).toEqual(cpt);
  });
  it("bewaart en heropent een nieuw project met uitsluitend GEF-sonderingen", async () => {
    newProjectDocument();
    await addCptToActiveProject(gef, "sondering.gef");
    const serialized = await serializeActiveProject();
    await openContentByFilename(serialized, "roundtrip.ifcgeo");
    expect(useCptStore.getState().documents).toHaveLength(2);
    expect([...useCptStore.getState().cpts.values()]).toEqual([cpt]);
  });
  it("opent een losse CPT-snapshot zonder projectwrapper", async () => {
    await openContentByFilename(JSON.stringify(cpt), "single.ifcgeo");
    expect(useCptStore.getState().documents[0].kind).toBe("cpt");
  });
  it("behoudt geladen layoutsecties bij direct heropslaan zonder de tekening te openen", async () => {
    const layout = { tekening: { paper_size: "A3", scale: 700 }, title_block: { project: "Tekening" },
      gis: { epsg: 28992, layers: [{ id: "bewaarde-laag", enabled: true }] }, deliverable: { annotations: [{ id: "A1" }] } };
    await openContentByFilename(JSON.stringify({ ...payload, ...layout }), "layout.ifcgeo");
    expect(JSON.parse(await serializeActiveProject())).toMatchObject(layout);
    newProjectDocument();
    expect(JSON.parse(await serializeActiveProject()).tekening).toBeUndefined();
  });
  it("weigert beschadigde meetdata vóór wijziging van de documentstore", async () => {
    const invalid = JSON.stringify({ ...payload, cpts: [{ points: [] }] });
    await expect(openContentByFilename(invalid, "invalid.ifcgeo")).rejects.toThrow("Ongeldige sondering");
    expect(useCptStore.getState().documents).toHaveLength(0);
  });
  it("weigert metadata van het verkeerde type, dubbele IDs en ongeldige meetwaarden", () => {
    for (const invalid of [
      { ...payload, project: { date: 42 } },
      { ...payload, cpts: [cpt, cpt] },
      { ...payload, cpts: [{ ...cpt, position: { x_rd: "120000", y_rd: 450000 } }] },
      { ...payload, cpts: [{ ...cpt, points: [{ depth: 1, qc: "veel" }] }] },
    ]) expect(() => parseProjectFile(JSON.stringify(invalid))).toThrow();
  });
  it("voegt bij een tabwissel tijdens parsing toe aan het oorspronkelijke project", async () => {
    newProjectDocument();
    const target = useCptStore.getState().activeDocId;
    const pending = addCptToActiveProject(gef, "sondering.gef");
    newProjectDocument();
    await pending;
    const state = useCptStore.getState();
    const first = state.documents.find(d => d.id === target);
    expect(first?.kind === "project" && first.cpts.has(cpt.id)).toBe(true);
    expect(state.cpts.size).toBe(0);
  });
});
