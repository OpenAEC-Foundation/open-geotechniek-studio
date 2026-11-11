import type {Cpt} from '../../../types/cpt';
import type {PileInput,PileResult} from './types';
import {computePile} from './compute';
import {seriesFor,type Presets} from './standard-sizes';

export type CapacityTableConfig=NonNullable<PileInput['capacityTable']>;
export function parseToeLevels(text:string):number[] {
 const tokens=text.split(/[;\n]/).map(v=>v.trim()).filter(Boolean);
 const levels=tokens.map(v=>Number(v.replace(',','.')));
 if(!levels.length||levels.some(v=>!Number.isFinite(v)))throw new Error('Geef eindige puntniveaus op, één per regel of gescheiden met puntkomma.');
 if(new Set(levels).size!==levels.length)throw new Error('Ieder puntniveau mag maar één keer voorkomen.');
 return levels;
}
export function validateCapacityTable(config:CapacityTableConfig):void {
 if(!config||!Array.isArray(config.cptIds)||config.cptIds.some(id=>typeof id!=='string'||!id.trim())||new Set(config.cptIds).size!==config.cptIds.length)
  throw new Error('Selecteer unieke sonderingnamen voor de tabel.');
 if(!Array.isArray(config.toeNaps)||!config.toeNaps.length||config.toeNaps.some(n=>typeof n!=='number'||!Number.isFinite(n))||new Set(config.toeNaps).size!==config.toeNaps.length)
  throw new Error('De tabel vereist unieke, eindige puntniveaus.');
}
export function tableCellInput(base:PileInput,cptId:string,toeNap:number):PileInput {
 return {...base,cptId,pileToeNap:toeNap};
}
export function computeCapacityTable(base:PileInput,cpts:Map<string,Cpt>,config:CapacityTableConfig):Array<{cptId:string;cells:Array<{toeNap:number;result:PileResult;notes:string[]}>}> {
 validateCapacityTable(config);
 return config.cptIds.map(cptId=>({cptId,cells:config.toeNaps.map(toeNap=>({toeNap,result:computePile(tableCellInput(base,cptId,toeNap),cpts.get(cptId)??null),notes:Math.min(...base.soilProfile.map(l=>l.endNap))>toeNap+1e-9?['Grondprofiel eindigt boven de paalpunt. Controleer en verleng de grondlagen; ontbrekende schachtlagen dragen niet bij.']:[]}))}));
}

/* ------------------------------------------------------------------ */
/* Draagvermogen per sondering × paalmaat × puntniveau, met keuze.     */
/* ------------------------------------------------------------------ */

/** Maatreeks voor een paaltype, met eigen reeksen uit de instellingen van de berekening. */
export function standardSizes(pileTypeId:string,presets?:Presets):number[]|undefined {return seriesFor(pileTypeId,presets).sizes;}

export function parseSizes(text:string):number[] {
 const tokens=text.split(/[;\n,\s]+/).map(v=>v.trim()).filter(Boolean);
 const sizes=tokens.map(Number);
 if(!sizes.length||sizes.some(v=>!Number.isFinite(v)||v<=0))throw new Error('Geef positieve paalmaten in mm op, gescheiden met spatie, komma of puntkomma.');
 if(new Set(sizes).size!==sizes.length)throw new Error('Iedere paalmaat mag maar één keer voorkomen.');
 return [...sizes].sort((a,b)=>a-b);
}
/** Niveaus van boven naar beneden, inclusief beide grenzen als de stap past. */
export function levelRange(fromNap:number,toNap:number,stepM:number):number[] {
 if(![fromNap,toNap,stepM].every(Number.isFinite)||stepM<=0)throw new Error('Geef een eindig bovenste en onderste niveau en een positieve stap op.');
 const top=Math.max(fromNap,toNap),bottom=Math.min(fromNap,toNap),n=Math.floor((top-bottom)/stepM+1e-9);
 if(n>200)throw new Error('Maximaal 200 puntniveaus; kies een grotere stap.');
 return Array.from({length:n+1},(_,i)=>Math.round((top-i*stepM)*1000)/1000);
}

export function defaultCapacityConfig(input:PileInput,cptIds:string[]):Required<CapacityTableConfig> {
 const c=input.capacityTable;
 const target=input.nEd>0?{minKn:Math.round(input.nEd),maxKn:Math.round(2*input.nEd)}:{minKn:500,maxKn:1000};
 return {
  cptIds:c?.cptIds??cptIds,
  toeNaps:c?.toeNaps??levelRange(input.pileToeNap+2.5,input.pileToeNap-2.5,.5),
  sizesMm:c?.sizesMm??[input.diameterMm],
  targetKn:c?.targetKn??target,
  examples:c?.examples??[],
 };
}

/** Andere maat: EA en een verbrede voet schalen mee met de doorsnede. */
export function sizeInput(base:PileInput,sizeMm:number):PileInput {
 if(sizeMm===base.diameterMm)return base;
 const r=sizeMm/base.diameterMm;
 return {...base,diameterMm:sizeMm,
  axialStiffnessKn:base.axialStiffnessKn===undefined?undefined:base.axialStiffnessKn*r*r,
  baseDiameterMm:base.baseDiameterMm===undefined?undefined:base.baseDiameterMm*r};
}
export function matrixCellInput(base:PileInput,cptId:string,sizeMm:number,toeNap:number):PileInput {
 return tableCellInput(sizeInput(base,sizeMm),cptId,toeNap);
}

export type Band='under'|'within'|'over';
export function band(rcNetD:number,target:{minKn:number;maxKn:number}):Band {
 return rcNetD<target.minKn?'under':rcNetD>target.maxKn?'over':'within';
}
export interface MatrixCell {sizeMm:number;toeNap:number;result:PileResult}
/** Korte reden voor een cel die niet te berekenen is. */
export function invalidReason(error:string|undefined):string {
 if(!error)return 'niet berekenbaar';
 if(/te ondiep/i.test(error))return 'sondering buiten bereik';
 if(/kleefniveaus/i.test(error))return 'boven kleefzone';
 if(/EA/.test(error))return 'EA ontbreekt';
 return 'niet berekenbaar';
}
export interface CptMatrix {cptId:string;missing:boolean;profileNote:string|null;cells:MatrixCell[][]} // [maat][niveau]
export interface CapacityMatrix {sizesMm:number[];toeNaps:number[];target:{minKn:number;maxKn:number};cpts:CptMatrix[]}

export function computeCapacityMatrix(base:PileInput,cpts:Map<string,Cpt>,config:CapacityTableConfig):CapacityMatrix {
 validateCapacityTable(config);
 const sizesMm=config.sizesMm?.length?config.sizesMm:[base.diameterMm];
 if(sizesMm.some(v=>!Number.isFinite(v)||v<=0))throw new Error('Paalmaten moeten positief zijn.');
 const target=config.targetKn??{minKn:0,maxKn:Infinity};
 if(!(target.minKn>=0)||!(target.maxKn>target.minKn))throw new Error('De bovengrens van het gezochte draagvermogen moet boven de ondergrens liggen.');
 const toeNaps=[...config.toeNaps].sort((a,b)=>b-a);
 const profileBottom=Math.min(...base.soilProfile.map(l=>l.endNap));
 const deepest=toeNaps[toeNaps.length-1];
 return {sizesMm,toeNaps,target,cpts:config.cptIds.map(cptId=>{
  const cpt=cpts.get(cptId)??null;
  return {cptId,missing:!cpt,
   profileNote:profileBottom>deepest+1e-9?`Grondprofiel eindigt op ${profileBottom.toFixed(2)} m NAP, boven het diepste puntniveau.`:null,
   cells:sizesMm.map(sizeMm=>toeNaps.map(toeNap=>({sizeMm,toeNap,result:computePile(matrixCellInput(base,cptId,sizeMm,toeNap),cpt)})))};
 })};
}

export interface LevelChoice {
 cptId:string;
 /** Hoogste puntniveau waarop Rc;net;d de ondergrens haalt; null = niet gehaald. */
 toeNap:number|null;rcNetD:number|null;
 /** Dieper zakt het draagvermogen weer onder de ondergrens (bijv. slappe laag). */
 dropsDeeper:boolean;
 /** Ook de kortste paal die voldoet zit boven de bovengrens: maat is ruim. */
 aboveMax:boolean;
 /** Niet gehaald omdat de sondering niet diep genoeg reikt. */
 cptTooShort:boolean;
}
/** spreadM: verschil hoogste–laagste niveau; alleen bij twee of meer sonderingen. */
export interface SizeChoice {sizeMm:number;perCpt:LevelChoice[];highestNap:number|null;lowestNap:number|null;spreadM:number|null;reached:number}

export function chooseLevels(m:CapacityMatrix):SizeChoice[] {
 return m.sizesMm.map((sizeMm,si)=>{
  const perCpt=m.cpts.map(c=>{
   const row=c.cells[si];
   const idx=row.findIndex(cell=>cell.result.ok&&cell.result.summary.rcNetD>=m.target.minKn);
   if(idx<0)return {cptId:c.cptId,toeNap:null,rcNetD:null,dropsDeeper:false,aboveMax:false,
    cptTooShort:row.some(cell=>!cell.result.ok&&invalidReason(cell.result.error)==='sondering buiten bereik')};
   const cell=row[idx];
   const dropsDeeper=row.slice(idx+1).some(x=>x.result.ok&&x.result.summary.rcNetD<m.target.minKn);
   return {cptId:c.cptId,toeNap:cell.toeNap,rcNetD:cell.result.summary.rcNetD,dropsDeeper,aboveMax:cell.result.summary.rcNetD>m.target.maxKn,cptTooShort:false};
  });
  const levels=perCpt.map(p=>p.toeNap).filter((v):v is number=>v!==null);
  const highestNap=levels.length?Math.max(...levels):null,lowestNap=levels.length?Math.min(...levels):null;
  return {sizeMm,perCpt,highestNap,lowestNap,spreadM:levels.length<2?null:Math.round((highestNap!-lowestNap!)*1000)/1000,reached:levels.length};
 });
}
