import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CalculationsView } from "./CalculationsView";
import { newProjectDocument, useCptStore } from "../../../store/useCptStore";
import { useCalculationsStore } from "../store";
import { getCalcModule } from "../registry";
import type { PanelProps } from "../types";
import type { PileInput, PileResult } from "../../modules/pile-bearing-capacity/types";
import { downloadPdf } from "../../../utils/downloadPdf";

vi.mock("../../../utils/platform", () => ({ IS_TAURI: false }));
vi.mock("../../../utils/downloadPdf", () => ({ downloadPdf: vi.fn(async () => true) }));
vi.mock("../../modules/pile-bearing-capacity/ui/VisualPanel", () => ({
  VisualPanel: ({ input, onChange }: PanelProps<PileInput, PileResult>) =>
    <button onClick={() => onChange?.({ ...input, pileToeNap: -20 })}>Paalpunt verschuiven</button>,
}));
vi.mock('../../modules/laterally-loaded-pile/PileScene3D',()=>({PileScene3D:()=> <div>3D-paalweergave</div>}));
beforeEach(() => {
  vi.useFakeTimers();
  useCptStore.setState({ documents: [], activeDocId: null, cpts: new Map(), activeCptId: null });
  useCalculationsStore.setState({ byDoc: new Map(), activeCalcId: null });
  newProjectDocument();
});
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

function openPileCalculation() {
  // Een sondering is nodig om te rekenen; zonder sondering faalt de berekening.
  const cpt = { id: "S-1", metadata: { source_file: "S-1.gef", ground_level_nap: 0 }, points: [{ depth: 0, qc: 10, rf: 1 }, { depth: 40, qc: 10, rf: 1 }] };
  useCptStore.setState({ cpts: new Map([[cpt.id, cpt as never]]), activeCptId: cpt.id });
  const state = useCptStore.getState();
  const input = getCalcModule("pile-bearing-capacity")!.defaultInput(state);
  useCalculationsStore.getState().addCalculation(state.activeDocId!, "pile-bearing-capacity", "Paal A", input);
  render(<CalculationsView />);
  return state;
}

it("toont invoer en sondering naast de uitdraai, met een werkende grafiekkoppeling", () => {
  const state = useCptStore.getState();
  const input = getCalcModule("pile-bearing-capacity")!.defaultInput(state);
  useCalculationsStore.getState().addCalculation(state.activeDocId!, "pile-bearing-capacity", "Paal A", input);
  render(<CalculationsView />);
  expect(screen.getByRole("region", { name: "Invoer" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Sondering" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Uitdraai" })).toBeInTheDocument();
  expect(screen.getByText("Geotechniek / Paaldraagvermogen")).toBeInTheDocument();
  expect(screen.getByText("Concept")).toBeInTheDocument();
  act(() => fireEvent.click(screen.getByRole("button", { name: "Paalpunt verschuiven" })));
  expect(useCalculationsStore.getState().getList(state.activeDocId!)[0].input).toMatchObject({ pileToeNap: -20 });
});
it('zet het paal- en veermodel van de horizontale paal naast de invoer, met de uitdraai ernaast',()=>{
 const state=useCptStore.getState(),input=getCalcModule('laterally-loaded-pile')!.defaultInput(state);
 useCalculationsStore.getState().addCalculation(state.activeDocId!,'laterally-loaded-pile','Horizontale paal',input);
 render(<CalculationsView/>);
 expect(screen.getByText('Geotechniek / Horizontale paalbelasting')).toBeInTheDocument();
 expect(screen.getByRole('region',{name:'Paal- en veermodel'})).toBeInTheDocument();
 expect(screen.getByRole('region',{name:'Invoer'})).toContainElement(screen.getByRole('region',{name:'Paal- en veermodel'}));
 expect(screen.getByRole('region',{name:'Uitdraai'})).toBeInTheDocument();
 // Geen toets, dus geen rood oordeel: de badge staat op 'niet getoetst'.
 expect(screen.getByText(/^Concept · y /)).toHaveClass('pending');
});
it('opent een tabelcel als detailberekening en bewaart de tabel bij terugkeren',()=>{
 const cpts=new Map(['A','B','C','D','E','F'].map(id=>[id,{id,metadata:{source_file:'synthetisch',ground_level_nap:0},points:Array.from({length:251},(_,j)=>({depth:j*.1,depth_nap:-j*.1,qc:12}))}]));
 useCptStore.setState({cpts,activeCptId:'A'});
 const state=useCptStore.getState(),input={...getCalcModule('pile-bearing-capacity')!.defaultInput(state) as PileInput,capacityTable:{cptIds:[...cpts.keys()],toeNaps:[-14,-15]}};
 const id=useCalculationsStore.getState().addCalculation(state.activeDocId!,'pile-bearing-capacity','Palenoverzicht',input);
 render(<CalculationsView/>);
 fireEvent.click(screen.getByRole('tab',{name:'Draagvermogentabel'}));
 expect(screen.getByRole('table',{name:'Netto ontwerpweerstand per sondering en paalpuntniveau'})).toBeInTheDocument();
 expect(screen.getAllByRole('button',{name:/^Open .+ op /})).toHaveLength(12);
 fireEvent.click(screen.getByRole('button',{name:'Open B op -15 m NAP'}));
 expect(useCalculationsStore.getState().getList(state.activeDocId!).find(c=>c.id===id)?.input).toMatchObject({cptId:'B',pileToeNap:-15,capacityTable:input.capacityTable});
 expect(screen.getByRole('region',{name:'Sondering'})).toBeInTheDocument();
 fireEvent.click(screen.getByRole('tab',{name:'Draagvermogentabel'}));
 fireEvent.change(screen.getByLabelText('Puntniveaus [m NAP]'),{target:{value:'-14\n-16,5'}});
 fireEvent.click(screen.getByRole('button',{name:'Niveaus toepassen'}));
 expect(useCalculationsStore.getState().getList(state.activeDocId!)[0].input).toMatchObject({capacityTable:{toeNaps:[-14,-16.5]}});
});

it("exporteert het rapport vanuit de kop van de uitdraai", async () => {
  vi.useRealTimers();
  openPileCalculation();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "PDF exporteren" })));
  expect(downloadPdf).toHaveBeenCalledOnce();
  const [name, bytes] = vi.mocked(downloadPdf).mock.calls[0];
  expect(name).toMatch(/^paaldraagvermogen-.*\.pdf$/);
  expect(new TextDecoder("latin1").decode(bytes as Uint8Array).startsWith("%PDF")).toBe(true);
});

it("toont het echte rapport als afdrukvoorbeeld", () => {
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:rapport"), revokeObjectURL: vi.fn() }));
  openPileCalculation();
  act(() => fireEvent.click(screen.getByRole("tab", { name: "Afdrukvoorbeeld" })));
  expect(screen.getByRole("region", { name: "Afdrukvoorbeeld" })).toBeInTheDocument();
  expect(screen.getByTitle("Afdrukvoorbeeld")).toHaveAttribute("src", expect.stringMatching(/^blob:rapport#/));
  expect(screen.queryByRole("region", { name: "Invoer" })).toBeNull();
});

it("meldt waarom exporteren niet lukt in plaats van stil te falen", async () => {
  vi.useRealTimers();
  const state = useCptStore.getState();
  const input = getCalcModule("pile-bearing-capacity")!.defaultInput(state);
  useCalculationsStore.getState().addCalculation(state.activeDocId!, "pile-bearing-capacity", "Paal zonder sondering", input);
  render(<CalculationsView />);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "PDF exporteren" })));
  expect(downloadPdf).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent(/Export mislukt: .+/);
});

it('verbergt in "Invoer + model" de uitdraai zodat het model de volle breedte krijgt', () => {
  const state = useCptStore.getState(), input = getCalcModule('laterally-loaded-pile')!.defaultInput(state);
  useCalculationsStore.getState().addCalculation(state.activeDocId!, 'laterally-loaded-pile', 'Horizontale paal', input);
  render(<CalculationsView />);
  act(() => fireEvent.click(screen.getByRole('tab', { name: 'Invoer + paal- en veermodel' })));
  expect(screen.getByRole('region', { name: 'Paal- en veermodel' })).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Uitdraai' })).toBeNull();
  act(() => fireEvent.click(screen.getByRole('tab', { name: 'Invoer + uitdraai' })));
  expect(screen.getByRole('region', { name: 'Uitdraai' })).toBeInTheDocument();
});
