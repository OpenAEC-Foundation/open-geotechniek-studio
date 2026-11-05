import type { CalcModule, PanelProps } from '../../framework/types';
import { computeLateral, lateralExample, type LateralInput, type LateralResult } from './compute';
import { SOIL_SPRINGS } from './soil';
import type { PileSection } from './section';
import references from './reference-cases.json';
import {LateralExplorer} from './LateralExplorer';
import '../settlement/styles.css';
import './styles.css';
type Props=PanelProps<LateralInput,LateralResult>;
const f=(v:number,n=2)=>Number.isFinite(v)?v.toLocaleString('nl-NL',{maximumFractionDigits:n}):'—';
function NumberField({label,unit,value,change}:{label:string;unit:string;value:number;change:(v:number)=>void}) {
  return <label className="settlement-field"><span className="settlement-label">{label}</span>
    <span className="settlement-input-wrap"><input type="number" step="any" aria-label={`${label} [${unit}]`} value={Number.isFinite(value)?value:''} onChange={e=>change(e.target.valueAsNumber)}/><span>{unit}</span></span></label>;
}
function InputPanel({input:i,onChange}:Props) {
  const change=(patch:Partial<LateralInput>)=>onChange?.({...i,...patch});
  const section=(patch:Partial<PileSection>)=>change({section:{...i.section,...patch}});
  const fields=(defs:Array<[keyof LateralInput,string,string]>)=>defs.map(([key,label,unit])=><NumberField key={key} label={label} unit={unit} value={i[key] as number} change={v=>change({[key]:v})}/>);
  const sectionFields=(defs:Array<[keyof PileSection,string,string]>)=>defs.map(([key,label,unit])=><NumberField key={key} label={label} unit={unit} value={i.section[key] as number} change={v=>section({[key]:v})}/>);
  const tube=i.section.kind==='steel-tube'||i.section.kind==='filled-tube';
  return <div className="lateral-input">
    <section><h2>Analyse grondveren</h2><label>Rekenkeuze<select aria-label="Analyse grondveren" value={i.analysisMode??'linear'} onChange={e=>change({analysisMode:e.target.value as LateralInput['analysisMode']})}><option value="nonlinear">Niet-lineair · hyperbolisch projectmodel</option><option value="linear">Lineair · initiële bedding</option></select></label>
      <label>Laagcorrectie<select aria-label="Laagcorrectie" value={i.layerCorrection??'none'} onChange={e=>change({layerCorrection:e.target.value as LateralInput['layerCorrection']})}><option value="georgiadis">Georgiadis · equivalente diepte</option><option value="none">Geen · werkelijke gronddiepte</option></select></label>
      <p className="settlement-help">Georgiadis corrigeert de diepte voor de grensweerstand. Niet-lineair: p = pu tanh(k0 y / pu). k0 = kh × breedte. De pu-profielen zijn projectinvoer; de ingevulde voorbeeldwaarden zijn geen gevalideerde normwaarden. Statische monotone belasting, geen cyclische hysterese.</p></section>
    <section><h2>Paal en kopbelasting</h2><div className="settlement-fields">{fields([
      ['lengthM','Paallengte','m'],['maxElementM','Maximale elementlengte','m'],
      ['headForceKn','Horizontale kopkracht','kN'],['headMomentKnM','Moment op de kop','kNm'],['nEdKn','Normaalkracht voor doorsnedetoets (druk positief)','kN'],
    ])}</div><label><input type="checkbox" checked={i.headFixedRotation} onChange={e=>change({headFixedRotation:e.target.checked})}/> Koprotatie geblokkeerd</label>
      <label><input type="checkbox" checked={i.toeFixed} onChange={e=>change({toeFixed:e.target.checked})}/> Paalpunt ingeklemd</label></section>
    <section><h2>Doorsnede en stijfheid</h2><label className="settlement-field">Paaltype<select aria-label="Paaltype" value={i.section.kind} onChange={e=>section({kind:e.target.value as PileSection['kind']})}>
      <option value="concrete-square">Beton · vierkant</option><option value="concrete-round">Beton · rond</option><option value="steel-tube">Stalen buis · hol</option><option value="filled-tube">Stalen buis · betongevuld</option></select></label>
      <div className="settlement-fields">{sectionFields([['diameterMm',i.section.kind==='concrete-square'?'Zijde':'Buitendiameter','mm'],
        ...(tube?[['wallMm','Effectieve restwanddikte','mm'] as [keyof PileSection,string,string]]:[]),
        ['concreteEMpa','E beton vóór reductie','MPa'],['steelEMpa','E buisstaal','MPa'],['rebarEMpa','E wapening','MPa'],
        ['concreteFactor','Projectfactor betonstijfheid','—'],['creepCoefficient','Kruipcoëfficiënt beton','—'],
      ])}</div>{i.section.kind==='filled-tube'&&<label><input type="checkbox" checked={i.section.tubeParticipates} onChange={e=>section({tubeParticipates:e.target.checked})}/> Samengestelde werking aangetoond; buis werkt mee</label>}
      <p className="settlement-help">EI = Ec,eff Ic + Es Is + Ea Ia. Ec,eff = Ec × projectfactor / (1 + kruip). Een factor voor gescheurd beton wordt projectspecifiek onderbouwd; er wordt geen scheurmodel of tweede-ordeanalyse automatisch verondersteld.</p></section>
    <section><h2>Wapening en ontwerpsterkten</h2><div className="settlement-fields">{sectionFields([
      ['barCount','Aantal langsstaven','stuks'],['barDiameterMm','Staafdiameter','mm'],['coverToBarCentreMm','Afstand betonrand tot staafcentrum','mm'],
      ['fckMpa','Betonsterkte fck (maximaal 50 MPa)','MPa'],['fcdMpa','Betondruksterkte fcd (ontwerpwaarde)','MPa'],['fydMpa','Wapeningssterkte fyd (ontwerpwaarde)','MPa'],['tubeFydMpa','Buisstaalsterkte fyd (ontwerpwaarde)','MPa'],
    ])}</div><p className="settlement-help">Betondiagram voor normaalsterktebeton tot C50/60: εc2 = 2‰, εcu = 3,5‰. Ontwerpsterkten inclusief projectfactoren zelf invoeren. Vierkant: gelijke aantallen staven langs vier zijden; rond: gelijkmatig over de cirkel.</p></section>
    <section><h2>Grond en bedding</h2><div className="settlement-fields">{fields([['springWidthM','Werkende breedte grondveren','m']])}
      <label>CUR166-scenario<select aria-label="Beddingsscenario" value={i.scenario} onChange={e=>change({scenario:e.target.value as LateralInput['scenario']})}><option value="low">Laag gemiddelde · eerste traject</option><option value="high">Hoog gemiddelde · eerste traject</option></select></label></div>
      {i.layers.map((layer,index)=><fieldset key={index}><legend>Laag {index+1}</legend><div className="settlement-fields">
        {(['topM','bottomM'] as const).map((key,j)=><NumberField key={key} label={j?'Onderkant vanaf kop':'Bovenkant vanaf kop'} unit="m" value={layer[key]} change={v=>change({layers:i.layers.map((l,k)=>k===index?{...l,[key]:v}:l)})}/>)}
        <label>Bedding<select aria-label={`Bedding laag ${index+1}`} value={layer.springId} onChange={e=>change({layers:i.layers.map((l,k)=>k===index?{...l,springId:e.target.value}:l)})}>{SOIL_SPRINGS.map(v=><option key={v.id} value={v.id}>{v.label}</option>)}<option value="manual">Projectwaarde</option></select></label>
        {([['manualKhKnM3','Projectbedding kh','kN/m³'],['frictionDeg','Wrijvingshoek voor bovenbelasting','°'],['netPressureKpa','Voorgeschreven netto gronddruk','kPa']] as const).filter(([key])=>key!=='manualKhKnM3'||layer.springId==='manual').map(([key,label,unit])=><NumberField key={key} label={label} unit={unit} value={layer[key]} change={v=>change({layers:i.layers.map((l,k)=>k===index?{...l,[key]:v}:l)})}/>)}</div>
        {(i.analysisMode==='nonlinear'||i.layerCorrection==='georgiadis')&&<div className="settlement-fields"><p className="settlement-help">Projectprofiel: pu(zeq) = min(cap, pu,0 + g × zeq). Grensweerstand per paallengte, onafhankelijk van de invoer voor kh.</p>{([['atSurfaceKnM','Grensweerstand pu,0','kN/m'],['gradientKnM2','Toename g','kN/m²'],['capKnM','Bovengrens pu','kN/m']] as const).map(([key,label,unit])=><NumberField key={key} label={`${label} · laag ${index+1}`} unit={unit} value={layer.ultimate?.[key]??NaN} change={v=>change({layers:i.layers.map((l,k)=>k===index?{...l,ultimate:{atSurfaceKnM:NaN,gradientKnM2:NaN,capKnM:NaN,...l.ultimate,[key]:v}}:l)})}/>)}</div>}
        <button type="button" onClick={()=>change({layers:i.layers.filter((_,k)=>k!==index)})}>Laag verwijderen</button></fieldset>)}
      <button type="button" onClick={()=>change({layers:[...i.layers,{...lateralExample.layers[0],ultimate:undefined,topM:i.layers[i.layers.length-1]?.bottomM??0,bottomM:i.lengthM}]})}>Grondlaag toevoegen</button>
      <p className="settlement-help">Diepte vanaf paalkop. Open stukken tussen lagen hebben geen bedding. CUR166 tabel 3.3 betreft wandbedding: de werkende paalbreedte is een expliciete modelaanname. De eerste secantwaarde bepaalt alleen de initiële stijfheid k0.</p></section>
    <section><h2>Bovenbelasting op maaiveld</h2><div className="settlement-fields">{fields([['surchargeKpa','Bovenbelasting','kPa'],['surchargeWidthM','Kerende invloedbreedte','m']])}
      <label>Belastingmodel<select aria-label="Bovenbelastingmodel" value={i.surchargeMode} onChange={e=>change({surchargeMode:e.target.value as LateralInput['surchargeMode']})}><option value="unresolved">Vrijstaande paal / nog te onderbouwen</option><option value="retaining">Kerend element · eenzijdige uniforme q</option></select></label>
      <label>Richting<select aria-label="Richting bovenbelasting" value={i.surchargeSign} onChange={e=>change({surchargeSign:Number(e.target.value)})}><option value={1}>Positief</option><option value={-1}>Negatief</option></select></label></div>
      <p className="settlement-help">Kerend model: Δp = Ka q; Ka = tan²(45° − φ/2), lijnlast = Δp × kerende invloedbreedte. Horizontaal maaiveld, verticale gladde kerende lijn en oneindige uniforme belasting aan één zijde; uitsluitend de toename door q. Geen eindige strookbelasting, 3D-spreiding of automatisch model van grondverplaatsing rond een vrije paal.</p></section>
  </div>;
}
function ResultPanel({input,result:r}:Props) {
  if(!r.ok)return <p className="settlement-error" role="alert">{r.error}</p>;
  const exportCalculation=()=>{
    const blob=new Blob([JSON.stringify({module:'laterally-loaded-pile',status:'concept',input,result:r,references},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='horizontale-paalbelasting.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),0);
  };
  return <div className="lateral-result settlement-result"><h2>Resultaten · concept</h2><dl className="lateral-values">
    {[['Maximale verplaatsing',`${f(r.maxDisplacementMm)} mm`],['Maximaal moment',`${f(r.maxMomentKnM)} kNm`],['Maximale dwarskracht',`${f(r.maxShearKn)} kN`],
      ['EI beton',`${f(r.section.concreteEI)} kNm²`],['EI wapening',`${f(r.section.rebarEI)} kNm²`],['EI buis',`${f(r.section.tubeEI)} kNm²`],['EI totaal',`${f(r.section.eiKnM2)} kNm²`],['Langswapening',`${f(r.section.rebarAreaMm2)} mm²`]].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    <h3>N–M-doorsnedetoets</h3>{r.capacity?<><p>NEd = {f(input.nEdKn)} kN · MRd(NEd) = {f(r.capacity.mRdKnM)} kNm</p><p>Benutting buiging: {f(r.sectionUtilization??NaN,3)} {r.sectionUtilization!==null&&r.sectionUtilization<=1?'· binnen berekende doorsnedeweerstand':'· doorsnede voldoet niet'}</p><p>Normaalkrachtresidu: {f(r.capacity.nResidualKn,6)} kN</p></>:<p className="settlement-error">{r.capacityError}</p>}
    <p className="settlement-warning">Dwarskracht, scheurwijdte, minimumwapening, verankering, lokale buisplooi en globale stabiliteit zijn niet getoetst. De N–M-toets is een doorsnedecontrole met constante ontwerpsterkten en vlakblijvende doorsneden. Beton in trek draagt niet bij; sterkteverhoging door opsluiting is niet toegepast.</p>
    <h3>Transparante bedding</h3><p>k per lengte = kh × B; equivalente veren en lasten worden consistent over ieder element geïntegreerd.</p><table><thead><tr><th>Traject [m]</th><th>kh [kN/m³]</th><th>kh B [kN/m²]</th><th>Lijnlast [kN/m]</th></tr></thead><tbody>{r.resolvedLayers.map((l,j)=><tr key={j}><td>{f(l.topM)}–{f(l.bottomM)}</td><td>{f(l.khKnM3)}</td><td>{f(l.lineSpringKnM2)}</td><td>{f(l.lineLoadKnM)}</td></tr>)}</tbody></table>
    <p className="settlement-help">Bron initiële bedding: CUR C166 deel 1, tabel 3.3, eerste secanttraject, lokale BRIS-afdruk met publicatiedatum 2008 en erratumvermelding. De niet-lineaire hyperbolische projectwet en ingevoerde pu-profielen vormen geen volledige CUR166-mobilisatietoets.</p>
    <p>Grondmodel: {r.analysisMode==='nonlinear'?'niet-lineair':'lineair'} · laagcorrectie {input.layerCorrection??'none'} · {r.convergence.loadSteps} belastingstappen · {r.convergence.iterations} iteraties · residu {r.convergence.residualKn.toExponential(2)} kN</p>
    <details><summary>Equivalente diepten en cumulatieve grensweerstand</summary><table><thead><tr><th>Laag</th><th>zeq,top [m]</th><th>zeq,onder [m]</th><th>∫pu dz [kN]</th></tr></thead><tbody>{r.layering.map((l,j)=><tr key={j}><td>{j+1}</td><td>{f(l.topEquivalentM,4)}</td><td>{f(l.bottomEquivalentM,4)}</td><td>{r.analysisMode==='linear'&&(input.layerCorrection??'none')==='none'?'Niet gebruikt (lineair)':f(l.cumulativeUltimateKn,4)}</td></tr>)}</tbody></table></details>
    <h3>Evenwicht en respons</h3><p>ΣF = {f(r.beam.forceResidualKn,7)} kN · ΣM = {f(r.beam.momentResidualKnM,7)} kNm · {r.beam.elements.length} elementen</p>
    <details><summary>Verplaatsing en rotatie per knoop</summary><table><thead><tr><th>z [m]</th><th>y [mm]</th><th>rotatie [mrad]</th></tr></thead><tbody>{r.beam.nodes.map(n=><tr key={n.zM}><td>{f(n.zM)}</td><td>{f(n.yM*1000,4)}</td><td>{f(n.rotationRad*1000,4)}</td></tr>)}</tbody></table></details>
    <p className="settlement-warning">De ligger houdt een constante EI. De opgegeven normaalkracht wordt uitsluitend voor de doorsnedetoets gebruikt; P–Δ-effecten en een belastingsafhankelijke gescheurde EI zijn niet automatisch inbegrepen.</p>
    <details><summary>50 referentiegevallen · bronstatus</summary><p>{references.sourceReady} gevallen hebben numerieke broninvoer en -uitvoer. De overige gevallen vereisen aanvullende uitwerking of modelmapping. Nog geen externe case is als geslaagde vergelijking met deze solver aangemerkt.</p><ol>{references.cases.map(c=><li key={c.id}><a href={c.source} target="_blank" rel="noreferrer">{c.id}</a> · {c.locator} · {c.source_ready?'bron rekenklaar':'nadere uitwerking nodig'}</li>)}</ol></details>
    <button type="button" className="settlement-example" onClick={exportCalculation}>Volledige berekening downloaden (JSON)</button>
  </div>;
}
const lateralModuleTyped:CalcModule<LateralInput,LateralResult>={
  id:'laterally-loaded-pile',name:'Horizontale paalbelasting',subtitle:'Grondveren, kopkracht, kopmoment en N–M-doorsnedetoets',category:'pile',icon:'↔',
  norm:'CUR166 initiële bedding · Georgiadis-laagcorrectie · projectveerwet',status:'experimental',
  defaultInput:()=>structuredClone(lateralExample),compute:(input)=>computeLateral(input),InputPanel,VisualPanel:LateralExplorer,ResultPanel,
  statusLine:r=>({text:r.ok?`Concept · y ${f(r.maxDisplacementMm)} mm · M ${f(r.maxMomentKnM)} kNm`:r.error,ok:false}),
};
export const laterallyLoadedPileModule=lateralModuleTyped as unknown as CalcModule;
