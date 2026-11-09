// Opbouw van de 3D-scène van het grondmodel; gedeeld door de viewer en het
// funderingsadviesrapport, zodat beide hetzelfde beeld tonen.
import * as THREE from "three";
import { exposedCells, zoneInfo, type SoilModel } from "./soilModel";
import type { SectionBox, Soil3DSettings } from "./useSoil3DStore";
import type { SubsurfaceData } from "./subsurface/store";
import { aquifers } from "./subsurface/regis";
import { LITHOCLASSES } from "./subsurface/geotop";

export interface PileToe { cptId: string; name: string; toeNap: number }
export interface Criterion { qcMpa: number; thicknessM: number; source: string | null }

const BEARING_COLOR = 0xe8590c, GROUND_COLOR = 0x7c8f4e, QC_COLOR = 0xb3261e, TOE_COLOR = 0x1f2933;

function textSprite(text: string, color: string, height: number) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const font = 48;
  if (!ctx) return new THREE.Sprite();
  ctx.font = `600 ${font}px sans-serif`;
  canvas.width = Math.ceil(ctx.measureText(text).width) + 16;
  canvas.height = font + 16;
  ctx.font = `600 ${font}px sans-serif`;
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(text, 8, canvas.height / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set((height * canvas.width) / canvas.height, height, 1);
  sprite.renderOrder = 10;
  return sprite;
}

function surfaceMesh(model: SoilModel, which: "ground" | "bearing", ex: number, color: number, opacity: number) {
  const s = model[which];
  if (!s) return null;
  const geo = new THREE.BufferGeometry();
  const pos: number[] = [], idx: number[] = [];
  for (let j = 0; j < s.ny; j++) for (let i = 0; i < s.nx; i++)
    pos.push(s.east0 + (i + 0.5) * s.dx, s.values[i + s.nx * j] * ex, -(s.north0 + (j + 0.5) * s.dy));
  for (let j = 0; j + 1 < s.ny; j++) for (let i = 0; i + 1 < s.nx; i++) {
    const a = i + s.nx * j, b = a + 1, c = a + s.nx, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false })));
  group.add(new THREE.LineSegments(new THREE.WireframeGeometry(geo), new THREE.LineBasicMaterial({ color, transparent: true, opacity: Math.min(1, opacity + 0.3) })));
  return group;
}

/**
 * Bouwt de inhoud van de scène. Met een section box blijft alleen wat erbinnen ligt: voxels per hele cel (zo blijft
 * het snijvlak dicht), de overige objecten met clipping-vlakken.
 */
/** Straal van de sonderingskolommen als er geen diameter is ingesteld: meeschalen met het model. */
export function autoCptRadius(model: SoilModel) {
  return Math.max(0.25, model.span / 90);
}

export function buildContent(model: SoilModel, s: Soil3DSettings, toes: PileToe[], activeId: string | null, textColor: string, sub: SubsurfaceData | null = null, clip: SectionBox | null = null) {
  const root = new THREE.Group();
  const ex = s.exaggeration;
  const g = model.grid;
  const r = s.cptDiameter && s.cptDiameter > 0 ? s.cptDiameter / 2 : autoCptRadius(model);

  if (s.showModel) {
    const inside = (i: number, j: number, k: number) => {
      if (!clip) return true;
      const e = g.east0 + (i + 0.5) * g.dx, n = g.north0 + (j + 0.5) * g.dy, z = g.topNap - (k + 0.5) * g.dz;
      return e >= clip.e0 && e <= clip.e1 && n >= clip.n0 && n <= clip.n1 && z >= clip.z0 && z <= clip.z1;
    };
    const cells = exposedCells(g, (z, i, j, k) => !s.hiddenZones.includes(z) && inside(i, j, k));
    const box = new THREE.BoxGeometry(g.dx, g.dz * ex, g.dy);
    const m = new THREE.Matrix4();
    for (const [zone, list] of cells) {
      const mat = new THREE.MeshLambertMaterial({ color: zoneInfo(zone)?.color ?? "#999", transparent: s.opacity < 1, opacity: s.opacity, depthWrite: s.opacity >= 1 });
      const mesh = new THREE.InstancedMesh(box, mat, list.length);
      list.forEach((idx, n) => {
        const i = idx % g.nx, j = Math.floor(idx / g.nx) % g.ny, k = Math.floor(idx / (g.nx * g.ny));
        m.makeTranslation(g.east0 + (i + 0.5) * g.dx, (g.topNap - (k + 0.5) * g.dz) * ex, -(g.north0 + (j + 0.5) * g.dy));
        mesh.setMatrixAt(n, m);
      });
      mesh.userData = { kind: "cell", zone, cells: list };
      root.add(mesh);
    }
  }

  for (const c of model.columns) {
    const x = c.east, z = -c.north;
    if (s.showCpts) {
      for (const l of c.layers) {
        const h = (l.topNap - l.bottomNap) * ex;
        if (h <= 0) continue;
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 16), new THREE.MeshLambertMaterial({ color: l.color }));
        mesh.position.set(x, ((l.topNap + l.bottomNap) / 2) * ex, z);
        mesh.userData = { kind: "cpt", cptId: c.id };
        root.add(mesh);
      }
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.35, r * 0.35, (c.groundNap - c.endNap) * ex, 8), new THREE.MeshBasicMaterial({ color: c.id === activeId ? 0x2563eb : 0x6b7280 }));
      shaft.position.set(x, ((c.groundNap + c.endNap) / 2) * ex, z);
      shaft.userData = { kind: "cpt", cptId: c.id };
      root.add(shaft);
      const label = textSprite(c.id, c.id === activeId ? "#2563eb" : textColor, Math.max(1, model.span / 28));
      label.position.set(x, c.groundNap * ex + Math.max(1, model.span / 25), z);
      root.add(label);
    }
    if (s.showQc && c.qc.length > 1) {
      // qc-lijn in het verticale vlak oost van de sondering; 30 MPa ≈ 6 % van het model.
      const scale = Math.max(2, model.span * 0.06) / 30;
      const pts = c.qc.map((p) => new THREE.Vector3(x + r + Math.min(p.qc, 60) * scale, p.nap * ex, z));
      root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: QC_COLOR })));
      const base = [new THREE.Vector3(x + r, c.groundNap * ex, z), new THREE.Vector3(x + r, c.endNap * ex, z)];
      root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(base), new THREE.LineBasicMaterial({ color: QC_COLOR, transparent: true, opacity: 0.35 })));
    }
    if (s.showBearing && c.bearingTopNap !== null) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.8, r * 0.3, 8, 24), new THREE.MeshBasicMaterial({ color: BEARING_COLOR }));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, c.bearingTopNap * ex, z);
      root.add(ring);
    }
    if (s.showPileToes) for (const t of toes.filter((t) => t.cptId === c.id)) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r * 1.4, r * 3, 16), new THREE.MeshLambertMaterial({ color: TOE_COLOR }));
      cone.rotation.x = Math.PI;
      cone.position.set(x - r * 3, t.toeNap * ex + r * 1.5, z);
      cone.userData = { kind: "toe", cptId: c.id, name: t.name, toeNap: t.toeNap };
      root.add(cone);
    }
  }

  if (s.showGround) { const m = surfaceMesh(model, "ground", ex, GROUND_COLOR, 0.3); if (m) { m.userData = { kind: "ground" }; root.add(m); } }
  if (s.showBearing) { const m = surfaceMesh(model, "bearing", ex, BEARING_COLOR, 0.45); if (m) { m.userData = { kind: "bearing" }; root.add(m); } }

  if (sub) addSubsurface(root, model, s, sub, textColor, clip);

  // NAP-schaal op de zuidwesthoek.
  const x0 = g.east0, z0 = -g.north0, bottom = g.topNap - g.nz * g.dz;
  const step = niceStep(g.topNap - bottom);
  const axisPts: THREE.Vector3[] = [];
  for (let v = Math.ceil(bottom / step) * step; v <= g.topNap + 1e-6; v += step) {
    axisPts.push(new THREE.Vector3(x0, v * ex, z0), new THREE.Vector3(x0 - r * 2, v * ex, z0));
    const lab = textSprite(`${v.toFixed(0)} m`, textColor, Math.max(0.9, model.span / 32));
    lab.position.set(x0 - r * 2 - Math.max(1.5, model.span / 25), v * ex, z0);
    root.add(lab);
  }
  axisPts.push(new THREE.Vector3(x0, bottom * ex, z0), new THREE.Vector3(x0, g.topNap * ex, z0));
  root.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(axisPts), new THREE.LineBasicMaterial({ color: textColor })));
  const napLabel = textSprite("m NAP", textColor, Math.max(0.9, model.span / 32));
  napLabel.position.set(x0 - Math.max(1.5, model.span / 25), g.topNap * ex + Math.max(1.2, model.span / 30), z0);
  root.add(napLabel);
  const north = textSprite("N ↑", textColor, Math.max(1, model.span / 28));
  north.position.set(g.east0 + g.nx * g.dx, g.topNap * ex + 1, -(g.north0 + g.ny * g.dy));
  root.add(north);
  if (clip) {
    const planes = sectionPlanes(clip, ex);
    // Voxels, pakketten en GeoTOP zijn al per cel binnen de box gehouden; knippen zou op de celgrenzen gaan flikkeren.
    const cellBased = new Set(["cell", "aquifer", "geotop"]);
    root.traverse((o) => {
      if (cellBased.has(o.userData.kind as string)) return;
      const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) m.clippingPlanes = planes;
    });
  }
  return root;
}

export function niceStep(range: number) {
  const raw = range / 6, mag = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-6)));
  return [1, 2, 5, 10].map((f) => f * mag).find((v) => v >= raw) ?? 10 * mag;
}

export function disposeTree(obj: THREE.Object3D) {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose?.();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    for (const x of Array.isArray(mat) ? mat : mat ? [mat] : []) {
      (x as THREE.SpriteMaterial).map?.dispose();
      x.dispose();
    }
  });
}


/** Puntniveaus uit de berekeningen voor verticaal draagvermogen, per sondering. */
export function pileToes(calcs: { moduleId: string; name: string; input: unknown }[]): PileToe[] {
  return calcs.filter((c) => c.moduleId === "pile-bearing-capacity").flatMap((c) => {
    const input = c.input as { cptId?: string | null; pileToeNap?: number };
    return input.cptId && Number.isFinite(input.pileToeNap) ? [{ cptId: input.cptId, name: c.name, toeNap: input.pileToeNap! }] : [];
  });
}

/** Standaardaanzichten: schuin van zuidoost, van boven (noord boven), van voren (vanuit het zuiden), van opzij (vanuit het oosten). */
export type ViewPreset = "iso" | "top" | "front" | "side";
const PRESET_DIRS: Record<ViewPreset, [number, number, number]> = {
  iso: [1, 0.75, 1.25], top: [0, 1, 0.002], front: [0, 0, 1], side: [1, 0, 0],
};

/** Begrenzing van het getoonde model in scènecoördinaten, tot de diepste getoonde verrijking. */
export function modelBounds(model: SoilModel, ex: number, bottomNap?: number): THREE.Box3 {
  const g = model.grid;
  const bottom = Math.min(g.topNap - g.nz * g.dz, bottomNap ?? Infinity);
  return new THREE.Box3(
    new THREE.Vector3(g.east0, bottom * ex, -(g.north0 + g.ny * g.dy)),
    new THREE.Vector3(g.east0 + g.nx * g.dx, (g.topNap + 1) * ex, -g.north0),
  );
}

/**
 * Zet de camera zo dat de hele box in beeld is, rekening houdend met de vorm van het venster. Werkt voor een
 * perspectief- en een orthografische camera; geeft het richtpunt terug.
 */
export function fitCamera(camera: THREE.PerspectiveCamera | THREE.OrthographicCamera, box: THREE.Box3, aspect: number, preset: ViewPreset = "iso", margin = 1.08) {
  const center = box.getCenter(new THREE.Vector3());
  const dir = new THREE.Vector3(...PRESET_DIRS[preset]).normalize();
  // Camera-assen voor deze kijkrichting; daarmee de hoeken van de box projecteren (strakker dan een bol).
  const forward = dir.clone().negate();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0));
  if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
  right.normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();
  let halfW = 0.5, halfH = 0.5, depth = 0.5;
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    const v = new THREE.Vector3(x, y, z).sub(center);
    halfW = Math.max(halfW, Math.abs(v.dot(right)));
    halfH = Math.max(halfH, Math.abs(v.dot(up)));
    depth = Math.max(depth, Math.abs(v.dot(forward)));
  }
  halfW *= margin; halfH *= margin;
  if (camera instanceof THREE.PerspectiveCamera) {
    const vHalf = THREE.MathUtils.degToRad(camera.fov) / 2;
    const hHalf = Math.atan(Math.tan(vHalf) * aspect);
    const dist = depth + Math.max(halfW / Math.tan(hHalf), halfH / Math.tan(vHalf));
    camera.position.copy(center).addScaledVector(dir, dist);
    camera.near = Math.max(0.01, dist / 200);
    camera.far = dist * 20;
  } else {
    const h = Math.max(halfH, halfW / aspect);
    camera.top = h; camera.bottom = -h; camera.left = -h * aspect; camera.right = h * aspect;
    camera.zoom = 1;
    camera.position.copy(center).addScaledVector(dir, depth * 4 + 10);
    camera.near = 0.01;
    camera.far = depth * 20 + 100;
  }
  camera.up.set(0, 1, 0);
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  return center;
}

/** Camera schuin van zuidoost boven het model, het hele model in beeld (voor de rapportfiguren). */
export function frameCamera(camera: THREE.PerspectiveCamera, model: SoilModel, ex: number, distance = 1, bottomNap?: number) {
  return fitCamera(camera, modelBounds(model, ex, bottomNap), camera.aspect, "iso", 1.08 * distance);
}

function addLights(scene: THREE.Scene) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8d7b68, 0.85));
  scene.add(new THREE.AmbientLight(0xffffff, 0.2));
  const sun = new THREE.DirectionalLight(0xffffff, 0.85);
  sun.position.set(1, 2.2, 1.4);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xffffff, 0.25);
  fill.position.set(-1.5, 0.6, -1);
  scene.add(fill);
}
export { addLights };

/**
 * Rendert het model buiten beeld naar een JPEG (data-URL) voor het rapport.
 * null als WebGL niet beschikbaar is.
 */
export function renderSoilModelImage(model: SoilModel, settings: Soil3DSettings, toes: PileToe[], width = 1600, height = 1000, clip: SectionBox | null = null): string | null {
  let renderer: THREE.WebGLRenderer;
  try {
    const canvas = document.createElement("canvas");
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  } catch { return null; }
  try {
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);
    addLights(scene);
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100000);
    frameCamera(camera, model, settings.exaggeration, 0.92);
    renderer.localClippingEnabled = !!clip;
    const content = buildContent(model, settings, toes, null, "#1f2933", null, clip);
    scene.add(content);
    renderer.render(scene, camera);
    const url = renderer.domElement.toDataURL("image/jpeg", 0.9);
    disposeTree(content);
    return url;
  } catch {
    return null;
  } finally {
    renderer.dispose();
    renderer.forceContextLoss();
  }
}

const AQUIFER_COLORS = [0x38bdf8, 0x818cf8, 0x2dd4bf];
const HEAD_COLORS = [0x7c3aed, 0xdb2777, 0x0d9488];

/**
 * Verrijking van buiten in de scène: watervoerende pakketten (REGIS II) en GeoTOP-voxels, beide begrensd tot het
 * modelgebied; het freatisch vlak en de stijghoogte per pakket; peilbuizen met hun filter.
 */
function addSubsurface(root: THREE.Group, model: SoilModel, s: Soil3DSettings, sub: SubsurfaceData, textColor: string, clip: SectionBox | null) {
  const ex = s.exaggeration, g = model.grid, o = model.origin;
  // Gebied waarbinnen pakketten en voxels getekend worden: het modelgebied, ingeperkt door de section box.
  const ax0 = o.x + Math.max(g.east0, clip?.e0 ?? -Infinity), ax1 = o.x + Math.min(g.east0 + g.nx * g.dx, clip?.e1 ?? Infinity);
  const ay0 = o.y + Math.max(g.north0, clip?.n0 ?? -Infinity), ay1 = o.y + Math.min(g.north0 + g.ny * g.dy, clip?.n1 ?? Infinity);
  const zLo = clip?.z0 ?? -Infinity, zHi = clip?.z1 ?? Infinity;
  const place = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
    const m = new THREE.Matrix4();
    m.compose(new THREE.Vector3((x0 + x1) / 2 - o.x, ((z0 + z1) / 2) * ex, -((y0 + y1) / 2 - o.y)), new THREE.Quaternion(), new THREE.Vector3(x1 - x0, (z1 - z0) * ex, y1 - y0));
    return m;
  };
  const labelSize = Math.max(1.4, model.span / 18);
  const unit = new THREE.BoxGeometry(1, 1, 1);

  if (s.showAquifers && sub.regis) {
    const r = sub.regis;
    aquifers(r).forEach((a, n) => {
      const boxes: THREE.Matrix4[] = [], cellIds: number[] = [];
      let labelAt: THREE.Vector3 | null = null;
      for (let j = 0; j < r.ny; j++) for (let i = 0; i < r.nx; i++) {
        const c = j * r.nx + i, t0 = a.top[c], b0 = a.bottom[c];
        if (t0 === null || b0 === null) continue;
        const t = Math.min(t0, zHi), b = Math.max(b0, zLo);
        if (t <= b) continue;
        const x0 = Math.max(ax0, r.x0 + i * r.cell), x1 = Math.min(ax1, r.x0 + (i + 1) * r.cell);
        const y0 = Math.max(ay0, r.y0 + j * r.cell), y1 = Math.min(ay1, r.y0 + (j + 1) * r.cell);
        if (x1 <= x0 || y1 <= y0) continue;
        boxes.push(place(x0, x1, y0, y1, b, t));
        cellIds.push(c);
        if (!labelAt) labelAt = new THREE.Vector3(x1 - o.x + labelSize * 4, ((t + b) / 2) * ex, -(y0 - o.y));
      }
      if (!boxes.length) return;
      const mat = new THREE.MeshLambertMaterial({ color: AQUIFER_COLORS[n % 3], transparent: true, opacity: 0.22, depthWrite: false });
      const mesh = new THREE.InstancedMesh(unit, mat, boxes.length);
      boxes.forEach((m, k) => mesh.setMatrixAt(k, m));
      mesh.userData = { kind: "aquifer", aquifer: a.index, cells: cellIds };
      root.add(mesh);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(unit), new THREE.LineBasicMaterial({ color: AQUIFER_COLORS[n % 3] }));
      for (const m of boxes) { const e = edges.clone(); e.applyMatrix4(m); root.add(e); }
      if (labelAt) {
        const tops = a.top.filter((v): v is number => v !== null), bots = a.bottom.filter((v): v is number => v !== null);
        const label = textSprite(`${a.index}e WVP  NAP ${Math.max(...tops).toFixed(1)} / ${Math.min(...bots).toFixed(1)}`, "#0369a1", labelSize);
        label.position.copy(labelAt);
        root.add(label);
      }
    });
  }

  if (s.showGeotop && sub.geotop) {
    const gt = sub.geotop, ny = gt.ys.length, nz = gt.zs.length;
    // Met het sonderingenmodel aan vult GeoTOP alleen aan wat eronder ligt; anders het hele gebied.
    const below = s.showModel ? g.topNap - g.nz * g.dz : Infinity;
    const byClass = new Map<number, THREE.Matrix4[]>(), voxelIds = new Map<number, number[]>();
    gt.xs.forEach((xc, i) => gt.ys.forEach((yc, j) => {
      const x0 = Math.max(ax0, xc - gt.cell / 2), x1 = Math.min(ax1, xc + gt.cell / 2);
      const y0 = Math.max(ay0, yc - gt.cell / 2), y1 = Math.min(ay1, yc + gt.cell / 2);
      if (x1 <= x0 || y1 <= y0) return;
      for (let k = 0; k < nz; k++) {
        const lk = gt.lithok[(i * ny + j) * nz + k];
        if (lk === null || gt.zs[k] < zLo || gt.zs[k] > zHi || gt.zs[k] + gt.dz / 2 > below + 1e-6) continue;
        const list = byClass.get(lk) ?? [];
        list.push(place(x0, x1, y0, y1, gt.zs[k] - gt.dz / 2, gt.zs[k] + gt.dz / 2));
        byClass.set(lk, list);
        voxelIds.set(lk, [...(voxelIds.get(lk) ?? []), (i * ny + j) * nz + k]);
      }
    }));
    for (const [lk, boxes] of byClass) {
      const mat = new THREE.MeshLambertMaterial({ color: LITHOCLASSES[lk]?.color ?? "#999", transparent: s.opacity < 1, opacity: s.opacity * 0.9 });
      const mesh = new THREE.InstancedMesh(unit, mat, boxes.length);
      boxes.forEach((m, k) => mesh.setMatrixAt(k, m));
      mesh.userData = { kind: "geotop", voxels: voxelIds.get(lk) };
      root.add(mesh);
    }
  }

  if (s.showWater) {
    const plane = (z: number, color: number, fill: boolean, text: string) => {
      const w = ax1 - ax0, d = ay1 - ay0, cx = (ax0 + ax1) / 2 - o.x, cz = -((ay0 + ay1) / 2 - o.y);
      if (fill) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
        m.rotation.x = -Math.PI / 2;
        m.position.set(cx, z * ex, cz);
        m.userData = { kind: "water" };
        root.add(m);
      }
      const pts = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2], [-w / 2, -d / 2]].map(([a, b]) => new THREE.Vector3(cx + a, z * ex, cz + b));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color, dashSize: labelSize, gapSize: labelSize * 0.6 }));
      line.computeLineDistances();
      root.add(line);
      const label = textSprite(text, `#${color.toString(16).padStart(6, "0")}`, labelSize);
      label.position.set(cx + w / 2 + labelSize * 4, z * ex, cz - d / 2);
      root.add(label);
    };
    const gw = sub.groundwater;
    if (gw.phreaticNap !== null) plane(gw.phreaticNap, 0x1d4ed8, true, `▽ GW NAP ${gw.phreaticNap.toFixed(2)}`);
    gw.heads.forEach((h, i) => { if (h !== null) plane(h, HEAD_COLORS[i % 3], false, `φ${i + 1} NAP ${h.toFixed(2)}`); });
  }

  if (s.showWells && sub.wells) {
    const r = Math.max(0.2, model.span / 140);
    // Peilbuizen die verder weg gezocht zijn tellen mee voor de grondwaterstand, maar staan niet in beeld.
    const near = (w: { x: number; y: number }) => w.x >= o.x + g.east0 - 500 && w.x <= o.x + g.east0 + g.nx * g.dx + 500 && w.y >= o.y + g.north0 - 500 && w.y <= o.y + g.north0 + g.ny * g.dy + 500;
    for (const w of sub.wells) {
      if (w.screenTop === null || w.screenBottom === null || !near(w)) continue;
      const x = w.x - o.x, z = -(w.y - o.y);
      const top = Math.max(w.screenTop + 2, w.stats?.max ?? w.screenTop);
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.5, r * 0.5, (top - w.screenTop) * ex, 8), new THREE.MeshLambertMaterial({ color: 0x6b7280 }));
      pipe.position.set(x, ((top + w.screenTop) / 2) * ex, z);
      const screen = new THREE.Mesh(new THREE.CylinderGeometry(r, r, Math.max(0.1, w.screenTop - w.screenBottom) * ex, 12), new THREE.MeshLambertMaterial({ color: 0x1d4ed8 }));
      screen.position.set(x, ((w.screenTop + w.screenBottom) / 2) * ex, z);
      pipe.userData = { kind: "well", wellId: w.id };
      screen.userData = { kind: "well", wellId: w.id };
      root.add(pipe, screen);
      if (w.stats) {
        const lvl = new THREE.Mesh(new THREE.ConeGeometry(r * 2.2, r * 2.4, 3), new THREE.MeshBasicMaterial({ color: 0x1d4ed8 }));
        lvl.rotation.x = Math.PI;
        lvl.position.set(x, w.stats.recentMean * ex + r * 1.2, z);
        root.add(lvl);
      }
      const where = w.aquifer === null ? "" : w.aquifer === 0 ? " · deklaag" : ` · ${w.aquifer}e WVP`;
      const label = textSprite(`${w.id}${where}${w.stats ? ` · gem. NAP ${w.stats.recentMean.toFixed(2)}` : ""}`, textColor, labelSize * 0.8);
      label.position.set(x, top * ex + labelSize, z);
      root.add(label);
    }
  }
}

/** De zes vlakken van de section box in scènecoördinaten (x = oost, y = NAP × overhoogte, z = −noord). */
export function sectionPlanes(c: SectionBox, ex: number): THREE.Plane[] {
  return [
    new THREE.Plane(new THREE.Vector3(1, 0, 0), -c.e0), new THREE.Plane(new THREE.Vector3(-1, 0, 0), c.e1),
    new THREE.Plane(new THREE.Vector3(0, 0, -1), -c.n0), new THREE.Plane(new THREE.Vector3(0, 0, 1), c.n1),
    new THREE.Plane(new THREE.Vector3(0, 1, 0), -c.z0 * ex), new THREE.Plane(new THREE.Vector3(0, -1, 0), c.z1 * ex),
  ];
}
