// Boring invoeren of bewerken: links de kopgegevens en de lagen, rechts de boorstaat die direct meetekent.
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Modal from "../components/Modal";
import { useCptStore } from "../store/useCptStore";
import BoorstaatSvg from "./BoorstaatSvg";
import { buildBoorstaat } from "./boorstaat";
import { boresOf, OPEN_BORE_EDITOR_EVENT, saveBore } from "./boreStore";
import { boreFromDraft, draftFromBore, draftProblems, emptyDraft, newLayer, type BoreDraft, type DraftLayer } from "./editing";
import { ADMIXTURES, admixturesFor, GRADES, MAIN_SOILS, type AdmixtureLetter, type MainSoil } from "./nen5104";
import { useBoorstaatLabels } from "./labels";
import "./boorstaat.css";

const METHODS = ["Handboring (edelman)", "Handboring (guts)", "Pulsboring", "Avegaarboring", "Spoelboring", "Sonische boring", "Steekboring"];

/** Eén exemplaar van de editor voor de hele app; het lint, de boorstaat en de projectinstellingen openen hem. */
export function BoreEditorHost() {
  const [target, setTarget] = useState<{ boreId?: string } | null>(null);
  useEffect(() => {
    const show = (e: Event) => setTarget({ boreId: (e as CustomEvent<{ boreId?: string }>).detail?.boreId });
    window.addEventListener(OPEN_BORE_EDITOR_EVENT, show);
    return () => window.removeEventListener(OPEN_BORE_EDITOR_EVENT, show);
  }, []);
  return target ? <BoreEditorDialog boreId={target.boreId} onClose={() => setTarget(null)} /> : null;
}

export function BoreEditorDialog({ boreId, onClose }: { boreId?: string; onClose: () => void }) {
  const { t } = useTranslation("boring");
  const labels = useBoorstaatLabels();
  const documents = useCptStore((s) => s.documents);
  const activeDocId = useCptStore((s) => s.activeDocId);
  const doc = documents.find((d) => d.id === activeDocId);
  const bores = useMemo(() => boresOf(doc), [doc]);
  const existing = boreId ? bores.find((b) => b.id === boreId) : undefined;
  const [draft, setDraft] = useState<BoreDraft>(() => existing ? draftFromBore(existing) : emptyDraft(bores.map((b) => b.id)));

  // Een los boortabblad wordt bij een nieuwe boring niet overschreven; daar telt alleen het project als verzameling.
  const otherIds = doc?.kind === "project" ? bores.filter((b) => b.id !== existing?.id).map((b) => b.id) : [];
  const problems = draftProblems(draft, otherIds);
  // De voorvertoning tekent wat er al klopt; bij een fout blijft de laatste goede tekening staan.
  const [shown, setShown] = useState(() => boreFromDraft(problems.length ? { ...draft, layers: [] } : draft));
  useEffect(() => { if (!problems.length) setShown(boreFromDraft(draft)); }, [draft, problems.length]);
  const layout = useMemo(() => buildBoorstaat(shown, { labels }), [shown, labels]);

  const set = (patch: Partial<BoreDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const setLayer = (index: number, patch: Partial<DraftLayer>) =>
    setDraft((d) => ({ ...d, layers: d.layers.map((l, i) => i === index ? { ...l, ...patch } : l) }));
  const setSoil = (index: number, patch: Partial<DraftLayer>) => setLayer(index, { ...patch, soilChanged: true });
  const save = () => { saveBore(boreFromDraft(draft), existing?.id); onClose(); };

  const field = (key: "id" | "date" | "method" | "x" | "y" | "z" | "finalDepth" | "groundwater", label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="bs-field"><span>{label}</span>
      <input value={draft[key]} onChange={(e) => set({ [key]: e.target.value })} {...extra} /></label>
  );

  return (
    <Modal open onClose={onClose} title={existing ? t("editor.titleEdit", "Boring {{id}} bewerken", { id: existing.id }) : t("editor.titleNew", "Boring toevoegen")} width={1180}
      footer={<><button className="settings-btn settings-btn-secondary" onClick={onClose}>{t("editor.cancel", "Annuleren")}</button>
        <button className="settings-btn" disabled={problems.length > 0} onClick={save}>{t("editor.save", "Opslaan")}</button></>}>
      <div className="bs-editor">
        <div className="bs-form">
          <div className="bs-grid">
            {field("id", t("field.id", "Boornummer"))}
            {field("date", t("field.date", "Datum"), { type: "date" })}
            {field("method", t("field.method", "Boormethode"), { list: "bs-methods" })}
            <datalist id="bs-methods">{METHODS.map((m) => <option key={m} value={m} />)}</datalist>
            {field("x", t("field.x", "X (RD, m)"), { inputMode: "decimal" })}
            {field("y", t("field.y", "Y (RD, m)"), { inputMode: "decimal" })}
            {field("z", t("field.groundLevel", "Maaiveld (m NAP)"), { inputMode: "decimal" })}
            {field("finalDepth", t("field.finalDepth", "Einddiepte (m -mv)"), { inputMode: "decimal", placeholder: t("field.finalDepthAuto", "onderkant diepste laag") })}
            {field("groundwater", t("field.groundwater", "Grondwaterstand (m -mv)"), { inputMode: "decimal", placeholder: t("field.notMeasured", "niet gemeten") })}
          </div>

          <div className="bs-layers-head">
            <h4>{t("editor.layers", "Lagen")}</h4>
            <button className="settings-btn settings-btn-secondary" onClick={() => setDraft((d) => ({ ...d, layers: [...d.layers, newLayer(d.layers)] }))}>
              {t("editor.addLayer", "Laag toevoegen")}</button>
          </div>
          <table className="bs-layers">
            <thead><tr>
              <th>{t("layer.top", "Boven")}</th><th>{t("layer.base", "Onder")}</th><th>{t("layer.soil", "Grondsoort")}</th>
              <th>{t("layer.admixture", "Bijmenging")}</th><th>{t("layer.colour", "Kleur")}</th><th>{t("layer.remark", "Opmerking")}</th><th />
            </tr></thead>
            <tbody>
              {draft.layers.map((layer, i) => {
                const options = admixturesFor(layer.main);
                return (
                  <tr key={i}>
                    <td><input className="bs-num" aria-label={`${t("layer.top", "Boven")} ${i + 1}`} inputMode="decimal" value={layer.top} onChange={(e) => setLayer(i, { top: e.target.value })} /></td>
                    <td><input className="bs-num" aria-label={`${t("layer.base", "Onder")} ${i + 1}`} inputMode="decimal" value={layer.base} onChange={(e) => setLayer(i, { base: e.target.value })} /></td>
                    <td>
                      <select aria-label={`${t("layer.soil", "Grondsoort")} ${i + 1}`} value={layer.main} onChange={(e) => setSoil(i, { main: e.target.value as MainSoil })}>
                        {MAIN_SOILS.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
                      </select>
                      {layer.main === "X" && <input className="bs-name" aria-label={`${t("layer.name", "Benaming")} ${i + 1}`} placeholder={t("layer.namePlaceholder", "bijv. puin, ophooglaag")} value={layer.name} onChange={(e) => setSoil(i, { name: e.target.value })} />}
                    </td>
                    <td>
                      {layer.main !== "X" && ([0, 1] as const).map((slot) => {
                        const adm = layer.admixtures[slot];
                        const change = (patch: Partial<typeof adm>) => {
                          const admixtures = [...layer.admixtures] as DraftLayer["admixtures"];
                          admixtures[slot] = { ...adm, ...patch };
                          setSoil(i, { admixtures });
                        };
                        return (
                          <div className="bs-adm" key={slot}>
                            <select aria-label={`${t("layer.grade", "Gradatie")} ${i + 1}.${slot + 1}`} value={adm.grade} disabled={!adm.letter} onChange={(e) => change({ grade: Number(e.target.value) })}>
                              {GRADES.map((g) => <option key={g.grade} value={g.grade}>{g.name}</option>)}
                            </select>
                            <select aria-label={`${t("layer.admixture", "Bijmenging")} ${i + 1}.${slot + 1}`} value={options.some((o) => o.letter === adm.letter) ? adm.letter : ""} onChange={(e) => change({ letter: e.target.value as AdmixtureLetter | "" })}>
                              <option value="">{t("layer.none", "geen")}</option>
                              {(options.length ? options : ADMIXTURES).map((o) => <option key={o.letter} value={o.letter}>{o.name}</option>)}
                            </select>
                          </div>
                        );
                      })}
                    </td>
                    <td><input aria-label={`${t("layer.colour", "Kleur")} ${i + 1}`} value={layer.colour} onChange={(e) => setLayer(i, { colour: e.target.value })} /></td>
                    <td><input aria-label={`${t("layer.remark", "Opmerking")} ${i + 1}`} value={layer.remark} onChange={(e) => setLayer(i, { remark: e.target.value })} /></td>
                    <td><button className="bs-remove" title={t("layer.remove", "Laag verwijderen")} aria-label={`${t("layer.remove", "Laag verwijderen")} ${i + 1}`}
                      onClick={() => setDraft((d) => ({ ...d, layers: d.layers.filter((_, j) => j !== i) }))}>×</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!draft.layers.length && <p className="bs-note">{t("editor.noLayers", "Nog geen lagen. Voeg de eerste laag toe.")}</p>}
          {problems.map((m) => <p key={m} className="bs-problem" role="alert">{m}</p>)}
          <p className="bs-note">{doc?.kind === "project"
            ? t("editor.savedWithProject", "De boring wordt met het project opgeslagen en komt als boorstaat in het rapport.")
            : t("editor.noProject", "Er is geen project open: de boring opent als los tabblad. Open of maak een project om hem te bewaren.")}</p>
        </div>
        <div className="bs-preview"><BoorstaatSvg scene={layout.scene} width="100%" label={t("sheet.title", "Boorstaat {{id}}", { id: shown.id })} /></div>
      </div>
    </Modal>
  );
}
