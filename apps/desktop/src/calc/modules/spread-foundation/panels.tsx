// Rekenblad fundering op staal: invoer, doorsnede met bezwijkvlak, 3D-weergave en de uitwerking per toets.
import { useState } from "react";
import type { PanelProps } from "../../framework/types";
import { Hint, More, NumberInput, Row, Section } from "../../framework/views/SheetForm";
import { useCptStore } from "../../../store/useCptStore";
import { numberLocale } from "../../i18n";
import { DEFAULT_FACTORS, FACTOR_SETS, SOIL_TYPES, getSoilType, type SpreadFactors } from "./catalog";
import { layersFromCpt, type SpreadCheck, type SpreadInput, type SpreadLayer, type SpreadResult } from "./compute";
import { SectionDrawing } from "./SectionDrawing";
import { SpreadScene3D } from "./SpreadScene3D";
import { slipExplanation, spreadScene, spreadSlip } from "./scene";
import "./styles.css";

type Props = PanelProps<SpreadInput, SpreadResult>;
export const fmt = (v: number, d = 1) => (Number.isFinite(v) ? v.toLocaleString(numberLocale(), { minimumFractionDigits: d, maximumFractionDigits: d }) : "—");
const round2 = (v: number) => Math.round(v * 100) / 100;

const FACTOR_FIELDS: Array<[keyof SpreadFactors, string, string]> = [
  ["gammaPhi", "γφ′ (op tan φ′)", "Partiële factor op tan phi"], ["gammaC", "γc′", "Partiële factor op de cohesie"], ["gammaCu", "γcu", "Partiële factor op de ongedraineerde schuifsterkte"],
  ["gammaGamma", "γγ", "Partiële factor op het volumegewicht"], ["gammaGPunch", "γG grond bij doorponsen", "Belastingfactor op het grondgewicht bij doorponsen"],
  ["gammaGStb", "γG;stb (kantelen)", "Factor gunstige permanente belasting bij kantelen"], ["gammaGDst", "γG;dst (kantelen)", "Factor ongunstige permanente belasting bij kantelen"], ["gammaQDst", "γQ;dst (kantelen)", "Factor ongunstige veranderlijke belasting bij kantelen"],
];

export function InputPanel({ input: i, result, onChange }: Props) {
  const cpts = useCptStore((s) => s.cpts);
  const change = (patch: Partial<SpreadInput>) => onChange?.({ ...i, ...patch });
  const strip = i.shape === "strip", unit = strip ? "kN/m" : "kN", mUnit = strip ? "kNm/m" : "kNm";
  const f = { ...DEFAULT_FACTORS, ...i.factors };
  const setLayer = (k: number, patch: Partial<SpreadLayer>) => change({ layers: i.layers.map((l, j) => (j === k ? { ...l, ...patch } : l)) });
  const setSoil = (k: number, id: string) => { const s = getSoilType(id); if (s) setLayer(k, { soilId: s.id, name: s.name, gamma: s.gamma, gammaSat: s.gammaSat, phi: s.phi, c: s.c, cu: s.cu }); };
  const addLayer = () => { const last = i.layers[i.layers.length - 1], s = SOIL_TYPES[1]; change({ layers: [...i.layers, { topNap: round2((last?.topNap ?? i.foundationNap) - 1), name: s.name, gamma: s.gamma, gammaSat: s.gammaSat, phi: s.phi, c: s.c, cu: s.cu, soilId: s.id }] }); };
  const cpt = i.cptId ? cpts.get(i.cptId) : undefined;
  const proposal = () => { if (!cpt) return; const layers = layersFromCpt(cpt); if (layers.length) change({ layers }); };
  const setOf = FACTOR_SETS.find((s) => FACTOR_FIELDS.every(([key]) => Math.abs(s.factors[key] - f[key]) < 1e-9));
  return <div className="sf-input">
    <Section title="Fundering">
      <Row label="Vorm"><select aria-label="Vorm van de fundering" value={i.shape} onChange={(e) => change({ shape: e.target.value as SpreadInput["shape"] })}><option value="strip">Strook (per strekkende meter)</option><option value="pad">Poer (B × L)</option></select></Row>
      <Row label="Breedte B" unit="m"><NumberInput label="Breedte B [m]" min={0.01} value={i.widthM} onChange={(v) => change({ widthM: v })} /></Row>
      {!strip && <Row label="Lengte L" unit="m"><NumberInput label="Lengte L [m]" min={0.01} value={i.lengthM} onChange={(v) => change({ lengthM: v })} /></Row>}
      <Row label="Aanlegniveau" unit="m NAP"><NumberInput label="Aanlegniveau [m NAP]" value={i.foundationNap} onChange={(v) => change({ foundationNap: v })} /></Row>
      <Row label="Maaiveld, lage zijde" unit="m NAP"><NumberInput label="Maaiveld aan de lage zijde [m NAP]" value={i.groundNap} onChange={(v) => change({ groundNap: v })} /></Row>
      <Row label="Grondwaterstand" unit="m NAP"><NumberInput label="Grondwaterstand [m NAP]" value={i.waterNap} onChange={(v) => change({ waterNap: v })} /></Row>
      {result.ok && <Hint>Dekking {fmt(result.coverM, 2)} m, σ′v;z;d = {fmt(result.qKpa, 1)} kPa. Reken met de laagste dekking die tijdens de levensduur kan voorkomen.</Hint>}
      <Row label={<abbr title="Helling van het maaiveld naast de fundering">Helling maaiveld β</abbr>} unit="°"><NumberInput label="Helling van het maaiveld [graden]" min={0} value={i.slopeDeg} onChange={(v) => change({ slopeDeg: v })} /></Row>
      <Row label={<abbr title="Helling van de onderkant van de fundering">Helling onderkant α</abbr>} unit="°"><NumberInput label="Helling van de onderkant van de fundering [graden]" min={0} value={i.baseTiltDeg} onChange={(v) => change({ baseTiltDeg: v })} /></Row>
    </Section>
    <Section title="Belasting op het funderingsvlak (rekenwaarden)">
      <Row label={<abbr title="Verticale belasting, inclusief het gewicht van de fundering en de grond erop">Vd</abbr>} unit={unit}><NumberInput label={`Verticale belasting Vd [${unit}]`} min={0} value={i.vDKn} onChange={(v) => change({ vDKn: v })} /></Row>
      <Row label={<abbr title="Horizontale belasting">Hd</abbr>} unit={unit}><NumberInput label={`Horizontale belasting Hd [${unit}]`} min={0} value={i.hDKn} onChange={(v) => change({ hDKn: v })} /></Row>
      {!strip && <Row label="Richting van Hd"><select aria-label="Richting van de horizontale belasting" value={i.hDirection} onChange={(e) => change({ hDirection: e.target.value as "B" | "L" })}><option value="B">Evenwijdig aan B</option><option value="L">Evenwijdig aan L</option></select></Row>}
      <Row label={<abbr title="Hoogte van het aangrijpingspunt van Hd boven het funderingsvlak">Arm van Hd</abbr>} unit="m"><NumberInput label="Hoogte van Hd boven het funderingsvlak [m]" min={0} value={i.hArmM} onChange={(v) => change({ hArmM: v })} /></Row>
      <Row label={<abbr title="Excentriciteit van Vd in de breedterichting">eV;B</abbr>} unit="m"><NumberInput label="Excentriciteit van Vd in de breedterichting [m]" min={0} value={i.eccBM} onChange={(v) => change({ eccBM: v })} /></Row>
      {!strip && <Row label={<abbr title="Excentriciteit van Vd in de lengterichting">eV;L</abbr>} unit="m"><NumberInput label="Excentriciteit van Vd in de lengterichting [m]" min={0} value={i.eccLM} onChange={(v) => change({ eccLM: v })} /></Row>}
      <Row label={<abbr title="Moment in de breedterichting op het funderingsvlak">Md</abbr>} unit={mUnit}><NumberInput label={`Moment Md [${mUnit}]`} min={0} value={i.momentDKnm} onChange={(v) => change({ momentDKnm: v })} /></Row>
      {result.ok && <Hint>b′ = {fmt(result.dims.bRawM, 2)} m{strip ? "" : ` en l′ = ${fmt(result.dims.lRawM, 2)} m`}; eB = {fmt(result.dims.eccBM, 3)} m. Excentriciteit, moment en Hd·arm tellen op.</Hint>}
    </Section>
    <Section title="Afschuiven">
      <Row label={<abbr title="Kleinste verticale belasting die samen met Hd kan optreden; leeg = Vd">Vd;min</abbr>} unit={unit}><NumberInput label={`Kleinste verticale belasting [${unit}]`} min={0.001} value={i.vMinDKn ?? i.vDKn} onChange={(v) => change({ vMinDKn: v })} /></Row>
      <label className="cs-check"><input type="checkbox" checked={i.castInPlace} onChange={(e) => change({ castInPlace: e.target.checked })} /> In het werk gestort (δ = φ′d; anders ⅔·φ′d)</label>
      <Row label={<abbr title="Passieve gronddruk die mag meetellen; 0 = niet meerekenen">Rp;d</abbr>} unit={unit}><NumberInput label={`Passieve gronddruk [${unit}]`} min={0} value={i.passiveDKn} onChange={(v) => change({ passiveDKn: v })} /></Row>
      <label className="cs-check"><input type="checkbox" checked={i.gapPossible} onChange={(e) => change({ gapPossible: e.target.checked })} /> Water of lucht kan het contactvlak bereiken (Rh;d ≤ 0,4·Vd)</label>
    </Section>
    <Section title="Grondlagen (representatieve waarden)">
      <Row label="Sondering"><select aria-label="Sondering voor het laagvoorstel" value={i.cptId ?? ""} onChange={(e) => change({ cptId: e.target.value || null })}>
        <option value="">Geen</option>{[...cpts.keys()].map((id) => <option key={id} value={id}>{id}</option>)}</select></Row>
      <div className="sf-buttons"><button type="button" disabled={!cpt} onClick={proposal}>Voorstel uit sondering</button><button type="button" onClick={addLayer}>Laag toevoegen</button></div>
      <div className="cs-table-wrap"><table className="cs-layer-table sf-layers" aria-label="Grondlagen">
        <thead><tr><th>Bovenkant<small>m NAP</small></th><th>Grondsoort</th><th>γ<small>kN/m³</small></th><th>γsat<small>kN/m³</small></th><th>φ′<small>°</small></th><th>c′<small>kPa</small></th><th>cu<small>kPa</small></th><th /></tr></thead>
        <tbody>{i.layers.map((l, k) => <tr key={k}>
          <td><NumberInput label={`Bovenkant laag ${k + 1} [m NAP]`} value={l.topNap} onChange={(v) => setLayer(k, { topNap: v })} /></td>
          <td><select aria-label={`Grondsoort laag ${k + 1}`} value={l.soilId ?? ""} onChange={(e) => setSoil(k, e.target.value)}>{!l.soilId && <option value="">{l.name || "Eigen waarden"}</option>}{SOIL_TYPES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></td>
          <td><NumberInput label={`Volumegewicht laag ${k + 1} [kN/m³]`} min={0} value={l.gamma} onChange={(v) => setLayer(k, { gamma: v })} /></td>
          <td><NumberInput label={`Verzadigd volumegewicht laag ${k + 1} [kN/m³]`} min={0} value={l.gammaSat} onChange={(v) => setLayer(k, { gammaSat: v })} /></td>
          <td><NumberInput label={`Wrijvingshoek laag ${k + 1} [graden]`} min={0} value={l.phi} onChange={(v) => setLayer(k, { phi: v })} /></td>
          <td><NumberInput label={`Cohesie laag ${k + 1} [kPa]`} min={0} value={l.c} onChange={(v) => setLayer(k, { c: v })} /></td>
          <td><NumberInput label={`Ongedraineerde schuifsterkte laag ${k + 1} [kPa]`} min={0} value={l.cu} onChange={(v) => setLayer(k, { cu: v })} /></td>
          <td><button type="button" className="sf-remove" aria-label={`Laag ${k + 1} verwijderen`} disabled={i.layers.length < 2} onClick={() => change({ layers: i.layers.filter((_, j) => j !== k) })}>×</button></td>
        </tr>)}</tbody></table></div>
      <Hint>De bovenste laag loopt door tot het maaiveld, de onderste tot onbeperkte diepte. cu = 0 betekent niet-cohesief: geen ongedraineerde toets. De tabelwaarden per grondsoort zijn een startpunt; een voorstel uit de sondering is indicatief en hoort met boringen te worden gecontroleerd.</Hint>
    </Section>
    <More title="Invloedsdiepte">
      <label className="cs-check"><input type="checkbox" checked={i.zeManualM !== undefined} onChange={(e) => change({ zeManualM: e.target.checked ? round2(result.ok ? result.drained.zeM : 1.5 * i.widthM) : undefined })} /> Invloedsdiepte ze met de hand vastzetten</label>
      {i.zeManualM !== undefined && <Row label="ze" unit="m"><NumberInput label="Invloedsdiepte ze [m]" min={0.01} value={i.zeManualM} onChange={(v) => change({ zeManualM: v })} /></Row>}
      <Hint>Zonder vinkje bepaalt het rekenblad ze iteratief uit φ′gem;rep en Hd/Vd. De stappen staan bij de uitkomsten.</Hint>
    </More>
    <More title="Kantelen (evenwicht, EQU)">
      <Row label={<abbr title="Permanente verticale belasting die het kantelen tegenwerkt, representatief">VG;rep</abbr>} unit={unit}><NumberInput label={`Stabiliserende permanente verticale belasting [${unit}]`} min={0} value={i.vGRepKn ?? 0} onChange={(v) => change({ vGRepKn: v })} /></Row>
      <Row label={<abbr title="Permanente horizontale belasting, representatief">HG;rep</abbr>} unit={unit}><NumberInput label={`Permanente horizontale belasting [${unit}]`} min={0} value={i.hGRepKn ?? 0} onChange={(v) => change({ hGRepKn: v })} /></Row>
      <Row label={<abbr title="Veranderlijke horizontale belasting, representatief">HQ;rep</abbr>} unit={unit}><NumberInput label={`Veranderlijke horizontale belasting [${unit}]`} min={0} value={i.hQRepKn ?? 0} onChange={(v) => change({ hQRepKn: v })} /></Row>
      <Row label={<abbr title="Permanent kantelend moment, representatief">MG;rep</abbr>} unit={mUnit}><NumberInput label={`Permanent kantelend moment [${mUnit}]`} min={0} value={i.mGRepKnm ?? 0} onChange={(v) => change({ mGRepKnm: v })} /></Row>
      <Row label={<abbr title="Veranderlijk kantelend moment, representatief">MQ;rep</abbr>} unit={mUnit}><NumberInput label={`Veranderlijk kantelend moment [${mUnit}]`} min={0} value={i.mQRepKnm ?? 0} onChange={(v) => change({ mQRepKnm: v })} /></Row>
      <Hint>Vul representatieve waarden in. De toets rekent om de rand van de voet: γG;stb·VG;rep·(B/2 − eV) tegen γG;dst en γQ;dst maal de kantelende momenten; de horizontale belastingen werken op de arm van Hd. Zonder VG;rep blijft alleen de toets op de excentriciteit over.</Hint>
    </More>
    <More title="Partiële factoren">
      <Row label="Set"><select aria-label="Set partiële factoren" value={setOf?.id ?? ""} onChange={(e) => { const s = FACTOR_SETS.find((x) => x.id === e.target.value); if (s) change({ factors: { ...s.factors } }); }}>
        {!setOf && <option value="">Eigen waarden</option>}{FACTOR_SETS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Row>
      {FACTOR_FIELDS.map(([key, label, aria]) => <Row key={key} label={label}><NumberInput label={aria} min={0.01} value={f[key]} onChange={(v) => change({ factors: { ...f, [key]: v } })} /></Row>)}
      <Hint>Materiaalfactoren volgens NEN 9997-1 tabel A.4a; kantelen volgens NEN-EN 1990 tabel A1.2(A). De weerstandsfactoren zijn 1,0.</Hint>
    </More>
  </div>;
}

export function VisualPanel({ input: i, result: r }: Props) {
  const [view, setView] = useState<"section" | "3d">("section");
  if (!r.ok) return <p className="cs-hint">De tekening verschijnt zodra de invoer compleet is.</p>;
  const slip = spreadSlip(i, r).drained, inclined = slip.rotationDeg > 0;
  return <div className="sf-visual">
    <div className="sf-tabs" role="tablist" aria-label="Weergave">
      <button type="button" role="tab" aria-selected={view === "section"} className={view === "section" ? "active" : ""} onClick={() => setView("section")}>Doorsnede</button>
      <button type="button" role="tab" aria-selected={view === "3d"} className={view === "3d" ? "active" : ""} onClick={() => setView("3d")}>3D</button>
    </div>
    {view === "section" ? <>
      <SectionDrawing input={i} result={r} />
      <p className="cs-hint">Bezwijkvlak: actieve wig onder b′, overgangszone ({r.drained.phiRepDeg > 0 ? "logaritmische spiraal" : "cirkelboog"}) en passieve wig, getekend met φ′gem;rep = {fmt(r.drained.phiRepDeg, 1)}°. {slipExplanation(i, slip).replace(/b'/g, "b′")}{inclined
        ? ` Door de horizontale belasting draait de grootste hoofdspanning onder de voet ${fmt(slip.rotationDeg, 1)}°; de wig krijgt basishoeken van ${fmt(slip.wedgeAnglesDeg[0], 1)}° en ${fmt(slip.wedgeAnglesDeg[1], 1)}°.` : ""}{i.slopeDeg > 0 ? " Het vlak komt uit op het hellende maaiveld." : ""} De berekening middelt over ze = {fmt(r.drained.zeM, 2)} m uit de tabel.{r.undrained ? " Paars gestreept: het ongedraineerde vlak (cirkelboog)." : ""}{r.punch.length ? " Gestippeld: de spreiding onder 8° naar een fictief funderingsvlak (doorponsen)." : ""}</p>
    </> : <SpreadScene3D scene={spreadScene(i, r)} />}
  </div>;
}

function CheckDetails({ check }: { check: SpreadCheck }) {
  return <details className="sf-check">
    <summary><span>{check.title}</span><span className={check.passes ? "sf-ok" : "sf-fail"}>u.c. {fmt(check.uc, 2)}</span></summary>
    <p className="sf-article">{check.article}</p>
    {check.rows && <div className="cs-table-wrap"><table className="cs-layer-table sf-rows" aria-label={`Lagen binnen de invloedsdiepte, ${check.title}`}>
      <thead><tr><th>Van</th><th>Tot</th><th>Laag</th><th>h</th><th>z</th><th>φ′d</th><th>c′d</th><th>γ′d</th></tr></thead>
      <tbody>{check.rows.map((w, k) => <tr key={k}><td>{fmt(w.topNap, 2)}</td><td>{fmt(w.bottomNap, 2)}</td><td>{w.name}{w.submerged ? " (nat)" : ""}</td><td>{fmt(w.thicknessM, 2)}</td><td>{fmt(w.zM, 2)}</td><td>{fmt(w.phiD, 2)}</td><td>{fmt(w.cD, 2)}</td><td>{fmt(w.gammaD, 2)}</td></tr>)}</tbody></table></div>}
    <dl className="sf-steps">{check.steps.map((s, k) => <div key={k}><dt>{s.symbol}</dt><dd>= {s.formula}{s.filled && <><br />= {s.filled}</>}<br /><strong>= {s.result}</strong></dd></div>)}</dl>
  </details>;
}

export function ResultPanel({ result: r }: Props) {
  if (!r.ok) return <div className="sf-result"><p className="cs-hint cs-hint--warn" role="alert">{r.error}</p></div>;
  const d = r.drained;
  return <div className="sf-result">
    <h3>Toetsen</h3>
    <table className="cs-layer-table sf-summary" aria-label="Overzicht van de toetsen">
      <thead><tr><th>Toets</th><th>Belasting</th><th>Weerstand</th><th>u.c.</th></tr></thead>
      <tbody>{r.checks.map((c) => <tr key={c.id} className={c.passes ? "" : "sf-row-fail"}><td>{c.title}</td><td>{fmt(c.loadKn, c.unit === "m" ? 3 : 1)} {c.unit}</td><td>{fmt(c.resistanceKn, c.unit === "m" ? 3 : 1)} {c.unit}</td><td className={c.passes ? "sf-ok" : "sf-fail"}>{fmt(c.uc, 2)}</td></tr>)}</tbody>
    </table>
    <p className="cs-hint">Maatgevend: {r.governing.title.toLowerCase()} (u.c. {fmt(r.governing.uc, 2)}). {r.passes ? "Alle toetsen voldoen." : "Niet alle toetsen voldoen."}{r.overturning ? "" : " De kanteltoets (EQU) ontbreekt: vul daarvoor de representatieve belastingen in."}</p>
    {r.warnings.map((w) => <p key={w} className="cs-hint cs-hint--warn">{w}</p>)}
    <h3>Invloedsdiepte</h3>
    <p className="sf-formula">ze = {fmt(d.zeM, 2)} m ({d.zeManual ? "met de hand vastgezet" : d.converged ? `iteratief, ${d.iterations.length} stappen` : "niet geconvergeerd"}); φ′gem;d = {fmt(d.phiD, 2)}°, c′gem;d = {fmt(d.cD, 2)} kPa, γ′gem;d = {fmt(d.gammaD, 2)} kN/m³</p>
    <div className="cs-table-wrap"><table className="cs-layer-table sf-rows" aria-label="Iteratie naar de invloedsdiepte">
      <thead><tr><th>Stap</th><th>ze aangenomen</th><th>φ′gem;rep</th><th>φ′gem;d</th><th>c′gem;d</th><th>γ′gem;d</th><th>ze uit tabel</th></tr></thead>
      <tbody>{d.iterations.map((s) => <tr key={s.step}><td>{s.step}</td><td>{fmt(s.zeM, 3)}</td><td>{fmt(s.phiRepDeg, 2)}</td><td>{fmt(s.phiD, 2)}</td><td>{fmt(s.cD, 2)}</td><td>{fmt(s.gammaD, 2)}</td><td>{fmt(s.zeNextM, 3)}</td></tr>)}</tbody></table></div>
    <h3>Uitwerking per toets</h3>
    {r.checks.map((c) => <CheckDetails key={c.id} check={c} />)}
    <details className="settlement-reference"><summary>Methode en uitgangspunten</summary>
      <ul>
        <li>NEN 9997-1 art. 6.5: verticaal draagvermogen gedraineerd en ongedraineerd, doorponsen en afschuiven; rekenwaarden met de materiaalfactoren van tabel A.4a.</li>
        <li>Gelaagde grond: φ′, c′ en γ′ gewogen gemiddeld over de invloedsdiepte, met als gewicht de laagdikte maal de afstand van het laagmidden tot de invloedsdiepte.</li>
        <li>Doorponsen: een fictief funderingsvlak op de bovenkant van een laag waarvan φ′ meer dan 6° lager is dan die van de laag erboven, of van een cohesieve laag onder een niet-cohesieve; spreiding onder 8°, het grondgewicht ertussen telt als belasting.</li>
        <li>Ongedraineerd wordt getoetst als de laag direct onder het (fictieve) funderingsvlak een cu heeft.</li>
        <li>Zettingen, algehele stabiliteit, zijdelings wegpersen en het ontwerp van de betonvoet zelf zitten niet in dit rekenblad.</li>
      </ul>
    </details>
  </div>;
}
