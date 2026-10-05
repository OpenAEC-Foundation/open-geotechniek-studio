import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InputPanel } from "./InputPanel";
import { computePile } from "../compute";
import fixture from "../__fixtures__/sondering-3bm-cgeo1.json";
import type { PileInput } from "../types";
const input=fixture.input as PileInput;
const result=computePile(input,null);
describe("paaltype-invoer",()=>{
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
