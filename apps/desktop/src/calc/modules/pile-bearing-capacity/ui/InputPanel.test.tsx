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
  fireEvent.change(screen.getByLabelText("Type"),{target:{value:"concrete-auger"}});
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
  fireEvent.change(screen.getByLabelText("Type"),{target:{value:"concrete-auger"}});
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({pileTypeId:"concrete-auger",projectFactors:undefined,baseDiameterMm:undefined,axialStiffnessKn:undefined}));
 });
});
