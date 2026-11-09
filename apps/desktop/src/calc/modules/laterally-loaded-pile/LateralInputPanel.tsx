// Invoer horizontale paal in rekenblad-stijl, gelijk aan de verticale paal:
// eerst wat je tekent (paal, doorsnede met wapening, niveaus in m NAP),
// dan de belasting op de kop, dan de grond. Materiaalconstanten,
// bovenbelasting en rekeninstellingen staan ingeklapt.
import type { ReactNode } from 'react';
import type { PanelProps } from '../../framework/types';
import { Hint, More, NumberInput, Row, Section } from '../../framework/views/SheetForm';
import type { LateralInput, LateralLayer, LateralResult } from './compute';
import type { PileSection, SectionKind } from './section';
import { SOIL_SPRINGS, springValue } from './soil';
import { SectionSketch } from './SectionSketch';
import { STEEL_TUBE_OD, nearest, sizeText } from '../pile-bearing-capacity/standard-sizes';
import './lateral-input.css';
import { OaIcon } from '../../../components/icons/oaIcon';

type Props = PanelProps<LateralInput, LateralResult>;
const nl = (v: number, d = 2) => v.toLocaleString('nl-NL', { minimumFractionDigits: d, maximumFractionDigits: d });
const r3 = (v: number) => Math.round(v * 1000) / 1000;

const KINDS: Array<{ id: SectionKind; label: string; icon: ReactNode }> = [
  { id: 'concrete-square', label: 'Beton □', icon: <svg viewBox="0 0 32 32" aria-hidden="true"><rect x="7" y="7" width="18" height="18" fill="currentColor" opacity=".18" stroke="currentColor" strokeWidth="1.5" /><g fill="currentColor">{[[11, 11], [21, 11], [11, 21], [21, 21]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.4" />)}</g></svg> },
  { id: 'concrete-round', label: 'Beton ○', icon: <svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="10" fill="currentColor" opacity=".18" stroke="currentColor" strokeWidth="1.5" /><g fill="currentColor">{[0, 1, 2, 3, 4, 5].map((k) => <circle key={k} cx={16 + 6 * Math.cos(k * Math.PI / 3)} cy={16 + 6 * Math.sin(k * Math.PI / 3)} r="1.3" />)}</g></svg> },
  { id: 'filled-tube', label: 'Buis gevuld', icon: <svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="10" fill="currentColor" opacity=".18" stroke="currentColor" strokeWidth="3" /></svg> },
  { id: 'steel-tube', label: 'Stalen buis', icon: <svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="10" fill="none" stroke="currentColor" strokeWidth="3" /></svg> },
];

export function LateralInputPanel({ input: i, onChange }: Props) {
  const change = (patch: Partial<LateralInput>) => onChange?.({ ...i, ...patch });
  const section = (patch: Partial<PileSection>) => change({ section: { ...i.section, ...patch } });
  const s = i.section, tube = s.kind === 'steel-tube' || s.kind === 'filled-tube', hasBars = s.kind !== 'steel-tube';
  const nonlinear = i.analysisMode === 'nonlinear' || i.layerCorrection === 'georgiadis';
  // Niveaus in m NAP; de berekening zelf rekent vanaf de paalkop.
  const head = i.headNap ?? 0, nap = (z: number) => r3(head - z), depth = (n: number) => r3(head - n);
  const setLayer = (k: number, patch: Partial<LateralLayer>) => change({ layers: i.layers.map((l, j) => j === k ? { ...l, ...patch } : l) });
  const setLength = (L: number) => {
    if (!(L > 0)) return;
    // Lagen gaan mee met de paalpunt: de onderste laag eindigt op de punt.
    const last = Math.max(...i.layers.map((l) => l.bottomM));
    const layers = i.layers.filter((l) => l.topM < L - 1e-9).map((l) => ({ ...l, bottomM: Math.abs(l.bottomM - last) < 1e-9 ? L : Math.min(l.bottomM, L) }));
    change({ lengthM: r3(L), layers });
  };
  const barStep = s.kind === 'concrete-square' ? 4 : 1;
  const addLayer = () => {
    const last = i.layers[i.layers.length - 1], top = last ? r3(Math.min(i.lengthM, (last.topM + last.bottomM) / 2)) : 0;
    const shortened = last ? { ...last, bottomM: top } : undefined;
    const fresh: LateralLayer = { topM: top, bottomM: i.lengthM, springId: 'sand-medium', manualKhKnM3: 20000, frictionDeg: 30, netPressureKpa: 0, ultimate: last?.ultimate ? { ...last.ultimate } : { atSurfaceKnM: 0, gradientKnM2: 60, capKnM: 500 } };
    change({ layers: [...i.layers.slice(0, -1), ...(shortened ? [shortened] : []), fresh] });
  };

  return <div className="lat-input">
    <Section title="Paal">
      <div className="cs-tiles lat-kinds" role="radiogroup" aria-label="Paaltype">
        {KINDS.map((k) => <button key={k.id} type="button" role="radio" aria-checked={s.kind === k.id} className={`cs-tile${s.kind === k.id ? ' active' : ''}`} onClick={() => { const toTube = k.id === 'steel-tube' || k.id === 'filled-tube'; section({ kind: k.id, barCount: k.id === 'concrete-square' ? Math.max(4, Math.round(s.barCount / 4) * 4) : s.barCount, ...(toTube && !tube ? { diameterMm: nearest(STEEL_TUBE_OD, s.diameterMm), wallMm: Math.max(s.wallMm, 10) } : {}) }); }}>{k.icon}{k.label}</button>)}
      </div>
      <div className="lat-section-grid">
        <div className="lat-section-rows">
          <Row label={s.kind === 'concrete-square' ? 'Zijde' : 'Diameter'} unit="mm"><NumberInput label={`${s.kind === 'concrete-square' ? 'Zijde' : 'Diameter'} [mm]`} value={s.diameterMm} onChange={(v) => section({ diameterMm: v })} /></Row>
          {tube && <Row label="Buis"><select aria-label="Buismaat" value={STEEL_TUBE_OD.includes(s.diameterMm) ? String(s.diameterMm) : ''} onChange={(e) => e.target.value && section({ diameterMm: Number(e.target.value) })}>
            {!STEEL_TUBE_OD.includes(s.diameterMm) && <option value="">Eigen</option>}{STEEL_TUBE_OD.map((d) => <option key={d} value={d}>Ø{sizeText(d)}</option>)}</select></Row>}
          {tube && <Row label={<abbr title="Effectieve restwanddikte na corrosie">Wand</abbr>} unit="mm"><NumberInput label="Restwanddikte [mm]" value={s.wallMm} onChange={(v) => section({ wallMm: v })} /></Row>}
          {hasBars && <>
            <Row label="Staven" unit="st."><NumberInput label="Aantal langsstaven" step={String(barStep)} min={0} value={s.barCount} onChange={(v) => section({ barCount: Math.max(0, Math.round(v / barStep) * barStep) })} /></Row>
            <Row label="Staaf Ø" unit="mm"><NumberInput label="Staafdiameter [mm]" value={s.barDiameterMm} onChange={(v) => section({ barDiameterMm: v })} /></Row>
            <Row label={<abbr title="Afstand van de betonrand tot het hart van de staaf">Rand–hart</abbr>} unit="mm"><NumberInput label="Rand tot staafhart [mm]" value={s.coverToBarCentreMm} onChange={(v) => section({ coverToBarCentreMm: v })} /></Row>
          </>}
        </div>
        <SectionSketch section={s} />
      </div>
      {s.kind === 'filled-tube' && <label className="cs-check"><input type="checkbox" checked={s.tubeParticipates} onChange={(e) => section({ tubeParticipates: e.target.checked })} /> Buis werkt mee (samengestelde werking aangetoond)</label>}
      <Row label="Paalkop" unit="m NAP"><NumberInput label="Paalkop [m NAP]" value={head} onChange={(v) => change({ headNap: r3(v) })} /></Row>
      <Row label="Paalpunt" unit="m NAP"><NumberInput label="Paalpunt [m NAP]" value={nap(i.lengthM)} onChange={(v) => setLength(head - v)} /></Row>
      <Hint>Paallengte {nl(i.lengthM)} m.{i.headNap === undefined ? ' Paalkop op NAP 0,00 aangenomen; vul het werkelijke niveau in.' : ''}</Hint>
    </Section>

    <Section title="Belasting op de kop">
      <Row label="Horizontale kracht H" unit="kN"><NumberInput label="Horizontale kopkracht [kN]" value={i.headForceKn} onChange={(v) => change({ headForceKn: v })} /></Row>
      <Row label="Moment M" unit="kNm"><NumberInput label="Moment op de kop [kNm]" value={i.headMomentKnM} onChange={(v) => change({ headMomentKnM: v })} /></Row>
      <Row label="Normaalkracht N (druk +)" unit="kN"><NumberInput label="Normaalkracht [kN]" value={i.nEdKn} onChange={(v) => change({ nEdKn: v })} /></Row>
      <div className="cs-tiles lat-head" role="radiogroup" aria-label="Kop">
        {([[false, 'Vrije kop'], [true, 'Ingeklemde kop']] as const).map(([fixed, label]) => <button key={label} type="button" role="radio" aria-checked={i.headFixedRotation === fixed} className={`cs-tile${i.headFixedRotation === fixed ? ' active' : ''}`} onClick={() => change({ headFixedRotation: fixed })}>{label}</button>)}
      </div>
      <Hint>N gebruikt de rekenkern alleen voor de N–M-toets van de doorsnede, niet voor tweede-orde-effecten.</Hint>
    </Section>

    <Section title="Grond">
      <Row label="Grondveren"><select aria-label="Analyse grondveren" value={i.analysisMode ?? 'linear'} onChange={(e) => change({ analysisMode: e.target.value as LateralInput['analysisMode'] })}><option value="nonlinear">Niet-lineair (p = pu tanh(k₀y/pu))</option><option value="linear">Lineair (k₀)</option></select></Row>
      <Row label="Laagcorrectie"><select aria-label="Laagcorrectie" value={i.layerCorrection ?? 'none'} onChange={(e) => change({ layerCorrection: e.target.value as LateralInput['layerCorrection'] })}><option value="georgiadis">Georgiadis</option><option value="none">Geen</option></select></Row>
      <Row label="Bedding CUR166"><select aria-label="Beddingsscenario" value={i.scenario} onChange={(e) => change({ scenario: e.target.value as LateralInput['scenario'] })}><option value="low">Laag gemiddelde</option><option value="high">Hoog gemiddelde</option></select></Row>
      <Row label="Werkende breedte" unit="m">
        <NumberInput label="Werkende breedte grondveren [m]" value={i.springWidthM} onChange={(v) => change({ springWidthM: v })} />
        {Math.abs(i.springWidthM - s.diameterMm / 1000) > 1e-9 && <button type="button" className="lat-mini" onClick={() => change({ springWidthM: s.diameterMm / 1000 })} title="Gelijk aan de paalbreedte">= paal</button>}
      </Row>
      <table className="cs-layer-table lat-layers" aria-label="Grondlagen">
        <thead>
          <tr><th>Van<small>m NAP</small></th><th>Tot<small>m NAP</small></th><th colSpan={2}>Grond</th><th /></tr>
          <tr className="lat-layers-sub"><th>kh<small>kN/m³</small></th>{nonlinear ? <><th>pu,0<small>kN/m</small></th><th>g<small>kN/m²</small></th><th>pu,max<small>kN/m</small></th></> : <th colSpan={3} />}<th /></tr>
        </thead>
        {i.layers.map((l, k) => <tbody key={k} className="lat-layer">
          <tr>
            <td><NumberInput label={`Bovenkant laag ${k + 1} [m NAP]`} value={nap(l.topM)} onChange={(v) => setLayer(k, { topM: depth(v) })} /></td>
            <td><NumberInput label={`Onderkant laag ${k + 1} [m NAP]`} value={nap(l.bottomM)} onChange={(v) => setLayer(k, { bottomM: depth(v) })} /></td>
            <td colSpan={2}><select aria-label={`Bedding laag ${k + 1}`} value={l.springId} onChange={(e) => { const id = e.target.value, profile = i.puDefaults?.[id]; setLayer(k, { springId: id, ...(profile && Object.values(profile).every(Number.isFinite) ? { ultimate: { ...profile } } : {}) }); }}>{SOIL_SPRINGS.map((v) => <option key={v.id} value={v.id}>{v.label.split(' (')[0]}</option>)}<option value="manual">Eigen waarde</option></select></td>
            <td><button type="button" className="lat-mini" aria-label={`Laag ${k + 1} verwijderen`} disabled={i.layers.length < 2} onClick={() => change({ layers: i.layers.filter((_, j) => j !== k) })}><OaIcon id="edit.delete" /></button></td>
          </tr>
          <tr className="lat-layers-sub">
            <td>{l.springId === 'manual'
              ? <NumberInput label={`kh laag ${k + 1} [kN/m³]`} value={l.manualKhKnM3} onChange={(v) => setLayer(k, { manualKhKnM3: v })} />
              : <span className="lat-readonly" title={i.springOverrides?.[l.springId]?.[i.scenario] !== undefined ? 'Eigen waarde uit de instellingen' : 'CUR166 tabel 3.3, eerste secanttraject'}>{(i.springOverrides?.[l.springId]?.[i.scenario] ?? springValue(l.springId, i.scenario)).toLocaleString('nl-NL')}{i.springOverrides?.[l.springId]?.[i.scenario] !== undefined ? ' *' : ''}</span>}</td>
            {nonlinear ? (['atSurfaceKnM', 'gradientKnM2', 'capKnM'] as const).map((key) => <td key={key}><NumberInput label={`${key === 'atSurfaceKnM' ? 'pu,0' : key === 'gradientKnM2' ? 'g' : 'pu,max'} laag ${k + 1}`} value={l.ultimate?.[key]}
              onChange={(v) => setLayer(k, { ultimate: { atSurfaceKnM: NaN, gradientKnM2: NaN, capKnM: NaN, ...l.ultimate, [key]: v } })} /></td>) : <td colSpan={3} />}
            <td />
          </tr>
        </tbody>)}
      </table>
      <button type="button" className="lat-add" onClick={addLayer}>+ Laag</button>
      <Hint>{nonlinear ? 'pu(z) = min(pu,max; pu,0 + g·z), grensweerstand per meter paal. ' : ''}k₀ = kh × werkende breedte. Tussen lagen zonder bedding draagt de grond niet.</Hint>
    </Section>

    <More title="Materiaal en sterkte">
      {hasBars && <>
        <Row label="E beton" unit="MPa"><NumberInput label="E beton [MPa]" value={s.concreteEMpa} onChange={(v) => section({ concreteEMpa: v })} /></Row>
        <Row label="Projectfactor betonstijfheid" unit="—"><NumberInput label="Projectfactor betonstijfheid" value={s.concreteFactor} onChange={(v) => section({ concreteFactor: v })} /></Row>
        <Row label="Kruipcoëfficiënt" unit="—"><NumberInput label="Kruipcoëfficiënt" value={s.creepCoefficient} onChange={(v) => section({ creepCoefficient: v })} /></Row>
        <Row label="fck (≤ 50)" unit="MPa"><NumberInput label="fck [MPa]" value={s.fckMpa} onChange={(v) => section({ fckMpa: v })} /></Row>
        <Row label="fcd" unit="MPa"><NumberInput label="fcd [MPa]" value={s.fcdMpa} onChange={(v) => section({ fcdMpa: v })} /></Row>
        <Row label="E wapening" unit="MPa"><NumberInput label="E wapening [MPa]" value={s.rebarEMpa} onChange={(v) => section({ rebarEMpa: v })} /></Row>
        <Row label="fyd wapening" unit="MPa"><NumberInput label="fyd wapening [MPa]" value={s.fydMpa} onChange={(v) => section({ fydMpa: v })} /></Row>
      </>}
      {tube && <>
        <Row label="E buisstaal" unit="MPa"><NumberInput label="E buisstaal [MPa]" value={s.steelEMpa} onChange={(v) => section({ steelEMpa: v })} /></Row>
        <Row label="fyd buisstaal" unit="MPa"><NumberInput label="fyd buisstaal [MPa]" value={s.tubeFydMpa} onChange={(v) => section({ tubeFydMpa: v })} /></Row>
      </>}
      <Hint>EI = Ec,eff·Ic + Es·Is + Ea·Ia met Ec,eff = Ec × projectfactor / (1 + kruip). Ontwerpsterkten inclusief materiaalfactoren invullen.</Hint>
    </More>

    <More title="Bovenbelasting en gronddruk">
      <Row label="Bovenbelasting q" unit="kPa"><NumberInput label="Bovenbelasting [kPa]" value={i.surchargeKpa} onChange={(v) => change({ surchargeKpa: v })} /></Row>
      <Row label="Model"><select aria-label="Bovenbelastingmodel" value={i.surchargeMode} onChange={(e) => change({ surchargeMode: e.target.value as LateralInput['surchargeMode'] })}><option value="unresolved">Vrijstaande paal (niet toegepast)</option><option value="retaining">Kerend element, eenzijdig q</option></select></Row>
      <Row label="Kerende invloedbreedte" unit="m"><NumberInput label="Kerende invloedbreedte [m]" value={i.surchargeWidthM} onChange={(v) => change({ surchargeWidthM: v })} /></Row>
      <Row label="Richting"><select aria-label="Richting bovenbelasting" value={i.surchargeSign} onChange={(e) => change({ surchargeSign: Number(e.target.value) })}><option value={1}>Met H mee</option><option value={-1}>Tegen H in</option></select></Row>
      <table className="cs-layer-table" aria-label="Gronddruk per laag">
        <thead><tr><th>Laag</th><th>φ<small>°</small></th><th>Netto druk<small>kPa</small></th></tr></thead>
        <tbody>{i.layers.map((l, k) => <tr key={k}><td>{k + 1}</td>
          <td><NumberInput label={`Wrijvingshoek laag ${k + 1} [°]`} value={l.frictionDeg} onChange={(v) => setLayer(k, { frictionDeg: v })} /></td>
          <td><NumberInput label={`Netto gronddruk laag ${k + 1} [kPa]`} value={l.netPressureKpa} onChange={(v) => setLayer(k, { netPressureKpa: v })} /></td></tr>)}</tbody>
      </table>
      <Hint>Kerend model: Δp = Ka·q met Ka = tan²(45° − φ/2), lijnlast = Δp × invloedbreedte. Alleen de toename door q; geen strookbelasting of grondverplaatsing rond een vrije paal.</Hint>
    </More>

    <More title="Rekeninstellingen">
      <Row label="Maximale elementlengte" unit="m"><NumberInput label="Maximale elementlengte [m]" value={i.maxElementM} onChange={(v) => change({ maxElementM: v })} /></Row>
      <label className="cs-check"><input type="checkbox" checked={i.toeFixed} onChange={(e) => change({ toeFixed: e.target.checked })} /> Paalpunt ingeklemd</label>
    </More>
  </div>;
}
