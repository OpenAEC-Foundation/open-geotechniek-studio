import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InputPanel } from "./InputPanel";
import { computePile } from "../compute";
import fixture from "../__fixtures__/sondering-3bm-cgeo1.json";
import type { PileInput } from "../types";
const input=fixture.input as PileInput;
const result=computePile(input,null);
describe("paaltype-invoer",()=>{
 it("slaat de tapse houtgeometrie op en wist die bij materiaalwissel",()=>{
  const onChange=vi.fn();
  const tapered={...input,pileTypeId:"timber-uniform",timberTaper:{toeDiameterMm:150,lengthM:10}};
  render(<InputPanel input={tapered} result={result} onChange={onChange}/>);
  fireEvent.change(screen.getByLabelText("Tapse lengte vanaf kop [m]"),{target:{value:"8"}});
  expect(onChange.mock.calls[0][0].timberTaper).toEqual({toeDiameterMm:150,lengthM:8});
  fireEvent.change(screen.getByLabelText("Paaltype"),{target:{value:"concrete-auger"}});
  expect(onChange.mock.calls[1][0].timberTaper).toBeUndefined();
 });
 it("laat de grondsoort per laag expliciet aanpassen",()=>{
  const onChange=vi.fn();
  render(<InputPanel input={input} result={result} onChange={onChange}/>);
  fireEvent.change(screen.getByLabelText("Grondsoort laag 1"),{target:{value:"sand-wet"}});
  expect(onChange.mock.calls[0][0].soilProfile[0]).toEqual(expect.objectContaining({kind:"sand-wet",gammaK:20,gammaW:10,phi:32.5}));
 });
 it("slaat normkeuze en historische veiligheidsfactor op en verwijdert moderne overrides",()=>{
  const onChange=vi.fn();
  render(<InputPanel input={input} result={result} onChange={onChange}/>);
  fireEvent.change(screen.getByLabelText("Normversie"),{target:{value:"nen-6743-1991"}});
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({standard:"nen-6743-1991",gammaM:1.25,pileTypeId:"concrete-prefab-prestressed-driven",projectFactors:undefined}));
 });
 it("toont de catalogus en vraagt EA bij een boorpaal",()=>{
  render(<InputPanel input={{...input,pileTypeId:"concrete-bored"}} result={result}/>);
  expect(screen.getByRole("option",{name:"Avegaarpaal — beton"})).toBeTruthy();
  expect(screen.getByLabelText(/Axiale stijfheid EA.*verplicht/)).toBeTruthy();
  expect(screen.queryByLabelText("Wanddikte [mm]")).toBeNull();
 });
 it("neemt projectfactoren en voetmaat niet stilzwijgend over bij typewissel",()=>{
  const onChange=vi.fn();
  render(<InputPanel input={{...input,baseDiameterMm:400,axialStiffnessKn:1000000,projectFactors:{alphaP:.35,alphaS:.006,alphaT:0,beta:1,s:1,source:"Verklaring",edition:"2025"}}} result={result} onChange={onChange}/>);
  fireEvent.change(screen.getByLabelText("Paaltype"),{target:{value:"concrete-auger"}});
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({pileTypeId:"concrete-auger",projectFactors:undefined,baseDiameterMm:undefined,axialStiffnessKn:undefined}));
 });
 it("waarschuwt als het grondprofiel boven de paalpunt ophoudt",()=>{
  const bottom=Math.min(...input.soilProfile.map(l=>Math.min(l.startNap,l.endNap)));
  const {rerender}=render(<InputPanel input={{...input,pileToeNap:bottom}} result={result}/>);
  expect(screen.queryByRole("status")).toBeNull();
  rerender(<InputPanel input={{...input,pileToeNap:bottom-2}} result={result}/>);
  expect(screen.getByRole("status")).toHaveTextContent("telt geen schachtwrijving mee");
 });
 it("geeft bij de tegel Hout een houten paal met betonopzetter, zonder EA-eis",()=>{
  const onChange=vi.fn();
  const {rerender}=render(<InputPanel input={input} result={result} onChange={onChange}/>);
  fireEvent.click(screen.getByRole("radio",{name:"Hout"}));
  const next=onChange.mock.calls[0][0];
  expect(next).toEqual(expect.objectContaining({pileTypeId:"timber-uniform",axialStiffnessKn:undefined}));
  // Ronde opzetter Ø280, kortste gangbare lengte met de las minstens 0,5 m onder de grondwaterstand; punt Ø150.
  const len=[1.5,2,2.5,4].find(l=>input.pileTopNap-l<=input.waterNap-.5)??4;
  expect(next.concreteExtension).toEqual({jointNap:+(input.pileTopNap-len).toFixed(2),sizeMm:280,isCircular:true});
  expect(next.timberTaper).toEqual({toeDiameterMm:150,lengthM:+(next.concreteExtension.jointNap-input.pileToeNap).toFixed(2)});
  expect(next.diameterMm).toBe(220);
  rerender(<InputPanel input={next} result={result} onChange={onChange}/>);
  expect(screen.getByRole("checkbox",{name:"Betonopzetter"})).toBeChecked();
  expect(screen.getByLabelText("Las [m NAP]")).toHaveValue(next.concreteExtension.jointNap);
  expect(screen.getByLabelText("Houtdiameter bij de las [mm]")).toBeInTheDocument();
  expect(screen.queryByLabelText(/Axiale stijfheid EA/)).toBeNull();
  expect(screen.getByLabelText("Opzetter")).toHaveValue("rond-280");
  // Een kortere opzetter verplaatst de las; boven het grondwater volgt een waarschuwing.
  fireEvent.change(screen.getByLabelText("Lengte opzetter [m]"),{target:{value:"1.5"}});
  const shorter=onChange.mock.lastCall![0];
  expect(shorter.concreteExtension.jointNap).toBeCloseTo(input.pileTopNap-1.5,2);
  rerender(<InputPanel input={shorter} result={result} onChange={onChange}/>);
  if(shorter.concreteExtension.jointNap>input.waterNap-.5)expect(screen.getByText(/niet permanent nat/)).toBeInTheDocument();
 });
 it("vraagt EA weer als de opzetter uit gaat, en houdt een tapsheid binnen het hout",()=>{
  const onChange=vi.fn();
  const woodWithExt={...input,pileTypeId:"timber-uniform",concreteExtension:{jointNap:input.pileTopNap-2,sizeMm:250,isCircular:false}};
  const {rerender}=render(<InputPanel input={woodWithExt} result={result} onChange={onChange}/>);
  fireEvent.click(screen.getByRole("checkbox",{name:"Betonopzetter"}));
  const without=onChange.mock.calls[0][0];
  expect(without.concreteExtension).toBeUndefined();
  rerender(<InputPanel input={without} result={result} onChange={onChange}/>);
  expect(screen.getByLabelText(/Axiale stijfheid EA.*verplicht/)).toHaveAttribute("aria-invalid","true");
  // Opzetter aan bij een tapsheid over de hele paal: die wordt ingekort tot het hout.
  const full={...without,timberTaper:{toeDiameterMm:150,lengthM:input.pileTopNap-input.pileToeNap}};
  rerender(<InputPanel input={full} result={result} onChange={onChange}/>);
  fireEvent.click(screen.getByRole("checkbox",{name:"Betonopzetter"}));
  const back=onChange.mock.calls[onChange.mock.calls.length-1][0];
  expect(back.timberTaper.lengthM).toBeLessThanOrEqual(back.concreteExtension.jointNap-input.pileToeNap+1e-9);
 });
 it("zet de cursor in het verplichte EA-veld bij een paaltype dat EA vereist",()=>{
  const onChange=vi.fn();
  const {rerender}=render(<InputPanel input={input} result={result} onChange={onChange}/>);
  fireEvent.change(screen.getByLabelText("Paaltype"),{target:{value:"concrete-auger"}});
  const next=onChange.mock.calls[0][0];
  expect(next.concreteExtension).toBeUndefined();
  rerender(<InputPanel input={next} result={result} onChange={onChange}/>);
  const ea=screen.getByLabelText(/Axiale stijfheid EA.*verplicht/);
  expect(ea).toHaveFocus();
  expect(ea).toHaveAttribute("aria-invalid","true");
  expect(screen.getByText(/zonder EA wordt er niet gerekend/)).toBeInTheDocument();
 });
});

describe("standaardmaten",()=>{
 it("biedt bij een stalen buispaal de buisreeks aan",()=>{
  const onChange=vi.fn();
  render(<InputPanel input={{...input,pileTypeId:"steel-pipe-driven-closed-2017",diameterMm:219.1}} result={result} onChange={onChange}/>);
  const select=screen.getByLabelText("Buismaat");
  expect(select).toHaveValue("219.1");
  expect([...select.querySelectorAll("option")].map(o=>o.textContent)).toContain("Ø323,9 mm");
  fireEvent.change(select,{target:{value:"323.9"}});
  expect(onChange.mock.lastCall![0].diameterMm).toBe(323.9);
 });
});

