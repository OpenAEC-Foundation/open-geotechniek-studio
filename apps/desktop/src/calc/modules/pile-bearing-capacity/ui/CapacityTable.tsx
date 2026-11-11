import {useEffect,useMemo,useState} from 'react';
import {useTranslation} from 'react-i18next';
import type {Cpt} from '../../../../types/cpt';
import type {PileInput} from '../types';
import {getPileType} from '../catalog';
import {
 band,chooseLevels,invalidReason,computeCapacityMatrix,defaultCapacityConfig,levelRange,matrixCellInput,parseSizes,parseToeLevels,standardSizes,
 type CapacityMatrix,type CapacityTableConfig,type CptMatrix,type SizeChoice,
} from '../capacity-table';
import {numberLocale} from '../../../i18n';
import './capacity-table.css';

const kn=(n:number)=>n.toLocaleString(numberLocale(),{maximumFractionDigits:0});
const nap=(n:number)=>n.toLocaleString(numberLocale(),{minimumFractionDigits:2,maximumFractionDigits:2});
/** Decimaalteken van de actieve taal (komma of punt). */
const decimalSep=()=>(1.5).toLocaleString(numberLocale()).replace(/\d/g,'')[0]??'.';
const levelText=(n:number)=>String(n).replace('.',decimalSep());
const num=(text:string)=>Number(text.replace(',','.'));

interface Props {
 input:PileInput;cpts:Map<string,Cpt>;onChange:(next:PileInput)=>void;
 /** Open het rekenblad van de (zojuist ingestelde) cel. */
 onOpen:()=>void;
 /** Eén sondering tonen in plaats van het overzicht. */
 cptId?:string|null;
 onFocusCpt?:(cptId:string|null)=>void;
}

/**
 * Draagvermogen per sondering × paalmaat × puntniveau. Bovenaan de
 * keuzetabel: per maat het hoogste puntniveau dat de gezochte Rc;net;d haalt,
 * met de niveauspreiding over de sonderingen. Daaronder één tabel per sondering.
 */
export function CapacityTable({input,cpts,onChange,onOpen,cptId=null,onFocusCpt}:Props) {
 const config=defaultCapacityConfig(input,[...cpts.keys()]);
 const key=JSON.stringify(config);
 const computed=useMemo(()=>{
  try {const m=computeCapacityMatrix(input,cpts,config);return {m,choices:chooseLevels(m),error:''};}
  catch(e){return {m:null,choices:[],error:e instanceof Error?e.message:String(e)};}
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[input,cpts,key]);
 const update=(patch:Partial<CapacityTableConfig>)=>onChange({...input,capacityTable:{...config,...patch}});
 const open=(id:string,sizeMm:number,toeNap:number)=>{onChange({...matrixCellInput(input,id,sizeMm,toeNap),capacityTable:config});onOpen();};
 const circular=getPileType(input.pileTypeId)?.isCircular??true;
 const sizeLabel=(s:number)=>`${circular?'Ø':'□'}${s}`;
 const focused=cptId&&computed.m?computed.m.cpts.find(c=>c.cptId===cptId):undefined;
 const {t}=useTranslation('calcPile');

 return <section className="capacity-grid" aria-label={t('table.title','Draagvermogentabel')}>
  {focused
   ? <nav className="capacity-crumbs" aria-label={t('table.breadcrumb','Kruimelpad')}><button type="button" onClick={()=>onFocusCpt?.(null)}>{t('table.title','Draagvermogentabel')}</button><span aria-hidden="true">›</span><span>{t('table.cpt','Sondering {{id}}',{id:focused.cptId})}</span></nav>
   : <><h2>{t('table.heading','Draagvermogen per sondering')}</h2>
    <p className="capacity-intro">{t('table.intro','Eén paalsysteem in een reeks maten en puntniveaus, gerekend op iedere sondering. Paaltype, norm en grondopbouw stel je links in.')}</p></>}
  <Settings input={input} cpts={cpts} config={config} update={update} />
  {computed.error&&<p role="alert" className="capacity-grid-error">{computed.error}</p>}
  {!config.cptIds.length&&<p role="status">{t('table.selectCpt','Selecteer ten minste één sondering.')}</p>}
  {computed.m&&config.cptIds.length>0&&<>
   {!focused&&<ChoiceTable m={computed.m} choices={computed.choices} sizeLabel={sizeLabel} open={open} focus={id=>onFocusCpt?.(id)} />}
   <Legend target={computed.m.target} />
   <div className={focused?'capacity-cpt-single':'capacity-cpt-list'}>
    {(focused?[focused]:computed.m.cpts).map(c=><CptTable key={c.cptId} c={c} m={computed.m!} choices={computed.choices} sizeLabel={sizeLabel} open={open} focus={focused?undefined:()=>onFocusCpt?.(c.cptId)} />)}
   </div>
  </>}
 </section>;
}

function Settings({input,cpts,config,update}:{input:PileInput;cpts:Map<string,Cpt>;config:Required<CapacityTableConfig>;update:(p:Partial<CapacityTableConfig>)=>void}) {
 const names=[...new Set([...cpts.keys(),...config.cptIds])];
 const std=standardSizes(input.pileTypeId,input.presets);
 const sizesKey=config.sizesMm.join(' '),levelsKey=config.toeNaps.join(';');
 const [sizes,setSizes]=useState(sizesKey);
 const sorted=[...config.toeNaps].sort((a,b)=>b-a);
 const step=sorted.length>1?Math.abs(sorted[0]-sorted[1]):.5;
 const [range,setRange]=useState({from:levelText(sorted[0]),to:levelText(sorted[sorted.length-1]),step:levelText(step)});
 const [list,setList]=useState(()=>config.toeNaps.map(levelText).join('\n'));
 const [min,setMin]=useState(String(config.targetKn.minKn)),[max,setMax]=useState(String(config.targetKn.maxKn));
 const [error,setError]=useState('');
 const {t}=useTranslation('calcPile');
 // Keuze voor een nieuw voorbeeld; valt terug op een geldige combinatie als de reeksen wijzigen.
 const [pickState,setPick]=useState({cptId:input.cptId??config.cptIds[0]??'',sizeMm:input.diameterMm,toeNap:input.pileToeNap});
 const pick={cptId:config.cptIds.includes(pickState.cptId)?pickState.cptId:config.cptIds[0]??'',
  sizeMm:config.sizesMm.includes(pickState.sizeMm)?pickState.sizeMm:config.sizesMm[0],
  toeNap:config.toeNaps.includes(pickState.toeNap)?pickState.toeNap:sorted[0]};
 useEffect(()=>setSizes(sizesKey),[sizesKey]);
 useEffect(()=>{setList(config.toeNaps.map(levelText).join('\n'));setRange({from:levelText(sorted[0]),to:levelText(sorted[sorted.length-1]),step:levelText(step)});},
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [levelsKey]);
 const tryApply=(fn:()=>void)=>{try{fn();setError('');}catch(e){setError(e instanceof Error?e.message:String(e));}};
 const lo=num(min),hi=num(max);
 const targetError=!Number.isFinite(lo)||!Number.isFinite(hi)||lo<0?t('target.notNumber','Vul de onder- en bovengrens in als getal in kN.'):hi<=lo?t('target.inverted','De bovengrens moet boven de ondergrens liggen; de tabel rekent nog met de vorige band.'):'';
 const applyTarget=(a:string,b:string)=>{const lo=num(a),hi=num(b);if(Number.isFinite(lo)&&Number.isFinite(hi)&&lo>=0&&hi>lo)update({targetKn:{minKn:lo,maxKn:hi}});};
 return <div className="capacity-settings">
  <fieldset className="capacity-target"><legend>{t('target.legend','Gezocht draagvermogen Rc;net;d')}</legend>
   <div className="capacity-target-row">
    <label>{t('target.lower','Ondergrens [kN]')}<input inputMode="decimal" value={min} onChange={e=>{setMin(e.target.value);applyTarget(e.target.value,max);}} /></label>
    <span aria-hidden="true">–</span>
    <label>{t('target.upper','Bovengrens [kN]')}<input inputMode="decimal" value={max} onChange={e=>{setMax(e.target.value);applyTarget(min,e.target.value);}} /></label>
   </div>
   {targetError?<p role="alert" className="capacity-grid-error">{targetError}</p>
    :<p>{t('target.hint','De keuzetabel zoekt per maat de kortste paal die de ondergrens haalt. Boven de bovengrens is de maat ruim.')}</p>}
  </fieldset>
  <fieldset><legend>{t('sizes.legend','Paalmaten')}</legend>
   <label>{t('sizes.label','Paalmaten [mm]')}<input value={sizes} onChange={e=>setSizes(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')tryApply(()=>update({sizesMm:parseSizes(sizes)}));}} /></label>
   <div className="capacity-buttons">
    <button type="button" onClick={()=>tryApply(()=>update({sizesMm:parseSizes(sizes)}))}>{t('sizes.apply','Maten toepassen')}</button>
    {std&&<button type="button" onClick={()=>update({sizesMm:std})}>{t('sizes.standard','Standaardreeks')}</button>}
   </div>
  </fieldset>
  <fieldset><legend>{t('levels.legend','Puntniveaus')}</legend>
   <div className="capacity-range">
    <label>{t('levels.from','Van [m NAP]')}<input inputMode="decimal" value={range.from} onChange={e=>setRange({...range,from:e.target.value})} /></label>
    <label>{t('levels.to','Tot [m NAP]')}<input inputMode="decimal" value={range.to} onChange={e=>setRange({...range,to:e.target.value})} /></label>
    <label>{t('levels.step','Stap [m]')}<input inputMode="decimal" value={range.step} onChange={e=>setRange({...range,step:e.target.value})} /></label>
   </div>
   <div className="capacity-buttons"><button type="button" onClick={()=>tryApply(()=>update({toeNaps:levelRange(num(range.from),num(range.to),num(range.step))}))}>{t('levels.applyRange','Reeks toepassen')}</button>
    <span className="capacity-count">{t('levels.count','{{n}} niveaus',{n:config.toeNaps.length})}</span></div>
   <details><summary>{t('levels.custom','Eigen niveaus')}</summary>
    <label>{t('levels.listLabel','Puntniveaus [m NAP]')}<textarea rows={4} value={list} onChange={e=>setList(e.target.value)} /></label>
    <button type="button" onClick={()=>tryApply(()=>update({toeNaps:parseToeLevels(list)}))}>{t('levels.applyList','Niveaus toepassen')}</button>
   </details>
  </fieldset>
  <fieldset className="capacity-examples"><legend>{t('examples.legend','Uitdraai')}</legend>
   <p>{t('examples.hint','Volledig uitgewerkt in het rapport; daarna volgen de keuzetabel en de tabellen per sondering. Zonder keuze gaat het huidige rekenblad mee.')}</p>
   {config.examples.length>0&&<ul aria-label={t('examples.listAria','Voorbeeldberekeningen')}>{config.examples.map((e,k)=><li key={k}><span>{e.cptId} · {e.sizeMm} mm · NAP {levelText(e.toeNap)}</span>
    <button type="button" aria-label={t('examples.removeAria','Verwijder voorbeeld {{cpt}}, {{size}} mm op {{level}} m NAP',{cpt:e.cptId,size:e.sizeMm,level:levelText(e.toeNap)})} onClick={()=>update({examples:config.examples.filter((_,j)=>j!==k)})}>×</button></li>)}</ul>}
   <div className="capacity-example-add">
    <select aria-label={t('examples.cptAria','Voorbeeld: sondering')} value={pick.cptId} onChange={e=>setPick({...pick,cptId:e.target.value})}>{config.cptIds.map(id=><option key={id} value={id}>{id}</option>)}</select>
    <select aria-label={t('examples.sizeAria','Voorbeeld: maat')} value={pick.sizeMm} onChange={e=>setPick({...pick,sizeMm:Number(e.target.value)})}>{config.sizesMm.map(v=><option key={v} value={v}>{v} mm</option>)}</select>
    <select aria-label={t('examples.levelAria','Voorbeeld: puntniveau')} value={pick.toeNap} onChange={e=>setPick({...pick,toeNap:Number(e.target.value)})}>{sorted.map(v=><option key={v} value={v}>{levelText(v)}</option>)}</select>
    <button type="button" disabled={!config.cptIds.includes(pick.cptId)||config.examples.some(e=>e.cptId===pick.cptId&&e.sizeMm===pick.sizeMm&&e.toeNap===pick.toeNap)}
     onClick={()=>update({examples:[...config.examples,{...pick}]})}>{t('examples.add','Voorbeeld toevoegen')}</button>
   </div>
  </fieldset>
  <fieldset><legend>{t('cpts.legend','Sonderingen')}</legend>
   <div className="capacity-cpt-options">{names.map(id=><label key={id}><input type="checkbox" checked={config.cptIds.includes(id)} onChange={e=>update({cptIds:e.target.checked?[...config.cptIds,id]:config.cptIds.filter(v=>v!==id)})}/>{!cpts.has(id)?t('cpts.missingOption','{{id}} (ontbreekt)',{id}):id}</label>)}</div>
   <div className="capacity-buttons"><button type="button" onClick={()=>update({cptIds:[...cpts.keys()]})}>{t('cpts.all','Alle sonderingen')}</button></div>
  </fieldset>
  {error&&<p role="alert" className="capacity-grid-error">{error}</p>}
 </div>;
}

function ChoiceTable({m,choices,sizeLabel,open,focus}:{m:CapacityMatrix;choices:SizeChoice[];sizeLabel:(s:number)=>string;open:(id:string,s:number,t:number)=>void;focus:(id:string)=>void}) {
 const all=m.cpts.length;
 const complete=choices.filter(c=>c.reached===all&&c.spreadM!==null);
 const best=complete.length?Math.min(...complete.map(c=>c.spreadM!)):null;
 const {t}=useTranslation('calcPile');
 return <div className="capacity-choice">
  <h3>{t('choice.title','Keuzetabel')}</h3>
  <div className="capacity-grid-scroll"><table aria-label={t('choice.tableAria','Puntniveau per paalmaat en sondering')}>
   <caption>{t('choice.caption','Hoogste puntniveau [m NAP] waarop Rc;net;d ≥ {{min}} kN, per paalmaat en sondering. Klik een niveau voor het rekenblad.',{min:kn(m.target.minKn)})}</caption>
   <thead><tr><th scope="col">{t('choice.size','Maat [mm]')}</th>{m.cpts.map(c=><th scope="col" key={c.cptId}><button type="button" className="capacity-link" onClick={()=>focus(c.cptId)}>{c.cptId}</button></th>)}
    <th scope="col" className="capacity-sum">{t('choice.highest','Hoogste')}</th><th scope="col" className="capacity-sum">{t('choice.lowest','Laagste')}</th><th scope="col" className="capacity-sum">{t('choice.spread','Spreiding')}</th><th scope="col" className="capacity-sum">{t('choice.reached','Gehaald')}</th></tr></thead>
   <tbody>{choices.map(ch=>{
    const isBest=best!==null&&ch.reached===all&&ch.spreadM===best;
    return <tr key={ch.sizeMm} className={isBest?'is-best':''}>
     <th scope="row">{sizeLabel(ch.sizeMm)}{isBest&&<span className="capacity-badge">{t('choice.smallestSpread','kleinste spreiding')}</span>}</th>
     {ch.perCpt.map(p=><td key={p.cptId} className={p.toeNap===null?'is-missing':p.aboveMax?'is-over':''}>
      {p.toeNap===null
       ? <button type="button" className="capacity-choice-cell" onClick={()=>focus(p.cptId)} aria-label={t('choice.notReachedAria','{{cpt}}, {{size}} mm: niet gehaald',{cpt:p.cptId,size:ch.sizeMm})}><span>{t('choice.notReached','niet gehaald')}</span>{p.cptTooShort&&<span>{t('choice.cptOutOfRange','sondering buiten bereik')}</span>}</button>
       : <button type="button" className="capacity-choice-cell" onClick={()=>open(p.cptId,ch.sizeMm,p.toeNap!)} aria-label={t('cell.openAria','Open {{cpt}}, {{size}} mm op {{level}} m NAP',{cpt:p.cptId,size:ch.sizeMm,level:levelText(p.toeNap)})}
          title={[p.aboveMax?t('choice.aboveMaxTitle','Ook de kortste paal die voldoet zit boven de bovengrens.'):'',p.dropsDeeper?t('choice.dropsDeeperTitle','Dieper zakt het draagvermogen weer onder de ondergrens.'):''].filter(Boolean).join('\n')||undefined}>
          <strong>{nap(p.toeNap)}</strong><span>{kn(p.rcNetD!)} kN{p.dropsDeeper?` · ${t('choice.dropsDeeper','let op dieper')}`:''}</span></button>}
     </td>)}
     <td className="capacity-sum">{ch.highestNap===null?'—':nap(ch.highestNap)}</td>
     <td className="capacity-sum">{ch.lowestNap===null?'—':nap(ch.lowestNap)}</td>
     <td className="capacity-sum"><strong>{ch.spreadM===null?'—':`${nap(ch.spreadM)} m`}</strong></td>
     <td className="capacity-sum">{ch.reached}/{all}</td>
    </tr>;})}</tbody>
  </table></div>
 </div>;
}

function Legend({target}:{target:{minKn:number;maxKn:number}}) {
 const {t}=useTranslation('calcPile');
 return <div className="capacity-legend" aria-label={t('legend.title','Legenda')}>
  <span className="band-under">&lt; {kn(target.minKn)} kN</span>
  <span className="band-within">{kn(target.minKn)}–{kn(target.maxKn)} kN</span>
  <span className="band-over">{t('legend.over','> {{max}} kN, ruim',{max:kn(target.maxKn)})}</span>
  <span className="band-choice">{t('legend.chosen','gekozen niveau')}</span>
 </div>;
}

function CptTable({c,m,choices,sizeLabel,open,focus}:{c:CptMatrix;m:CapacityMatrix;choices:SizeChoice[];sizeLabel:(s:number)=>string;open:(id:string,s:number,t:number)=>void;focus?:()=>void}) {
 const chosen=choices.map(ch=>ch.perCpt.find(p=>p.cptId===c.cptId)?.toeNap??null);
 const {t}=useTranslation('calcPile');
 const title=t('table.cpt','Sondering {{id}}',{id:c.cptId});
 return <div className="capacity-cpt">
  <h3>{focus?<button type="button" className="capacity-link" onClick={focus}>{title}</button>:title}</h3>
  {c.missing&&<p role="status" className="capacity-grid-error">{t('table.cptMissing','Sondering {{id}} ontbreekt in het project.',{id:c.cptId})}</p>}
  {c.profileNote&&<p className="capacity-cell-note">{c.profileNote}</p>}
  <div className="capacity-grid-scroll"><table aria-label={t('table.cptTableAria','Rc;net;d sondering {{id}}',{id:c.cptId})}>
   <thead><tr><th scope="col">{t('table.toe','Punt [m NAP]')}</th>{m.sizesMm.map(s=><th scope="col" key={s}>{sizeLabel(s)}</th>)}</tr></thead>
   <tbody>{m.toeNaps.map((toe,li)=><tr key={toe}><th scope="row">{nap(toe)}</th>{m.sizesMm.map((s,si)=>{
    const r=c.cells[si][li].result,isChoice=chosen[si]===toe;
    return <td key={s} className={`${r.ok?`band-${band(r.summary.rcNetD,m.target)}`:'is-invalid'}${isChoice?' is-choice':''}`}>
     <button type="button" onClick={()=>open(c.cptId,s,toe)} aria-label={t('cell.openAria','Open {{cpt}}, {{size}} mm op {{level}} m NAP',{cpt:c.cptId,size:s,level:levelText(toe)})} title={r.ok?(r.warnings.join('\n')||undefined):r.error}>
      {r.ok?kn(r.summary.rcNetD):<span className="capacity-reason">{invalidReason(r.error,r.errorCode)}</span>}</button></td>;})}</tr>)}</tbody>
  </table></div>
 </div>;
}
