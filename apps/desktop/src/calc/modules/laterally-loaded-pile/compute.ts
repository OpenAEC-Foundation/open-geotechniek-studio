import type { BeamResult } from './beam';
import {solveFoundationBeam} from './nonlinear-beam';
import {equivalentLayers} from './nonlinear-soil';
import {usesUltimate,type AnalysisMode,type LayerCorrection,type UltimateProfile,type SpringState,type ConvergenceInfo,type EquivalentLayer} from './spring-types';
import { sectionCapacity, sectionStiffness, type PileSection } from './section';
import { menardKh, springValue } from './soil';
import { ct } from '../../i18n';
import { materialCheck, type MaterialInput, type MaterialResult } from './material-check';
import { waterInfo } from './water';
import { corrodePile, corrosionRow, type PileCorrosion, type PileCorrosionInfo } from './corrosion-section';
export interface LateralLayer {
  topM:number; bottomM:number; springId:string; manualKhKnM3:number;
  frictionDeg:number; netPressureKpa:number;
  ultimate?:UltimateProfile;
  /** Bedding 'menard': pressiometermodulus E_p [kN/m²] en reologische factor α; k_h volgt uit menardKh met de werkende breedte. */
  menardEpKpa?:number; menardAlpha?:number;
}
export interface LateralInput {
  lengthM:number; maxElementM:number; headForceKn:number; headMomentKnM:number; nEdKn:number;
  headFixedRotation:boolean; toeFixed:boolean; springWidthM:number; scenario:'low'|'high';
  surchargeKpa:number; surchargeMode:'unresolved'|'retaining'; surchargeWidthM:number; surchargeSign:number;
  section:PileSection; layers:LateralLayer[];
  analysisMode?:AnalysisMode;layerCorrection?:LayerCorrection;
  /** Paalkop in m NAP; alleen voor invoer en weergave, de berekening rekent vanaf de kop. */
  headNap?:number;
  /** Instellingen: eigen beddingswaarden per grondsoort [kN/m³], boven de tabelwaarde. */
  springOverrides?:Record<string,{low?:number;high?:number}>;
  /** Instellingen: pu-profiel per grondsoort dat een laag krijgt bij die grondsoort. */
  puDefaults?:Record<string,UltimateProfile>;
  /** Paaltabel: veel palen met eigen kopbelasting, lengte of maat. */
  pileTable?:import('./pile-table').LateralTableConfig;
  /** Aanvullende invoer voor de materiaaltoetsing (beugels, boorpaal); zonder deze invoer verandert geen bestaande uitkomst. */
  material?:MaterialInput;
  /** Paalsysteem zoals in de module paaldraagvermogen (prefab, vibro, boorpaal, ...); bepaalt welke doorsneden passen. */
  pileSystemId?:string;
  /** Open stalen buis (paalsysteem 'steel-tube-open'): doorsnede als holle buis; ook de binnenzijde staat in grond, dus afroesting standaard aan twee kanten. */
  openEnd?:boolean;
  /** Gegevens overgenomen uit een paaldraagvermogenberekening. */
  inherited?:import('./pile-link').InheritedFrom;
  /** Afroesting van de stalen buis of het damwandprofiel; zonder deze invoer geen afroesting. */
  corrosion?:PileCorrosion;
  /** Varianten bij dezelfde grond en belasting, en de laatste optimalisatie; de berekening zelf leest ze niet. */
  variants?:import('./variants').VariantsConfig;
  /** Paal in open water: waterbodem en waterpeil, met optioneel een stroming; zonder deze invoer verandert er niets. */
  waterBed?:import('./water').WaterBed;
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
  /** Materiaaltoetsing per paaltype; null met materialError als die niet kon worden opgesteld. */
  material:MaterialResult|null;materialError:string|null;
  /** Afroesting: doorsnede voor en na; null zonder afroesting. */
  corrosion?:PileCorrosionInfo|null;
  /** Waterbodem: vrije lengte in water en de stromingslast; null zonder waterbodem. */
  water?:import('./water').WaterInfo|null;
};
export function computeLateral(input:LateralInput):LateralResult {
  try {
    if(!input || !Array.isArray(input.layers)||input.layers.length===0||input.layers.length>40 ||
      ![input.nEdKn,input.springWidthM,input.surchargeKpa,input.surchargeWidthM,input.surchargeSign].every(Number.isFinite)||
      input.springWidthM<=0||input.surchargeKpa<0||input.surchargeWidthM<=0||![1,-1].includes(input.surchargeSign)||
      !['low','high'].includes(input.scenario)||!['unresolved','retaining'].includes(input.surchargeMode))
      throw new Error(ct('calcLateral', 'errors.invalidInput', 'Ongeldige grond- of belastingsinvoer.'));
    if(input.surchargeKpa>0&&input.surchargeMode!=='retaining')
      throw new Error(ct('calcLateral', 'errors.surchargeModel', 'Kies een onderbouwd belastingmodel voor de bovenbelasting; q is geen automatische netto paaldruk.'));
    // Afroesting: de toetsen met de doorsnede na afroesting, de stijfheid alleen met het vinkje.
    const corrosion=corrodePile(input.section,input.corrosion), checked=corrosion?{...input,section:corrosion.section}:input;
    // Afroesting tot een niveau: de EI na afroesting alleen van de kop tot dat niveau, daaronder de oorspronkelijke.
    const zoneDepth=corrosion?.reducedStiffness&&Number.isFinite(input.corrosion?.zoneBottomNap)?(input.headNap??0)-input.corrosion!.zoneBottomNap!:null;
    if(zoneDepth!==null&&!(zoneDepth>0))throw new Error(ct('calcLateral', 'errors.corrosionZone', 'Het niveau tot waar de paal roest moet onder de paalkop liggen.'));
    const zoned=zoneDepth!==null&&zoneDepth<input.lengthM;
    const section=sectionStiffness(corrosion?.reducedStiffness&&!zoned?corrosion.section:input.section);
    const eiZones=zoned?[{topM:0,bottomM:zoneDepth,eiKnM2:sectionStiffness(corrosion!.section).eiKnM2}]:undefined;
    const analysisMode=input.analysisMode??'linear',correction=input.layerCorrection??'none';
    // Waterbodem: geen grondveren boven de bodem; de grond (en z_eq zonder laagcorrectie) begint op de bodem.
    const water=waterInfo(input);
    if(!['linear','nonlinear','elastoplastic'].includes(analysisMode)||!['none','georgiadis'].includes(correction))throw new Error(ct('calcLateral', 'errors.unknownAnalysis', 'Onbekende analyse of laagcorrectie.'));
    const resolvedLayers=input.layers.map((layer,inputIndex)=>{
      if(![layer.manualKhKnM3,layer.frictionDeg,layer.netPressureKpa].every(Number.isFinite)||
        layer.manualKhKnM3<0||layer.frictionDeg<0||layer.frictionDeg>45)
        throw new Error(ct('calcLateral', 'errors.invalidLayer', 'Ongeldige laagparameters.'));
      const own=input.springOverrides?.[layer.springId]?.[input.scenario];
      if(own!==undefined&&!(Number.isFinite(own)&&own>0))throw new Error(ct('calcLateral', 'errors.ownSpringPositive', 'Eigen beddingswaarden in de instellingen moeten positief zijn.'));
      const khKnM3=layer.springId==='manual'?layer.manualKhKnM3:layer.springId==='menard'?menardKh(layer.menardEpKpa??NaN,input.springWidthM,layer.menardAlpha??1/3):own??springValue(layer.springId,input.scenario);
      const ka=Math.tan((45-layer.frictionDeg/2)*Math.PI/180)**2;
      const bh=layer.ultimate?.brinchHansen,ultimate=bh?{...layer.ultimate!,brinchHansen:{...bh,widthM:input.springWidthM}}:layer.ultimate;
      return {...layer,ultimate,topM:water?Math.max(layer.topM,water.bedDepthM):layer.topM,inputIndex,khKnM3,ka,lineSpringKnM2:khKnM3*input.springWidthM,
        lineLoadKnM:layer.netPressureKpa*input.springWidthM+input.surchargeSign*ka*input.surchargeKpa*input.surchargeWidthM};
    }).sort((a,b)=>a.topM-b.topM);
    // Lagen die geheel boven de waterbodem liggen, dragen niet.
    const active=resolvedLayers.filter(l=>l.bottomM>l.topM+1e-9);
    if(active.length===0)throw new Error(ct('calcLateral', 'errors.noSoilBelowBed', 'Er ligt geen grondlaag onder de waterbodem.'));
    const profiles=active.map(layer=>{
      if(!layer.ultimate&&(usesUltimate(analysisMode)||correction==='georgiadis'))throw new Error(ct('calcLateral', 'errors.missingUltimate', 'Vul de grensweerstand in voor laag {{layer}}.', {layer:layer.inputIndex+1}));
      return {topM:layer.topM,bottomM:layer.bottomM,initialKnM2:layer.lineSpringKnM2,
        ultimate:analysisMode==='linear'&&correction==='none'?{atSurfaceKnM:0,gradientKnM2:0,capKnM:1}:layer.ultimate??{atSurfaceKnM:0,gradientKnM2:0,capKnM:1}};
    });
    const originM=water?.bedDepthM;
    const equivalents=equivalentLayers(profiles,correction,originM);
    const solved=solveFoundationBeam({...input,eiKnM2:section.eiKnM2,eiZones,layers:active,lineLoad:water?.lineLoad},profiles,equivalents,analysisMode,correction,{originM});
    const springs=solved.springs.map(s=>({...s,layerIndex:active[s.layerIndex].inputIndex}));
    const layering:Array<EquivalentLayer>=Array(input.layers.length).fill(null).map(()=>({topEquivalentM:0,bottomEquivalentM:0,cumulativeUltimateKn:0}));active.forEach((l,j)=>layering[l.inputIndex]=equivalents[j]);
    const {springs:_springStates,convergence,...beam}=solved;
    const maxMomentKnM=Math.max(...beam.samples.map(v=>Math.abs(v.momentKnM)));
    let capacity:ReturnType<typeof sectionCapacity>|null=null,capacityError:string|null=null;
    try {capacity=sectionCapacity(checked.section,input.nEdKn);} catch(e){capacityError=e instanceof Error?e.message:String(e);}
    const sectionUtilization=capacity?(capacity.mRdKnM>1e-8?maxMomentKnM/capacity.mRdKnM:maxMomentKnM>1e-8?Infinity:0):null;
    // De materiaaltoetsing leest alleen uit; verplaatsing, snedekrachten en de N–M-toets blijven zoals ze zijn.
    let material:MaterialResult|null=null,materialError:string|null=null;
    try {material=materialCheck(checked,beam.samples,{uc:sectionUtilization,mRdKnM:capacity?.mRdKnM??null,error:capacityError});if(corrosion)material={...material,rows:[corrosionRow(corrosion),...material.rows]};} catch(e){materialError=e instanceof Error?e.message:String(e);}
    return {ok:true,beam,section,capacity,capacityError,maxMomentKnM,analysisMode,springs,convergence,layering,material,materialError,
      corrosion:corrosion&&eiZones?{...corrosion,stiffnessZone:{bottomM:eiZones[0].bottomM,eiKnM2:eiZones[0].eiKnM2}}:corrosion,
      maxShearKn:Math.max(...beam.samples.map(v=>Math.abs(v.shearKn))),
      maxDisplacementMm:1000*Math.max(...beam.samples.map(v=>Math.abs(v.yM))),
      sectionUtilization,water:water?water.info:null,
      resolvedLayers};
  } catch(e) {return {ok:false,error:e instanceof Error?e.message:String(e)};}
}
