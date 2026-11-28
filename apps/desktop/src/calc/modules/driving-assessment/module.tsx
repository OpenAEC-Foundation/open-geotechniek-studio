// Beoordeling kalendering: de verwachte kalender uit een sondering, naast de
// getelde kalender. Zie compute.ts voor de formule en haar beperkingen.
import { useTranslation } from "react-i18next";
import type { CalcModule, PanelProps } from "../../framework/types";
import { Section, Row, Hint, NumField } from "../../framework/views/SheetForm";
import { useCptStore } from "../../../store/useCptStore";
import { fmtNumber } from "../../i18n";
import { drivingHeadless, pct } from "./headless";
import { type Comparison, type DrivingInput, type DrivingResult, type PileShape } from "./compute";
import "./styles.css";

type Props = PanelProps<DrivingInput, DrivingResult>;
const NS = "calcDriving";
const SHAPES: PileShape[] = ["square", "round", "rect"];

function InputPanel({ input, onChange }: Props) {
  const { t } = useTranslation(NS);
  const cpts = useCptStore((s) => s.cpts);
  const set = (patch: Partial<DrivingInput>) => onChange?.({ ...input, ...patch });
  const num = (key: keyof DrivingInput, label: string, unit: string) => (
    <Row label={label} unit={unit}>
      <NumField aria-label={label} value={input[key] as number} onChange={(e) => { const v = Number(e.target.value); if (e.target.value !== "" && Number.isFinite(v)) set({ [key]: v } as Partial<DrivingInput>); }} />
    </Row>
  );
  const shapeName = (s: PileShape) => ({ square: t("input.square", "Vierkant"), round: t("input.round", "Rond"), rect: t("input.rect", "Rechthoekig") }[s]);
  const setRow = (i: number, key: "depthM" | "blows", value: string) => {
    const v = Number(value);
    if (value === "" || !Number.isFinite(v)) return;
    set({ rows: input.rows.map((r, k) => (k === i ? { ...r, [key]: v } : r)) });
  };
  const addRow = () => {
    const last = input.rows[input.rows.length - 1];
    const depthM = last ? last.depthM + input.tochtMm / 1000 : input.fromM + input.tochtMm / 1000;
    set({ rows: [...input.rows, { depthM: Math.round(depthM * 1000) / 1000, blows: last?.blows ?? 10 }] });
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

  return <div className="cs-form drv-input">
    <Section title={t("input.cpt", "Sondering")}>
      <Row label={t("input.cpt", "Sondering")} missing={input.cptId && cpts.has(input.cptId) ? undefined : t("input.cptMissing", "Kies een sondering uit het project.")}>
        <select aria-label={t("input.cpt", "Sondering")} value={input.cptId ?? ""} onChange={(e) => set({ cptId: e.target.value || null })}>
          <option value="">{t("input.cptNone", "— kies —")}</option>
          {[...cpts.keys()].map((id) => <option key={id} value={id}>{id}</option>)}
        </select>
      </Row>
      {num("fromM", t("input.from", "Traject vanaf"), "m − mv")}
      {num("toM", t("input.to", "Traject tot (paalpunt)"), "m − mv")}
    </Section>
    <Section title={t("input.pile", "Paal")}>
      <Row label={t("input.shape", "Doorsnede")}>
        <select aria-label={t("input.shape", "Doorsnede")} value={input.shape} onChange={(e) => set({ shape: e.target.value as PileShape })}>
          {SHAPES.map((s) => <option key={s} value={s}>{shapeName(s)}</option>)}
        </select>
      </Row>
      {num("sizeMm", input.shape === "round" ? t("input.diameter", "Diameter") : t("input.side", "Zijde"), "mm")}
      {input.shape === "rect" && num("sizeBMm", t("input.sideB", "Tweede zijde"), "mm")}
    </Section>
    <Section title={t("input.hammer", "Heiblok")}>
      {num("ramMassKg", t("input.ramMass", "Massa valgewicht"), "kg")}
      {num("dropHeightM", t("input.dropHeight", "Valhoogte"), "m")}
      {num("tochtMm", t("input.tocht", "Tochtlengte"), "mm")}
    </Section>
    <Section title={t("input.record", "Getelde kalender")}>
      <div className="cs-table-wrap" onPaste={paste}>
        <table className="cs-layer-table drv-rows" aria-label={t("input.record", "Getelde kalender")}>
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
      <Hint>{t("input.recordHint", "Leeg laten kan: dan zie je alleen de verwachte kalender. Plakken uit een spreadsheet kan ook: twee kolommen (diepte, slagen), één tocht per regel.")}</Hint>
      {num("tolerancePct", t("input.tolerance", "Toegestane afwijking"), "%")}
    </Section>
  </div>;
}

/** Links de verwachte kalender als staafjes met de getelde slagen als punten; rechts de conusweerstand. */
function VisualPanel({ input, result }: Props) {
  const { t } = useTranslation(NS);
  const all = [...result.profile, ...result.comparisons].filter((r) => r.expected !== null);
  if (!result.ok || !all.length) return <p className="cs-hint">{result.error ?? t("visual.empty", "Kies een sondering en een traject om de verwachte kalender te tonen.")}</p>;
  const W = 720, H = 560, top = 46, bottom = 30, x0 = 64, x1 = 440, x2 = 480, x3 = 700;
  const tocht = input.tochtMm / 1000, tol = input.tolerancePct / 100;
  const dMin = Math.min(...all.map((r) => r.depthM)) - tocht, dMax = Math.max(...all.map((r) => r.depthM));
  const y = (d: number) => top + ((d - dMin) / Math.max(1e-6, dMax - dMin)) * (H - top - bottom);
  const maxN = Math.max(...all.map((r) => r.expected! * (1 + tol)), ...result.comparisons.map((c) => c.blows)) * 1.05;
  const xn = (v: number) => x0 + (v / maxN) * (x1 - x0);
  const maxQc = Math.max(1, ...all.map((r) => r.qcMpa ?? 0)) * 1.08;
  const xq = (v: number) => x2 + (v / maxQc) * (x3 - x2);
  const step = (range: number) => { const raw = range / 5, mag = 10 ** Math.floor(Math.log10(raw)); return [1, 2, 5, 10].map((f) => f * mag).find((v) => v >= raw)!; };
  const ticks = (from: number, to: number, s: number) => { const out: number[] = []; for (let v = Math.ceil(from / s - 1e-9) * s; v <= to + 1e-9; v += s) out.push(Math.round(v * 1000) / 1000); return out; };
  const dStep = step(dMax - dMin), nStep = step(maxN), qStep = step(maxQc);
  const bars = result.profile.filter((r) => r.expected !== null);
  return <div className="drv-visual">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("visual.aria", "Verwachte en getelde slagen per tocht tegen de diepte, met de conusweerstand")}>
      <text x={(x0 + x1) / 2} y={16} textAnchor="middle" className="drv-title">{t("visual.blows", "Slagen per tocht")}</text>
      <text x={(x2 + x3) / 2} y={16} textAnchor="middle" className="drv-title">qc [MPa]</text>
      {ticks(dMin, dMax, dStep).map((d) => <g key={d}><line x1={x0} x2={x3} y1={y(d)} y2={y(d)} className="drv-grid" /><text x={x0 - 6} y={y(d) + 3} textAnchor="end" className="drv-axis">{fmtNumber(d, dStep < 1 ? 1 : 0)}</text></g>)}
      <text x={14} y={(top + H - bottom) / 2} transform={`rotate(-90 14 ${(top + H - bottom) / 2})`} textAnchor="middle" className="drv-axis">{t("visual.depth", "Diepte paalpunt [m − mv]")}</text>
      {ticks(0, maxN, nStep).map((v) => <g key={v}><line x1={xn(v)} x2={xn(v)} y1={top} y2={H - bottom} className="drv-grid" /><text x={xn(v)} y={top - 6} textAnchor="middle" className="drv-axis">{v}</text></g>)}
      {ticks(0, maxQc, qStep).map((v) => <g key={v}><line x1={xq(v)} x2={xq(v)} y1={top} y2={H - bottom} className="drv-grid" /><text x={xq(v)} y={top - 6} textAnchor="middle" className="drv-axis">{v}</text></g>)}
      {bars.map((r) => { const yt = y(r.depthM - tocht), h = Math.max(1, y(r.depthM) - yt - 1); return <g key={r.depthM}>
        <rect x={xn(r.expected! * (1 - tol))} y={yt} width={xn(r.expected! * (1 + tol)) - xn(r.expected! * (1 - tol))} height={h} className="drv-band" />
        <rect x={x0} y={yt} width={xn(r.expected!) - x0} height={h} className="drv-bar" /></g>; })}
      <polyline className="drv-qc" fill="none" points={all.filter((r) => r.qcMpa !== null).sort((a, b) => a.depthM - b.depthM).map((r) => `${xq(r.qcMpa!).toFixed(1)},${y(r.depthM - tocht / 2).toFixed(1)}`).join(" ")} />
      {result.comparisons.map((c, i) => <circle key={i} cx={xn(c.blows)} cy={y(c.depthM - tocht / 2)} r={5} className={c.within === false ? "drv-dot fail" : "drv-dot"}><title>{`${fmtNumber(c.depthM, 2)} m: ${c.blows}`}</title></circle>)}
    </svg>
    <div className="drv-legend">
      <span><i className="drv-key-bar" />{t("visual.expected", "verwacht")}</span>
      <span><i className="drv-key-band" />{t("visual.band", "± {{pct}} %", { pct: input.tolerancePct })}</span>
      <span><i className="drv-key-dot" />{t("visual.counted", "geteld")}</span>
      <span><i className="drv-key-qc" />qc</span>
    </div>
  </div>;
}

function ResultPanel({ input, result }: Props) {
  const { t } = useTranslation(NS);
  if (!result.ok) return <div className="drv-sheet"><h2>{t("sheet.title", "Beoordeling kalendering")}</h2><p className="drv-error" role="alert">{result.error}</p></div>;
  const f = (v: number, d = 2) => fmtNumber(v, d);
  const judged = result.within + result.outside;
  const rows = result.comparisons.length ? result.comparisons : result.profile;
  const fin = result.final;
  return <div className="drv-sheet">
    <h2>{t("sheet.title", "Beoordeling kalendering")}</h2>
    <p className="drv-sub">{t("sheet.sub", "Sondering {{cpt}} · verwachte slagen per {{tocht}} mm", { cpt: input.cptId, tocht: input.tochtMm })}</p>
    {result.warnings.map((w) => <p key={w} className="drv-warning" role="note">⚠ {w}</p>)}

    <h3>1. {t("sheet.basis", "Uitgangspunten")}</h3>
    <table className="drv-facts"><tbody>
      <tr><th>{t("sheet.energy", "Slagenergie E = m·g·h")}</th><td>{fmtNumber(input.ramMassKg, 0)} · 9,81 · {f(input.dropHeightM)} / 1000 = {f(result.energyKnm)} kNm</td></tr>
      <tr><th>{t("sheet.size", "Paalmaat D")}</th><td>{input.shape === "rect" ? `√(${fmtNumber(input.sizeMm, 0)} · ${fmtNumber(input.sizeBMm, 0)}) = ` : ""}{fmtNumber(result.dEqMm, 0)} mm</td></tr>
      <tr><th>{t("sheet.tocht", "Tocht")}</th><td>{input.tochtMm} mm</td></tr>
    </tbody></table>
    <div className="drv-formula">N = ⌈ {t("sheet.tochtWord", "tocht")} · D² · qc / E ⌉</div>
    {fin && fin.expected !== null && fin.qcMpa !== null && <div className="drv-formula drv-filled">
      {t("sheet.atDepth", "op {{depth}} m", { depth: f(fin.depthM) })}: ⌈ {input.tochtMm} · {f(result.dEqMm / 1000, 3)}² · {f(fin.qcMpa, 1)} / {f(result.energyKnm)} ⌉ = <strong>{fin.expected}</strong>
    </div>}

    <h3>2. {result.comparisons.length ? t("sheet.compare", "Verwacht en geteld") : t("sheet.expectedOnly", "Verwachte kalender")}</h3>
    <table className="drv-table" aria-label={t("sheet.compare", "Verwacht en geteld")}>
      <thead><tr><th className="num">{t("sheet.depth", "Diepte [m − mv]")}</th><th className="num">qc [MPa]</th><th className="num">{t("sheet.expected", "Verwacht")}</th>
        {result.comparisons.length > 0 && <><th className="num">{t("sheet.counted", "Geteld")}</th><th className="num">{t("sheet.deviation", "Afwijking")}</th></>}</tr></thead>
      <tbody>{rows.map((r, i) => { const c = "blows" in r ? (r as Comparison) : null; return <tr key={i}>
        <td className="num">{f(r.depthM)}</td><td className="num">{r.qcMpa === null ? "–" : f(r.qcMpa, 1)}</td><td className="num">{r.expected ?? "–"}</td>
        {c && <><td className="num">{c.blows}</td><td className={`num ${c.within === null ? "" : c.within ? "drv-ok" : "drv-fail"}`}>{c.deviation === null ? "–" : pct(c.deviation)}</td></>}
      </tr>; })}</tbody>
    </table>

    {judged > 0 && <>
      <h3>3. {t("sheet.verdict", "Oordeel")}</h3>
      <div className={`drv-verdict ${result.outside === 0 ? "ok" : "fail"}`}>
        <strong>{result.outside === 0 ? t("sheet.pass", "De kalender past bij de sondering") : t("sheet.failText", "De kalender wijkt af van de sondering")}</strong>
        <span>{t("sheet.verdictLine", "{{within}} van {{total}} tochten binnen ± {{tol}} %; gemiddelde afwijking {{mean}}.", { within: result.within, total: judged, tol: input.tolerancePct, mean: pct(result.meanDeviation ?? 0) })}</span>
      </div>
    </>}

    <h3>{judged > 0 ? 4 : 3}. {t("sheet.method", "Methode en beperkingen")}</h3>
    <ul className="drv-notes">
      <li>{t("sheet.m1", "De formule is een vuistregel uit de praktijk: de arbeid om het vlak D² over één tocht tegen de conusweerstand in te drukken, gedeeld door de energie per slag. Het is geen normformule.")}</li>
      <li>{t("sheet.m2", "Het is geen draagvermogensberekening. Het draagvermogen volgt uit de sonderingen volgens NEN 9997-1.")}</li>
      <li>{t("sheet.m3", "Een verschil tot ongeveer 50 % tussen verwacht en geteld is gewoon. Kijk vooral naar het verloop met de diepte: de kalender hoort op te lopen waar de conusweerstand oploopt.")}</li>
      <li>{t("sheet.m4", "qc is het gemiddelde van de sondering over de tocht. Rendement van het blok, kleef langs de schacht en de afstand tot de sondering zitten niet in de formule.")}</li>
    </ul>
  </div>;
}

const typed: CalcModule<DrivingInput, DrivingResult> = { ...drivingHeadless, InputPanel, VisualPanel, ResultPanel };
export const drivingAssessmentModule = typed as unknown as CalcModule;
