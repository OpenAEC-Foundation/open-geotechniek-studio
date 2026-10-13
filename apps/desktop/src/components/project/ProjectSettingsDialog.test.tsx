import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import ProjectSettingsDialog from "./ProjectSettingsDialog";
import { newProjectDocument, useCptStore } from "../../store/useCptStore";
import { files } from "../../utils/platform";
import { parseGef } from "../../types/gefParser";
vi.mock("react-i18next",()=>({useTranslation:()=>({t:(_key:string,fallback:string)=>fallback})}));
vi.mock("../../utils/platform",()=>({IS_TAURI:false,files:{pickAndRead:vi.fn()},cpt:{parse:async(text:string,name:string)=>parseGef(text,name)}}));
const gef="#GEFID=1,1,0\n#TESTID=S-import\n#COLUMNINFO=1,m,diepte,1\n#COLUMNINFO=2,MPa,qc,2\n#EOH=\n0.1 2.5";
beforeEach(()=>{vi.useFakeTimers();useCptStore.setState({documents:[],activeDocId:null,cpts:new Map(),activeCptId:null});});
afterEach(()=>{cleanup();vi.useRealTimers();});
it("stopt bestandsimport wanneer het doelproject tijdens bestandskeuze verandert",async()=>{
  newProjectDocument();
  let complete!: (value: Awaited<ReturnType<typeof files.pickAndRead>>) => void;
  vi.mocked(files.pickAndRead).mockImplementationOnce(()=>new Promise(resolve=>{complete=resolve;}));
  render(<ProjectSettingsDialog open onClose={()=>{}} />);
  fireEvent.click(screen.getByRole("button",{name:"Sondering toevoegen"}));
  act(()=>newProjectDocument());
  await act(async()=>complete([{text:gef,name:"sondering.gef"}]));
  expect(screen.getByRole("alert")).toHaveTextContent("doelproject");
  for(const doc of useCptStore.getState().documents) {
    expect(doc.kind === "project" && doc.cpts.size).toBe(0);
  }
});
