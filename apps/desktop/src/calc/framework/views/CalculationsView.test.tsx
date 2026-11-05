import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
 // De doorsnedetoets bepaalt de badge: u.c. met groen of rood.
 expect(screen.getByText(/^u.c. /).className).toMatch(/cs-uc-badge (ok|fail)/);
});
const synthetic=(ids:string[],qc=(_i:number)=>12)=>new Map(ids.map((id,i)=>[id,{id,metadata:{source_file:'synthetisch',ground_level_nap:0},points:Array.from({length:251},(_,j)=>({depth:j*.1,depth_nap:-j*.1,qc:qc(i)}))}] as const));
function openTable(cpts:Map<string,unknown>,capacityTable:PileInput['capacityTable'],name='Palenoverzicht'){
 useCptStore.setState({cpts:cpts as never,activeCptId:[...cpts.keys()][0]});
 const state=useCptStore.getState(),input={...getCalcModule('pile-bearing-capacity')!.defaultInput(state) as PileInput,capacityTable};
 const id=useCalculationsStore.getState().addCalculation(state.activeDocId!,'pile-bearing-capacity',name,input);
 render(<CalculationsView/>);
 fireEvent.click(screen.getByRole('tab',{name:'Draagvermogentabel'}));
 return {id,input,docId:state.activeDocId!,stored:()=>useCalculationsStore.getState().getList(state.activeDocId!).find(c=>c.id===id)!.input as PileInput};
}
it('opent een tabelcel als detailberekening en bewaart de tabel bij terugkeren',()=>{
 const {input,stored}=openTable(synthetic(['A','B','C','D','E','F']),{cptIds:['A','B','C','D','E','F'],toeNaps:[-14,-15]});
 const d=input.diameterMm;
 expect(screen.getAllByRole('table',{name:/^Rc;net;d sondering /})).toHaveLength(6);
 const tableB=screen.getByRole('table',{name:'Rc;net;d sondering B'});
 expect(within(tableB).getAllByRole('button',{name:/^Open B, /})).toHaveLength(2);
 fireEvent.click(within(tableB).getByRole('button',{name:`Open B, ${d} mm op -15 m NAP`}));
 expect(stored()).toMatchObject({cptId:'B',pileToeNap:-15,capacityTable:{cptIds:input.capacityTable!.cptIds,toeNaps:[-14,-15]}});
 expect(screen.getByRole('region',{name:'Sondering'})).toBeInTheDocument();
 fireEvent.click(screen.getByRole('tab',{name:'Draagvermogentabel'}));
 fireEvent.change(screen.getByLabelText('Puntniveaus [m NAP]'),{target:{value:'-14\n-16,5'}});
 fireEvent.click(screen.getByRole('button',{name:'Niveaus toepassen'}));
 expect(stored()).toMatchObject({capacityTable:{toeNaps:[-14,-16.5]}});
});

it('toont per paalmaat het kortste puntniveau dat de zoekband haalt, met spreiding',()=>{
 const {stored}=openTable(synthetic(['A','B'],i=>i?15:10),{cptIds:['A','B'],toeNaps:[-9,-10,-11,-12,-13,-14],sizesMm:[220,290],targetKn:{minKn:300,maxKn:600}});
 const choice=screen.getByRole('table',{name:'Puntniveau per paalmaat en sondering'});
 const rows=within(choice).getAllByRole('row').slice(1);
 expect(rows).toHaveLength(2);
 // Een grotere maat haalt de ondergrens op een hoger (minder diep) niveau.
 const level=(row:HTMLElement,cpt:string)=>Number(within(row).getByRole('button',{name:new RegExp(`^Open ${cpt}, `)}).getAttribute('aria-label')!.match(/op (-?[\d,]+) m NAP/)![1].replace(',','.'));
 expect(level(rows[1],'A')).toBeGreaterThan(level(rows[0],'A'));
 expect(level(rows[0],'B')).toBeGreaterThan(level(rows[0],'A'));
 expect(within(rows[0]).getByText(`${(level(rows[0],'B')-level(rows[0],'A')).toLocaleString('nl-NL',{minimumFractionDigits:2})} m`)).toBeInTheDocument();
 // Hogere ondergrens: de keuze schuift dieper of wordt niet gehaald.
 fireEvent.change(screen.getByLabelText('Ondergrens [kN]'),{target:{value:'100000'}});
 // Ondergrens boven de bovengrens: niet opgeslagen, wel gemeld.
 expect(stored().capacityTable!.targetKn).toEqual({minKn:300,maxKn:600});
 expect(screen.getByRole('alert')).toHaveTextContent(/bovengrens moet boven de ondergrens/);
 fireEvent.change(screen.getByLabelText('Bovengrens [kN]'),{target:{value:'200000'}});
 expect(stored().capacityTable!.targetKn).toEqual({minKn:100000,maxKn:200000});
 expect(screen.queryByRole('alert')).toBeNull();
 expect(within(screen.getByRole('table',{name:'Puntniveau per paalmaat en sondering'})).getAllByText('niet gehaald')).toHaveLength(4);
});

it('navigeert via de projectboom van overzicht naar één sondering en naar het rekenblad',()=>{
 openTable(synthetic(['A','B']),{cptIds:['A','B'],toeNaps:[-13,-14],sizesMm:[220,290],targetKn:{minKn:300,maxKn:600}});
 const tree=screen.getByRole('list',{name:'Onderdelen van Palenoverzicht'});
 expect(within(tree).getByRole('button',{name:'Draagvermogentabel'})).toHaveAttribute('aria-current','page');
 fireEvent.click(within(tree).getByRole('button',{name:'Sondering B'}));
 expect(within(tree).getByRole('button',{name:'Sondering B'})).toHaveAttribute('aria-current','page');
 expect(screen.getByRole('navigation',{name:'Kruimelpad'})).toHaveTextContent('Sondering B');
 expect(screen.getAllByRole('table',{name:/^Rc;net;d sondering /})).toHaveLength(1);
 expect(screen.queryByRole('table',{name:'Puntniveau per paalmaat en sondering'})).toBeNull();
 fireEvent.click(within(screen.getByRole('navigation',{name:'Kruimelpad'})).getByRole('button',{name:'Draagvermogentabel'}));
 expect(screen.getAllByRole('table',{name:/^Rc;net;d sondering /})).toHaveLength(2);
 fireEvent.click(within(tree).getByRole('button',{name:'Rekenblad'}));
 expect(screen.getByRole('region',{name:'Uitdraai'})).toBeInTheDocument();
 // De berekening zelf aanklikken brengt je terug naar het overzicht.
 fireEvent.click(screen.getByRole('button',{name:'Palenoverzicht'}));
 expect(screen.getByRole('table',{name:'Puntniveau per paalmaat en sondering'})).toBeInTheDocument();
});

it('vult de standaard maatreeks voor prefab beton in',()=>{
 const {stored,id,docId}=openTable(synthetic(['A']),{cptIds:['A'],toeNaps:[-13]});
 act(()=>useCalculationsStore.getState().updateCalculation(docId,id,{input:{...stored(),pileTypeId:'concrete-prefab-prestressed-driven',diameterMm:290}}));
 fireEvent.click(screen.getByRole('button',{name:'Standaardreeks'}));
 expect(stored().capacityTable!.sizesMm).toEqual([180,220,250,290,320,350,400,450]);
 fireEvent.change(screen.getByLabelText('Paalmaten [mm]'),{target:{value:'250 180'}});
 fireEvent.click(screen.getByRole('button',{name:'Maten toepassen'}));
 expect(stored().capacityTable!.sizesMm).toEqual([180,250]);
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

it('kiest voorbeeldberekeningen voor de uitdraai in de tabelweergave',()=>{
 const {stored}=openTable(synthetic(['A','B']),{cptIds:['A','B'],toeNaps:[-13,-14],sizesMm:[220,290]});
 fireEvent.change(screen.getByLabelText('Voorbeeld: sondering'),{target:{value:'B'}});
 fireEvent.change(screen.getByLabelText('Voorbeeld: maat'),{target:{value:'290'}});
 fireEvent.change(screen.getByLabelText('Voorbeeld: puntniveau'),{target:{value:'-14'}});
 fireEvent.click(screen.getByRole('button',{name:'Voorbeeld toevoegen'}));
 expect(stored().capacityTable!.examples).toEqual([{cptId:'B',sizeMm:290,toeNap:-14}]);
 expect(screen.getByRole('button',{name:'Voorbeeld toevoegen'})).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'Verwijder voorbeeld B, 290 mm op -14 m NAP'}));
 expect(stored().capacityTable!.examples).toEqual([]);
});
