// Meetwaarden bewerken: het logboek van de gekozen sondering en een formulier voor een nieuwe bewerking.
// Elke bewerking gaat direct naar de sondering in het project; de grafiek erachter toont het resultaat.
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Modal from "../components/Modal";
import { useCptStore } from "../store/useCptStore";
import type { Cpt } from "../types/cpt";
import { loadProfile } from "../sondeerbedrijf/profile";
import { POINT_SNAP_M, applyEditsDetailed, opProblems, type OpProblem } from "./applyEdits";
import { channelLabel, describeEffect, kindLabel, logRows, num } from "./logbook";
import { addEdit, editLogOf, newEdit, removeEdit, resetEdits, undoLastEdit } from "./state";
import { CHANNELS, CHANNEL_UNIT, EDIT_KINDS, type Channel, type EditKind, type EditOp } from "./types";
import "./meetwaarden.css";

/** Getal uit een invoerveld; komma of punt als decimaalteken. Leeg = niet ingevuld. */
export function parseNumber(text: string): number | undefined {
  const value = text.trim().replace(",", ".");
  if (!value) return undefined;
  return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(value) ? Number(value) : NaN;
}

export interface EditForm {
  kind: EditKind;
  from: string;
  to: string;
  depth: string;
  /** "" = alle kanalen (alleen bij ongeldig maken). */
  channel: Channel | "";
  offset: string;
  value: string;
  halfWindow: string;
  threshold: string;
}
export const EMPTY_FORM: EditForm = { kind: "remove-range", from: "", to: "", depth: "", channel: "qc", offset: "", value: "", halfWindow: "5", threshold: "3" };

/** De bewerking die het formulier beschrijft; `null` zolang een verplicht veld leeg is. */
export function opFromForm(f: EditForm): EditOp | null {
  const from = parseNumber(f.from), to = parseNumber(f.to), depth = parseNumber(f.depth), offset = parseNumber(f.offset);
  const channel = f.channel || "qc";
  switch (f.kind) {
    case "remove-range": return from === undefined || to === undefined ? null : { kind: f.kind, from, to };
    case "invalidate-range": return from === undefined || to === undefined ? null : { kind: f.kind, from, to, channels: f.channel ? [f.channel] : [] };
    case "trim-top": case "trim-bottom": return depth === undefined ? null : { kind: f.kind, depth };
    case "zero-shift": return offset === undefined ? null : { kind: f.kind, channel, offset, ...(from !== undefined ? { from } : {}), ...(to !== undefined ? { to } : {}) };
    case "depth-shift": return offset === undefined ? null : { kind: f.kind, offset };
    case "set-value": return depth === undefined ? null : { kind: f.kind, depth, channel, value: parseNumber(f.value) ?? null };
    case "remove-outliers": {
      const halfWindow = parseNumber(f.halfWindow), threshold = parseNumber(f.threshold);
      return from === undefined || to === undefined || halfWindow === undefined || threshold === undefined ? null
        : { kind: f.kind, from, to, channel, halfWindow, threshold };
    }
  }
}

const PROBLEM_NL: Record<OpProblem, string> = {
  number: "Vul geldige getallen in.",
  range: "De onderkant van het traject ligt boven de bovenkant.",
  noOffset: "Een verschuiving van nul verandert niets.",
  window: "Het venster is minstens 1 punt en de drempel groter dan nul.",
  negativeDepth: "Met deze verschuiving komen meetpunten boven het maaiveld.",
};

export default function MeetwaardenDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation("meetwaarden");
  const cptsMap = useCptStore((s) => s.cpts);
  const activeCptId = useCptStore((s) => s.activeCptId);
  const author = useCptStore((s) => s.projectMeta.author);
  const replaceCpt = useCptStore((s) => s.replaceCpt);
  const cpts = useMemo(() => Array.from(cptsMap.values()), [cptsMap]);
  const [cptId, setCptId] = useState<string | null>(null);
  const [form, setForm] = useState<EditForm>(EMPTY_FORM);
  const [by, setBy] = useState("");
  const [reason, setReason] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCptId(activeCptId ?? cpts[0]?.id ?? null);
    setForm(EMPTY_FORM); setReason(""); setConfirmReset(false);
    // Wie: de opsteller van het project, anders het sondeerbedrijf; het veld blijft aanpasbaar.
    if (author.trim()) setBy(author.trim());
    else void loadProfile().then((p) => setBy((current) => current || p.name)).catch(() => undefined);
    // Alleen bij openen: de keuze en het formulier blijven staan terwijl er wordt bewerkt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const cpt: Cpt | undefined = (cptId ? cptsMap.get(cptId) : undefined) ?? cpts[0];
  const rows = useMemo(() => (cpt ? logRows(cpt) : []), [cpt]);
  const op = useMemo(() => opFromForm(form), [form]);
  const problems = useMemo(() => (op && cpt ? opProblems(op, cpt.points) : []), [op, cpt]);
  // Voorbeeld: de bewerking op de huidige (al bewerkte) reeks, zonder iets op te slaan.
  const preview = useMemo(() => (op && cpt && !problems.length ? applyEditsDetailed(cpt, [{ op }]).effects[0] : null), [op, cpt, problems]);
  const range = useMemo(() => {
    if (!cpt?.points.length) return null;
    return cpt.points.reduce((r, p) => ({ min: Math.min(r.min, p.depth), max: Math.max(r.max, p.depth) }), { min: Infinity, max: -Infinity });
  }, [cpt]);
  const nearest = useMemo(() => {
    const depth = parseNumber(form.depth);
    if (form.kind !== "set-value" || depth === undefined || !Number.isFinite(depth) || !cpt?.points.length) return null;
    const p = cpt.points.reduce((best, q) => (Math.abs(q.depth - depth) < Math.abs(best.depth - depth) ? q : best));
    return { point: p, hit: Math.abs(p.depth - depth) <= POINT_SNAP_M };
  }, [form.kind, form.depth, cpt]);

  const set = (patch: Partial<EditForm>) => setForm((f) => ({ ...f, ...patch }));
  // Een meetwaarde die al zo staat, is geen bewerking en hoort niet in het logboek.
  const unchanged = op?.kind === "set-value" && !!preview?.affected && (preview.before ?? null) === (preview.after ?? null);
  const canApply = !!cpt && !!op && !problems.length && !!preview?.affected && !unchanged && reason.trim().length > 0 && by.trim().length > 0;
  const apply = () => {
    if (!cpt || !op || !canApply) return;
    // Een losse meetwaarde krijgt de diepte van het meetpunt zelf, zodat het logboek die precies noemt.
    const exact = op.kind === "set-value" && nearest?.hit ? { ...op, depth: nearest.point.depth } : op;
    replaceCpt(addEdit(cpt, newEdit(exact, by, reason)));
    setReason(""); setConfirmReset(false);
  };

  const depthHint = range ? `${range.min.toFixed(2)} – ${range.max.toFixed(2)} m` : "";
  const field = (key: "from" | "to" | "depth" | "offset" | "value" | "halfWindow" | "threshold", label: string, placeholder = "") => (
    <label className="mw-field"><span>{label}</span>
      <input value={form[key]} placeholder={placeholder} inputMode="decimal" onChange={(e) => set({ [key]: e.target.value })} /></label>
  );
  const channelField = (options: ReadonlyArray<Channel>, withAll = false) => (
    <label className="mw-field"><span>{t("form.channel", "Kanaal")}</span>
      <select value={form.channel} onChange={(e) => set({ channel: e.target.value as Channel | "" })}>
        {withAll && <option value="">{t("channel.all", "Alle kanalen")}</option>}
        {options.map((c) => <option key={c} value={c}>{channelLabel(c)} ({CHANNEL_UNIT[c]})</option>)}
      </select></label>
  );
  const unit = CHANNEL_UNIT[form.channel || "qc"];
  const fromTo = (optional = false) => (<>
    {field("from", t("form.from", "Van diepte (m)"), optional ? t("form.optional", "hele reeks") : range?.min.toFixed(2))}
    {field("to", t("form.to", "Tot diepte (m)"), optional ? t("form.optional", "hele reeks") : range?.max.toFixed(2))}
  </>);

  const showValue = (v: number | undefined) => (v == null ? t("result.noValue", "geen waarde") : `${num(v, 4)} ${unit}`);
  const edited = cpt ? editLogOf(cpt) : null;

  return (
    <Modal open={open} onClose={onClose} title={t("title", "Meetwaarden bewerken")} width={860}
      footer={<button className="settings-btn" onClick={onClose}>{t("close", "Sluiten")}</button>}>
      <div className="mw-dialog">
        {!cpt ? <p className="mw-note">{t("noCpt", "Open eerst een sondering.")}</p> : (<>
          <div className="mw-head">
            <label className="mw-field mw-cpt"><span>{t("cpt", "Sondering")}</span>
              <select value={cpt.id} onChange={(e) => { setCptId(e.target.value); setConfirmReset(false); }}>
                {cpts.map((c) => <option key={c.id} value={c.id}>{c.id}{editLogOf(c).edits.length ? ` (${t("editedShort", "bewerkt")})` : ""}</option>)}
              </select></label>
            <p className="mw-note">
              {edited?.edits.length
                ? t("status.edited", "{{now}} meetpunten na bewerking, {{original}} in het bronbestand. Diepte {{range}}.", { now: cpt.points.length, original: edited.originalCount, range: depthHint })
                : t("status.untouched", "{{now}} meetpunten, niet bewerkt. Diepte {{range}}.", { now: cpt.points.length, range: depthHint })}
              {" "}{t("status.kept", "De oorspronkelijke meetwaarden blijven bewaard.")}
            </p>
          </div>

          <section>
            <h4>{t("log.title", "Logboek")}</h4>
            {!rows.length ? <p className="mw-note">{t("log.empty", "Nog geen bewerkingen op deze sondering.")}</p> : (
              <div className="mw-table-wrap">
                <table className="mw-table">
                  <thead><tr>
                    <th>#</th><th>{t("log.time", "Tijdstip")}</th><th>{t("log.by", "Wie")}</th><th>{t("log.what", "Bewerking")}</th>
                    <th>{t("log.result", "Resultaat")}</th><th>{t("log.reason", "Reden")}</th><th />
                  </tr></thead>
                  <tbody>{rows.map((row) => (
                    <tr key={row.edit.id}>
                      <td>{row.index}</td><td className="mw-nowrap">{row.time}</td><td>{row.edit.by}</td><td>{row.what}</td><td>{row.result}</td><td>{row.edit.reason}</td>
                      <td><button className="mw-link" title={t("log.undoOneHint", "Deze bewerking vervalt; de latere worden opnieuw toegepast")}
                        onClick={() => replaceCpt(removeEdit(cpt, row.edit.id))}>{t("log.undoOne", "Ongedaan maken")}</button></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
            {rows.length > 0 && (
              <div className="mw-actions">
                <button className="settings-btn settings-btn-secondary" onClick={() => replaceCpt(undoLastEdit(cpt))}>{t("log.undoLast", "Laatste ongedaan maken")}</button>
                <button className="settings-btn settings-btn-secondary" onClick={() => { if (confirmReset) { replaceCpt(resetEdits(cpt)); setConfirmReset(false); } else setConfirmReset(true); }}>
                  {confirmReset ? t("log.resetConfirm", "Zeker weten? Het logboek vervalt") : t("log.reset", "Alles herstellen")}</button>
              </div>
            )}
          </section>

          <section>
            <h4>{t("form.title", "Nieuwe bewerking")}</h4>
            <div className="mw-form">
              <label className="mw-field mw-kind"><span>{t("form.kind", "Soort")}</span>
                <select value={form.kind} onChange={(e) => {
                  const kind = e.target.value as EditKind;
                  // Een nulpunt van het afgeleide wrijvingsgetal bestaat niet; "alle kanalen" alleen bij ongeldig maken.
                  set({ kind, channel: kind === "invalidate-range" ? form.channel : form.channel === "" || (kind === "zero-shift" && form.channel === "rf") ? "qc" : form.channel });
                }}>
                  {EDIT_KINDS.map((k) => <option key={k} value={k}>{kindLabel(k)}</option>)}
                </select></label>
              {form.kind === "remove-range" && fromTo()}
              {form.kind === "invalidate-range" && <>{fromTo()}{channelField(CHANNELS, true)}</>}
              {(form.kind === "trim-top" || form.kind === "trim-bottom") && field("depth", form.kind === "trim-top" ? t("form.keepFrom", "Behouden vanaf diepte (m)") : t("form.keepTo", "Behouden tot diepte (m)"), depthHint)}
              {form.kind === "zero-shift" && <>{channelField(CHANNELS.filter((c) => c !== "rf"))}{field("offset", t("form.offsetValue", "Verschuiving ({{unit}})", { unit }), "+0.05")}{fromTo(true)}</>}
              {form.kind === "depth-shift" && field("offset", t("form.offsetDepth", "Verschuiving (m, positief = dieper)"), "+0.10")}
              {form.kind === "set-value" && <>{field("depth", t("form.depth", "Diepte (m)"), depthHint)}{channelField(CHANNELS)}{field("value", t("form.newValue", "Nieuwe waarde ({{unit}})", { unit }), t("form.emptyIsVoid", "leeg = geen waarde"))}</>}
              {form.kind === "remove-outliers" && <>{fromTo()}{channelField(CHANNELS)}{field("halfWindow", t("form.halfWindow", "Venster (punten per kant)"))}{field("threshold", t("form.threshold", "Drempel (× spreiding)"))}</>}
            </div>
            {form.kind === "remove-outliers" && <p className="mw-note">{t("form.outlierHint", "Een waarde is een uitschieter als zij meer dan de drempel maal de spreiding (1,4826 × MAD) afwijkt van de mediaan van haar venster. De waarde wordt ongeldig; het meetpunt blijft.")}</p>}
            {form.kind === "remove-range" && <p className="mw-note">{t("form.removeHint", "De meetpunten in het traject vervallen helemaal. Kies 'ongeldig maken' om de punten te houden en alleen waarden te wissen.")}</p>}
            <div className="mw-form mw-who">
              <label className="mw-field"><span>{t("form.by", "Wie")}</span>
                <input value={by} onChange={(e) => setBy(e.target.value)} placeholder={t("form.byPlaceholder", "Naam")} /></label>
              <label className="mw-field mw-reason"><span>{t("form.reason", "Reden (verplicht)")}</span>
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("form.reasonPlaceholder", "Waarom is deze bewerking nodig?")}
                  onKeyDown={(e) => { if (e.key === "Enter") apply(); }} /></label>
              <button className="settings-btn" disabled={!canApply} onClick={apply}>{t("form.apply", "Toepassen")}</button>
            </div>
            <div className="mw-preview" role="status">
              {problems.map((p) => <p key={p} className="mw-problem">{t(`problem.${p}`, PROBLEM_NL[p])}</p>)}
              {!op && <p className="mw-note">{t("preview.incomplete", "Vul de velden in om te zien wat de bewerking raakt.")}</p>}
              {nearest && (nearest.hit
                ? <p>{t("preview.point", "Meetpunt op {{depth}} m, huidige waarde: {{value}}.", { depth: nearest.point.depth.toFixed(2), value: showValue(nearest.point[form.channel || "qc"]) })}</p>
                : <p className="mw-problem">{t("preview.noPoint", "Geen meetpunt op deze diepte; het dichtstbijzijnde ligt op {{depth}} m.", { depth: nearest.point.depth.toFixed(2) })}</p>)}
              {unchanged && <p className="mw-problem">{t("preview.unchanged", "De meetwaarde staat al zo; er verandert niets.")}</p>}
              {op && preview && !unchanged && (preview.affected
                ? <p>{t("preview.label", "Voorbeeld")}: {op.kind === "set-value" ? describeEffect(op, preview) : t("preview.points", "raakt {{n}} van {{total}} meetpunten.", { n: preview.affected, total: cpt.points.length })}</p>
                : !nearest && <p className="mw-problem">{t("preview.none", "Deze bewerking raakt geen meetpunten.")}</p>)}
              {op && preview?.affected && !unchanged ? (!by.trim() ? <p className="mw-note">{t("preview.needBy", "Vul in wie de bewerking doet.")}</p>
                : !reason.trim() && <p className="mw-note">{t("preview.needReason", "Geef een reden om de bewerking toe te passen.")}</p>) : null}
            </div>
          </section>
        </>)}
      </div>
    </Modal>
  );
}
