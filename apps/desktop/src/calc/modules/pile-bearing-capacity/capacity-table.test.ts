import {expect,it} from 'vitest';
import {computeCapacityTable,tableCellInput,parseToeLevels} from './capacity-table';
import {pileBearingCapacityModule} from './module';
import {computePile} from './compute';
import type {PileInput} from './types';
import type {Cpt} from '../../../types/cpt';

const cpt=(id:string,qc:number):Cpt=>({id,metadata:{source_file:'synthetisch',ground_level_nap:0},points:Array.from({length:251},(_,i)=>({depth:i*.1,depth_nap:-i*.1,qc}))});
const cpts=new Map([['A',cpt('A',10)],['B',cpt('B',15)]]);
const base=pileBearingCapacityModule.defaultInput({cpts,activeCptId:'A',projectMeta:{title:'',client:'',location:'',project_number:'',author:'',date:''}}) as PileInput;

it('rekent iedere cel met dezelfde invoer als de detailberekening zonder bronmutatie',()=>{
 const before=structuredClone(base);
 const rows=computeCapacityTable(base,cpts,{cptIds:['A','B'],toeNaps:[-13,-14]});
 expect(rows).toHaveLength(2);
 for(const row of rows)for(const cell of row.cells){
  const result=computePile(tableCellInput(base,row.cptId,cell.toeNap),cpts.get(row.cptId)!);
  expect(result.ok).toBe(true);
  expect(cell.result.summary.rcNetD).toBe(result.summary.rcNetD);
 }
 expect(rows[1].cells[0].result.summary.rcNetD).toBeGreaterThan(rows[0].cells[0].result.summary.rcNetD);
 expect(base).toEqual(before);
});
it('bewaart ontbrekende CPT en ongeldige puntniveaus als expliciete fouten',()=>{
 const rows=computeCapacityTable(base,cpts,{cptIds:['weg','A'],toeNaps:[-14,1]});
 expect(rows[0].cells[0].result.ok).toBe(false);
 expect(rows[1].cells[1].result.ok).toBe(false);
});
it('meldt een grondprofiel dat niet tot het gekozen puntniveau doorloopt',()=>{
 const rows=computeCapacityTable(base,cpts,{cptIds:['A'],toeNaps:[-15]});
 expect(rows[0].cells[0].notes.join(' ')).toMatch(/grondprofiel/i);
});
it('leest NAP-niveaus met decimale komma en weigert lege of ongeldige invoer',()=>{
 expect(parseToeLevels('-13,5\n-14; -14,5')).toEqual([-13.5,-14,-14.5]);
 expect(()=>parseToeLevels('')).toThrow();
 expect(()=>parseToeLevels('-14; tekst')).toThrow();
 expect(()=>parseToeLevels('-14; -14')).toThrow();
});
