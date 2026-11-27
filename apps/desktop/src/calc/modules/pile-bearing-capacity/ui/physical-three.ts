// three.js objects for the physical 3D view. Draws exactly what
// parts/physical-scene.ts describes; x = horizontal, y = level in m NAP, and
// the soil block sits behind the pile axis (z ≤ 0) so the pile stands in the cut.
import * as THREE from "three";
import { MATERIAL_COLORS } from "../parts/material-colors";
import type { PhysicalPart, PhysicalScene } from "../parts/physical-scene";
import { line, textSprite, translucent, type KoppejanObjects, type SceneColors } from "./koppejan-three";

/** Grond in een open buis (prop). */
export const PLUG_COLOR = "#e6c93a";
export const WATER_COLOR = "#2f80c9";
export const EXCAVATION_COLOR = "#8a5a2b";
export const GROUT_COLOR = "#c9c6bd";
const GROUND_COLOR = "#7c8f4e";

export const partColor = (material: PhysicalPart["material"]) => (material === "grout" ? GROUT_COLOR : material === "plug" ? PLUG_COLOR : MATERIAL_COLORS[material].fill);

function partMaterial(part: PhysicalPart, flat: boolean): THREE.MeshStandardMaterial {
  const steel = part.material === "steel";
  return new THREE.MeshStandardMaterial({
    color: partColor(part.material), roughness: steel ? 0.45 : 0.88, metalness: steel ? 0.35 : 0, flatShading: flat,
    side: part.shape.kind === "helix" || (part.shape.kind === "round" && part.shape.wallM) ? THREE.DoubleSide : THREE.FrontSide,
    // De groutschil is doorschijnend, zodat de kernbuis erin te zien blijft.
    ...(part.material === "grout" ? { transparent: true, opacity: 0.55, depthWrite: false } : {}),
  });
}

/** Schroefvlak tussen binnen- en buitenstraal, van onder naar boven. */
function helixGeometry(shape: Extract<PhysicalPart["shape"], { kind: "helix" }>): THREE.BufferGeometry {
  const steps = Math.max(24, Math.round(48 * shape.turns)), positions: number[] = [], index: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps, angle = f * shape.turns * 2 * Math.PI, y = shape.bottomNap + f * (shape.topNap - shape.bottomNap);
    const outer = (shape.outerBottomDiameterM + f * (shape.outerTopDiameterM - shape.outerBottomDiameterM)) / 2, inner = Math.min(outer, shape.innerDiameterM / 2);
    positions.push(inner * Math.cos(angle), y, inner * Math.sin(angle), outer * Math.cos(angle), y, outer * Math.sin(angle));
    if (i < steps) { const k = 2 * i; index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

function partObject(part: PhysicalPart): THREE.Object3D {
  const s = part.shape;
  if (s.kind === "bars") {
    const group = new THREE.Group();
    const material = partMaterial(part, false), h = s.topNap - s.bottomNap;
    for (const [x, z] of s.positions) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(s.diameterM / 2, s.diameterM / 2, h, 10), material);
      bar.position.set(x, (s.topNap + s.bottomNap) / 2, z);
      group.add(bar);
    }
    return group;
  }
  if (s.kind === "helix") return new THREE.Mesh(helixGeometry(s), partMaterial(part, false));
  const h = s.topNap - s.bottomNap, y = (s.topNap + s.bottomNap) / 2;
  if (s.kind === "rect") {
    // Vierzijdige afgeknotte piramide op de halve diagonaal van zijde a, daarna in z naar zijde b geschaald.
    const geometry = new THREE.CylinderGeometry(s.topAM / 2 * Math.SQRT2, s.bottomAM / 2 * Math.SQRT2, h, 4);
    geometry.rotateY(Math.PI / 4);
    geometry.scale(1, 1, s.topAM > 0 ? s.topBM / s.topAM : 1);
    geometry.translate(0, y, 0);
    return new THREE.Mesh(geometry, partMaterial(part, true));
  }
  const ro1 = s.topDiameterM / 2, ro0 = s.bottomDiameterM / 2;
  if (s.wallM && s.wallM < Math.min(ro0, ro1)) {
    // Holle buis: de wand als omwentelingslichaam, zodat de wanddikte aan de kop te zien is.
    const profile = [[ro0 - s.wallM, s.bottomNap], [ro0, s.bottomNap], [ro1, s.topNap], [ro1 - s.wallM, s.topNap], [ro0 - s.wallM, s.bottomNap]].map(([r, level]) => new THREE.Vector2(r, level));
    // Open buis: het voorste kwart (naar de kijker, +z) weggelaten, zodat de binnenkant te zien is.
    const geometry = s.cutAway ? new THREE.LatheGeometry(profile, 36, Math.PI / 4, 1.5 * Math.PI) : new THREE.LatheGeometry(profile, 48);
    return new THREE.Mesh(geometry, partMaterial(part, false));
  }
  const geometry = new THREE.CylinderGeometry(ro1, ro0, h, 40);
  geometry.translate(0, y, 0);
  return new THREE.Mesh(geometry, partMaterial(part, false));
}

export function buildPhysicalObjects(model: PhysicalScene, colors: SceneColors): KoppejanObjects {
  const root = new THREE.Group();
  const labels: KoppejanObjects["labels"] = [];
  const { halfWidthM: w, depthM: depth } = model.block;

  for (const part of model.pile.parts) {
    const object = partObject(part);
    object.name = `part-${part.id}`;
    root.add(object);
  }

  // Grondblok achter de paalas; elke laag een blok in de kleur van zijn zone uit de grondopbouw.
  for (const [i, layer] of model.block.layers.entries()) {
    const h = layer.topNap - layer.bottomNap;
    const material = new THREE.MeshStandardMaterial({ color: layer.color, roughness: 1, metalness: 0,
      ...(layer.excavated ? { transparent: true, opacity: 0.3, depthWrite: false } : layer.assumed ? { transparent: true, opacity: 0.75 } : {}) });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2 * w, h, depth), material);
    mesh.position.set(0, (layer.topNap + layer.bottomNap) / 2, -depth / 2 - 0.0005);
    mesh.name = `soil-${i}`;
    root.add(mesh);
    // Laaggrens op het snijvlak en over de zijkanten.
    if (i > 0) root.add(line([[-w, layer.topNap, 0], [w, layer.topNap, 0]], colors.text, 0.45));
  }
  const top = model.block.topNap, bottom = model.block.bottomNap;
  root.add(line([[-w, top, 0], [w, top, 0], [w, bottom, 0], [-w, bottom, 0], [-w, top, 0]], colors.text, 0.5));
  root.add(line([[-w, top, 0], [-w, top, -depth], [w, top, -depth], [w, top, 0]], colors.text, 0.35));

  // Maaiveld, ontgraving en grondwater als vlak vóór het snijvlak, met een lijn op het snijvlak.
  const planeColor = { ground: GROUND_COLOR, excavation: EXCAVATION_COLOR, water: WATER_COLOR } as const;
  for (const plane of model.planes) {
    const color = planeColor[plane.id];
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2 * w, depth), translucent(color, plane.id === "water" ? 0.22 : 0.14));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, plane.nap, depth / 2);
    mesh.name = `plane-${plane.id}`;
    mesh.renderOrder = 2;
    root.add(mesh);
    root.add(line([[-w, plane.nap, 0.002], [w, plane.nap, 0.002]], color, 1));
    root.add(line([[-w, plane.nap, 0], [-w, plane.nap, depth], [w, plane.nap, depth], [w, plane.nap, 0]], color, 0.6, plane.id === "ground" ? undefined : 0.06 * w));
  }

  for (const label of model.labels) {
    const made = textSprite(label.text, colors, label.align);
    if (made) {
      made.group = label.group;
      made.sprite.position.set(label.anchor[0], label.anchor[1], 0.01);
      made.sprite.name = `label-${label.id}`;
      root.add(made.sprite);
      labels.push(made);
    }
    if (label.target) {
      const leader = line([[label.anchor[0], label.anchor[1], 0.01], [label.target[0], label.target[1], 0.01]], colors.muted, 0.7);
      leader.name = `leader-${label.id}`;
      root.add(leader);
    }
  }
  return { root, labels };
}
