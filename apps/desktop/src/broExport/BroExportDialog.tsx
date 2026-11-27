// Exportscherm BRO-XML: per sondering de aanvullende gegevens invullen, zien wat nog ontbreekt
// en het registratieverzoek opslaan. De aanvullingen worden bij de sondering in het project bewaard.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Modal from "../components/Modal";
import { useCptStore } from "../store/useCptStore";
import type { Cpt } from "../types/cpt";
import { loadProfile } from "../sondeerbedrijf/profile";
import { blocking, checkBroCpt, type BroIssue } from "./broCptCheck";
import { broCptTable } from "./broCptData";
import { BRO_CPT_SPEC, CLASSES_BY_STANDARD, CODE_LISTS, RESULT_COLUMNS, ZERO_LOAD_PAIRS, type CodeListName, type ZeroLoadKey } from "./broCptSpec";
import { SHARED_FIELDS, dutchDateTime, prefillSupplement, readSupplement, withSupplement, type BroCptSupplement, type BroRemovedLayer } from "./broCptSupplement";
import { writeBroCptXml } from "./broCptWriter";
import { saveBroFiles, type BroFile } from "./saveBroXml";
import "./broExport.css";

type Drafts = Record<string, BroCptSupplement>;
type TextField = { [K in keyof BroCptSupplement]-?: BroCptSupplement[K] extends string | undefined ? K : never }[keyof BroCptSupplement];
type NumberField = { [K in keyof BroCptSupplement]-?: BroCptSupplement[K] extends number | undefined ? K : never }[keyof BroCptSupplement];

const localToday = () => {
  const d = new Date(), two = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
};
const toNumber = (text: string): number | undefined => {
  const value = text.trim() === "" ? NaN : Number(text.replace(",", "."));
  return Number.isFinite(value) ? value : undefined;
};

export default function BroExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const cptsMap = useCptStore((s) => s.cpts);
  const replaceCpt = useCptStore((s) => s.replaceCpt);
  const cpts = useMemo(() => Array.from(cptsMap.values()), [cptsMap]);
  const [drafts, setDrafts] = useState<Drafts>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const today = useMemo(localToday, [open]);

  // Bij openen: per sondering wat al bewaard is, aangevuld met wat uit het bronbestand volgt.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setMessage(null);
    void loadProfile().catch(() => null).then((profile) => {
      if (cancelled) return;
      const list = Array.from(useCptStore.getState().cpts.values());
      const kvk = profile && /^\d{8}$/.test(profile.kvk.trim()) ? profile.kvk.trim() : undefined;
      setDrafts(Object.fromEntries(list.map((cpt) => [cpt.id, prefillSupplement(cpt, { researchOperator: kvk })])));
      setSelectedId((current) => (current && list.some((c) => c.id === current) ? current : list[0]?.id ?? null));
    });
    return () => { cancelled = true; };
  }, [open]);

  const issues = useMemo(() => {
    const out: Record<string, BroIssue[]> = {};
    for (const cpt of cpts) if (drafts[cpt.id]) out[cpt.id] = checkBroCpt(cpt, drafts[cpt.id], { today });
    return out;
  }, [cpts, drafts, today]);

  const selected = cpts.find((c) => c.id === selectedId);
  const draft = selected ? drafts[selected.id] : undefined;
  const complete = cpts.filter((c) => issues[c.id] && !blocking(issues[c.id]).length);

  /** Bewaar de aanvullingen bij de sonderingen in het project (alleen wat is gewijzigd). */
  const persist = (which: Cpt[] = cpts, from: Drafts = drafts) => {
    for (const cpt of which) {
      const next = from[cpt.id];
      if (!next) continue;
      const updated = withSupplement(cpt, next);
      if (JSON.stringify(readSupplement(updated)) !== JSON.stringify(readSupplement(cpt))) replaceCpt(updated);
    }
  };
  const close = () => { persist(); onClose(); };
  const update = (patch: Partial<BroCptSupplement>) => {
    if (!selected) return;
    setMessage(null);
    setDrafts((all) => ({ ...all, [selected.id]: { ...all[selected.id], ...patch } }));
  };
  const copyToAll = () => {
    if (!draft) return;
    const shared = Object.fromEntries(SHARED_FIELDS.map((key) => [key, draft[key]]));
    const next = Object.fromEntries(cpts.map((c) => [c.id, { ...drafts[c.id], ...shared }]));
    setDrafts(next);
    persist(cpts, next);
    setMessage({ text: `Algemene gegevens overgenomen voor ${cpts.length} sondering${cpts.length === 1 ? "" : "en"}.` });
  };
  const exportFiles = async (which: Cpt[]) => {
    setBusy(true); setMessage(null);
    try {
      persist();
      const ready = which.filter((c) => issues[c.id] && !blocking(issues[c.id]).length);
      const skipped = which.filter((c) => !ready.includes(c)).map((c) => c.id);
      if (!ready.length) { setMessage({ text: "Niets opgeslagen: de verplichte gegevens zijn nog niet volledig. Zie de lijst per sondering.", error: true }); return; }
      const files: BroFile[] = ready.map((c) => { const out = writeBroCptXml(c, drafts[c.id], { today }); return { filename: out.filename, xml: out.xml }; });
      const saved = await saveBroFiles(files);
      if (!saved) return;
      const done = `${saved} BRO-XML-bestand${saved === 1 ? "" : "en"} opgeslagen.`;
      setMessage(skipped.length ? { text: `${done} Niet volledig en daarom overgeslagen: ${skipped.join(", ")}.`, error: true } : { text: `${done} Aanleveren bij de BRO doe je zelf.` });
    } catch (e) { setMessage({ text: e instanceof Error ? e.message : String(e), error: true }); }
    finally { setBusy(false); }
  };

  const fieldIssues = (field: string) => (selected ? (issues[selected.id] ?? []).filter((i) => i.field === field && i.severity === "error") : []);
  const wrap = (field: string, label: string, control: ReactNode, hint?: string) => (
    <label className={`bx-field${fieldIssues(field).length ? " bx-invalid" : ""}`}>
      <span>{label}</span>{control}{hint && <small>{hint}</small>}
      {fieldIssues(field).map((i, n) => <small key={n} className="bx-error">{i.message}</small>)}
    </label>
  );
  const textField = (field: TextField, label: string, placeholder = "") =>
    wrap(field, label, <input value={draft?.[field] ?? ""} placeholder={placeholder} maxLength={200} onChange={(e) => update({ [field]: e.target.value })} />);
  const dateField = (field: TextField, label: string) =>
    wrap(field, label, <input type="date" max={today} value={draft?.[field] ?? ""} onChange={(e) => update({ [field]: e.target.value || undefined })} />);
  const numberField = (field: NumberField, label: string, hint?: string) =>
    wrap(field, label, <input type="number" step="any" value={draft?.[field] ?? ""} onChange={(e) => update({ [field]: toNumber(e.target.value) })} />, hint);
  const select = (field: TextField, label: string, options: readonly { value: string; label: string }[]) => {
    const value = draft?.[field] ?? "", known = options.some((o) => o.value === value);
    return wrap(field, label, (
      <select value={value} onChange={(e) => update({ [field]: e.target.value || undefined })}>
        <option value="">– kies –</option>
        {!known && value && <option value={value}>{value} (niet toegestaan onder IMBRO)</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    ));
  };
  const codeField = (field: TextField & CodeListName, label: string) => select(field, label, CODE_LISTS[field]);
  const yesNo = (field: TextField, label: string) => select(field, label, [{ value: "ja", label: "Ja" }, { value: "nee", label: "Nee" }]);

  const zero = draft?.zeroLoad ?? {};
  const setZero = (key: ZeroLoadKey, text: string) => {
    const next = { ...zero, [key]: toNumber(text) };
    if (next[key] === undefined) delete next[key];
    update({ zeroLoad: Object.keys(next).length ? next : undefined });
  };
  const layers = draft?.removedLayers ?? [];
  const setLayer = (index: number, patch: Partial<BroRemovedLayer>) => update({ removedLayers: layers.map((l, i) => (i === index ? { ...l, ...patch } : l)) });
  const table = useMemo(() => (selected ? broCptTable(selected) : undefined), [selected]);
  const selectedIssues = selected ? issues[selected.id] ?? [] : [];
  const errors = blocking(selectedIssues), warnings = selectedIssues.filter((i) => i.severity === "warning");
  const classes = CODE_LISTS.qualityClass.filter((o) => !draft?.cptStandard || !CLASSES_BY_STANDARD[draft.cptStandard] || CLASSES_BY_STANDARD[draft.cptStandard].includes(o.value));

  // Het lint knipt zijn inhoud af; het scherm hoort daarom rechtstreeks onder de pagina.
  return createPortal(
    <Modal open={open} onClose={close} title="BRO-XML exporteren" width={940} height="86vh"
      footer={<>
        {message && <span className={`bx-message${message.error ? " bx-error" : ""}`} role={message.error ? "alert" : "status"}>{message.text}</span>}
        <button className="settings-btn settings-btn-secondary" onClick={close}>Sluiten</button>
        <button className="settings-btn settings-btn-secondary" disabled={busy || !selected || errors.length > 0} onClick={() => selected && void exportFiles([selected])}>Deze opslaan</button>
        <button className="settings-btn settings-btn-primary" disabled={busy || !complete.length} onClick={() => void exportFiles(cpts)}>
          Alle opslaan ({complete.length} van {cpts.length})
        </button>
      </>}>
      <div className="bx-dialog">
        <aside className="bx-list" aria-label="Sonderingen">
          {cpts.map((cpt) => {
            const missing = issues[cpt.id] ? blocking(issues[cpt.id]).length : undefined;
            return (
              <button key={cpt.id} className={`bx-item${cpt.id === selectedId ? " active" : ""}`} onClick={() => { persist(); setSelectedId(cpt.id); }}>
                <span className="bx-item-name">{cpt.id}</span>
                <span className={`bx-item-state${missing ? " bx-error" : ""}`}>{missing === undefined ? "…" : missing ? `${missing} ontbreekt` : "volledig"}</span>
              </button>
            );
          })}
        </aside>
        {selected && draft ? (
          <div className="bx-form" onBlur={() => persist([selected])}>
            <p className="bx-intro">
              Registratieverzoek voor de Basisregistratie Ondergrond, kwaliteitsregime {BRO_CPT_SPEC.qualityRegime}. Wat het bronbestand al gaf, is ingevuld; controleer alles.
              De gegevens blijven bij de sondering in het project bewaard.
            </p>
            <section className={`bx-problems${errors.length ? "" : " bx-ok"}`} aria-live="polite">
              <h3>{errors.length ? `Nog aan te vullen of te herstellen (${errors.length})` : "Alle verplichte gegevens zijn volledig"}</h3>
              {errors.length > 0 && <ul>{errors.map((i, n) => <li key={n}>{i.message}</li>)}</ul>}
              {warnings.length > 0 && <ul className="bx-warnings">{warnings.map((i, n) => <li key={n}>Let op: {i.message}</li>)}</ul>}
            </section>

            <h3>Verzoek en onderzoek</h3>
            <div className="bx-grid">
              {textField("requestReference", "Kenmerk van het verzoek")}
              {textField("objectIdAccountableParty", "Object-ID bronhouder")}
              {textField("deliveryAccountableParty", "KvK-nummer bronhouder", "8 cijfers")}
              {textField("researchOperator", "KvK-nummer uitvoerder (optioneel)", "8 cijfers")}
              {codeField("deliveryContext", "Kader aanlevering")}
              {codeField("surveyPurpose", "Kader inwinning")}
              {codeField("cptStandard", "Sondeernorm")}
              {select("qualityClass", "Kwaliteitsklasse", classes)}
              {dateField("researchReportDate", "Rapportagedatum onderzoek")}
              {dateField("finalProcessingDate", "Datum laatste bewerking")}
            </div>

            <h3>Locatie en hoogte</h3>
            <div className={`bx-readonly${fieldIssues("position").length || fieldIssues("offset").length ? " bx-invalid" : ""}`}>
              RD (EPSG:28992): {selected.position ? `${selected.position.x_rd}; ${selected.position.y_rd}` : "ontbreekt"} · hoogte:{" "}
              {selected.position?.z_nap ?? selected.metadata.ground_level_nap ?? "ontbreekt"}{(selected.position?.z_nap ?? selected.metadata.ground_level_nap) != null ? " m NAP" : ""}
              <small> Aanvullen kan met Coördinaten inlezen in het lint.</small>
            </div>
            <div className="bx-grid">
              {dateField("horizontalPositioningDate", "Datum locatiebepaling")}
              {codeField("horizontalPositioningMethod", "Methode locatiebepaling")}
              {dateField("verticalPositioningDate", "Datum verticale positiebepaling")}
              {codeField("verticalPositioningMethod", "Methode verticale positiebepaling")}
              {codeField("localVerticalReferencePoint", "Lokaal verticaal referentiepunt")}
              {draft.localVerticalReferencePoint === "waterbodem" && numberField("waterDepth", "Waterdiepte (m)")}
              {textField("horizontalPositioningOperator", "KvK uitvoerder locatiebepaling (optioneel)", "8 cijfers")}
              {textField("verticalPositioningOperator", "KvK uitvoerder hoogtebepaling (optioneel)", "8 cijfers")}
            </div>

            <h3>Sondeonderzoek</h3>
            <div className="bx-grid">
              {wrap("startTime", "Starttijd van de meting", (
                <input type="datetime-local" step={1} value={draft.startTime?.slice(0, 19) ?? ""}
                  onChange={(e) => update({ startTime: e.target.value ? dutchDateTime(e.target.value.slice(0, 10), e.target.value.slice(11)) : undefined })} />
              ), draft.startTime ? `Wordt geschreven als ${draft.startTime}` : "Nederlandse tijd")}
              {codeField("cptMethod", "Sondeermethode")}
              {codeField("stopCriterion", "Stopcriterium")}
              {numberField("predrilledDepth", "Voorgeboord tot (m)", "0 als er niet is voorgeboord")}
              {numberField("sensorAzimuth", "Sensorazimuth (°, optioneel)")}
              {yesNo("interruptionProcessingPerformed", "Bewerking onderbrekingen uitgevoerd")}
              {yesNo("expertCorrectionPerformed", "Expertcorrectie uitgevoerd")}
              {yesNo("signalProcessingPerformed", "Signaalbewerking uitgevoerd")}
            </div>

            <h3>Sondeerapparaat</h3>
            <div className="bx-grid">
              {textField("coneDescription", "Omschrijving sondeerapparaat", "bijv. rups 20 ton")}
              {textField("conePenetrometerType", "Conustype")}
              {numberField("coneSurfaceArea", "Oppervlakte conuspunt (mm²)")}
              {numberField("coneDiameter", "Conusdiameter (mm, optioneel)")}
              {numberField("coneSurfaceQuotient", "Oppervlaktequotiënt conuspunt (optioneel)")}
              {numberField("coneToFrictionSleeveDistance", "Afstand conus tot midden kleefmantel (mm)")}
              {numberField("frictionSleeveSurfaceArea", "Oppervlakte kleefmantel (mm²)")}
              {numberField("frictionSleeveSurfaceQuotient", "Oppervlaktequotiënt kleefmantel")}
            </div>

            <h3>Nulmeting</h3>
            <table className={`bx-table${fieldIssues("zeroLoad").length ? " bx-invalid" : ""}`}>
              <thead><tr><th>Grootheid</th><th>Vooraf</th><th>Achteraf</th></tr></thead>
              <tbody>
                {ZERO_LOAD_PAIRS.map((pair) => (
                  <tr key={pair.name}>
                    <td>{pair.label} ({pair.unit === "deg" ? "°" : pair.unit})</td>
                    {(["Before", "After"] as const).map((moment) => (
                      <td key={moment}><input type="number" step="any" aria-label={`${pair.label} ${moment === "Before" ? "vooraf" : "achteraf"}`}
                        value={zero[`${pair.name}${moment}`] ?? ""} onChange={(e) => setZero(`${pair.name}${moment}`, e.target.value)} /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            <h3>Aanvullend onderzoek</h3>
            <div className="bx-grid">
              {yesNo("additionalInvestigationPerformed", "Aanvullend onderzoek uitgevoerd")}
              {draft.additionalInvestigationPerformed === "ja" && <>
                {dateField("investigationDate", "Datum aanvullend onderzoek")}
                {textField("conditions", "Omstandigheden (optioneel)")}
                {textField("surfaceDescription", "Hoedanigheid oppervlakte (optioneel)")}
                {numberField("groundwaterLevel", "Grondwaterstand (m, optioneel)")}
              </>}
            </div>
            {draft.additionalInvestigationPerformed === "ja" && (
              <table className={`bx-table${fieldIssues("removedLayers").length ? " bx-invalid" : ""}`}>
                <thead><tr><th>Verwijderde laag</th><th>Van (m)</th><th>Tot (m)</th><th>Beschrijving</th><th /></tr></thead>
                <tbody>
                  {layers.map((layer, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td><input type="number" step="any" aria-label={`Bovengrens laag ${i + 1}`} value={Number.isFinite(layer.upperBoundary) ? layer.upperBoundary : ""} onChange={(e) => setLayer(i, { upperBoundary: toNumber(e.target.value) ?? NaN })} /></td>
                      <td><input type="number" step="any" aria-label={`Ondergrens laag ${i + 1}`} value={Number.isFinite(layer.lowerBoundary) ? layer.lowerBoundary : ""} onChange={(e) => setLayer(i, { lowerBoundary: toNumber(e.target.value) ?? NaN })} /></td>
                      <td><input aria-label={`Beschrijving laag ${i + 1}`} maxLength={200} value={layer.description} onChange={(e) => setLayer(i, { description: e.target.value })} /></td>
                      <td><button className="bx-link" onClick={() => update({ removedLayers: layers.length > 1 ? layers.filter((_, n) => n !== i) : undefined })}>Verwijderen</button></td>
                    </tr>
                  ))}
                  <tr><td colSpan={5}><button className="bx-link" onClick={() => update({ removedLayers: [...layers, { upperBoundary: layers.length ? layers[layers.length - 1].lowerBoundary : 0, lowerBoundary: NaN, description: "" }] })}>Laag toevoegen</button></td></tr>
                </tbody>
              </table>
            )}

            <h3>Meetreeks</h3>
            <p className="bx-intro">
              {selected.points.length} meetpunten. Bepaalde parameters: {table ? RESULT_COLUMNS.filter((_, i) => table.determined[i]).map((c) => c.label).join(", ") || "geen" : ""}.
              Ontbrekende waarden worden als -999999 geschreven. Dissipatietests worden niet weggeschreven.
            </p>
            <label className="bx-check">
              <input type="checkbox" checked={!!draft.voidOutOfRange} onChange={(e) => update({ voidOutOfRange: e.target.checked || undefined })} />
              Meetwaarden buiten het waardebereik van de BRO als "geen waarde" wegschrijven
            </label>
            <div className="bx-actions">
              <button className="settings-btn settings-btn-secondary" disabled={cpts.length < 2} onClick={copyToAll}
                title="Bronhouder, kaders, norm en klasse, datums, methoden van plaatsbepaling, sondeermethode en bewerking">Algemene gegevens overnemen voor alle sonderingen</button>
            </div>
            <p className="bx-note">Geschreven volgens {BRO_CPT_SPEC.messageSchema} en de {BRO_CPT_SPEC.catalogue}.</p>
          </div>
        ) : <div className="bx-form"><p className="bx-intro">{cpts.length ? "Bezig met laden…" : "Open eerst een of meer sonderingen."}</p></div>}
      </div>
    </Modal>,
    document.body,
  );
}
