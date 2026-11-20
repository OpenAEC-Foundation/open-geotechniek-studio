// De onderlegger met inzoomen en verschuiven. Klikken zet een punt, slepen op een punt verplaatst het,
// slepen op de onderlegger verschuift het beeld en het muiswiel zoomt op de plek van de muis.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Px } from "./calibration";

export interface StageImage { src?: string; width: number; height: number }
export interface Marker { id: string; x: number; y: number; tone: "depth" | "value" | "point"; label?: string; active?: boolean; locked?: boolean }

interface Props {
  image: StageImage | null;
  markers: Marker[];
  /** Raster en lijnen in beeldcoördinaten; `k` is de zoomfactor, voor lijndikten en tekst op schermmaat. */
  children?: (k: number) => ReactNode;
  /** Klik zonder slepen; `onMarker` is het punt waarop geklikt is, als dat zo is. */
  onPlace?: (p: Px, onMarker?: string) => void;
  onDragStart?: (id: string) => void;
  onDrag?: (id: string, p: Px) => void;
  onRemove?: (id: string) => void;
  emptyText: string;
  labels: { zoomIn: string; zoomOut: string; fit: string; stage: string };
}

interface View { k: number; tx: number; ty: number }
type Drag = { kind: "marker"; id: string; x: number; y: number; moved: boolean } | { kind: "pan"; x: number; y: number; tx: number; ty: number; moved: boolean; button: number };

const MIN_ZOOM = 0.05, MAX_ZOOM = 40;

export default function Stage({ image, markers, children, onPlace, onDragStart, onDrag, onRemove, emptyText, labels }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const drag = useRef<Drag | null>(null);
  const [view, setView] = useState<View>({ k: 1, tx: 0, ty: 0 });
  const width = image?.width ?? 0, height = image?.height ?? 0;

  const fit = useCallback(() => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height || !width || !height) { setView({ k: 1, tx: 0, ty: 0 }); return; }
    const k = Math.min(rect.width / width, rect.height / height) * 0.96;
    setView({ k, tx: (rect.width - width * k) / 2, ty: (rect.height - height * k) / 2 });
  }, [width, height]);
  useEffect(fit, [fit, image?.src]);

  const zoomAt = useCallback((factor: number, cx?: number, cy?: number) => {
    setView((v) => {
      const rect = svgRef.current?.getBoundingClientRect();
      const x = cx ?? (rect?.width ?? 0) / 2, y = cy ?? (rect?.height ?? 0) / 2;
      const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.k * factor)), f = k / v.k;
      return { k, tx: x - (x - v.tx) * f, ty: y - (y - v.ty) * f };
    });
  }, []);

  // Het muiswiel moet het scherm niet meescrollen; dat kan alleen met een niet-passieve luisteraar.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX - rect.left, e.clientY - rect.top);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const toImage = (e: React.MouseEvent): Px => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: (e.clientX - rect.left - view.tx) / view.k, y: (e.clientY - rect.top - view.ty) / view.k };
  };
  const inside = (p: Px) => p.x >= 0 && p.y >= 0 && p.x <= width && p.y <= height;
  const clamp = (p: Px): Px => ({ x: Math.min(width, Math.max(0, p.x)), y: Math.min(height, Math.max(0, p.y)) });
  const markerOf = (e: React.MouseEvent) => (e.target as Element).closest?.("[data-marker]")?.getAttribute("data-marker") ?? null;

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button === 2 || !image) return;
    const id = e.button === 0 ? markerOf(e) : null;
    if (id) drag.current = { kind: "marker", id, x: e.clientX, y: e.clientY, moved: false };
    else drag.current = { kind: "pan", x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty, moved: false, button: e.button };
    e.preventDefault();
  };
  const onMouseMove = (e: React.MouseEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (d.kind === "marker") {
      // Pas bij echt slepen: een klik op een punt verplaatst het niet.
      if (!d.moved) onDragStart?.(d.id);
      d.moved = true;
      onDrag?.(d.id, clamp(toImage(e)));
      return;
    }
    d.moved = true;
    setView((v) => ({ ...v, tx: d.tx + dx, ty: d.ty + dy }));
  };
  const onMouseUp = (e: React.MouseEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved || (d.kind === "pan" && d.button !== 0)) return;
    const p = toImage(e);
    if (inside(p)) onPlace?.(p, d.kind === "marker" ? d.id : undefined);
  };
  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const id = markerOf(e);
    if (id) onRemove?.(id);
  };

  return (
    <div className="dig-stage">
      <svg ref={svgRef} className="dig-svg" role="img" aria-label={labels.stage} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}
        onMouseLeave={() => { drag.current = null; }} onContextMenu={onContextMenu}>
        {image && (
          <g transform={`translate(${view.tx} ${view.ty}) scale(${view.k})`}>
            <rect className="dig-paper" x={0} y={0} width={width} height={height} />
            {image.src && <image href={image.src} x={0} y={0} width={width} height={height} preserveAspectRatio="none" />}
            <clipPath id="dig-clip"><rect x={0} y={0} width={width} height={height} /></clipPath>
            <g clipPath="url(#dig-clip)">{children?.(view.k)}</g>
            {markers.map((m) => (
              <g key={m.id} {...(m.locked ? {} : { "data-marker": m.id })} className={`dig-marker dig-marker-${m.tone}${m.active ? " active" : ""}${m.locked ? " locked" : ""}`}
                transform={`translate(${m.x} ${m.y}) scale(${1 / view.k})`}>
                <circle className="dig-marker-hit" r={10} />
                <circle className="dig-marker-ring" r={m.tone === "point" ? 5 : 7} />
                <path className="dig-marker-cross" d={m.tone === "point" ? "M-2 0H2M0 -2V2" : "M-11 0H11M0 -11V11"} />
                {m.label && <text className="dig-marker-label" x={10} y={-9}>{m.label}</text>}
              </g>
            ))}
          </g>
        )}
      </svg>
      {!image && <div className="dig-stage-empty">{emptyText}</div>}
      {image && (
        <div className="dig-zoom">
          <button type="button" title={labels.zoomIn} aria-label={labels.zoomIn} onClick={() => zoomAt(1.4)}>+</button>
          <button type="button" title={labels.zoomOut} aria-label={labels.zoomOut} onClick={() => zoomAt(1 / 1.4)}>−</button>
          <button type="button" title={labels.fit} onClick={fit}>{labels.fit}</button>
          <span>{Math.round(view.k * 100)}%</span>
        </div>
      )}
    </div>
  );
}
