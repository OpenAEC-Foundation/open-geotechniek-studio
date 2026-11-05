import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CalculationsView } from "./CalculationsView";
import { newProjectDocument, useCptStore } from "../../../store/useCptStore";
import { useCalculationsStore } from "../store";
import { getCalcModule } from "../registry";
import type { PanelProps } from "../types";
import type { PileInput, PileResult } from "../../modules/pile-bearing-capacity/types";

vi.mock("../../../utils/platform", () => ({ IS_TAURI: false }));
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
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); });

it("toont paalinvoer, sondering en uitkomsten met een werkende grafiekkoppeling", () => {
  const state = useCptStore.getState();
  const input = getCalcModule("pile-bearing-capacity")!.defaultInput(state);
  useCalculationsStore.getState().addCalculation(state.activeDocId!, "pile-bearing-capacity", "Paal A", input);
  render(<CalculationsView />);
  expect(screen.getByRole("region", { name: "Invoer" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Sondering" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Resultaten" })).toBeInTheDocument();
  expect(screen.getByText("Geotechniek / Paaldraagvermogen")).toBeInTheDocument();
  expect(screen.getByText("Concept")).toBeInTheDocument();
  act(() => fireEvent.click(screen.getByRole("button", { name: "Paalpunt verschuiven" })));
  expect(useCalculationsStore.getState().getList(state.activeDocId!)[0].input).toMatchObject({ pileToeNap: -20 });
});
it('geeft de horizontale module een eigen werkblad en brede modelruimte',()=>{
 const state=useCptStore.getState(),input=getCalcModule('laterally-loaded-pile')!.defaultInput(state);
 useCalculationsStore.getState().addCalculation(state.activeDocId!,'laterally-loaded-pile','Horizontale paal',input);
 render(<CalculationsView/>);
 expect(screen.getByText('Geotechniek / Horizontale paalbelasting')).toBeInTheDocument();
 expect(screen.getByRole('region',{name:'Paal- en veermodel'})).toBeInTheDocument();
 expect(screen.getByRole('heading',{name:'Horizontale paal'}).closest('article')).toHaveClass('worksheet-lateral');
});
it('opent een tabelcel als detailberekening en bewaart de tabel bij terugkeren',()=>{
 const cpts=new Map(['A','B','C','D','E','F'].map(id=>[id,{id,metadata:{source_file:'synthetisch',ground_level_nap:0},points:Array.from({length:251},(_,j)=>({depth:j*.1,depth_nap:-j*.1,qc:12}))}]));
 useCptStore.setState({cpts,activeCptId:'A'});
 const state=useCptStore.getState(),input={...getCalcModule('pile-bearing-capacity')!.defaultInput(state) as PileInput,capacityTable:{cptIds:[...cpts.keys()],toeNaps:[-14,-15]}};
 const id=useCalculationsStore.getState().addCalculation(state.activeDocId!,'pile-bearing-capacity','Palenoverzicht',input);
 render(<CalculationsView/>);
 fireEvent.click(screen.getByRole('button',{name:'Draagvermogentabel'}));
 expect(screen.getByRole('table',{name:'Netto ontwerpweerstand per sondering en paalpuntniveau'})).toBeInTheDocument();
 expect(screen.getAllByRole('button',{name:/^Open .+ op /})).toHaveLength(12);
 fireEvent.click(screen.getByRole('button',{name:'Open B op -15 m NAP'}));
 expect(useCalculationsStore.getState().getList(state.activeDocId!).find(c=>c.id===id)?.input).toMatchObject({cptId:'B',pileToeNap:-15,capacityTable:input.capacityTable});
 expect(screen.getByRole('region',{name:'Sondering'})).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Draagvermogentabel'}));
 fireEvent.change(screen.getByLabelText('Puntniveaus [m NAP]'),{target:{value:'-14\n-16,5'}});
 fireEvent.click(screen.getByRole('button',{name:'Niveaus toepassen'}));
 expect(useCalculationsStore.getState().getList(state.activeDocId!)[0].input).toMatchObject({capacityTable:{toeNaps:[-14,-16.5]}});
});
