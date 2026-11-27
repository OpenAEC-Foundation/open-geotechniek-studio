import {expect,it} from 'vitest';
import {comparableTypes,computeSystems,defaultCapacityConfig,levelRange,matrixCellInput,typeInput,validateCapacityTable} from './capacity-table';
import {pileBearingCapacityModule} from './module';
import {computePile} from './compute';
import {buildPileReport} from './parts/build-report';
import type {PileInput} from './types';
import type {Cpt,ProjectMeta} from '../../../types/cpt';

const cpt=(id:string,qc:number,pos?:{x_rd:number;y_rd:number}):Cpt=>({id,metadata:{source_file:'synthetisch',ground_level_nap:0},position:pos,
 points:Array.from({length:251},(_,i)=>({depth:i*.1,depth_nap:-i*.1,qc}))});
const cpts=new Map([['A',cpt('A',10,{x_rd:100,y_rd:200})],['B',cpt('B',15,{x_rd:140,y_rd:230})],['C',cpt('C',15)]]);
const meta={title:'Proef',client:'',location:'',project_number:'P-1',author:'Opsteller',date:'2026-11-24'} as ProjectMeta;
const base=pileBearingCapacityModule.defaultInput({cpts,activeCptId:'A',projectMeta:meta}) as PileInput;
const config={cptIds:['A','B','C'],toeNaps:levelRange(-10,-18,1),sizesMm:[220,290],targetKn:{minKn:300,maxKn:600}};

it('biedt alleen paaltypes aan die zonder extra invoer te rekenen zijn',()=>{
 const types=comparableTypes(base);
 expect(types.length).toBeGreaterThan(0);
 expect(types.some(t=>t.id===base.pileTypeId)).toBe(false);
 expect(types.every(t=>t.material!=='wood'&&!t.requiresEA)).toBe(true);
 // onder de norm van 1991 is alleen de vierkante prefab referentiepaal onderbouwd
 expect(comparableTypes({...base,standard:'nen-6743-1991',pileTypeId:'steel-pipe-driven-closed-2017'}).map(t=>t.id)).toEqual(['concrete-prefab-prestressed-driven']);
});

it('rekent een extra paaltype op dezelfde sonderingen en niveaus, gelijk aan de losse berekening',()=>{
 const other=comparableTypes(base)[0].id;
 const before=structuredClone(base);
 const systems=computeSystems(base,cpts,{...config,extraTypes:[{pileTypeId:other,sizesMm:[250,300]}]});
 expect(systems).toHaveLength(2);
 expect(systems[1]).toMatchObject({pileTypeId:other,main:false});
 expect(systems[1].m.sizesMm).toEqual([250,300]);
 expect(systems[1].m.toeNaps).toEqual(systems[0].m.toeNaps);
 expect(systems[1].m.cpts.map(c=>c.cptId)).toEqual(['A','B','C']);
 const cell=systems[1].m.cpts[1].cells[1][3];
 const single=computePile(matrixCellInput(typeInput(base,other),'B',300,cell.toeNap),cpts.get('B')!);
 expect(cell.result.ok).toBe(true);
 expect(cell.result.summary.rcNetD).toBe(single.summary.rcNetD);
 expect(base).toEqual(before);
 // het hoofdtype als extra type telt niet dubbel
 expect(computeSystems(base,cpts,{...config,extraTypes:[{pileTypeId:base.pileTypeId,sizesMm:[220]}]})).toHaveLength(1);
});

it('laat bij een ander paaltype vervallen wat bij één paalsysteem hoort',()=>{
 const withOwn={...base,axialStiffnessKn:1000,baseDiameterMm:400};
 expect(typeInput(withOwn,base.pileTypeId)).toBe(withOwn);
 const next=typeInput(withOwn,'concrete-prefab-round');
 expect(next).toMatchObject({pileTypeId:'concrete-prefab-round',axialStiffnessKn:undefined,baseDiameterMm:undefined,projectFactors:undefined});
 expect(next.soilProfile).toBe(withOwn.soilProfile);
});

it('weigert onbekende of dubbele extra paaltypes en lege maatreeksen',()=>{
 const ok={cptIds:['A'],toeNaps:[-13]};
 expect(()=>validateCapacityTable({...ok,extraTypes:[{pileTypeId:'concrete-prefab-round',sizesMm:[250]}]})).not.toThrow();
 expect(()=>validateCapacityTable({...ok,extraTypes:[{pileTypeId:'bestaat-niet',sizesMm:[250]}]})).toThrow();
 expect(()=>validateCapacityTable({...ok,extraTypes:[{pileTypeId:'concrete-prefab-round',sizesMm:[]}]})).toThrow();
 expect(()=>validateCapacityTable({...ok,extraTypes:[{pileTypeId:'concrete-prefab-round',sizesMm:[250]},{pileTypeId:'concrete-prefab-round',sizesMm:[300]}]})).toThrow();
 expect(defaultCapacityConfig(base,['A']).extraTypes).toEqual([]);
});

it('neemt het maatgevende overzicht en de plattegrond op in de uitdraai',()=>{
 const other=comparableTypes(base)[0].id;
 const input={...base,capacityTable:{...config,targetsKn:[450],extraTypes:[{pileTypeId:other,sizesMm:[250,300]}]}} as PileInput;
 const result=computePile(input,cpts.get('A')!);
 const withOverview=new TextDecoder('latin1').decode(buildPileReport(input,result,{cpts,activeCptId:'A',projectMeta:meta}));
 for(const text of ['Maatgevend overzicht','Vaakst maatgevend','Plattegrond: 300 kN','Zonder positie, niet getekend: C','Keuzetabel'])
  expect(withOverview.includes(text),text).toBe(true);
 // zonder tabelinstellingen blijft het rapport zoals het was
 const plain=new TextDecoder('latin1').decode(buildPileReport(base,computePile(base,cpts.get('A')!),{cpts,activeCptId:'A',projectMeta:meta}));
 expect(plain.includes('Maatgevend overzicht')).toBe(false);
});
