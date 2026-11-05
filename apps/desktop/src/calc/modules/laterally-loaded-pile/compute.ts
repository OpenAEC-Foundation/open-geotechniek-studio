import type { BeamResult } from './beam';
import {solveFoundationBeam} from './nonlinear-beam';
import {equivalentLayers} from './nonlinear-soil';
import type {AnalysisMode,LayerCorrection,UltimateProfile,SpringState,ConvergenceInfo,EquivalentLayer} from './spring-types';
import { sectionCapacity, sectionStiffness, type PileSection } from './section';
import { springValue } from './soil';
export interface LateralLayer {
  topM:number; bottomM:number; springId:string; manualKhKnM3:number;
  frictionDeg:number; netPressureKpa:number;
  ultimate?:UltimateProfile;
}
export interface LateralInput {
  lengthM:number; maxElementM:number; headForceKn:number; headMomentKnM:number; nEdKn:number;
  headFixedRotation:boolean; toeFixed:boolean; springWidthM:number; scenario:'low'|'high';
  surchargeKpa:number; surchargeMode:'unresolved'|'retaining'; surchargeWidthM:number; surchargeSign:number;
  section:PileSection; layers:LateralLayer[];
  analysisMode?:AnalysisMode;layerCorrection?:LayerCorrection;
  /** Paalkop in m NAP; alleen voor invoer en weergave, de berekening rekent vanaf de kop. */
  headNap?:number;
}
export const lateralExample:LateralInput = {
  lengthM:12,maxElementM:.5,headForceKn:30,headMomentKnM:20,nEdKn:0,
  headFixedRotation:false,toeFixed:false,springWidthM:.4,scenario:'low',
  surchargeKpa:0,surchargeMode:'unresolved',surchargeWidthM:1,surchargeSign:1,
  section:{kind:'concrete-square',diameterMm:400,wallMm:10,concreteEMpa:30000,steelEMpa:210000,
    rebarEMpa:200000,concreteFactor:1,creepCoefficient:0,tubeParticipates:false,
    barCount:8,barDiameterMm:20,coverToBarCentreMm:50,fckMpa:30,fcdMpa:20,fydMpa:435,tubeFydMpa:355},
  analysisMode:'nonlinear',layerCorrection:'georgiadis',
  layers:[{topM:0,bottomM:4,springId:'clay-soft',manualKhKnM3:2000,frictionDeg:20,netPressureKpa:0,ultimate:{atSurfaceKnM:30,gradientKnM2:16.5,capKnM:90}},
    {topM:4,bottomM:12,springId:'sand-medium',manualKhKnM3:20000,frictionDeg:30,netPressureKpa:0,ultimate:{atSurfaceKnM:0,gradientKnM2:60,capKnM:500}}],
};
export type LateralResult = {ok:false;error:string} | {
  ok:true;beam:BeamResult; section:ReturnType<typeof sectionStiffness>;
  capacity:ReturnType<typeof sectionCapacity>|null;capacityError:string|null;
  maxMomentKnM:number;maxShearKn:number;maxDisplacementMm:number;sectionUtilization:number|null;
  resolvedLayers:Array<LateralLayer & {khKnM3:number;ka:number;lineLoadKnM:number;lineSpringKnM2:number}>;
  analysisMode:AnalysisMode;springs:SpringState[];convergence:ConvergenceInfo;layering:EquivalentLayer[];
};
export function computeLateral(input:LateralInput):LateralResult {
  try {
    if(!input || !Array.isArray(input.layers)||input.layers.length===0||input.layers.length>40 ||
      ![input.nEdKn,input.springWidthM,input.surchargeKpa,input.surchargeWidthM,input.surchargeSign].every(Number.isFinite)||
      input.springWidthM<=0||input.surchargeKpa<0||input.surchargeWidthM<=0||![1,-1].includes(input.surchargeSign)||
      !['low','high'].includes(input.scenario)||!['unresolved','retaining'].includes(input.surchargeMode))
      throw new Error('Ongeldige grond- of belastingsinvoer.');
    if(input.surchargeKpa>0&&input.surchargeMode!=='retaining')
      throw new Error('Kies een onderbouwd belastingmodel voor de bovenbelasting; q is geen automatische netto paaldruk.');
    const section=sectionStiffness(input.section);
    const analysisMode=input.analysisMode??'linear',correction=input.layerCorrection??'none';
    if(!['linear','nonlinear'].includes(analysisMode)||!['none','georgiadis'].includes(correction))throw new Error('Onbekende analyse of laagcorrectie.');
    const resolvedLayers=input.layers.map((layer,inputIndex)=>{
      if(![layer.manualKhKnM3,layer.frictionDeg,layer.netPressureKpa].every(Number.isFinite)||
        layer.manualKhKnM3<0||layer.frictionDeg<0||layer.frictionDeg>45)
        throw new Error('Ongeldige laagparameters.');
      const khKnM3=layer.springId==='manual'?layer.manualKhKnM3:springValue(layer.springId,input.scenario);
      const ka=Math.tan((45-layer.frictionDeg/2)*Math.PI/180)**2;
      return {...layer,inputIndex,khKnM3,ka,lineSpringKnM2:khKnM3*input.springWidthM,
        lineLoadKnM:layer.netPressureKpa*input.springWidthM+input.surchargeSign*ka*input.surchargeKpa*input.surchargeWidthM};
    }).sort((a,b)=>a.topM-b.topM);
    const profiles=resolvedLayers.map(layer=>{
      if(!layer.ultimate&&(analysisMode==='nonlinear'||correction==='georgiadis'))throw new Error(`Vul de grensweerstand in voor laag ${layer.inputIndex+1}.`);
      return {topM:layer.topM,bottomM:layer.bottomM,initialKnM2:layer.lineSpringKnM2,
        ultimate:analysisMode==='linear'&&correction==='none'?{atSurfaceKnM:0,gradientKnM2:0,capKnM:1}:layer.ultimate??{atSurfaceKnM:0,gradientKnM2:0,capKnM:1}};
    });
    const equivalents=equivalentLayers(profiles,correction);
    const solved=solveFoundationBeam({...input,eiKnM2:section.eiKnM2,layers:resolvedLayers},profiles,equivalents,analysisMode,correction);
    const springs=solved.springs.map(s=>({...s,layerIndex:resolvedLayers[s.layerIndex].inputIndex}));
    const layering:Array<EquivalentLayer>=Array(input.layers.length);resolvedLayers.forEach((l,j)=>layering[l.inputIndex]=equivalents[j]);
    const {springs:_springStates,convergence,...beam}=solved;
    const maxMomentKnM=Math.max(...beam.samples.map(v=>Math.abs(v.momentKnM)));
    let capacity:ReturnType<typeof sectionCapacity>|null=null,capacityError:string|null=null;
    try {capacity=sectionCapacity(input.section,input.nEdKn);} catch(e){capacityError=e instanceof Error?e.message:String(e);}
    return {ok:true,beam,section,capacity,capacityError,maxMomentKnM,analysisMode,springs,convergence,layering,
      maxShearKn:Math.max(...beam.samples.map(v=>Math.abs(v.shearKn))),
      maxDisplacementMm:1000*Math.max(...beam.samples.map(v=>Math.abs(v.yM))),
      sectionUtilization:capacity?(capacity.mRdKnM>1e-8?maxMomentKnM/capacity.mRdKnM:maxMomentKnM>1e-8?Infinity:0):null,
      resolvedLayers};
  } catch(e) {return {ok:false,error:e instanceof Error?e.message:String(e)};}
}
