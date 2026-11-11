import { useId } from 'react';
import type { SpringState, UltimateProfile } from './spring-types';

const f=(value:number,digits=4)=>Number.isFinite(value)?value.toLocaleString('nl-NL',{maximumFractionDigits:digits}):'—';
export function SpringInspector({spring:s,ultimate}:{spring:SpringState|undefined;ultimate?:UltimateProfile}) {
  const clipId=useId();
  if(!s)return <section className="pile-inspector" aria-label="Veerinspectie"><h3>Grondveer</h3><p>Geen actieve grondveren in dit model.</p></section>;
  const xMax=Math.max(.001,Math.abs(s.displacementM)*1.25,...s.curvePoints.map(p=>Math.abs(p.yM)));
  const yMax=Math.max(1,Math.abs(s.resistanceKnM),...s.curvePoints.map(p=>Math.abs(p.pKnM)))*1.15;
  const x=(y:number)=>190+150*y/xMax, y=(p:number)=>130-95*p/yMax;
  const points=s.curvePoints.map(p=>`${x(p.yM)},${y(p.pKnM)}`).join(' ');
  const tangent=(v:number)=>s.resistanceKnM+s.tangentKnM2*(v-s.displacementM);
  const values=[['Werkelijke diepte',`${f(s.zM)} m`],['Equivalente diepte',`${f(s.equivalentDepthM)} m`],
    ['Grondlaag',`${s.layerIndex+1}`],['Element / Gauss-punt',`${s.elementIndex+1} / ${s.gaussIndex+1}`],
    ['Verplaatsing y',`${f(s.displacementM*1000)} mm`],['Gemobiliseerde weerstand p',`${f(s.resistanceKnM)} kN/m`],['Grondreactie op de paal',`${f(-s.resistanceKnM)} kN/m`],
    ['Initiële stijfheid k₀',`${f(s.initialKnM2)} kN/m²`],['Secantstijfheid',`${f(s.secantKnM2)} kN/m²`],
    ['Tangentstijfheid',`${f(s.tangentKnM2)} kN/m²`],['Grensweerstand pu',s.mode==='linear'?'Onbegrensd (lineair)':s.ultimateKnM===null?'—':`${f(s.ultimateKnM)} kN/m`],
    ['Integratielengte',`${f(s.tributaryLengthM)} m`]];
  return <section className="pile-inspector" aria-label="Veerinspectie"><h3>Grondveer · laag {s.layerIndex+1}</h3><p className="pile-point-id">{s.id}</p>
    <svg viewBox="0 0 400 285" role="img" aria-label="p-y-curve">
      <defs><clipPath id={clipId}><rect x="40" y="30" width="300" height="200"/></clipPath></defs>
      {[-1,-.5,0,.5,1].map(t=><g key={t}><line className="pile-grid" x1="40" x2="340" y1={y(t*yMax)} y2={y(t*yMax)}/>
        <text x="35" y={y(t*yMax)+4} textAnchor="end">{f(t*yMax,1)}</text><text x={x(t*xMax)} y="247" textAnchor="middle">{f(t*xMax*1000,1)}</text></g>)}
      <line className="pile-axis" x1="40" x2="340" y1={y(0)} y2={y(0)}/><line className="pile-axis" x1={x(0)} x2={x(0)} y1="30" y2="230"/>
      <g clipPath={`url(#${clipId})`}><line className="pile-reference" x1={x(-xMax)} y1={y(-xMax*s.initialKnM2)} x2={x(xMax)} y2={y(xMax*s.initialKnM2)}/>
        <line className="pile-tangent" x1={x(-xMax)} y1={y(tangent(-xMax))} x2={x(xMax)} y2={y(tangent(xMax))}/>
        <polyline className="pile-response" points={points}/>
        <circle className="pile-operating" aria-label="Werkpunt" data-y-mm={s.displacementM*1000} data-p-kn-m={s.resistanceKnM} cx={x(s.displacementM)} cy={y(s.resistanceKnM)} r="5"/>
      </g><text x="40" y="17">p [kN/m]</text><text x="340" y="274" textAnchor="end">y [mm]</text>
    </svg>
    <div className="pile-legend"><span className="pile-legend-curve">p-y-curve</span><span className="pile-legend-reference">Lineaire referentie k₀</span><span className="pile-legend-tangent">Tangent werkpunt</span></div>
    <dl>{values.map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>
    <h4>{s.modelLabel}</h4><p className="pile-formula">{s.formula}</p><p>p is de gemobiliseerde weerstand; de grondreactie op de paal is −p.</p><p>Bron: {s.source}</p>
    {s.mode==='nonlinear'&&ultimate&&<p>Projectprofiel pu = min(cap, pu,0 + g × z): pu,0 = {f(ultimate.atSurfaceKnM)} kN/m; g = {f(ultimate.gradientKnM2)} kN/m²; cap = {f(ultimate.capKnM)} kN/m. Gebruikte z = {f(s.equivalentDepthM)} m. Deze grenswaarden vereisen een projectspecifieke onderbouwing.</p>}
    <p>{s.correction==='georgiadis'?'Georgiadis: laagcorrectie via equivalente diepte; geen afzonderlijke p-y-veerwet.':'Laagcorrectie: geen.'} k₀ blijft de ingevoerde bedding × werkende breedte.</p>
    <p>{s.mode==='linear'?'Lineaire veer zonder begrenzing van p.':'Hyperbolisch projectmodel, statisch en monotoon; symmetrische weerstand, zonder cyclische hysterese of degradatie.'}</p>
    <details><summary>Numerieke curvepunten</summary><table aria-label="Curvepunten"><thead><tr><th>y [mm]</th><th>p [kN/m]</th></tr></thead><tbody>{s.curvePoints.map((p,index)=><tr key={index}><td>{f(p.yM*1000,6)}</td><td>{f(p.pKnM,6)}</td></tr>)}</tbody></table></details>
  </section>;
}
