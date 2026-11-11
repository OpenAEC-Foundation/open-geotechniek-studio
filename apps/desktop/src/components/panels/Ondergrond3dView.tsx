import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { useCptStore } from "../../store/useCptStore";
import { useSubsurfaceStore, type SubsurfaceCamera } from "../../store/useSubsurfaceStore";
import type { Cpt } from "../../types/cpt";
import { zones as zoneDefs } from "../../utils/soilZones";
import {
  buildSubsurfaceModel,
  type SubsurfaceModel,
} from "../../utils/subsurfaceModel";
import { saveBlobAsFile } from "../../utils/browserSave";
import "./Ondergrond3dView.css";

/**
 * Ondergrond 3D — indicatief voxelmodel tussen de sonderingen van het
 * actieve project (of alle geopende losse sonderingen), met de
 * sonderingen als gekleurde kolommen. Draaien met links slepen, pannen
 * met rechts, zoomen met het wiel.
 */

function collectCpts(
  documents: ReturnType<typeof useCptStore.getState>["documents"],
  activeDocId: string | null,
): Cpt[] {
  const active = documents.find((d) => d.id === activeDocId);
  if (active?.kind === "project") return [...active.cpts.values()];
  return documents.flatMap((d) =>
    d.kind === "cpt" ? [d.cpt] : d.kind === "project" ? [...d.cpts.values()] : [],
  );
}

function zoneColor(zone: number): string {
  return zoneDefs.find((z) => z.number === zone)?.color ?? "#999999";
}

function makeLabel(text: string, opts: { color?: string; bg?: string; size?: number } = {}) {
  const size = opts.size ?? 28;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const font = `600 ${size}px Inter, "Noto Sans", sans-serif`;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + size;
  const h = Math.ceil(size * 1.6);
  canvas.width = w;
  canvas.height = h;
  ctx.font = font;
  if (opts.bg) {
    ctx.fillStyle = opts.bg;
    const r = h / 2.6;
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, r);
    ctx.fill();
  }
  ctx.fillStyle = opts.color ?? "#2A2A32";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(text, w / 2, h / 2 + 1);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.renderOrder = 10;
  sprite.userData.aspect = w / h;
  return sprite;
}

interface SceneRefs {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  content: THREE.Group;
  labels: THREE.Sprite[];
  radius: number;
  frame: number;
  placed: boolean;
  render: () => void;
}

function disposeGroup(group: THREE.Object3D) {
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose?.();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    const mats = Array.isArray(mat) ? mat : mat ? [mat] : [];
    mats.forEach((x) => {
      (x as THREE.SpriteMaterial).map?.dispose?.();
      x.dispose();
    });
  });
  group.clear();
}

function buildContent(
  model: SubsurfaceModel,
  s: ReturnType<typeof useSubsurfaceStore.getState>,
  labels: THREE.Sprite[],
): { group: THREE.Group; radius: number } {
  const group = new THREE.Group();
  labels.length = 0;
  const g = model.grid;
  if (!g) return { group, radius: 10 };
  const ex = s.exaggeration;
  const cx = g.x0 + (g.nx * g.dx) / 2;
  const cy = g.y0 + (g.ny * g.dx) / 2;
  const height = g.nz * g.dz;
  const zMid = g.zTop - height / 2;
  const toY = (z: number) => (z - zMid) * ex;
  const toX = (x: number) => x - cx;
  const toZ = (y: number) => -(y - cy);
  const width = g.nx * g.dx;
  const depth = g.ny * g.dx;

  // Doorsnede-regels.
  const cutTopZ = g.zTop - s.cutTop * height;
  const cutBoth = s.cutX < 1 && s.cutY < 1;
  const visible = (ix: number, iy: number, iz: number) => {
    const zone = g.cells[ix + g.nx * (iy + g.ny * iz)];
    if (!zone) return false;
    if (g.zTop - (iz + 0.5) * g.dz > cutTopZ) return false;
    const hx = (ix + 0.5) / g.nx > s.cutX;
    const hy = (iy + 0.5) / g.ny < 1 - s.cutY;
    if (cutBoth ? hx && hy : hx || hy) return false;
    return true;
  };

  if (s.showVoxels) {
    const positions: number[] = [];
    const colors: THREE.Color[] = [];
    const palette = new Map<number, THREE.Color>();
    for (let iz = 0; iz < g.nz; iz++)
      for (let iy = 0; iy < g.ny; iy++)
        for (let ix = 0; ix < g.nx; ix++) {
          if (!visible(ix, iy, iz)) continue;
          const exposed =
            ix === 0 || iy === 0 || iz === 0 ||
            ix === g.nx - 1 || iy === g.ny - 1 || iz === g.nz - 1 ||
            !visible(ix - 1, iy, iz) || !visible(ix + 1, iy, iz) ||
            !visible(ix, iy - 1, iz) || !visible(ix, iy + 1, iz) ||
            !visible(ix, iy, iz - 1) || !visible(ix, iy, iz + 1);
          if (!exposed && s.opacity >= 1) continue;
          const zone = g.cells[ix + g.nx * (iy + g.ny * iz)];
          let c = palette.get(zone);
          if (!c) {
            c = new THREE.Color(zoneColor(zone));
            palette.set(zone, c);
          }
          positions.push(
            toX(g.x0 + (ix + 0.5) * g.dx),
            toY(g.zTop - (iz + 0.5) * g.dz),
            toZ(g.y0 + (iy + 0.5) * g.dx),
          );
          colors.push(c);
        }
    const geom = new THREE.BoxGeometry(g.dx, g.dz * ex, g.dx);
    const mat = new THREE.MeshLambertMaterial({
      transparent: s.opacity < 1,
      opacity: s.opacity,
      depthWrite: s.opacity >= 1,
    });
    const mesh = new THREE.InstancedMesh(geom, mat, Math.max(1, colors.length));
    mesh.count = colors.length;
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < colors.length; i++) {
      m4.makeTranslation(positions[3 * i], positions[3 * i + 1], positions[3 * i + 2]);
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, colors[i]);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
  }

  // Omhullende kader + NAP-schaal.
  const box = new THREE.Box3(
    new THREE.Vector3(-width / 2, toY(g.zTop - height), -depth / 2),
    new THREE.Vector3(width / 2, toY(g.zTop), depth / 2),
  );
  const helper = new THREE.Box3Helper(box, new THREE.Color("#7F7F84"));
  (helper.material as THREE.LineBasicMaterial).transparent = true;
  (helper.material as THREE.LineBasicMaterial).opacity = 0.5;
  group.add(helper);

  const step = height > 30 ? 10 : height > 12 ? 5 : 2;
  const tickMat = new THREE.LineBasicMaterial({ color: "#7F7F84" });
  const ax = -width / 2;
  const az = depth / 2;
  for (let z = Math.ceil((g.zTop - height) / step) * step; z <= g.zTop + 1e-6; z += step) {
    const y = toY(z);
    const tick = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(ax, y, az),
      new THREE.Vector3(ax - width * 0.03, y, az + depth * 0.03),
    ]);
    group.add(new THREE.Line(tick, tickMat));
    const label = makeLabel(`${z > 0 ? "+" : ""}${z.toFixed(0)} m NAP`, { color: "#5F5F65", size: 22 });
    label.position.set(ax - width * 0.09, y, az + depth * 0.09);
    label.userData.scale = 0.032;
    labels.push(label);
    if (s.showLabels) group.add(label);
  }

  // Noordpijl.
  const north = makeLabel("N ↑", { color: "#2A2A32", size: 24 });
  north.position.set(width / 2 + width * 0.06, toY(g.zTop), -depth / 2);
  north.userData.scale = 0.035;
  labels.push(north);
  if (s.showLabels) group.add(north);

  if (s.showCpts) {
    const r = Math.max(0.2, g.dx * 0.4);
    for (const c of model.cpts) {
      const x = toX(c.x);
      const zz = toZ(c.y);
      for (const l of c.layers) {
        const h = (l.top - l.bottom) * ex;
        if (h <= 0) continue;
        const geom = new THREE.CylinderGeometry(r, r, h, 20);
        const mat = new THREE.MeshLambertMaterial({ color: zoneColor(l.zone) });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.set(x, toY((l.top + l.bottom) / 2), zz);
        group.add(mesh);
      }
      // Stok boven maaiveld zodat de positie altijd zichtbaar is.
      const stemH = height * ex * 0.18;
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 0.25, r * 0.25, stemH, 8),
        new THREE.MeshLambertMaterial({ color: "#36363E" }),
      );
      stem.position.set(x, toY(c.surface) + stemH / 2, zz);
      group.add(stem);
      const tip = new THREE.Mesh(
        new THREE.ConeGeometry(r * 1.2, r * 2.4, 16),
        new THREE.MeshLambertMaterial({ color: "#36363E" }),
      );
      tip.rotation.x = Math.PI;
      tip.position.set(x, toY(c.bottom) - r * 1.2, zz);
      group.add(tip);
      const label = makeLabel(c.name, { color: "#FFFFFF", bg: "#36363E", size: 26 });
      label.position.set(x, toY(c.surface) + stemH + 1, zz);
      label.userData.scale = 0.03;
      labels.push(label);
      if (s.showLabels) group.add(label);
    }
  }

  const radius = Math.max(width, depth, height * ex) * 0.9;
  return { group, radius };
}

function placeCamera(refs: SceneRefs, view: SubsurfaceCamera) {
  const d = refs.radius * 2.25;
  const pos: Record<SubsurfaceCamera, [number, number, number]> = {
    iso: [d * 0.72, d * 0.55, d * 0.72],
    top: [0, d * 1.3, 0.001],
    front: [0, 0, d * 1.2],
    side: [d * 1.2, 0, 0],
  };
  refs.camera.position.set(...pos[view]);
  refs.controls.target.set(0, 0, 0);
  refs.controls.update();
}

export default function Ondergrond3dView() {
  const documents = useCptStore((s) => s.documents);
  const activeDocId = useCptStore((s) => s.activeDocId);
  const settings = useSubsurfaceStore();
  const hostRef = useRef<HTMLDivElement>(null);
  const refs = useRef<SceneRefs | null>(null);
  const lastCameraSeq = useRef(-1);
  const lastExportSeq = useRef(settings.exportSeq);

  const cpts = useMemo(() => collectCpts(documents, activeDocId), [documents, activeDocId]);
  const model = useMemo(() => buildSubsurfaceModel(cpts), [cpts]);

  // Scène eenmalig opzetten.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 10000);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a90, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(0.6, 1, 0.8);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffffff, 0.5);
    fill.position.set(-1, 0.3, -0.6);
    scene.add(fill);
    const content = new THREE.Group();
    scene.add(content);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    const r: SceneRefs = { renderer, scene, camera, controls, content, labels: [], radius: 10, frame: 0, placed: false, render: () => {} };
    refs.current = r;

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = host;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      r.render();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    const tmp = new THREE.Vector3();
    r.render = () => {
      for (const l of r.labels) {
        const dist = camera.position.distanceTo(l.getWorldPosition(tmp));
        const sc = dist * (l.userData.scale ?? 0.03);
        l.scale.set(sc * (l.userData.aspect ?? 1) * 0.5, sc * 0.5, 1);
      }
      renderer.render(scene, camera);
    };
    // Renderen op aanvraag; damping houdt de lus kort draaiende na interactie.
    const loop = () => {
      r.frame = requestAnimationFrame(loop);
      controls.update();
      r.render();
    };
    loop();
    return () => {
      cancelAnimationFrame(r.frame);
      ro.disconnect();
      controls.dispose();
      disposeGroup(content);
      renderer.dispose();
      renderer.domElement.remove();
      refs.current = null;
    };
  }, []);

  // Inhoud opnieuw opbouwen bij nieuw model of andere instellingen.
  useEffect(() => {
    const r = refs.current;
    if (!r) return;
    disposeGroup(r.content);
    const { group, radius } = buildContent(model, settings, r.labels);
    r.content.add(...group.children);
    r.radius = radius;
    if (!r.placed && model.grid) {
      placeCamera(r, "iso");
      r.placed = true;
      lastCameraSeq.current = settings.cameraRequest.seq;
    }
    r.render();
  }, [model, settings.showVoxels, settings.showCpts, settings.showLabels, settings.exaggeration,
      settings.cutX, settings.cutY, settings.cutTop, settings.opacity]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const r = refs.current;
    if (!r || settings.cameraRequest.seq === lastCameraSeq.current) return;
    lastCameraSeq.current = settings.cameraRequest.seq;
    placeCamera(r, settings.cameraRequest.view);
    r.render();
  }, [settings.cameraRequest]);

  useEffect(() => {
    const r = refs.current;
    if (!r || settings.exportSeq === lastExportSeq.current) return;
    lastExportSeq.current = settings.exportSeq;
    r.render();
    r.renderer.domElement.toBlob((blob) => {
      if (blob) void saveBlobAsFile(blob, "ondergrond-3d.png", { "image/png": [".png"] });
    }, "image/png");
  }, [settings.exportSeq]);

  const g = model.grid;
  return (
    <div className="ondergrond3d">
      <div className="ondergrond3d-canvas" ref={hostRef} />
      {!g && (
        <div className="ondergrond3d-empty">
          <h3>Nog geen 3D-model</h3>
          <p>
            Open een project of sonderingen met RD-coördinaten. Het model wordt
            automatisch opgebouwd uit de laagindeling per sondering.
          </p>
        </div>
      )}
      {g && (
        <>
          <div className="ondergrond3d-legend">
            <div className="ondergrond3d-legend-title">Grondsoort (indicatief)</div>
            {model.zones.map((z) => (
              <div key={z} className="ondergrond3d-legend-row">
                <span className="swatch" style={{ background: zoneColor(z) }} />
                {zoneDefs.find((d) => d.number === z)?.name}
              </div>
            ))}
            <div className="ondergrond3d-legend-meta">
              {model.cpts.length} sonderingen · raster {g.dx.toFixed(1)} × {g.dx.toFixed(1)} ×{" "}
              {g.dz.toFixed(2)} m
              {model.skipped.length > 0 && (
                <> · {model.skipped.length} zonder positie/laagindeling</>
              )}
            </div>
          </div>
          <div className="ondergrond3d-controls">
            <label>
              <span>Verticale overdrijving</span>
              <input
                type="range" min={1} max={10} step={0.5}
                value={settings.exaggeration}
                onChange={(e) => settings.set({ exaggeration: Number(e.target.value) })}
              />
              <output>{settings.exaggeration}×</output>
            </label>
            <label>
              <span>Doorsnede oost-west</span>
              <input
                type="range" min={0} max={1} step={0.02}
                value={settings.cutX}
                onChange={(e) => settings.set({ cutX: Number(e.target.value) })}
              />
            </label>
            <label>
              <span>Doorsnede noord-zuid</span>
              <input
                type="range" min={0} max={1} step={0.02}
                value={settings.cutY}
                onChange={(e) => settings.set({ cutY: Number(e.target.value) })}
              />
            </label>
            <label>
              <span>Van boven afgraven</span>
              <input
                type="range" min={0} max={0.95} step={0.01}
                value={settings.cutTop}
                onChange={(e) => settings.set({ cutTop: Number(e.target.value) })}
              />
              <output>{(g.zTop - settings.cutTop * g.nz * g.dz).toFixed(1)} m</output>
            </label>
          </div>
          <div className="ondergrond3d-note">
            Indicatief model: interpolatie (IDW) van de Robertson-indeling tussen sonderingen.
          </div>
        </>
      )}
    </div>
  );
}
