import { invoke } from "@tauri-apps/api/core";
import { markProjectSaved, newProjectDocument, openPathByExtension, useCptStore } from "../store/useCptStore";
import { activeProjectPayload, projectNameFromFilename } from "../store/projectSerialization";
import { useCalculationsStore } from "../calc/framework/store";
import { CALC_REGISTRY, getCalcModule } from "../calc/framework/registry";
import { getPileType } from "../calc/modules/pile-bearing-capacity/catalog";
import { changeStandard, getStandard } from "../calc/modules/pile-bearing-capacity/standards";
import type { PileInput } from "../calc/modules/pile-bearing-capacity/types";
import {validateCapacityTable,computeCapacityMatrix,chooseLevels,defaultCapacityConfig,invalidReason,type CapacityTableConfig} from '../calc/modules/pile-bearing-capacity/capacity-table';
import type { SheetView } from '../calc/framework/store';
import type { ProjectMeta } from "../types/cpt";
import { computeLateral, lateralExample, type LateralInput } from '../calc/modules/laterally-loaded-pile/compute';
import { DEFAULT_ADVICE } from '../calc/modules/foundation-advice/types';

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
/** Absoluut pad naar een PDF-bestand. */
function pdfPath(value: unknown): string {
  const path = text(value, "Bestandspad");
  if (!/^(?:[a-z]:[\\/]|\\\\|\/)/i.test(path) || path.includes("\0") || !/\.pdf$/i.test(path)) {
    throw new Error("Gebruik een absoluut pad naar een .pdf-bestand");
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
const optionalInputs = ["baseDiameterMm", "axialStiffnessKn", "posKleefTopNap", "standard", "timberTaper", "projectFactors", "capacityTable", "concreteExtension", "presets"];
const numberList = (value: unknown, label: string) => { if (!Array.isArray(value) || !value.length) throw new Error(`${label} moet een niet-lege lijst zijn`); return value.map((v) => number(v, label)); };
function pilePatch(input: unknown, patch: unknown): PileInput {
  const fields = object(patch, "Invoerpatch");
  keys(fields, [...numericInputs, "cptId", "standard", "pileTypeId", "soilProfile", "timberTaper", "projectFactors", "capacityTable", "concreteExtension", "presets"]);
  let next = structuredClone(object(input, "Berekeningsinvoer"));
  if (fields.standard != null && fields.standard !== next.standard) {
    const standard = text(fields.standard, "Normversie") as NonNullable<PileInput["standard"]>;
    if (!getStandard(standard)) throw new Error("Onbekende normversie");
    next = changeStandard(next as unknown as PileInput, standard) as unknown as ObjectValue;
  }
  if (typeof fields.pileTypeId === "string" && fields.pileTypeId !== next.pileTypeId) {
    for (const key of ["projectFactors", "axialStiffnessKn", "baseDiameterMm", "timberTaper", "concreteExtension"]) delete next[key];
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
      const config=object(value,'Draagvermogentabel');keys(config,['cptIds','toeNaps','sizesMm','targetKn','examples']);
      validateCapacityTable(config as CapacityTableConfig);
      if(config.sizesMm!==undefined)config.sizesMm=numberList(config.sizesMm,'Paalmaten').map(v=>{if(v<=0)throw new Error('Paalmaten moeten positief zijn');return v;});
      if(config.targetKn!==undefined){const t=object(config.targetKn,'Zoekband');keys(t,['minKn','maxKn']);if(!(number(t.minKn,'minKn')>=0)||!(number(t.maxKn,'maxKn')>Number(t.minKn)))throw new Error('De bovengrens moet boven de ondergrens liggen');}
      if(config.examples!==undefined){if(!Array.isArray(config.examples))throw new Error('Voorbeelden moeten een lijst zijn');
        config.examples=config.examples.map(e=>{const x=object(e,'Voorbeeld');keys(x,['cptId','sizeMm','toeNap']);return {cptId:text(x.cptId,'Sondering'),sizeMm:number(x.sizeMm,'Maat'),toeNap:number(x.toeNap,'Puntniveau')};});}
      next[key]=structuredClone(config);
    } else if (key === 'concreteExtension') {
      const ext=object(value,'Betonopzetter');keys(ext,['jointNap','sizeMm','isCircular']);
      if(typeof ext.isCircular!=='boolean')throw new Error('isCircular moet waar of onwaar zijn');
      next[key]={jointNap:number(ext.jointNap,'Las'),sizeMm:number(ext.sizeMm,'Maat opzetter'),isCircular:ext.isCircular};
    } else if (key === 'presets') {
      const pr=object(value,'Instellingen');keys(pr,['sizesMm','extensions','extensionLengthsM','timberToeMm']);
      const out:ObjectValue={};
      if(pr.sizesMm!==undefined){const m=object(pr.sizesMm,'Maatreeksen');out.sizesMm=Object.fromEntries(Object.entries(m).map(([t,l])=>{if(!getPileType(t))throw new Error(`Onbekend paaltype: ${t}`);return [t,numberList(l,'Maatreeks')];}));}
      if(pr.extensions!==undefined){if(!Array.isArray(pr.extensions)||!pr.extensions.length)throw new Error('Opzetters moeten een niet-lege lijst zijn');
        out.extensions=pr.extensions.map(e=>{const x=object(e,'Opzetter');keys(x,['sizeMm','isCircular']);if(typeof x.isCircular!=='boolean')throw new Error('isCircular moet waar of onwaar zijn');return {sizeMm:number(x.sizeMm,'Maat'),isCircular:x.isCircular};});}
      if(pr.extensionLengthsM!==undefined)out.extensionLengthsM=numberList(pr.extensionLengthsM,'Opzetterlengtes');
      if(pr.timberToeMm!==undefined)out.timberToeMm=number(pr.timberToeMm,'Puntdiameter hout');
      next[key]=out;
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
  const fields=object(patch,'Horizontale invoerpatch'); keys(fields,[...Object.keys(lateralExample),'headNap','springOverrides','puDefaults','pileTable']);
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
    } else if(key==='headNap') {
      if(value===null)delete next.headNap; else next.headNap=number(value,'Paalkop');
    } else if(key==='springOverrides') {
      if(value===null){delete next.springOverrides;continue;}
      const o=object(value,'Eigen beddingswaarden');
      next.springOverrides=Object.fromEntries(Object.entries(o).map(([id,row])=>{const r=object(row,'Beddingswaarde');keys(r,['low','high']);
        return [id,Object.fromEntries(Object.entries(r).map(([sc,v])=>[sc,number(v,`kh ${id} ${sc}`)]))];}));
    } else if(key==='pileTable') {
      if(value===null){delete next.pileTable;continue;}
      const t=object(value,'Paaltabel');keys(t,['rows','maxDisplacementMm','examples']);
      if(!Array.isArray(t.rows)||!t.rows.length||t.rows.length>200)throw new Error('De paaltabel vraagt 1 tot 200 palen');
      const rows=t.rows.map(v=>{const r=object(v,'Paal');keys(r,['id','name','count','headForceKn','headMomentKnM','nEdKn','lengthM','diameterMm']);
        const row:ObjectValue={id:text(r.id,'Paal-ID'),name:text(r.name,'Paalnaam'),headForceKn:number(r.headForceKn,'H'),headMomentKnM:number(r.headMomentKnM,'M'),nEdKn:number(r.nEdKn,'N')};
        for(const k of ['count','lengthM','diameterMm'])if(r[k]!==undefined){const x=number(r[k],k);if(!(x>0))throw new Error(`${k} moet positief zijn`);row[k]=x;}
        return row;});
      if(new Set(rows.map(r=>r.id)).size!==rows.length)throw new Error('Paal-ID moet uniek zijn');
      const table:ObjectValue={rows};
      if(t.maxDisplacementMm!==undefined){const m=number(t.maxDisplacementMm,'Grens kopverplaatsing');if(!(m>0))throw new Error('De grens voor de kopverplaatsing moet positief zijn');table.maxDisplacementMm=m;}
      if(t.examples!==undefined){if(!Array.isArray(t.examples))throw new Error('Voorbeelden moeten een lijst zijn');const ids=new Set(rows.map(r=>r.id));
        table.examples=t.examples.map(e=>{const id=text(e,'Voorbeeld');if(!ids.has(id))throw new Error(`Onbekende paal in voorbeelden: ${id}`);return id;});}
      next.pileTable=table;
    } else if(key==='puDefaults') {
      if(value===null){delete next.puDefaults;continue;}
      const o=object(value,'pu-profielen');
      next.puDefaults=Object.fromEntries(Object.entries(o).map(([id,row])=>{const r=object(row,'pu-profiel');keys(r,['atSurfaceKnM','gradientKnM2','capKnM']);
        return [id,{atSurfaceKnM:number(r.atSurfaceKnM,'pu,0'),gradientKnM2:number(r.gradientKnM2,'g'),capKnM:number(r.capKnM,'pu,max')}];}));
    } else {validate({[key]:value},lateralExample as unknown as ObjectValue);next[key]=value;}
  }
  const result=computeLateral(next as unknown as LateralInput);
  if(!result.ok)throw new Error(result.error);
  return next as unknown as LateralInput;
}
/** Funderingsadvies: tekstvelden, keuzes en lijsten met sonderingen en berekeningen. */
function advicePatch(input:unknown,patch:unknown) {
  const fields=object(patch,'Adviespatch');keys(fields,Object.keys(DEFAULT_ADVICE).concat(['floorLevelNap','groundwaterNap','cptIds','calcIds']));
  const next=structuredClone(object(input,'Adviesinvoer'));
  for(const [key,value] of Object.entries(fields)){
    if(value===null&&['floorLevelNap','groundwaterNap','cptIds','calcIds'].includes(key)){delete next[key];continue;}
    if(['designLifeYears','bearingQcMpa','bearingMinThicknessM','floorLevelNap','groundwaterNap'].includes(key))next[key]=number(value,key);
    else if(['appendixCpts','appendixCalcs'].includes(key)){if(typeof value!=='boolean')throw new Error(`${key} moet waar of onwaar zijn`);next[key]=value;}
    else if(key==='status'){if(!['concept','definitief'].includes(String(value)))throw new Error('Status is concept of definitief');next[key]=value;}
    else if(key==='consequenceClass'){if(!['CC1','CC2','CC3'].includes(String(value)))throw new Error('Gevolgklasse is CC1, CC2 of CC3');next[key]=value;}
    else if(key==='cptIds'||key==='calcIds'){if(!Array.isArray(value))throw new Error(`${key} moet een lijst zijn`);next[key]=value.map(v=>text(v,key));}
    else next[key]=typeof value==='string'?value:text(value,key);
  }
  return next;
}
function calculationPatch(moduleId:string,input:unknown,patch:unknown) {
  if(moduleId==='pile-bearing-capacity')return pilePatch(input,patch);
  if(moduleId==='laterally-loaded-pile')return lateralPatch(input,patch);
  if(moduleId==='foundation-advice')return advicePatch(input,patch);
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
/** Weergaven die `studio_show_view` kan openen, met de bijbehorende ribbon-tab. */
export const STUDIO_VIEW_TABS: Record<string, string> = {
  home: "start", map: "kaart", report: "rapport", drawing: "tekening",
  calculations: "berekeningen", model3d: "model3d", ifc: "ifc",
};

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
    case "studio_show_view": {
      keys(args, ["view"]);
      const view = text(args.view, "Weergave");
      const tab = STUDIO_VIEW_TABS[view];
      if (!tab) throw new Error(`Onbekende weergave; kies uit ${Object.keys(STUDIO_VIEW_TABS).join(", ")}`);
      // Via de ribbon schakelen zodat tab en hoofdweergave gelijk blijven.
      window.dispatchEvent(new CustomEvent("ogs:ribbon-switch", { detail: { tab } }));
      return snapshot();
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
      keys(args, ["id", "view", "cptId"]); const { instance, module } = calculation(args.id);
      const view = (args.view === undefined ? "sheet" : text(args.view, "Weergave")) as SheetView;
      if (!["sheet", "model", "table", "print", "settings"].includes(view)) throw new Error("Onbekende weergave");
      if (view === "table" && instance.moduleId !== "pile-bearing-capacity") throw new Error("Alleen het paaldraagvermogen heeft een draagvermogentabel");
      if (view === "print" && !module.buildReport) throw new Error("Deze berekening heeft geen afdrukvoorbeeld");
      const cptId = args.cptId === undefined || args.cptId === null ? null : text(args.cptId, "Sondering");
      useCalculationsStore.getState().navigate(instance.id, view, cptId); changeView("calculations"); return snapshot();
    }
    case "studio_get_capacity_table": {
      keys(args, ["id"]); const { instance } = calculation(args.id);
      if (instance.moduleId !== "pile-bearing-capacity") throw new Error("Alleen het paaldraagvermogen heeft een draagvermogentabel");
      const input = instance.input as PileInput, cpts = useCptStore.getState().cpts;
      const m = computeCapacityMatrix(input, cpts, defaultCapacityConfig(input, [...cpts.keys()]));
      return {
        sizesMm: m.sizesMm, toeNaps: m.toeNaps, target: m.target,
        choices: chooseLevels(m),
        soundings: m.cpts.map(c => ({ cptId: c.cptId, missing: c.missing, note: c.profileNote,
          rcNetD: c.cells.map(row => row.map(cell => cell.result.ok ? cell.result.summary.rcNetD : null)),
          reasons: c.cells.map(row => row.map(cell => cell.result.ok ? null : invalidReason(cell.result.error))) })),
      };
    }
    case "studio_export_report": {
      keys(args, ["id", "path"]); const { instance, module } = calculation(args.id);
      const path = pdfPath(args.path);
      if (!module.buildReport) throw new Error("Deze berekening heeft geen rapport");
      const result = module.compute(instance.input, context());
      const bytes = module.buildReport(instance.input, result, context());
      const fs = await import("@tauri-apps/plugin-fs");
      await fs.writeFile(path, bytes);
      return { id: instance.id, path, bytes: bytes.length };
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
