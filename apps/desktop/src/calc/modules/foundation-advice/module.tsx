// Funderingsadvies: bundelt het grondonderzoek en alle paalberekeningen van
// het project tot één rapport met voorblad, inhoudsopgave, vaste hoofdstukken,
// situatietekening en bijlagen.
import type { CalcModule, PanelProps } from '../../framework/types';
import { useCalculationsStore } from '../../framework/store';
import { useCptStore } from '../../../store/useCptStore';
import { Hint, NumberInput, Row, Section } from '../../framework/views/SheetForm';
import { adviceSummary, type AdviceSummary } from './analysis';
import { situationLayout } from './situation';
import { buildAdviceReport } from './report';
import { GENERAL, fmt } from './texts';
import { DEFAULT_ADVICE, type AdviceInput } from './types';
import './advice.css';

type Props = PanelProps<AdviceInput, AdviceSummary>;

function useProject() {
  const cpts = useCptStore((s) => s.cpts), docId = useCptStore((s) => s.activeDocId);
  const calcs = useCalculationsStore((s) => (docId ? s.byDoc.get(docId) : undefined)) ?? [];
  return { cpts, calcs: calcs.filter((c) => c.moduleId !== 'foundation-advice') };
}

function InputPanel({ input: i, onChange }: Props) {
  const set = (patch: Partial<AdviceInput>) => onChange?.({ ...i, ...patch });
  const { cpts, calcs } = useProject();
  const text = (key: keyof AdviceInput, label: string) => <Row label={label}><input aria-label={label} value={String(i[key] ?? '')} onChange={(e) => set({ [key]: e.target.value } as Partial<AdviceInput>)} /></Row>;
  const toggle = (list: string[] | undefined, all: string[], id: string, on: boolean) => { const cur = list ?? all; const next = on ? [...new Set([...cur, id])] : cur.filter((x) => x !== id); return next.length === all.length ? undefined : next; };
  const cptIds = [...cpts.keys()], calcIds = calcs.map((c) => c.id);
  return <div className="advice-input">
    <Section title="Document">
      {text('reference', 'Kenmerk')}
      {text('version', 'Versie')}
      <Row label="Status"><select aria-label="Status" value={i.status} onChange={(e) => set({ status: e.target.value as AdviceInput['status'] })}><option value="concept">Concept</option><option value="definitief">Definitief</option></select></Row>
      {text('advisor', 'Adviseur')}
      {text('checker', 'Controle')}
      <Hint>Projectnaam, -nummer, opdrachtgever en locatie komen uit de projectgegevens.</Hint>
    </Section>
    <Section title="Uitgangspunten">
      <Row label="Gevolgklasse"><select aria-label="Gevolgklasse" value={i.consequenceClass} onChange={(e) => set({ consequenceClass: e.target.value as AdviceInput['consequenceClass'] })}><option>CC1</option><option>CC2</option><option>CC3</option></select></Row>
      <Row label="Ontwerplevensduur" unit="jaar"><NumberInput label="Ontwerplevensduur [jaar]" value={i.designLifeYears} onChange={(v) => set({ designLifeYears: v })} /></Row>
      <Row label="Peil (bovenkant vloer)" unit="m NAP"><NumberInput label="Peil [m NAP]" value={i.floorLevelNap} onChange={(v) => set({ floorLevelNap: v })} /></Row>
      <Row label="Grondwater" unit="m NAP"><NumberInput label="Grondwater ontwerp [m NAP]" value={i.groundwaterNap} onChange={(v) => set({ groundwaterNap: v })} /></Row>
      <label className="advice-area">Bouwwerk en belastingen<textarea aria-label="Bouwwerk en belastingen" rows={3} value={i.structure} onChange={(e) => set({ structure: e.target.value })} placeholder="Bijvoorbeeld: bedrijfshal van staal, 40 × 60 m, kolombelasting tot 600 kN" /></label>
    </Section>
    <Section title="Draagkrachtige laag (indicatief)">
      <Row label="qc minimaal" unit="MPa"><NumberInput label="qc draagkrachtige laag [MPa]" value={i.bearingQcMpa} onChange={(v) => set({ bearingQcMpa: v })} /></Row>
      <Row label="Over minstens" unit="m"><NumberInput label="Minimale dikte [m]" value={i.bearingMinThicknessM} onChange={(v) => set({ bearingMinThicknessM: v })} /></Row>
    </Section>
    <Section title="Opnemen">
      <div className="advice-pick" aria-label="Sonderingen in het advies">{cptIds.length ? cptIds.map((id) => <label key={id} className="cs-check"><input type="checkbox" checked={!i.cptIds || i.cptIds.includes(id)} onChange={(e) => set({ cptIds: toggle(i.cptIds, cptIds, id, e.target.checked) })} />Sondering {id}</label>) : <Hint>Nog geen sonderingen in het project.</Hint>}</div>
      <div className="advice-pick" aria-label="Berekeningen in het advies">{calcs.length ? calcs.map((c) => <label key={c.id} className="cs-check"><input type="checkbox" checked={!i.calcIds || i.calcIds.includes(c.id)} onChange={(e) => set({ calcIds: toggle(i.calcIds, calcIds, c.id, e.target.checked) })} />{c.name}</label>) : <Hint>Nog geen paalberekeningen in het project.</Hint>}</div>
      <label className="cs-check"><input type="checkbox" checked={i.soilModel3d !== false} onChange={(e) => set({ soilModel3d: e.target.checked })} /> 3D-grondmodel in de bodemopbouw</label>
      <label className="cs-check"><input type="checkbox" checked={i.appendixCpts} onChange={(e) => set({ appendixCpts: e.target.checked })} /> Bijlage sonderingen</label>
      <label className="cs-check"><input type="checkbox" checked={i.appendixCalcs} onChange={(e) => set({ appendixCalcs: e.target.checked })} /> Bijlage rekenbladen</label>
    </Section>
    <Section title="Eigen tekst">
      <label className="advice-area">Aanvulling inleiding<textarea aria-label="Aanvulling inleiding" rows={3} value={i.introNote} onChange={(e) => set({ introNote: e.target.value })} /></label>
      <label className="advice-area">Opmerkingen bij de conclusie<textarea aria-label="Opmerkingen bij de conclusie" rows={3} value={i.remarks} onChange={(e) => set({ remarks: e.target.value })} /></label>
    </Section>
  </div>;
}

/** Situatietekening en de draagkrachtige laag per sondering. */
function VisualPanel({ result: s }: Props) {
  const size = 420, L = situationLayout(s.cpts, size);
  return <div className="advice-visual">
    <svg viewBox={`-10 -10 ${size + 20} ${size + 20}`} role="img" aria-label="Situatietekening met sonderingen">
      <rect x="0" y="0" width={size} height={size} className="advice-frame" />
      {L.grid.map((g) => { const gx = (g - L.minX) / L.span * size, gy = size - (g - L.minY) / L.span * size; return <g key={g}>
        {gx > 0 && gx < size && <><line x1={gx} x2={gx} y1="0" y2={size} className="advice-grid" /><text x={gx + 2} y={size - 3} className="advice-gridlabel">X {Math.round(g)}</text></>}
        {gy > 0 && gy < size && <><line x1="0" x2={size} y1={gy} y2={gy} className="advice-grid" /><text x="3" y={gy - 2} className="advice-gridlabel">Y {Math.round(g)}</text></>}
      </g>; })}
      {L.points.map((p) => <g key={p.id} className="advice-cpt">
        <polygon points={`${p.px},${p.py - 6} ${p.px - 5.4},${p.py + 3.6} ${p.px + 5.4},${p.py + 3.6}`} />
        <text x={p.px + 8} y={p.py - 1} className="advice-cptlabel">{p.id}</text>
        {p.bearingTopNap !== null && <text x={p.px + 8} y={p.py + 9} className="advice-gridlabel">dkl NAP {fmt(p.bearingTopNap, 1)}</text>}
      </g>)}
      <g transform={`translate(${size - 24},30)`}><polygon points="0,-20 -8,6 8,6" className="advice-north" /><text x="0" y="-24" textAnchor="middle" className="advice-cptlabel">N</text></g>
      <g transform={`translate(14,${size - 18})`}><rect width={L.bar.units / 2} height="4" className="advice-north" /><rect x={L.bar.units / 2} width={L.bar.units / 2} height="4" className="advice-bar" />
        <text x="0" y="-3" className="advice-gridlabel">0</text><text x={L.bar.units} y="-3" textAnchor="middle" className="advice-gridlabel">{L.bar.m} m</text></g>
    </svg>
    {L.missing.length > 0 && <p className="cs-hint cs-hint--warn">Zonder coördinaten (niet getekend): {L.missing.join(', ')}.</p>}
    <p className="cs-hint">Driehoek: sondering; dkl = bovenkant draagkrachtige laag (indicatief). Op schaal, coördinaten in RD.</p>
  </div>;
}

/** De opbouw van het advies, als uitdraai op papier. */
function ResultPanel({ input: i, result: s }: Props) {
  return <div className="pile-result advice-sheet">
    <header className="pile-sheet-title"><h2>Funderingsadvies</h2><p>{i.reference || 'zonder kenmerk'} · versie {i.version} · {i.status}</p></header>
    <section><h3>Inhoud van het rapport</h3>
      <ol className="advice-toc">
        <li>Inleiding: aanleiding, doel en projectgegevens</li><li>Uitgangspunten</li>
        <li>Grondonderzoek: {s.cpts.length} sonderingen met situatietekening</li><li>Bodemopbouw en draagkrachtige laag{i.soilModel3d !== false ? ', met 3D-grondmodel' : ''}</li>
        {s.vertical.length > 0 && <li>Palen op druk: {s.vertical.map((v) => v.name).join(', ')}</li>}
        {s.lateral.length > 0 && <li>Horizontaal belaste palen: {s.lateral.map((l) => l.name).join(', ')}</li>}
        <li>Negatieve kleef en uitvoering</li><li>Conclusies en aanbevelingen</li>
        {i.appendixCpts && <li>Bijlage A: sonderingen</li>}{i.appendixCalcs && (s.vertical.length + s.lateral.length > 0) && <li>Bijlage B: rekenbladen</li>}
      </ol>
    </section>
    <section><h3>Draagkrachtige laag</h3>
      <p>{GENERAL.bearing(i)}</p>
      <table className="pile-sheet-checks" aria-label="Draagkrachtige laag per sondering"><thead><tr><th>Sondering</th><th>Maaiveld [m NAP]</th><th>Einde [m NAP]</th><th>qc max [MPa]</th><th>Dkl [m NAP]</th></tr></thead>
        <tbody>{s.cpts.map((c) => <tr key={c.id}><td>{c.id}</td><td className="num">{c.groundNap === null ? '—' : fmt(c.groundNap)}</td><td className="num">{c.endNap === null ? '—' : fmt(c.endNap)}</td><td className="num">{fmt(c.maxQc, 1)}</td><td className="num">{c.bearingTopNap === null ? 'niet gevonden' : fmt(c.bearingTopNap)}</td></tr>)}</tbody></table>
      {s.bearing && <p className="pile-sheet-conclusion">Bovenkant draagkrachtige laag tussen NAP {fmt(s.bearing.highest)} m en NAP {fmt(s.bearing.lowest)} m; spreiding {fmt(s.bearing.highest - s.bearing.lowest)} m.</p>}
    </section>
    <section><h3>Berekeningen in het advies</h3>
      {s.vertical.length + s.lateral.length === 0 ? <p>Nog geen paalberekeningen opgenomen.</p> : <ul>
        {s.vertical.map((v) => <li key={v.id}>{v.name}: {v.pileType}, {v.isCircular ? 'Ø' : '□'}{v.sizeMm} mm, punt NAP {fmt(v.toeNap)} m{v.ok ? `, Rc;net;d ${fmt(v.rcNetD, 0)} kN` : ' (niet berekend)'}</li>)}
        {s.lateral.map((l) => <li key={l.id}>{l.name}: {l.rows.length} palen, {l.rows.filter((r) => r.passes).length} voldoen</li>)}
      </ul>}
    </section>
  </div>;
}

const adviceModule: CalcModule<AdviceInput, AdviceSummary> = {
  id: 'foundation-advice', name: 'Funderingsadvies', subtitle: 'Rapport met grondonderzoek, situatie, paaladvies en bijlagen',
  category: 'report', icon: '📄', norm: 'NEN 9997-1', status: 'experimental', visualLabel: 'Situatie',
  defaultInput: () => ({ ...DEFAULT_ADVICE }),
  compute: (input, ctx) => adviceSummary(input, ctx),
  InputPanel, VisualPanel, ResultPanel,
  buildReport: (input, _r, ctx) => buildAdviceReport(input, ctx),
  reportFileName: (input) => `funderingsadvies-${input.reference || new Date().toISOString().slice(0, 10)}`,
  statusLine: (s) => { const n = s.vertical.length + s.lateral.length; return { text: `${s.cpts.length} ${s.cpts.length === 1 ? 'sondering' : 'sonderingen'} · ${n} ${n === 1 ? 'berekening' : 'berekeningen'}`, ok: true, pending: true }; },
};
export const foundationAdviceModule = adviceModule as unknown as CalcModule;
