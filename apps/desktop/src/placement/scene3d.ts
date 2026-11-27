// Geplaatste berekeningen in het 3D-grondmodel: palen van kop tot punt, de damwand langs de lijn van bovenkant tot
// teen (golfplaat als de profielbibliotheek een contour heeft), ankers en stempels, de ontgraving van de bouwkuip en
// funderingen op staal. Scènecoördinaten zoals in soil3d/scene.ts: x = oost, y = NAP × overhoogte, z = −noord,
// in het lokale stelsel van het grondmodel (soilModel.fromRd).
import * as THREE from "three";
import type { CalculationInstance, ProjectContext } from "../calc/framework/types";
import { fromRd, type SoilModel } from "../components/soil3d/soilModel";
import { profilePlan } from "../calc/modules/sheet-pile-wall/scene";
import { calcSpec, type CalcSpec, type WallSpec } from "./calcGeometry";
import { centroid, inPit, rayToPolygon, wallSides, type Side, type Vec } from "./geometry";
import { calcColor, calcStatus, STATUS_COLOR, type CalcStatus, type PlacementLayers } from "./store";
import { hasGeometry, type Placement, type WallPlacement } from "./types";

export interface PlacedItem {
  calc: CalculationInstance;
  placement: Placement;
  spec: CalcSpec;
  color: string;
  status: CalcStatus;
  statusText: string;
}

/** Berekeningen met een plaatsing en volledige invoer, met kleur en u.c.-status. */
export function placedItems(calcs: CalculationInstance[], ctx: ProjectContext | null): PlacedItem[] {
  const out: PlacedItem[] = [];
  for (const calc of calcs) {
    if (!hasGeometry(calc.placement)) continue;
    const spec = calcSpec(calc);
    if (!spec || spec.kind !== calc.placement.kind) continue;
    const st = ctx ? calcStatus(calc, ctx) : { status: "pending" as const, text: "" };
    out.push({ calc, placement: calc.placement, spec, color: calcColor(calc.id), status: st.status, statusText: st.text });
  }
  return out;
}

/** Wat de grondmodel-scène van de plaatsingen gebruikt: cellen die in de ontgraving vallen en de extra objecten. */
export interface PlacedScene {
  hideCell: ((east: number, north: number, nap: number) => boolean) | null;
  build: (ex: number) => THREE.Group;
}

/** Lokale modelcoördinaten van een RD-punt, als vlak punt (x = oost, y = noord). */
export function toLocal(model: Pick<SoilModel, "origin" | "rotation">, p: { x: number; y: number }): Vec {
  const q = fromRd(model, p.x, p.y);
  return { x: q.east, y: q.north };
}

/** Scènepunt van een lokaal punt op een NAP-hoogte. */
export const scenePoint = (p: Vec, nap: number, ex: number) => new THREE.Vector3(p.x, nap * ex, -p.y);

/** Gesloten bouwkuipen met de ontgraving binnen de kuip: veelhoek in lokale coördinaten en het ontgravingsniveau. */
export function pits(model: Pick<SoilModel, "origin" | "rotation">, items: PlacedItem[]): Array<{ poly: Vec[]; excavationNap: number; calcId: string }> {
  const out: Array<{ poly: Vec[]; excavationNap: number; calcId: string }> = [];
  for (const it of items) {
    if (it.placement.kind !== "wall" || it.spec.kind !== "wall") continue;
    const w = it.placement;
    if (!w.closed || w.excavation !== "inside" || w.points.length < 3) continue;
    out.push({ poly: w.points.map((p) => toLocal(model, p)), excavationNap: it.spec.wall.excavationNap, calcId: it.calc.id });
  }
  return out;
}

/** Valt een cel (middelpunt in lokale coördinaten en NAP) in de ontgraving van een bouwkuip? */
export function cellInExcavation(pitList: Array<{ poly: Vec[]; excavationNap: number }>, east: number, north: number, nap: number): boolean {
  for (const p of pitList) if (nap > p.excavationNap && inPit({ closed: true, excavation: "inside" }, p.poly, { x: east, y: north })) return true;
  return false;
}

function sprite(text: string, color: string, height: number) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.Sprite();
  const font = 44;
  ctx.font = `600 ${font}px sans-serif`;
  canvas.width = Math.ceil(ctx.measureText(text).width) + 16;
  canvas.height = font + 16;
  ctx.font = `600 ${font}px sans-serif`;
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(text, 8, canvas.height / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set((height * canvas.width) / canvas.height, height, 1);
  s.renderOrder = 10;
  return s;
}

/** Cilinder tussen twee scènepunten. */
function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, Math.max(len, 1e-3), 8), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  if (len > 1e-9) m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

/** Verticale band langs een vlakke lijn (golfplaat of rechte wand) van `bottom` tot `top` NAP. */
function ribbon(line: Vec[], bottom: number, top: number, ex: number) {
  const pos: number[] = [], idx: number[] = [];
  line.forEach((p, k) => {
    pos.push(p.x, bottom * ex, -p.y, p.x, top * ex, -p.y);
    if (k > 0) { const a = 2 * (k - 1); idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Hartlijn van de wand langs één zijde: de contour uit de profielbibliotheek, anders een rechte lijn. */
export function sideLine(side: Side, wall: WallSpec): Vec[] {
  const along = (a: number, x: number): Vec => ({ x: side.a.x + side.t.x * a + side.low.x * x, y: side.a.y + side.t.y * a + side.low.y * x });
  if (wall.construction === "sheet-pile" && wall.profile) {
    try {
      const line = profilePlan(wall.profile, side.length).line.filter((p) => p.a >= -1e-9 && p.a <= side.length + 1e-9);
      if (line.length >= 2) return line.map((p) => along(p.a, p.x));
    } catch { /* geen contour: recht */ }
  }
  return [along(0, 0), along(side.length, 0)];
}

/** Specificatie van de wand per zijde: de berekening die voor die zijde is aangewezen, anders de eigen. */
export function sideSpec(it: PlacedItem, k: number, byId: Map<string, PlacedItem | { spec: CalcSpec; calc: CalculationInstance }>): { spec: WallSpec; calcId: string; name: string } {
  const w = it.placement as WallPlacement, other = w.sideCalcIds?.[k];
  const o = other ? byId.get(other) : undefined;
  if (o && o.spec.kind === "wall") return { spec: o.spec.wall, calcId: o.calc.id, name: o.calc.name };
  return { spec: (it.spec as { kind: "wall"; wall: WallSpec }).wall, calcId: it.calc.id, name: it.calc.name };
}

/** Bouwt de plaatsingen als scène-uitbreiding voor het grondmodel. */
export function buildPlacedScene(model: SoilModel, items: PlacedItem[], layers: PlacementLayers, textColor: string, allCalcs: CalculationInstance[] = []): PlacedScene {
  const pitList = layers.pit ? pits(model, items) : [];
  // Andere damwandberekeningen die een zijde kunnen dragen, ook als ze zelf niet geplaatst zijn.
  const byId = new Map<string, { spec: CalcSpec; calc: CalculationInstance }>();
  for (const c of allCalcs) { const s = c.moduleId === "sheet-pile-wall" ? calcSpec(c) : null; if (s) byId.set(c.id, { spec: s, calc: c }); }
  for (const it of items) byId.set(it.calc.id, it);
  const thin = Math.max(0.04, model.span / 700), labelH = Math.max(0.8, model.span / 34);

  const build = (ex: number) => {
    const root = new THREE.Group();
    root.userData.placedRoot = true;
    const label = (text: string, at: THREE.Vector3) => { const s = sprite(text, textColor, labelH); s.position.copy(at); root.add(s); };
    for (const it of items) {
      const tag = { kind: "placed", calcId: it.calc.id, name: it.calc.name };
      const mat = new THREE.MeshLambertMaterial({ color: it.color });
      const ring = new THREE.MeshBasicMaterial({ color: STATUS_COLOR[it.status] });
      if (it.placement.kind === "piles" && it.spec.kind === "piles" && layers.piles) {
        const p = it.spec.pile, h = (p.topNap - p.toeNap) * ex;
        // Op ware grootte, maar nooit dunner dan een lijn op de schaal van het model.
        const r = Math.max(p.sizeM / 2, thin * 1.5);
        const group = new THREE.Group();
        group.userData = { ...tag };
        for (const pos of it.placement.positions) {
          const c = toLocal(model, pos);
          const shaft = new THREE.Mesh(p.circular ? new THREE.CylinderGeometry(r, r, h, 20) : new THREE.BoxGeometry(2 * r, h, 2 * r), mat);
          shaft.position.set(c.x, ((p.topNap + p.toeNap) / 2) * ex, -c.y);
          shaft.userData = { ...tag, item: pos.id };
          group.add(shaft);
          // Kleurrand met de uitkomst van de berekening rond de paalkop.
          const band = new THREE.Mesh(new THREE.TorusGeometry(r * 1.35, Math.max(r * 0.28, thin), 8, 28), ring);
          band.rotation.x = Math.PI / 2;
          band.position.set(c.x, p.topNap * ex, -c.y);
          band.userData = { ...tag, item: pos.id };
          group.add(band);
        }
        root.add(group);
        const first = toLocal(model, it.placement.positions[0]);
        label(it.calc.name, scenePoint(first, p.topNap, ex).add(new THREE.Vector3(0, labelH * 1.2, 0)));
      }
      if (it.placement.kind === "footing" && it.spec.kind === "footing" && layers.footings) {
        const f = it.spec.footing, pl = it.placement;
        const length = f.lengthM ?? pl.lengthM ?? 10;
        const top = f.groundNap - f.foundationNap >= 0.2 ? f.groundNap : f.foundationNap + 0.5;
        const c = toLocal(model, pl);
        const box = new THREE.BoxGeometry(length, (top - f.foundationNap) * ex, f.widthM);
        const mesh = new THREE.Mesh(box, mat);
        mesh.position.set(c.x, ((top + f.foundationNap) / 2) * ex, -c.y);
        // Draaiing in RD min de draaiing van het model; om de y-as in de scène.
        mesh.rotation.y = (pl.angleDeg * Math.PI) / 180 - (model.rotation ?? 0);
        mesh.userData = { ...tag };
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({ color: STATUS_COLOR[it.status] }));
        edges.userData = { ...tag };
        mesh.add(edges);
        root.add(mesh);
        label(it.calc.name, scenePoint(c, top, ex).add(new THREE.Vector3(0, labelH * 1.2, 0)));
      }
      if (it.placement.kind === "wall" && it.spec.kind === "wall") {
        const w = it.placement, local = w.points.map((p) => toLocal(model, p));
        const sides = wallSides(w, local);
        if (layers.walls) {
          for (const side of sides) {
            const s = sideSpec(it, side.index, byId);
            const sideTag = { kind: "placed", calcId: s.calcId, name: s.name, item: `side-${side.index}` };
            const sideColor = calcColor(s.calcId);
            const line = sideLine(side, s.spec);
            const wallMat = new THREE.MeshLambertMaterial({ color: sideColor, side: THREE.DoubleSide });
            if (line.length > 2) {
              const mesh = new THREE.Mesh(ribbon(line, s.spec.toeNap, s.spec.topNap, ex), wallMat);
              mesh.userData = sideTag;
              root.add(mesh);
            } else {
              // Rechte wand (planken, palen met schotten of een profiel zonder contour): schematisch met zijn dikte.
              const box = new THREE.Mesh(new THREE.BoxGeometry(side.length, (s.spec.topNap - s.spec.toeNap) * ex, Math.max(s.spec.thicknessM, thin * 2)), wallMat);
              const mid = { x: (side.a.x + side.b.x) / 2, y: (side.a.y + side.b.y) / 2 };
              box.position.set(mid.x, ((s.spec.topNap + s.spec.toeNap) / 2) * ex, -mid.y);
              box.rotation.y = Math.atan2(side.t.y, side.t.x);
              box.userData = sideTag;
              root.add(box);
            }
            // Kleurrand op de bovenkant: de uitkomst van de berekening die voor deze zijde geldt.
            const sideStatus = s.calcId === it.calc.id ? it.status : (items.find((x) => x.calc.id === s.calcId)?.status ?? "pending");
            const cap = rod(scenePoint(side.a, s.spec.topNap, ex), scenePoint(side.b, s.spec.topNap, ex), Math.max(thin * 1.2, s.spec.thicknessM / 2), new THREE.MeshBasicMaterial({ color: STATUS_COLOR[sideStatus] }));
            cap.userData = sideTag;
            root.add(cap);
          }
          const c = centroid(local);
          const top = (it.spec.wall.topNap);
          label(it.calc.name, scenePoint(w.closed ? c : local[0], top, ex).add(new THREE.Vector3(0, labelH * 1.4, 0)));
        }
        if (layers.anchors) {
          const anchorMat = new THREE.MeshLambertMaterial({ color: 0x374151 }), groutMat = new THREE.MeshLambertMaterial({ color: 0x9ca3af });
          for (const side of sides) {
            const s = sideSpec(it, side.index, byId);
            const height = s.spec.topNap - s.spec.toeNap;
            for (const sup of s.spec.supports) {
              const along: number[] = [];
              for (let a = Math.min(sup.spacingM, side.length) / 2; a < side.length - 1e-6; a += sup.spacingM) along.push(a);
              // Gording langs de wand aan de lage zijde.
              const off = Math.max(s.spec.thicknessM / 2, thin) + thin;
              const wa = { x: side.a.x + side.low.x * off, y: side.a.y + side.low.y * off }, wb = { x: side.b.x + side.low.x * off, y: side.b.y + side.low.y * off };
              const waler = rod(scenePoint(wa, sup.levelNap, ex), scenePoint(wb, sup.levelNap, ex), thin * 1.4, anchorMat);
              waler.userData = { kind: "placed", calcId: s.calcId, name: s.name, item: "anchor" };
              root.add(waler);
              for (const a of along) {
                const p0 = { x: side.a.x + side.t.x * a, y: side.a.y + side.t.y * a };
                if (sup.kind === "strut") {
                  // Stempel naar de overkant van de kuip; elke zijde tekent de helft, zodat ze in het midden aansluiten.
                  const reach = w.closed ? rayToPolygon(p0, side.low, local, 0.05) : null;
                  const len = reach !== null ? reach / 2 : Math.max(2, 0.4 * height);
                  const p1 = { x: p0.x + side.low.x * len, y: p0.y + side.low.y * len };
                  const m = rod(scenePoint(p0, sup.levelNap, ex), scenePoint(p1, sup.levelNap, ex), Math.max(thin * 2, 0.15), anchorMat);
                  m.userData = { kind: "placed", calcId: s.calcId, name: s.name, item: "anchor" };
                  root.add(m);
                  continue;
                }
                // Anker naar de hoge zijde, onder de hoek omlaag. Zonder lengte in de berekening: schematisch.
                const len = sup.lengthM ?? Math.max(3, 0.8 * height), ang = (sup.angleDeg * Math.PI) / 180;
                const dir = { x: -side.low.x * Math.cos(ang), y: -side.low.y * Math.cos(ang) };
                const end = (l: number) => scenePoint({ x: p0.x + dir.x * l, y: p0.y + dir.y * l }, sup.levelNap - l * Math.sin(ang), ex);
                const tie = rod(end(0), end(len), thin, anchorMat);
                tie.userData = { kind: "placed", calcId: s.calcId, name: s.name, item: "anchor" };
                root.add(tie);
                if (sup.groutM > 0) {
                  const g = rod(end(len - sup.groutM), end(len), Math.max(thin * 2.5, 0.075), groutMat);
                  g.userData = tie.userData;
                  root.add(g);
                }
              }
            }
          }
        }
        if (layers.pit) {
          const exNap = it.spec.wall.excavationNap;
          const bottomMat = new THREE.MeshLambertMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false });
          if (w.closed && local.length >= 3) {
            const shape = new THREE.Shape(local.map((p) => new THREE.Vector2(p.x, p.y)));
            const floor = new THREE.Mesh(new THREE.ShapeGeometry(shape), bottomMat);
            floor.rotation.x = -Math.PI / 2;
            floor.position.y = exNap * ex + 0.01;
            floor.userData = { ...tag, item: "pit" };
            root.add(floor);
          } else {
            // Open lijn: een strook op het ontgravingsniveau aan de kant van de ontgraving (schematisch).
            const width = Math.max(3, 0.6 * (it.spec.wall.topNap - it.spec.wall.toeNap));
            for (const side of sides) {
              const q = [side.a, side.b, { x: side.b.x + side.low.x * width, y: side.b.y + side.low.y * width }, { x: side.a.x + side.low.x * width, y: side.a.y + side.low.y * width }];
              const strip = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(q.map((p) => new THREE.Vector2(p.x, p.y)))), bottomMat);
              strip.rotation.x = -Math.PI / 2;
              strip.position.y = exNap * ex + 0.01;
              strip.userData = { ...tag, item: "pit" };
              root.add(strip);
            }
          }
        }
      }
    }
    return root;
  };

  return { hideCell: pitList.length ? (e, n, z) => cellInExcavation(pitList, e, n, z) : null, build };
}

/** Middelpunt van een geplaatste berekening in modelcoördinaten (oost, noord, NAP), voor selectie en camera. */
export function placedPoint(model: SoilModel, it: PlacedItem): { east: number; north: number; nap: number } {
  const pl = it.placement;
  const pts = pl.kind === "piles" ? pl.positions : pl.kind === "wall" ? pl.points : [pl];
  const c = toLocal(model, centroid(pts));
  const nap = it.spec.kind === "piles" ? it.spec.pile.topNap : it.spec.kind === "wall" ? it.spec.wall.topNap : it.spec.footing.foundationNap;
  return { east: c.x, north: c.y, nap };
}

