import { invoke } from "@tauri-apps/api/core";
import { markProjectSaved, newProjectDocument, openPathByExtension, useCptStore } from "../store/useCptStore";
import { activeProjectPayload, projectNameFromFilename } from "../store/projectSerialization";
import { useCalculationsStore } from "../calc/framework/store";
import { CALC_REGISTRY, getCalcModule } from "../calc/framework/registry";
import { getPileType } from "../calc/modules/pile-bearing-capacity/catalog";
import { changeStandard, getStandard } from "../calc/modules/pile-bearing-capacity/standards";
import type { PileInput } from "../calc/modules/pile-bearing-capacity/types";
import {validateCapacityTable,type CapacityTableConfig} from '../calc/modules/pile-bearing-capacity/capacity-table';
import type { ProjectMeta } from "../types/cpt";
import { computeLateral, lateralExample, type LateralInput } from '../calc/modules/laterally-loaded-pile/compute';

type ObjectValue = Record<string, unknown>;
function object(value: unknown, label: string): ObjectValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} moet een object zijn`);
  return value as ObjectValue;
}
function keys(value: ObjectValue, allowed: readonly string[]) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`Onbekend veld: ${key}`);
}
function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} moet tekst bevatten`);
  return value;
}
function number(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} moet een eindig getal zijn`);
  return value;
}
function filePath(value: unknown, projectOnly: boolean): string {
  const path = text(value, "Bestandspad");
  if (!/^(?:[a-z]:[\\/]|\\\\|\/)/i.test(path) || path.includes("\0") || !(projectOnly ? /\.(ifcgeo|ifcgis|ifcx)$/i : /\.(ifcgeo|ifcgis|ifcx|gef|xml)$/i).test(path)) {
    throw new Error("Gebruik een absoluut pad naar een ondersteund Studio-bestand");
  }
  return path;
}
function project() {
  const state = useCptStore.getState();
  const doc = state.documents.find(d => d.id === state.activeDocId);
  if (!doc || doc.kind !== "project") throw new Error("Open of maak eerst een project");
  return doc;
}
function context() {
  const { cpts, activeCptId, projectMeta } = useCptStore.getState();
  return { cpts, activeCptId, projectMeta };
}
function calculation(id: unknown) {
  const doc = project();
  const instance = useCalculationsStore.getState().getList(doc.id).find(c => c.id === text(id, "Berekenings-ID"));
  if (!instance) throw new Error("Berekening ontbreekt in het actieve project");
  const module = getCalcModule(instance.moduleId);
  if (!module) throw new Error("Deze rekenmodule is niet beschikbaar");
  return { doc, instance, module };
}

const numericInputs = ["diameterMm", "wallThicknessMm", "baseDiameterMm", "axialStiffnessKn", "pileTopNap", "pileToeNap", "waterNap", "excavationNap", "nEd", "nEk", "gammaM", "gammaFnk", "negKleefBottomNap", "posKleefTopNap", "ksMinFactor"];
const optionalInputs = ["baseDiameterMm", "axialStiffnessKn", "posKleefTopNap", "standard", "timberTaper", "projectFactors", "capacityTable"];
function pilePatch(input: unknown, patch: unknown): PileInput {
  const fields = object(patch, "Invoerpatch");
  keys(fields, [...numericInputs, "cptId", "standard", "pileTypeId", "soilProfile", "timberTaper", "projectFactors", "capacityTable"]);
  let next = structuredClone(object(input, "Berekeningsinvoer"));
  if (fields.standard != null && fields.standard !== next.standard) {
    const standard = text(fields.standard, "Normversie") as NonNullable<PileInput["standard"]>;
    if (!getStandard(standard)) throw new Error("Onbekende normversie");
    next = changeStandard(next as unknown as PileInput, standard) as unknown as ObjectValue;
  }
  if (typeof fields.pileTypeId === "string" && fields.pileTypeId !== next.pileTypeId) {
    for (const key of ["projectFactors", "axialStiffnessKn", "baseDiameterMm", "timberTaper"]) delete next[key];
  }
  for (const [key, value] of Object.entries(fields)) {
    if (value === null && optionalInputs.includes(key)) { delete next[key]; continue; }
    if (numericInputs.includes(key)) next[key] = number(value, key);
    else if (key === "cptId") {
      if (value !== null && !useCptStore.getState().cpts.has(text(value, key))) throw new Error("Sondering ontbreekt in het actieve project");
      next[key] = value;
    } else if (key === "standard") {
      const standard = text(value, key);
      if (!getStandard(standard as PileInput["standard"])) throw new Error("Onbekende normversie");
      next[key] = standard;
    } else if (key === "pileTypeId") {
      if (!getPileType(text(value, key))) throw new Error("Onbekend paaltype");
      next[key] = value;
    } else if (key === "soilProfile") {
      if (!Array.isArray(value)) throw new Error("Grondprofiel moet een lijst met lagen zijn");
      next[key] = value.map(item => {
        const layer = object(item, "Grondlaag");
        const numeric = ["startNap", "endNap", "gammaK", "gammaW", "phi"];
        keys(layer, ["kind", ...numeric]);
        if (!["sand-dry", "sand-wet", "clay", "peat"].includes(text(layer.kind, "Grondsoort"))) throw new Error("Onbekende grondsoort");
        for (const field of numeric) number(layer[field], field);
        return { ...layer };
      });
    } else if (key === 'capacityTable') {
      const config=object(value,'Draagvermogentabel');keys(config,['cptIds','toeNaps']);
      validateCapacityTable(config as CapacityTableConfig);
      next[key]=structuredClone(config);
    } else if (key === "timberTaper") {
      const taper = object(value, "Houttapsheid"); keys(taper, ["toeDiameterMm", "lengthM"]);
      next[key] = { toeDiameterMm: number(taper.toeDiameterMm, "Puntdiameter"), lengthM: number(taper.lengthM, "Tapse lengte") };
    } else if (key === "projectFactors") {
      const factors = object(value, "Projectfactoren");
      const numeric = ["alphaP", "alphaS", "alphaT", "beta", "s"];
      keys(factors, [...numeric, "source", "edition"]);
      for (const field of numeric) number(factors[field], field);
      text(factors.source, "Bron"); text(factors.edition, "Editie");
      next[key] = { ...factors };
    }
  }
  return next as unknown as PileInput;
}

function lateralPatch(input:unknown,patch:unknown):LateralInput {
  const fields=object(patch,'Horizontale invoerpatch'); keys(fields,Object.keys(lateralExample));
  const next=structuredClone(object(input,'Horizontale invoer'));
  const validate=(values:ObjectValue,example:ObjectValue)=>{
    keys(values,Object.keys(example));
    for(const [key,value] of Object.entries(values)) {
      if(typeof example[key]==='number')number(value,key);
      else if(typeof value!==typeof example[key])throw new Error(`Ongeldig veld: ${key}`);
    }
  };
  for(const [key,value] of Object.entries(fields)) {
    if(key==='section') {
      const section=object(value,'Doorsnede');validate(section,lateralExample.section as unknown as ObjectValue);
      next.section={...object(next.section,'Doorsnede'),...section};
    } else if(key==='layers') {
      if(!Array.isArray(value)||value.length>40)throw new Error('Ongeldige grondlagen');
      next.layers=value.map(v=>{
        const layer=object(v,'Grondlaag');validate(layer,lateralExample.layers[0] as unknown as ObjectValue);
        for(const key of Object.keys(lateralExample.layers[0]).filter(k=>k!=='ultimate'))if(!(key in layer))throw new Error(`Grondlaag mist ${key}`);
        if(layer.ultimate!==undefined){const ultimate=object(layer.ultimate,'Grensweerstandprofiel');keys(ultimate,['atSurfaceKnM','gradientKnM2','capKnM']);for(const key of ['atSurfaceKnM','gradientKnM2','capKnM'])number(ultimate[key],key);layer.ultimate={...ultimate};}
        return {...layer};
      });
    } else {validate({[key]:value},lateralExample as unknown as ObjectValue);next[key]=value;}
  }
  const result=computeLateral(next as unknown as LateralInput);
  if(!result.ok)throw new Error(result.error);
  return next as unknown as LateralInput;
}
function calculationPatch(moduleId:string,input:unknown,patch:unknown) {
  if(moduleId==='pile-bearing-capacity')return pilePatch(input,patch);
  if(moduleId==='laterally-loaded-pile')return lateralPatch(input,patch);
  throw new Error('Rekenmodule niet beschikbaar voor Studio MCP');
}

function snapshot() {
  const state = useCptStore.getState();
  return structuredClone({
    activeDocId: state.activeDocId,
    activeCptId: state.activeCptId,
    projectMeta: state.projectMeta,
    documents: state.documents.map(doc => ({ id: doc.id, kind: doc.kind, title: doc.title, path: doc.path })),
    cpts: Array.from(state.cpts.values(), cpt => ({ id: cpt.id, metadata: cpt.metadata, pointCount: cpt.points.length })),
    calculations: state.activeDocId ? useCalculationsStore.getState().getList(state.activeDocId) : [],
    activeCalculationId: useCalculationsStore.getState().getActive()?.docId === state.activeDocId ? useCalculationsStore.getState().activeCalcId : null,
    modules: CALC_REGISTRY.map(module => ({ id: module.id, name: module.name, status: module.status })),
  });
}

/** Typed operations on the actual window stores; no keyboard or pointer injection. */
export async function executeStudioTool(tool: string, rawArgs: unknown, changeView: (view: string) => void): Promise<unknown> {
  const args = object(rawArgs, "Argumenten");
  switch (tool) {
    case "studio_get_state": keys(args, []); return snapshot();
    case "studio_get_cpt": {
      keys(args, ["id"]);
      const cpt = useCptStore.getState().cpts.get(text(args.id, "Sonderings-ID"));
      if (!cpt) throw new Error("Sondering ontbreekt in het actieve project");
      return structuredClone(cpt);
    }
    case "studio_new_project": {
      keys(args, ["title"]);
      const title = args.title === undefined ? undefined : text(args.title, "Projectnaam");
      newProjectDocument();
      if (title) useCptStore.getState().setProjectMeta({ title });
      changeView("default"); return snapshot();
    }
    case "studio_select_document": {
      keys(args, ["id"]); const id = text(args.id, "Document-ID");
      if (!useCptStore.getState().documents.some(doc => doc.id === id)) throw new Error("Document is niet geopend");
      useCptStore.getState().setActiveDoc(id); changeView("default"); return snapshot();
    }
    case "studio_open_file": {
      keys(args, ["path"]);
      if (!await openPathByExtension(filePath(args.path, false))) throw new Error("Bestand kon niet worden geopend");
      changeView("default"); return snapshot();
    }
    case "studio_set_project_meta": {
      keys(args, ["patch"]); project();
      const patch = object(args.patch, "Projectgegevens");
      keys(patch, ["title", "client", "location", "project_number", "author", "date"]);
      for (const [key, value] of Object.entries(patch)) if (typeof value !== "string" || (key === "title" && !value.trim())) throw new Error(`Ongeldige projectwaarde: ${key}`);
      useCptStore.getState().setProjectMeta(patch as Partial<ProjectMeta>); return snapshot();
    }
    case "studio_add_calculation": {
      keys(args, ["moduleId", "name", "input"]);
      const doc = project();
      const moduleId = args.moduleId === undefined ? "pile-bearing-capacity" : text(args.moduleId, "Module");
      const module = getCalcModule(moduleId);
      if (!module) throw new Error("Rekenmodule niet beschikbaar voor Studio MCP");
      const input = calculationPatch(moduleId,module.defaultInput(context()), args.input ?? {});
      const name = args.name === undefined ? module.name : text(args.name, "Berekeningsnaam");
      const id = useCalculationsStore.getState().addCalculation(doc.id, moduleId, name, input);
      changeView("calculations"); return { id, ...snapshot() };
    }
    case "studio_update_calculation": {
      keys(args, ["id", "patch"]);
      const { doc, instance } = calculation(args.id);
      const input = calculationPatch(instance.moduleId,instance.input, args.patch);
      useCalculationsStore.getState().updateCalculation(doc.id, instance.id, { input });
      return { id: instance.id, input: structuredClone(input) };
    }
    case "studio_select_calculation": {
      keys(args, ["id"]); const { instance } = calculation(args.id);
      useCalculationsStore.getState().setActive(instance.id); changeView("calculations"); return snapshot();
    }
    case "studio_get_calculation": {
      keys(args, ["id"]); const { instance, module } = calculation(args.id);
      return structuredClone({ instance, result: module.compute(instance.input, context()) });
    }
    case "studio_save_project": {
      keys(args, ["path"]); const path = filePath(args.path, true); const doc = project();
      const payload = activeProjectPayload(doc.id);
      const title = projectNameFromFilename(path);
      await invoke("save_project_ifcgis_full", { path, payload: { ...payload, project: { ...payload.project, title } } });
      markProjectSaved(doc.id, title, path, doc.meta.title);
      return { path, documentId: doc.id, title };
    }
    default: throw new Error(`Onbekende Studio MCP-opdracht: ${tool}`);
  }
}
