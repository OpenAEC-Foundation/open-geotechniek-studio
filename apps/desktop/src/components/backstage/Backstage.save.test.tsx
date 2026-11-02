import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Blob as NodeBlob } from "node:buffer";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import Backstage from "./Backstage";
import DocumentBar from "../DocumentBar";
import TitleBar from "../TitleBar";
import { newProjectDocument, openProjectFromContent, useCptStore } from "../../store/useCptStore";

const runtime=vi.hoisted(()=>({desktop:true}));
vi.mock("../../utils/platform",()=>({get IS_TAURI(){return runtime.desktop;},files:{pickAndRead:vi.fn()}}));
vi.mock("@tauri-apps/api/core",()=>({invoke:vi.fn(async()=>null)}));
vi.mock("@tauri-apps/plugin-dialog",()=>({save:vi.fn()}));
vi.mock("@tauri-apps/api/window",()=>({getCurrentWindow:()=>({isMaximized:async()=>false,onResized:async()=>()=>{}})}));
vi.mock("@tauri-apps/api/app",()=>({getVersion:async()=>"test"}));
vi.mock("react-i18next",()=>({useTranslation:()=>({t:(key:string,fallback?:unknown)=>typeof fallback === "string"?fallback:key})}));
vi.mock("../../hooks/useRecentFiles",()=>({useRecentFiles:()=>({recentFiles:[],removeRecentFile:vi.fn(),clearRecentFiles:vi.fn()})}));
let written="";
const close=vi.fn();
beforeEach(()=>{
  vi.useFakeTimers();vi.clearAllMocks();runtime.desktop=true;written="";
  vi.stubGlobal("Blob",NodeBlob);vi.spyOn(window,"alert").mockImplementation(()=>{});
  vi.mocked(save).mockResolvedValue("C:\\projecten\\Opgeslagen project.ifcgeo");
  vi.mocked(invoke).mockResolvedValue(null);
  vi.stubGlobal("showSaveFilePicker",vi.fn(async()=>({name:"Browserproject.ifcgeo",createWritable:async()=>({write:async(blob:Blob)=>{written=await blob.text();},close:async()=>{}})})));
  useCptStore.setState({documents:[],activeDocId:null,cpts:new Map(),activeCptId:null});newProjectDocument();
});
afterEach(()=>{cleanup();vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();});
function view(open=true){render(<><DocumentBar/>{!open&&<TitleBar/>}<Backstage open={open} onClose={close} onOpenSettings={()=>{}}/></>);}
async function clickSave(){await act(async()=>fireEvent.click(screen.getByRole("button",{name:/^save(?:Ctrl\+S)?$/})));}

it("toont de gekozen projectnaam direct in de tab en bewaart die in het bestand",async()=>{
  view();await clickSave();
  expect(screen.getByText("Opgeslagen project")).toBeInTheDocument();
  const call=vi.mocked(invoke).mock.calls.find(([name])=>name==="save_project_ifcgis_full")!;
  expect(call[1]).toMatchObject({path:"C:\\projecten\\Opgeslagen project.ifcgeo",payload:{project:{title:"Opgeslagen project"}}});
  expect(useCptStore.getState().documents[0]).toMatchObject({title:"Opgeslagen project",path:"C:\\projecten\\Opgeslagen project.ifcgeo",meta:{title:"Opgeslagen project"}});
});
it("neemt ook de daadwerkelijk gekozen bestandsnaam uit de browser over",async()=>{
  runtime.desktop=false;view();await clickSave();
  expect(screen.getByText("Browserproject")).toBeInTheDocument();
  expect(JSON.parse(written).project.title).toBe("Browserproject");
  await act(async()=>{await openProjectFromContent(written,"Browserproject.ifcgeo");});
  expect(useCptStore.getState().projectMeta.title).toBe("Browserproject");
});
it("verandert de tab niet en sluit het menu niet bij annuleren",async()=>{
  runtime.desktop=false;
  vi.stubGlobal("showSaveFilePicker",vi.fn(async()=>{throw new DOMException("Geannuleerd","AbortError");}));
  view();await clickSave();
  expect(screen.getByText("Nieuw project")).toBeInTheDocument();expect(written).toBe("");expect(close).not.toHaveBeenCalled();
});
it("houdt de oorspronkelijke naam bij een schrijffout",async()=>{
  vi.mocked(invoke).mockRejectedValueOnce(new Error("Geen schrijfrechten"));
  vi.spyOn(console,"error").mockImplementation(()=>{});
  view();await clickSave();
  expect(screen.getByText("Nieuw project")).toBeInTheDocument();
  expect(close).not.toHaveBeenCalled();
  expect(window.alert).toHaveBeenCalledWith(expect.stringContaining("Opslaan mislukt"));
});
it("slaat het oorspronkelijke project op als tijdens de bestandskeuze een ander tabblad actief wordt",async()=>{
  useCptStore.getState().setProjectMeta({title:"Eerste project",project_number:"E1"});
  const first=useCptStore.getState().activeDocId!;
  let finish!:(value:string)=>void;
  vi.mocked(save).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  view();fireEvent.click(screen.getByRole("button",{name:/^save(?:Ctrl\+S)?$/}));
  act(()=>{newProjectDocument();useCptStore.getState().setProjectMeta({title:"Tweede project",project_number:"E2"});});
  await act(async()=>finish("C:\\projecten\\Eerste opgeslagen.ifcgeo"));
  const call=vi.mocked(invoke).mock.calls.find(([name])=>name==="save_project_ifcgis_full")!;
  expect(call[1]).toMatchObject({payload:{project:{title:"Eerste opgeslagen",project_number:"E1"}}});
  expect(useCptStore.getState().documents.find(d=>d.id===first)?.title).toBe("Eerste opgeslagen");
  expect(useCptStore.getState().projectMeta.title).toBe("Tweede project");
});
it("werkt via de opslaanknop bovenin en Ctrl+S zonder eerst Bestand te openen",async()=>{
  view(false);await clickSave();
  expect(screen.getByText("Opgeslagen project")).toBeInTheDocument();
  vi.mocked(save).mockResolvedValue("C:\\projecten\\Opnieuw opgeslagen.ifcgeo");
  await act(async()=>fireEvent.keyDown(window,{key:"s",ctrlKey:true}));
  expect(screen.getByText("Opnieuw opgeslagen")).toBeInTheDocument();
});
