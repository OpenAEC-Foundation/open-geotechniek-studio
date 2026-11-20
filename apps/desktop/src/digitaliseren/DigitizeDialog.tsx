// Bestaande sondering digitaliseren: links de onderlegger met ijkpunten en aangeklikte punten, rechts
// de stappen (onderlegger, ijken, punten, gegevens, opslaan).
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import Modal from "../components/Modal";
import ImageCropDialog from "../components/panels/ImageCropDialog";
import PdfCropDialog from "../components/panels/PdfCropDialog";
import { useCptStore } from "../store/useCptStore";
import { calibrationGrid, calibrationProblem, solveCalibration, type CalibrationProblem, type Px } from "./calibration";
import { buildDigitizedCpt, digitizedImageOf, digitizedOf, readingsOf, recordProblems, type RecordProblem } from "./record";
import { buildPoints, DEFAULT_STEP, type SecondKind } from "./series";
import Stage, { type Marker, type StageImage } from "./Stage";
import { OPEN_DIGITIZER_EVENT, saveDigitizedCpt } from "./store";
import { calibrationOf, emptyHeader, emptyWork, fromRecord, previewLine, toRecord, type AxisWork, type Header, type SeriesId, type Work } from "./work";
import "./digitaliseren.css";

/** Eén exemplaar van het scherm voor de hele app; het lint opent het. */
export function DigitizeHost() {
  const [target, setTarget] = useState<{ cptId?: string; key: number } | null>(null);
  useEffect(() => {
    const show = (e: Event) => setTarget({ cptId: (e as CustomEvent<{ cptId?: string }>).detail?.cptId, key: Date.now() });
    window.addEventListener(OPEN_DIGITIZER_EVENT, show);
    return () => window.removeEventListener(OPEN_DIGITIZER_EVENT, show);
  }, []);
  return target ? <DigitizeDialog key={target.key} cptId={target.cptId} onClose={() => setTarget(null)} /> : null;
}

const STEPS = ["underlay", "calibrate", "points", "details", "save"] as const;
type StepId = (typeof STEPS)[number];
type Target = "d:a" | "d:b" | "v:a" | "v:b";
const TARGETS: Target[] = ["d:a", "d:b", "v:a", "v:b"];
interface Underlay extends StageImage { name: string }

/** Langste zijde van de bewaarde onderlegger; groter wordt verkleind zodat het project klein blijft. */
const MAX_IMAGE_SIDE = 2400;

/** Zet de gekozen pagina of afbeelding om naar een JPEG van beperkte grootte; de punten staan in die pixels. */
function prepareImage(dataUrl: string): Promise<StageImage> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const width = Math.round(img.naturalWidth * scale), height = Math.round(img.naturalHeight * scale);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve({ src: canvas.toDataURL("image/jpeg", 0.85), width, height });
      } catch { resolve({ src: dataUrl, width: img.naturalWidth, height: img.naturalHeight }); }
    };
    img.onerror = () => reject(new Error("image"));
    img.src = dataUrl;
  });
}

const path = (points: Px[]) => points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join("");

export function DigitizeDialog({ cptId, onClose }: { cptId?: string; onClose: () => void }) {
  const { t } = useTranslation("digitaliseren");
  const tr = useCallback((key: string, nl: string, vars?: Record<string, unknown>) => t(key, nl, vars) as string, [t]);
  const documents = useCptStore((s) => s.documents);
  const activeDocId = useCptStore((s) => s.activeDocId);
  const cpts = useCptStore((s) => s.cpts);
  const activeCptId = useCptStore((s) => s.activeCptId);
  const doc = documents.find((d) => d.id === activeDocId);
  const inProject = doc?.kind === "project";

  // De sondering die wordt bijgewerkt; `null` bij een nieuwe.
  const [editId, setEditId] = useState<string | null>(() => (cptId && digitizedOf(cpts.get(cptId)) ? cptId : null));
  const initial = useMemo(() => {
    const cpt = editId ? cpts.get(editId) : undefined, record = digitizedOf(cpt);
    return record ? { ...fromRecord(record), image: { src: digitizedImageOf(cpt), width: record.image.width, height: record.image.height, name: record.image.name } as Underlay } : null;
    // Alleen bij het openen of het kiezen van een sondering om bij te werken.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  const [work, setWorkState] = useState<Work>(() => initial?.work ?? emptyWork());
  // De actuele werktoestand, ook tussen twee tekenbeurten in (slepen geeft veel wijzigingen achter elkaar).
  const workRef = useRef(work);
  const setWork = useCallback((next: Work) => { workRef.current = next; setWorkState(next); }, []);
  const [header, setHeader] = useState<Header>(() => initial?.header ?? emptyHeader());
  const [image, setImage] = useState<Underlay | null>(() => initial?.image ?? null);
  const [step, setStep] = useState<StepId>(() => (initial ? "points" : "underlay"));
  const [series, setSeries] = useState<SeriesId>("qc");
  const [target, setTarget] = useState<Target | null>("d:a");
  const [pending, setPending] = useState<{ kind: "pdf" | "image"; url: string; name: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const history = useRef<Work[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const dirty = useRef(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const loadExisting = (id: string) => {
    const cpt = cpts.get(id), record = digitizedOf(cpt);
    if (!record) return;
    const loaded = fromRecord(record);
    setEditId(id); setWork(loaded.work); setHeader(loaded.header);
    setImage({ src: digitizedImageOf(cpt), width: record.image.width, height: record.image.height, name: record.image.name });
    history.current = []; setUndoCount(0); dirty.current = false; setStep("points");
  };

  /** Wijziging die met ongedaan maken terugkomt. */
  const snapshot = useCallback(() => {
    history.current.push(workRef.current);
    if (history.current.length > 200) history.current.shift();
    setUndoCount((n) => n + 1); dirty.current = true;
  }, []);
  const change = useCallback((fn: (w: Work) => Work) => { snapshot(); setWork(fn(workRef.current)); }, [snapshot, setWork]);
  /** Wijziging zonder eigen stap in de geschiedenis: typen in een veld of het vervolg van een sleepbeweging. */
  const adjust = useCallback((fn: (w: Work) => Work) => { dirty.current = true; setWork(fn(workRef.current)); }, [setWork]);
  const undo = useCallback(() => {
    const previous = history.current.pop();
    if (previous) { setWork(previous); setUndoCount((n) => n + 1); }
  }, [setWork]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !(el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) { e.preventDefault(); undo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo]);

  const close = () => {
    // De bijsnijder vangt Esc zelf af; dit scherm blijft dan open.
    if (pending) return;
    if (dirty.current && !window.confirm(tr("footer.confirmClose", "De aangeklikte punten zijn nog niet opgeslagen. Scherm toch sluiten?"))) return;
    onClose();
  };

  // ── Onderlegger kiezen ──
  const pick = (file: File | undefined) => {
    if (!file) return;
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    setMessage(null);
    setPending({ kind: isPdf ? "pdf" : "image", url: URL.createObjectURL(file), name: file.name });
  };
  const endPick = () => { if (pending) URL.revokeObjectURL(pending.url); setPending(null); if (fileRef.current) fileRef.current.value = ""; };
  const confirmPick = (dataUrl: string) => {
    const name = pending?.name ?? "";
    endPick();
    prepareImage(dataUrl).then((img) => { setImage({ ...img, name }); dirty.current = true; setStep("calibrate"); })
      .catch(() => setMessage(tr("underlay.failed", "De afbeelding kan niet worden gelezen.")));
  };

  // ── Afgeleid: ijking, raster, lijnen ──
  const secondOn = work.secondKind !== "none";
  const activeSeries: SeriesId = secondOn ? series : "qc";
  const calibration = useMemo(() => calibrationOf(work, activeSeries), [work, activeSeries]);
  const affine = useMemo(() => solveCalibration(calibration), [calibration]);
  const problem = calibrationProblem(calibration);
  const grid = useMemo(() => (affine && image ? calibrationGrid(affine, calibration, image.width, image.height) : null), [affine, calibration, image]);
  const lines = {
    qc: previewLine(work, "qc", header.interpolation),
    second: secondOn ? previewLine(work, "second", header.interpolation) : null,
  };
  const record = useMemo(() => toRecord(work, header, { name: image?.name ?? "", width: image?.width ?? 0, height: image?.height ?? 0 }), [work, header, image]);
  const problems = useMemo(() => recordProblems(record), [record]);
  const idTaken = inProject && !!record.id && record.id !== editId && cpts.has(record.id);
  const result = useMemo(() => {
    const read = readingsOf(record);
    const qc = read.qc.readings;
    // Staat de as in diepte onder maaiveld, dan is de reeks al te tonen voordat het maaiveld is ingevuld.
    const ground = Number.isFinite(record.groundLevelNap) ? record.groundLevelNap : record.depthMode === "depth" ? 0 : NaN;
    const points = qc.length >= 2 && record.step > 0 && Number.isFinite(ground)
      ? buildPoints({ qc, step: record.step, interpolation: record.interpolation, groundLevelNap: ground, second: record.second && read.second ? { kind: record.second.kind, readings: read.second.readings } : undefined })
      : [];
    return { read, points };
  }, [record]);

  // ── Punten zetten, slepen en verwijderen ──
  const sharedDepth = activeSeries === "second" && work.shareDepth;
  const setAxis = (kind: "depth" | "value", patch: Partial<AxisWork>, undoable = true) => {
    const apply = (w: Work): Work => {
      const owner: SeriesId = kind === "depth" && sharedDepth ? "qc" : activeSeries;
      return { ...w, [owner]: { ...w[owner], [kind]: { ...w[owner][kind], ...patch } } };
    };
    if (undoable) change(apply); else adjust(apply);
  };
  const place = (p: Px, onMarker?: string) => {
    if (step === "calibrate" && target) {
      const [axis, end] = target.split(":") as ["d" | "v", "a" | "b"];
      if (axis === "d" && sharedDepth) return;
      setAxis(axis === "d" ? "depth" : "value", { [end]: p });
      // Door naar het volgende ijkpunt dat nog ontbreekt.
      const s = work[activeSeries], depth = sharedDepth ? work.qc.depth : s.depth;
      const filled: Record<Target, boolean> = { "d:a": !!depth.a, "d:b": !!depth.b, "v:a": !!s.value.a, "v:b": !!s.value.b, [target]: true } as Record<Target, boolean>;
      setTarget(TARGETS.find((x) => !filled[x] && !(x.startsWith("d") && sharedDepth)) ?? null);
    } else if (step === "points" && !onMarker) {
      change((w) => ({ ...w, [activeSeries]: { ...w[activeSeries], points: [...w[activeSeries].points, p] } }));
    }
  };
  const moveMarker = (id: string, p: Px) => {
    const [s, kind, key] = id.split(":") as [SeriesId, "d" | "v" | "p", string];
    const apply = (w: Work): Work => kind === "p"
      ? { ...w, [s]: { ...w[s], points: w[s].points.map((q, i) => (i === Number(key) ? p : q)) } }
      : { ...w, [s]: { ...w[s], [kind === "d" ? "depth" : "value"]: { ...w[s][kind === "d" ? "depth" : "value"], [key]: p } } };
    adjust(apply);
  };
  const removeMarker = (id: string) => {
    const [s, kind, key] = id.split(":") as [SeriesId, string, string];
    if (kind === "p") change((w) => ({ ...w, [s]: { ...w[s], points: w[s].points.filter((_, i) => i !== Number(key)) } }));
  };

  const markers: Marker[] = [];
  if (image) {
    const s = work[activeSeries], depthOwner: SeriesId = sharedDepth ? "qc" : activeSeries, depth = work[depthOwner].depth;
    const refs: Array<[Target, Px | null, SeriesId, string]> = [
      ["d:a", depth.a, depthOwner, tr("marker.depth1", "diepte 1")], ["d:b", depth.b, depthOwner, tr("marker.depth2", "diepte 2")],
      ["v:a", s.value.a, activeSeries, tr("marker.value1", "waarde 1")], ["v:b", s.value.b, activeSeries, tr("marker.value2", "waarde 2")],
    ];
    for (const [id, p, owner, label] of refs) if (p) markers.push({ id: `${owner}:${id}`, x: p.x, y: p.y, tone: id.startsWith("d") ? "depth" : "value", label: step === "calibrate" ? label : undefined,
      active: step === "calibrate" && target === id, locked: step !== "calibrate" || (id.startsWith("d") && sharedDepth) });
    if (step !== "calibrate" && step !== "underlay") s.points.forEach((p, i) => markers.push({ id: `${activeSeries}:p:${i}`, x: p.x, y: p.y, tone: "point", locked: step !== "points" }));
  }

  // ── Opslaan ──
  const canSave = !!image && !problems.length && !idTaken;
  const save = () => {
    if (!canSave) return;
    saveDigitizedCpt(buildDigitizedCpt(record, image?.src), editId ?? undefined);
    onClose();
  };

  const problemText = (p: RecordProblem): string => {
    const cal = (c: CalibrationProblem) => ({
      depthPoints: tr("problem.depthPoints", "klik twee punten op de diepte-as, niet op dezelfde plek"),
      valuePoints: tr("problem.valuePoints", "klik twee punten op de waarde-as, niet op dezelfde plek"),
      depthValues: tr("problem.depthValues", "vul bij de diepte-as twee verschillende waarden in"),
      valueValues: tr("problem.valueValues", "vul bij de waarde-as twee verschillende waarden in"),
      parallel: tr("problem.parallel", "de diepte-as en de waarde-as lopen bijna evenwijdig; klik de punten op de twee assen"),
    })[c];
    switch (p.kind) {
      case "qcCalibration": return tr("problem.qcCalibration", "IJking qc: {{what}}.", { what: cal(p.problem) });
      case "secondCalibration": return tr("problem.secondCalibration", "IJking tweede reeks: {{what}}.", { what: cal(p.problem) });
      case "qcPoints": return tr("problem.qcPoints", "Klik minstens twee punten op de qc-lijn.");
      case "secondPoints": return tr("problem.secondPoints", "Klik minstens twee punten op de lijn van de tweede reeks, of zet die reeks uit.");
      case "id": return tr("problem.id", "Vul de naam of het nummer van de sondering in.");
      case "origin": return tr("problem.origin", "Vul de herkomst in; die is verplicht.");
      case "groundLevel": return tr("problem.groundLevel", "Vul de maaiveldhoogte in m NAP in.");
      case "position": return tr("problem.position", "Vul beide RD-coördinaten in, of geen van beide.");
      case "step": return tr("problem.step", "De stap moet tussen 0,005 en 1 m liggen.");
      default: return tr("problem.noSeries", "De punten liggen dichter bij elkaar dan de stap; er ontstaat geen meetreeks.");
    }
  };

  const stepIndex = STEPS.indexOf(step);
  const stepTitles: Record<StepId, string> = {
    underlay: tr("step.underlay", "Onderlegger"), calibrate: tr("step.calibrate", "IJken"), points: tr("step.points", "Punten"),
    details: tr("step.details", "Gegevens"), save: tr("step.save", "Opslaan"),
  };
  const secondLabel = work.secondKind === "rf" ? "Rf" : "fs";
  const valueUnit = activeSeries === "qc" || work.secondKind === "fs" ? "MPa" : "%";
  // Bij de ijkpunten kort: de keuzelijst erboven zegt al of het om diepte of NAP gaat.
  const depthUnit = header.depthMode === "nap" ? tr("unit.nap", "m NAP") : "m";
  const s = work[activeSeries], shownDepth = sharedDepth ? work.qc.depth : s.depth;
  const setHead = (patch: Partial<Header>) => { setHeader((h) => ({ ...h, ...patch })); dirty.current = true; };
  const candidate = !editId && activeCptId && digitizedOf(cpts.get(activeCptId)) ? activeCptId : null;

  const seriesSwitch = (
    <div className="dig-row">
      <label className="dig-field"><span>{tr("second.label", "Tweede reeks")}</span>
        <select value={work.secondKind} onChange={(e) => { const kind = e.target.value as "none" | SecondKind; change((w) => ({ ...w, secondKind: kind })); if (kind === "none") setSeries("qc"); }}>
          <option value="none">{tr("second.none", "geen (alleen qc)")}</option>
          <option value="fs">{tr("second.fs", "plaatselijke wrijving fs (MPa)")}</option>
          <option value="rf">{tr("second.rf", "wrijvingsgetal Rf (%)")}</option>
        </select></label>
      {secondOn && (
        <div className="dig-toggle" role="group" aria-label={tr("series.choose", "Reeks kiezen")}>
          <button type="button" className={activeSeries === "qc" ? "active" : ""} onClick={() => { setSeries("qc"); setTarget(null); }}>qc</button>
          <button type="button" className={activeSeries === "second" ? "active" : ""} onClick={() => { setSeries("second"); setTarget(null); }}>{secondLabel}</button>
        </div>
      )}
    </div>
  );

  const refRow = (id: Target, label: string, axis: AxisWork, kind: "depth" | "value", end: "a" | "b", unit: string, disabled: boolean) => (
    <div className={`dig-ref${target === id ? " active" : ""}`}>
      <button type="button" className="dig-btn" disabled={disabled || !image} onClick={() => setTarget(id)} title={tr("calibrate.pickHint", "Klik daarna het punt aan op de onderlegger")}>
        {axis[end] ? tr("calibrate.repick", "{{label}} opnieuw", { label }) : tr("calibrate.pick", "{{label}} aanklikken", { label })}
      </button>
      <input aria-label={tr("calibrate.valueOf", "Waarde bij {{label}}", { label })} inputMode="decimal" disabled={disabled} value={end === "a" ? axis.va : axis.vb}
        onChange={(e) => setAxis(kind, end === "a" ? { va: e.target.value } : { vb: e.target.value }, false)} />
      <span className="dig-unit">{unit}</span>
      <span className={`dig-state${axis[end] ? " ok" : ""}`}>{axis[end] ? "✓" : "…"}</span>
    </div>
  );

  const body: Record<StepId, ReactNode> = {
    underlay: (
      <>
        <p className="dig-hint">{tr("underlay.hint", "Kies de PDF of de afbeelding (PNG of JPEG) met de sondeergrafiek. Bij een PDF kies je de pagina; snijd daarna bij tot de grafiek met beide assen.")}</p>
        <input ref={fileRef} type="file" hidden accept=".pdf,application/pdf,image/png,image/jpeg" data-testid="dig-file" onChange={(e) => pick(e.target.files?.[0])} />
        <button type="button" className="dig-btn dig-btn-primary" onClick={() => fileRef.current?.click()}>
          {image ? tr("underlay.replace", "Andere onderlegger kiezen…") : tr("underlay.choose", "PDF of afbeelding kiezen…")}</button>
        {image && <p className="dig-note">{tr("underlay.loaded", "{{name}} ({{w}} × {{h}} px)", { name: image.name || tr("underlay.unnamed", "onderlegger"), w: image.width, h: image.height })}</p>}
        {image && !image.src && <p className="dig-warning">{tr("underlay.missing", "De onderlegger is niet bij deze sondering bewaard. De punten staan op hun plek; kies dezelfde afbeelding opnieuw om ze op de scan te zien.")}</p>}
        {candidate && <button type="button" className="dig-btn" onClick={() => loadExisting(candidate)}>{tr("underlay.reopen", "Sondering {{id}} bijwerken", { id: candidate })}</button>}
        <p className="dig-note">{tr("underlay.navigate", "Muiswiel: in- en uitzoomen. Slepen: verschuiven.")}</p>
      </>
    ),
    calibrate: (
      <>
        <p className="dig-hint">{tr("calibrate.hint", "Klik twee punten op de diepte-as en twee op de waarde-as, zo ver mogelijk uit elkaar, en vul bij elk punt de waarde in. De assen worden los van elkaar geijkt, dus een scheve scan is geen bezwaar.")}</p>
        {seriesSwitch}
        <label className="dig-field"><span>{tr("calibrate.depthMode", "Diepte-as in")}</span>
          <select value={header.depthMode} onChange={(e) => setHead({ depthMode: e.target.value as Header["depthMode"] })}>
            <option value="depth">{tr("unit.depth", "m onder maaiveld")}</option>
            <option value="nap">{tr("unit.nap", "m NAP")}</option>
          </select></label>
        <h4>{tr("calibrate.depthAxis", "Diepte-as")}</h4>
        {activeSeries === "second" && (
          <label className="dig-check"><input type="checkbox" checked={work.shareDepth} onChange={(e) => change((w) => ({ ...w, shareDepth: e.target.checked }))} />
            {tr("calibrate.shareDepth", "Zelfde diepte-as als qc")}</label>
        )}
        {refRow("d:a", tr("marker.depth1", "diepte 1"), shownDepth, "depth", "a", depthUnit, sharedDepth)}
        {refRow("d:b", tr("marker.depth2", "diepte 2"), shownDepth, "depth", "b", depthUnit, sharedDepth)}
        <h4>{tr("calibrate.valueAxis", "Waarde-as {{name}}", { name: activeSeries === "qc" ? "qc" : secondLabel })}</h4>
        {refRow("v:a", tr("marker.value1", "waarde 1"), s.value, "value", "a", valueUnit, false)}
        {refRow("v:b", tr("marker.value2", "waarde 2"), s.value, "value", "b", valueUnit, false)}
        {problem
          ? <p className="dig-note">{problemText({ kind: activeSeries === "qc" ? "qcCalibration" : "secondCalibration", problem })}</p>
          : <p className="dig-ok">{tr("calibrate.ok", "De ijking klopt. Controleer of de rasterlijnen over de lijnen van de grafiek vallen.")}</p>}
      </>
    ),
    points: (
      <>
        <p className="dig-hint">{tr("points.hint", "Klik de punten aan langs de lijn, van boven naar beneden. Sleep een punt om het te verplaatsen; klik met de rechtermuisknop om het te verwijderen.")}</p>
        {seriesSwitch}
        <div className="dig-row">
          <button type="button" className="dig-btn" disabled={!history.current.length} onClick={undo} data-undo={undoCount}>{tr("points.undo", "Ongedaan maken")}</button>
          <button type="button" className="dig-btn" disabled={!s.points.length} onClick={() => change((w) => ({ ...w, [activeSeries]: { ...w[activeSeries], points: w[activeSeries].points.slice(0, -1) } }))}>{tr("points.removeLast", "Laatste punt weg")}</button>
          <button type="button" className="dig-btn" disabled={!s.points.length} onClick={() => change((w) => ({ ...w, [activeSeries]: { ...w[activeSeries], points: [] } }))}>{tr("points.clear", "Alles wissen")}</button>
        </div>
        <p className="dig-note" data-testid="dig-count">{tr("points.count", "{{n}} punten voor {{name}}", { n: s.points.length, name: activeSeries === "qc" ? "qc" : secondLabel })}</p>
        <div className="dig-grid2">
          <label className="dig-field"><span>{tr("points.step", "Stap (m)")}</span>
            <input inputMode="decimal" value={header.step} onChange={(e) => setHead({ step: e.target.value })} /></label>
          <label className="dig-field"><span>{tr("points.interpolation", "Tussen de punten")}</span>
            <select value={header.interpolation} onChange={(e) => setHead({ interpolation: e.target.value as Header["interpolation"] })}>
              <option value="linear">{tr("points.linear", "lineair")}</option>
              <option value="step">{tr("points.stepwise", "trapsgewijs per aflezing")}</option>
            </select></label>
        </div>
        <p className="dig-note">{header.interpolation === "step"
          ? tr("points.stepwiseHint", "Trapsgewijs: elke aflezing geldt tot de volgende aflezing. Past bij een mechanische sondering die per 0,2 m is afgelezen.")
          : tr("points.linearHint", "Lineair: tussen twee punten loopt de waarde in een rechte lijn.")}</p>
        {problem && <p className="dig-warning">{tr("points.notCalibrated", "De ijking is nog niet compleet; de lijn volgt nu de punten in de volgorde van aanklikken.")}</p>}
        {result.read.qc.reordered && <p className="dig-note">{tr("points.reordered", "De punten zijn op diepte gesorteerd.")}</p>}
        {result.read.qc.duplicates > 0 && <p className="dig-warning">{tr("points.duplicates", "{{n}} punten liggen op dezelfde diepte als een later punt; het laatst aangeklikte telt.", { n: result.read.qc.duplicates })}</p>}
        {result.points.length > 0 && <p className="dig-ok">{tr("points.result", "Meetreeks: {{n}} waarden van {{from}} tot {{to}} m onder maaiveld.", { n: result.points.length, from: result.points[0].depth.toFixed(2), to: result.points[result.points.length - 1].depth.toFixed(2) })}</p>}
      </>
    ),
    details: (
      <>
        <p className="dig-hint">{tr("details.hint", "Vul de kopgegevens in. De herkomst is verplicht en komt in het rapport.")}</p>
        <div className="dig-grid2">
          <label className="dig-field"><span>{tr("details.id", "Naam of nummer")}</span><input value={header.id} onChange={(e) => setHead({ id: e.target.value })} /></label>
          <label className="dig-field"><span>{tr("details.date", "Datum sondering")}</span><input type="date" value={header.date} onChange={(e) => setHead({ date: e.target.value })} /></label>
          <label className="dig-field"><span>{tr("details.coneKind", "Soort sondering")}</span>
            <select value={header.coneKind} onChange={(e) => { const coneKind = e.target.value as Header["coneKind"]; setHead({ coneKind, step: String(DEFAULT_STEP[coneKind]).replace(".", ",") }); }}>
              <option value="mechanical">{tr("cone.mechanical", "mechanisch")}</option>
              <option value="electrical">{tr("cone.electrical", "elektrisch")}</option>
            </select></label>
          <label className="dig-field"><span>{tr("details.groundLevel", "Maaiveld (m NAP)")}</span><input inputMode="decimal" value={header.groundLevel} onChange={(e) => setHead({ groundLevel: e.target.value })} /></label>
          <label className="dig-field"><span>{tr("details.x", "X (RD, m), optioneel")}</span><input inputMode="decimal" value={header.x} onChange={(e) => setHead({ x: e.target.value })} /></label>
          <label className="dig-field"><span>{tr("details.y", "Y (RD, m), optioneel")}</span><input inputMode="decimal" value={header.y} onChange={(e) => setHead({ y: e.target.value })} /></label>
        </div>
        <label className="dig-field"><span>{tr("details.origin", "Herkomst (verplicht)")}</span>
          <textarea rows={3} value={header.origin} placeholder={tr("details.originExample", "gedigitaliseerd van rapport … d.d. …")} onChange={(e) => setHead({ origin: e.target.value })} /></label>
        <p className="dig-note">{tr("details.coneHint", "Bij het wisselen van het soort sondering springt de stap naar 0,2 m (mechanisch) of 0,02 m (elektrisch). Het soort wordt vermeld; de meetwaarden worden er niet voor omgerekend.")}</p>
      </>
    ),
    save: (
      <>
        <p className="dig-hint">{editId
          ? tr("save.hintUpdate", "Sondering {{id}} wordt bijgewerkt.", { id: editId })
          : inProject ? tr("save.hintProject", "De sondering wordt aan het project toegevoegd en doet daarna gewoon mee, ook in de paalberekening.")
            : tr("save.hintDocument", "Er is geen project open: de sondering opent als los document.")}</p>
        {!image && <p className="dig-warning">{tr("problem.noImage", "Kies eerst een onderlegger.")}</p>}
        {problems.length > 0 && <ul className="dig-problems">{problems.map((p, i) => <li key={i}>{problemText(p)}</li>)}</ul>}
        {idTaken && <p className="dig-warning">{tr("problem.idTaken", "Er is al een sondering {{id}} in dit project; kies een andere naam.", { id: record.id })}</p>}
        {canSave && (
          <ul className="dig-summary">
            <li>{tr("save.points", "{{n}} waarden op een stap van {{step}} m, tot {{to}} m onder maaiveld", { n: result.points.length, step: header.step, to: result.points[result.points.length - 1]?.depth.toFixed(2) })}</li>
            <li>{secondOn ? tr("save.withSecond", "qc en {{name}}", { name: secondLabel }) : tr("save.qcOnly", "alleen qc; fs en Rf ontbreken")}</li>
            <li>{tr("save.marked", "Wordt in de grafiek, het rapport en de paalberekening vermeld als gedigitaliseerd ({{cone}}).", { cone: header.coneKind === "mechanical" ? tr("cone.mechanical", "mechanisch") : tr("cone.electrical", "elektrisch") })}</li>
          </ul>
        )}
        <button type="button" className="dig-btn dig-btn-primary" disabled={!canSave} onClick={save}>
          {editId ? tr("save.update", "Sondering bijwerken") : inProject ? tr("save.add", "Toevoegen aan project") : tr("save.open", "Openen als los document")}</button>
      </>
    ),
  };

  return (
    <Modal open onClose={close} width={1320} height="88vh" className="dig-modal"
      title={editId ? tr("title.edit", "Gedigitaliseerde sondering {{id}} bijwerken", { id: editId }) : tr("title.new", "Sondering digitaliseren")}
      footer={<>
        <span className="dig-footer-note">{message ?? tr("footer.accuracy", "Een gedigitaliseerde sondering is minder nauwkeurig dan een gemeten bestand.")}</span>
        <button className="settings-btn settings-btn-secondary" onClick={close}>{tr("footer.cancel", "Annuleren")}</button>
        <button className="settings-btn settings-btn-secondary" disabled={stepIndex === 0} onClick={() => setStep(STEPS[stepIndex - 1])}>{tr("footer.previous", "Vorige")}</button>
        {step === "save"
          ? <button className="settings-btn" disabled={!canSave} onClick={save}>{tr("footer.save", "Opslaan")}</button>
          : <button className="settings-btn" disabled={!image} onClick={() => setStep(STEPS[stepIndex + 1])}>{tr("footer.next", "Volgende")}</button>}
      </>}>
      <div className="dig-layout">
        <Stage image={image} markers={markers} onPlace={place} emptyText={tr("stage.empty", "Kies rechts een PDF of afbeelding met de sondeergrafiek.")}
          onDragStart={snapshot} onDrag={moveMarker} onRemove={removeMarker}
          labels={{ zoomIn: tr("stage.zoomIn", "Inzoomen"), zoomOut: tr("stage.zoomOut", "Uitzoomen"), fit: tr("stage.fit", "Passend"), stage: tr("stage.label", "Onderlegger met punten") }}>
          {(k) => (
            <>
              {grid && (step === "calibrate" || step === "points") && (
                <g className="dig-gridlines" data-testid="dig-grid">
                  {[...grid.depth.map((l) => ({ ...l, tone: "depth" })), ...grid.value.map((l) => ({ ...l, tone: "value" }))].map((l, i) => (
                    <g key={i} className={`dig-gridline dig-gridline-${l.tone}`}>
                      <line x1={l.from.x} y1={l.from.y} x2={l.to.x} y2={l.to.y} strokeWidth={1 / k} />
                      <text x={l.at.x + 4 / k} y={l.at.y - 3 / k} fontSize={11 / k}>{l.label}</text>
                    </g>
                  ))}
                </g>
              )}
              {(["qc", "second"] as const).map((id) => {
                const line = lines[id];
                return line && line.points.length > 1
                  ? <path key={id} data-testid={`dig-line-${id}`} className={`dig-line dig-line-${id}${id === activeSeries ? " active" : ""}${line.calibrated ? "" : " loose"}`} d={path(line.points)} strokeWidth={(id === activeSeries ? 2 : 1.4) / k} />
                  : null;
              })}
            </>
          )}
        </Stage>
        <aside className="dig-side">
          <ol className="dig-steps">
            {STEPS.map((id, i) => (
              <li key={id} className={id === step ? "active" : ""}>
                <button type="button" className="dig-step-head" aria-current={id === step ? "step" : undefined} disabled={!image && i > 0} onClick={() => setStep(id)}>
                  <span className="dig-step-nr">{i + 1}</span>{stepTitles[id]}</button>
                {id === step && <div className="dig-step-body">{body[id]}</div>}
              </li>
            ))}
          </ol>
        </aside>
      </div>
      {pending && createPortal(
        <div className="dig-crop-layer">
          {pending.kind === "pdf"
            ? <PdfCropDialog pdfSrc={pending.url} fileName={pending.name} onConfirm={confirmPick} onCancel={endPick} />
            : <ImageCropDialog imageSrc={pending.url} fileName={pending.name} onConfirm={confirmPick} onCancel={endPick} />}
        </div>, document.body)}
    </Modal>
  );
}
