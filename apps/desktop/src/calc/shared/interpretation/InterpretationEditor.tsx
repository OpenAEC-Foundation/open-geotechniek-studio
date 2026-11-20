// Aanpassingen van de grondlaaginterpretatie bij de sonderingstekening: een
// traject kiezen (slepen in de grafiek of niveaus typen), daar de
// conusweerstand of de grondsoort wijzigen, met een toelichting. De lijst
// eronder toont wat er voor deze sondering is aangepast. Gedeeld door de
// rekenmodules; de module geeft zijn eigen grondsoorten mee.
import { useTranslation } from "react-i18next";
import { MIN_RANGE_M, type AppliedOverride, type InterpretationOverride } from "./overrides";
import { overrideChanges, overrideRange } from "./text";
import { OaIcon } from "../../../components/icons/oaIcon";
import { NumField } from "../../framework/views/SheetForm";
import "./interpretation.css";

/** Aanpassing in bewerking; `id` is null bij een nieuwe. */
export interface OverrideDraft<K extends string = string> {
  id: string | null;
  topNap: number | null;
  bottomNap: number | null;
  qcMode: "none" | "interpolate" | "fixed";
  valueMpa: number | null;
  soilKind: K | "";
  comment: string;
}

export const emptyDraft = <K extends string = string>(): OverrideDraft<K> => ({ id: null, topNap: null, bottomNap: null, qcMode: "interpolate", valueMpa: null, soilKind: "", comment: "" });

export function draftOf<K extends string>(o: InterpretationOverride<K>): OverrideDraft<K> {
  return {
    id: o.id, topNap: Math.max(o.topNap, o.bottomNap), bottomNap: Math.min(o.topNap, o.bottomNap),
    qcMode: o.qc?.mode ?? "none", valueMpa: o.qc?.mode === "fixed" ? o.qc.valueMpa : null,
    soilKind: o.soilKind ?? "", comment: o.comment ?? "",
  };
}

/** Reden waarom het concept nog niet op te slaan is; null = geldig. */
export type DraftProblem = "range" | "order" | "value" | "nothing" | null;
export function draftProblem(d: OverrideDraft): DraftProblem {
  if (d.topNap === null || d.bottomNap === null) return "range";
  if (d.topNap - d.bottomNap < MIN_RANGE_M) return "order";
  if (d.qcMode === "fixed" && !(d.valueMpa !== null && d.valueMpa >= 0)) return "value";
  if (d.qcMode === "none" && !d.soilKind) return "nothing";
  return null;
}

export function overrideOf<K extends string>(d: OverrideDraft<K>, cptId: string): InterpretationOverride<K> {
  const comment = d.comment.trim();
  return {
    id: d.id ?? (globalThis.crypto?.randomUUID?.() ?? `o-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`),
    cptId, topNap: d.topNap!, bottomNap: d.bottomNap!,
    ...(d.qcMode === "interpolate" ? { qc: { mode: "interpolate" as const } } : d.qcMode === "fixed" ? { qc: { mode: "fixed" as const, valueMpa: d.valueMpa! } } : {}),
    ...(d.soilKind ? { soilKind: d.soilKind } : {}),
    ...(comment ? { comment } : {}),
  };
}

interface EditorProps<K extends string> {
  cptId: string;
  /** Alle aanpassingen in de invoer van de berekening, van alle sonderingen. */
  overrides: InterpretationOverride<K>[];
  /** Aanpassingen van deze sondering zoals ze in de berekening zijn verwerkt. */
  applied: AppliedOverride<K>[];
  draft: OverrideDraft<K> | null;
  setDraft: (draft: OverrideDraft<K> | null) => void;
  /** Grondsoorten waaruit te kiezen valt, met hun naam. */
  soilKinds: K[];
  soilLabel: (kind: K) => string;
  /** Schrijft de nieuwe lijst naar de invoer; ontbrekend = alleen lezen. */
  onWrite?: (next: InterpretationOverride<K>[]) => void;
}

export function InterpretationEditor<K extends string>({ cptId, overrides: all, applied, draft, setDraft, soilKinds, soilLabel, onWrite }: EditorProps<K>) {
  const { t } = useTranslation("calcPile");
  const problem = draft ? draftProblem(draft) : null;
  const save = () => {
    if (!draft || problem) return;
    const next = overrideOf(draft, cptId);
    onWrite?.(all.some((o) => o.id === next.id) ? all.map((o) => (o.id === next.id ? next : o)) : [...all, next]);
    setDraft(null);
  };
  const remove = (id: string) => {
    onWrite?.(all.filter((o) => o.id !== id));
    if (draft?.id === id) setDraft(null);
  };
  const resetAll = () => { onWrite?.(all.filter((o) => o.cptId !== cptId)); setDraft(null); };
  const patch = (p: Partial<OverrideDraft<K>>) => draft && setDraft({ ...draft, ...p });
  const level = (key: "topNap" | "bottomNap") => (e: { target: { value: string } }) => patch({ [key]: e.target.value === "" ? null : +e.target.value });
  const problemText: Record<Exclude<DraftProblem, null>, string> = {
    range: t("interp.problem.range", "Kies een traject: sleep in de grafiek van boven naar onder, of typ beide niveaus."),
    order: t("interp.problem.order", "De bovenkant moet hoger liggen dan de onderkant."),
    value: t("interp.problem.value", "Geef een vaste conusweerstand van nul of meer op."),
    nothing: t("interp.problem.nothing", "Kies een wijziging van de conusweerstand of van de grondsoort."),
  };

  return (
    <div className="pile-interp cs-form">
      <div className="pile-interp-bar">
        <strong>{t("interp.title", "Grondlaaginterpretatie")}</strong>
        <span className={applied.length ? "pile-interp-state pile-interp-state--changed" : "pile-interp-state"}>
          {applied.length ? t("interp.stateChanged", "{{n}} aanpassing(en) voor deze sondering", { n: applied.length }) : t("interp.stateMeasured", "zoals gemeten")}
        </span>
        {onWrite && !draft && <button type="button" className="cs-settings-reset" onClick={() => setDraft(emptyDraft<K>())}>{t("interp.add", "Traject aanpassen")}</button>}
        {onWrite && applied.length > 0 && <button type="button" className="cs-settings-reset" title={t("interp.resetAllTitle", "Verwijdert alle aanpassingen van deze sondering in deze berekening; de meting geldt weer.")} onClick={resetAll}>{t("interp.resetAll", "Alles terugzetten")}</button>}
      </div>

      {draft && (
        <div className="pile-interp-editor" role="group" aria-label={draft.id ? t("interp.editTitle", "Aanpassing bewerken") : t("interp.newTitle", "Nieuwe aanpassing")}>
          <p className="cs-hint">{t("interp.selectHint", "Sleep in de grafiek van boven naar onder om het traject te kiezen, of typ de niveaus. De gemeten lijn blijft grijs zichtbaar.")}</p>
          <div className="pile-interp-fields">
            <label>{t("interp.top", "Bovenkant")}
              <span><NumField aria-label={t("interp.topAria", "Bovenkant traject [m NAP]")} step="0.05" placeholder="" value={draft.topNap ?? ""} onChange={level("topNap")} /><small>m NAP</small></span>
            </label>
            <label>{t("interp.bottom", "Onderkant")}
              <span><NumField aria-label={t("interp.bottomAria", "Onderkant traject [m NAP]")} step="0.05" placeholder="" value={draft.bottomNap ?? ""} onChange={level("bottomNap")} /><small>m NAP</small></span>
            </label>
            <label>{t("interp.qc", "Conusweerstand")}
              <span>
                <select aria-label={t("interp.qc", "Conusweerstand")} value={draft.qcMode} onChange={(e) => patch({ qcMode: e.target.value as OverrideDraft["qcMode"] })}>
                  <option value="none">{t("interp.qcNone", "ongewijzigd")}</option>
                  <option value="interpolate">{t("interp.qcLinear", "lineair tussen de randen")}</option>
                  <option value="fixed">{t("interp.qcFixed", "vaste waarde")}</option>
                </select>
              </span>
            </label>
            {draft.qcMode === "fixed" && (
              <label>{t("interp.value", "Waarde")}
                <span><NumField aria-label={t("interp.valueAria", "Vaste conusweerstand [MPa]")} min="0" step="0.5" placeholder="" value={draft.valueMpa ?? ""} onChange={(e) => patch({ valueMpa: e.target.value === "" ? null : +e.target.value })} /><small>MPa</small></span>
              </label>
            )}
            <label>{t("profile.soilType", "Grondsoort")}
              <span>
                <select aria-label={t("interp.soilAria", "Grondsoort van het traject")} value={draft.soilKind} onChange={(e) => patch({ soilKind: e.target.value as K | "" })}>
                  <option value="">{t("interp.qcNone", "ongewijzigd")}</option>
                  {soilKinds.map((kind) => <option key={kind} value={kind}>{soilLabel(kind)}</option>)}
                </select>
              </span>
            </label>
            <label className="pile-interp-comment">{t("interp.comment", "Toelichting")}
              <span><input type="text" aria-label={t("interp.commentAria", "Toelichting bij de aanpassing")} placeholder={t("interp.commentPlaceholder", "Waarom deze aanpassing?")} value={draft.comment} onChange={(e) => patch({ comment: e.target.value })} /></span>
            </label>
          </div>
          {problem && <p className="cs-hint" role="status">{problemText[problem]}</p>}
          <div className="pile-interp-actions">
            <button type="button" className="cs-settings-reset pile-interp-save" disabled={!!problem} onClick={save}>{t("interp.save", "Opslaan")}</button>
            <button type="button" className="cs-settings-reset" onClick={() => setDraft(null)}>{t("interp.cancel", "Annuleren")}</button>
            {draft.id && <button type="button" className="cs-settings-reset" onClick={() => remove(draft.id!)}>{t("interp.delete", "Verwijderen")}</button>}
          </div>
        </div>
      )}

      {applied.length > 0 && (
        <ol className="pile-interp-list" aria-label={t("interp.listAria", "Aanpassingen van deze sondering")}>
          {applied.map((a, i) => (
            <li key={a.override.id} className={`${a.status === "applied" ? "" : "pile-interp-item--skipped"}${draft?.id === a.override.id ? " pile-interp-item--active" : ""}`}>
              <span className="pile-interp-tag">A{i + 1}</span>
              <span className="pile-interp-text">
                <strong>{overrideRange(a.status === "applied" ? a : a.override)}</strong>
                {overrideChanges(a, soilLabel).map((line) => <span key={line}>{line}</span>)}
                {a.override.comment && <em>{a.override.comment}</em>}
              </span>
              {onWrite && <span className="pile-interp-item-actions">
                <button type="button" className="cs-settings-reset" aria-label={t("interp.editAria", "Aanpassing A{{n}} bewerken", { n: i + 1 })} onClick={() => setDraft(draftOf(a.override))}>{t("interp.edit", "Bewerken")}</button>
                <button type="button" className="cs-settings-reset" aria-label={t("interp.deleteAria", "Aanpassing A{{n}} verwijderen", { n: i + 1 })} onClick={() => remove(a.override.id)}>{t("interp.delete", "Verwijderen")}</button>
              </span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Overzicht van de aanpassingen op het resultaatblad. */
export function InterpretationNote<K extends string>({ cptId, applied, soilLabel }: { cptId: string; applied: AppliedOverride<K>[]; soilLabel: (kind: K) => string }) {
  const { t } = useTranslation("calcPile");
  if (!applied.length) return null;
  return (
    <div className="pile-interp-result" role="note" aria-label={t("interp.resultTitle", "Aanpassingen aan de grondlaaginterpretatie")}>
      <strong className="pile-interp-result-title"><OaIcon id="status.warning" /> {t("interp.resultTitle", "Aanpassingen aan de grondlaaginterpretatie")}</strong>
      <p>{t("interp.resultNote", "Deze berekening wijkt voor sondering {{cpt}} af van de gemeten interpretatie. De sondering zelf is ongewijzigd.", { cpt: cptId })}</p>
      <table>
        <thead><tr><th>#</th><th>{t("interp.colRange", "Traject")}</th><th>{t("interp.colChange", "Wijziging (oud → nieuw)")}</th><th>{t("interp.comment", "Toelichting")}</th></tr></thead>
        <tbody>
          {applied.map((a, i) => (
            <tr key={a.override.id}>
              <td>A{i + 1}</td>
              <td>{overrideRange(a.status === "applied" ? a : a.override)}</td>
              <td>{overrideChanges(a, soilLabel).map((line) => <span key={line}>{line}</span>)}</td>
              <td>{a.override.comment || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
