import {afterEach,expect,it} from 'vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {GoverningOverview,mapBand} from './GoverningOverview';
import {computeCapacityMatrix,governingLevels,levelRange} from '../capacity-table';
import {pileBearingCapacityModule} from '../module';
import type {PileInput} from '../types';
import type {Cpt} from '../../../../types/cpt';

afterEach(()=>cleanup());

const cpt=(id:string,qc:number,pos?:{x_rd:number;y_rd:number}):Cpt=>({id,metadata:{source_file:'synthetisch',ground_level_nap:0},position:pos,
 points:Array.from({length:251},(_,i)=>({depth:i*.1,depth_nap:-i*.1,qc}))});
const cpts=new Map([['A',cpt('A',10,{x_rd:100,y_rd:200})],['B',cpt('B',15,{x_rd:140,y_rd:230})],['C',cpt('C',15)]]);
const base=pileBearingCapacityModule.defaultInput({cpts,activeCptId:'A',projectMeta:{title:'',client:'',location:'',project_number:'',author:'',date:''}}) as PileInput;
const m=computeCapacityMatrix(base,cpts,{cptIds:['A','B','C'],toeNaps:levelRange(-10,-18,1),sizesMm:[220,290],targetKn:{minKn:500,maxKn:1000}});
const target=Math.ceil(m.cpts[0].cells[0][2].result.summary.rcNetD);

it('deelt sonderingen in naar de verhouding tot het gezochte draagvermogen',()=>{
 expect(mapBand(null,300)).toBe('none');
 expect(mapBand(200,300)).toBe('low');
 expect(mapBand(290,300)).toBe('short');
 expect(mapBand(300,300)).toBe('ok');
 expect(mapBand(400,300)).toBe('ample');
});

it('toont per draagvermogen het maatgevende niveau en kleurt de plattegrond op het gekozen niveau',()=>{
 const focused:string[]=[];
 render(<GoverningOverview m={m} cpts={cpts} targetsKn={[target]} sizeLabel={s=>`□${s}`} focus={id=>focused.push(id)} />);
 const cell=governingLevels(m,[target])[0].cells[0];
 const table=screen.getByRole('table',{name:'Maatgevend puntniveau per draagvermogen en paalmaat'});
 expect(within(table).getAllByRole('button')).toHaveLength(2);
 expect(within(table).getAllByText(/^A · /).length).toBeGreaterThan(0);
 // de plattegrond staat op het eerste haalbare niveau; A is daar maatgevend
 const svg=screen.getByRole('img');
 expect(svg.querySelectorAll('.capacity-map-point')).toHaveLength(2);
 expect(svg.querySelector('.capacity-map-point.is-governing')?.textContent).toContain('A');
 expect(screen.getByText(/Zonder positie, niet getekend: C/)).toBeTruthy();
 expect(screen.getByText(new RegExp(`Laagste op dit niveau: A met`))).toBeTruthy();
 // hoger gaan: de zwakke sondering kleurt rood of oranje
 fireEvent.change(screen.getByRole('slider'),{target:{value:'0'}});
 const a=[...svg.querySelectorAll('.capacity-map-point')].find(g=>g.textContent?.includes('A'))!;
 expect(m.toeNaps[0]).toBeGreaterThan(cell.toeNap!);
 expect(a.getAttribute('class')).toMatch(/band-(low|short)/);
 fireEvent.click(a);
 expect(focused).toEqual(['A']);
});

it('meldt het als geen enkele sondering een positie heeft',()=>{
 const none=new Map([['C',cpt('C',15)]]);
 const mm=computeCapacityMatrix(base,none,{cptIds:['C'],toeNaps:[-13,-14],sizesMm:[220],targetKn:{minKn:100,maxKn:200}});
 render(<GoverningOverview m={mm} cpts={none} targetsKn={[100]} sizeLabel={s=>`□${s}`} focus={()=>{}} />);
 expect(screen.queryByRole('img')).toBeNull();
 expect(screen.getByText(/Geen van de sonderingen heeft een positie/)).toBeTruthy();
});
