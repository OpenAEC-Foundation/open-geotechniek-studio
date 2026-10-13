import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PlatformProjects } from "./PlatformProjects";
import { registerPlatformStorage, type PlatformStorage } from "../../utils/platformStorage";
import { useCptStore } from "../../store/useCptStore";
import { parseGef } from "../../types/gefParser";
vi.mock("../../utils/platform", () => ({ IS_TAURI: false }));
const cpt = parseGef("#GEFID=1,1,0\n#TESTID=S-opslag\n#COLUMNINFO=1,m,diepte,1\n#COLUMNINFO=2,MPa,qc,2\n#EOH=\n0.1 2.5\n0.2 3.5", "sondering.gef");
const payload = { project: {title:"Project A", date:"2026-10-14", client:"", location:"", project_number:"", author:""}, cpts:[cpt], bores:[], calculations:[] };
const canonical = JSON.stringify({header:{metadata:{openGeoStudio:payload}},data:[]});
let host: PlatformStorage;
beforeEach(() => {
  vi.useFakeTimers();
  useCptStore.setState({documents:[],activeDocId:null,cpts:new Map(),activeCptId:null});
  host = {version:1,label:"Projectsite",list:vi.fn(async()=>[{id:"a",name:"Project A",version:"v2"}]),
    open:vi.fn(async(id,version)=>({id,name:"Project A",version:version ?? "v2",content:canonical})),
    versions:vi.fn(async()=>[{id:"a",name:"Project A",version:"v1"}]),
    save:vi.fn(async request=>({id:request.id ?? "copy",name:request.name,version:"v3"}))};
  registerPlatformStorage(host);
});
afterEach(() => { cleanup(); registerPlatformStorage(undefined); vi.useRealTimers(); });
async function chooseProject() {
  render(<PlatformProjects />);
  await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Projecten op Projectsite"})));
  await act(async()=>fireEvent.change(screen.getByLabelText("Project"),{target:{value:"a"}}));
}
describe("projectopslag met echte documentstore",()=>{
  it("opent canonieke projectdata en bewaart verwachte versie bij opslaan",async()=>{
    await chooseProject();
    await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Openen"})));
    expect(useCptStore.getState().cpts.get(cpt.id)).toEqual(cpt);
    await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Nieuwe versie opslaan"})));
    expect(host.save).toHaveBeenCalledWith(expect.objectContaining({id:"a",expectedVersion:"v2",name:"Project A"}));
    const request=vi.mocked(host.save).mock.calls[0][0];
    expect(JSON.parse(request.content).cpts).toEqual([cpt]);
    await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Nieuwe versie opslaan"})));
    expect(host.save).toHaveBeenLastCalledWith(expect.objectContaining({expectedVersion:"v3"}));
  });
  it("negeert een oud openantwoord na vervanging van de opslagadapter",async()=>{
    let complete!: (value: Awaited<ReturnType<PlatformStorage["open"]>>) => void;
    vi.mocked(host.open).mockImplementationOnce(()=>new Promise(resolve=>{complete=resolve;}));
    await chooseProject();
    fireEvent.click(screen.getByRole("button",{name:"Openen"}));
    act(()=>registerPlatformStorage({...host,label:"Andere site"}));
    await act(async()=>complete({id:"a",name:"Oud project",version:"v2",content:canonical}));
    expect(useCptStore.getState().documents).toHaveLength(0);
    expect(screen.getByRole("button",{name:"Nieuwe versie opslaan"})).toBeDisabled();
    expect(screen.queryByText("Project geopend.")).not.toBeInTheDocument();
  });
  it("koppelt een oud opslaanantwoord niet aan de nieuwe adapter",async()=>{
    await chooseProject();
    await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Openen"})));
    let complete!: (value: Awaited<ReturnType<PlatformStorage["save"]>>) => void;
    vi.mocked(host.save).mockImplementationOnce(()=>new Promise(resolve=>{complete=resolve;}));
    await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Nieuwe versie opslaan"})));
    act(()=>registerPlatformStorage({...host,label:"Andere site"}));
    await act(async()=>complete({id:"a",name:"Oud project",version:"v3"}));
    expect(screen.getByRole("button",{name:"Nieuwe versie opslaan"})).toBeDisabled();
    expect(screen.queryByText(/Opgeslagen: Oud project/)).not.toBeInTheDocument();
  });
  it("meldt een beschadigd project zonder een document of opslagbinding te maken",async()=>{
    vi.mocked(host.open).mockResolvedValueOnce({id:"a",name:"Beschadigd",version:"v2",content:JSON.stringify({project:{},cpts:[{}]})});
    await chooseProject();
    await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Openen"})));
    expect(screen.getByRole("alert")).toHaveTextContent("Ongeldige sondering");
    expect(useCptStore.getState().documents).toHaveLength(0);
    expect(screen.getByRole("button",{name:"Nieuwe versie opslaan"})).toBeDisabled();
  });
  it("opent een historische versie zonder het oorspronkelijke project te overschrijven",async()=>{
    await chooseProject();
    fireEvent.change(screen.getByLabelText("Versie"),{target:{value:"v1"}});
    await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Openen"})));
    expect(host.open).toHaveBeenCalledWith("a","v1");
    expect(useCptStore.getState().cpts.get(cpt.id)).toEqual(cpt);
    expect(screen.getByRole("button",{name:"Nieuwe versie opslaan"})).toBeDisabled();
    await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Actief project als nieuw opslaan"})));
    const request=vi.mocked(host.save).mock.calls[0][0];
    expect(request.id).toBeUndefined();
    expect(request.expectedVersion).toBeUndefined();
  });
});
