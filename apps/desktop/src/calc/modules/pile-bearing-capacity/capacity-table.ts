import type {Cpt} from '../../../types/cpt';
import type {PileErrorCode,PileInput,PileResult} from './types';
import {ct} from '../../i18n';
import {computePile} from './compute';
import {seriesFor,type Presets} from './standard-sizes';
import {PILE_TYPE_CATALOG,getPileType} from './catalog';
import {applyStandard} from './standards';
import type {PileTypeSpec} from './types';

export type CapacityTableConfig=NonNullable<PileInput['capacityTable']>;
const msg=(key:string,nl:string,vars?:Record<string,unknown>)=>ct('calcPileCore',key,nl,vars);
export function parseToeLevels(text:string):number[] {
 const tokens=text.split(/[;\n]/).map(v=>v.trim()).filter(Boolean);
 const levels=tokens.map(v=>Number(v.replace(',','.')));
 if(!levels.length||levels.some(v=>!Number.isFinite(v)))throw new Error(msg('table.errors.toeLevelsInvalid','Geef eindige puntniveaus op, één per regel of gescheiden met puntkomma.'));
 if(new Set(levels).size!==levels.length)throw new Error(msg('table.errors.toeLevelsDuplicate','Ieder puntniveau mag maar één keer voorkomen.'));
 return levels;
}
export function validateCapacityTable(config:CapacityTableConfig):void {
 if(!config||!Array.isArray(config.cptIds)||config.cptIds.some(id=>typeof id!=='string'||!id.trim())||new Set(config.cptIds).size!==config.cptIds.length)
  throw new Error(msg('table.errors.cptIdsInvalid','Selecteer unieke sonderingnamen voor de tabel.'));
 if(!Array.isArray(config.toeNaps)||!config.toeNaps.length||config.toeNaps.some(n=>typeof n!=='number'||!Number.isFinite(n))||new Set(config.toeNaps).size!==config.toeNaps.length)
  throw new Error(msg('table.errors.toeNapsInvalid','De tabel vereist unieke, eindige puntniveaus.'));
 if(config.targetsKn!==undefined&&(!Array.isArray(config.targetsKn)||config.targetsKn.some(n=>typeof n!=='number'||!Number.isFinite(n)||n<=0)||new Set(config.targetsKn).size!==config.targetsKn.length))
  throw new Error(msg('table.errors.targetsInvalid','Geef unieke, positieve draagvermogens in kN op.'));
 if(config.extraTypes!==undefined&&(!Array.isArray(config.extraTypes)||config.extraTypes.some(t=>!t||typeof t.pileTypeId!=='string'||!getPileType(t.pileTypeId)||!Array.isArray(t.sizesMm)||!t.sizesMm.length||t.sizesMm.some(n=>typeof n!=='number'||!Number.isFinite(n)||n<=0))
  ||new Set(config.extraTypes.map(t=>t.pileTypeId)).size!==config.extraTypes.length))
  throw new Error(msg('table.errors.extraTypesInvalid','Geef per extra paaltype een bekend type en positieve paalmaten op; ieder type één keer.'));
}
export function tableCellInput(base:PileInput,cptId:string,toeNap:number):PileInput {
 return {...base,cptId,pileToeNap:toeNap};
}
export function computeCapacityTable(base:PileInput,cpts:Map<string,Cpt>,config:CapacityTableConfig):Array<{cptId:string;cells:Array<{toeNap:number;result:PileResult;notes:string[]}>}> {
 validateCapacityTable(config);
 return config.cptIds.map(cptId=>({cptId,cells:config.toeNaps.map(toeNap=>({toeNap,result:computePile(tableCellInput(base,cptId,toeNap),cpts.get(cptId)??null),notes:Math.min(...base.soilProfile.map(l=>l.endNap))>toeNap+1e-9?[msg('table.notes.profileAboveToe','Grondprofiel eindigt boven de paalpunt. Controleer en verleng de grondlagen; ontbrekende schachtlagen dragen niet bij.')]:[]}))}));
}

/* ------------------------------------------------------------------ */
/* Draagvermogen per sondering × paalmaat × puntniveau, met keuze.     */
/* ------------------------------------------------------------------ */

/** Maatreeks voor een paaltype, met eigen reeksen uit de instellingen van de berekening. */
export function standardSizes(pileTypeId:string,presets?:Presets):number[]|undefined {return seriesFor(pileTypeId,presets).sizes;}

/** Lijst draagvermogens [kN], oplopend; leeg is toegestaan. */
export function parseTargets(text:string):number[] {
 const tokens=text.split(/[;\s]+/).map(v=>v.trim()).filter(Boolean);
 const values=tokens.map(v=>Number(v.replace(',','.')));
 if(values.some(v=>!Number.isFinite(v)||v<=0))throw new Error(msg('table.errors.targetsInvalid','Geef unieke, positieve draagvermogens in kN op.'));
 return [...new Set(values)].sort((a,b)=>a-b);
}
export function parseSizes(text:string):number[] {
 const tokens=text.split(/[;\n,\s]+/).map(v=>v.trim()).filter(Boolean);
 const sizes=tokens.map(Number);
 if(!sizes.length||sizes.some(v=>!Number.isFinite(v)||v<=0))throw new Error(msg('table.errors.sizesInvalid','Geef positieve paalmaten in mm op, gescheiden met spatie, komma of puntkomma.'));
 if(new Set(sizes).size!==sizes.length)throw new Error(msg('table.errors.sizesDuplicate','Iedere paalmaat mag maar één keer voorkomen.'));
 return [...sizes].sort((a,b)=>a-b);
}
/** Niveaus van boven naar beneden, inclusief beide grenzen als de stap past. */
export function levelRange(fromNap:number,toNap:number,stepM:number):number[] {
 if(![fromNap,toNap,stepM].every(Number.isFinite)||stepM<=0)throw new Error(msg('table.errors.levelRangeInvalid','Geef een eindig bovenste en onderste niveau en een positieve stap op.'));
 const top=Math.max(fromNap,toNap),bottom=Math.min(fromNap,toNap),n=Math.floor((top-bottom)/stepM+1e-9);
 if(n>200)throw new Error(msg('table.errors.tooManyLevels','Maximaal {{max}} puntniveaus; kies een grotere stap.',{max:200}));
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
  targetsKn:c?.targetsKn??[],
  extraTypes:c?.extraTypes??[],
  examples:c?.examples??[],
 };
}

/** Andere maat: EA en een verbrede voet schalen mee met de doorsnede. */
export function sizeInput(base:PileInput,sizeMm:number):PileInput {
 if(sizeMm===base.diameterMm)return base;
 const r=sizeMm/base.diameterMm;
 return {...base,diameterMm:sizeMm,sideBMm:undefined,
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
/** Soort reden voor een cel die niet te berekenen is. De foutcode uit de
 *  berekening wint; zonder code wordt de (Nederlandse) fouttekst herkend. */
export type InvalidKind=PileErrorCode|'notComputable';
export function invalidKind(error:string|undefined,code?:PileErrorCode):InvalidKind {
 if(code)return code;
 if(!error)return 'notComputable';
 if(/te ondiep/i.test(error))return 'cptTooShort';
 if(/kleefniveaus/i.test(error))return 'kleefLevels';
 if(/EA/.test(error))return 'eaMissing';
 return 'notComputable';
}
const INVALID_REASON:Record<InvalidKind,string>={
 cptTooShort:'sondering buiten bereik',
 kleefLevels:'boven kleefzone',
 eaMissing:'EA ontbreekt',
 factorsMissing:'geen paalfactoren',
 notComputable:'niet berekenbaar',
};
/** Korte reden voor een cel die niet te berekenen is, in de actieve taal. */
export function invalidReason(error:string|undefined,code?:PileErrorCode):string {
 const kind=invalidKind(error,code);
 return msg(`table.reasons.${kind}`,INVALID_REASON[kind]);
}
export interface CptMatrix {cptId:string;missing:boolean;profileNote:string|null;cells:MatrixCell[][]} // [maat][niveau]
export interface CapacityMatrix {sizesMm:number[];toeNaps:number[];target:{minKn:number;maxKn:number};cpts:CptMatrix[]}

export function computeCapacityMatrix(base:PileInput,cpts:Map<string,Cpt>,config:CapacityTableConfig):CapacityMatrix {
 validateCapacityTable(config);
 const sizesMm=config.sizesMm?.length?config.sizesMm:[base.diameterMm];
 if(sizesMm.some(v=>!Number.isFinite(v)||v<=0))throw new Error(msg('table.errors.sizesNotPositive','Paalmaten moeten positief zijn.'));
 const target=config.targetKn??{minKn:0,maxKn:Infinity};
 if(!(target.minKn>=0)||!(target.maxKn>target.minKn))throw new Error(msg('table.errors.targetRangeInvalid','De bovengrens van het gezochte draagvermogen moet boven de ondergrens liggen.'));
 const toeNaps=[...config.toeNaps].sort((a,b)=>b-a);
 const profileBottom=Math.min(...base.soilProfile.map(l=>l.endNap));
 const deepest=toeNaps[toeNaps.length-1];
 return {sizesMm,toeNaps,target,cpts:config.cptIds.map(cptId=>{
  const cpt=cpts.get(cptId)??null;
  return {cptId,missing:!cpt,
   profileNote:profileBottom>deepest+1e-9?msg('table.notes.profileAboveDeepest','Grondprofiel eindigt op {{level}} m NAP, boven het diepste puntniveau.',{level:profileBottom.toFixed(2)}):null,
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
    cptTooShort:row.some(cell=>!cell.result.ok&&invalidKind(cell.result.error,cell.result.errorCode)==='cptTooShort')};
   const cell=row[idx];
   const dropsDeeper=row.slice(idx+1).some(x=>x.result.ok&&x.result.summary.rcNetD<m.target.minKn);
   return {cptId:c.cptId,toeNap:cell.toeNap,rcNetD:cell.result.summary.rcNetD,dropsDeeper,aboveMax:cell.result.summary.rcNetD>m.target.maxKn,cptTooShort:false};
  });
  const levels=perCpt.map(p=>p.toeNap).filter((v):v is number=>v!==null);
  const highestNap=levels.length?Math.max(...levels):null,lowestNap=levels.length?Math.min(...levels):null;
  return {sizeMm,perCpt,highestNap,lowestNap,spreadM:levels.length<2?null:Math.round((highestNap!-lowestNap!)*1000)/1000,reached:levels.length};
 });
}

/* ------------------------------------------------------------------ */
/* Maatgevend overzicht: één puntniveau voor alle sonderingen.         */
/* ------------------------------------------------------------------ */

/** Laagste Rc;net;d over de sonderingen voor één maat en niveau. */
export interface LevelMin {
 /** Laagste waarde over de berekende sonderingen; null als geen sondering berekend is. */
 rcMinD:number|null;
 /** Sondering met de laagste waarde. */
 cptId:string|null;
 /** Sonderingen zonder uitkomst op dit niveau (ontbreekt, te kort, niet berekenbaar). */
 invalid:string[];
}
export function levelMin(m:CapacityMatrix,sizeIndex:number,levelIndex:number):LevelMin {
 let rcMinD:number|null=null,cptId:string|null=null;const invalid:string[]=[];
 for(const c of m.cpts){
  const r=c.cells[sizeIndex][levelIndex].result;
  if(!r.ok){invalid.push(c.cptId);continue;}
  if(rcMinD===null||r.summary.rcNetD<rcMinD){rcMinD=r.summary.rcNetD;cptId=c.cptId;}
 }
 return {rcMinD,cptId,invalid};
}
export interface GoverningCell {
 targetKn:number;sizeMm:number;
 /** Alle sonderingen halen het draagvermogen op toeNap. */
 reached:boolean;
 /** Gehaald: hoogste niveau waarop iedere sondering voldoet. Niet gehaald: niveau met de hoogste laagste waarde. */
 toeNap:number|null;
 /** Laagste Rc;net;d over de sonderingen op toeNap. */
 rcMinD:number|null;
 /** Sondering die op toeNap de laagste waarde geeft. */
 governingCptId:string|null;
 /** Sonderingen die op toeNap niet voldoen of geen uitkomst hebben; leeg als gehaald. */
 failing:string[];
}
export interface GoverningRow {targetKn:number;cells:GoverningCell[]}
/**
 * Per draagvermogen en paalmaat het hoogste puntniveau waarop álle sonderingen
 * voldoen, met de sondering die daar maatgevend is.
 */
export function governingLevels(m:CapacityMatrix,targetsKn:number[]):GoverningRow[] {
 return targetsKn.map(targetKn=>({targetKn,cells:m.sizesMm.map((sizeMm,si)=>{
  const mins=m.toeNaps.map((_,li)=>levelMin(m,si,li));
  const hit=mins.findIndex(x=>!x.invalid.length&&x.rcMinD!==null&&x.rcMinD>=targetKn);
  if(hit>=0)return {targetKn,sizeMm,reached:true,toeNap:m.toeNaps[hit],rcMinD:mins[hit].rcMinD,governingCptId:mins[hit].cptId,failing:[]};
  let best=-1;
  mins.forEach((x,li)=>{if(x.rcMinD!==null&&!x.invalid.length&&(best<0||x.rcMinD>mins[best].rcMinD!))best=li;});
  if(best<0)mins.forEach((x,li)=>{if(x.rcMinD!==null&&(best<0||x.invalid.length<mins[best].invalid.length||(x.invalid.length===mins[best].invalid.length&&x.rcMinD>mins[best].rcMinD!)))best=li;});
  if(best<0)return {targetKn,sizeMm,reached:false,toeNap:null,rcMinD:null,governingCptId:null,failing:m.cpts.map(c=>c.cptId)};
  const failing=m.cpts.filter(c=>{const r=c.cells[si][best].result;return !r.ok||r.summary.rcNetD<targetKn;}).map(c=>c.cptId);
  return {targetKn,sizeMm,reached:false,toeNap:m.toeNaps[best],rcMinD:mins[best].rcMinD,governingCptId:mins[best].cptId,failing};
 })}));
}
/** Hoe vaak iedere sondering maatgevend is in het overzicht, vaakst eerst. */
export function governingCount(rows:GoverningRow[]):Array<{cptId:string;count:number}> {
 const n=new Map<string,number>();
 for(const row of rows)for(const c of row.cells)if(c.governingCptId)n.set(c.governingCptId,(n.get(c.governingCptId)??0)+1);
 return [...n].map(([cptId,count])=>({cptId,count})).sort((a,b)=>b.count-a.count||a.cptId.localeCompare(b.cptId));
}
/** Draagvermogens voor het overzicht: de ondergrens van de zoekband plus de extra waarden. */
export function overviewTargets(config:{targetKn?:{minKn:number;maxKn:number};targetsKn?:number[]}):number[] {
 return [...new Set([...(config.targetKn&&config.targetKn.minKn>0?[config.targetKn.minKn]:[]),...(config.targetsKn??[])])].sort((a,b)=>a-b);
}

/* ------------------------------------------------------------------ */
/* Meerdere paaltypes naast elkaar in het maatgevende overzicht.       */
/* ------------------------------------------------------------------ */

/** Kleurklasse van een sondering: verhouding Rc;net;d tot het gezochte draagvermogen. */
export type MapBand='none'|'low'|'short'|'ok'|'ample';
export function mapBand(rcNetD:number|null,targetKn:number):MapBand {
 if(rcNetD===null)return 'none';
 const r=rcNetD/targetKn;
 return r<.8?'low':r<1?'short':r<1.25?'ok':'ample';
}
/**
 * Paaltypes die zonder extra invoer naast het hoofdtype te rekenen zijn:
 * toegestaan onder de gekozen norm, geen hout en geen type dat een eigen EA vraagt.
 */
export function comparableTypes(input:PileInput):PileTypeSpec[] {
 return PILE_TYPE_CATALOG.filter(t=>t.id!==input.pileTypeId&&t.material!=='wood'&&!t.requiresEA&&!!applyStandard(t,input.standard));
}
/** Dezelfde invoer met een ander paaltype; wat bij één paalsysteem hoort vervalt. */
export function typeInput(base:PileInput,pileTypeId:string):PileInput {
 if(pileTypeId===base.pileTypeId)return base;
 return {...base,pileTypeId,projectFactors:undefined,axialStiffnessKn:undefined,baseDiameterMm:undefined,timberTaper:undefined,concreteExtension:undefined};
}
/** Eén paaltype met zijn maatreeks, gerekend op dezelfde sonderingen en puntniveaus. */
export interface PileSystem {pileTypeId:string;main:boolean;m:CapacityMatrix}
export function computeSystems(base:PileInput,cpts:Map<string,Cpt>,config:CapacityTableConfig):PileSystem[] {
 const main=computeCapacityMatrix(base,cpts,config);
 return [{pileTypeId:base.pileTypeId,main:true,m:main},
  ...(config.extraTypes??[]).filter(t=>t.pileTypeId!==base.pileTypeId).map(t=>({pileTypeId:t.pileTypeId,main:false,
   m:computeCapacityMatrix(typeInput(base,t.pileTypeId),cpts,{...config,sizesMm:t.sizesMm})}))];
}
