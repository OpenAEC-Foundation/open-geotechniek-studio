import {describe,it,expect} from 'vitest';
import {paginateCpt,REPORT_PLOT_HEIGHT_MM} from './reportPagination';
import type {Cpt} from '../types/cpt';
const cpt:Cpt={id:'long',metadata:{source_file:'synthetic',ground_level_nap:5},points:[{depth:0,qc:0},{depth:50,qc:20}]};
describe('explicit report scale (#4)',()=>{
 it('fits one sounding on one chart by default',()=>expect(paginateCpt(cpt)).toHaveLength(1));
 it('paginates at the actual printed plot height and interpolates page edges',()=>{
  const pages=paginateCpt(cpt,100);expect(pages).toHaveLength(3);
  const span=REPORT_PLOT_HEIGHT_MM/10;
  expect(pages[0].span).toBeCloseTo(span);
  expect(pages[1].cpt.metadata.ground_level_nap).toBeCloseTo(5-span);
  expect(pages[0].cpt.points[pages[0].cpt.points.length-1]?.qc).toBeCloseTo(pages[1].cpt.points[0].qc!);
  expect(cpt.metadata.ground_level_nap).toBe(5);
 });
 it('rejects invalid scales',()=>{for(const n of [0,-1,NaN,5001])expect(()=>paginateCpt(cpt,n)).toThrow();});
});
