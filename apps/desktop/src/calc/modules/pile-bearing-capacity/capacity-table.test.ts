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

import {invalidReason,computeCapacityMatrix,chooseLevels,defaultCapacityConfig,levelRange,parseSizes,sizeInput,matrixCellInput,band,standardSizes} from './capacity-table';

it('leest paalmaten en maakt een niveaureeks van boven naar beneden',()=>{
 expect(parseSizes('290 180; 220,250')).toEqual([180,220,250,290]);
 expect(()=>parseSizes('180 180')).toThrow();
 expect(()=>parseSizes('0')).toThrow();
 expect(levelRange(-12,-14,.5)).toEqual([-12,-12.5,-13,-13.5,-14]);
 expect(levelRange(-14,-12,.5)).toEqual([-12,-12.5,-13,-13.5,-14]);
 expect(()=>levelRange(-12,-14,0)).toThrow();
 expect(standardSizes('concrete-prefab-prestressed-driven')).toEqual([180,220,250,290,320,350,400,450]);
});
it('neemt de ontwerpbelasting als ondergrens van de zoekband als die bekend is',()=>{
 expect(defaultCapacityConfig({...base,nEd:0},['A']).targetKn).toEqual({minKn:500,maxKn:1000});
 expect(defaultCapacityConfig({...base,nEd:600},['A']).targetKn).toEqual({minKn:600,maxKn:1200});
 const c=defaultCapacityConfig(base,['A','B']);
 expect(c.toeNaps[0]).toBeCloseTo(base.pileToeNap+2.5,9);
 expect(c.toeNaps).toHaveLength(11);
});
it('schaalt EA en de voet mee met de paalmaat en laat de bron ongemoeid',()=>{
 const withEa={...base,axialStiffnessKn:1000,baseDiameterMm:base.diameterMm*1.5};
 const s=sizeInput(withEa,2*base.diameterMm);
 expect(s.axialStiffnessKn).toBeCloseTo(4000,9);
 expect(s.baseDiameterMm).toBeCloseTo(3*base.diameterMm,9);
 expect(sizeInput(withEa,base.diameterMm)).toBe(withEa);
 expect(matrixCellInput(base,'B',250,-13)).toMatchObject({cptId:'B',diameterMm:250,pileToeNap:-13});
});
it('rekent iedere matrixcel gelijk aan de losse berekening en een grotere maat draagt meer',()=>{
 const m=computeCapacityMatrix(base,cpts,{cptIds:['A','B'],toeNaps:[-14,-13],sizesMm:[220,290],targetKn:{minKn:500,maxKn:1000}});
 expect(m.toeNaps).toEqual([-13,-14]);
 for(const c of m.cpts)c.cells.forEach((row,si)=>row.forEach(cell=>{
  const r=computePile(matrixCellInput(base,c.cptId,m.sizesMm[si],cell.toeNap),cpts.get(c.cptId)!);
  expect(cell.result.summary.rcNetD).toBe(r.summary.rcNetD);
 }));
 expect(m.cpts[0].cells[1][0].result.summary.rcNetD).toBeGreaterThan(m.cpts[0].cells[0][0].result.summary.rcNetD);
});
it('kiest per maat het hoogste puntniveau dat de ondergrens haalt en geeft de spreiding',()=>{
 const m=computeCapacityMatrix(base,cpts,{cptIds:['A','B'],toeNaps:levelRange(-8,-14,.5),sizesMm:[250],targetKn:{minKn:300,maxKn:600}});
 const [choice]=chooseLevels(m);
 for(const p of choice.perCpt){
  const row=m.cpts.find(c=>c.cptId===p.cptId)!.cells[0];
  const i=row.findIndex(c=>c.toeNap===p.toeNap);
  expect(row[i].result.summary.rcNetD).toBeGreaterThanOrEqual(300);
  // Eén niveau hoger haalt het niet: dit is de kortste paal die voldoet.
  if(i>0)expect(row[i-1].result.summary.rcNetD).toBeLessThan(300);
 }
 // B (qc 15) is sterker dan A (qc 10): korter, dus hoger puntniveau.
 const [a,b]=choice.perCpt;
 expect(b.toeNap!).toBeGreaterThan(a.toeNap!);
 expect(choice.spreadM).toBeCloseTo(a.toeNap!>b.toeNap!?a.toeNap!-b.toeNap!:b.toeNap!-a.toeNap!,9);
 expect(choice.reached).toBe(2);
});
it('meldt niet gehaald, te ruim en terugval in een diepere laag',()=>{
 const m=computeCapacityMatrix(base,cpts,{cptIds:['A'],toeNaps:[-13,-14],sizesMm:[220],targetKn:{minKn:1e6,maxKn:2e6}});
 expect(chooseLevels(m)[0].perCpt[0]).toMatchObject({toeNap:null,rcNetD:null});
 expect(chooseLevels(m)[0].spreadM).toBeNull();
 const ruim=computeCapacityMatrix(base,cpts,{cptIds:['A'],toeNaps:[-13,-14],sizesMm:[220],targetKn:{minKn:1,maxKn:2}});
 expect(chooseLevels(ruim)[0].perCpt[0]).toMatchObject({toeNap:-13,aboveMax:true});
 // Kunstmatige terugval: een diepere cel onder de ondergrens.
 const fake=structuredClone(ruim);fake.toeNaps.push(-15);
 fake.cpts[0].cells[0].push({sizeMm:220,toeNap:-15,result:{...ruim.cpts[0].cells[0][0].result,summary:{...ruim.cpts[0].cells[0][0].result.summary,rcNetD:0}}});
 expect(chooseLevels(fake)[0].perCpt[0].dropsDeeper).toBe(true);
 expect(band(400,{minKn:500,maxKn:1000})).toBe('under');
 expect(band(500,{minKn:500,maxKn:1000})).toBe('within');
 expect(band(1001,{minKn:500,maxKn:1000})).toBe('over');
});
it('rekent een volle tabel (8 maten × 11 niveaus × 10 sonderingen) binnen een redelijke tijd',()=>{
 const many=new Map(Array.from({length:10},(_,i)=>[`S${i}`,cpt(`S${i}`,8+i)] as const));
 const t=performance.now();
 const m=computeCapacityMatrix(base,many,{cptIds:[...many.keys()],toeNaps:levelRange(-12,-17,.5),sizesMm:[180,220,250,290,320,350,400,450],targetKn:{minKn:500,maxKn:1000}});
 const ms=performance.now()-t;
 console.log(`volle tabel: ${m.cpts.length*m.sizesMm.length*m.toeNaps.length} cellen in ${ms.toFixed(0)} ms`);
 expect(ms).toBeLessThan(10000);
});
it('geeft een korte reden voor cellen die niet te berekenen zijn',()=>{
 expect(invalidReason('Sondering te ondiep (reikt tot 12.0 m, vereist ≥ 12.4 m)')).toBe('sondering buiten bereik');
 expect(invalidReason('Kleefniveaus moeten tussen paalkop en paalpunt liggen')).toBe('boven kleefzone');
 expect(invalidReason('Geef de projectspecifieke axiale stijfheid EA voor dit paaltype op')).toBe('EA ontbreekt');
 const short=new Map([['K',{...cpt('K',12),points:cpt('K',12).points.slice(0,60)}]]);
 const m=computeCapacityMatrix(base,short,{cptIds:['K'],toeNaps:[-5,-12],sizesMm:[250],targetKn:{minKn:1e5,maxKn:2e5}});
 expect(chooseLevels(m)[0].perCpt[0]).toMatchObject({toeNap:null,cptTooShort:true});
});
it('legt de standaard paalpunt binnen een ondiepe sondering, zodat de eerste berekening rekent',()=>{
 const shallow=new Map([['K',{...cpt('K',12),points:cpt('K',12).points.slice(0,121)}]]);
 const inp=pileBearingCapacityModule.defaultInput({cpts:shallow,activeCptId:'K',projectMeta:{title:'',client:'',location:'',project_number:'',author:'',date:''}}) as PileInput;
 expect(inp.pileToeNap).toBe(-10.5);
 expect(computePile(inp,shallow.get('K')!).ok).toBe(true);
 expect(base.pileToeNap).toBe(-14);
});

import {buildPileReport} from './parts/build-report';
it('zet gekozen voorbeeldberekeningen en daarna de tabellen in de uitdraai',()=>{
 const meta={title:'Proef',client:'',location:'',project_number:'1',author:'',date:'2026-11-06'};
 const input={...base,capacityTable:{cptIds:['A','B'],toeNaps:[-12,-13,-14],sizesMm:[220,290],targetKn:{minKn:300,maxKn:600},
  examples:[{cptId:'A',sizeMm:290,toeNap:-13},{cptId:'B',sizeMm:220,toeNap:-12}]}};
 const text=new TextDecoder('latin1').decode(buildPileReport(input,computePile(input,cpts.get('A')!),{cpts,activeCptId:'A',projectMeta:meta}));
 expect(text).toContain('A · 290 mm · NAP -13'.replace('·','\xb7').replace('·','\xb7'));
 expect(text).toContain('Draagvermogentabellen');
 expect(text).toContain('Keuzetabel');
 expect(text).toContain('Sondering B: Rc;net;d [kN]');
 // Verschillende maten: geen statistische eindanalyse over de voorbeelden.
 expect(text).not.toContain('Berekening netto maatgevend paaldraagvermogen');
 // Zonder tabelinstellingen blijft het rapport zoals het was.
 const plain=new TextDecoder('latin1').decode(buildPileReport(base,computePile(base,cpts.get('A')!),{cpts,activeCptId:'A',projectMeta:meta}));
 expect(plain).not.toContain('Draagvermogentabellen');
 expect(plain).toContain('Berekening netto maatgevend paaldraagvermogen');
});
it('weigert een voorbeeld dat niet berekenbaar is met een duidelijke melding',()=>{
 const meta={title:'',client:'',location:'',project_number:'',author:'',date:''};
 const input={...base,capacityTable:{cptIds:['A'],toeNaps:[-30],examples:[{cptId:'A',sizeMm:250,toeNap:-30}]}};
 expect(()=>buildPileReport(input,computePile(base,cpts.get('A')!),{cpts,activeCptId:'A',projectMeta:meta})).toThrow(/Voorbeeld A, 250 mm op -30 m NAP is niet berekenbaar/);
});
