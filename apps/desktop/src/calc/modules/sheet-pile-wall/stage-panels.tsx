// Invoer en uitkomst voor fasering, meer steunpunten, maaiveld en belastingen op afstand, het stappenplan en de extra
// toetsen. Rustig gehouden: tabellen met korte koppen, lege cellen nemen de waarde van de vorige fase over.
import { useTranslation } from "react-i18next";
import { Hint, More, NumField, NumberInput, Row } from "../../framework/views/SheetForm";
import { numberLocale } from "../../i18n";
import {
  CUR_FACTOR_SETS, CUR_STEPS, DEFAULT_CUR, DEFAULT_EXTRA_CHECKS, DEFAULT_TIE, DEFAULT_WALER, wallLoads, wallSupports,
  type CaseRun, type CurStep, type WallAnchor, type WallInput, type WallOk, type WallPhase,
} from "./compute";
import type { SurfaceLoad, SurfacePoint } from "./surface-loads";

const fmt = (v: number, d = 1) => (Number.isFinite(v) ? v.toLocaleString(numberLocale(), { minimumFractionDigits: d, maximumFractionDigits: d }) : "—");
type Change = (patch: Partial<WallInput>) => void;

/** Getal of leeg (leeg = undefined); voor cellen die de vorige waarde overnemen. */
function Optional({ label, value, onChange, placeholder }: { label: string; value: number | undefined; onChange: (v: number | undefined) => void; placeholder?: string }) {
  return <NumField aria-label={label} placeholder={placeholder ?? "–"} value={value ?? ""} onChange={(e) => { const v = Number(e.target.value); onChange(e.target.value === "" || !Number.isFinite(v) ? undefined : v); }} />;
}

/** Naam van een berekening voor keuzelijsten en tabellen: "6.3 · fase 2", "rekenwaarden · fase 1". */
export function caseLabel(c: CaseRun, phases: number, t: (k: string, nl: string, o?: Record<string, unknown>) => string): string {
  const step = c.stepId === "uls" ? t("visual.runUls", "Rekenwaarden") : c.stepId === "sls" ? t("visual.runSls", "Representatieve waarden") : `${t("stage.step", "stap")} ${c.stepId}`;
  return phases > 1 ? `${step} · ${t("stage.phase", "fase")} ${c.phaseName}` : step;
}

// ─── Steunpunten ──────────────────────────────────────────────────

const newSupport = (i: WallInput): WallAnchor => {
  const levels = wallSupports(i).map((a) => a.levelNap), lowest = levels.length ? Math.min(...levels) : i.groundHighNap - 0.5;
  return { enabled: true, kind: "strut", levelNap: Math.round((Math.max(i.excavationNap + 0.5, lowest - 2)) * 100) / 100, angleDeg: 0, rigid: false, stiffnessKnPerM: 100000, spacingM: 4, prestressKn: 0 };
};

/** Verdere steunpunten in een tabel, en per steunpunt de toets van ankerstaaf en gording. */
export function SupportsBlock({ input: i, onChange }: { input: WallInput; onChange: Change }) {
  const { t } = useTranslation("calcWall");
  const extra = i.extraSupports ?? [], first = { ...i.anchor, id: i.anchor.id || "A1" };
  const set = (k: number, patch: Partial<WallAnchor>) => onChange({ extraSupports: extra.map((a, j) => (j === k ? { ...a, ...patch } : a)) });
  const all = [first, ...extra.map((a, k) => ({ ...a, id: a.id || `A${k + 2}` }))];
  const setAny = (k: number, patch: Partial<WallAnchor>) => (k === 0 ? onChange({ anchor: { ...i.anchor, ...patch } }) : set(k - 1, patch));
  const cell = (k: number, key: "levelNap" | "angleDeg" | "spacingM" | "stiffnessKnPerM" | "prestressKn", name: string) =>
    <td><NumberInput label={`${name}, ${t("stage.support", "steunpunt")} A${k + 2}`} value={extra[k][key] ?? 0} onChange={(v) => set(k, { [key]: v })} /></td>;
  return <>
    {extra.length > 0 && <div className="cs-table-wrap"><table className="cs-layer-table sw-stage-table" aria-label={t("stage.supports", "Verdere steunpunten")}>
      <thead><tr><th /><th>{t("stage.kind", "Soort")}</th><th>{t("stage.level", "Niveau")}<small>m NAP</small></th><th>{t("stage.angle", "Hoek")}<small>°</small></th><th>{t("stage.spacing", "h.o.h.")}<small>m</small></th><th>{t("stage.stiffness", "Stijfheid")}<small>kN/m</small></th><th>{t("stage.prestress", "Voorspanning")}<small>kN</small></th><th /></tr></thead>
      <tbody>{extra.map((a, k) => <tr key={k}>
        <td>A{k + 2}</td>
        <td><select aria-label={`${t("stage.kind", "Soort")}, A${k + 2}`} value={a.kind ?? "strut"} onChange={(e) => set(k, { kind: e.target.value as WallAnchor["kind"] })}><option value="strut">{t("input.kindStrut", "Stempel")}</option><option value="tie">{t("stage.kindTie", "Ankerstaaf")}</option></select></td>
        {cell(k, "levelNap", t("stage.level", "Niveau"))}{cell(k, "angleDeg", t("stage.angle", "Hoek"))}{cell(k, "spacingM", t("stage.spacing", "h.o.h."))}{cell(k, "stiffnessKnPerM", t("stage.stiffness", "Stijfheid"))}{cell(k, "prestressKn", t("stage.prestress", "Voorspanning"))}
        <td><button type="button" className="sw-remove" aria-label={`${t("stage.removeSupport", "Steunpunt verwijderen")} A${k + 2}`} onClick={() => onChange({ extraSupports: extra.filter((_, j) => j !== k) })}>×</button></td>
      </tr>)}</tbody></table></div>}
    <div className="sw-buttons"><button type="button" onClick={() => onChange({ extraSupports: [...extra, newSupport(i)] })}>{t("stage.addSupport", "Steunpunt toevoegen")}</button></div>
    <More title={t("stage.supportChecks", "Ankerstaaf en gording")}>
      {all.map((a, k) => {
        const tie = { ...DEFAULT_TIE, ...a.tie }, w = { ...DEFAULT_WALER, ...a.waler }, id = a.id!;
        const num = (label: string, unit: string, value: number, apply: (v: number) => void) => <Row key={label} label={label} unit={unit}><NumberInput label={`${label}, ${id}`} value={value} onChange={apply} /></Row>;
        return <div key={id} className="sw-support-checks"><strong>{id}</strong>
          {a.kind === "tie" && <label className="cs-check"><input type="checkbox" checked={tie.enabled} onChange={(e) => setAny(k, { tie: { ...tie, enabled: e.target.checked } })} /> {t("stage.tieCheck", "Ankerstaaf toetsen")}</label>}
          {a.kind === "tie" && tie.enabled && <>
            {num(t("stage.tieGross", "Bruto doorsnede A_g"), "mm²", tie.grossMm2, (v) => setAny(k, { tie: { ...tie, grossMm2: v } }))}
            {num(t("stage.tieThread", "Spanningsdoorsnede draad A_s"), "mm²", tie.threadMm2, (v) => setAny(k, { tie: { ...tie, threadMm2: v } }))}
            {num("f_y", "N/mm²", tie.fyMPa, (v) => setAny(k, { tie: { ...tie, fyMPa: v } }))}{num("f_ua", "N/mm²", tie.fuMPa, (v) => setAny(k, { tie: { ...tie, fuMPa: v } }))}
            {num(t("input.anchorLoadFactor", "Extra factor op de ankerkracht"), "", tie.loadFactor, (v) => setAny(k, { tie: { ...tie, loadFactor: v } }))}
          </>}
          <label className="cs-check"><input type="checkbox" checked={w.enabled} onChange={(e) => setAny(k, { waler: { ...w, enabled: e.target.checked } })} /> {t("stage.walerCheck", "Gording toetsen")}</label>
          {w.enabled && <>
            {num(t("stage.walerW", "Weerstandsmoment gording"), "cm³", w.wCm3, (v) => setAny(k, { waler: { ...w, wCm3: v } }))}
            {num("f_y", "N/mm²", w.fyMPa, (v) => setAny(k, { waler: { ...w, fyMPa: v } }))}
            {num(t("stage.walerC", "Momentcoëfficiënt (q·a²/c)"), "", w.coefficient, (v) => setAny(k, { waler: { ...w, coefficient: v } }))}
          </>}
        </div>;
      })}
      <Hint>{t("stage.supportChecksHint", "Ankerstaaf: min(k_t · f_ua · A_s / γ_M2; f_y · A_g / γ_M0) volgens NEN-EN 1993-5 art. 7.2.3, tegen de extra factor maal de grootste ankerkracht. Gording: q · a² / c met a de h.o.h.-afstand; c = 8 voor één veld, 10 als benadering voor een doorgaande ligger.")}</Hint>
    </More>
  </>;
}

// ─── Fasen ────────────────────────────────────────────────────────

/** Fasen in een tabel: per fase wat er verandert; lege cellen houden de waarde van de vorige fase. */
export function PhasesBlock({ input: i, onChange }: { input: WallInput; onChange: Change }) {
  const { t } = useTranslation("calcWall");
  const phases = i.phases ?? [], supports = wallSupports(i), loads = wallLoads(i);
  const set = (k: number, patch: Partial<WallPhase>) => onChange({ phases: phases.map((p, j) => (j === k ? { ...p, ...patch } : p)) });
  const toggle = (list: string[] | undefined, id: string, on: boolean) => (on ? [...(list ?? []), id] : (list ?? []).filter((x) => x !== id));
  const add = () => onChange({ phases: phases.length ? [...phases, { name: String(phases.length + 1) }] : [{ name: "1", excavationNap: i.excavationNap, install: supports.map((a) => a.id!) }] });
  const num = (k: number, key: "excavationNap" | "waterHighNap" | "waterLowNap" | "surchargeKpa" | "groundHighNap", name: string) =>
    <td><Optional label={`${name}, ${t("stage.phase", "fase")} ${k + 1}`} value={phases[k][key]} onChange={(v) => set(k, { [key]: v })} /></td>;
  return <>
    {phases.length > 0 && <div className="cs-table-wrap"><table className="cs-layer-table sw-stage-table" aria-label={t("stage.phases", "Bouwfasen")}>
      <thead><tr><th>{t("stage.name", "Fase")}</th><th>{t("stage.excavation", "Lage zijde")}<small>m NAP</small></th><th>{t("stage.groundHigh", "Hoge zijde")}<small>m NAP</small></th><th>{t("stage.waterHigh", "Water hoog")}<small>m NAP</small></th><th>{t("stage.waterLow", "Water laag")}<small>m NAP</small></th><th>q<small>kPa</small></th>
        {supports.length > 0 && <th>{t("stage.install", "Aanbrengen")}</th>}{supports.length > 0 && <th>{t("stage.remove", "Verwijderen")}</th>}{loads.length > 0 && <th>{t("stage.loads", "Belastingen")}</th>}<th /></tr></thead>
      <tbody>{phases.map((p, k) => <tr key={k}>
        <td><input type="text" aria-label={`${t("stage.name", "Fase")} ${k + 1}`} value={p.name} onChange={(e) => set(k, { name: e.target.value })} /></td>
        {num(k, "excavationNap", t("stage.excavation", "Lage zijde"))}{num(k, "groundHighNap", t("stage.groundHigh", "Hoge zijde"))}{num(k, "waterHighNap", t("stage.waterHigh", "Water hoog"))}{num(k, "waterLowNap", t("stage.waterLow", "Water laag"))}{num(k, "surchargeKpa", "q")}
        {supports.length > 0 && <td className="sw-ids">{supports.map((a) => <label key={a.id}><input type="checkbox" aria-label={`${t("stage.install", "Aanbrengen")} ${a.id}, ${t("stage.phase", "fase")} ${k + 1}`} checked={(p.install ?? []).includes(a.id!)} onChange={(e) => set(k, { install: toggle(p.install, a.id!, e.target.checked) })} />{a.id}</label>)}</td>}
        {supports.length > 0 && <td className="sw-ids">{supports.map((a) => <label key={a.id}><input type="checkbox" aria-label={`${t("stage.remove", "Verwijderen")} ${a.id}, ${t("stage.phase", "fase")} ${k + 1}`} checked={(p.remove ?? []).includes(a.id!)} onChange={(e) => set(k, { remove: toggle(p.remove, a.id!, e.target.checked) })} />{a.id}</label>)}</td>}
        {loads.length > 0 && <td className="sw-ids">{loads.map((l) => <label key={l.id}><input type="checkbox" aria-label={`${l.id}, ${t("stage.phase", "fase")} ${k + 1}`} checked={(p.loadIds ?? (k === 0 ? loads.map((x) => x.id!) : resolveLoads(phases, k, loads))).includes(l.id!)} onChange={(e) => set(k, { loadIds: toggle(p.loadIds ?? resolveLoads(phases, k, loads), l.id!, e.target.checked) })} />{l.id}</label>)}</td>}
        <td><button type="button" className="sw-remove" aria-label={`${t("stage.removePhase", "Fase verwijderen")} ${k + 1}`} onClick={() => onChange({ phases: phases.filter((_, j) => j !== k) })}>×</button></td>
      </tr>)}</tbody></table></div>}
    <div className="sw-buttons"><button type="button" onClick={add}>{t("stage.addPhase", "Fase toevoegen")}</button>{phases.length > 0 && <button type="button" onClick={() => onChange({ phases: [] })}>{t("stage.noPhases", "Eén fase")}</button>}</div>
    <Hint>{t("stage.phasesHint", "Elke fase rekent verder vanaf de vervormde wand en de grond van de vorige fase; een leeg vak houdt de waarde van de vorige fase. Een steunpunt werkt vanaf de stand waarin het wordt aangebracht, met zijn voorspanning. Zonder fasen werken alle steunpunten vanaf het begin.")}</Hint>
  </>;
}
function resolveLoads(phases: WallPhase[], k: number, loads: SurfaceLoad[]): string[] {
  for (let j = k; j >= 0; j--) if (phases[j].loadIds) return phases[j].loadIds!;
  return loads.map((l) => l.id!);
}

// ─── Maaiveld en belastingen op afstand ───────────────────────────

function ProfileTable({ points, onChange, caption }: { points: SurfacePoint[]; onChange: (p: SurfacePoint[]) => void; caption: string }) {
  const { t } = useTranslation("calcWall");
  const set = (k: number, patch: Partial<SurfacePoint>) => onChange(points.map((p, j) => (j === k ? { ...p, ...patch } : p)));
  return <>
    {points.length > 0 && <div className="cs-table-wrap"><table className="cs-layer-table sw-stage-table" aria-label={caption}>
      <thead><tr><th>{caption}</th><th>{t("stage.distance", "Afstand")}<small>m</small></th><th>{t("stage.height", "Hoogte")}<small>m</small></th><th /></tr></thead>
      <tbody>{points.map((p, k) => <tr key={k}><td>{k + 1}</td>
        <td><NumberInput label={`${t("stage.distance", "Afstand")} ${k + 1}, ${caption}`} min={0} value={p.xM} onChange={(v) => set(k, { xM: v })} /></td>
        <td><NumberInput label={`${t("stage.height", "Hoogte")} ${k + 1}, ${caption}`} value={p.dzM} onChange={(v) => set(k, { dzM: v })} /></td>
        <td><button type="button" className="sw-remove" aria-label={`${t("stage.removePoint", "Punt verwijderen")} ${k + 1}, ${caption}`} onClick={() => onChange(points.filter((_, j) => j !== k))}>×</button></td></tr>)}</tbody></table></div>}
    <div className="sw-buttons"><button type="button" onClick={() => { const last = points[points.length - 1]; onChange([...points, { xM: (last?.xM ?? 0) + 2, dzM: last?.dzM ?? 0 }]); }}>{`${t("stage.addPoint", "Punt toevoegen")}: ${caption}`}</button></div>
  </>;
}

export function GeometryBlock({ input: i, onChange }: { input: WallInput; onChange: Change }) {
  const { t } = useTranslation("calcWall");
  const loads = i.loads ?? [];
  const set = (k: number, patch: Partial<SurfaceLoad>) => onChange({ loads: loads.map((l, j) => (j === k ? { ...l, ...patch } : l)) });
  return <More title={t("stage.geometry", "Maaiveld en belastingen op afstand")}>
    <ProfileTable caption={t("input.layersHigh", "hoge zijde")} points={i.profileHigh ?? []} onChange={(profileHigh) => onChange({ profileHigh })} />
    <ProfileTable caption={t("input.layersLow", "lage zijde")} points={i.profileLow ?? []} onChange={(profileLow) => onChange({ profileLow })} />
    <Hint>{t("stage.profileHint", "Maaiveld van de wand af: afstand tot de wand en hoogte ten opzichte van het maaiveld bij de wand (omhoog positief); voorbij het laatste punt blijft de hoogte gelijk. Aan de lage zijde zakt het profiel met de toeslag op de kerende hoogte mee.")}</Hint>
    {loads.length > 0 && <div className="cs-table-wrap"><table className="cs-layer-table sw-stage-table" aria-label={t("stage.loadsTable", "Belastingen op afstand")}>
      <thead><tr><th /><th>{t("stage.side", "Zijde")}</th><th>{t("stage.kind", "Soort")}</th><th>{t("stage.value", "Grootte")}<small>kPa · kN/m</small></th><th>{t("stage.from", "Van")}<small>m</small></th><th>{t("stage.to", "Tot")}<small>m</small></th><th /></tr></thead>
      <tbody>{loads.map((l, k) => <tr key={k}><td>{l.id || `B${k + 1}`}</td>
        <td><select aria-label={`${t("stage.side", "Zijde")} B${k + 1}`} value={l.side} onChange={(e) => set(k, { side: e.target.value as SurfaceLoad["side"] })}><option value="high">{t("input.layersHigh", "hoge zijde")}</option><option value="low">{t("input.layersLow", "lage zijde")}</option></select></td>
        <td><select aria-label={`${t("stage.kind", "Soort")} B${k + 1}`} value={l.kind} onChange={(e) => set(k, { kind: e.target.value as SurfaceLoad["kind"] })}><option value="strip">{t("stage.strip", "Strook")}</option><option value="line">{t("stage.line", "Lijnlast")}</option></select></td>
        <td><NumberInput label={`${t("stage.value", "Grootte")} B${k + 1}`} value={l.value} onChange={(v) => set(k, { value: v })} /></td>
        <td><NumberInput label={`${t("stage.from", "Van")} B${k + 1}`} min={0} value={l.fromM} onChange={(v) => set(k, { fromM: v })} /></td>
        <td>{l.kind === "strip" ? <NumberInput label={`${t("stage.to", "Tot")} B${k + 1}`} min={0} value={l.toM} onChange={(v) => set(k, { toM: v })} /> : "—"}</td>
        <td><button type="button" className="sw-remove" aria-label={`${t("stage.removeLoad", "Belasting verwijderen")} B${k + 1}`} onClick={() => onChange({ loads: loads.filter((_, j) => j !== k) })}>×</button></td></tr>)}</tbody></table></div>}
    <div className="sw-buttons"><button type="button" onClick={() => onChange({ loads: [...loads, { side: "high", kind: "strip", value: 10, fromM: 1, toM: 4 }] })}>{t("stage.addLoad", "Belasting toevoegen")}</button></div>
    <Hint>{t("stage.loadsHint", "Strooklast in kPa of lijnlast evenwijdig aan de wand in kN/m, op afstand van de wand. De extra verticale spanning langs de wand volgt uit de elastische oplossing van Boussinesq, gespiegeld in de wand (Poulos en Davis, 1974); een strook vanaf de wand tot ver weg is dan de gelijkmatige bovenbelasting. Een talud wordt op dezelfde manier als strooklast van de grond gerekend; een glijvlakberekening met het maaiveld zit er niet in.")}</Hint>
  </More>;
}

// ─── Stappenplan en extra toetsen ─────────────────────────────────

export function CurBlock({ input: i, onChange }: { input: WallInput; onChange: Change }) {
  const { t } = useTranslation("calcWall");
  const c = { ...DEFAULT_CUR, ...i.cur }, steps = c.steps?.length ? c.steps : CUR_STEPS;
  const set = (patch: Partial<typeof c>) => onChange({ cur: { ...c, steps, ...patch } });
  const setStep = (k: number, patch: Partial<CurStep>) => set({ steps: steps.map((s, j) => (j === k ? { ...s, ...patch } : s)) });
  const water = (w: CurStep["lowWater"]) => (w === "up" ? t("stage.waterUp", "omhoog") : w === "down" ? t("stage.waterDown", "omlaag") : "—");
  return <More title={t("stage.cur", "Stappenplan CUR 166")}>
    <label className="cs-check"><input type="checkbox" checked={c.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> {t("stage.curEnabled", "Rekenen met stap 6.1 tot en met 6.5")}</label>
    {c.enabled && <>
      <div className="sw-buttons"><span>{t("stage.curSet", "Factoren en stappen voor:")}</span>{CUR_FACTOR_SETS.map((s) => <button key={s.id} type="button" onClick={() => onChange({ factors: { ...s.factors }, cur: { ...c, steps: CUR_STEPS.map((x) => (x.id === "6.5" ? { ...x, resultFactor: s.resultFactor } : x)) } })}>{s.name}</button>)}</div>
      <div className="cs-table-wrap"><table className="cs-layer-table sw-stage-table" aria-label={t("stage.curTable", "Stappen")}>
        <thead><tr><th>{t("stage.step", "stap")}</th><th>{t("stage.on", "aan")}</th><th>{t("stage.soil", "Grond")}</th><th>{t("stage.khFactor", "× kh")}</th><th>{t("stage.waterLowShort", "water laag")}</th><th>{t("stage.resultFactor", "× uitkomst")}</th></tr></thead>
        <tbody>{steps.map((s, k) => <tr key={s.id}><td>{s.id}</td>
          <td><input type="checkbox" aria-label={`${t("stage.on", "aan")} ${s.id}`} checked={s.on} onChange={(e) => setStep(k, { on: e.target.checked })} /></td>
          <td>{s.design ? t("stage.design", "rekenwaarde") : t("stage.representative", "representatief")}</td>
          <td><NumberInput label={`${t("stage.khFactor", "× kh")} ${s.id}`} min={0} value={Math.round(s.khFactor * 10000) / 10000} onChange={(v) => setStep(k, { khFactor: v })} /></td>
          <td>{water(s.lowWater)}</td>
          <td><NumberInput label={`${t("stage.resultFactor", "× uitkomst")} ${s.id}`} min={0} value={s.resultFactor} onChange={(v) => setStep(k, { resultFactor: v })} /></td></tr>)}</tbody></table></div>
      <label className="cs-check"><input type="checkbox" checked={c.skipFreeWater} onChange={(e) => set({ skipFreeWater: e.target.checked })} /> {t("stage.skipFree", "Stappen met hoger water aan de lage zijde weglaten bij vrij water")}</label>
      <Hint warn>{t("stage.curHint", "De stappen volgen wat openbare berekeningen per stap afdrukken: 6.1 tot en met 6.4 met rekenwaarden in alle fasen, lage (invoer / 1,3) of hoge (invoer × 2,25) beddingsconstanten en het water aan de lage zijde omhoog of omlaag met de toeslag van de factorset; 6.5 representatief, maal 1,2 (RC3: 1,35) ook als rekenwaarde. Niet tegen de tekst van CUR 166 gelegd: controleer de stappen en de factoren.")}</Hint>
    </>}
  </More>;
}

export function ExtraChecksBlock({ input: i, onChange }: { input: WallInput; onChange: Change }) {
  const { t } = useTranslation("calcWall");
  const e = { deformation: { ...DEFAULT_EXTRA_CHECKS.deformation, ...i.extraChecks?.deformation }, vertical: { ...DEFAULT_EXTRA_CHECKS.vertical, ...i.extraChecks?.vertical } };
  const set = (patch: Partial<typeof e>) => onChange({ extraChecks: { ...e, ...patch } });
  const num = (label: string, unit: string, value: number, apply: (v: number) => void) => <Row label={label} unit={unit || undefined}><NumberInput label={unit ? `${label} [${unit}]` : label} min={0} value={value} onChange={apply} /></Row>;
  return <More title={t("stage.extraChecks", "Vervorming en verticaal evenwicht")}>
    <label className="cs-check"><input type="checkbox" checked={e.deformation.enabled} onChange={(x) => set({ deformation: { ...e.deformation, enabled: x.target.checked } })} /> {t("stage.deformationCheck", "Vervormingseis")}</label>
    {e.deformation.enabled && <>
      {num(t("stage.ratio", "Kerende hoogte gedeeld door"), "", e.deformation.ratio, (v) => set({ deformation: { ...e.deformation, ratio: v } }))}
      {num(t("stage.maxMm", "Ten hoogste"), "mm", e.deformation.maxMm, (v) => set({ deformation: { ...e.deformation, maxMm: v } }))}
    </>}
    <label className="cs-check"><input type="checkbox" checked={e.vertical.enabled} onChange={(x) => set({ vertical: { ...e.vertical, enabled: x.target.checked } })} /> {t("stage.verticalCheck", "Verticaal evenwicht")}</label>
    {e.vertical.enabled && <>
      {num(t("stage.qb", "Puntweerstand q_b;max"), "MPa", e.vertical.qbMaxMPa, (v) => set({ vertical: { ...e.vertical, qbMaxMPa: v } }))}
      {num("ξ", "", e.vertical.xi, (v) => set({ vertical: { ...e.vertical, xi: v } }))}{num("γ_b", "", e.vertical.gammaB, (v) => set({ vertical: { ...e.vertical, gammaB: v } }))}
    </>}
    <Hint>{t("stage.extraHint", "Vervorming: grootste verplaatsing met representatieve waarden tegen de kerende hoogte gedeeld door het getal, met een maximum. Verticaal evenwicht: wrijving aan de hoge zijde (Σ σ′h · tan δ), normaalkracht en verticale ankerkracht tegen q_b;max · A / (ξ · γ_b); de wrijving aan de lage zijde telt niet mee. ξ = 1,39 en γ_b = 1,2 zoals in openbare berekeningen; niet tegen NEN 9997-1 gelegd.")}</Hint>
  </More>;
}

// ─── Uitkomst per fase en stap ────────────────────────────────────

/** Overzicht per stap en fase, zoals de rapporten het geven; vet = maatgevend in die kolom. */
export function StageOverview({ result: r }: { result: WallOk }) {
  const { t } = useTranslation("calcWall");
  const ids = [...new Set(r.cases.flatMap((c) => c.run.supports.map((s) => s.id)))];
  type Line = { label: string; m: number; v: number; u: number | null; a: Array<number | null>; mob: number | null };
  const lines: Line[] = [];
  for (const c of r.cases) {
    const a = ids.map((id) => c.run.supports.find((s) => s.id === id)?.axialKn ?? null);
    lines.push({ label: caseLabel(c, r.phases.length, t), m: Math.abs(c.run.maxMoment.value), v: Math.abs(c.run.maxShear.value), u: c.serviceability ? Math.abs(c.run.maxDisplacement.value) * 1000 : null, a, mob: 100 * c.run.passive.ratio });
    if (c.design && c.resultFactor !== 1 && c.serviceability) lines.push({ label: `${caseLabel(c, r.phases.length, t)} × ${fmt(c.resultFactor, 2)}`, m: Math.abs(c.run.maxMoment.value) * c.resultFactor, v: Math.abs(c.run.maxShear.value) * c.resultFactor, u: null, a: a.map((x) => (x === null ? null : x * c.resultFactor)), mob: null });
  }
  if (lines.length < 2) return null;
  const max = (f: (l: Line) => number | null) => Math.max(...lines.map((l) => f(l) ?? -Infinity));
  const mm = max((l) => l.m), mv = max((l) => l.v), mu = max((l) => l.u), ma = ids.map((_, k) => max((l) => l.a[k])), mmob = max((l) => l.mob);
  const cell = (v: number | null, top: number, d = 1) => <td className={v !== null && Math.abs(v - top) < 1e-9 ? "sw-max" : ""}>{v === null ? "—" : fmt(v, d)}</td>;
  return <>
    <h3>{t("stage.overview", "Per fase en stap")}</h3>
    <div className="cs-table-wrap"><table className="cs-layer-table sw-rows sw-overview" aria-label={t("stage.overview", "Per fase en stap")}>
      <thead><tr><th /><th>M<small>kNm/m</small></th><th>V<small>kN/m</small></th><th>u<small>mm</small></th>{ids.map((id) => <th key={id}>{id}<small>kN/m</small></th>)}<th>{t("stage.mob", "passief")}<small>%</small></th></tr></thead>
      <tbody>{lines.map((l, k) => <tr key={k}><td>{l.label}</td>{cell(l.m, mm)}{cell(l.v, mv)}{cell(l.u, mu)}{l.a.map((x, j) => <td key={j} className={x !== null && Math.abs(x - ma[j]) < 1e-9 ? "sw-max" : ""}>{x === null ? "—" : fmt(x, 1)}</td>)}{cell(l.mob, mmob, 0)}</tr>)}</tbody>
    </table></div>
    <p className="cs-hint">{t("stage.overviewHint", "Vet: de grootste waarde in de kolom, die de toetsen gebruiken. Ankerkracht axiaal per m wand; verplaatsing met representatieve waarden.")}</p>
  </>;
}
