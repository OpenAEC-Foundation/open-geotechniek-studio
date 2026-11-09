import {useEffect,useMemo,useState} from 'react';
import type {Cpt} from '../../../../types/cpt';
import type {PileInput} from '../types';
import {getPileType} from '../catalog';
import {
 band,chooseLevels,invalidReason,computeCapacityMatrix,defaultCapacityConfig,levelRange,matrixCellInput,parseSizes,parseToeLevels,standardSizes,
 type CapacityMatrix,type CapacityTableConfig,type CptMatrix,type SizeChoice,
} from '../capacity-table';
import './capacity-table.css';
import {OaIcon} from '../../../../components/icons/oaIcon';

const kn=(n:number)=>n.toLocaleString('nl-NL',{maximumFractionDigits:0});
const nap=(n:number)=>n.toLocaleString('nl-NL',{minimumFractionDigits:2,maximumFractionDigits:2});
const levelText=(n:number)=>String(n).replace('.',',');
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

 return <section className="capacity-grid" aria-label="Draagvermogentabel">
  {focused
   ? <nav className="capacity-crumbs" aria-label="Kruimelpad"><button type="button" onClick={()=>onFocusCpt?.(null)}>Draagvermogentabel</button><span aria-hidden="true">›</span><span>Sondering {focused.cptId}</span></nav>
   : <><h2>Draagvermogen per sondering</h2>
    <p className="capacity-intro">Eén paalsysteem in een reeks maten en puntniveaus, gerekend op iedere sondering. Paaltype, norm en grondopbouw stel je links in.</p></>}
  <Settings input={input} cpts={cpts} config={config} update={update} />
  {computed.error&&<p role="alert" className="capacity-grid-error">{computed.error}</p>}
  {!config.cptIds.length&&<p role="status">Selecteer ten minste één sondering.</p>}
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
 const targetError=!Number.isFinite(lo)||!Number.isFinite(hi)||lo<0?'Vul de onder- en bovengrens in als getal in kN.':hi<=lo?'De bovengrens moet boven de ondergrens liggen; de tabel rekent nog met de vorige band.':'';
 const applyTarget=(a:string,b:string)=>{const lo=num(a),hi=num(b);if(Number.isFinite(lo)&&Number.isFinite(hi)&&lo>=0&&hi>lo)update({targetKn:{minKn:lo,maxKn:hi}});};
 return <div className="capacity-settings">
  <fieldset className="capacity-target"><legend>Gezocht draagvermogen Rc;net;d</legend>
   <div className="capacity-target-row">
    <label>Ondergrens [kN]<input inputMode="decimal" value={min} onChange={e=>{setMin(e.target.value);applyTarget(e.target.value,max);}} /></label>
    <span aria-hidden="true">–</span>
    <label>Bovengrens [kN]<input inputMode="decimal" value={max} onChange={e=>{setMax(e.target.value);applyTarget(min,e.target.value);}} /></label>
   </div>
   {targetError?<p role="alert" className="capacity-grid-error">{targetError}</p>
    :<p>De keuzetabel zoekt per maat de kortste paal die de ondergrens haalt. Boven de bovengrens is de maat ruim.</p>}
  </fieldset>
  <fieldset><legend>Paalmaten</legend>
   <label>Paalmaten [mm]<input value={sizes} onChange={e=>setSizes(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')tryApply(()=>update({sizesMm:parseSizes(sizes)}));}} /></label>
   <div className="capacity-buttons">
    <button type="button" onClick={()=>tryApply(()=>update({sizesMm:parseSizes(sizes)}))}>Maten toepassen</button>
    {std&&<button type="button" onClick={()=>update({sizesMm:std})}>Standaardreeks</button>}
   </div>
  </fieldset>
  <fieldset><legend>Puntniveaus</legend>
   <div className="capacity-range">
    <label>Van [m NAP]<input inputMode="decimal" value={range.from} onChange={e=>setRange({...range,from:e.target.value})} /></label>
    <label>Tot [m NAP]<input inputMode="decimal" value={range.to} onChange={e=>setRange({...range,to:e.target.value})} /></label>
    <label>Stap [m]<input inputMode="decimal" value={range.step} onChange={e=>setRange({...range,step:e.target.value})} /></label>
   </div>
   <div className="capacity-buttons"><button type="button" onClick={()=>tryApply(()=>update({toeNaps:levelRange(num(range.from),num(range.to),num(range.step))}))}>Reeks toepassen</button>
    <span className="capacity-count">{config.toeNaps.length} niveaus</span></div>
   <details><summary>Eigen niveaus</summary>
    <label>Puntniveaus [m NAP]<textarea rows={4} value={list} onChange={e=>setList(e.target.value)} /></label>
    <button type="button" onClick={()=>tryApply(()=>update({toeNaps:parseToeLevels(list)}))}>Niveaus toepassen</button>
   </details>
  </fieldset>
  <fieldset className="capacity-examples"><legend>Uitdraai</legend>
   <p>Volledig uitgewerkt in het rapport; daarna volgen de keuzetabel en de tabellen per sondering. Zonder keuze gaat het huidige rekenblad mee.</p>
   {config.examples.length>0&&<ul aria-label="Voorbeeldberekeningen">{config.examples.map((e,k)=><li key={k}><span>{e.cptId} · {e.sizeMm} mm · NAP {levelText(e.toeNap)}</span>
    <button type="button" aria-label={`Verwijder voorbeeld ${e.cptId}, ${e.sizeMm} mm op ${levelText(e.toeNap)} m NAP`} onClick={()=>update({examples:config.examples.filter((_,j)=>j!==k)})}><OaIcon id="list.item-remove" /></button></li>)}</ul>}
   <div className="capacity-example-add">
    <select aria-label="Voorbeeld: sondering" value={pick.cptId} onChange={e=>setPick({...pick,cptId:e.target.value})}>{config.cptIds.map(id=><option key={id} value={id}>{id}</option>)}</select>
    <select aria-label="Voorbeeld: maat" value={pick.sizeMm} onChange={e=>setPick({...pick,sizeMm:Number(e.target.value)})}>{config.sizesMm.map(v=><option key={v} value={v}>{v} mm</option>)}</select>
    <select aria-label="Voorbeeld: puntniveau" value={pick.toeNap} onChange={e=>setPick({...pick,toeNap:Number(e.target.value)})}>{sorted.map(v=><option key={v} value={v}>{levelText(v)}</option>)}</select>
    <button type="button" disabled={!config.cptIds.includes(pick.cptId)||config.examples.some(e=>e.cptId===pick.cptId&&e.sizeMm===pick.sizeMm&&e.toeNap===pick.toeNap)}
     onClick={()=>update({examples:[...config.examples,{...pick}]})}>Voorbeeld toevoegen</button>
   </div>
  </fieldset>
  <fieldset><legend>Sonderingen</legend>
   <div className="capacity-cpt-options">{names.map(id=><label key={id}><input type="checkbox" checked={config.cptIds.includes(id)} onChange={e=>update({cptIds:e.target.checked?[...config.cptIds,id]:config.cptIds.filter(v=>v!==id)})}/>{id}{!cpts.has(id)?' (ontbreekt)':''}</label>)}</div>
   <div className="capacity-buttons"><button type="button" onClick={()=>update({cptIds:[...cpts.keys()]})}>Alle sonderingen</button></div>
  </fieldset>
  {error&&<p role="alert" className="capacity-grid-error">{error}</p>}
 </div>;
}

function ChoiceTable({m,choices,sizeLabel,open,focus}:{m:CapacityMatrix;choices:SizeChoice[];sizeLabel:(s:number)=>string;open:(id:string,s:number,t:number)=>void;focus:(id:string)=>void}) {
 const all=m.cpts.length;
 const complete=choices.filter(c=>c.reached===all&&c.spreadM!==null);
 const best=complete.length?Math.min(...complete.map(c=>c.spreadM!)):null;
 return <div className="capacity-choice">
  <h3>Keuzetabel</h3>
  <div className="capacity-grid-scroll"><table aria-label="Puntniveau per paalmaat en sondering">
   <caption>Hoogste puntniveau [m NAP] waarop Rc;net;d ≥ {kn(m.target.minKn)} kN, per paalmaat en sondering. Klik een niveau voor het rekenblad.</caption>
   <thead><tr><th scope="col">Maat [mm]</th>{m.cpts.map(c=><th scope="col" key={c.cptId}><button type="button" className="capacity-link" onClick={()=>focus(c.cptId)}>{c.cptId}</button></th>)}
    <th scope="col" className="capacity-sum">Hoogste</th><th scope="col" className="capacity-sum">Laagste</th><th scope="col" className="capacity-sum">Spreiding</th><th scope="col" className="capacity-sum">Gehaald</th></tr></thead>
   <tbody>{choices.map(ch=>{
    const isBest=best!==null&&ch.reached===all&&ch.spreadM===best;
    return <tr key={ch.sizeMm} className={isBest?'is-best':''}>
     <th scope="row">{sizeLabel(ch.sizeMm)}{isBest&&<span className="capacity-badge">kleinste spreiding</span>}</th>
     {ch.perCpt.map(p=><td key={p.cptId} className={p.toeNap===null?'is-missing':p.aboveMax?'is-over':''}>
      {p.toeNap===null
       ? <button type="button" className="capacity-choice-cell" onClick={()=>focus(p.cptId)} aria-label={`${p.cptId}, ${ch.sizeMm} mm: niet gehaald`}><span>niet gehaald</span>{p.cptTooShort&&<span>sondering buiten bereik</span>}</button>
       : <button type="button" className="capacity-choice-cell" onClick={()=>open(p.cptId,ch.sizeMm,p.toeNap!)} aria-label={`Open ${p.cptId}, ${ch.sizeMm} mm op ${levelText(p.toeNap)} m NAP`}
          title={[p.aboveMax?'Ook de kortste paal die voldoet zit boven de bovengrens.':'',p.dropsDeeper?'Dieper zakt het draagvermogen weer onder de ondergrens.':''].filter(Boolean).join('\n')||undefined}>
          <strong>{nap(p.toeNap)}</strong><span>{kn(p.rcNetD!)} kN{p.dropsDeeper?' · let op dieper':''}</span></button>}
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
 return <div className="capacity-legend" aria-label="Legenda">
  <span className="band-under">&lt; {kn(target.minKn)} kN</span>
  <span className="band-within">{kn(target.minKn)}–{kn(target.maxKn)} kN</span>
  <span className="band-over">&gt; {kn(target.maxKn)} kN, ruim</span>
  <span className="band-choice">gekozen niveau</span>
 </div>;
}

function CptTable({c,m,choices,sizeLabel,open,focus}:{c:CptMatrix;m:CapacityMatrix;choices:SizeChoice[];sizeLabel:(s:number)=>string;open:(id:string,s:number,t:number)=>void;focus?:()=>void}) {
 const chosen=choices.map(ch=>ch.perCpt.find(p=>p.cptId===c.cptId)?.toeNap??null);
 return <div className="capacity-cpt">
  <h3>{focus?<button type="button" className="capacity-link" onClick={focus}>Sondering {c.cptId}</button>:<>Sondering {c.cptId}</>}</h3>
  {c.missing&&<p role="status" className="capacity-grid-error">Sondering {c.cptId} ontbreekt in het project.</p>}
  {c.profileNote&&<p className="capacity-cell-note">{c.profileNote}</p>}
  <div className="capacity-grid-scroll"><table aria-label={`Rc;net;d sondering ${c.cptId}`}>
   <thead><tr><th scope="col">Punt [m NAP]</th>{m.sizesMm.map(s=><th scope="col" key={s}>{sizeLabel(s)}</th>)}</tr></thead>
   <tbody>{m.toeNaps.map((t,li)=><tr key={t}><th scope="row">{nap(t)}</th>{m.sizesMm.map((s,si)=>{
    const r=c.cells[si][li].result,isChoice=chosen[si]===t;
    return <td key={s} className={`${r.ok?`band-${band(r.summary.rcNetD,m.target)}`:'is-invalid'}${isChoice?' is-choice':''}`}>
     <button type="button" onClick={()=>open(c.cptId,s,t)} aria-label={`Open ${c.cptId}, ${s} mm op ${levelText(t)} m NAP`} title={r.ok?(r.warnings.join('\n')||undefined):r.error}>
      {r.ok?kn(r.summary.rcNetD):<span className="capacity-reason">{invalidReason(r.error)}</span>}</button></td>;})}</tr>)}</tbody>
  </table></div>
 </div>;
}
