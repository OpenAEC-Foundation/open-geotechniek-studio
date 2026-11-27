// three.js objects for the 3D explanation of the 4D-8D method. Draws exactly
// what parts/koppejan-scene.ts describes; x = horizontal, y = level in m NAP.
import * as THREE from "three";
import { MATERIAL_COLORS } from "../parts/material-colors";
import type { KoppejanScene, KoppejanZoneId, SceneLabel } from "../parts/koppejan-scene";

export const ZONE_COLORS: Record<KoppejanZoneId, string> = { I: "#e8890c", II: "#7c3aed", III: "#2563eb" };
export const SHAFT_COLORS = { negative: "#dc2626", positive: "#16a34a" } as const;
export const CLIPPED_COLOR = "#0d9488";
export const SLIP_COLOR = "#9a3412";
const GROUND_COLOR = "#7c8f4e";

export interface SceneColors { text: string; muted: string; background: string }

export interface LabelSprite { sprite: THREE.Sprite; aspect: number; group: SceneLabel["group"] }
export interface KoppejanObjects { root: THREE.Group; labels: LabelSprite[] }

/** Tekst als sprite met vaste schermgrootte; null als er geen 2D-canvas is. */
export function textSprite(text: string, colors: SceneColors, align: SceneLabel["align"]): LabelSprite | null {
  const canvas = document.createElement("canvas");
  let ctx: CanvasRenderingContext2D | null = null;
  try { ctx = canvas.getContext("2d"); } catch { ctx = null; }
  if (!ctx) return null;
  const size = 44, pad = 10, font = `600 ${size}px Inter, "Segoe UI", sans-serif`;
  ctx.font = font;
  canvas.width = Math.ceil(ctx.measureText(text).width) + 2 * pad;
  canvas.height = size + 2 * pad;
  ctx.font = font;
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  // Rand in de achtergrondkleur houdt de tekst leesbaar over de volumes heen.
  ctx.lineWidth = 9;
  ctx.strokeStyle = colors.background;
  ctx.strokeText(text, pad, canvas.height / 2);
  ctx.fillStyle = colors.text;
  ctx.fillText(text, pad, canvas.height / 2);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, depthTest: false, transparent: true, sizeAttenuation: false }));
  sprite.center.set(align === "left" ? 1 : 0, 0.5);
  sprite.renderOrder = 10;
  return { sprite, aspect: canvas.width / canvas.height, group: "tip" };
}

export function line(points: Array<[number, number, number]>, color: string, opacity = 1, dashed?: number): THREE.Line {
  const geometry = new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(...p)));
  const material = dashed
    ? new THREE.LineDashedMaterial({ color, transparent: opacity < 1, opacity, dashSize: dashed, gapSize: dashed * 0.7 })
    : new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
  const object = new THREE.Line(geometry, material);
  if (dashed) object.computeLineDistances();
  return object;
}

function circle(radius: number, y: number): Array<[number, number, number]> {
  return Array.from({ length: 65 }, (_, i) => {
    const a = (i / 64) * 2 * Math.PI;
    return [radius * Math.cos(a), y, radius * Math.sin(a)];
  });
}

export function translucent(color: string, opacity: number) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
}

/** Vlak in het sonderingsvlak (z = 0) tussen twee x-waarden en twee niveaus. */
function panel(x0: number, x1: number, bottom: number, top: number, color: string, opacity: number, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(Math.abs(x1 - x0), top - bottom), translucent(color, opacity));
  mesh.position.set((x0 + x1) / 2, (top + bottom) / 2, z);
  return mesh;
}

export function buildKoppejanObjects(model: KoppejanScene, colors: SceneColors): KoppejanObjects {
  const root = new THREE.Group();
  const labels: LabelSprite[] = [];
  const deq = model.deqM;

  // Paal op schaal.
  let pileRadius = 0;
  for (const segment of model.pile.segments) {
    const corner = segment.isCircular ? 1 : Math.SQRT2;
    const height = segment.topNap - segment.bottomNap;
    if (height <= 0) continue;
    const geometry = new THREE.CylinderGeometry(segment.topSizeM / 2 * corner, segment.bottomSizeM / 2 * corner, height, segment.isCircular ? 40 : 4);
    if (!segment.isCircular) geometry.rotateY(Math.PI / 4);
    const material = new THREE.MeshStandardMaterial({
      color: MATERIAL_COLORS[segment.material].fill, roughness: segment.material === "steel" ? 0.45 : 0.85,
      metalness: segment.material === "steel" ? 0.35 : 0, flatShading: !segment.isCircular,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = (segment.topNap + segment.bottomNap) / 2;
    mesh.name = "pile";
    root.add(mesh);
    pileRadius = Math.max(pileRadius, segment.topSizeM / 2 * corner, segment.bottomSizeM / 2 * corner);
  }

  // Trajecten I, II en III als doorschijnende volumes rond de paalpunt.
  for (const zone of model.zones) {
    const height = zone.topNap - zone.bottomNap;
    let geometry: THREE.BufferGeometry;
    if (zone.innerRadiusM <= 0) {
      geometry = new THREE.CylinderGeometry(zone.outerRadiusM, zone.outerRadiusM, height, 64);
      geometry.translate(0, (zone.topNap + zone.bottomNap) / 2, 0);
    } else {
      const ri = zone.innerRadiusM, ro = zone.outerRadiusM;
      geometry = new THREE.LatheGeometry([[ri, zone.bottomNap], [ro, zone.bottomNap], [ro, zone.topNap], [ri, zone.topNap], [ri, zone.bottomNap]].map(([x, y]) => new THREE.Vector2(x, y)), 64);
    }
    const color = ZONE_COLORS[zone.id];
    const mesh = new THREE.Mesh(geometry, translucent(color, 0.2));
    mesh.name = `zone-${zone.id}`;
    mesh.renderOrder = 2;
    root.add(mesh);
    for (const radius of zone.innerRadiusM > 0 ? [zone.innerRadiusM, zone.outerRadiusM] : [zone.outerRadiusM]) {
      for (const y of [zone.topNap, zone.bottomNap]) root.add(line(circle(radius, y), color, 0.75));
    }
    // Pijl in de looprichting van het traject.
    const x = zone.innerRadiusM <= 0 ? 0 : (zone.innerRadiusM + zone.outerRadiusM) / 2;
    const length = height * 0.8;
    const from = zone.direction === "down" ? zone.topNap - height * 0.1 : zone.bottomNap + height * 0.1;
    const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, zone.direction === "down" ? -1 : 1, 0), new THREE.Vector3(x, from, zone.innerRadiusM <= 0 ? 0 : 0.001),
      length, new THREE.Color(color).getHex(), Math.min(0.45 * deq, length * 0.4), Math.min(0.22 * deq, length * 0.2));
    arrow.name = `direction-${zone.id}`;
    root.add(arrow);
  }

  // Bezwijklichaam: het glijvlak rondgedraaid om de paalas, met een kwart weggelaten zodat
  // je erin kijkt. Op de twee snijvlakken staat het glijvlak als lijn, met pijlen in de
  // richting waarin de grond afschuift.
  if (model.slip) {
    const slip = model.slip;
    const body = new THREE.Mesh(
      new THREE.LatheGeometry(slip.profile.map(([r, y]) => new THREE.Vector2(r, y)), 72, Math.PI / 2, 1.5 * Math.PI),
      new THREE.MeshStandardMaterial({ color: SLIP_COLOR, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, roughness: 0.9 }),
    );
    body.name = "slip-body";
    body.renderOrder = 1;
    root.add(body);
    // Snijvlakken: +x (z = 0) en +z (x = 0).
    const faces: Array<(r: number, y: number) => [number, number, number]> = [(r, y) => [r, y, 0], (r, y) => [0, y, r]];
    for (const place of faces) {
      const outline = slip.profile.map(([r, y]) => place(r, y));
      root.add(line(outline, SLIP_COLOR, 1));
      const fill = new THREE.Shape(slip.profile.map(([r, y]) => new THREE.Vector2(r, y)));
      const face = new THREE.Mesh(new THREE.ShapeGeometry(fill), translucent(SLIP_COLOR, 0.12));
      if (place(1, 0)[2] === 1) face.rotation.y = -Math.PI / 2;
      face.name = "slip-face";
      face.renderOrder = 1;
      root.add(face);
      for (const at of [0.2, 0.5, 0.8]) {
        const i = Math.round(at * (slip.profile.length - 1));
        const [r0, y0] = slip.profile[i - 1], [r1, y1] = slip.profile[i + 1];
        const from = new THREE.Vector3(...place(slip.profile[i][0], slip.profile[i][1]));
        const dir = new THREE.Vector3(...place(r1 - r0, y1 - y0)).normalize();
        const arrow = new THREE.ArrowHelper(dir, from.addScaledVector(dir, -0.6 * deq), 1.2 * deq, new THREE.Color(SLIP_COLOR).getHex(), 0.5 * deq, 0.28 * deq);
        arrow.name = "slip-direction";
        root.add(arrow);
      }
    }
    // Omtrek op het breedste niveau, over de driekwart die er staat.
    const arc = Array.from({ length: 49 }, (_, i): [number, number, number] => {
      const a = Math.PI / 2 + (i / 48) * 1.5 * Math.PI;
      return [slip.maxRadiusM * Math.sin(a), slip.widestNap, slip.maxRadiusM * Math.cos(a)];
    });
    root.add(line(arc, SLIP_COLOR, 0.6));
  }

  // Zoekgebied van de kritieke diepte (0,7 en 4 Deq) gestippeld, de gekozen diepte als ring.
  const range = model.searchRange;
  for (const y of [range.topNap, range.bottomNap]) root.add(line(circle(range.radiusM, y), colors.muted, 0.9, deq * 0.18));
  const ring = new THREE.Mesh(new THREE.RingGeometry(range.radiusM, range.radiusM * 1.07, 64), translucent(colors.text, 0.85));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = model.critical.nap;
  ring.name = "critical-depth";
  ring.renderOrder = 3;
  root.add(ring);

  // Kleeftrajecten als dunne kokers om de schacht.
  for (const zone of model.shaftZones) {
    const radius = pileRadius + 0.1 * deq;
    const geometry = new THREE.CylinderGeometry(radius, radius, zone.topNap - zone.bottomNap, 40, 1, true);
    geometry.translate(0, (zone.topNap + zone.bottomNap) / 2, 0);
    const mesh = new THREE.Mesh(geometry, translucent(SHAFT_COLORS[zone.id], 0.3));
    mesh.name = `shaft-${zone.id}`;
    mesh.renderOrder = 1;
    root.add(mesh);
  }

  // Maaiveld.
  const qc = model.qc, xEnd = qc.originX + qc.widthM;
  const groundSize = 2 * (xEnd + deq);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(groundSize, groundSize), translucent(GROUND_COLOR, 0.16));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = model.groundNap;
  ground.name = "ground";
  root.add(ground);
  const g = groundSize / 2, gy = model.groundNap;
  root.add(line([[-g, gy, -g], [g, gy, -g], [g, gy, g], [-g, gy, g], [-g, gy, -g]], GROUND_COLOR, 0.7));

  // Sondering: qc-lijn in een vlak naast de paal, met de trajecten als band erachter.
  const xOf = (q: number) => qc.originX + Math.min(1, q / qc.axisMaxMpa) * qc.widthM;
  if (qc.raw.length >= 2) {
    const top = qc.raw[0].nap, bottom = qc.raw[qc.raw.length - 1].nap;
    root.add(line([[qc.originX, top, 0], [qc.originX, bottom, 0], [xEnd, bottom, 0]], colors.muted, 0.8));
    const zoneIII = model.zones.find((z) => z.id === "III"), zoneI = model.zones.find((z) => z.id === "I");
    if (zoneIII) root.add(panel(qc.originX, xEnd, zoneIII.bottomNap, zoneIII.topNap, ZONE_COLORS.III, 0.1, -0.002));
    if (zoneI) root.add(panel(qc.originX, xEnd, zoneI.bottomNap, zoneI.topNap, ZONE_COLORS.I, 0.12, -0.002));
    // Grenzen van de trajecten doorgetrokken van de volumes naar de sondering.
    for (const y of new Set([...(zoneIII ? [zoneIII.topNap] : []), model.pile.toeNap, model.critical.nap])) {
      root.add(line([[range.radiusM, y, 0], [xEnd, y, 0]], colors.muted, 0.6, deq * 0.12));
    }
    const rawLine = line(qc.raw.map((p) => [xOf(p.qcMpa), p.nap, 0]), colors.text, 0.75);
    rawLine.name = "qc-raw";
    root.add(rawLine);
  }
  if (qc.clipped.length >= 2) {
    const clippedLine = line(qc.clipped.map((p) => [xOf(p.qcMpa), p.nap, 0.003]), CLIPPED_COLOR);
    clippedLine.name = "qc-clipped";
    root.add(clippedLine);
  }
  for (const average of qc.averages) {
    const x = xOf(average.qcMpa), half = 0.045 * deq;
    const strip = panel(x - half, x + half, average.bottomNap, average.topNap, ZONE_COLORS[average.zone], 0.95, 0.005);
    strip.name = `average-${average.zone}`;
    strip.renderOrder = 4;
    root.add(strip);
  }

  // Labels met aanhaallijn.
  for (const label of model.labels) {
    const made = textSprite(label.text, colors, label.align);
    if (made) {
      made.group = label.group;
      made.sprite.position.set(label.anchor[0], label.anchor[1], 0);
      made.sprite.name = `label-${label.id}`;
      root.add(made.sprite);
      labels.push(made);
    }
    if (label.target) {
      const leader = line([[label.anchor[0], label.anchor[1], 0], [label.target[0], label.target[1], 0]], colors.muted, 0.7);
      leader.name = `leader-${label.id}`;
      leader.userData.labelGroup = label.group;
      root.add(leader);
    }
  }
  return { root, labels };
}

export function disposeObjects(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    for (const m of Array.isArray(material) ? material : material ? [material] : []) {
      (m as THREE.SpriteMaterial).map?.dispose();
      m.dispose();
    }
  });
}

/**
 * Camerastand waarbij een uitsnede in het sonderingsvlak geheel in beeld is.
 * De labels links hebben een vaste schermbreedte (`labelPx`); die ruimte gaat
 * eerst van de breedte af, daarna wordt de uitsnede in de rest gepast.
 */
export function fitPose(
  focus: { x0: number; x1: number; bottomNap: number; topNap: number },
  fovDeg: number, widthPx: number, heightPx: number, labelPx: number, depthM: number,
) {
  const margin = 1.1;
  const freePx = Math.max(widthPx * 0.4, widthPx - labelPx);
  const pxPerM = Math.min(freePx / ((focus.x1 - focus.x0) * margin), heightPx / ((focus.topNap - focus.bottomNap) * margin));
  const tan = Math.tan((fovDeg * Math.PI) / 360);
  // De uitsnede staat rechts van de labelruimte: het midden van het beeld schuift naar links.
  const target = new THREE.Vector3((focus.x0 + focus.x1) / 2 - (widthPx - freePx) / 2 / pxPerM, (focus.bottomNap + focus.topNap) / 2, 0);
  const distance = heightPx / (2 * tan * pxPerM) + depthM;
  const position = target.clone().add(new THREE.Vector3(0.3, 0.18, 1).normalize().multiplyScalar(distance));
  return { target, position, distance, pxPerM };
}
