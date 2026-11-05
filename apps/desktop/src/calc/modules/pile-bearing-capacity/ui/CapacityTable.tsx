import {useEffect,useMemo,useState} from 'react';
import type {Cpt} from '../../../../types/cpt';
import type {PileInput} from '../types';
import {computeCapacityTable,parseToeLevels,tableCellInput,type CapacityTableConfig} from '../capacity-table';
import './capacity-table.css';

const f=(n:number,digits=2)=>n.toLocaleString('nl-NL',{maximumFractionDigits:digits});
const levelText=(n:number)=>String(n).replace('.',',');
interface Props {input:PileInput;cpts:Map<string,Cpt>;onChange:(next:PileInput)=>void;onOpen:()=>void}
export function CapacityTable({input,cpts,onChange,onOpen}:Props) {
 const config=input.capacityTable??{cptIds:[...cpts.keys()],toeNaps:[input.pileToeNap]};
 const levelsKey=config.toeNaps.join(';');
 const [draft,setDraft]=useState(()=>config.toeNaps.map(levelText).join('\n'));
 const [error,setError]=useState('');
 useEffect(()=>{setDraft(config.toeNaps.map(levelText).join('\n'));setError('');},[levelsKey]);
 const computed=useMemo(()=>{try{return {rows:computeCapacityTable(input,cpts,config),error:''};}catch(e){return {rows:[],error:e instanceof Error?e.message:String(e)};}},[input,cpts,levelsKey,config.cptIds.join('\u0000')]);
 const update=(next:CapacityTableConfig)=>onChange({...input,capacityTable:next});
 const names=[...new Set([...cpts.keys(),...config.cptIds])];
 return <section className="capacity-grid" aria-label="Draagvermogentabel">
  <h2>Draagvermogen per sondering</h2>
  <p>Eén paaltype en doorsnede voor alle cellen. Pas de paal en norm aan in de invoer links.</p>
  <div className="capacity-grid-settings">
   <fieldset><legend>Sonderingen</legend><div className="capacity-cpt-options">{names.map(id=><label key={id}><input type="checkbox" checked={config.cptIds.includes(id)} onChange={e=>update({...config,cptIds:e.target.checked?[...config.cptIds,id]:config.cptIds.filter(v=>v!==id)})}/>{id}{!cpts.has(id)?' (ontbreekt)':''}</label>)}</div>
    <button type="button" onClick={()=>update({...config,cptIds:[...cpts.keys()]})}>Alle sonderingen</button>
   </fieldset>
   <fieldset><legend>Paalpuntniveaus</legend><label>Puntniveaus [m NAP]<textarea rows={4} value={draft} onChange={e=>setDraft(e.target.value)} /></label><p>Eén niveau per regel, of gescheiden met puntkomma. Decimale komma is toegestaan.</p>
    <button type="button" onClick={()=>{try{update({...config,toeNaps:parseToeLevels(draft)});setError('');}catch(e){setError(e instanceof Error?e.message:String(e));}}}>Niveaus toepassen</button>
   </fieldset>
  </div>
  <p className="capacity-grid-note">Gemeenschappelijke invoer: dezelfde grondlagen, waterstand, paalkop en kleefgrenzen in absolute m NAP. Controleer deze voor iedere sondering. Iedere cel betreft één sondering; er wordt geen groepsgemiddelde berekend.</p>
  {(error||computed.error)&&<p role="alert" className="capacity-grid-error">{error||computed.error}</p>}
  {!config.cptIds.length&&<p role="status">Selecteer ten minste één sondering.</p>}
  {!names.length&&<p role="status">Voeg eerst sonderingen aan het project toe.</p>}
  <div className="capacity-grid-scroll"><table aria-label="Netto ontwerpweerstand per sondering en paalpuntniveau">
   <caption>Rc;net;d [kN] na aftrek van negatieve kleef · paalpunt [m NAP]. Klik een cel voor de volledige berekening.</caption>
   <thead><tr><th scope="col">Sondering</th>{config.toeNaps.map(level=><th scope="col" key={level}>{levelText(level)}</th>)}</tr></thead>
   <tbody>{computed.rows.map(row=><tr key={row.cptId}><th scope="row">{row.cptId}</th>{row.cells.map(cell=><td key={cell.toeNap} className={cell.result.ok?'':'capacity-cell-invalid'}><button type="button" aria-label={`Open ${row.cptId} op ${levelText(cell.toeNap)} m NAP`} onClick={()=>{onChange({...tableCellInput(input,row.cptId,cell.toeNap),capacityTable:config});onOpen();}}>
    {cell.result.ok?<><strong>{f(cell.result.summary.rcNetD,1)}</strong><span>kN</span>{cell.notes.map(note=><span className="capacity-cell-note" key={note}>{note}</span>)}{cell.result.warnings.length>0&&<span title={cell.result.warnings.join('\n')}>Let op invoervoorwaarden</span>}</>:<><strong>Niet berekenbaar</strong><span>{cell.result.error}</span></>}
   </button></td>)}</tr>)}</tbody>
  </table></div>
 </section>;
}
