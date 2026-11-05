import type { CalcModule } from '../../framework/types';
import { computeLateral, lateralExample, type LateralInput, type LateralResult } from './compute';
import { LateralInputPanel } from './LateralInputPanel';
import { LateralSheet, lateralSummary } from './LateralSheet';
import { LateralSettingsPanel } from './LateralSettingsPanel';
import { buildLateralReport, lateralReportFileName } from './report-pdf';
import {LateralExplorer} from './LateralExplorer';
import '../settlement/styles.css';
import './styles.css';
const f=(v:number,n=2)=>Number.isFinite(v)?v.toLocaleString('nl-NL',{maximumFractionDigits:n}):'—';
const lateralModuleTyped:CalcModule<LateralInput,LateralResult>={
  id:'laterally-loaded-pile',name:'Horizontale paalbelasting',subtitle:'Grondveren, kopkracht, kopmoment en N–M-doorsnedetoets',category:'pile',icon:'↔',visualLabel:'Paal- en veermodel',wideVisual:true,
  norm:'CUR166 initiële bedding · Georgiadis-laagcorrectie · projectveerwet',status:'experimental',
  defaultInput:()=>structuredClone(lateralExample),compute:(input)=>computeLateral(input),InputPanel:LateralInputPanel,VisualPanel:LateralExplorer,ResultPanel:LateralSheet,SettingsPanel:LateralSettingsPanel,
  statusLine:r=>r.ok&&r.sectionUtilization!==null?{text:`u.c. ${f(r.sectionUtilization)} ${r.sectionUtilization<=1?'✓':'✗'}`,ok:r.sectionUtilization<=1}:{text:r.ok?`Concept · y ${f(r.maxDisplacementMm)} mm`:r.error,ok:false,pending:true},
  buildReport:(input,r,ctx)=>buildLateralReport(input,r,ctx),reportFileName:()=>lateralReportFileName(),
  checks:(input,r)=>{if(!r.ok)return [];const s=lateralSummary(input,r);return [
    {label:'y kop',value:`${f(s.yHeadMm)} mm`},{label:'M max',value:`${f(s.mEd)} kNm`},{label:'V max',value:`${f(Math.max(Math.abs(s.V.max.v),Math.abs(s.V.min.v)))} kN`},
    ...(s.uc!==null&&r.capacity?[{label:'doorsnede',value:`MRd ${f(r.capacity.mRdKnM)} kNm`,uc:s.uc}]:[])];},
};
export const laterallyLoadedPileModule=lateralModuleTyped as unknown as CalcModule;
