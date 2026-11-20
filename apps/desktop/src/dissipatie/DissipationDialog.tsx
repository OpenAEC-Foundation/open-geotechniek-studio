// Scherm met de dissipatietests van de actieve sondering: per test de grafiek, de invoer en de uitkomst.
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import Modal from "../components/Modal";
import type { Cpt } from "../types/cpt";
import { useCptStore } from "../store/useCptStore";
import { analyseDissipation, availableChannels, DEFAULT_CONE_AREA_MM2, DEFAULT_RIGIDITY_INDEX } from "./analysis";
import { coneAreaFromFile, withDissipationTest, withoutDissipationTest, withTestChange } from "./cptDissipation";
import DissipationChart from "./DissipationChart";
import { looksLikeGefDissipation, parseGefDissipation } from "./gefDissipation";
import { FORMULA_SOURCE, FORMULA_TEXT, INDICATIVE_NOTE, summaryRows, WARNING_NL } from "./summary";
import type { DissipationSettings, EquilibriumMode, PoreChannel } from "./types";
import "./dissipatie.css";

export const OPEN_DISSIPATION_EVENT = "ogs:open-dissipation";
export const openDissipationDialog = () => window.dispatchEvent(new Event(OPEN_DISSIPATION_EVENT));

/** De sondering waar het scherm over gaat: de actieve, of de enige. */
export function useActiveCpt(): Cpt | undefined {
  const cpts = useCptStore((s) => s.cpts);
  const activeCptId = useCptStore((s) => s.activeCptId);
  return (activeCptId ? cpts.get(activeCptId) : undefined) ?? (cpts.size === 1 ? cpts.values().next().value : undefined);
}

const base = (name: string) => name.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, "").toLowerCase();

/** Kiest een GEF-dissipatiebestand en zet de test bij de sondering. Geeft een melding voor de gebruiker terug. */
export function pickGefDissipation(cpt: Cpt, t: (key: string, nl: string, vars?: Record<string, unknown>) => string): Promise<{ text: string; error?: boolean; testId?: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".gef,.GEF,text/plain"; input.multiple = true;
    input.oncancel = () => resolve(null);
    input.onchange = async () => {
      const files = Array.from(input.files ?? []);
      if (!files.length) return resolve(null);
      const messages: string[] = [];
      let current = useCptStore.getState().cpts.get(cpt.id) ?? cpt, error = false, last: string | undefined;
      for (const file of files) {
        try {
          const text = await file.text();
          if (!looksLikeGefDissipation(text)) throw new Error(t("message.notDissipation", "Geen GEF-dissipatiebestand: de eerste kolom moet de tijd zijn."));
          const parsed = parseGefDissipation(text, file.name);
          current = withDissipationTest(current, parsed.test);
          last = parsed.test.id;
          messages.push(t("message.added", "Dissipatietest op {{depth}} m toegevoegd.", { depth: parsed.test.depth.toFixed(2) }));
          if (!parsed.test.depth) messages.push(t("message.depthMissing", "De diepte staat niet in het bestand; vul die in."));
          const named = parsed.parentFile ?? parsed.testId;
          if (named && ![base(cpt.metadata.source_file ?? ""), cpt.id.toLowerCase()].includes(base(named)))
            messages.push(t("message.otherCpt", "Het bestand noemt sondering {{parent}}; controleer of het bij {{cpt}} hoort.", { parent: named, cpt: cpt.id }));
        } catch (e) {
          error = true;
          messages.push(`${file.name}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      if (last) useCptStore.getState().replaceCpt(current);
      resolve({ text: messages.join(" "), error, testId: last });
    };
    input.click();
  });
}

function NumberField({ label, unit, value, placeholder, onChange, hint }: {
  label: string; unit?: string; value: number | undefined; placeholder?: string; hint?: string; onChange: (value: number | undefined) => void;
}) {
  const [text, setText] = useState(value == null ? "" : String(value));
  useEffect(() => { setText((old) => (Number(old.replace(",", ".")) === value || (old === "" && value == null) ? old : value == null ? "" : String(value))); }, [value]);
  return (
    <label className="dis-field" title={hint}>
      <span>{label}</span>
      <span className="dis-field-input">
        <input inputMode="decimal" value={text} placeholder={placeholder} onChange={(e) => {
          setText(e.target.value);
          const v = Number(e.target.value.replace(",", "."));
          if (e.target.value.trim() === "") onChange(undefined);
          else if (Number.isFinite(v)) onChange(v);
        }} />
        {unit && <em>{unit}</em>}
      </span>
    </label>
  );
}

export function DissipationDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation("dissipatie");
  const cpt = useActiveCpt();
  const replaceCpt = useCptStore((s) => s.replaceCpt);
  const tests = cpt?.dissipation_tests ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const test = tests.find((item) => item.id === selectedId) ?? tests[0];
  const fileArea = cpt ? coneAreaFromFile(cpt) : undefined;
  const result = useMemo(() => (test ? analyseDissipation(test, fileArea) : null), [test, fileArea]);
  useEffect(() => { if (open) setMessage(null); }, [open, cpt?.id]);
  if (!open) return null;

  const tr = (key: string, nl: string, vars?: Record<string, unknown>) => t(key, nl, vars) as string;
  const change = (settings: Partial<DissipationSettings>) => { if (cpt && test) replaceCpt(withTestChange(cpt, test.id, { settings })); };
  const add = async () => {
    if (!cpt) return;
    const outcome = await pickGefDissipation(cpt, tr);
    if (outcome) { setMessage(outcome); if (outcome.testId) setSelectedId(outcome.testId); }
  };
  const s = test?.settings ?? {};
  const axis = s.timeAxis ?? "log";
  const channels = test ? availableChannels(test) : [];

  return createPortal(
    <Modal open onClose={onClose} width={1040} className="dis-modal"
      title={cpt ? tr("dialog.title", "Dissipatietests - {{cpt}}", { cpt: cpt.id }) : tr("dialog.titleEmpty", "Dissipatietests")}
      footer={<>
        {message && <span className={`dis-message${message.error ? " dis-error" : ""}`} role={message.error ? "alert" : "status"}>{message.text}</span>}
        <button className="dis-btn" disabled={!cpt} onClick={() => void add()}>{tr("dialog.add", "GEF-dissipatiebestand toevoegen")}</button>
        <button className="dis-btn dis-btn-primary" onClick={onClose}>{tr("dialog.close", "Sluiten")}</button>
      </>}>
      {!cpt ? <p className="dis-empty">{tr("dialog.noCpt", "Open of kies eerst een sondering.")}</p>
        : !test || !result ? <p className="dis-empty">{tr("dialog.empty", "Deze sondering heeft geen dissipatietests. Een BRO-XML met dissipatietests brengt ze zelf mee; een los GEF-dissipatiebestand voeg je hier toe.")}</p>
        : (
          <div className="dis-layout">
            <div className="dis-list" role="listbox" aria-label={tr("dialog.tests", "Tests")}>
              <div className="dis-list-title">{tr("dialog.tests", "Tests")}</div>
              {tests.map((item) => (
                <button key={item.id} role="option" aria-selected={item.id === test.id} className={`dis-list-item${item.id === test.id ? " active" : ""}`} onClick={() => setSelectedId(item.id)}>
                  <strong>{item.depth.toFixed(2)} m</strong>
                  <small>{item.source === "bro" ? "BRO" : "GEF"} · {item.points.length}</small>
                </button>
              ))}
              <button className="dis-btn dis-remove" title={tr("dialog.removeHint", "Haal deze test weg bij de sondering")}
                onClick={() => { replaceCpt(withoutDissipationTest(cpt, test.id)); setSelectedId(null); }}>{tr("dialog.remove", "Test verwijderen")}</button>
            </div>

            <div className="dis-main">
              <div className="dis-toolbar">
                <span>{tr("dialog.axis", "Tijdas")}</span>
                <button className={`dis-btn${axis === "log" ? " active" : ""}`} aria-pressed={axis === "log"} onClick={() => change({ timeAxis: "log" })}>{tr("dialog.axisLog", "Logaritmisch")}</button>
                <button className={`dis-btn${axis === "sqrt" ? " active" : ""}`} aria-pressed={axis === "sqrt"} onClick={() => change({ timeAxis: "sqrt" })}>{tr("dialog.axisSqrt", "Wortel-tijd")}</button>
              </div>
              <DissipationChart result={result} axis={axis} />
              {result.warnings.map((warning) => <p key={warning} className="dis-warning">{tr(`warning.${warning}`, WARNING_NL[warning])}</p>)}
              {(test.notes ?? []).map((note, i) => <p key={i} className="dis-warning">{note}</p>)}
            </div>

            <div className="dis-side">
              <div className="dis-side-title">{tr("input.title", "Invoer")}</div>
              <NumberField key={`d-${test.id}`} label={tr("input.depth", "Diepte van de test")} unit="m" value={test.depth}
                onChange={(depth) => { if (depth != null && depth >= 0) replaceCpt(withTestChange(cpt, test.id, { depth })); }} />
              <label className="dis-field"><span>{tr("input.channel", "Filterpositie")}</span>
                <select value={result.channel} disabled={channels.length < 2} onChange={(e) => change({ channel: e.target.value as PoreChannel })}>
                  {channels.map((c) => <option key={c} value={c}>{c}</option>)}
                </select></label>
              <label className="dis-field"><span>{tr("input.u0Mode", "Evenwichtswaarde u₀")}</span>
                <select value={s.u0Mode ?? "last"} onChange={(e) => change({ u0Mode: e.target.value as EquilibriumMode })}>
                  <option value="last">{tr("u0Mode.last", "laatste meting")}</option>
                  <option value="manual">{tr("u0Mode.manual", "ingevuld")}</option>
                  <option value="groundwater">{tr("u0Mode.groundwater", "uit grondwaterstand en diepte")}</option>
                </select></label>
              {s.u0Mode === "manual" && <NumberField key={`u-${test.id}`} label={tr("input.u0", "u₀")} unit="kPa" value={s.u0Kpa} onChange={(u0Kpa) => change({ u0Kpa })} />}
              {s.u0Mode === "groundwater" && <NumberField key={`g-${test.id}`} label={tr("input.groundwater", "Grondwaterstand onder maaiveld")} unit="m" value={s.groundwaterDepthM}
                hint={tr("input.groundwaterHint", "u₀ = 9,81 kN/m³ × (diepte − grondwaterstand)")} onChange={(groundwaterDepthM) => change({ groundwaterDepthM })} />}
              <NumberField key={`i-${test.id}`} label={tr("input.rigidity", "Stijfheidsindex Iᵣ")} value={s.rigidityIndex} placeholder={String(DEFAULT_RIGIDITY_INDEX)}
                hint={tr("input.rigidityHint", "Iᵣ = G / sᵤ. Voor klei meestal tussen 50 en 500; zonder invoer geldt 100.")} onChange={(rigidityIndex) => change({ rigidityIndex })} />
              <NumberField key={`a-${test.id}`} label={tr("input.coneArea", "Oppervlakte conuspunt")} unit="mm²" value={s.coneAreaMm2} placeholder={String(fileArea ?? DEFAULT_CONE_AREA_MM2)}
                hint={fileArea ? tr("input.coneAreaFromFile", "Zonder invoer geldt de waarde uit het sondeerbestand.") : tr("input.coneAreaDefault", "Niet in het sondeerbestand; zonder invoer geldt 1000 mm².")}
                onChange={(coneAreaMm2) => change({ coneAreaMm2 })} />

              <div className="dis-side-title">{tr("result.title", "Uitkomst")}</div>
              <table className="dis-table"><tbody>
                {summaryRows(test, result).map((row) => (
                  <tr key={row.key} className={row.key === "ch" || row.key.startsWith("t50") && row.key !== "t50Star" ? "dis-key" : undefined}>
                    <th>{tr(`row.${row.key}`, row.nl)}</th><td>{row.valueKey ? tr(row.valueKey, row.value) : row.value}</td>
                  </tr>
                ))}
              </tbody></table>
              <p className="dis-formula">{FORMULA_TEXT}<small> ({FORMULA_SOURCE})</small></p>
              <p className="dis-note">{tr("result.indicative", INDICATIVE_NOTE)}</p>
            </div>
          </div>
        )}
    </Modal>,
    document.body,
  );
}
