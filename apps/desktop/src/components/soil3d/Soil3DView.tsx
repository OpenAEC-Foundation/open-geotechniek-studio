import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { useCptStore } from "../../store/useCptStore";
import { useCalculationsStore } from "../../calc/framework/store";
import { buildSoilModel, exposedCells, zoneInfo, type SoilModel } from "./soilModel";
import { useSoil3DStore, type Soil3DSettings } from "./useSoil3DStore";
import "./soil3d.css";

interface PileToe { cptId: string; name: string; toeNap: number }
interface Criterion { qcMpa: number; thicknessM: number; source: string | null }

const BEARING_COLOR = 0xe8590c, GROUND_COLOR = 0x7c8f4e, QC_COLOR = 0xb3261e, TOE_COLOR = 0x1f2933;

function cssVar(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

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

function buildContent(model: SoilModel, s: Soil3DSettings, toes: PileToe[], activeId: string | null, textColor: string) {
  const root = new THREE.Group();
  const ex = s.exaggeration;
  const g = model.grid;
  const r = Math.max(0.25, model.span / 90);

  if (s.showModel) {
    const limit = Math.round(s.cut * (s.cutAxis === "east" ? g.nx : g.ny));
    const cells = exposedCells(g, (z, i, j) => !s.hiddenZones.includes(z) && (s.cutAxis === "east" ? i < limit : j < limit));
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
      mesh.userData.zone = zone;
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
        mesh.userData.cptId = c.id;
        root.add(mesh);
      }
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.35, r * 0.35, (c.groundNap - c.endNap) * ex, 8), new THREE.MeshBasicMaterial({ color: c.id === activeId ? 0x2563eb : 0x6b7280 }));
      shaft.position.set(x, ((c.groundNap + c.endNap) / 2) * ex, z);
      shaft.userData.cptId = c.id;
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
      root.add(cone);
    }
  }

  if (s.showGround) { const m = surfaceMesh(model, "ground", ex, GROUND_COLOR, 0.3); if (m) root.add(m); }
  if (s.showBearing) { const m = surfaceMesh(model, "bearing", ex, BEARING_COLOR, 0.45); if (m) root.add(m); }

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
  return root;
}

export function niceStep(range: number) {
  const raw = range / 6, mag = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-6)));
  return [1, 2, 5, 10].map((f) => f * mag).find((v) => v >= raw) ?? 10 * mag;
}

function disposeTree(obj: THREE.Object3D) {
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

export default function Soil3DView() {
  const { t } = useTranslation("ribbon");
  const cpts = useCptStore((s) => s.cpts);
  const activeCptId = useCptStore((s) => s.activeCptId);
  const setActive = useCptStore((s) => s.setActive);
  const activeDocId = useCptStore((s) => s.activeDocId);
  const byDoc = useCalculationsStore((s) => s.byDoc);
  const settings = useSoil3DStore();
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{ scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls; renderer: THREE.WebGLRenderer; content: THREE.Group | null } | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const calcs = useMemo(() => (activeDocId ? byDoc.get(activeDocId) : undefined) ?? [], [activeDocId, byDoc]);
  const criterion = useMemo<Criterion>(() => {
    const advice = calcs.find((c) => c.moduleId === "foundation-advice");
    const input = advice?.input as { bearingQcMpa?: number; bearingMinThicknessM?: number } | undefined;
    return {
      qcMpa: Number.isFinite(input?.bearingQcMpa) ? input!.bearingQcMpa! : 10,
      thicknessM: Number.isFinite(input?.bearingMinThicknessM) ? input!.bearingMinThicknessM! : 1,
      source: advice?.name ?? null,
    };
  }, [calcs]);
  const toes = useMemo<PileToe[]>(() => calcs.filter((c) => c.moduleId === "pile-bearing-capacity").flatMap((c) => {
    const input = c.input as { cptId?: string | null; pileToeNap?: number };
    return input.cptId && Number.isFinite(input.pileToeNap) ? [{ cptId: input.cptId, name: c.name, toeNap: input.pileToeNap! }] : [];
  }), [calcs]);

  const { model, error } = useMemo(() => {
    const list = [...cpts.values()];
    if (!list.length) return { model: null, error: null };
    try { return { model: buildSoilModel(list, { bearingQcMpa: criterion.qcMpa, bearingMinThicknessM: criterion.thicknessM }), error: null }; }
    catch (e) { return { model: null, error: String(e) }; }
  }, [cpts, criterion]);

  // Scène, camera en besturing één keer opzetten.
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch { setUnavailable(true); return; }
    renderer.setPixelRatio(window.devicePixelRatio);
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(1, 2, 1.5);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    sceneRef.current = { scene, camera, controls, renderer, content: null };
    const resize = () => {
      const w = el.clientWidth || 1, h = el.clientHeight || 1;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    let frame = 0;
    const loop = () => { frame = requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); };
    loop();
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      controls.dispose();
      if (sceneRef.current?.content) disposeTree(sceneRef.current.content);
      renderer.dispose();
      renderer.domElement.remove();
      sceneRef.current = null;
    };
  }, []);

  // Inhoud opnieuw opbouwen bij elke wijziging van model of vinkjes.
  useEffect(() => {
    const ref = sceneRef.current;
    if (!ref) return;
    if (ref.content) { ref.scene.remove(ref.content); disposeTree(ref.content); ref.content = null; }
    if (!model) return;
    ref.content = buildContent(model, settings, toes, activeCptId, cssVar("--theme-text", "#1f2933"));
    ref.scene.add(ref.content);
  }, [model, settings, toes, activeCptId]);

  // Passend in beeld: bij een nieuw model en op verzoek vanuit het lint.
  useEffect(() => {
    const ref = sceneRef.current;
    if (!ref || !model) return;
    const g = model.grid, ex = settings.exaggeration;
    const mid = new THREE.Vector3(g.east0 + (g.nx * g.dx) / 2, (g.topNap - (g.nz * g.dz) / 2) * ex, -(g.north0 + (g.ny * g.dy) / 2));
    const size = Math.max(g.nx * g.dx, g.ny * g.dy, g.nz * g.dz * ex);
    ref.controls.target.copy(mid);
    ref.camera.position.set(mid.x + size * 1.1, mid.y + size * 0.8, mid.z + size * 1.3);
    ref.camera.near = size / 500;
    ref.camera.far = size * 50;
    ref.camera.updateProjectionMatrix();
    ref.controls.update();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, settings.fitRequest, settings.exaggeration]);

  // Klik op een sondering maakt haar actief.
  useEffect(() => {
    const ref = sceneRef.current;
    if (!ref) return;
    const el = ref.renderer.domElement;
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4 || !ref.content) return;
      const rect = el.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), ref.camera);
      const hit = ray.intersectObjects(ref.content.children, false).find((h) => h.object.userData.cptId);
      if (hit) setActive(hit.object.userData.cptId as string);
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    return () => { el.removeEventListener("pointerdown", onDown); el.removeEventListener("pointerup", onUp); };
  }, [setActive]);

  const placed = model?.columns.filter((c) => c.placed) ?? [];
  const tops = placed.map((c) => c.bearingTopNap).filter((v): v is number => v !== null);

  return (
    <div className="soil3d-view">
      <div className="soil3d-canvas" ref={mountRef} />
      {unavailable && <div className="soil3d-empty">{t("model3d.noWebgl", "3D-weergave is op dit systeem niet beschikbaar (geen WebGL).")}</div>}
      {!unavailable && !model && <div className="soil3d-empty">{error ?? t("model3d.empty", "Voeg sonderingen toe om het grondmodel op te bouwen.")}</div>}
      {model && (
        <aside className="soil3d-legend">
          <div className="soil3d-legend-title">{t("model3d.legend", "Grondsoorten")}</div>
          {model.zonesPresent.map((z) => {
            const info = zoneInfo(z);
            return (
              <label key={z} className="soil3d-zone">
                <input type="checkbox" checked={!settings.hiddenZones.includes(z)} onChange={() => settings.toggleZone(z)} />
                <span className="soil3d-swatch" style={{ background: info?.color }} />
                {info?.name ?? `Zone ${z}`}
              </label>
            );
          })}
          <div className="soil3d-legend-title">{t("model3d.bearing", "Draagkrachtige laag")}</div>
          <div className="soil3d-note">
            qc ≥ {criterion.qcMpa} MPa {t("model3d.over", "over")} ≥ {criterion.thicknessM} m
            <br />
            {criterion.source ? `${t("model3d.from", "uit")} ${criterion.source}` : t("model3d.defaultCriterion", "standaard; stel in via een funderingsadvies")}
            {tops.length > 0 && <><br />NAP {Math.max(...tops).toFixed(2)} {t("model3d.to", "tot")} {Math.min(...tops).toFixed(2)} m ({tops.length}/{placed.length})</>}
          </div>
          <div className="soil3d-note soil3d-muted">
            {model.grid.nx} × {model.grid.ny} × {model.grid.nz} {t("model3d.cells", "cellen")} ({model.grid.dx.toFixed(1)} × {model.grid.dy.toFixed(1)} × {model.grid.dz.toFixed(1)} m), IDW
          </div>
          {model.warnings.map((w) => <div key={w} className="soil3d-note soil3d-warn">{w}</div>)}
        </aside>
      )}
    </div>
  );
}
