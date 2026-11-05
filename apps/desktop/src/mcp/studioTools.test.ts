import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { newProjectDocument, openProjectFromContent, useCptStore } from "../store/useCptStore";
import { useCalculationsStore } from "../calc/framework/store";
import { executeStudioTool } from "./studioTools";

vi.mock("../utils/platform", () => ({ IS_TAURI: false }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null) }));
vi.mock("@tauri-apps/plugin-fs", () => ({ readTextFile: vi.fn(async () => JSON.stringify({ project: { title: "Geopend project" }, cpts: [] })), readFile: vi.fn(async () => new TextEncoder().encode(JSON.stringify({ project: { title: "Geopend project" }, cpts: [] }))) }));
const view = vi.fn();
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks();
  useCptStore.setState({ documents: [], activeDocId: null, cpts: new Map(), activeCptId: null });
  useCalculationsStore.setState({ byDoc: new Map(), activeCalcId: null });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

it("maakt en hernoemt het echte geopende project via MCP", async () => {
  await executeStudioTool("studio_new_project", { title: "Hal" }, view);
  await executeStudioTool("studio_set_project_meta", { patch: { title: "Kantoor", project_number: "P1" } }, view);
  const state = await executeStudioTool("studio_get_state", {}, view);
  expect(state).toMatchObject({ projectMeta: { title: "Kantoor", project_number: "P1" }, documents: [{ title: "Kantoor" }] });
  expect(useCptStore.getState().projectMeta.title).toBe("Kantoor");
  const original = useCptStore.getState().activeDocId;
  await executeStudioTool("studio_new_project", { title: "Tweede project" }, view);
  await executeStudioTool("studio_select_document", { id: original }, view);
  expect(useCptStore.getState().projectMeta.title).toBe("Kantoor");
});
it("voegt een paalberekening toe, wijzigt invoer en selecteert het werkblad", async () => {
  newProjectDocument();
  const added = await executeStudioTool("studio_add_calculation", { name: "Paal A", input: { diameterMm: 250 } }, view) as { id: string };
  await executeStudioTool("studio_update_calculation", { id: added.id, patch: { pileToeNap: -20, timberTaper: { toeDiameterMm: 150, lengthM: 10 } } }, view);
  await executeStudioTool("studio_select_calculation", { id: added.id }, view);
  expect(useCalculationsStore.getState().getActive()?.instance).toMatchObject({ name: "Paal A", input: { diameterMm: 250, pileToeNap: -20, timberTaper: { toeDiameterMm: 150, lengthM: 10 } } });
  expect(view).toHaveBeenCalledWith("calculations");
  expect(await executeStudioTool("studio_get_calculation", { id: added.id }, view)).toHaveProperty("result");
});
it("bedient horizontale paalbelasting als afzonderlijk rekenblad", async()=>{
  newProjectDocument();
  const added=await executeStudioTool('studio_add_calculation',{moduleId:'laterally-loaded-pile',name:'Horizontaal'},view) as {id:string};
  await executeStudioTool('studio_update_calculation',{id:added.id,patch:{headMomentKnM:50,section:{kind:'filled-tube',tubeParticipates:true}}},view);
  const data=await executeStudioTool('studio_get_calculation',{id:added.id},view);
  expect(data).toMatchObject({instance:{moduleId:'laterally-loaded-pile',input:{headMomentKnM:50,section:{kind:'filled-tube',tubeParticipates:true}}},result:{ok:true}});
  for(const patch of [{section:{arbitraryCode:'x'}},{layers:[{topM:0}]},{headForceKn:'veel'},{surchargeKpa:10}])
    await expect(executeStudioTool('studio_update_calculation',{id:added.id,patch},view)).rejects.toThrow();
});
it("weigert onveilige of ongeldige patches zonder de projectinvoer te beschadigen", async () => {
  newProjectDocument();
  const added = await executeStudioTool("studio_add_calculation", {}, view) as { id: string };
  const before = structuredClone(useCalculationsStore.getState().getActive()?.instance.input);
  for (const patch of [{ soilProfile: "geen lagen" }, { soilProfile: [{ kind: "sand-wet", startNap: null }] }, { diameterMm: "groot" }, { cptId: "onbekend" }, { arbitraryCode: "run" }]) {
    await expect(executeStudioTool("studio_update_calculation", { id: added.id, patch }, view)).rejects.toThrow();
  }
  expect(useCalculationsStore.getState().getActive()?.instance.input).toEqual(before);
  await expect(executeStudioTool("studio_set_project_meta", { patch: { title: 5 } }, view)).rejects.toThrow();
});
it("leest complete brongegevens zonder de store via het antwoord wijzigbaar te maken", async () => {
  await openProjectFromContent(JSON.stringify({ project: { title: "Sonderingen" }, cpts: [{ id: "S1", metadata: { source_file: "synthetic.gef" }, points: [{ depth: 1, qc: 5, parameters: { "99": 123 } }] }] }), "test.ifcgeo");
  const cpt = await executeStudioTool("studio_get_cpt", { id: "S1" }, view) as { points: { qc: number; parameters: object }[] };
  expect(cpt.points[0].parameters).toEqual({ "99": 123 });
  cpt.points[0].qc = 999;
  expect(useCptStore.getState().cpts.get("S1")?.points[0].qc).toBe(5);
});
it("opent en bewaart projectbestanden zonder bestandsdialoog", async () => {
  await executeStudioTool("studio_open_file", { path: "C:\\projecten\\bron.ifcgeo" }, view);
  expect(useCptStore.getState().projectMeta.title).toBe("Geopend project");
  await executeStudioTool("studio_save_project", { path: "C:\\projecten\\Opgeslagen.ifcgeo" }, view);
  expect(invoke).toHaveBeenCalledWith("save_project_ifcgis_full", expect.objectContaining({ path: "C:\\projecten\\Opgeslagen.ifcgeo", payload: expect.objectContaining({ project: expect.objectContaining({ title: "Opgeslagen" }) }) }));
  expect(useCptStore.getState().projectMeta.title).toBe("Opgeslagen");
  await expect(executeStudioTool("studio_save_project", { path: "C:\\Windows\\system.ini" }, view)).rejects.toThrow();
  await expect(executeStudioTool("studio_open_file", { path: "../bron.ifcgeo" }, view)).rejects.toThrow();
});
it("hernoemt niet na een mislukte MCP-opslag", async () => {
  newProjectDocument();
  vi.mocked(invoke).mockRejectedValueOnce(new Error("Schrijffout"));
  await expect(executeStudioTool("studio_save_project", { path: "C:\\projecten\\Anders.ifcgeo" }, view)).rejects.toThrow("Schrijffout");
  expect(useCptStore.getState().projectMeta.title).toBe("Nieuw project");
});
it("past bij norm- en paaltypewissels dezelfde standaardwaarden toe als de invoerinterface", async () => {
  newProjectDocument();
  const added = await executeStudioTool("studio_add_calculation", { input: { pileTypeId: "concrete-prefab-prestressed-driven", baseDiameterMm: 400, axialStiffnessKn: 1000000, projectFactors: { alphaP: .35, alphaS: .006, alphaT: 0, beta: 1, s: 1, source: "Projectverklaring", edition: "2017" } } }, view) as { id: string };
  await executeStudioTool("studio_update_calculation", { id: added.id, patch: { standard: "nen-6743-1991" } }, view);
  expect(useCalculationsStore.getState().getActive()?.instance.input).toMatchObject({ standard: "nen-6743-1991", gammaM: 1.25 });
  expect(useCalculationsStore.getState().getActive()?.instance.input).not.toHaveProperty("projectFactors", expect.anything());
  await executeStudioTool("studio_update_calculation", { id: added.id, patch: { gammaM: 1.3, standard: "nen-9997-2017", baseDiameterMm: 300 } }, view);
  expect(useCalculationsStore.getState().getActive()?.instance.input).toMatchObject({ gammaM: 1.3, baseDiameterMm: 300 });
  await executeStudioTool("studio_update_calculation", { id: added.id, patch: { pileTypeId: "concrete-auger" } }, view);
  expect(useCalculationsStore.getState().getActive()?.instance.input).not.toHaveProperty("baseDiameterMm", expect.anything());
});
