import { useId, useState } from 'react';
import type { PanelProps } from '../../framework/types';
import type { LateralInput, LateralResult } from './compute';
import type { AnalysisMode, ConvergenceInfo, EquivalentLayer, SpringState, UltimateProfile } from './spring-types';
import type { BeamResult } from './beam';
import { SpringInspector } from './SpringInspector';
import { PileScene3D } from './PileScene3D';
import { SpringField } from './SpringField';
import { ForceDiagrams } from './ForceDiagrams';
import './explorer.css';
import { useTranslation } from 'react-i18next';
import { numberLocale } from '../../i18n';

const f=(value:number,digits=3)=>value.toLocaleString(numberLocale(),{maximumFractionDigits:digits});
type InspectableResult=Extract<LateralResult,{ok:true}>&{springs:SpringState[];analysisMode:AnalysisMode;convergence:ConvergenceInfo;layering:EquivalentLayer[]};
type ModelProps={input:LateralInput;beam:BeamResult;springs:SpringState[];selectedId:string|undefined;onSelect:(id:string)=>void;scale:number};

/** Veren die getekend worden: minstens 14 px uit elkaar; de geselecteerde altijd. */
export function visibleSprings(springs:SpringState[],y:(z:number)=>number,selectedId:string|undefined,minPx=14):SpringState[] {
  let last=-Infinity;
  return [...springs].sort((a,b)=>a.zM-b.zM).filter(s=>{const show=y(s.zM)-last>=minPx||s.id===selectedId;if(y(s.zM)-last>=minPx)last=y(s.zM);return show;});
}
export function PileCalculationModel({input:i,beam,springs,selectedId,onSelect,scale}:ModelProps) {
  const {t}=useTranslation('calcLateral');
  const arrowId=useId();
  const depth=(z:number)=>65+490*z/i.lengthM;
  const horizontal=(displacement:number)=>210+displacement*scale*490/i.lengthM;
  return <div className="pile-model"><svg viewBox="0 0 520 610" aria-label={t('model.aria', 'Rekenmodel met werkelijke integratiepunten')} role="img">
    <defs><marker id={arrowId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" className="pile-arrow-fill"/></marker></defs>
    {i.layers.map((l,k)=><g key={k}><rect className={k%2?'pile-soil-alt':'pile-soil'} x="90" width="335" y={depth(l.topM)} height={depth(l.bottomM)-depth(l.topM)}/><text x="430" y={depth((l.topM+l.bottomM)/2)}>{t('model.layer', 'Laag {{n}}', {n:k+1})}</text></g>)}
    {[0,.25,.5,.75,1].map(t=><g key={t}><line className="pile-grid" x1="70" x2="425" y1={depth(t*i.lengthM)} y2={depth(t*i.lengthM)}/><text x="55" y={depth(t*i.lengthM)+4} textAnchor="end">{f(t*i.lengthM)} m</text></g>)}
    <text x="14" y="27">{t('model.zFromHead', 'z vanaf kop')}</text><line className="pile-reference" x1="210" x2="210" y1={depth(0)} y2={depth(i.lengthM)}/>
    {beam.elements.map((element,index)=><line key={index} x1="210" x2="210" y1={depth(element.topM)} y2={depth(element.bottomM)} className="pile-element"/>)}
    <polyline className="pile-response" points={beam.samples.map(p=>`${horizontal(p.yM)},${depth(p.zM)}`).join(' ')}/>
    {beam.nodes.map((node,index)=><circle key={index} cx="210" cy={depth(node.zM)} r="2" className="pile-node"/>)}
    {visibleSprings(springs,depth,selectedId).map(s=><g key={s.id} role="button" tabIndex={0} aria-label={t('spring.select','Selecteer veer {{id}}',{id:s.id})} aria-pressed={s.id===selectedId} className={`pile-spring ${s.id===selectedId?'is-selected':''}`}
      onClick={()=>onSelect(s.id)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onSelect(s.id);}}}>
      <title>{s.id} · z {f(s.zM)} m · y {f(s.displacementM*1000)} mm</title>
      <path d={`M216 ${depth(s.zM)}h8l4 -4l6 8l6 -8l6 8l4 -4h16`} className="pile-spring-line"/>
      <circle cx="210" cy={depth(s.zM)} r={s.id===selectedId?5:3} className="pile-spring-point"/><rect x="202" y={depth(s.zM)-4} width="78" height="8" className="pile-hit-area"/>
    </g>)}
    <line x1={i.headForceKn>=0?105:195} x2={i.headForceKn>=0?195:105} y1="45" y2="45" className="pile-load" markerEnd={`url(#${arrowId})`}/><text x="85" y="25">H = {f(i.headForceKn)} kN</text>
    <path d={i.headMomentKnM>=0?'M245 60a24 24 0 1 0 -28 -33':'M217 27a24 24 0 1 1 28 33'} className="pile-load" markerEnd={`url(#${arrowId})`}/><text x="280" y="40">M = {f(i.headMomentKnM)} kNm</text>
    {i.headFixedRotation&&<g><path className="pile-support" d="M185 62h50m-50 -8v16m8 -16v16m8 -16v16m8 -16v16m8 -16v16m8 -16v16m8 -16v16"/><text x="280" y="62">{t('model.headFixed', 'Koprotatie vast')}</text></g>}
    {i.toeFixed&&<g><path className="pile-support" d="M185 557h50m-50 0l-6 10m16 -10l-6 10m16 -10l-6 10m16 -10l-6 10m16 -10l-6 10m16 -10l-6 10"/><text x="280" y="575">{t('model.toeFixed', 'Punt ingeklemd')}</text></g>}
    <text x="85" y="600">{t('model.footer', 'Elementlijn · verplaatsing ×{{scale}} · klik een veerpunt', {scale:f(scale,0)})}</text>
  </svg></div>;
}
const TAB_KEY={'3D':'view3d',Rekenmodel:'model',Veren:'springs',Diagrammen:'diagrams'} as const;
export function LateralExplorer({input,result}:PanelProps<LateralInput,LateralResult>) {
  const {t}=useTranslation('calcLateral');
  const [view,setView]=useState<'3D'|'Rekenmodel'|'Veren'|'Diagrammen'>('3D');
  const [selectedId,setSelectedId]=useState<string>();
  const [scale,setScale]=useState(10);
  if(!result.ok)return <p className="settlement-error" role="alert">{result.error}</p>;
  const r=result as InspectableResult;
  const springs=r.springs??[];
  const selected=springs.find(s=>s.id===selectedId)??springs[0];
  const selectedLayer=selected?input.layers[selected.layerIndex] as (LateralInput['layers'][number]&{ultimate?:UltimateProfile})|undefined:undefined;
  const props={input,beam:r.beam,springs,selectedId:selected?.id,onSelect:setSelectedId,scale};
  return <div className="pile-explorer"><header><h2>{t('explorer.title', 'Horizontale paalbelasting')} <span>{t('explorer.concept', 'Concept')}</span></h2>
    <p>{r.analysisMode==='nonlinear'?t('explorer.nonlinearModel', 'Niet-lineair projectmodel'):t('explorer.linearModel', 'Lineair grondmodel')} · EI {f(r.section.eiKnM2)} kNm² · {t('explorer.counts', '{{elements}} elementen · {{points}} integratiepunten', {elements:r.beam.elements.length,points:springs.length})}</p>
    {r.convergence&&<p className="pile-convergence">{t('explorer.converged', 'Geconvergeerd · {{steps}} belastingstappen · {{iterations}} iteraties · residu {{residual}} kN · relatief {{relative}}', {steps:r.convergence.loadSteps,iterations:r.convergence.iterations,residual:r.convergence.residualKn.toExponential(2),relative:r.convergence.relativeResidual.toExponential(2)})}</p>}</header>
    <div className="pile-explorer-toolbar"><div className="pile-tabs" role="tablist" aria-label={t('explorer.views', 'Paalweergave')}>{(['3D','Rekenmodel','Veren','Diagrammen'] as const).map(tab=><button key={tab} id={`pile-tab-${tab}`} role="tab" aria-selected={view===tab} aria-controls="pile-active-view" onClick={()=>setView(tab)}>{t(`explorer.tabs.${TAB_KEY[tab]}`,tab)}</button>)}</div>
      <label>{t('explorer.displacement', 'Verplaatsing')} ×<input type="number" min="1" max="1000" step="1" aria-label={t('explorer.magnification', 'Vergroting verplaatsing')} value={scale} onChange={event=>{const v=event.target.valueAsNumber;if(Number.isFinite(v))setScale(Math.max(1,Math.min(1000,v)));}}/></label>
      <button type="button" onClick={()=>setScale(1)}>{t('explorer.trueScale', 'Ware schaal')}</button></div>
    <div className="pile-explorer-layout"><section className="pile-view" id="pile-active-view" role="tabpanel" aria-labelledby={`pile-tab-${view}`}>
      <p className="pile-scale">{t('explorer.scaleNote', 'Geometrie in meters · verplaatsing ×{{scale}} · werkelijk y bij geselecteerde veer: {{y}}', {scale,y:selected?`${f(selected.displacementM*1000)} mm`:'—'})}</p>
      {view==='3D'?<PileScene3D {...props} fallback={<PileCalculationModel {...props}/>}/>:view==='Rekenmodel'?<PileCalculationModel {...props}/>:view==='Veren'?<SpringField input={input} springs={springs} mode={r.analysisMode} selectedId={selected?.id} onSelect={setSelectedId}/>:<ForceDiagrams input={input} beam={r.beam}/>}
      <p className="pile-model-note">{t('explorer.note', '3D toont dezelfde Euler–Bernoulli-ligger en grondveren. De weergave is geen continuümgrondberekening. Grondlagen zijn schematisch transparant.')}</p>
    </section><aside><label className="pile-depth-select">{t('explorer.springAtDepth', 'Grondveer op diepte')}<select aria-label={t('explorer.springAtDepth','Grondveer op diepte')} value={selected?.id??''} onChange={event=>setSelectedId(event.target.value)}>{springs.map(s=><option key={s.id} value={s.id}>{t('explorer.springOption', 'z {{z}} m · laag {{layer}} · {{id}}', {z:f(s.zM),layer:s.layerIndex+1,id:s.id})}</option>)}</select></label><SpringInspector spring={selected} ultimate={selectedLayer?.ultimate}/></aside></div>
  </div>;
}
