// Geplaatste berekeningen op een Leaflet-kaart (de Kaart en de Situatietekening): paalsymbolen, damwandlijnen met
// arcering aan de kerende kant, funderingen; en het tekenen van een plaatsing door punten aan te klikken.
import * as L from "leaflet";
import proj4 from "proj4";
import i18next from "i18next";
import { useCalculationsStore } from "../calc/framework/store";
import type { CalculationInstance } from "../calc/framework/types";
import { useCptStore } from "../store/useCptStore";
import { calcSpec } from "./calcGeometry";
import { rectangleCorners, wallHatch } from "./geometry";
import { activeCalcs, calcColor, calcStatus, openCalculation, projectContext, setPlacement, STATUS_COLOR, usePlacementStore, type Drawing } from "./store";
import { hasGeometry, type Placement, type RdXY, type WallPlacement } from "./types";
import "./placement.css";

proj4.defs(
  "EPSG:28992",
  "+proj=sterea +lat_0=52.15616055555555 +lon_0=5.38763888888889 " +
    "+k=0.9999079 +x_0=155000 +y_0=463000 +ellps=bessel " +
    "+towgs84=565.417,50.3319,465.552,-0.398957,0.343988,-1.8774,4.0725 " +
    "+units=m +no_defs",
);
const RD = proj4("WGS84", "EPSG:28992");
export const rdToLatLng = (p: RdXY): L.LatLng => { const [lon, lat] = RD.inverse([p.x, p.y]); return L.latLng(lat, lon); };
export const latLngToRd = (ll: { lat: number; lng: number }): RdXY => { const [x, y] = RD.forward([ll.lng, ll.lat]); return { x, y }; };

/** Eigen laag boven de GIS-lagen (gebouwen, percelen), onder de markers. */
const PANE = "placementPane";

const tr = (key: string, fallback: string, opts: Record<string, unknown> = {}) => i18next.t(`placement:${key}`, { defaultValue: fallback, ...opts });

/** Paalsymbool: cirkel met kruis in de kleur van de berekening, met een rand in de kleur van de uitkomst. */
function pileIcon(color: string, status: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><circle cx="9" cy="9" r="7.5" fill="#fff" stroke="${status}" stroke-width="2.5"/><circle cx="9" cy="9" r="5" fill="none" stroke="${color}" stroke-width="1.6"/><path d="M5.5 5.5L12.5 12.5M12.5 5.5L5.5 12.5" stroke="${color}" stroke-width="1.6"/></svg>`;
  return L.divIcon({ html: svg, className: "placement-pile-icon", iconSize: [18, 18], iconAnchor: [9, 9] });
}

function drawCalc(group: L.LayerGroup, calc: CalculationInstance, all: CalculationInstance[], drawing: () => boolean) {
  const p = calc.placement;
  if (!hasGeometry(p)) return;
  const color = calcColor(calc.id), status = STATUS_COLOR[calcStatus(calc, projectContext(all)).status];
  const open = (id: string) => (e: L.LeafletMouseEvent) => { if (drawing()) return; L.DomEvent.stopPropagation(e); openCalculation(id); };
  const tip = (name: string) => `${name} · ${tr("map.clickToOpen", "klik om de berekening te openen")}`;
  if (p.kind === "piles") {
    for (const q of p.positions) {
      const m = L.marker(rdToLatLng(q), { icon: pileIcon(color, status), riseOnHover: true, interactive: true });
      m.bindTooltip(`${calc.name} · ${q.label ?? q.id}`, { direction: "top", offset: [0, -8] });
      m.on("click", open(calc.id));
      group.addLayer(m);
    }
  }
  if (p.kind === "wall") {
    const lls = p.points.map(rdToLatLng);
    if (p.closed && p.excavation === "inside") group.addLayer(L.polygon(lls, { pane: PANE, stroke: false, fillColor: "#93c5fd", fillOpacity: 0.15, interactive: false }));
    const n = p.points.length, count = p.closed ? n : n - 1;
    for (let k = 0; k < count; k++) {
      const sideId = p.sideCalcIds?.[k] && all.some((c) => c.id === p.sideCalcIds![k]) ? p.sideCalcIds![k]! : calc.id;
      const other = all.find((c) => c.id === sideId) ?? calc;
      const line = L.polyline([lls[k], lls[(k + 1) % n]], { pane: PANE, color: calcColor(sideId), weight: 3.5, lineCap: "butt" });
      line.bindTooltip(tip(other.name), { sticky: true });
      line.on("click", open(sideId));
      group.addLayer(line);
    }
    const hatch = wallHatch(p, 1, 0.6).map(([a, b]) => [rdToLatLng(a), rdToLatLng(b)]);
    if (hatch.length) group.addLayer(L.polyline(hatch, { pane: PANE, color, weight: 1, interactive: false }));
  }
  if (p.kind === "footing") {
    const spec = calcSpec(calc);
    if (spec?.kind !== "footing") return;
    const corners = rectangleCorners(p.x, p.y, spec.footing.widthM, spec.footing.lengthM ?? p.lengthM ?? 10, p.angleDeg).map(rdToLatLng);
    const poly = L.polygon(corners, { pane: PANE, color: status, weight: 2, fillColor: color, fillOpacity: 0.35 });
    poly.bindTooltip(tip(calc.name), { sticky: true });
    poly.on("click", open(calc.id));
    group.addLayer(poly);
  }
}

/** Rondt het tekenen af: de aangeklikte punten worden de plaatsing van de berekening. */
export function finishDrawing(d: Drawing, closed: boolean, calcs: CalculationInstance[]): Placement | undefined {
  const calc = calcs.find((c) => c.id === d.calcId);
  if (!calc || !d.points.length) return calc?.placement;
  const old = calc.placement;
  if (d.kind === "piles") {
    const prev = old?.kind === "piles" ? old.positions : [];
    const used = new Set(prev.map((x) => x.id));
    let k = prev.length;
    const added = d.points.map((q) => { do k++; while (used.has(`P${k}`)); used.add(`P${k}`); return { id: `P${k}`, x: q.x, y: q.y }; });
    return { kind: "piles", positions: [...prev, ...added] };
  }
  if (d.kind === "wall") {
    if (d.points.length < 2) return old;
    const isClosed = closed && d.points.length >= 3;
    const prev = old?.kind === "wall" ? old.excavation : undefined;
    const excavation: WallPlacement["excavation"] = isClosed ? (prev === "outside" ? "outside" : "inside") : (prev === "left" ? "left" : "right");
    return { kind: "wall", points: d.points, closed: isClosed, excavation };
  }
  const q = d.points[d.points.length - 1];
  return { kind: "footing", x: q.x, y: q.y, angleDeg: old?.kind === "footing" ? old.angleDeg : 0, ...(old?.kind === "footing" && old.lengthM ? { lengthM: old.lengthM } : {}) };
}

/**
 * Hangt de laag met plaatsingen aan een kaart en volgt de berekeningen en het tekenen. Geeft een functie terug die
 * alles weer losmaakt (aanroepen vóór map.remove()).
 */
export function attachPlacementLayer(map: L.Map): () => void {
  if (!map.getPane(PANE)) map.createPane(PANE).style.zIndex = "550";
  const group = L.layerGroup().addTo(map);
  const preview = L.layerGroup().addTo(map);
  let bar: HTMLDivElement | null = null;
  let dblWasOn = map.doubleClickZoom.enabled();
  const isDrawing = () => !!usePlacementStore.getState().drawing;

  const render = () => {
    group.clearLayers();
    const { calcs } = activeCalcs();
    for (const c of calcs) drawCalc(group, c, calcs, isDrawing);
  };

  const finish = (closed: boolean) => {
    const st = usePlacementStore.getState(), d = st.drawing;
    if (!d) return;
    const next = finishDrawing(d, closed, activeCalcs().calcs);
    if (next && next !== activeCalcs().calcs.find((c) => c.id === d.calcId)?.placement) setPlacement(d.calcId, next);
    st.cancelDrawing();
  };

  const renderDrawing = () => {
    preview.clearLayers();
    const d = usePlacementStore.getState().drawing;
    const el = map.getContainer();
    if (!d) {
      if (bar) { bar.remove(); bar = null; }
      el.style.cursor = "";
      if (dblWasOn) map.doubleClickZoom.enable();
      return;
    }
    el.style.cursor = "crosshair";
    if (map.doubleClickZoom.enabled()) { dblWasOn = true; map.doubleClickZoom.disable(); }
    const lls = d.points.map(rdToLatLng);
    if (d.kind === "wall" && lls.length >= 2) preview.addLayer(L.polyline(lls, { pane: PANE, color: "#d97706", weight: 3, dashArray: "6 4", interactive: false }));
    for (const ll of lls) preview.addLayer(L.circleMarker(ll, { pane: PANE, radius: 4, color: "#d97706", fillColor: "#fff", fillOpacity: 1, weight: 2, interactive: false }));
    const calc = activeCalcs().calcs.find((c) => c.id === d.calcId);
    const hint = d.kind === "wall"
      ? tr("draw.hintWall", "Klik de hoekpunten van de damwand. Dubbelklik of Klaar rondt af als lijn; Sluit maakt er een bouwkuip van.")
      : d.kind === "piles" ? tr("draw.hintPiles", "Klik een plaats per paal. Klaar of Enter rondt af.") : tr("draw.hintFooting", "Klik het middelpunt van de fundering.");
    const html = `<div class="placement-drawbar"><strong>${(calc?.name ?? "").replace(/</g, "&lt;")}</strong><span>${hint}</span>`
      + `<span>${tr("draw.points", "{{n}} punten", { n: d.points.length })}</span>`
      + `<button data-act="undo">${tr("draw.undo", "Terug")}</button>`
      + (d.kind === "wall" ? `<button data-act="close">${tr("draw.close", "Sluit bouwkuip")}</button>` : "")
      + `<button data-act="done" class="primary">${tr("draw.done", "Klaar")}</button>`
      + `<button data-act="cancel">${tr("draw.cancel", "Annuleren")}</button></div>`;
    // Buiten de kaart, vast in beeld: de situatietekening schaalt het papier (en alles erin) mee.
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "placement-drawbar-host";
      bar.addEventListener("click", (e) => {
        const act = (e.target as HTMLElement).closest("button")?.dataset.act;
        if (act === "undo") usePlacementStore.getState().undoPoint();
        if (act === "done") finish(false);
        if (act === "close") finish(true);
        if (act === "cancel") usePlacementStore.getState().cancelDrawing();
      });
      document.body.appendChild(bar);
    }
    bar.innerHTML = html;
    const r = el.getBoundingClientRect();
    bar.style.top = `${Math.max(4, r.top + 8)}px`;
    bar.style.left = `${Math.max(4, r.left + r.width / 2)}px`;
  };

  const onClick = (e: L.LeafletMouseEvent) => {
    const d = usePlacementStore.getState().drawing;
    if (!d) return;
    usePlacementStore.getState().addPoint(latLngToRd(e.latlng));
    if (d.kind === "footing") finish(false);
  };
  const onDbl = (e: L.LeafletMouseEvent) => {
    const d = usePlacementStore.getState().drawing;
    if (!d || d.kind !== "wall") return;
    L.DomEvent.stopPropagation(e);
    // De dubbelklik zette twee keer hetzelfde punt; één eraf.
    usePlacementStore.getState().undoPoint();
    finish(false);
  };
  const onKey = (e: KeyboardEvent) => {
    if (!isDrawing()) return;
    if (e.key === "Escape") usePlacementStore.getState().cancelDrawing();
    if (e.key === "Enter") finish(false);
    if (e.key === "Backspace" && !(e.target instanceof HTMLInputElement)) usePlacementStore.getState().undoPoint();
  };
  map.on("click", onClick);
  map.on("dblclick", onDbl);
  window.addEventListener("keydown", onKey);
  const unsubs = [
    useCalculationsStore.subscribe(render),
    useCptStore.subscribe((s, prev) => { if (s.activeDocId !== prev.activeDocId || s.cpts !== prev.cpts) render(); }),
    usePlacementStore.subscribe((s, prev) => { if (s.drawing !== prev.drawing) renderDrawing(); }),
  ];
  render();
  renderDrawing();
  return () => {
    for (const u of unsubs) u();
    map.off("click", onClick);
    map.off("dblclick", onDbl);
    window.removeEventListener("keydown", onKey);
    bar?.remove();
    group.remove();
    preview.remove();
  };
}
