// Rekenblad trekpaal: invoer, tekening van sondering en paal, en de uitwerking per laag.
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { PanelProps } from "../../framework/types";
import { Hint, More, NumberInput, Row, Section } from "../../framework/views/SheetForm";
import { useCptStore } from "../../../store/useCptStore";
import { numberLocale } from "../../i18n";
import { TENSION_PILE_TYPES, getTensionPileType } from "./catalog";
import { InterpretationEditor, InterpretationNote, draftOf, type OverrideDraft } from "../../shared/interpretation/InterpretationEditor";
import { SOIL_DEFAULTS, SOIL_LABELS, correlationFactors, tensionInterpretation, type TensionAppliedOverride, type TensionInput, type TensionResult, type TensionSoil } from "./compute";
import "./styles.css";

type Props = PanelProps<TensionInput, TensionResult>;
export const fmt = (v: number, d = 1) => (Number.isFinite(v) ? v.toLocaleString(numberLocale(), { minimumFractionDigits: d, maximumFractionDigits: d }) : "—");
const SOILS: TensionSoil[] = ["sand", "clay", "loam", "peat"];
const soilName = (kind: TensionSoil) => SOIL_LABELS[kind];

export function InputPanel({ input: i, result, onChange }: Props) {
  const cpts = useCptStore((s) => s.cpts);
  const change = (patch: Partial<TensionInput>) => onChange?.({ ...i, ...patch });
  const cpt = i.cptId ? cpts.get(i.cptId) : undefined;
  const ground = cpt?.metadata.ground_level_nap ?? 0;
  const type = getTensionPileType(i.pileTypeId);
  const excavated = i.excavationNap !== undefined && i.excavationNap < ground - 1e-6;
  const xi = correlationFactors(i.cptCount, i.stiffStructure);
  const group = i.group;
  const setGroup = (patch: Partial<NonNullable<TensionInput["group"]>>) => change({ group: { spacingXM: 2.5, spacingYM: 2.5, ...group, ...patch } });
  const setSoil = (kind: TensionSoil, patch: Partial<typeof SOIL_DEFAULTS.sand>) => change({ soil: { ...i.soil, [kind]: { ...i.soil?.[kind], ...patch } } });
  return <div className="tp-input">
    <Section title="Sondering en paal">
      <Row label="Sondering"><select aria-label="Sondering" value={i.cptId ?? ""} onChange={(e) => change({ cptId: e.target.value || null })}>
        {!i.cptId && <option value="">Kies…</option>}{[...cpts.keys()].map((id) => <option key={id} value={id}>{id}</option>)}</select></Row>
      <Row label="Paaltype"><select aria-label="Paaltype" value={i.pileTypeId} onChange={(e) => change({ pileTypeId: e.target.value })}>
        {TENSION_PILE_TYPES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Row>
      {type && <Hint>αt = {fmt(type.alphaT, 4)} in zand (tabel 7.c). {type.displacement === "full" ? "Grondverdringend: het paalgewicht telt mee." : "Niet of weinig grondverdringend: het paalgewicht telt niet mee."}</Hint>}
      <Row label={type?.isCircular === false ? "Zijde" : "Diameter"} unit="mm"><NumberInput label="Paalmaat [mm]" min={1} value={i.sizeMm} onChange={(v) => change({ sizeMm: v })} /></Row>
      <Row label="Paalkop" unit="m NAP"><NumberInput label="Paalkop [m NAP]" value={i.pileTopNap} onChange={(v) => change({ pileTopNap: v })} /></Row>
      <Row label="Paalpunt" unit="m NAP"><NumberInput label="Paalpunt [m NAP]" value={i.pileToeNap} onChange={(v) => change({ pileToeNap: v })} /></Row>
      <Hint>Maaiveld sondering NAP {fmt(ground, 2)} m; paallengte {fmt(i.pileTopNap - i.pileToeNap, 2)} m.</Hint>
    </Section>
    <Section title="Grond en water">
      <Row label="Grondwaterstand" unit="m NAP"><NumberInput label="Grondwaterstand [m NAP]" value={i.waterNap} onChange={(v) => change({ waterNap: v })} /></Row>
      <Row label="Ontgraving tot" unit="m NAP"><NumberInput label="Ontgravingsniveau [m NAP]" value={i.excavationNap ?? ground} onChange={(v) => change({ excavationNap: v })} /></Row>
      {excavated && <Row label="Reductie qc"><select aria-label="Reductie van de conusweerstand door ontgraven" value={i.excavationReduction} onChange={(e) => change({ excavationReduction: e.target.value as TensionInput["excavationReduction"] })}>
        <option value="sqrt">Paal vóór ontgraven of trillingsarm (wortel)</option><option value="linear">Geheid na ontgraven (lineair)</option><option value="none">Sondering na ontgraven (geen)</option></select></Row>}
      <Row label="Bovenkant trekzone" unit="m NAP"><NumberInput label="Bovenkant trekzone [m NAP]" value={i.tensionTopNap ?? Math.round((Math.min(i.excavationNap ?? ground, ground) - 1) * 100) / 100} onChange={(v) => change({ tensionTopNap: v })} /></Row>
      <Hint>De bovenste meter onder maaiveld of ontgraving telt niet mee. Zet de bovenkant lager als slappe lagen niet mogen meetellen.</Hint>
      <label className="cs-check"><input type="checkbox" checked={i.includeCohesive} onChange={(e) => change({ includeCohesive: e.target.checked })} /> Klei en leem tellen mee (tabel 7.d)</label>
      {i.includeCohesive && <label className="cs-check"><input type="checkbox" checked={i.halveCohesive} onChange={(e) => change({ halveCohesive: e.target.checked })} /> Halve αt in klei en leem (paal hangt vooral aan zand)</label>}
    </Section>
    <Section title="Belasting">
      <Row label={<abbr title="Rekenwaarde van de trekbelasting">Ft;d</abbr>} unit="kN"><NumberInput label="Rekenwaarde trekbelasting [kN]" min={0} value={i.ftDKn} onChange={(v) => change({ ftDKn: v })} /></Row>
      <Row label={<abbr title="Grootste representatieve trekbelasting">Ft;max;rep</abbr>} unit="kN"><NumberInput label="Grootste representatieve trekbelasting [kN]" value={i.ftMaxRepKn} onChange={(v) => change({ ftMaxRepKn: v })} /></Row>
      <Row label={<abbr title="Kleinste representatieve belasting; druk is negatief">Ft;min;rep</abbr>} unit="kN"><NumberInput label="Kleinste representatieve belasting [kN]" value={i.ftMinRepKn} onChange={(v) => change({ ftMinRepKn: v })} /></Row>
      {result.ok && <Hint>Wisselbelasting: γm;var;qc = {fmt(result.factors.gammaVar, 2)}. Druk vul je negatief in.</Hint>}
    </Section>
    <Section title="Sonderingen en bouwwerk">
      <Row label="Aantal sonderingen"><NumberInput label="Aantal sonderingen" min={1} value={i.cptCount} onChange={(v) => change({ cptCount: Math.max(1, Math.round(v)) })} /></Row>
      <label className="cs-check"><input type="checkbox" checked={i.stiffStructure} onChange={(e) => change({ stiffStructure: e.target.checked })} /> Stijf bouwwerk (kan belasting herverdelen)</label>
      <Hint>ξ3 = {fmt(xi.xi3, 2)} en ξ4 = {fmt(xi.xi4, 2)} (tabel A.10). Het rekenblad rekent één sondering met ξ3; de tabel combineert alle sonderingen.</Hint>
    </Section>
    <Section title="Paalgroep">
      <label className="cs-check"><input type="checkbox" checked={!!group} onChange={(e) => change({ group: e.target.checked ? { spacingXM: 2.5, spacingYM: 2.5 } : undefined })} /> Paal in een groep (f2 en kluittoets)</label>
      {group && <>
        <Row label="Hart-op-hart x" unit="m"><NumberInput label="Hart-op-hartafstand x [m]" min={0.1} value={group.spacingXM} onChange={(v) => setGroup({ spacingXM: v })} /></Row>
        <Row label="Hart-op-hart y" unit="m"><NumberInput label="Hart-op-hartafstand y [m]" min={0.1} value={group.spacingYM} onChange={(v) => setGroup({ spacingYM: v })} /></Row>
        <label className="cs-check"><input type="checkbox" checked={!!group.edge} onChange={(e) => setGroup({ edge: e.target.checked })} /> Rand- of hoekpaal (kleinere tophoek van de kluit)</label>
        <Row label={<abbr title="Verdichtingsfactor; groter dan 1 alleen met controlesonderingen achteraf">f1</abbr>}><NumberInput label="Verdichtingsfactor f1" min={1} value={group.f1 ?? 1} onChange={(v) => setGroup({ f1: v })} /></Row>
        {result.ok && result.group && <Hint>Invloedsoppervlak A = {fmt(result.group.areaM2, 2)} m² per paal.</Hint>}
      </>}
      {!group && <Hint>Alleenstaande paal: f1 = f2 = 1 en geen kluittoets.</Hint>}
    </Section>
    <More title="Volumegewichten per grondsoort">
      <table className="cs-layer-table" aria-label="Volumegewichten per grondsoort"><thead><tr><th>Grond</th><th>γ [kN/m³]</th><th>γsat [kN/m³]</th><th>φ′ [°]</th></tr></thead>
        <tbody>{SOILS.map((k) => { const v = { ...SOIL_DEFAULTS[k], ...i.soil?.[k] }; return <tr key={k}><td>{SOIL_LABELS[k]}</td>
          <td><NumberInput label={`Volumegewicht ${SOIL_LABELS[k]} [kN/m³]`} min={0} value={v.gamma} onChange={(x) => setSoil(k, { gamma: x })} /></td>
          <td><NumberInput label={`Verzadigd volumegewicht ${SOIL_LABELS[k]} [kN/m³]`} min={0} value={v.gammaSat} onChange={(x) => setSoil(k, { gammaSat: x })} /></td>
          <td><NumberInput label={`Wrijvingshoek ${SOIL_LABELS[k]} [graden]`} min={0} value={v.phi} onChange={(x) => setSoil(k, { phi: x })} /></td></tr>; })}</tbody></table>
      <Hint>De grondsoort per laag volgt uit de laagindeling van de sondering. Bij de tekening pas je per traject de grondsoort of de conusweerstand aan.</Hint>
    </More>
  </div>;
}

const SOIL_FILL: Record<TensionSoil, string> = { sand: "#FF9800", clay: "#4CAF50", loam: "#8BC34A", peat: "#795548" };

type Draft = OverrideDraft<TensionSoil>;
const NO_APPLIED: TensionAppliedOverride[] = [];
const qcPoints = (points: Array<{ depth: number; qc?: number }>, ground: number) =>
  points.filter((p) => Number.isFinite(p.depth) && p.qc != null).map((p) => ({ nap: ground - Math.abs(p.depth), qc: p.qc as number }));

export function VisualPanel({ input: i, result, onChange }: Props) {
  const cpt = useCptStore((s) => (i.cptId ? s.cpts.get(i.cptId) : undefined));
  // De sondering in het project blijft de meting; de aanpassingen uit de invoer liggen op een kopie, net als in de berekening.
  const eff = useMemo(() => {
    if (!cpt) return null;
    try { return tensionInterpretation({ soil: i.soil, interpretationOverrides: i.interpretationOverrides }, cpt); } catch { return null; }
  }, [cpt, i.soil, i.interpretationOverrides]);
  const applied = eff?.applied ?? NO_APPLIED;
  const [draft, setDraft] = useState<Draft | null>(null);
  useEffect(() => setDraft(null), [i.cptId]);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<{ startNap: number; curNap: number } | null>(null);
  const view = useMemo(() => {
    if (!cpt || !cpt.points.length) return null;
    const ground = cpt.metadata.ground_level_nap ?? 0;
    const measured = qcPoints(cpt.points, ground);
    if (!measured.length) return null;
    const adjusted = eff?.cpt && eff.cpt !== cpt ? qcPoints(eff.cpt.points, ground) : null;
    const top = Math.max(ground, i.pileTopNap) + 0.5, bottom = Math.min(measured[measured.length - 1].nap, i.pileToeNap - 1);
    return { ground, measured, adjusted, top, bottom };
  }, [cpt, eff, i.pileTopNap, i.pileToeNap]);
  if (!cpt || !view) return <p className="cs-hint">Kies een sondering om de paal te tekenen.</p>;
  const W = 420, H = 620, L = 54, R = 16, T = 22, B = 14, QC_MAX = 30;
  const stripX = L + 250, pileX = stripX + 44, plotW = 240;
  const y = (nap: number) => T + (view.top - nap) / (view.top - view.bottom) * (H - T - B);
  const x = (qc: number) => L + Math.min(qc, QC_MAX) / QC_MAX * plotW;
  const line = (pts: Array<{ nap: number; qc: number }>) => pts.map((p) => `${x(p.qc).toFixed(1)},${y(p.nap).toFixed(1)}`).join(" ");
  const layers = result.ok ? result.layers : [];
  const ticks: number[] = [];
  for (let v = Math.ceil(view.bottom / 2) * 2; v <= view.top; v += 2) ticks.push(v);
  const level = (nap: number, label: string, cls: string) => <g className={cls}><line x1={L} x2={W - R} y1={y(nap)} y2={y(nap)} /><text x={W - R} y={y(nap) - 3} textAnchor="end">{label} {fmt(nap, 2)}</text></g>;
  const pileW = Math.max(6, Math.min(26, i.sizeMm / 18));

  // Slepen in de grafiek kiest het traject van de aanpassing in bewerking, afgerond op 0,05 m.
  const napAt = (clientY: number): number | null => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box || !box.height) return null;
    const scale = Math.min(box.width / W, box.height / H); // preserveAspectRatio "meet"
    const yView = (clientY - box.top - (box.height - H * scale) / 2) / scale;
    const nap = view.top - (yView - T) / (H - T - B) * (view.top - view.bottom);
    return Math.round(Math.max(view.bottom, Math.min(view.ground, nap)) * 20) / 20;
  };
  const selecting = !!draft && !!onChange;
  const startDrag = (e: ReactPointerEvent<SVGRectElement>) => {
    const nap = napAt(e.clientY);
    if (nap === null) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({ startNap: nap, curNap: nap });
  };
  const moveDrag = (e: ReactPointerEvent<SVGRectElement>) => {
    if (!drag) return;
    const nap = napAt(e.clientY);
    if (nap !== null && nap !== drag.curNap) setDrag({ startNap: drag.startNap, curNap: nap });
  };
  const endDrag = () => {
    if (!drag) return;
    const top = Math.max(drag.startNap, drag.curNap), bottom = Math.min(drag.startNap, drag.curNap);
    setDrag(null);
    if (draft && top - bottom >= 0.05) setDraft({ ...draft, topNap: top, bottomNap: bottom });
  };
  const band = drag
    ? { topNap: Math.max(drag.startNap, drag.curNap), bottomNap: Math.min(drag.startNap, drag.curNap) }
    : draft && draft.topNap !== null && draft.bottomNap !== null && draft.topNap > draft.bottomNap ? { topNap: draft.topNap, bottomNap: draft.bottomNap } : null;
  const clampY = (nap: number) => y(Math.max(view.bottom, Math.min(view.top, nap)));
  const bandW = stripX + 16 - L;

  return <div className="tp-visual-wrap">
    <InterpretationEditor<TensionSoil> cptId={cpt.id} overrides={i.interpretationOverrides ?? []} applied={applied} draft={draft} setDraft={setDraft}
      soilKinds={SOILS} soilLabel={soilName}
      onWrite={onChange && ((next) => onChange({ ...i, interpretationOverrides: next.length ? next : undefined }))} />
    <svg ref={svgRef} className="tp-visual" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Sondering ${i.cptId} met trekpaal van NAP ${fmt(i.pileTopNap, 2)} tot ${fmt(i.pileToeNap, 2)} m`}>
      <text x={L} y={12} className="tp-axis-title">qc [MPa]</text>
      {[0, 10, 20, 30].map((v) => <g key={v} className="tp-grid"><line x1={x(v)} x2={x(v)} y1={T} y2={H - B} /><text x={x(v)} y={T - 4} textAnchor="middle">{v}</text></g>)}
      {ticks.map((v) => <g key={v} className="tp-grid"><line x1={L} x2={L + plotW} y1={y(v)} y2={y(v)} /><text x={L - 6} y={y(v) + 3} textAnchor="end">{fmt(v, 0)}</text></g>)}
      <text x={12} y={H / 2} className="tp-axis-title" transform={`rotate(-90 12 ${H / 2})`} textAnchor="middle">m NAP</text>
      {applied.map((a, k) => a.status === "applied" && <rect key={a.override.id} className={`tp-interp-band${draft?.id === a.override.id ? " tp-interp-band--active" : ""}`}
        x={L} y={clampY(a.topNap)} width={bandW} height={Math.max(0.5, clampY(a.bottomNap) - clampY(a.topNap))}><title>{`Aanpassing A${k + 1}`}</title></rect>)}
      {layers.map((l, k) => <rect key={k} x={stripX} y={y(l.topNap)} width={16} height={Math.max(0.5, y(l.bottomNap) - y(l.topNap))} fill={SOIL_FILL[l.soil]} opacity={l.inTensionZone ? 1 : 0.35}><title>{SOIL_LABELS[l.soil]}</title></rect>)}
      {layers.filter((l) => l.rSingleKn > 0).map((l, k) => <rect key={k} className="tp-applied" x={L} y={y(l.topNap)} width={x(l.qcAppliedMpa) - L} height={Math.max(0.5, y(l.bottomNap) - y(l.topNap))} />)}
      {view.adjusted && <polyline className="tp-qc tp-qc--measured" points={line(view.measured)} />}
      <polyline className="tp-qc" points={line(view.adjusted ?? view.measured)} />
      <rect className="tp-pile" x={pileX} y={y(i.pileTopNap)} width={pileW} height={y(i.pileToeNap) - y(i.pileTopNap)} />
      {result.ok && <rect className="tp-zone" x={pileX - 3} y={y(result.tensionTopNap)} width={pileW + 6} height={y(i.pileToeNap) - y(result.tensionTopNap)} />}
      <path className="tp-arrow" d={`M${pileX + pileW / 2} ${y(i.pileTopNap) - 2}v-14m-4 5 4-5 4 5`} />
      {level(view.ground, "maaiveld", "tp-level")}
      {i.excavationNap !== undefined && i.excavationNap < view.ground - 1e-6 && level(i.excavationNap, "ontgraving", "tp-level tp-level-exc")}
      {level(i.waterNap, "grondwater", "tp-level tp-level-water")}
      {level(i.pileToeNap, "paalpunt", "tp-level")}
      <g className="tp-legend" transform={`translate(${L + 6} ${H - B - (view.adjusted ? 57 : 44)})`}>
        <rect className="tp-applied" width="12" height="8" /><text x="16" y="8">qc in rekening (na reductie en afsnuiten)</text>
        <line className="tp-qc" x1="0" x2="12" y1="18" y2="18" /><text x="16" y="21">{view.adjusted ? "qc met aanpassingen" : "qc gemeten"}</text>
        <rect className="tp-zone" y="26" width="12" height="8" /><text x="16" y="34">trekzone</text>
        {view.adjusted && <><line className="tp-qc tp-qc--measured" x1="0" x2="12" y1="44" y2="44" /><text x="16" y="47">qc gemeten</text></>}
      </g>
      {band && <rect className="tp-interp-band tp-interp-band--draft" x={L} y={clampY(band.topNap)} width={bandW} height={Math.max(0.5, clampY(band.bottomNap) - clampY(band.topNap))} />}
      {selecting && <rect className="tp-interp-capture" data-testid="tp-interp-capture" x={L} y={T} width={bandW} height={H - T - B}
        onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={() => setDrag(null)} />}
      {applied.map((a, k) => a.status === "applied" && <text key={a.override.id} className={`tp-interp-label${onChange ? " tp-interp-label--pick" : ""}`} x={L + plotW - 4} y={clampY(a.topNap) + 10} textAnchor="end"
        role={onChange ? "button" : undefined} aria-label={onChange ? `Aanpassing A${k + 1} bewerken in de grafiek` : undefined} onClick={onChange ? () => setDraft(draftOf(a.override)) : undefined}>A{k + 1}</text>)}
    </svg>
  </div>;
}

export function ResultPanel({ input: i, result: r }: Props) {
  if (!r.ok) return <div className="tp-result"><p className="cs-hint cs-hint--warn" role="alert">{r.error}</p></div>;
  const f = r.factors, rows = r.layers.filter((l) => l.inTensionZone);
  return <div className="tp-result">
    <h3>Trekweerstand</h3>
    <dl className="tp-summary">
      <div><dt>Wrijving alleenstaand</dt><dd>{fmt(r.rSingleKn, 0)} kN</dd></div>
      {r.group && <><div><dt>Wrijving in de groep (f2)</dt><dd>{fmt(r.rFrictionKn, 0)} kN</dd></div>
        <div><dt>Kluitgewicht</dt><dd>{fmt(r.group.rKluitKn, 0)} kN</dd></div></>}
      <div><dt>Paalgewicht G′paal;d</dt><dd>{fmt(r.gPileKn, 1)} kN</dd></div>
      <div className="tp-total"><dt>Rt;d</dt><dd>{fmt(r.rtDKn, 0)} kN</dd></div>
      {i.ftDKn > 0 && <div className={r.passes ? "tp-ok" : "tp-fail"}><dt>Toets Ft;d ≤ Rt;d</dt><dd>{fmt(i.ftDKn, 0)} ≤ {fmt(r.rtDKn, 0)} kN · u.c. {fmt(r.unityCheck ?? 0, 2)} · {r.passes ? "voldoet" : "voldoet niet"}</dd></div>}
    </dl>
    {r.group && <p className="cs-hint">{r.governing === "kluit" ? "Het kluitgewicht is maatgevend." : "De schachtwrijving is maatgevend."} Kluit: A = {fmt(r.group.areaM2, 2)} m², kegelhoogte {fmt(r.group.coneHeightM, 2)} m bij een halve tophoek van {fmt(r.group.halfAngleDeg, 0)}°.</p>}
    {r.warnings.map((w) => <p key={w} className="cs-hint cs-hint--warn">{w}</p>)}
    {r.interpretation && <InterpretationNote cptId={i.cptId ?? ""} applied={r.interpretation} soilLabel={soilName} />}
    <h3>Factoren</h3>
    <p className="tp-formula">qc;z;d = qc;z;a / (ξ · γm;var;qc · γs;t) = qc;z;a / ({fmt(f.xi, 2)} · {fmt(f.gammaVar, 2)} · {fmt(f.gammaSt, 2)}) = qc;z;a / {fmt(f.xi * f.gammaVar * f.gammaSt, 3)}</p>
    <p className="tp-formula">Rt;d = Σ Os · f1 · f2 · αt · qc;z;d · Δz, met Os = {fmt(r.perimeterM, 3)} m en αt = {fmt(r.pileType.alphaT, 4)} in zand</p>
    <h3>Per laag in de trekzone</h3>
    <div className="cs-table-wrap"><table className="cs-layer-table tp-layers" aria-label="Trekweerstand per laag">
      <thead><tr><th>Van</th><th>Tot</th><th>Grond</th><th>qc</th><th>qc;a</th><th>qc;d</th><th>αt</th>{r.group && <th>f2</th>}<th>ΔRt;d</th></tr>
        <tr className="tp-units"><th>m NAP</th><th>m NAP</th><th /><th>MPa</th><th>MPa</th><th>kPa</th><th />{r.group && <th />}<th>kN</th></tr></thead>
      <tbody>{rows.map((l, k) => <tr key={k} className={l.rSingleKn === 0 ? "tp-zero" : ""}>
        <td>{fmt(l.topNap, 2)}</td><td>{fmt(l.bottomNap, 2)}</td><td>{SOIL_LABELS[l.soil]}</td><td>{fmt(l.qcMpa, 2)}</td><td>{fmt(l.qcAppliedMpa, 2)}</td><td>{fmt(l.qcDesignKpa, 0)}</td>
        <td>{l.alphaT ? fmt(l.alphaT, 4) : "—"}</td>{r.group && <td>{l.alphaT && l.soil === "sand" ? fmt(l.f2, 3) : "—"}</td>}<td>{fmt(r.group ? l.rGroupKn : l.rSingleKn, 1)}</td></tr>)}</tbody>
      <tfoot><tr><th colSpan={r.group ? 8 : 7}>Som</th><th>{fmt(r.rFrictionKn, 1)}</th></tr></tfoot>
    </table></div>
    <details className="settlement-reference"><summary>Methode en uitgangspunten</summary>
      <ul>
        <li>NEN 9997-1 art. 7.6.3: trekweerstand uit de schachtwrijving, getoetst aan het kluitgewicht bij een paalgroep.</li>
        <li>qc wordt eerst gereduceerd voor ontgraving, daarna afgesnoten: een piek boven 12 MPa naar 12 MPa, een pakket dikker dan 1 m naar 15 MPa.</li>
        <li>Klei: αt = 0,02 onder 2 MPa en 0,03 vanaf 2,5 MPa, daartussen lineair. Leem 0,025. Veen levert geen wrijving.</li>
        <li>Volumegewichten met γγ = 1,1; onder water verminderd met 10 kN/m³.</li>
        <li>De grondsoort per laag komt uit de indicatieve laagindeling van de sondering; controleer die met boringen.</li>
        <li>Een aanpassing van de grondlaaginterpretatie geldt alleen in deze berekening. Een aangepaste conusweerstand wordt daarna gereduceerd en afgesnoten zoals een gemeten waarde; de grondsoort verandert alleen als je die zelf aanpast.</li>
      </ul>
    </details>
  </div>;
}
