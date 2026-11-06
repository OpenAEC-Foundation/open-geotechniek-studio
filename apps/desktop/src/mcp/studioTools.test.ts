import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { newProjectDocument, openProjectFromContent, useCptStore } from "../store/useCptStore";
import { useCalculationsStore } from "../calc/framework/store";
import { executeStudioTool } from "./studioTools";

vi.mock("../utils/platform", () => ({ IS_TAURI: false }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null) }));
vi.mock("@tauri-apps/plugin-fs", () => ({ writeFile: vi.fn(async () => undefined), readTextFile: vi.fn(async () => JSON.stringify({ project: { title: "Geopend project" }, cpts: [] })), readFile: vi.fn(async () => new TextEncoder().encode(JSON.stringify({ project: { title: "Geopend project" }, cpts: [] }))) }));
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
  await executeStudioTool('studio_update_calculation',{id:added.id,patch:{analysisMode:'linear',layerCorrection:'none'}},view);
  expect(await executeStudioTool('studio_get_calculation',{id:added.id},view)).toMatchObject({result:{analysisMode:'linear'}});
  const nonlinearData=(await executeStudioTool('studio_get_calculation',{id:added.id},view)) as {instance:{input:Record<string,unknown>}};
  await executeStudioTool('studio_update_calculation',{id:added.id,patch:{layers:nonlinearData.instance.input.layers,analysisMode:'nonlinear',layerCorrection:'georgiadis'}},view);
  await expect(executeStudioTool('studio_update_calculation',{id:added.id,patch:{layers:[{topM:0,bottomM:12,springId:'manual',manualKhKnM3:2000,frictionDeg:30,netPressureKpa:0,ultimate:{atSurfaceKnM:20,gradientKnM2:0,capKnM:50,unexpected:1}}]}},view)).rejects.toThrow();
  for(const patch of [{section:{arbitraryCode:'x'}},{layers:[{topM:0}]},{headForceKn:'veel'},{surchargeKpa:10}])
    await expect(executeStudioTool('studio_update_calculation',{id:added.id,patch},view)).rejects.toThrow();
});
it('bewaart tabelkeuzen via MCP en weigert ongeldige configuratie zonder mutatie',async()=>{
 newProjectDocument();
 const added=await executeStudioTool('studio_add_calculation',{},view) as {id:string};
 await executeStudioTool('studio_update_calculation',{id:added.id,patch:{capacityTable:{cptIds:[],toeNaps:[-14,-15.5]}}},view);
 const before=structuredClone(useCalculationsStore.getState().getActive()?.instance.input);
 expect(before).toMatchObject({capacityTable:{cptIds:[],toeNaps:[-14,-15.5]}});
 for(const capacityTable of [{cptIds:[],toeNaps:[]},{cptIds:['A','A'],toeNaps:[-14]},{cptIds:[],toeNaps:['-14']},{cptIds:[],toeNaps:[-14],code:'x'}])
  await expect(executeStudioTool('studio_update_calculation',{id:added.id,patch:{capacityTable}},view)).rejects.toThrow();
 expect(useCalculationsStore.getState().getActive()?.instance.input).toEqual(before);
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

it("bedient de nieuwe paalinvoer, instellingen, tabel, weergaven en rapport via MCP", async () => {
  newProjectDocument();
  const fs = await import("@tauri-apps/plugin-fs");
  const pile = await executeStudioTool("studio_add_calculation", {}, view) as { id: string };
  await executeStudioTool("studio_update_calculation", { id: pile.id, patch: {
    pileTypeId: "timber-uniform", concreteExtension: { jointNap: -3, sizeMm: 280, isCircular: true },
    presets: { sizesMm: { "timber-uniform": [180, 220] }, extensionLengthsM: [2, 4], timberToeMm: 150 },
    capacityTable: { cptIds: [], toeNaps: [-12, -13], sizesMm: [180, 220], targetKn: { minKn: 300, maxKn: 600 }, examples: [] },
  } }, view);
  expect(useCalculationsStore.getState().getActive()?.instance.input).toMatchObject({ concreteExtension: { sizeMm: 280 }, presets: { timberToeMm: 150 }, capacityTable: { sizesMm: [180, 220] } });
  for (const patch of [{ concreteExtension: { jointNap: -3, sizeMm: 280 } }, { presets: { sizesMm: { "onbekend": [1] } } }, { capacityTable: { cptIds: [], toeNaps: [-12], targetKn: { minKn: 600, maxKn: 300 } } }])
    await expect(executeStudioTool("studio_update_calculation", { id: pile.id, patch }, view)).rejects.toThrow();
  const table = await executeStudioTool("studio_get_capacity_table", { id: pile.id }, view) as { sizesMm: number[]; toeNaps: number[]; choices: unknown[] };
  expect(table).toMatchObject({ sizesMm: [180, 220], toeNaps: [-12, -13], target: { minKn: 300, maxKn: 600 } });
  expect(table.choices).toHaveLength(2);
  await executeStudioTool("studio_select_calculation", { id: pile.id, view: "settings" }, view);
  expect(useCalculationsStore.getState().sheetNav).toMatchObject({ calcId: pile.id, view: "settings" });
  await expect(executeStudioTool("studio_select_calculation", { id: pile.id, view: "elders" }, view)).rejects.toThrow("Onbekende weergave");

  const lateral = await executeStudioTool("studio_add_calculation", { moduleId: "laterally-loaded-pile" }, view) as { id: string };
  await executeStudioTool("studio_update_calculation", { id: lateral.id, patch: { headNap: -1.2, springOverrides: { "sand-medium": { low: 30000 } }, puDefaults: { "clay-soft": { atSurfaceKnM: 30, gradientKnM2: 16.5, capKnM: 90 } } } }, view);
  const data = await executeStudioTool("studio_get_calculation", { id: lateral.id }, view) as { result: { resolvedLayers: Array<{ khKnM3: number }> } };
  expect(data.result.resolvedLayers[1].khKnM3).toBe(30000);
  await expect(executeStudioTool("studio_select_calculation", { id: lateral.id, view: "table" }, view)).rejects.toThrow();
  await expect(executeStudioTool("studio_get_capacity_table", { id: lateral.id }, view)).rejects.toThrow();
  await expect(executeStudioTool("studio_export_report", { id: lateral.id, path: "relatief.pdf" }, view)).rejects.toThrow(".pdf");
  const out = await executeStudioTool("studio_export_report", { id: lateral.id, path: "C:/rapporten/horizontaal.pdf" }, view) as { bytes: number };
  expect(out.bytes).toBeGreaterThan(1000);
  expect(fs.writeFile).toHaveBeenCalledWith("C:/rapporten/horizontaal.pdf", expect.any(Uint8Array));
});


it("bewaart een paaltabel voor de horizontale paal en weigert ongeldige rijen", async () => {
  newProjectDocument();
  const lateral = await executeStudioTool("studio_add_calculation", { moduleId: "laterally-loaded-pile" }, view) as { id: string };
  const pileTable = { rows: [{ id: "a", name: "Kade A", headForceKn: 30, headMomentKnM: 0, nEdKn: 0 }, { id: "b", name: "Kade B", count: 4, headForceKn: 60, headMomentKnM: 10, nEdKn: 200, diameterMm: 350 }], maxDisplacementMm: 40, examples: ["b"] };
  await executeStudioTool("studio_update_calculation", { id: lateral.id, patch: { pileTable } }, view);
  expect(useCalculationsStore.getState().getActive()?.instance.input).toMatchObject({ pileTable });
  for (const bad of [{ rows: [] }, { rows: [{ id: "a", name: "A", headForceKn: 1, headMomentKnM: 0, nEdKn: 0 }, { id: "a", name: "B", headForceKn: 1, headMomentKnM: 0, nEdKn: 0 }] }, { rows: pileTable.rows, examples: ["z"] }, { rows: [{ id: "a", name: "A", headForceKn: 1, headMomentKnM: 0, nEdKn: 0, lengthM: -2 }] }])
    await expect(executeStudioTool("studio_update_calculation", { id: lateral.id, patch: { pileTable: bad } }, view)).rejects.toThrow();
  const out = await executeStudioTool("studio_export_report", { id: lateral.id, path: "C:/rapporten/paaltabel.pdf" }, view) as { bytes: number };
  expect(out.bytes).toBeGreaterThan(1000);
});
