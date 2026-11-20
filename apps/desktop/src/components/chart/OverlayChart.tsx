import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCptStore } from "../../store/useCptStore";
import { OaIcon } from "../icons/oaIcon";
import { formatNap } from "./chart-renderer";
import { renderOverlay } from "./overlay-renderer";
import {
  buildSeries,
  clampZoom,
  computeOverlayScales,
  levelToY,
  levelWindow,
  overlayLayout,
  panelAt,
  pickSeries,
  seriesStyle,
  valueAtLevel,
  valueToX,
  yToLevel,
  type SeriesStyle,
} from "./overlay-scale";
import "./OverlayChart.css";

const fmt = (v: number | null, digits: number) => (v === null ? "–" : v.toFixed(digits));

/**
 * All visible CPTs of the project drawn over each other: one qc chart and
 * one fs chart against NAP, with a legend that doubles as the read-out for
 * the level under the pointer.
 *
 * Drawing lives in `overlay-renderer.ts`, the arithmetic in `overlay-scale.ts`.
 */
export default function OverlayChart() {
  const { t, i18n } = useTranslation("panels");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cptsMap = useCptStore((s) => s.cpts);
  const hiddenCptIds = useCptStore((s) => s.hiddenCptIds);
  const activeCptId = useCptStore((s) => s.activeCptId);
  const setActive = useCptStore((s) => s.setActive);

  // Style by position in the whole project, so hiding one CPT does not
  // recolour the others.
  const styles = useMemo(() => {
    const map = new Map<string, SeriesStyle>();
    Array.from(cptsMap.keys()).forEach((id, i) => map.set(id, seriesStyle(i)));
    return map;
  }, [cptsMap]);
  const series = useMemo(
    () => Array.from(cptsMap.values()).filter((c) => !hiddenCptIds.has(c.id)).map(buildSeries),
    [cptsMap, hiddenCptIds],
  );
  const scales = useMemo(() => computeOverlayScales(series), [series]);
  const withoutNap = useMemo(() => series.filter((s) => !s.hasNap).map((s) => s.id), [series]);

  const [zoom, setZoom] = useState(1);
  const [panY, setPanY] = useState(0);
  const [hoverLevel, setHoverLevel] = useState<number | null>(null);
  const [cursor, setCursor] = useState("crosshair");
  const [themeTick, setThemeTick] = useState(0);

  // Redraw when the theme switches.
  useEffect(() => {
    const obs = new MutationObserver(() => setThemeTick((n) => n + 1));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  const levelAxisLabel = scales.anyNap ? "NAP (m)" : t("chart.depthAxis", "Diepte (m)");
  const qcLabel = t("chart.qcHeader", "Conusweerstand (qc, MPa)");
  const fsLabel = t("chart.fsHeader", "Plaatselijke wrijving (fs, MPa)");

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderOverlay(ctx, series, scales, {
        width: rect.width,
        height: rect.height,
        zoom,
        panY,
        activeCptId,
        hoverLevel,
        styles,
        labels: { qc: qcLabel, fs: fsLabel, levelAxis: levelAxisLabel },
      });
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [series, scales, styles, zoom, panY, activeCptId, hoverLevel, themeTick, qcLabel, fsLabel, levelAxisLabel, i18n.language]);

  // Wheel zoom.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => clampZoom(z * (e.deltaY < 0 ? 1.1 : 0.9)));
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, []);

  // Zoom and Fit buttons of the ribbon.
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

  /** Geometry of the canvas as it is on screen right now. */
  const geometry = useCallback(() => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.height < 10) return null;
    return { rect, layout: overlayLayout(rect.width, rect.height), win: levelWindow(scales, zoom, panY) };
  }, [scales, zoom, panY]);

  const seriesAt = useCallback(
    (x: number, y: number): string | null => {
      const g = geometry();
      if (!g) return null;
      const key = panelAt(x, g.layout);
      if (!key || y < g.layout.plotT || y > g.layout.plotB) return null;
      const panel = g.layout[key];
      const max = key === "qc" ? scales.qcMax : scales.fsMax;
      return pickSeries(series, key, x, y, (v) => valueToX(v, panel, max), (level) => levelToY(level, g.win, g.layout));
    },
    [geometry, series, scales],
  );

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const g = geometry();
    if (!g) return;
    const x = e.clientX - g.rect.left;
    const y = e.clientY - g.rect.top;
    const inside = panelAt(x, g.layout) !== null && y >= g.layout.plotT && y <= g.layout.plotB;
    setHoverLevel(inside ? yToLevel(y, g.win, g.layout) : null);
    setCursor(seriesAt(x, y) ? "pointer" : "crosshair");
  };

  // Drag = vertical pan; a click without dragging on a line makes that CPT active.
  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const g = geometry();
    if (!g || e.button !== 0) return;
    e.preventDefault();
    const x0 = e.clientX;
    const y0 = e.clientY;
    const startPan = panY;
    const metresPerPx = (g.win.top - g.win.bottom) / g.layout.plotH;
    let dragged = false;
    const onMove = (ev: MouseEvent) => {
      const dy = ev.clientY - y0;
      if (!dragged && Math.abs(dy) <= 3 && Math.abs(ev.clientX - x0) <= 3) return;
      if (!dragged) {
        dragged = true;
        document.body.style.cursor = "grabbing";
        document.body.style.userSelect = "none";
        setCursor("grabbing");
        setHoverLevel(null);
      }
      // The level under the pointer follows the pointer.
      setPanY(startPan - dy * metresPerPx);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      if (dragged) {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        setCursor("crosshair");
        return;
      }
      const id = seriesAt(x0 - g.rect.left, y0 - g.rect.top);
      if (id) setActive(id);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const levelText =
    hoverLevel === null
      ? t("overlay.hoverHint", "Beweeg over de grafiek voor de waarden op één niveau.")
      : scales.anyNap
        ? t("overlay.levelNap", "NAP {{level}} m", { level: formatNap(hoverLevel) })
        : t("overlay.levelDepth", "{{level}} m onder maaiveld", { level: Math.abs(hoverLevel).toFixed(2) });

  return (
    <div className="overlay-chart">
      <div className="overlay-chart-plot">
        <canvas
          ref={canvasRef}
          onMouseMove={onMouseMove}
          onMouseLeave={() => { setHoverLevel(null); setCursor("crosshair"); }}
          onMouseDown={onMouseDown}
          style={{ width: "100%", height: "100%", display: "block", cursor }}
        />
        {series.length === 0 && (
          <div className="overlay-chart-empty">{t("overlay.noVisible", "Geen zichtbare sonderingen.")}</div>
        )}
        {withoutNap.length > 0 && (
          <div className="overlay-chart-note" role="note">
            <OaIcon id="status.warning" size={16} />
            <span>
              {t(
                "overlay.noNapNote",
                "Zonder NAP-maaiveld, getekend op diepte onder maaiveld en dus niet op NAP: {{names}}",
                { names: withoutNap.join(", ") },
              )}
            </span>
          </div>
        )}
      </div>
      <aside className="overlay-legend" aria-label={t("overlay.legendTitle", "Sonderingen")}>
        <div className="overlay-legend-level" aria-live="off">{levelText}</div>
        <div className="overlay-legend-head">
          <span>{t("overlay.legendTitle", "Sonderingen")}</span>
          <span>qc</span>
          <span>fs</span>
        </div>
        <ul className="overlay-legend-list">
          {series.map((s) => {
            const style = styles.get(s.id) ?? seriesStyle(0);
            const active = s.id === activeCptId;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  className={`overlay-legend-row${active ? " active" : ""}`}
                  aria-pressed={active}
                  title={s.id}
                  onClick={() => setActive(s.id)}
                >
                  <svg className="overlay-legend-swatch" width="26" height="10" viewBox="0 0 26 10" aria-hidden="true">
                    <line
                      x1="1" y1="5" x2="25" y2="5"
                      stroke={style.color}
                      strokeWidth={active ? 3.2 : 2}
                      strokeDasharray={style.dash.length ? style.dash.join(" ") : undefined}
                    />
                  </svg>
                  <span className="overlay-legend-name">
                    {s.id}
                    {!s.hasNap && <em>{t("overlay.noNapTag", "geen NAP")}</em>}
                  </span>
                  <span className="overlay-legend-value">
                    {hoverLevel === null ? "" : fmt(valueAtLevel(s, "qc", hoverLevel), 2)}
                  </span>
                  <span className="overlay-legend-value">
                    {hoverLevel === null ? "" : fmt(valueAtLevel(s, "fs", hoverLevel), 3)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="overlay-legend-units">{t("overlay.units", "qc en fs in MPa")}</div>
      </aside>
    </div>
  );
}
