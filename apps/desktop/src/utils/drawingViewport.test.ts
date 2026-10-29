import { describe,it,expect } from 'vitest';
import { drawingViewport,parseDrawingScale } from './drawingViewport';
describe('drawing/address and scale regression (#5)',()=>{
 const saved={lat:51.8,lon:4.6,zoom:18},selected={lat:52.1,lon:5.1,zoom:19};
 it('keeps the selected address when returning to a drawing with no CPTs',()=>{
  expect(drawingViewport(saved,selected,false,false)).toBe(selected);
  expect(drawingViewport(saved,selected,true,false)).toBe(saved);
  expect(drawingViewport(saved,selected,false,true)).toBe(saved);
 });
 it('uses one validated scale for geometry and title block',()=>{
  expect(parseDrawingScale('1:850')).toBe(850);expect(parseDrawingScale('1000')).toBe(1000);
  for(const value of ['1:0','-500','1000000','500x','1:2:500']) expect(parseDrawingScale(value)).toBeNull();
 });
});
