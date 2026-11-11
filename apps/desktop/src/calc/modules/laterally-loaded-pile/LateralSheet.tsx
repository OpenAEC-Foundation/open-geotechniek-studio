// Uitdraai horizontale paal: dezelfde opbouw als het rekenblad van het
// draagvermogen. Eerst de uitgangspunten, dan per stap de uitkomst met de
// ingevulde formule, en tot slot de toets en de conclusie.
import type { PanelProps } from '../../framework/types';
import type { LateralInput, LateralResult } from './compute';
import { ForceDiagrams, extremes } from './ForceDiagrams';
import { mobilisation } from './SpringField';
import references from './reference-cases.json';
import { SectionSketch } from './SectionSketch';
import { lateralReportData, type LayerRow } from './report-data';
import '../pile-bearing-capacity/ui/styles.css';

type Ok = Extract<LateralResult, { ok: true }>;
const n = (v: number, d = 1) => Number.isFinite(v) ? v.toLocaleString('nl-NL', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
const KIND_LABEL: Record<string, string> = { 'concrete-square': 'Betonpaal, vierkant', 'concrete-round': 'Betonpaal, rond', 'steel-tube': 'Stalen buis, hol', 'filled-tube': 'Stalen buis, betongevuld' };

/** Samenvatting die de uitdraai, de chips en het PDF-rapport delen. */
export function lateralSummary(input: LateralInput, r: Ok) {
  const head = input.headNap ?? 0, s = r.beam.samples;
  const M = extremes(s, (p) => p.momentKnM), V = extremes(s, (p) => p.shearKn), y = extremes(s, (p) => p.yM * 1000), p = extremes(s, (q) => q.reactionKnM);
  const mob = r.springs.map((x) => ({ x, m: mobilisation(x) })).filter((v) => v.m !== null).sort((a, b) => b.m! - a.m!)[0];
  const mEd = Math.max(Math.abs(M.max.v), Math.abs(M.min.v));
  return {
    head, toe: head - input.lengthM, M, V, y, p, mEd,
    yHeadMm: r.beam.nodes[0].yM * 1000,
    mobilisation: mob ? { value: mob.m!, nap: head - mob.x.zM } : null,
    uc: r.sectionUtilization,
  };
}

export function sectionText(s: LateralInput['section']): string {
  const size = s.kind === 'concrete-square' ? `□${s.diameterMm} mm` : `Ø${s.diameterMm} mm`;
  const bars = s.kind === 'steel-tube' || s.barCount < 1 ? '' : `, ${s.barCount}Ø${s.barDiameterMm} op ${s.coverToBarCentreMm} mm van de rand`;
  const wall = s.kind === 'steel-tube' || s.kind === 'filled-tube' ? `, wand ${s.wallMm} mm` : '';
  return `${KIND_LABEL[s.kind]} ${size}${wall}${bars}`;
}

export function LateralSheet({ input: i, result }: PanelProps<LateralInput, LateralResult>) {
  if (!result.ok) return <div className="pile-result-pending"><p><strong>Niet berekend.</strong> {result.error}</p></div>;
  const r = result, sum = lateralSummary(i, r), nap = (z: number) => `NAP ${n(sum.head - z, 2)}`;
  const nonlinear = r.analysisMode === 'nonlinear';
  const ok = sum.uc !== null && sum.uc <= 1;
  const data = lateralReportData(i, r), sec = r.section, tube = i.section.kind === 'steel-tube' || i.section.kind === 'filled-tube';
  const grossArea = i.section.kind === 'concrete-square' ? (i.section.diameterMm / 1000) ** 2 : Math.PI * (i.section.diameterMm / 1000) ** 2 / 4;
  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ module: 'laterally-loaded-pile', status: 'concept', input: i, result: r, references }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'horizontale-paalbelasting.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  return <div className="pile-result lateral-sheet">
    <header className="pile-sheet-title">
      <h2>Horizontale paalbelasting</h2>
      <p>{sectionText(i.section)} · {nonlinear ? 'niet-lineaire grondveren' : 'lineaire grondveren'}{i.layerCorrection === 'georgiadis' ? ', laagcorrectie Georgiadis' : ''} · concept</p>
    </header>

    <section>
    <h3>Uitgangspunten</h3>
    <table className="pile-sheet-facts"><tbody>
      <tr><th scope="row">Paal</th><td colSpan={3}>{sectionText(i.section)}</td></tr>
      <tr><th scope="row">Paalkop</th><td>{nap(0)} m</td><th scope="row">Paalpunt</th><td>{nap(i.lengthM)} m</td></tr>
      <tr><th scope="row">Lengte</th><td>{n(i.lengthM, 2)} m</td><th scope="row">Kop</th><td>{i.headFixedRotation ? 'ingeklemd' : 'vrij draaiend'}{i.toeFixed ? ', voet ingeklemd' : ''}</td></tr>
      <tr><th scope="row">H op de kop</th><td>{n(i.headForceKn)} kN</td><th scope="row">M op de kop</th><td>{n(i.headMomentKnM)} kNm</td></tr>
      <tr><th scope="row">N (druk +)</th><td>{n(i.nEdKn)} kN</td><th scope="row">Werkende breedte</th><td>{n(i.springWidthM, 2)} m</td></tr>
    </tbody></table>
    </section>

    <section>
    <h3>Paaldoorsnede</h3>
    <div className="lateral-sheet-section">
      <SectionSketch section={i.section} />
      <table className="pile-sheet-facts"><tbody>
        <tr><th scope="row">Doorsnede</th><td>{sectionText(i.section)}</td></tr>
        <tr><th scope="row">Bruto oppervlak</th><td>{n(grossArea * 1e6, 0)} mm²</td></tr>
        {sec.concreteAreaM2 > 0 && <tr><th scope="row">Beton (netto)</th><td>{n(sec.concreteAreaM2 * 1e6, 0)} mm² · Ec,eff = {n(i.section.concreteEMpa * i.section.concreteFactor / (1 + i.section.creepCoefficient), 0)} MPa</td></tr>}
        {sec.rebarAreaMm2 > 0 && <tr><th scope="row">Langswapening</th><td>{n(sec.rebarAreaMm2, 0)} mm² · ρ = {n(100 * sec.rebarAreaMm2 / (grossArea * 1e6), 2)} %</td></tr>}
        {tube && <tr><th scope="row">Buis</th><td>{n(sec.steelAreaM2 * 1e6, 0)} mm² · wand {n(i.section.wallMm, 1)} mm{i.section.kind === 'filled-tube' ? (i.section.tubeParticipates ? ' · werkt mee' : ' · werkt niet mee in EI') : ''}</td></tr>}
        <tr><th scope="row">Sterkten</th><td>{i.section.kind !== 'steel-tube' ? `fck ${n(i.section.fckMpa, 0)} · fcd ${n(i.section.fcdMpa, 1)} · fyd ${n(i.section.fydMpa, 0)} MPa` : ''}{tube ? `${i.section.kind !== 'steel-tube' ? ' · ' : ''}fyd buis ${n(i.section.tubeFydMpa, 0)} MPa` : ''}</td></tr>
        {r.capacity && <tr><th scope="row">MRd bij NEd</th><td>{n(r.capacity.mRdKnM)} kNm (N tussen {n(r.capacity.nMinKn, 0)} en {n(r.capacity.nMaxKn, 0)} kN)</td></tr>}
      </tbody></table>
    </div>
    </section>

    <section>
    <h3>Grondopbouw</h3>
    <div className="lateral-sheet-soil">
      <SoilColumn layers={data.layers} head={data.head} toe={data.head - i.lengthM} />
      <table className="pile-sheet-checks lateral-soil-table" aria-label="Grondlagen met toegekende eigenschappen">
        <thead><tr><th /><th>Laag</th><th>m NAP</th><th>Grond</th><th>kh<br /><small>kN/m³</small></th><th>k₀<br /><small>kN/m²</small></th>{data.nonlinear && <th>pu boven–onder<br /><small>kN/m</small></th>}</tr></thead>
        <tbody>{data.layers.map((l) => <tr key={l.index}><td><span className="lateral-swatch" style={{ background: l.color }} /></td><td>{l.index}</td>
          <td className="num">{n(l.topNap, 2)}<br />{n(l.bottomNap, 2)}</td><td>{l.label}<br /><small>{l.source}</small></td>
          <td className="num">{n(l.khKnM3, 0)}</td><td className="num">{n(l.k0KnM2, 0)}</td>
          {data.nonlinear && <td className="num">{l.puTop === null ? '—' : `${n(l.puTop, 0)} – ${n(l.puBottom!, 0)}`}<br /><small>{l.ultimate}</small></td>}</tr>)}</tbody>
      </table>
    </div>
    <table className="pile-sheet-checks" aria-label="Overige laageigenschappen">
      <thead><tr><th>Laag</th><th>Dikte [m]</th><th>φ [°]</th><th>Ka [–]</th><th>Lijnlast [kN/m]</th><th>zeq boven–onder [m]</th>{data.nonlinear && <th>∫pu dz [kN]</th>}</tr></thead>
      <tbody>{data.layers.map((l) => <tr key={l.index}><td>{l.index}</td><td className="num">{n(l.thicknessM, 2)}</td><td className="num">{n(l.frictionDeg, 0)}</td><td className="num">{n(l.ka, 3)}</td>
        <td className="num">{n(l.lineLoadKnM, 1)}</td><td className="num">{n(l.zeqTop, 2)} – {n(l.zeqBottom, 2)}</td>{data.nonlinear && <td className="num">{l.cumulativeKn === null ? '—' : n(l.cumulativeKn, 0)}</td>}</tr>)}</tbody>
    </table>
    <p className="pile-result-pending-note">k₀ = kh × werkende breedte {n(i.springWidthM, 2)} m (CUR166 tabel 3.3, eerste secanttraject){nonlinear ? '; p = pu · tanh(k₀ y / pu); pu als functie van de equivalente diepte zeq' : '; p = k₀ y'}.{i.layerCorrection === 'georgiadis' ? ' Georgiadis: zeq zo dat de grensweerstand van de bovenliggende lagen behouden blijft.' : ''}</p>
    </section>

    <section>
    <h3>Buigstijfheid</h3>
    <div className="pile-formula"><div className="pile-formula-row"><span className="pile-formula-lhs">EI</span><span className="pile-formula-eq">=</span><span className="pile-formula-rhs">Ec,eff·Ic + Es·Is + Ea·Ia</span></div>
      <div className="pile-formula-row pile-formula-row--cont"><span className="pile-formula-lhs" /><span className="pile-formula-eq">=</span><span className="pile-formula-rhs">{n(r.section.concreteEI, 0)} + {n(r.section.rebarEI, 0)} + {n(r.section.tubeEI, 0)}</span></div>
      <div className="pile-formula-row pile-formula-row--cont pile-formula-row--result"><span className="pile-formula-lhs" /><span className="pile-formula-eq">=</span><span className="pile-formula-rhs"><strong>{n(r.section.eiKnM2, 0)} kNm²</strong></span></div></div>
    </section>

    <section>
    <h3>Resultaten</h3>
    <table className="pile-sheet-checks" aria-label="Resultaten met niveau">
      <thead><tr><th>Grootheid</th><th>Maximum</th><th>Niveau</th><th>Minimum</th><th>Niveau</th></tr></thead>
      <tbody>
        <tr><td>Verplaatsing y [mm]</td><td className="num">{n(sum.y.max.v, 2)}</td><td>{nap(sum.y.max.z)}</td><td className="num">{n(sum.y.min.v, 2)}</td><td>{nap(sum.y.min.z)}</td></tr>
        <tr><td>Moment M [kNm]</td><td className="num">{n(sum.M.max.v)}</td><td>{nap(sum.M.max.z)}</td><td className="num">{n(sum.M.min.v)}</td><td>{nap(sum.M.min.z)}</td></tr>
        <tr><td>Dwarskracht V [kN]</td><td className="num">{n(sum.V.max.v)}</td><td>{nap(sum.V.max.z)}</td><td className="num">{n(sum.V.min.v)}</td><td>{nap(sum.V.min.z)}</td></tr>
        <tr><td>Grondreactie p [kN/m]</td><td className="num">{n(sum.p.max.v)}</td><td>{nap(sum.p.max.z)}</td><td className="num">{n(sum.p.min.v)}</td><td>{nap(sum.p.min.z)}</td></tr>
      </tbody>
    </table>
    <p className="pile-result-pending-note">Kopverplaatsing {n(sum.yHeadMm, 2)} mm{sum.mobilisation ? ` · hoogste mobilisatie p/pu ${n(sum.mobilisation.value * 100, 0)} % op NAP ${n(sum.mobilisation.nap, 2)}` : ''} · evenwicht ΣF = {r.beam.forceResidualKn.toExponential(1)} kN.</p>
    <div className="lateral-sheet-diagrams"><ForceDiagrams input={i} beam={r.beam} /></div>
    </section>

    <section>
    <h3>Grondreactie per laag</h3>
    <table className="pile-sheet-checks" aria-label="Grondreactie per laag">
      <thead><tr><th /><th>Laag</th><th>Veren</th><th>y max [mm]</th><th>p max [kN/m]</th><th>Kracht op paal [kN]</th>{nonlinear && <><th>p/pu max</th><th>ksec/k₀ min</th></>}</tr></thead>
      <tbody>{data.layers.map((l) => <tr key={l.index}><td><span className="lateral-swatch" style={{ background: l.color }} /></td><td>{l.index}</td><td className="num">{l.springs}</td>
        <td className="num">{n(l.yMaxMm, 2)}</td><td className="num">{n(l.pMaxKnM, 1)}</td><td className="num">{n(l.resultantKn, 1)}</td>
        {nonlinear && <><td className="num">{l.mobMax === null ? '—' : `${n(l.mobMax * 100, 0)} %`}</td><td className="num">{n(l.secantRatioMin, 2)}</td></>}</tr>)}
        <tr className="lateral-sum"><td /><td colSpan={4}>Som grondkrachten + H op de kop</td><td className="num">{n(data.soilForce + i.headForceKn, 3)}</td>{nonlinear && <td colSpan={2} />}</tr>
      </tbody>
    </table>
    </section>

    <section>
    <h3>Verloop over de diepte</h3>
    <table className="pile-sheet-checks lateral-depth-table" aria-label="Verloop over de diepte">
      <thead><tr><th>m NAP</th><th>y [mm]</th><th>θ [mrad]</th><th>M [kNm]</th><th>V [kN]</th><th>p [kN/m]</th></tr></thead>
      <tbody>{data.depth.map((d) => <tr key={d.z}><td className="num">{n(d.nap, 2)}</td><td className="num">{n(d.yMm, 2)}</td><td className="num">{n(d.rotMrad, 3)}</td>
        <td className="num">{n(d.mKnM, 1)}</td><td className="num">{n(d.vKn, 1)}</td><td className="num">{n(d.pKnM, 1)}</td></tr>)}</tbody>
    </table>
    <p className="pile-result-pending-note">Stap {n(data.step, 2)} m; tussenliggende waarden lineair uit de elementoplossing.</p>
    </section>

    <section>
    <h3>Doorsnedetoets N–M</h3>
    {r.capacity ? <div className="pile-formula">
      <div className="pile-formula-row"><span className="pile-formula-lhs">u.c.</span><span className="pile-formula-eq">=</span><span className="pile-formula-rhs">|M|max / MRd(NEd)</span></div>
      <div className="pile-formula-row pile-formula-row--cont"><span className="pile-formula-lhs" /><span className="pile-formula-eq">=</span><span className="pile-formula-rhs">{n(sum.mEd)} / {n(r.capacity.mRdKnM)}</span></div>
      <div className="pile-formula-row pile-formula-row--cont pile-formula-row--result"><span className="pile-formula-lhs" /><span className="pile-formula-eq">=</span><span className="pile-formula-rhs"><strong>{n(sum.uc ?? NaN, 2)}</strong></span></div>
    </div> : <p className="pile-result-pending-note">{r.capacityError}</p>}
    {data.nm.length > 1 && <NMCurve points={data.nm} nEd={i.nEdKn} mEd={sum.mEd} />}
    </section>

    <section>
    <h3>Conclusie</h3>
    <p className="pile-sheet-conclusion">{sum.uc === null ? 'Geen doorsnedetoets mogelijk.' : ok
      ? `De doorsnede voldoet voor buiging met normaalkracht: u.c. ${n(sum.uc, 2)} ≤ 1,00. Kopverplaatsing ${n(sum.yHeadMm, 1)} mm.`
      : `De doorsnede voldoet niet: u.c. ${n(sum.uc, 2)} > 1,00. Vergroot de doorsnede of de wapening.`}</p>
    <p className="pile-result-pending-note">Niet getoetst: dwarskracht, scheurwijdte, minimumwapening, verankering, lokale buisplooi, P–Δ en een gescheurde EI. Statische, monotone belasting.</p>
    </section>

    <details className="lateral-sheet-more"><summary>Rekendetails</summary>
      <p>{r.convergence.loadSteps} belastingstappen · {r.convergence.iterations} iteraties · residu {r.convergence.residualKn.toExponential(2)} kN · {r.beam.elements.length} elementen.</p>
      <table className="pile-sheet-checks"><thead><tr><th>Laag</th><th>zeq,top [m]</th><th>zeq,onder [m]</th><th>∫pu dz [kN]</th></tr></thead>
        <tbody>{r.layering.map((l, j) => <tr key={j}><td>{j + 1}</td><td className="num">{n(l.topEquivalentM, 3)}</td><td className="num">{n(l.bottomEquivalentM, 3)}</td><td className="num">{nonlinear || i.layerCorrection === 'georgiadis' ? n(l.cumulativeUltimateKn, 1) : '—'}</td></tr>)}</tbody></table>
      <p>{references.sourceReady} van {references.cases.length} referentiegevallen hebben numerieke broninvoer; de rekenkern is geverifieerd tegen gesloten oplossingen en een onafhankelijke differentieoplossing.</p>
      <button type="button" className="settlement-example" onClick={exportJson}>Volledige berekening downloaden (JSON)</button>
    </details>
  </div>;
}

/** Grondkolom op schaal met NAP-niveaus en de paal ernaast. */
function SoilColumn({ layers, head, toe }: { layers: LayerRow[]; head: number; toe: number }) {
  const H = 300, top = 14, span = Math.max(1e-9, head - toe), y = (nap: number) => top + H * (head - nap) / span;
  return <svg className="lateral-soil-column" viewBox={`0 0 150 ${H + top + 16}`} role="img" aria-label="Grondopbouw langs de paal">
    {layers.map((l) => <g key={l.index}>
      <rect x="44" y={y(l.topNap)} width="70" height={Math.max(0, y(l.bottomNap) - y(l.topNap))} fill={l.color} stroke="#555" strokeWidth=".6" />
      <text x="79" y={(y(l.topNap) + y(l.bottomNap)) / 2 + 3} textAnchor="middle" className="lateral-soil-name">{l.index}</text>
      <text x="40" y={y(l.topNap) + 3} textAnchor="end">{n(l.topNap, 2)}</text>
    </g>)}
    <text x="40" y={y(toe) + 3} textAnchor="end">{n(toe, 2)}</text>
    <rect x="120" y={y(head)} width="8" height={y(toe) - y(head)} className="lateral-soil-pile" />
    <text x="124" y={y(head) - 3} textAnchor="middle">paal</text>
  </svg>;
}

/** N–M-interactie van de doorsnede met het ontwerppunt (NEd, |M|max). */
function NMCurve({ points, nEd, mEd }: { points: Array<{ n: number; m: number }>; nEd: number; mEd: number }) {
  const W = 360, H = 220, pad = 42;
  const nLo = Math.min(...points.map((p) => p.n), nEd), nHi = Math.max(...points.map((p) => p.n), nEd), mHi = Math.max(...points.map((p) => p.m), mEd) * 1.08 || 1;
  const x = (m: number) => pad + (W - pad - 10) * m / mHi, y = (v: number) => H - 28 - (H - 44) * (v - nLo) / ((nHi - nLo) || 1);
  const inside = points.length > 1 && mEd <= (points.reduce((best, p) => Math.abs(p.n - nEd) < Math.abs(best.n - nEd) ? p : best, points[0]).m);
  return <figure className="lateral-nm">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`N–M-interactiekromme met ontwerppunt NEd ${n(nEd, 0)} kN, MEd ${n(mEd)} kNm`}>
      <line className="pile-axis" x1={pad} x2={W - 10} y1={y(0)} y2={y(0)} /><line className="pile-axis" x1={pad} x2={pad} y1={14} y2={H - 28} />
      <polygon className="lateral-nm-area" points={[`${pad},${y(points[0].n)}`, ...points.map((p) => `${x(p.m)},${y(p.n)}`), `${pad},${y(points[points.length - 1].n)}`].join(' ')} />
      <circle cx={x(mEd)} cy={y(nEd)} r="4" className={inside ? 'lateral-nm-ok' : 'lateral-nm-fail'} />
      <text x={x(mEd) + 6} y={y(nEd) - 6}>({n(mEd, 0)}; {n(nEd, 0)})</text>
      <text x={W - 10} y={H - 10} textAnchor="end">MRd [kNm]</text><text x="6" y="12">N [kN] druk +</text>
      <text x={pad - 4} y={y(nHi) + 3} textAnchor="end">{n(nHi, 0)}</text><text x={pad - 4} y={y(nLo) + 3} textAnchor="end">{n(nLo, 0)}</text>
      <text x={x(Math.max(...points.map((p) => p.m)))} y={H - 16} textAnchor="middle">{n(Math.max(...points.map((p) => p.m)), 0)}</text>
    </svg>
    <figcaption>Interactiekromme van de doorsnede; het punt is het ontwerppunt.</figcaption>
  </figure>;
}

