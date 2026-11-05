import type {Cpt} from '../../../types/cpt';
import type {PileInput,PileResult} from './types';
import {computePile} from './compute';

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
