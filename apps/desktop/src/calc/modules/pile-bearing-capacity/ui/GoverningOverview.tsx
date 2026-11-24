import {useMemo,useState} from 'react';
import {useTranslation} from 'react-i18next';
import type {Cpt} from '../../../../types/cpt';
import {governingCount,governingLevels,levelMin,type CapacityMatrix,type GoverningCell} from '../capacity-table';
import {numberLocale} from '../../../i18n';

const kn=(n:number)=>n.toLocaleString(numberLocale(),{maximumFractionDigits:0});
const nap=(n:number)=>n.toLocaleString(numberLocale(),{minimumFractionDigits:2,maximumFractionDigits:2});

/** Kleurklasse van een sondering: verhouding Rc;net;d tot het gezochte draagvermogen. */
export type MapBand='none'|'low'|'short'|'ok'|'ample';
export function mapBand(rcNetD:number|null,targetKn:number):MapBand {
 if(rcNetD===null)return 'none';
 const r=rcNetD/targetKn;
 return r<.8?'low':r<1?'short':r<1.25?'ok':'ample';
}

interface Props {
 m:CapacityMatrix;cpts:Map<string,Cpt>;targetsKn:number[];
 sizeLabel:(s:number)=>string;
 /** Toon één sondering. */
 focus:(cptId:string)=>void;
}

/**
 * Bovenaan de draagvermogentabel: per gezocht draagvermogen en paalmaat het
 * hoogste puntniveau waarop alle sonderingen voldoen, met ernaast een
 * plattegrond van de sonderingen, gekleurd naar het draagvermogen op het
 * gekozen niveau.
 */
export function GoverningOverview({m,cpts,targetsKn,sizeLabel,focus}:Props) {
 const {t}=useTranslation('calcPile');
 const rows=useMemo(()=>governingLevels(m,targetsKn),[m,targetsKn]);
 const counts=useMemo(()=>governingCount(rows),[rows]);
 const total=rows.reduce((a,r)=>a+r.cells.filter(c=>c.governingCptId).length,0);
 const first=rows.flatMap(r=>r.cells).find(c=>c.reached)??rows[0]?.cells[0];
 const [pick,setPick]=useState<{targetKn:number;sizeMm:number;toeNap:number}|null>(null);
 // De keuze volgt de reeksen: valt terug op de eerste haalbare combinatie.
 const sel={
  targetKn:pick&&targetsKn.includes(pick.targetKn)?pick.targetKn:first?.targetKn??targetsKn[0],
  sizeMm:pick&&m.sizesMm.includes(pick.sizeMm)?pick.sizeMm:first?.sizeMm??m.sizesMm[0],
  toeNap:pick&&m.toeNaps.includes(pick.toeNap)?pick.toeNap:first?.toeNap??m.toeNaps[0],
 };
 const choose=(c:GoverningCell)=>setPick({targetKn:c.targetKn,sizeMm:c.sizeMm,toeNap:c.toeNap??sel.toeNap});
 if(!rows.length)return null;
 return <div className="capacity-governing">
  <div className="capacity-governing-table">
   <h3>{t('governing.title','Maatgevend overzicht')}</h3>
   <ul className="capacity-governing-lines">{rows.map(row=>{
    const ok=row.cells.filter(c=>c.reached);
    return <li key={row.targetKn}><strong>{kn(row.targetKn)} kN</strong>{': '}
     {ok.length?ok.map(c=>t('governing.option','{{size}} op NAP {{level}}',{size:sizeLabel(c.sizeMm),level:nap(c.toeNap!)})).join(t('governing.or',' of '))
      :<span className="capacity-grid-error">{t('governing.noOption','met geen van de maten gehaald op alle sonderingen')}</span>}</li>;})}</ul>
   <div className="capacity-grid-scroll"><table aria-label={t('governing.tableAria','Maatgevend puntniveau per draagvermogen en paalmaat')}>
    <caption>{t('governing.caption','Hoogste puntniveau [m NAP] waarop alle sonderingen het draagvermogen halen, met de maatgevende sondering en haar Rc;net;d. Klik een cel om de plattegrond op dat niveau te zetten.')}</caption>
    <thead><tr><th scope="col">{t('governing.target','Rc;net;d ≥')}</th>{m.sizesMm.map(s=><th scope="col" key={s}>{sizeLabel(s)}</th>)}</tr></thead>
    <tbody>{rows.map(row=><tr key={row.targetKn}><th scope="row">{kn(row.targetKn)} kN</th>{row.cells.map(c=>{
     const active=sel.targetKn===c.targetKn&&sel.sizeMm===c.sizeMm&&sel.toeNap===c.toeNap;
     return <td key={c.sizeMm} className={`${c.reached?'':'is-missing'}${active?' is-choice':''}`}>
      <button type="button" className="capacity-choice-cell" aria-pressed={active} onClick={()=>choose(c)}
       aria-label={c.reached
        ?t('governing.cellAria','{{target}} kN met {{size}} mm: NAP {{level}}, maatgevend {{cpt}}',{target:kn(c.targetKn),size:c.sizeMm,level:nap(c.toeNap!),cpt:c.governingCptId})
        :t('governing.cellMissingAria','{{target}} kN met {{size}} mm: niet gehaald',{target:kn(c.targetKn),size:c.sizeMm})}>
       {c.reached
        ?<><strong>{nap(c.toeNap!)}</strong><span>{c.governingCptId} · {kn(c.rcMinD!)} kN</span></>
        :<><span>{t('choice.notReached','niet gehaald')}</span>
          {c.toeNap!==null&&c.rcMinD!==null&&<span>{t('governing.bestLevel','hoogstens {{rc}} kN op {{level}}',{rc:kn(c.rcMinD),level:nap(c.toeNap)})}</span>}
          {c.failing.length>0&&<span>{c.failing.slice(0,3).join(', ')}{c.failing.length>3?` +${c.failing.length-3}`:''}</span>}</>}
      </button></td>;})}</tr>)}</tbody>
   </table></div>
   {counts.length>0&&m.cpts.length>1&&<p className="capacity-governing-worst">{t('governing.worst','Vaakst maatgevend:')}{' '}
    {counts.slice(0,3).map((c,i)=><span key={c.cptId}>{i>0?', ':''}<button type="button" className="capacity-link" onClick={()=>focus(c.cptId)}>{c.cptId}</button>{' '}{t('governing.worstCount','({{n}} van {{total}})',{n:c.count,total})}</span>)}</p>}
  </div>
  <CptMap m={m} cpts={cpts} sel={sel} targetsKn={targetsKn} sizeLabel={sizeLabel} setSel={setPick} focus={focus} />
 </div>;
}

interface Sel {targetKn:number;sizeMm:number;toeNap:number}
function CptMap({m,cpts,sel,targetsKn,sizeLabel,setSel,focus}:{m:CapacityMatrix;cpts:Map<string,Cpt>;sel:Sel;targetsKn:number[];sizeLabel:(s:number)=>string;setSel:(s:Sel)=>void;focus:(id:string)=>void}) {
 const {t}=useTranslation('calcPile');
 const si=Math.max(0,m.sizesMm.indexOf(sel.sizeMm)),li=Math.max(0,m.toeNaps.indexOf(sel.toeNap));
 const points=m.cpts.map(c=>{
  const r=c.cells[si][li].result,pos=cpts.get(c.cptId)?.position;
  const rc=r.ok?r.summary.rcNetD:null;
  return {id:c.cptId,rc,band:mapBand(rc,sel.targetKn),x:pos&&Number.isFinite(pos.x_rd)?pos.x_rd:null,y:pos&&Number.isFinite(pos.y_rd)?pos.y_rd:null};
 });
 const placed=points.filter((p):p is typeof p&{x:number;y:number}=>p.x!==null&&p.y!==null),loose=points.filter(p=>p.x===null||p.y===null);
 const min=levelMin(m,si,li);
 const W=420,H=320,PAD=34;
 const xs=placed.map(p=>p.x),ys=placed.map(p=>p.y);
 const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
 const span=Math.max(x1-x0,y1-y0,1),k=Math.min((W-2*PAD)/Math.max(x1-x0,span*.05),(H-2*PAD)/Math.max(y1-y0,span*.05));
 const px=(x:number)=>W/2+(x-(x0+x1)/2)*k,py=(y:number)=>H/2-(y-(y0+y1)/2)*k;
 const bar=niceBar(span);
 return <div className="capacity-map">
  <h3>{t('map.title','Sonderingen op de plattegrond')}</h3>
  <div className="capacity-map-controls">
   {targetsKn.length>1&&<label>{t('map.target','Draagvermogen')}<select value={sel.targetKn} onChange={e=>setSel({...sel,targetKn:Number(e.target.value)})}>{targetsKn.map(v=><option key={v} value={v}>{kn(v)} kN</option>)}</select></label>}
   <label>{t('map.size','Paalmaat')}<select value={sel.sizeMm} onChange={e=>setSel({...sel,sizeMm:Number(e.target.value)})}>{m.sizesMm.map(s=><option key={s} value={s}>{sizeLabel(s)}</option>)}</select></label>
   <label className="capacity-map-level">{t('map.level','Puntniveau: NAP {{level}} m',{level:nap(sel.toeNap)})}
    <input type="range" min={0} max={m.toeNaps.length-1} step={1} value={li} aria-valuetext={`NAP ${nap(sel.toeNap)} m`} onChange={e=>setSel({...sel,toeNap:m.toeNaps[Number(e.target.value)]})} /></label>
  </div>
  {placed.length>0
   ?<svg className="capacity-map-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('map.svgAria','Plattegrond van de sonderingen met Rc;net;d voor {{size}} op NAP {{level}} m',{size:sizeLabel(sel.sizeMm),level:nap(sel.toeNap)})}>
     <rect x=".5" y=".5" width={W-1} height={H-1} className="capacity-map-frame" />
     {placed.map(p=><g key={p.id} className={`capacity-map-point band-${p.band}${p.id===min.cptId?' is-governing':''}`} transform={`translate(${px(p.x).toFixed(1)} ${py(p.y).toFixed(1)})`}
       role="button" tabIndex={0} onClick={()=>focus(p.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();focus(p.id);}}}>
      <title>{p.rc===null?t('map.pointNone','{{cpt}}: geen uitkomst op dit niveau',{cpt:p.id}):t('map.pointTitle','{{cpt}}: {{rc}} kN',{cpt:p.id,rc:kn(p.rc)})}</title>
      <circle r={p.id===min.cptId?11:9} />
      <text y={-14} className="capacity-map-id">{p.id}</text>
      <text y={24} className="capacity-map-value">{p.rc===null?'—':kn(p.rc)}</text>
     </g>)}
     {placed.length>1&&<g transform={`translate(${W-PAD-bar*k} ${H-12})`} className="capacity-map-bar"><line x1={0} x2={bar*k} y1={0} y2={0} /><text x={bar*k/2} y={-4}>{bar} m</text></g>}
     <g transform={`translate(18 26)`} className="capacity-map-north"><path d="M0 -12 L5 6 L0 2 L-5 6 Z" /><text y={18}>N</text></g>
    </svg>
   :<p role="status" className="capacity-cell-note">{t('map.noPositions','Geen van de sonderingen heeft een positie; de plattegrond kan niet worden getekend.')}</p>}
  {placed.length>0&&loose.length>0&&<p className="capacity-cell-note">{t('map.loose','Zonder positie, niet getekend: {{list}}',{list:loose.map(p=>`${p.id}${p.rc===null?'':` (${kn(p.rc)} kN)`}`).join(', ')})}</p>}
  <div className="capacity-legend capacity-map-legend" aria-label={t('legend.title','Legenda')}>
   <span className="band-low">{t('map.legendLow','< {{v}} kN',{v:kn(.8*sel.targetKn)})}</span>
   <span className="band-short">{t('map.legendShort','{{a}}–{{b}} kN',{a:kn(.8*sel.targetKn),b:kn(sel.targetKn)})}</span>
   <span className="band-ok">{t('map.legendOk','{{a}}–{{b}} kN',{a:kn(sel.targetKn),b:kn(1.25*sel.targetKn)})}</span>
   <span className="band-ample">{t('map.legendAmple','> {{v}} kN',{v:kn(1.25*sel.targetKn)})}</span>
   <span className="band-none">{t('map.legendNone','geen uitkomst')}</span>
  </div>
  {min.cptId&&min.rcMinD!==null&&<p className="capacity-map-summary">{t('map.summary','Laagste op dit niveau: {{cpt}} met {{rc}} kN.',{cpt:min.cptId,rc:kn(min.rcMinD)})}</p>}
 </div>;
}

/** Ronde lengte voor de schaalbalk, ongeveer een kwart van de afmeting. */
function niceBar(span:number):number {
 const raw=span/4,p=10**Math.floor(Math.log10(Math.max(raw,1e-6)));
 return [1,2,5,10].map(v=>v*p).reduce((a,b)=>Math.abs(b-raw)<Math.abs(a-raw)?b:a);
}
