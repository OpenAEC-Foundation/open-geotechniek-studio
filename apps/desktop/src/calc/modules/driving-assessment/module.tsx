// Beoordeling kalendering: toetst een gemeten kalenderstaat met meerdere
// heiformules. Zie compute.ts voor de formules en de onderbouwing.
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { CalcModule, PanelProps } from "../../framework/types";
import { Section, Row, Hint, More, NumField } from "../../framework/views/SheetForm";
import { ct, fmtNumber } from "../../i18n";
import { computeDriving, defaultSafety, drivingExample, FORMULAS, RELIABLE, type DrivingInput, type DrivingResult, type FormulaId, type FormulaResult, type HammerType } from "./compute";
import "./styles.css";

type Props = PanelProps<DrivingInput, DrivingResult>;
const NS = "calcDriving";
const COLORS: Record<FormulaId, string> = { dutch: "#9CA3AF", enr: "#C4B5A0", hiley: "#D97706", janbu: "#2563EB", danish: "#059669", gates: "#7C3AED" };
const HAMMERS: HammerType[] = ["drop", "hydraulic", "diesel", "steam"];

const formulaName = (t: TFunction, id: FormulaId) => ({
  dutch: t("formula.dutch", "Hollandse formule"), enr: t("formula.enr", "Engineering News"), hiley: t("formula.hiley", "Hiley"),
  janbu: t("formula.janbu", "Janbu"), danish: t("formula.danish", "Deense formule"), gates: t("formula.gates", "Gates (FHWA)"),
}[id]);
const hammerName = (t: TFunction, h: HammerType) => ({
  drop: t("hammer.drop", "Valblok (vrije val)"), hydraulic: t("hammer.hydraulic", "Hydraulisch blok"),
  diesel: t("hammer.diesel", "Dieselblok"), steam: t("hammer.steam", "Stoom- of luchtblok"),
}[h]);
/** Gangbare uitgangswaarden per bloktype: rendement en restitutie. */
const HAMMER_DEFAULTS: Record<HammerType, { efficiency: number; restitution: number }> = {
  drop: { efficiency: 0.75, restitution: 0.4 }, hydraulic: { efficiency: 0.9, restitution: 0.4 },
  diesel: { efficiency: 0.8, restitution: 0.4 }, steam: { efficiency: 0.75, restitution: 0.4 },
};

function InputPanel({ input, onChange }: Props) {
  const { t } = useTranslation(NS);
  const set = (patch: Partial<DrivingInput>) => onChange?.({ ...input, ...patch });
  const num = (key: keyof DrivingInput, label: string, unit: string) => (
    <Row label={label} unit={unit}>
      <NumField aria-label={label} value={input[key] as number} onChange={(e) => { const v = Number(e.target.value); if (e.target.value !== "" && Number.isFinite(v)) set({ [key]: v } as Partial<DrivingInput>); }} />
    </Row>
  );
  const setRow = (i: number, key: "depthM" | "blows", value: string) => {
    const v = Number(value);
    if (value === "" || !Number.isFinite(v)) return;
    set({ rows: input.rows.map((r, k) => (k === i ? { ...r, [key]: v } : r)) });
  };
  const addRow = () => {
    const last = input.rows[input.rows.length - 1];
    set({ rows: [...input.rows, { depthM: last ? Math.round((last.depthM + input.tochtMm / 1000) * 1000) / 1000 : 0, blows: last?.blows ?? 10 }] });
  };
  /** Plakken uit een spreadsheet: per regel "diepte slagen". */
  const paste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text");
    if (!/\n/.test(text.trim())) return;
    const rows = text.trim().split(/\r?\n/).map((line) => line.trim().split(/[\t;\s]+/).map((c) => Number(c.replace(",", "."))))
      .filter((c) => c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]) && c[1] > 0).map((c) => ({ depthM: c[0], blows: c[1] }));
    if (!rows.length) return;
    e.preventDefault();
    set({ rows });
  };
  const toggle = (id: FormulaId) => set({ enabled: input.enabled.includes(id) ? input.enabled.filter((f) => f !== id) : FORMULAS.filter((f) => f === id || input.enabled.includes(f)) });

  return <div className="cs-form drv-input">
    <Section title={t("input.hammer", "Heiblok")}>
      <Row label={t("input.hammerType", "Type blok")}>
        <select aria-label={t("input.hammerType", "Type blok")} value={input.hammerType}
          onChange={(e) => { const h = e.target.value as HammerType; set({ hammerType: h, ...HAMMER_DEFAULTS[h] }); }}>
          {HAMMERS.map((h) => <option key={h} value={h}>{hammerName(t, h)}</option>)}
        </select>
      </Row>
      {num("ramMassKg", t("input.ramMass", "Massa valgewicht"), "kg")}
      {num("dropHeightM", t("input.dropHeight", "Valhoogte"), "m")}
      {num("efficiency", t("input.efficiency", "Rendement η"), "–")}
      <Hint>{t("input.efficiencyHint", "Richtwaarden: valblok 0,75 · hydraulisch 0,9 · diesel 0,8 · stoom/lucht 0,75. Gebruik de opgave van de leverancier als die er is.")}</Hint>
    </Section>
    <Section title={t("input.pile", "Paal")}>
      {num("pileMassKg", t("input.pileMass", "Massa paal"), "kg")}
      {num("capMassKg", t("input.capMass", "Massa heimuts"), "kg")}
      {num("pileLengthM", t("input.pileLength", "Lengte paal"), "m")}
      {num("pileAreaM2", t("input.pileArea", "Doorsnede A"), "m²")}
      {num("eModGpa", t("input.eMod", "Elasticiteitsmodulus E"), "GPa")}
      <Hint>{t("input.pileHint", "Prefab beton 350×350 mm: A = 0,1225 m², E ≈ 30 GPa, ca. 294 kg/m. Staal: E = 210 GPa.")}</Hint>
    </Section>
    <Section title={t("input.record", "Kalenderstaat")}>
      {num("tochtMm", t("input.tocht", "Tochtlengte"), "mm")}
      <div className="cs-table-wrap" onPaste={paste}>
        <table className="cs-layer-table drv-rows" aria-label={t("input.record", "Kalenderstaat")}>
          <thead><tr><th>#</th><th>{t("input.depth", "Diepte punt")}<small>m − mv</small></th><th>{t("input.blows", "Slagen")}<small>{t("input.perTocht", "per tocht")}</small></th><th /></tr></thead>
          <tbody>{input.rows.map((r, i) => <tr key={i}>
            <td className="cs-layer-index">{i + 1}</td>
            <td><NumField aria-label={t("input.depthRow", "Diepte tocht {{n}}", { n: i + 1 })} value={r.depthM} onChange={(e) => setRow(i, "depthM", e.target.value)} /></td>
            <td><NumField aria-label={t("input.blowsRow", "Slagen tocht {{n}}", { n: i + 1 })} value={r.blows} onChange={(e) => setRow(i, "blows", e.target.value)} /></td>
            <td><button type="button" className="drv-del" title={t("input.removeRow", "Tocht verwijderen")} aria-label={t("input.removeRow", "Tocht verwijderen")} onClick={() => set({ rows: input.rows.filter((_, k) => k !== i) })}>×</button></td>
          </tr>)}</tbody>
        </table>
      </div>
      <button type="button" className="drv-add" onClick={addRow}>+ {t("input.addRow", "Tocht toevoegen")}</button>
      <Hint>{t("input.pasteHint", "Plakken uit een spreadsheet kan: twee kolommen (diepte, slagen), één tocht per regel.")}</Hint>
      {num("finalCount", t("input.finalCount", "Slotkalender over laatste"), t("input.tochten", "tochten"))}
    </Section>
    <Section title={t("input.requirement", "Toets")}>
      {num("requiredKn", t("input.required", "Vereiste belasting op de paal"), "kN")}
      <Hint>{t("input.requiredHint", "De belasting die de paal moet dragen (karakteristiek). Elke formule deelt haar grensweerstand door de eigen veiligheidsfactor.")}</Hint>
    </Section>
    <Section title={t("input.formulas", "Heiformules")}>
      {FORMULAS.map((id) => <label key={id} className="cs-check">
        <input type="checkbox" checked={input.enabled.includes(id)} onChange={() => toggle(id)} />
        <span className="drv-swatch" style={{ background: COLORS[id] }} />{formulaName(t, id)}
        {RELIABLE.includes(id) && <span className="drv-tag">{t("input.reliable", "oordeel")}</span>}
      </label>)}
      <More title={t("input.advanced", "Veiligheidsfactoren en Hiley-parameters")}>
        {FORMULAS.map((id) => <Row key={id} label={t("input.safetyOf", "Veiligheid {{name}}", { name: formulaName(t, id) })} unit="–">
          <NumField aria-label={t("input.safetyOf", "Veiligheid {{name}}", { name: formulaName(t, id) })} value={input.safety?.[id] ?? ""} placeholder={String(defaultSafety(id, input.hammerType))}
            onChange={(e) => { const next = { ...(input.safety ?? {}) }; if (e.target.value === "") delete next[id]; else next[id] = Number(e.target.value); set({ safety: next }); }} />
        </Row>)}
        {num("restitution", t("input.restitution", "Restitutiecoëfficiënt e"), "–")}
        {num("tempCompressionMm", t("input.tempCompression", "Tijdelijke samendrukking c"), "mm")}
        <Hint>{t("input.hileyHint", "c = c1 + c2 + c3: muts, paal en grond samen; bij beton op een houten vulling meestal 6 tot 12 mm. e: 0,25 (zacht hout) tot 0,5 (staal op staal).")}</Hint>
      </More>
      <button type="button" className="drv-add" onClick={() => onChange?.(drivingExample())}>↺ {t("input.example", "Voorbeeld laden")}</button>
    </Section>
  </div>;
}

/** Kalenderstaat als staafjes links, toelaatbare belasting per formule als lijnen rechts; diepte loopt omlaag. */
function VisualPanel({ input, result }: Props) {
  const { t } = useTranslation(NS);
  if (!result.ok) return <p className="cs-hint">{t("visual.empty", "Vul de kalenderstaat in om de grafiek te tonen.")}</p>;
  const W = 720, H = 560, top = 46, bottom = 34, x0 = 64, xBar = 250, x1 = 300, x2 = 700;
  const p = result.profile;
  const dMin = Math.min(...p.map((r) => r.depthM)) - input.tochtMm / 1000, dMax = Math.max(...p.map((r) => r.depthM));
  const y = (d: number) => top + ((d - dMin) / Math.max(1e-6, dMax - dMin)) * (H - top - bottom);
  const maxBlows = Math.max(...p.map((r) => r.blows));
  const maxR = Math.max(input.requiredKn, ...p.flatMap((r) => Object.values(r.allowKn) as number[])) * 1.08;
  const xr = (v: number) => x1 + (v / maxR) * (x2 - x1);
  const step = (range: number) => { const raw = range / 5, mag = 10 ** Math.floor(Math.log10(raw)); return [1, 2, 5, 10].map((f) => f * mag).find((v) => v >= raw)!; };
  const rStep = step(maxR), dStep = step(dMax - dMin);
  const ticks = (from: number, to: number, s: number) => { const out: number[] = []; for (let v = Math.ceil(from / s) * s; v <= to + 1e-9; v += s) out.push(Math.round(v * 1000) / 1000); return out; };
  const ids = result.formulas.map((f) => f.id);
  return <div className="drv-visual">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("visual.aria", "Kalenderstaat en toelaatbare belasting per heiformule tegen de diepte")}>
      <text x={(x0 + xBar) / 2} y={18} textAnchor="middle" className="drv-title">{t("visual.blows", "Slagen per tocht")}</text>
      <text x={(x1 + x2) / 2} y={18} textAnchor="middle" className="drv-title">{t("visual.allow", "Toelaatbare belasting [kN]")}</text>
      {ticks(dMin, dMax, dStep).map((d) => <g key={d}><line x1={x0} x2={x2} y1={y(d)} y2={y(d)} className="drv-grid" /><text x={x0 - 6} y={y(d) + 3} textAnchor="end" className="drv-axis">{fmtNumber(d, dStep < 1 ? 1 : 0)}</text></g>)}
      <text x={14} y={(top + H - bottom) / 2} transform={`rotate(-90 14 ${(top + H - bottom) / 2})`} textAnchor="middle" className="drv-axis">{t("visual.depth", "Diepte paalpunt [m − mv]")}</text>
      {ticks(0, maxR, rStep).map((v) => <g key={v}><line x1={xr(v)} x2={xr(v)} y1={top} y2={H - bottom} className="drv-grid" /><text x={xr(v)} y={top - 6} textAnchor="middle" className="drv-axis">{v}</text></g>)}
      {p.map((r, i) => { const yt = y(r.depthM - input.tochtMm / 1000), h = Math.max(1, y(r.depthM) - yt - 1), w = (r.blows / maxBlows) * (xBar - x0); return <g key={i}>
        <rect x={x0} y={yt} width={w} height={h} className="drv-bar" /><text x={x0 + w + 4} y={yt + h / 2 + 3} className="drv-axis">{r.blows}</text></g>; })}
      <line x1={xr(input.requiredKn)} x2={xr(input.requiredKn)} y1={top} y2={H - bottom} className="drv-required" />
      <text x={xr(input.requiredKn) + 4} y={top + 12} className="drv-required-label">{t("visual.required", "vereist {{v}} kN", { v: Math.round(input.requiredKn) })}</text>
      {ids.map((id) => <polyline key={id} fill="none" stroke={COLORS[id]} strokeWidth={RELIABLE.includes(id) ? 2.2 : 1.4} strokeDasharray={RELIABLE.includes(id) ? undefined : "5 4"}
        points={p.map((r) => `${xr(r.allowKn[id] ?? 0).toFixed(1)},${y(r.depthM).toFixed(1)}`).join(" ")} />)}
    </svg>
    <div className="drv-legend">{ids.map((id) => <span key={id}><i style={{ background: COLORS[id] }} />{formulaName(t, id)}</span>)}</div>
  </div>;
}

const kn = (v: number) => (Number.isFinite(v) ? fmtNumber(v, 0) : "–");
const f2 = (v: number, d = 2) => fmtNumber(v, d);

/** Formule in symbolen en de ingevulde tussenwaarden, per heiformule. */
function working(f: FormulaResult, r: DrivingResult, i: DrivingInput): { symbolic: string; filled: string } {
  const s = r.finalSetMm, en = f2(r.energyKnm), W = f2(r.wKn), P = f2(r.pKn);
  switch (f.id) {
    case "dutch": return { symbolic: "Ru = η·W²·h / (s·(W + P))", filled: `${f2(i.efficiency)}·${W}²·${f2(i.dropHeightM)} / (${f2(s / 1000, 5)}·(${W} + ${P}))` };
    case "enr": return { symbolic: "Ru = η·W·h / (s + c)", filled: `${en} / (${f2(s / 1000, 5)} + ${f2(f.terms.cMm / 1000, 5)})` };
    case "hiley": return { symbolic: "Ru = η·W·h / (s + c/2) · (W + e²·P)/(W + P)", filled: `${en} / (${f2(s / 1000, 5)} + ${f2(f.terms.cMm / 2000, 5)}) · ${f2(f.terms.k, 3)}` };
    case "janbu": return { symbolic: "Ru = η·W·h / (ku·s);  ku = Cd·(1 + √(1 + λ/Cd));  Cd = 0,75 + 0,15·P/W;  λ = η·W·h·L/(A·E·s²)", filled: `Cd = ${f2(f.terms.cd, 3)};  λ = ${f2(f.terms.lambda, 3)};  ku = ${f2(f.terms.ku, 3)};  ${en} / (${f2(f.terms.ku, 3)}·${f2(s / 1000, 5)})` };
    case "danish": return { symbolic: "Ru = η·W·h / (s + √(η·W·h·L/(2·A·E)))", filled: `${en} / (${f2(s / 1000, 5)} + ${f2(f.terms.seMm / 1000, 5)})` };
    case "gates": return { symbolic: "Ru = 6,7·√E·log10(10·Nb) − 445   (E = W·h in J, Nb = slagen per 25 mm)", filled: `6,7·√${fmtNumber(f.terms.joule, 0)}·log10(10·${f2(f.terms.nb, 2)}) − 445` };
  }
}

function ResultPanel({ input, result }: Props) {
  const { t } = useTranslation(NS);
  if (!result.ok) return <div className="drv-sheet"><h2>{t("sheet.title", "Beoordeling kalendering")}</h2><p className="drv-error" role="alert">{result.error}</p></div>;
  const ok = result.consensusUc <= 1;
  return <div className="drv-sheet">
    <h2>{t("sheet.title", "Beoordeling kalendering")}</h2>
    <p className="drv-sub">{hammerName(t, input.hammerType)} · {t("sheet.final", "slotkalender {{blows}} slagen per {{tocht}} mm", { blows: fmtNumber(result.finalBlows, result.finalBlows % 1 ? 1 : 0), tocht: input.tochtMm })}</p>
    {result.warnings.map((w) => <p key={w} className="drv-warning" role="note">⚠ {w}</p>)}

    <h3>1. {t("sheet.basis", "Uitgangspunten")}</h3>
    <table className="drv-facts"><tbody>
      <tr><th>{t("sheet.ram", "Gewicht valgewicht W")}</th><td>{f2(input.ramMassKg / 1000, 2)} t · 9,81 = {f2(result.wKn)} kN</td></tr>
      <tr><th>{t("sheet.pile", "Gewicht paal en muts P")}</th><td>({fmtNumber(input.pileMassKg, 0)} + {fmtNumber(input.capMassKg, 0)}) kg → {f2(result.pKn)} kN</td></tr>
      <tr><th>{t("sheet.energy", "Slagenergie η·W·h")}</th><td>{f2(input.efficiency)} · {f2(result.wKn)} · {f2(input.dropHeightM)} = {f2(result.energyKnm)} kNm</td></tr>
      <tr><th>{t("sheet.set", "Zakking per slag s")}</th><td>{input.tochtMm} / {fmtNumber(result.finalBlows, result.finalBlows % 1 ? 1 : 0)} = {f2(result.finalSetMm)} mm</td></tr>
      <tr><th>{t("sheet.stiffness", "Paal L, A·E")}</th><td>{f2(input.pileLengthM)} m · {fmtNumber(input.pileAreaM2 * input.eModGpa * 1000, 0)} MN</td></tr>
      <tr><th>{t("sheet.requiredRow", "Vereiste belasting")}</th><td>{kn(input.requiredKn)} kN</td></tr>
    </tbody></table>

    <h3>2. {t("sheet.perFormula", "Per heiformule")}</h3>
    <table className="drv-table" aria-label={t("sheet.perFormula", "Per heiformule")}>
      <thead><tr><th>{t("sheet.formula", "Formule")}</th><th className="num">Ru [kN]</th><th className="num">{t("sheet.safety", "Veiligheid")}</th><th className="num">{t("sheet.allow", "Toelaatbaar [kN]")}</th><th className="num">u.c.</th><th className="num">{t("sheet.needBlows", "Vereiste kalender")}</th></tr></thead>
      <tbody>{result.formulas.map((f) => <tr key={f.id} className={RELIABLE.includes(f.id) ? "" : "drv-muted"}>
        <td><span className="drv-swatch" style={{ background: COLORS[f.id] }} />{formulaName(t, f.id)}</td>
        <td className="num">{kn(f.ruKn)}</td><td className="num">{f2(f.safety, 1)}</td><td className="num">{kn(f.allowKn)}</td>
        <td className={`num ${f.uc <= 1 ? "drv-ok" : "drv-fail"}`}>{Number.isFinite(f.uc) ? f2(f.uc) : "–"}</td>
        <td className="num">{f.requiredBlows === null ? t("sheet.notReachable", "niet haalbaar") : t("sheet.blowsPerTocht", "{{n}} / {{tocht}} mm", { n: f.requiredBlows, tocht: input.tochtMm })}</td>
      </tr>)}</tbody>
    </table>
    <p className="drv-note">{t("sheet.reliableNote", "Grijs: formules met een grote spreiding ten opzichte van proefbelastingen; ze tellen niet mee in het oordeel.")}</p>

    <h3>3. {t("sheet.verdict", "Oordeel")}</h3>
    <div className={`drv-verdict ${ok ? "ok" : "fail"}`}>
      <strong>{ok ? t("sheet.pass", "De kalendering voldoet") : t("sheet.failText", "De kalendering voldoet niet")}</strong>
      <span>{t("sheet.verdictLine", "Toelaatbaar {{allow}} kN (mediaan van {{names}}) tegen vereist {{req}} kN: u.c. {{uc}}", {
        allow: kn(result.consensusKn), req: kn(input.requiredKn), uc: Number.isFinite(result.consensusUc) ? f2(result.consensusUc) : "–",
        names: result.formulas.filter((f) => RELIABLE.includes(f.id)).map((f) => formulaName(t, f.id)).join(", ") || t("sheet.allFormulas", "alle gekozen formules"),
      })}</span>
      <span>{t("sheet.spread", "Spreiding tussen de formules: factor {{v}}.", { v: f2(result.spread, 1) })}</span>
    </div>

    <h3>4. {t("sheet.working", "Uitwerking slotkalender")}</h3>
    {result.formulas.map((f) => { const w = working(f, result, input); return <div key={f.id} className="drv-work">
      <h4>{formulaName(t, f.id)}</h4>
      <div className="drv-formula">{w.symbolic}</div>
      <div className="drv-formula drv-filled">{w.filled} = <strong>{kn(f.ruKn)} kN</strong> → {kn(f.ruKn)} / {f2(f.safety, 1)} = <strong>{kn(f.allowKn)} kN</strong></div>
    </div>; })}

    <h3>5. {t("sheet.method", "Methode en beperkingen")}</h3>
    <ul className="drv-notes">
      <li>{t("sheet.m1", "Een heiformule schat de weerstand tijdens het heien uit de energie per slag en de zakking per slag. Het is een controle op de uitvoering; het draagvermogen volgt uit de sonderingen volgens NEN 9997-1.")}</li>
      <li>{t("sheet.m2", "Vergelijkingen met proefbelastingen (Flaate 1964, Olson en Flaate 1967, FHWA) geven de kleinste spreiding voor Janbu, de Deense formule, Hiley en Gates. De Hollandse en de Engineering News-formule spreiden sterk; vandaar hun hoge veiligheidsfactor.")}</li>
      <li>{t("sheet.m3", "In klei en fijn zand verandert de weerstand na het heien (opbouw of relaxatie). Beoordeel dan ook een naheiing na enkele dagen.")}</li>
      <li>{t("sheet.m4", "Bij een zakking per slag kleiner dan 2 mm of groter dan 50 mm zijn de formules onbetrouwbaar.")}</li>
      <li>{t("sheet.m5", "Gates rekent met de nominale energie W·h zonder rendement; de overige formules met η·W·h.")}</li>
    </ul>
  </div>;
}

const typed: CalcModule<DrivingInput, DrivingResult> = {
  id: "driving-assessment",
  name: "Beoordeling kalendering",
  subtitle: "Kalenderstaat toetsen met heiformules",
  category: "pile",
  icon: "🔨",
  norm: "Hollands · Engineering News · Hiley · Janbu · Deens · Gates",
  status: "experimental",
  visualLabel: "Kalenderstaat",
  defaultInput: () => drivingExample(),
  compute: (input) => computeDriving(input),
  InputPanel, VisualPanel, ResultPanel,
  statusLine: (r) => r.ok
    ? { text: ct(NS, "status.uc", "u.c. {{uc}} · {{allow}} kN toelaatbaar", { uc: Number.isFinite(r.consensusUc) ? fmtNumber(r.consensusUc, 2) : "–", allow: fmtNumber(r.consensusKn, 0) }), ok: r.consensusUc <= 1 }
    : { text: r.error ?? "–", ok: false, pending: true },
  checks: (input, r) => r.ok ? [
    { label: ct(NS, "checks.consensus", "kalendering"), value: `${fmtNumber(r.consensusKn, 0)} kN`, uc: r.consensusUc },
    { label: ct(NS, "checks.set", "zakking per slag"), value: `${fmtNumber(r.finalSetMm, 1)} mm` },
    { label: ct(NS, "checks.energy", "slagenergie"), value: `${fmtNumber(r.energyKnm, 1)} kNm` },
    { label: ct(NS, "checks.required", "vereist"), value: `${fmtNumber(input.requiredKn, 0)} kN` },
  ] : [],
};
export const drivingAssessmentModule = typed as unknown as CalcModule;
