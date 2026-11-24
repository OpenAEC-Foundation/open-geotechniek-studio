import {afterEach,expect,it} from 'vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {GoverningOverview,mapBand,type OverviewSystem} from './GoverningOverview';
import {computeCapacityMatrix,computeSystems,governingLevels,levelRange} from '../capacity-table';
import {pileBearingCapacityModule} from '../module';
import type {PileInput} from '../types';
import type {Cpt} from '../../../../types/cpt';

afterEach(()=>cleanup());

const cpt=(id:string,qc:number,pos?:{x_rd:number;y_rd:number}):Cpt=>({id,metadata:{source_file:'synthetisch',ground_level_nap:0},position:pos,
 points:Array.from({length:251},(_,i)=>({depth:i*.1,depth_nap:-i*.1,qc}))});
const cpts=new Map([['A',cpt('A',10,{x_rd:100,y_rd:200})],['B',cpt('B',15,{x_rd:140,y_rd:230})],['C',cpt('C',15)]]);
const base=pileBearingCapacityModule.defaultInput({cpts,activeCptId:'A',projectMeta:{title:'',client:'',location:'',project_number:'',author:'',date:''}}) as PileInput;
const config={cptIds:['A','B','C'],toeNaps:levelRange(-10,-18,1),sizesMm:[220,290],targetKn:{minKn:500,maxKn:1000}};
const m=computeCapacityMatrix(base,cpts,config);
const target=Math.ceil(m.cpts[0].cells[0][2].result.summary.rcNetD);
const one:OverviewSystem[]=[{pileTypeId:base.pileTypeId,name:'Hoofdtype',circular:false,m}];

it('deelt sonderingen in naar de verhouding tot het gezochte draagvermogen',()=>{
 expect(mapBand(null,300)).toBe('none');
 expect(mapBand(200,300)).toBe('low');
 expect(mapBand(290,300)).toBe('short');
 expect(mapBand(300,300)).toBe('ok');
 expect(mapBand(400,300)).toBe('ample');
});

it('toont per draagvermogen het maatgevende niveau en kleurt de plattegrond op het gekozen niveau',()=>{
 const focused:string[]=[];
 render(<GoverningOverview systems={one} cpts={cpts} targetsKn={[target]} focus={id=>focused.push(id)} />);
 const cell=governingLevels(m,[target])[0].cells[0];
 const table=screen.getByRole('table',{name:'Maatgevend puntniveau per draagvermogen en paalmaat'});
 expect(within(table).getAllByRole('button')).toHaveLength(2);
 expect(within(table).getAllByText(/^A · /).length).toBeGreaterThan(0);
 // de plattegrond staat op het eerste haalbare niveau; A is daar maatgevend
 const svg=screen.getByRole('img');
 expect(svg.querySelectorAll('.capacity-map-point')).toHaveLength(3);
 expect(svg.querySelector('.capacity-map-point.is-governing')?.textContent).toContain('A');
 // de sondering zonder positie staat apart onder de plattegrond, met dezelfde kleurcode
 const loose=svg.querySelector('.capacity-map-loose')!;
 expect(loose.textContent).toContain('Zonder positie');
 expect(loose.querySelectorAll('.capacity-map-point')).toHaveLength(1);
 expect(loose.querySelector('.capacity-map-point')?.textContent).toContain('C');
 expect(screen.getByText(/Laagste op dit niveau: A met/)).toBeTruthy();
 // hoger gaan: de zwakke sondering kleurt rood of oranje
 fireEvent.change(screen.getByRole('slider'),{target:{value:'0'}});
 const a=[...svg.querySelectorAll('.capacity-map-point')].find(g=>g.textContent?.includes('A'))!;
 expect(m.toeNaps[0]).toBeGreaterThan(cell.toeNap!);
 expect(a.getAttribute('class')).toMatch(/band-(low|short)/);
 fireEvent.click(a);
 expect(focused).toEqual(['A']);
});

it('zet een tweede paaltype naast het hoofdtype in het overzicht en op de plattegrond',()=>{
 const systems=computeSystems(base,cpts,{...config,extraTypes:[{pileTypeId:'concrete-prefab-round',sizesMm:[250,300,350]}]});
 expect(systems.map(s=>s.main)).toEqual([true,false]);
 const shown:OverviewSystem[]=systems.map((s,i)=>({pileTypeId:s.pileTypeId,name:i?'Rond':'Hoofdtype',circular:i>0,m:s.m}));
 render(<GoverningOverview systems={shown} cpts={cpts} targetsKn={[target]} focus={()=>{}} />);
 const table=screen.getByRole('table',{name:'Maatgevend puntniveau per draagvermogen en paalmaat'});
 expect(within(table).getByRole('columnheader',{name:'Rond'}).getAttribute('colspan')).toBe('3');
 expect(within(table).getAllByRole('button')).toHaveLength(5);
 expect(within(table).getByRole('columnheader',{name:'Ø350'})).toBeTruthy();
 // de plattegrond volgt het gekozen paaltype
 const type=screen.getByRole('combobox',{name:'Paaltype'}) as HTMLSelectElement;
 fireEvent.change(type,{target:{value:'1'}});
 expect((screen.getByRole('combobox',{name:'Paalmaat'}) as HTMLSelectElement).options).toHaveLength(3);
 expect(screen.getByRole('img').getAttribute('aria-label')).toContain('Ø');
});

it('tekent sonderingen zonder positie ook als er geen plattegrond kan worden getekend',()=>{
 const none=new Map([['C',cpt('C',15)]]);
 const mm=computeCapacityMatrix(base,none,{cptIds:['C'],toeNaps:[-13,-14],sizesMm:[220],targetKn:{minKn:100,maxKn:200}});
 render(<GoverningOverview systems={[{pileTypeId:base.pileTypeId,name:'Hoofdtype',circular:false,m:mm}]} cpts={none} targetsKn={[100]} focus={()=>{}} />);
 expect(screen.getByText(/Geen van de sonderingen heeft een positie/)).toBeTruthy();
 const svg=screen.getByRole('img');
 expect(svg.querySelector('.capacity-map-frame')).toBeNull();
 expect(svg.querySelectorAll('.capacity-map-loose .capacity-map-point')).toHaveLength(1);
});
