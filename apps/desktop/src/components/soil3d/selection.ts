// Selecteren in het 3D-model: wat er onder de muis ligt, het kader eromheen en de eigenschappen ervan.
import * as THREE from "three";
import { fromRd, rdExtent, toRd, zoneAt, zoneInfo, type SoilModel } from "./soilModel";
import { piezoLayout, PIEZO_COLORS } from "./scene";
import type { Well } from "./subsurface/groundwater";
import { aquifers } from "./subsurface/regis";
import { LITHOCLASSES } from "./subsurface/geotop";
import type { SubsurfaceData } from "./subsurface/store";

/** Punt in modelcoördinaten: oost en noord t.o.v. het modelmidden, hoogte in m NAP. */
export interface ModelPoint { east: number; north: number; nap: number }

export type Selection =
  | { kind: "cpt"; cptId: string; point: ModelPoint }
  | { kind: "cell"; cell: number; point: ModelPoint }
  | { kind: "aquifer"; aquifer: number; cell: number; point: ModelPoint }
  | { kind: "geotop"; voxel: number; point: ModelPoint }
  | { kind: "well"; wellId: string; point: ModelPoint }
  | { kind: "piezo"; index: number; point: ModelPoint }
  | { kind: "water"; point: ModelPoint }
  | { kind: "bearing"; point: ModelPoint }
  | { kind: "ground"; point: ModelPoint }
  | { kind: "toe"; cptId: string; name: string; toeNap: number; point: ModelPoint };

/** Selectie uit een treffer van de raycaster; null als het object niet selecteerbaar is. */
export function selectionFromHit(hit: THREE.Intersection, ex: number): Selection | null {
  let obj: THREE.Object3D | null = hit.object;
  while (obj && !obj.userData.kind) obj = obj.parent;
  if (!obj) return null;
  const d = obj.userData as Record<string, unknown>;
  const point: ModelPoint = { east: hit.point.x, north: -hit.point.z, nap: hit.point.y / ex };
  const inst = hit.instanceId ?? -1;
  switch (d.kind) {
    case "cpt": return { kind: "cpt", cptId: String(d.cptId), point };
    case "cell": return inst >= 0 ? { kind: "cell", cell: (d.cells as number[])[inst], point } : null;
    case "aquifer": return inst >= 0 ? { kind: "aquifer", aquifer: Number(d.aquifer), cell: (d.cells as number[])[inst], point } : null;
    case "geotop": return inst >= 0 ? { kind: "geotop", voxel: (d.voxels as number[])[inst], point } : null;
    case "well": return { kind: "well", wellId: String(d.wellId), point };
    case "piezo": return { kind: "piezo", index: Number(d.index), point };
    case "water": return { kind: "water", point };
    case "bearing": return { kind: "bearing", point };
    case "ground": return { kind: "ground", point };
    case "toe": return { kind: "toe", cptId: String(d.cptId), name: String(d.name), toeNap: Number(d.toeNap), point };
  }
  return null;
}

/** Kader om de selectie, in scènecoördinaten (hoogte maal overhoogte). */
export function selectionBox(sel: Selection, model: SoilModel, sub: SubsurfaceData | null, ex: number): THREE.Box3 | null {
  const g = model.grid;
  const box = (e0: number, e1: number, n0: number, n1: number, z0: number, z1: number) =>
    new THREE.Box3(new THREE.Vector3(e0, z0 * ex, -n1), new THREE.Vector3(e1, z1 * ex, -n0));
  // Een rechthoek in RD; bij een gedraaid model het omsluitende kader in modelcoördinaten.
  const rdBox = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
    const c = [fromRd(model, x0, y0), fromRd(model, x1, y0), fromRd(model, x1, y1), fromRd(model, x0, y1)];
    return box(Math.min(...c.map((p) => p.east)), Math.max(...c.map((p) => p.east)), Math.min(...c.map((p) => p.north)), Math.max(...c.map((p) => p.north)), z0, z1);
  };
  const area = rdExtent(model, g.east0, g.east0 + g.nx * g.dx, g.north0, g.north0 + g.ny * g.dy);
  const ax0 = area.xmin, ax1 = area.xmax, ay0 = area.ymin, ay1 = area.ymax;
  const r = Math.max(0.25, model.span / 90) * 2.2;
  switch (sel.kind) {
    case "cpt": {
      const c = model.columns.find((x) => x.id === sel.cptId);
      return c ? box(c.east - r, c.east + r, c.north - r, c.north + r, c.endNap, c.groundNap) : null;
    }
    case "cell": {
      const i = sel.cell % g.nx, j = Math.floor(sel.cell / g.nx) % g.ny, k = Math.floor(sel.cell / (g.nx * g.ny));
      const e0 = g.east0 + i * g.dx, n0 = g.north0 + j * g.dy, zt = g.topNap - k * g.dz;
      return box(e0, e0 + g.dx, n0, n0 + g.dy, zt - g.dz, zt);
    }
    case "aquifer": {
      const reg = sub?.regis; if (!reg) return null;
      const a = aquifers(reg).find((p) => p.index === sel.aquifer); if (!a) return null;
      const i = sel.cell % reg.nx, j = Math.floor(sel.cell / reg.nx);
      const x0 = Math.max(ax0, reg.x0 + i * reg.cell), x1 = Math.min(ax1, reg.x0 + (i + 1) * reg.cell);
      const y0 = Math.max(ay0, reg.y0 + j * reg.cell), y1 = Math.min(ay1, reg.y0 + (j + 1) * reg.cell);
      const t = a.top[sel.cell], b = a.bottom[sel.cell];
      return t === null || b === null ? null : rdBox(x0, x1, y0, y1, b, t);
    }
    case "geotop": {
      const gt = sub?.geotop; if (!gt) return null;
      const ny = gt.ys.length, nz = gt.zs.length;
      const i = Math.floor(sel.voxel / (ny * nz)), j = Math.floor(sel.voxel / nz) % ny, k = sel.voxel % nz;
      const x0 = Math.max(ax0, gt.xs[i] - gt.cell / 2), x1 = Math.min(ax1, gt.xs[i] + gt.cell / 2);
      const y0 = Math.max(ay0, gt.ys[j] - gt.cell / 2), y1 = Math.min(ay1, gt.ys[j] + gt.cell / 2);
      return rdBox(x0, x1, y0, y1, gt.zs[k] - gt.dz / 2, gt.zs[k] + gt.dz / 2);
    }
    case "well": {
      const w = sub?.wells?.find((x) => x.id === sel.wellId);
      if (!w || w.screenTop === null || w.screenBottom === null) return null;
      const p = fromRd(model, w.x, w.y);
      return box(p.east - r, p.east + r, p.north - r, p.north + r, w.screenBottom, Math.max(w.screenTop + 2, w.stats?.max ?? w.screenTop));
    }
    case "piezo": {
      const row = piezoLayout(model, sub, ex), t = row?.tubes.find((x) => x.index === sel.index);
      if (!row || !t) return null;
      const m = row.r * 4;
      return box(t.east - m, t.east + m, t.north - m, t.north + m, t.filterBottom, t.top);
    }
    case "water": {
      const z = sub?.groundwater.phreaticNap; if (z === null || z === undefined) return null;
      return box(g.east0, g.east0 + g.nx * g.dx, g.north0, g.north0 + g.ny * g.dy, z - 0.05, z + 0.05);
    }
    case "toe": {
      const c = model.columns.find((x) => x.id === sel.cptId);
      return c ? box(c.east - r * 2.5, c.east, c.north - r, c.north + r, sel.toeNap, sel.toeNap + 1) : null;
    }
    default:
      return box(sel.point.east - r, sel.point.east + r, sel.point.north - r, sel.point.north + r, sel.point.nap - 0.25, sel.point.nap + 0.25);
  }
}

/** Verloop van de grondwaterstand voor het paneel: een lijn per peilbuis, plus de gekozen stand. */
export interface LevelChart { series: { id: string; color: string; points: [number, number][] }[]; head: number | null; headColor: string }
export interface PropertyGroup { title: string; subtitle?: string; rows: [string, string][]; chart?: LevelChart; note?: string; /** Kleur van de lijn in de grafiek, als stip voor de titel. */ color?: string }

const f = (v: number | null | undefined, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? "–" : v.toFixed(d).replace(".", ","));
const rd = (model: SoilModel, p: ModelPoint) => { const q = toRd(model, p.east, p.north); return `${f(q.x, 1)} / ${f(q.y, 1)}`; };

/** Eigenschappen van de selectie, als groepen label–waarde. */
export function describeSelection(sel: Selection, model: SoilModel, sub: SubsurfaceData | null): PropertyGroup[] {
  const g = model.grid;
  const here: [string, string][] = [["RD x / y", rd(model, sel.point)], ["Hoogte", `NAP ${f(sel.point.nap)} m`]];
  switch (sel.kind) {
    case "cpt": {
      const c = model.columns.find((x) => x.id === sel.cptId);
      if (!c) return [];
      const layer = c.layers.find((l) => sel.point.nap <= l.topNap && sel.point.nap >= l.bottomNap);
      const near = c.qc.reduce<{ nap: number; qc: number } | null>((best, p) => (!best || Math.abs(p.nap - sel.point.nap) < Math.abs(best.nap - sel.point.nap) ? p : best), null);
      return [
        { title: `Sondering ${c.id}`, subtitle: "IfcBorehole", rows: [
          ["RD x / y", (() => { const q = toRd(model, c.east, c.north); return `${f(q.x, 2)} / ${f(q.y, 2)}`; })()],
          ["Maaiveld", `NAP ${f(c.groundNap)} m`], ["Einde", `NAP ${f(c.endNap)} m (${f(c.groundNap - c.endNap, 1)} m diep)`],
          ["Draagkrachtige laag", c.bearingTopNap === null ? "niet gevonden" : `NAP ${f(c.bearingTopNap)} m`],
          ["Lagen", String(c.layers.length)],
        ] },
        { title: "Op het aangeklikte niveau", rows: [
          ["Hoogte", `NAP ${f(sel.point.nap)} m`],
          ["Laag", layer ? `${layer.name} (NAP ${f(layer.topNap)} tot ${f(layer.bottomNap)})` : "–"],
          ["qc", near ? `${f(near.qc)} MPa` : "–"],
        ] },
      ];
    }
    case "cell": {
      const i = sel.cell % g.nx, j = Math.floor(sel.cell / g.nx) % g.ny, k = Math.floor(sel.cell / (g.nx * g.ny));
      const zone = g.zone[sel.cell], info = zoneInfo(zone);
      const e = g.east0 + (i + 0.5) * g.dx, n = g.north0 + (j + 0.5) * g.dy, z = g.topNap - (k + 0.5) * g.dz;
      // Stemming zoals in buildSoilModel: gewicht 1/d² per sondering met een laag op dit niveau.
      const votes = model.columns.filter((c) => c.placed).map((c) => {
        const w = 1 / Math.max(0.01, Math.hypot(c.east - e, c.north - n)) ** 2;
        return { id: c.id, zone: zoneAt(c, z), w, d: Math.hypot(c.east - e, c.north - n) };
      }).filter((v) => v.zone);
      const total = votes.reduce((s, v) => s + v.w, 0);
      return [
        { title: info?.name ?? `Zone ${zone}`, subtitle: "Cel van het grondmodel (IfcGeotechnicalStratum)", rows: [
          ["RD x / y (midden)", rd(model, { east: e, north: n, nap: z })],
          ["Hoogte", `NAP ${f(z + g.dz / 2)} tot ${f(z - g.dz / 2)} m`],
          ["Celmaat", `${f(g.dx, 1)} × ${f(g.dy, 1)} × ${f(g.dz, 1)} m`],
        ] },
        { title: "Interpolatie (gewicht 1/d²)", rows: votes.sort((a, b) => b.w - a.w).slice(0, 6).map((v) => [
          `${v.id} · ${f(v.d, 1)} m`, `${zoneInfo(v.zone)?.name ?? v.zone} · ${Math.round((v.w / total) * 100)}%`,
        ] as [string, string]) },
      ];
    }
    case "aquifer": {
      const reg = sub?.regis; if (!reg) return [];
      const a = aquifers(reg).find((p) => p.index === sel.aquifer); if (!a) return [];
      const head = sub?.groundwater.heads[sel.aquifer - 1] ?? null;
      const t = a.top[sel.cell], b = a.bottom[sel.cell];
      return [{ title: `${sel.aquifer}e watervoerend pakket`, subtitle: "REGIS II · IfcGeotechnicalStratum (SOLID)", rows: [
        ["Bovenkant", `NAP ${f(t)} m`], ["Onderkant", `NAP ${f(b)} m`], ["Dikte", `${f(t !== null && b !== null ? t - b : null)} m`],
        ["kD", `${f(a.kD[sel.cell], 0)} m²/d`], ["kh (gemiddeld)", `${f(a.kh[sel.cell], 1)} m/d`],
        ["Stijghoogte", head === null ? "niet vastgelegd" : `NAP ${f(head)} m`],
        ["Eenheden", a.units.join(", ")], ...here,
      ] }];
    }
    case "geotop": {
      const gt = sub?.geotop; if (!gt) return [];
      const ny = gt.ys.length, nz = gt.zs.length;
      const i = Math.floor(sel.voxel / (ny * nz)), j = Math.floor(sel.voxel / nz) % ny, k = sel.voxel % nz;
      const lk = gt.lithok[sel.voxel];
      return [{ title: LITHOCLASSES[lk ?? -1]?.name ?? `Lithoklasse ${lk}`, subtitle: "GeoTOP-voxel", rows: [
        ["Voxelmidden RD", `${f(gt.xs[i], 0)} / ${f(gt.ys[j], 0)}`], ["Hoogte", `NAP ${f(gt.zs[k] + gt.dz / 2)} tot ${f(gt.zs[k] - gt.dz / 2)} m`],
        ["Voxel", `${gt.cell} × ${gt.cell} × ${f(gt.dz, 1)} m`], ["Lithoklasse", String(lk)],
      ] }];
    }
    case "well": {
      const w = sub?.wells?.find((x) => x.id === sel.wellId); if (!w) return [];
      const st = w.stats;
      return [{ title: w.id, subtitle: "Peilbuisfilter (BRO) · IfcSensor", rows: [
        ["RD x / y", `${f(w.x, 1)} / ${f(w.y, 1)}`], ["Filter", `NAP ${f(w.screenTop)} tot ${f(w.screenBottom)} m`],
        ["Pakket", w.aquifer === null ? "onbekend" : w.aquifer === 0 ? "deklaag" : `${w.aquifer}e watervoerend pakket`],
        ["Meetreeks", st ? `${st.n} metingen, ${st.first} – ${st.last}` : w.gld.length ? "niet opgehaald" : "geen"],
        ...(st ? [
          ["Gemiddeld (laatste 5 jaar)", `NAP ${f(st.recentMean)} m`], ["Hoogste / laagste", `NAP ${f(st.max)} / ${f(st.min)} m`],
          ["GHG / GLG (benadering)", st.ghg === null ? "te weinig volledige jaren" : `NAP ${f(st.ghg)} / ${f(st.glg)} m`],
          ["Laatste meting", `NAP ${f(st.lastValue)} m (${st.last})`],
        ] as [string, string][] : []),
      ] }];
    }
    case "piezo": return describePiezo(sel.index, model, sub);
    case "water": {
      const gw = sub?.groundwater;
      return [{ title: "Freatisch grondwater", subtitle: "IfcGeotechnicalStratum (WATER)", rows: [
        ["Stand", `NAP ${f(gw?.phreaticNap)} m`], ["Herkomst", gw?.source === "metingen" ? "afgeleid uit peilbuizen" : "handmatig vastgelegd"], ...here,
      ] }];
    }
    case "bearing":
      return [{ title: "Bovenkant draagkrachtige laag", subtitle: "Geïnterpoleerd vlak", rows: here }];
    case "ground":
      return [{ title: "Maaiveld", subtitle: "Geïnterpoleerd vlak", rows: here }];
    case "toe":
      return [{ title: `Paalpunt ${sel.name}`, subtitle: `bij sondering ${sel.cptId}`, rows: [["Puntniveau", `NAP ${f(sel.toeNap)} m`]] }];
  }
}

const SERIES_COLORS = ["#2563eb", "#ea580c", "#16a34a", "#9333ea", "#0891b2", "#be123c"];

/**
 * Peilbuis van een pakket: de vastgelegde stand, de diepte van het pakket en het verloop in de peilbuizen met een
 * filter in dat pakket (de dichtstbijzijnde zes).
 */
export function describePiezo(index: number, model: SoilModel, sub: SubsurfaceData | null): PropertyGroup[] {
  const gw = sub?.groundwater;
  const head = index === 0 ? gw?.phreaticNap ?? null : gw?.heads[index - 1] ?? null;
  const row = sub ? piezoLayout(model, sub, 1) : null;
  const tube = row?.tubes.find((t) => t.index === index);
  const name = index === 0 ? "Freatisch grondwater" : `${index}e watervoerend pakket`;
  const source = gw?.source === "metingen" ? "afgeleid uit peilbuizen (gemiddelde laatste 5 jaar)" : gw?.source === "handmatig" ? "handmatig vastgelegd" : "–";
  const dist = (w: Well) => Math.hypot(w.x - model.origin.x, w.y - model.origin.y);
  const wells = (sub?.wells ?? []).filter((w) => w.aquifer === index && w.stats).sort((a, b) => dist(a) - dist(b)).slice(0, 6);
  const main: PropertyGroup = { title: name, subtitle: "Stijghoogte · schematische peilbuis naast het model", rows: [
    ["Stand", head === null ? "niet vastgelegd" : `NAP ${f(head)} m`],
    ["Herkomst", source],
    ...(index === 0 ? [["Filter", "in de deklaag"]] as [string, string][] : [["Pakket (modelmidden)", tube?.packTop != null && tube?.packBottom != null ? `NAP ${f(tube.packTop)} tot ${f(tube.packBottom)} m` : "onbekend; haal de pakketten op"]] as [string, string][]),
    ["Peilbuizen in dit pakket", String((sub?.wells ?? []).filter((w) => w.aquifer === index).length)],
  ] };
  if (!wells.length) return [main, { title: "Verloop", rows: [], note: sub?.wells ? "Geen peilbuis met meetreeks in dit pakket." : "Haal het grondwater op om het verloop te zien." }];
  const series = wells.filter((w) => w.monthly?.length).map((w, i) => ({
    id: w.id, color: SERIES_COLORS[i % SERIES_COLORS.length],
    points: w.monthly!.map(([m, v]) => [Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 15), v] as [number, number]),
  }));
  const colorOf = new Map(series.map((s) => [s.id, s.color]));
  const all = wells.map((w) => w.stats!);
  const lo = Math.min(...all.map((s) => s.min)), hi = Math.max(...all.map((s) => s.max));
  const rows: [string, string][] = [["Laagste / hoogste", `NAP ${f(lo)} / ${f(hi)} m`], ["Variatie", `${f(hi - lo)} m`]];
  // Per peilbuis een eigen blok, met dezelfde kleur als haar lijn.
  const perWell: PropertyGroup[] = wells.map((w) => {
    const st = w.stats!;
    return { title: w.id, color: colorOf.get(w.id), subtitle: `${f(dist(w) / 1000, 1)} km van het model · filter NAP ${f(w.screenTop)} tot ${f(w.screenBottom)} m`, rows: [
      ["Gemiddeld (5 jaar)", `NAP ${f(st.recentMean)} m`], ["Laagste / hoogste", `NAP ${f(st.min)} / ${f(st.max)} m`],
      ["GHG / GLG", st.ghg === null ? "te weinig jaren" : `NAP ${f(st.ghg)} / ${f(st.glg)} m`], ["Meetperiode", `${st.first.slice(0, 4)}–${st.last.slice(0, 4)} (${st.n} metingen)`],
    ] };
  });
  return [main, {
    title: "Verloop", subtitle: "Peilbuizen met een filter in dit pakket, maandgemiddelden in m NAP", rows,
    chart: series.length ? { series, head, headColor: `#${PIEZO_COLORS[index % PIEZO_COLORS.length].toString(16).padStart(6, "0")}` } : undefined,
    note: series.length < wells.length ? "Van een deel van de peilbuizen is alleen de samenvatting bewaard; haal het grondwater opnieuw op voor het hele verloop." : undefined,
  }, ...perWell];
}
