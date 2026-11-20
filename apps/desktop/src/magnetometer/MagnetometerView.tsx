// Magnetometersondering tegen de diepte: qc met ernaast de componenten, het totaalveld, de verticale
// gradiënt en de inclinatie/declinatie, met rechts de instellingen en de tabel met zones.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCptStore } from "../store/useCptStore";
import { OaIcon } from "../components/icons/oaIcon";
import { analyseMagnetometer, magSettingsFor, withMagSettings, type MagSettings } from "./analysis";
import { magnetometerData, type MagChannel } from "./channels";
import { magLayout, renderMagnetometer, yToDepth } from "./mag-renderer";
import { buildTracks, depthMaxOf, depthWindow, fmtValue, LINE_COLORS, type LineKey, type TrackKey } from "./tracks";
import "./magnetometer.css";

const clampZoom = (z: number) => Math.max(0.2, Math.min(8, z));

/** Getalveld dat pas bij verlaten of Enter wordt overgenomen; leeg mag als `allowEmpty`. */
function NumberField(props: { label: string; unit: string; value: number | null; allowEmpty?: boolean; placeholder?: string; onCommit: (v: number | null) => void }) {
  const [draft, setDraft] = useState(props.value == null ? "" : String(props.value));
  useEffect(() => setDraft(props.value == null ? "" : String(props.value)), [props.value]);
  const commit = () => {
    const text = draft.trim().replace(",", ".");
    if (!text && props.allowEmpty) { props.onCommit(null); return; }
    const v = Number(text);
    if (text && Number.isFinite(v) && v >= 0) props.onCommit(v);
    else setDraft(props.value == null ? "" : String(props.value));
  };
  return (
    <label className="mag-field">
      <span>{props.label}</span>
      <input
        type="text" inputMode="decimal" value={draft} placeholder={props.placeholder}
        onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      />
      <em>{props.unit}</em>
    </label>
  );
}

export default function MagnetometerView() {
  const { t, i18n } = useTranslation("magnetometer");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cptsMap = useCptStore((s) => s.cpts);
  const activeCptId = useCptStore((s) => s.activeCptId);
  const setActive = useCptStore((s) => s.setActive);
  const replaceCpt = useCptStore((s) => s.replaceCpt);

  const candidates = useMemo(
    () => Array.from(cptsMap.values()).flatMap((cpt) => { const data = magnetometerData(cpt); return data ? [{ cpt, data }] : []; }),
    [cptsMap],
  );
  const current = candidates.find((c) => c.cpt.id === activeCptId) ?? candidates[0];
  const cpt = current?.cpt, data = current?.data;
  const settings = useMemo(() => (cpt ? magSettingsFor(cpt) : null), [cpt]);
  const analysis = useMemo(() => (data && settings ? analyseMagnetometer(data, settings) : null), [data, settings]);
  const tracks = useMemo(() => (cpt && data && analysis && settings ? buildTracks(cpt, data, analysis, settings) : []), [cpt, data, analysis, settings]);
  const depthMax = useMemo(() => depthMaxOf(data?.depth ?? []), [data]);

  const [zoom, setZoom] = useState(1);
  const [panY, setPanY] = useState(0);
  const [hoverDepth, setHoverDepth] = useState<number | null>(null);
  const [themeTick, setThemeTick] = useState(0);
  useEffect(() => {
    const obs = new MutationObserver(() => setThemeTick((n) => n + 1));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  const titles = useMemo<Record<TrackKey, string>>(() => ({
    qc: t("track.qc", "qc"),
    components: t("track.components", "Componenten − mediaan"),
    total: t("track.total", "Totaalveld |B|"),
    gradient: t("track.gradient", "Gradiënt d|B|/dz"),
    inclination: t("track.inclination", "Inclinatie"),
    declination: t("track.declination", "Declinatie"),
  }), [t]);
  const lineLabels = useMemo<Record<LineKey, string>>(() => ({
    qc: "qc", x: "Bx", y: "By", z: "Bz", total: "|B|", gradient: "d|B|/dz",
    inclination: t("line.inclination", "inclinatie"), declination: t("line.declination", "declinatie"),
  }), [t]);
  const depthAxis = t("depthAxis", "Diepte onder maaiveld (m)");
  const win = useMemo(() => depthWindow(depthMax, zoom, panY), [depthMax, zoom, panY]);
  const backgroundRange = useMemo(() => {
    if (!settings || !data || analysis?.background == null) return null;
    const from = settings.backgroundFrom ?? 0, to = settings.backgroundTo ?? depthMax;
    return { from: Math.min(from, to), to: Math.max(from, to) };
  }, [settings, data, analysis, depthMax]);

  useEffect(() => {
    const canvas = canvasRef.current, ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !data || !analysis) return;
    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderMagnetometer(ctx, tracks, {
        width: rect.width, height: rect.height, win, depth: data.depth, zones: analysis.zones,
        backgroundRange, hoverDepth, titles, lineLabels, depthAxis,
      });
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [tracks, data, analysis, win, backgroundRange, hoverDepth, titles, lineLabels, depthAxis, themeTick, i18n.language]);

  // Zelfde zoomgedrag als de sondeergrafiek: muiswiel, slepen en de knoppen in het lint.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); setZoom((z) => clampZoom(z * (e.deltaY < 0 ? 1.1 : 0.9))); };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [cpt?.id]);
  useEffect(() => {
    const onIn = () => setZoom((z) => clampZoom(z * 1.25));
    const onOut = () => setZoom((z) => clampZoom(z * 0.8));
    const onFit = () => { setZoom(1); setPanY(0); };
    window.addEventListener("ogs:zoom-in", onIn);
    window.addEventListener("ogs:zoom-out", onOut);
    window.addEventListener("ogs:zoom-fit", onFit);
    return () => {
      window.removeEventListener("ogs:zoom-in", onIn);
      window.removeEventListener("ogs:zoom-out", onOut);
      window.removeEventListener("ogs:zoom-fit", onFit);
    };
  }, []);

  const geometry = useCallback(() => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return rect && rect.height > 10 ? { rect, layout: magLayout(rect.width, rect.height, tracks.length) } : null;
  }, [tracks.length]);

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const g = geometry();
    if (!g) return;
    const y = e.clientY - g.rect.top, x = e.clientX - g.rect.left;
    setHoverDepth(y >= g.layout.plotT && y <= g.layout.plotB && x >= g.layout.axisW ? yToDepth(y, win, g.layout) : null);
  };
  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const g = geometry();
    if (!g || e.button !== 0) return;
    e.preventDefault();
    const y0 = e.clientY, startPan = panY, metresPerPx = (win.bottom - win.top) / g.layout.plotH;
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
    const onMove = (ev: MouseEvent) => { setHoverDepth(null); setPanY(startPan - (ev.clientY - y0) * metresPerPx); };
    const onUp = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  if (!cpt || !data || !analysis || !settings) {
    return <div className="placeholder"><p>{t("none", "Geen van de geopende sonderingen heeft magnetometerkanalen.")}</p></div>;
  }

  const update = (patch: Partial<MagSettings>) => replaceCpt(withMagSettings(cpt, { ...settings, ...patch }));
  const zoomTo = (top: number, bottom: number) => {
    const span = Math.max(bottom - top, 0.5) * 3;
    setZoom(clampZoom(depthMax / span));
    setPanY((top + bottom) / 2 - depthMax / 2);
  };

  // Waarden op de diepte onder de muis: het dichtstbijzijnde meetpunt.
  const hoverIndex = hoverDepth == null ? -1 : data.depth.reduce((best, d, i) => (Math.abs(d - hoverDepth) < Math.abs((data.depth[best] ?? Infinity) - hoverDepth) ? i : best), 0);
  const at = (values: Array<number | null> | undefined | null, digits: number) => {
    const v = hoverIndex >= 0 ? values?.[hoverIndex] : null;
    return v == null ? "–" : v.toFixed(digits);
  };
  const channelRows: Array<{ key: LineKey; label: string; value: string; unit: string }> = [
    ...(["x", "y", "z"] as MagChannel[]).filter((c) => data.channels[c]).map((c) => ({ key: c as LineKey, label: lineLabels[c as LineKey], value: at(data.channels[c], 1), unit: "nT" })),
    ...(data.total ? [
      { key: "total" as const, label: lineLabels.total, value: at(data.total, 1), unit: "nT" },
      { key: "gradient" as const, label: lineLabels.gradient, value: at(analysis.gradient, 1), unit: "nT/m" },
    ] : []),
    ...(["inclination", "declination"] as const).filter((c) => data.channels[c]).map((c) => ({ key: c, label: lineLabels[c], value: at(data.channels[c], 2), unit: "°" })),
  ];
  const sign = (v: number) => (v > 0 ? "+" : "") + fmtValue(v, 1);

  return (
    <div className="mag-view">
      <div className="mag-plot">
        <canvas
          ref={canvasRef}
          onMouseMove={onMouseMove}
          onMouseLeave={() => setHoverDepth(null)}
          onMouseDown={onMouseDown}
          style={{ width: "100%", height: "100%", display: "block", cursor: "crosshair" }}
        />
      </div>
      <aside className="mag-side" aria-label={t("side.title", "Magnetometer")}>
        <div className="mag-side-head">
          <span>{t("side.title", "Magnetometer")}</span>
          {candidates.length > 1 ? (
            <select value={cpt.id} onChange={(e) => setActive(e.target.value)} aria-label={t("side.cpt", "Sondering")}>
              {candidates.map((c) => <option key={c.cpt.id} value={c.cpt.id}>{c.cpt.id}</option>)}
            </select>
          ) : <strong>{cpt.id}</strong>}
        </div>

        <p className="mag-disclaimer" role="note">
          <OaIcon id="status.warning" size={16} />
          <span>{t("disclaimer", "Presentatie van meetgegevens. De gemarkeerde zones volgen alleen uit de ingestelde drempels; dit is geen beoordeling en vervangt geen vrijgave of beoordeling door een deskundige.")}</span>
        </p>

        <section>
          <h4>{t("readout.title", "Waarden")}</h4>
          <div className="mag-readout-depth">
            {hoverIndex < 0 ? t("readout.hint", "Beweeg over de grafiek voor de waarden op één diepte.") : t("readout.depth", "{{depth}} m onder maaiveld", { depth: data.depth[hoverIndex].toFixed(2) })}
          </div>
          <table className="mag-readout">
            <tbody>
              {channelRows.map((row) => (
                <tr key={row.key}>
                  <td><i style={{ background: LINE_COLORS[row.key] }} />{row.label}</td>
                  <td>{row.value}</td>
                  <td>{row.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.totalSource === "computed" && <p className="mag-note">{t("totalComputed", "Totale veldsterkte berekend uit de drie componenten: |B| = √(Bx² + By² + Bz²).")}</p>}
          {!data.total && <p className="mag-note">{t("noTotal", "Geen totale veldsterkte: het bestand heeft geen totaalkanaal en niet alle drie de componenten.")}</p>}
          {data.unknownUnits.map((u) => (
            <p className="mag-note" key={u.channel}>{t("unknownUnit", "Kanaal {{channel}} niet getoond: eenheid '{{unit}}' is onbekend.", { channel: lineLabels[u.channel as LineKey], unit: u.unit })}</p>
          ))}
        </section>

        {data.total && (
          <section>
            <h4>{t("settings.title", "Instellingen")}</h4>
            <div className="mag-fields">
              <NumberField label={t("settings.backgroundFrom", "Achtergrond van")} unit="m" value={settings.backgroundFrom} allowEmpty placeholder={t("settings.start", "begin")} onCommit={(v) => update({ backgroundFrom: v })} />
              <NumberField label={t("settings.backgroundTo", "Achtergrond tot")} unit="m" value={settings.backgroundTo} allowEmpty placeholder={t("settings.end", "eind")} onCommit={(v) => update({ backgroundTo: v })} />
              <NumberField label={t("settings.anomaly", "Drempel afwijking")} unit="nT" value={settings.anomalyThreshold} onCommit={(v) => update({ anomalyThreshold: v ?? settings.anomalyThreshold })} />
              <NumberField label={t("settings.gradient", "Drempel gradiënt")} unit="nT/m" value={settings.gradientThreshold} onCommit={(v) => update({ gradientThreshold: v ?? settings.gradientThreshold })} />
              <NumberField label={t("settings.analysisFrom", "Zones vanaf")} unit="m" value={settings.analysisFrom} onCommit={(v) => update({ analysisFrom: v ?? 0 })} />
              <NumberField label={t("settings.mergeGap", "Samenvoegen binnen")} unit="m" value={settings.mergeGap} onCommit={(v) => update({ mergeGap: v ?? 0 })} />
            </div>
            <p className="mag-note">
              {analysis.background == null
                ? t("background.none", "Geen meetwaarden in het traject van de achtergrond.")
                : t("background.value", "Achtergrondveld (mediaan van {{count}} waarden): {{value}} nT", { count: analysis.backgroundCount, value: analysis.background.toFixed(1) })}
            </p>
            <p className="mag-note">{t("settings.note", "De drempels zijn eigen instelwaarden, geen normwaarden.")}</p>
          </section>
        )}

        {data.total && (
          <section className="mag-zones">
            <h4>{t("zones.title", "Zones boven de drempel")} ({analysis.zones.length})</h4>
            {analysis.zones.length === 0 ? (
              <p className="mag-note">{t("zones.none", "Geen traject boven de ingestelde drempels.")}</p>
            ) : (
              <table className="mag-zone-table">
                <thead>
                  <tr>
                    <th>{t("zones.top", "Boven (m)")}</th>
                    <th>{t("zones.bottom", "Onder (m)")}</th>
                    <th>{t("zones.peak", "Piek (nT)")}</th>
                    <th>{t("zones.peakDepth", "op (m)")}</th>
                    <th>{t("zones.peakGradient", "Gradiënt (nT/m)")}</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.zones.map((zone) => (
                    <tr key={`${zone.top}-${zone.bottom}`} onClick={() => zoomTo(zone.top, zone.bottom)} title={t("zones.zoomHint", "Klik om op deze zone in te zoomen")}>
                      <td>{zone.top.toFixed(2)}</td>
                      <td>{zone.bottom.toFixed(2)}</td>
                      <td>{sign(zone.peakAnomaly)}</td>
                      <td>{zone.peakAnomalyDepth.toFixed(2)}</td>
                      <td>{zone.peakGradient == null ? "–" : sign(zone.peakGradient)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="mag-note">{t("zones.note", "Piek = grootste afwijking van het achtergrondveld in de zone. Diepten in m onder maaiveld.")}</p>
          </section>
        )}
      </aside>
    </div>
  );
}
