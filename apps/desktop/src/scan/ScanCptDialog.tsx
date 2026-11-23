// Sondering uit scan: een oude sondeergrafiek (afbeelding of PDF-pagina)
// overtekenen tot een sondering. De schaal wordt geijkt met twee lijnen per
// as; het algoritme uit `trace.ts` stelt die lijnen voor en volgt de
// meetlijn. Met de hand tekenen en wissen kan altijd.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Modal from "../components/Modal";
import { placeCpt, useCptStore } from "../store/useCptStore";
import type { Cpt } from "../types/cpt";
import { binarize, calibrationValid, detectGridLines, drawSegment, eraseRows, removeThinLines, snap, suggestCalibration, toCptPoints, traceLine, type Bitmap, type Calibration, type Trace } from "./trace";
import "./ScanCptDialog.css";

type Tool = "calibrate" | "follow" | "draw" | "erase";
type Guide = "x1" | "x2" | "y1" | "y2";
interface PdfDoc { numPages: number; getPage(n: number): Promise<any> }

const MAX_SIDE = 3200;
const num = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(",", ".")));

export default function ScanCptDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation("scan");
  const baseRef = useRef<HTMLCanvasElement>(null), overlayRef = useRef<HTMLCanvasElement>(null), stageRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<HTMLCanvasElement | null>(null), pdfRef = useRef<PdfDoc | null>(null);
  const maskRef = useRef<Bitmap | null>(null), gridRef = useRef<{ rows: number[]; cols: number[] }>({ rows: [], cols: [] });
  const traceRef = useRef<Trace>(new Float32Array(0)), undoRef = useRef<Trace[]>([]);
  const dragRef = useRef<{ guide?: Guide; x: number; y: number } | null>(null);

  const [fileName, setFileName] = useState(""), [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const [pageCount, setPageCount] = useState(0), [page, setPage] = useState(1);
  const [sourceVersion, setSourceVersion] = useState(0), [rotation, setRotation] = useState(0);
  const [size, setSize] = useState({ width: 0, height: 0 }), [imageVersion, setImageVersion] = useState(0), [maskVersion, setMaskVersion] = useState(0), [traceVersion, setTraceVersion] = useState(0);
  const [threshold, setThreshold] = useState(120), [radius, setRadius] = useState(1), [showMask, setShowMask] = useState(false);
  const [zoom, setZoom] = useState(1), [tool, setTool] = useState<Tool>("calibrate");
  const [lines, setLines] = useState({ x1: 0, x2: 0, y1: 0, y2: 0 });
  const [values, setValues] = useState({ q1: "0", q2: "30", v1: "0", v2: "-20" });
  const [axis, setAxis] = useState<"nap" | "depth">("nap"), [ground, setGround] = useState("");
  const [name, setName] = useState(""), [xRd, setXRd] = useState(""), [yRd, setYRd] = useState(""), [date, setDate] = useState("");

  const cal: Calibration = useMemo(() => ({ ...lines, q1: num(values.q1), q2: num(values.q2), v1: num(values.v1), v2: num(values.v2) }), [lines, values]);
  const groundNap = num(ground);

  // ── Scan laden ──────────────────────────────────────────────────
  const setSource = useCallback((canvas: HTMLCanvasElement) => { sourceRef.current = canvas; setRotation(0); setSourceVersion((v) => v + 1); }, []);

  const renderPdfPage = useCallback(async (n: number) => {
    const doc = pdfRef.current;
    if (!doc) return;
    const pdfPage = await doc.getPage(n);
    const natural = pdfPage.getViewport({ scale: 1 });
    const viewport = pdfPage.getViewport({ scale: Math.min(200 / 72, MAX_SIDE / Math.max(natural.width, natural.height)) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width); canvas.height = Math.round(viewport.height);
    await pdfPage.render({ canvasContext: canvas.getContext("2d")!, canvas, viewport }).promise;
    setSource(canvas);
  }, [setSource]);

  const loadFile = useCallback(async (file: File) => {
    setError(null); setBusy(true); setFileName(file.name);
    setName((current) => current || file.name.replace(/\.[^.]+$/, ""));
    try {
      if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
        const { getDocument } = await import("../utils/pdfjsSetup");
        const doc = (await getDocument({ data: await file.arrayBuffer() }).promise) as unknown as PdfDoc;
        pdfRef.current = doc; setPageCount(doc.numPages); setPage(1);
        await renderPdfPage(1);
      } else {
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
        canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        pdfRef.current = null; setPageCount(0);
        setSource(canvas);
      }
    } catch {
      setError(t("error.load", "Dit bestand kan niet worden gelezen. Kies een afbeelding (PNG, JPG) of een PDF."));
    } finally { setBusy(false); }
  }, [renderPdfPage, setSource, t]);

  const goToPage = (n: number) => {
    const next = Math.max(1, Math.min(pageCount, n));
    setPage(next); setBusy(true);
    void renderPdfPage(next).finally(() => setBusy(false));
  };

  // Beeld (gedraaid) op het doek zetten; lijn en ijklijnen beginnen opnieuw.
  useEffect(() => {
    const source = sourceRef.current, base = baseRef.current;
    if (!source || !base) return;
    const turned = rotation % 2 === 1;
    const width = turned ? source.height : source.width, height = turned ? source.width : source.height;
    base.width = width; base.height = height;
    const ctx = base.getContext("2d", { willReadFrequently: true })!;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, width, height);
    ctx.save(); ctx.translate(width / 2, height / 2); ctx.rotate((rotation * Math.PI) / 2); ctx.drawImage(source, -source.width / 2, -source.height / 2); ctx.restore();
    traceRef.current = new Float32Array(height).fill(NaN); undoRef.current = [];
    setSize({ width, height });
    const stage = stageRef.current;
    if (stage) setZoom(Math.max(0.1, Math.min(1, (stage.clientWidth - 24) / width)));
    setImageVersion((v) => v + 1); setTraceVersion((v) => v + 1);
  }, [sourceVersion, rotation]);

  // Masker en raster; bij een nieuw beeld ook het voorstel voor de ijklijnen.
  const calibratedFor = useRef(0);
  useEffect(() => {
    const base = baseRef.current;
    if (!base || !imageVersion || !base.width) return;
    const { width, height } = base;
    const raw = binarize(base.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, width, height).data, width, height, threshold);
    gridRef.current = detectGridLines(raw);
    maskRef.current = radius > 0 ? removeThinLines(raw, radius) : raw;
    if (calibratedFor.current !== imageVersion) { calibratedFor.current = imageVersion; setLines(suggestCalibration(gridRef.current, width, height)); }
    setMaskVersion((v) => v + 1);
  }, [imageVersion, threshold, radius]);

  // ── Overlay: masker, ijklijnen en de overgetekende lijn ─────────
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay || !size.width) return;
    overlay.width = size.width; overlay.height = size.height;
    const ctx = overlay.getContext("2d")!, px = 1 / zoom, mask = maskRef.current;
    if (showMask && mask) {
      const img = ctx.createImageData(mask.width, mask.height);
      for (let i = 0; i < mask.data.length; i++) if (mask.data[i]) { img.data[i * 4] = 37; img.data[i * 4 + 1] = 99; img.data[i * 4 + 2] = 235; img.data[i * 4 + 3] = 150; }
      ctx.putImageData(img, 0, 0);
    }
    ctx.font = `600 ${13 * px}px sans-serif`; ctx.lineWidth = 1.5 * px;
    const guide = (horizontal: boolean, at: number, label: string, color: string) => {
      ctx.strokeStyle = color; ctx.fillStyle = color; ctx.setLineDash([8 * px, 5 * px]);
      ctx.beginPath();
      if (horizontal) { ctx.moveTo(0, at); ctx.lineTo(size.width, at); } else { ctx.moveTo(at, 0); ctx.lineTo(at, size.height); }
      ctx.stroke(); ctx.setLineDash([]);
      const w = ctx.measureText(label).width + 10 * px, h = 20 * px;
      const bx = horizontal ? 6 * px : at + 4 * px, by = horizontal ? at - h - 2 * px : 6 * px;
      ctx.fillRect(bx, by, w, h); ctx.fillStyle = "#fff"; ctx.fillText(label, bx + 5 * px, by + 14.5 * px);
    };
    const unit = axis === "nap" ? t("unit.nap", "m NAP") : t("unit.depth", "m − mv");
    guide(true, lines.y1, `${values.v1} ${unit}`, "#2563EB"); guide(true, lines.y2, `${values.v2} ${unit}`, "#2563EB");
    guide(false, lines.x1, `${values.q1} MPa`, "#16A34A"); guide(false, lines.x2, `${values.q2} MPa`, "#16A34A");
    const trace = traceRef.current;
    ctx.strokeStyle = "#DC2626"; ctx.lineWidth = Math.max(2, 2.5 * px); ctx.lineJoin = "round";
    ctx.beginPath();
    let pen = false;
    for (let y = 0; y < trace.length; y++) {
      const x = trace[y];
      if (!Number.isFinite(x)) { pen = false; continue; }
      if (pen) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      pen = true;
    }
    ctx.stroke();
  }, [size, zoom, lines, values, axis, showMask, maskVersion, traceVersion, t]);

  // ── Tekenen ─────────────────────────────────────────────────────
  const remember = () => { undoRef.current.push(traceRef.current.slice()); if (undoRef.current.length > 40) undoRef.current.shift(); };
  const undo = useCallback(() => { const prev = undoRef.current.pop(); if (prev) { traceRef.current = prev; setTraceVersion((v) => v + 1); } }, []);
  const clearTrace = () => { remember(); traceRef.current.fill(NaN); setTraceVersion((v) => v + 1); };
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); undo(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, undo]);

  const at = (e: React.PointerEvent) => {
    const rect = overlayRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * size.width, y: ((e.clientY - rect.top) / rect.height) * size.height };
  };
  const onDown = (e: React.PointerEvent) => {
    if (!size.width || e.button !== 0) return;
    const p = at(e);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* geen echte aanwijzer (test) */ }
    if (tool === "calibrate") {
      let guide: Guide | undefined, best = 12 / zoom;
      for (const g of ["x1", "x2", "y1", "y2"] as Guide[]) { const d = Math.abs((g[0] === "x" ? p.x : p.y) - lines[g]); if (d < best) { best = d; guide = g; } }
      dragRef.current = guide ? { guide, ...p } : null;
      return;
    }
    dragRef.current = p;
    if (tool === "follow") return;
    remember();
    if (tool === "draw") drawSegment(traceRef.current, p.x, p.y, p.x, p.y); else eraseRows(traceRef.current, p.y, p.y);
    setTraceVersion((v) => v + 1);
  };
  const onMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const p = at(e);
    if (drag.guide) { const g = drag.guide; setLines((l) => ({ ...l, [g]: g[0] === "x" ? p.x : p.y })); return; }
    if (tool === "follow") return;
    if (tool === "draw") drawSegment(traceRef.current, drag.x, drag.y, p.x, p.y); else eraseRows(traceRef.current, drag.y, p.y);
    dragRef.current = p;
    setTraceVersion((v) => v + 1);
  };
  const onUp = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (drag.guide) { const g = drag.guide; setLines((l) => ({ ...l, [g]: snap(l[g], g[0] === "x" ? gridRef.current.cols : gridRef.current.rows, 8 / zoom) })); return; }
    if (tool !== "follow" || !maskRef.current) return;
    // Klik: volgen tot de lijn ophoudt. Slepen: volgen tot waar je loslaat.
    const p = at(e);
    remember();
    traceLine(maskRef.current, drag.x, drag.y, { xMin: 0, xMax: size.width, yEnd: p.y - drag.y > 8 ? p.y : size.height }, traceRef.current);
    setTraceVersion((v) => v + 1);
  };

  // ── Resultaat ───────────────────────────────────────────────────
  const points = useMemo(() => toCptPoints(traceRef.current, cal, axis, axis === "nap" ? groundNap : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cal, axis, groundNap, traceVersion]);
  const maxQc = points.reduce((m, p) => Math.max(m, p.qc), 0);
  const calOk = calibrationValid(cal), groundOk = axis === "depth" || Number.isFinite(groundNap);
  const id = name.trim();
  const duplicate = !!id && useCptStore.getState().cpts.has(id);
  const problem = !size.width ? null
    : !calOk ? t("problem.scale", "Vul bij alle vier de ijklijnen een waarde in; de twee lijnen van een as mogen niet dezelfde waarde hebben.")
    : !groundOk ? t("problem.ground", "Vul het maaiveld in m NAP in; de as van de scan staat in NAP.")
    : points.length < 2 ? t("problem.trace", "Er is nog geen lijn. Kies ‘Lijn volgen’ en klik op het begin van de meetlijn, of teken haar met de hand.")
    : !id ? t("problem.name", "Geef de sondering een naam.")
    : duplicate ? t("problem.duplicate", "Er is al een sondering met deze naam in het project.")
    : null;

  const create = () => {
    if (problem || !size.width) return;
    const hasGround = Number.isFinite(groundNap), x = num(xRd), y = num(yRd);
    const cpt: Cpt = {
      id,
      metadata: {
        source_file: fileName,
        ...(hasGround ? { ground_level_nap: groundNap } : {}),
        ...(date ? { date } : {}),
        extra: { [t("meta.originKey", "Herkomst")]: t("meta.originValue", "Overgetekend van een scan ({{file}}); alleen de conusweerstand", { file: fileName }) },
      },
      ...(Number.isFinite(x) && Number.isFinite(y) ? { position: { x_rd: x, y_rd: y, ...(hasGround ? { z_nap: groundNap } : {}) } } : {}),
      points: points.map((p) => ({ depth: p.depth, qc: p.qc, ...(hasGround ? { depth_nap: Math.round((groundNap - p.depth) * 1000) / 1000 } : {}) })),
    };
    try { placeCpt(cpt, id); onClose(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const tools: { id: Tool; label: string; hint: string }[] = [
    { id: "calibrate", label: t("tool.calibrate", "Schaal ijken"), hint: t("hint.calibrate", "Sleep de vier stippellijnen op rasterlijnen waarvan je de waarde kent en vul die waarden rechts in. De lijnen klikken vast op het raster.") },
    { id: "follow", label: t("tool.follow", "Lijn volgen"), hint: t("hint.follow", "Klik op het begin van de meetlijn: de lijn wordt naar beneden gevolgd tot ze ophoudt. Sleep omlaag om alleen tot het loslaatpunt te volgen.") },
    { id: "draw", label: t("tool.draw", "Tekenen"), hint: t("hint.draw", "Teken met ingedrukte muisknop over de meetlijn. Wat je tekent vervangt de lijn op die hoogte.") },
    { id: "erase", label: t("tool.erase", "Wissen"), hint: t("hint.erase", "Sleep over het stuk van de lijn dat weg moet.") },
  ];
  const field = (label: string, value: string, set: (v: string) => void, extra?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <label className="scan-field"><span>{label}</span><input value={value} onChange={(e) => set(e.target.value)} {...extra} /></label>
  );
  const unit = axis === "nap" ? t("unit.nap", "m NAP") : t("unit.depth", "m − mv");

  return (
    <Modal open={open} onClose={onClose} title={t("title", "Sondering uit scan")} width={1240} height="90vh" className="scan-modal"
      footer={<>
        <span className="scan-problem">{error ?? problem}</span>
        <button type="button" className="scan-btn" onClick={onClose}>{t("cancel", "Annuleren")}</button>
        <button type="button" className="scan-btn primary" disabled={!!problem || !size.width} onClick={create}>{t("create", "Sondering maken")}</button>
      </>}>
      <div className="scan-layout">
        <div className="scan-main">
          <div className="scan-toolbar">
            {tools.map((x) => <button key={x.id} type="button" className={`scan-btn${tool === x.id ? " active" : ""}`} disabled={!size.width} onClick={() => setTool(x.id)}>{x.label}</button>)}
            <span className="scan-gap" />
            <button type="button" className="scan-btn" disabled={!size.width} onClick={undo}>{t("undo", "Ongedaan maken")}</button>
            <button type="button" className="scan-btn" disabled={!size.width} onClick={clearTrace}>{t("clear", "Lijn wissen")}</button>
            <span className="scan-gap" />
            <button type="button" className="scan-btn icon" disabled={!size.width} onClick={() => setZoom((z) => Math.max(0.1, z / 1.25))} aria-label={t("zoomOut", "Uitzoomen")}>−</button>
            <span className="scan-zoom">{Math.round(zoom * 100)}%</span>
            <button type="button" className="scan-btn icon" disabled={!size.width} onClick={() => setZoom((z) => Math.min(6, z * 1.25))} aria-label={t("zoomIn", "Inzoomen")}>+</button>
          </div>
          <div className="scan-hint">{size.width ? tools.find((x) => x.id === tool)!.hint : t("hint.start", "Kies een scan van een sondeergrafiek: een afbeelding of een pagina uit een PDF.")}</div>
          <div className="scan-stage" ref={stageRef}>
            {!size.width && <label className="scan-drop">{busy ? t("loading", "Bezig met laden…") : t("choose", "Scan kiezen…")}<input type="file" accept="image/png,image/jpeg,image/webp,application/pdf,.pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(f); e.target.value = ""; }} /></label>}
            <div className="scan-canvas" style={{ width: size.width * zoom, height: size.height * zoom, display: size.width ? "block" : "none" }}>
              <canvas ref={baseRef} />
              <canvas ref={overlayRef} className={`scan-overlay tool-${tool}`} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => { dragRef.current = null; }} />
            </div>
          </div>
        </div>
        <aside className="scan-side">
          <section>
            <h3>{t("section.scan", "1. Scan")}</h3>
            <label className="scan-btn scan-file">{fileName || t("choose", "Scan kiezen…")}<input type="file" accept="image/png,image/jpeg,image/webp,application/pdf,.pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(f); e.target.value = ""; }} /></label>
            {pageCount > 1 && <div className="scan-row">
              <button type="button" className="scan-btn icon" disabled={page <= 1 || busy} onClick={() => goToPage(page - 1)} aria-label={t("prevPage", "Vorige pagina")}>‹</button>
              <label className="scan-field inline"><span>{t("page", "Pagina")}</span><input type="number" min={1} max={pageCount} value={page} onChange={(e) => goToPage(Number(e.target.value) || 1)} /></label>
              <span className="scan-muted">/ {pageCount}</span>
              <button type="button" className="scan-btn icon" disabled={page >= pageCount || busy} onClick={() => goToPage(page + 1)} aria-label={t("nextPage", "Volgende pagina")}>›</button>
            </div>}
            <div className="scan-row">
              <button type="button" className="scan-btn" disabled={!size.width} onClick={() => setRotation((r) => (r + 3) % 4)}>{t("rotateLeft", "↺ Linksom")}</button>
              <button type="button" className="scan-btn" disabled={!size.width} onClick={() => setRotation((r) => (r + 1) % 4)}>{t("rotateRight", "↻ Rechtsom")}</button>
            </div>
          </section>
          <section>
            <h3>{t("section.scale", "2. Schaal")}</h3>
            <label className="scan-field"><span>{t("axis.label", "De diepte-as toont")}</span>
              <select value={axis} onChange={(e) => setAxis(e.target.value as "nap" | "depth")}>
                <option value="nap">{t("axis.nap", "hoogte in m NAP")}</option>
                <option value="depth">{t("axis.depth", "diepte onder maaiveld")}</option>
              </select>
            </label>
            <div className="scan-pair blue">
              {field(t("scale.v1", "Bovenste lijn [{{unit}}]", { unit }), values.v1, (v) => setValues((s) => ({ ...s, v1: v })), { inputMode: "decimal" })}
              {field(t("scale.v2", "Onderste lijn [{{unit}}]", { unit }), values.v2, (v) => setValues((s) => ({ ...s, v2: v })), { inputMode: "decimal" })}
            </div>
            <div className="scan-pair green">
              {field(t("scale.q1", "Linker lijn [MPa]"), values.q1, (v) => setValues((s) => ({ ...s, q1: v })), { inputMode: "decimal" })}
              {field(t("scale.q2", "Rechter lijn [MPa]"), values.q2, (v) => setValues((s) => ({ ...s, q2: v })), { inputMode: "decimal" })}
            </div>
            {field(axis === "nap" ? t("ground.required", "Maaiveld [m NAP]") : t("ground.optional", "Maaiveld [m NAP] (mag leeg)"), ground, setGround, { inputMode: "decimal" })}
            <button type="button" className="scan-btn" disabled={!size.width} onClick={() => setLines(suggestCalibration(gridRef.current, size.width, size.height))}>{t("scale.suggest", "Lijnen op het buitenste raster")}</button>
          </section>
          <section>
            <h3>{t("section.line", "3. Lijn")}</h3>
            <label className="scan-field"><span>{t("line.threshold", "Donkerte van de lijn ({{value}})", { value: threshold })}</span><input type="range" min={40} max={220} step={5} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} /></label>
            <label className="scan-field"><span>{t("line.radius", "Dunne rasterlijnen wegpoetsen")}</span>
              <select value={radius} onChange={(e) => setRadius(Number(e.target.value))}>
                <option value={0}>{t("line.radius0", "niet")}</option>
                <option value={1}>{t("line.radius1", "licht (lijnen tot 2 pixels)")}</option>
                <option value={2}>{t("line.radius2", "sterk (lijnen tot 4 pixels)")}</option>
              </select>
            </label>
            <label className="scan-check"><input type="checkbox" checked={showMask} onChange={(e) => setShowMask(e.target.checked)} />{t("line.showMask", "Toon wat het algoritme als lijn ziet")}</label>
          </section>
          <section>
            <h3>{t("section.cpt", "4. Sondering")}</h3>
            {field(t("cpt.name", "Naam"), name, setName)}
            <div className="scan-pair">
              {field(t("cpt.x", "X [m RD] (mag leeg)"), xRd, setXRd, { inputMode: "decimal" })}
              {field(t("cpt.y", "Y [m RD] (mag leeg)"), yRd, setYRd, { inputMode: "decimal" })}
            </div>
            {field(t("cpt.date", "Datum (mag leeg)"), date, setDate, { type: "date" })}
            <p className="scan-summary">{points.length >= 2
              ? t("cpt.summary", "{{count}} meetpunten van {{from}} tot {{to}} m onder maaiveld, grootste conusweerstand {{max}} MPa.", { count: points.length, from: points[0].depth.toFixed(2), to: points[points.length - 1].depth.toFixed(2), max: maxQc.toFixed(1) })
              : t("cpt.empty", "Nog geen meetpunten.")}</p>
            <p className="scan-muted">{t("cpt.note", "Een overgetekende sondering heeft alleen een conusweerstand. Controleer de lijn naast de scan: de nauwkeurigheid is die van het papier.")}</p>
          </section>
        </aside>
      </div>
    </Modal>
  );
}
