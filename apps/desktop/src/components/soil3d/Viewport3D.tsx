import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { SoilModel } from "./soilModel";
import { addLights, buildContent, disposeTree, fitCamera, modelBounds, type PileToe, type ViewPreset } from "./scene";
import type { SectionBox, Soil3DSettings } from "./useSoil3DStore";
import type { SubsurfaceData } from "./subsurface/store";
import { aquifers } from "./subsurface/regis";
import { selectionBox, selectionFromHit, type Selection } from "./selection";
import { OaIcon } from "../icons/oaIcon";

type Face = keyof SectionBox;
/** Grepen van de section box: as in scènecoördinaten, naar buiten wijzend, kleur per as (CAD-gebruik). */
const FACES: { face: Face; axis: [number, number, number]; out: 1 | -1; color: number; name: string }[] = [
  { face: "e0", axis: [1, 0, 0], out: -1, color: 0xdc2626, name: "West" }, { face: "e1", axis: [1, 0, 0], out: 1, color: 0xdc2626, name: "Oost" },
  { face: "n0", axis: [0, 0, -1], out: -1, color: 0x16a34a, name: "Zuid" }, { face: "n1", axis: [0, 0, -1], out: 1, color: 0x16a34a, name: "Noord" },
  { face: "z0", axis: [0, 1, 0], out: -1, color: 0x2563eb, name: "Onder" }, { face: "z1", axis: [0, 1, 0], out: 1, color: 0x2563eb, name: "Boven" },
];
const MIN_SIZE = 0.5;
const PRESETS: { id: ViewPreset; label: string; title: string }[] = [
  { id: "iso", label: "ISO", title: "Schuin van zuidoost" }, { id: "top", label: "Boven", title: "Bovenaanzicht, noord boven" },
  { id: "front", label: "Voor", title: "Vanuit het zuiden" }, { id: "side", label: "Zij", title: "Vanuit het oosten" },
];

function boxCorners(b: SectionBox, ex: number) {
  return new THREE.Box3(new THREE.Vector3(b.e0, b.z0 * ex, -b.n1), new THREE.Vector3(b.e1, b.z1 * ex, -b.n0));
}
function facePoint(b: SectionBox, face: Face, ex: number) {
  const c = boxCorners(b, ex).getCenter(new THREE.Vector3());
  if (face === "e0") c.x = b.e0; if (face === "e1") c.x = b.e1;
  if (face === "n0") c.z = -b.n0; if (face === "n1") c.z = -b.n1;
  if (face === "z0") c.y = b.z0 * ex; if (face === "z1") c.y = b.z1 * ex;
  return c;
}
const fmt = (v: number) => v.toFixed(1).replace(".", ",");
function faceText(face: Face, b: SectionBox) {
  const f = FACES.find((x) => x.face === face)!;
  return face.startsWith("z") ? `${f.name}: NAP ${fmt(b[face])} m` : `${f.name}: ${fmt(b[face])} m`;
}

export interface Viewport3DProps {
  model: SoilModel;
  settings: Soil3DSettings;
  toes: PileToe[];
  activeCptId: string | null;
  subsurface: SubsurfaceData | null;
  textColor: string;
  /** "section": alleen wat in de section box ligt, met grepen; "model": alles, met de box als lijn. */
  mode: "model" | "section";
  sectionBox: SectionBox | null;
  onSectionBox: (box: SectionBox) => void;
  selection: Selection | null;
  onSelect: (sel: Selection | null) => void;
  fitRequest: number;
}

interface Rig {
  scene: THREE.Scene; persp: THREE.PerspectiveCamera; ortho: THREE.OrthographicCamera; camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  controls: OrbitControls; renderer: THREE.WebGLRenderer; content: THREE.Group | null; overlay: THREE.Group; el: HTMLDivElement;
}

/** Eén 3D-venster: eigen camera en besturing, gedeelde inhoud, selectie en section box. */
export function Viewport3D(p: Viewport3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rig = useRef<Rig | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [ortho, setOrtho] = useState(false);
  const [preset, setPreset] = useState<ViewPreset>("iso");
  const [badge, setBadge] = useState<{ x: number; y: number; text: string } | null>(null);
  const latest = useRef(p);
  latest.current = p;
  const ex = p.settings.exaggeration;
  const clip = p.mode === "section" ? p.sectionBox : null;

  const bounds = () => {
    const { settings: s, subsurface: sub, model } = latest.current;
    const depths: number[] = [];
    if (s.showAquifers && sub?.regis) for (const a of aquifers(sub.regis)) depths.push(...a.bottom.filter((v): v is number => v !== null));
    if (s.showGeotop && sub?.geotop) depths.push(Math.min(...sub.geotop.zs));
    if (s.showWells && sub?.wells) depths.push(...sub.wells.map((w) => w.screenBottom).filter((v): v is number => v !== null));
    return modelBounds(model, s.exaggeration, depths.length ? Math.min(...depths) : undefined);
  };
  const fit = (view: ViewPreset) => {
    const r = rig.current;
    if (!r) return;
    const aspect = (r.el.clientWidth || 1) / (r.el.clientHeight || 1);
    r.controls.target.copy(fitCamera(r.camera, bounds(), aspect, view));
    r.controls.update();
  };

  // Renderer, camera's en besturing één keer opzetten.
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch { setUnavailable(true); return; }
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.localClippingEnabled = true;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    addLights(scene);
    const overlay = new THREE.Group();
    scene.add(overlay);
    const persp = new THREE.PerspectiveCamera(35, 1, 0.1, 100000);
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100000);
    const controls = new OrbitControls(persp, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.screenSpacePanning = true;
    rig.current = { scene, persp, ortho, camera: persp, controls, renderer, content: null, overlay, el };
    const resize = () => {
      const w = el.clientWidth || 1, h = el.clientHeight || 1, r = rig.current;
      renderer.setSize(w, h);
      persp.aspect = w / h;
      persp.updateProjectionMatrix();
      if (r && r.camera === ortho) {
        const half = (ortho.top - ortho.bottom) / 2;
        ortho.left = -half * (w / h); ortho.right = half * (w / h);
        ortho.updateProjectionMatrix();
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    // Context kwijt (bijv. venster lang verborgen): opnieuw tekenen zodra hij terug is.
    const lost = (e: Event) => e.preventDefault();
    renderer.domElement.addEventListener("webglcontextlost", lost);
    let frame = 0;
    const loop = () => { frame = requestAnimationFrame(loop); const r = rig.current; if (!r) return; r.controls.update(); renderer.render(scene, r.camera); };
    loop();
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      controls.dispose();
      if (rig.current?.content) disposeTree(rig.current.content);
      disposeTree(overlay);
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      rig.current = null;
    };
  }, []);

  // Wisselen tussen perspectief en orthografisch, met hetzelfde aanzicht.
  useEffect(() => {
    const r = rig.current;
    if (!r) return;
    const next = ortho ? r.ortho : r.persp;
    if (r.camera === next) return;
    r.camera = next;
    r.controls.object = next;
    fit(preset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ortho]);

  // Inhoud opnieuw opbouwen bij elke wijziging van model, vinkjes of section box.
  useEffect(() => {
    const r = rig.current;
    if (!r) return;
    if (r.content) { r.scene.remove(r.content); disposeTree(r.content); r.content = null; }
    r.content = buildContent(p.model, p.settings, p.toes, p.activeCptId, p.textColor, p.subsurface, clip);
    r.scene.add(r.content);
  }, [p.model, p.settings, p.toes, p.activeCptId, p.textColor, p.subsurface, clip]);

  // Section box (lijnen en grepen) en het selectiekader in de overlay.
  useEffect(() => {
    const r = rig.current;
    if (!r) return;
    for (const c of [...r.overlay.children]) { r.overlay.remove(c); disposeTree(c); }
    const b = p.sectionBox;
    if (b) {
      const lines = new THREE.Box3Helper(boxCorners(b, ex), new THREE.Color(p.mode === "section" ? 0x2563eb : 0x94a3b8));
      const lm = lines.material as THREE.LineBasicMaterial;
      lm.transparent = true; lm.opacity = p.mode === "section" ? 0.85 : 0.6; lm.depthTest = false;
      lines.renderOrder = 25;
      r.overlay.add(lines);
      if (p.mode === "section") {
        const dims = boxCorners(b, ex).getSize(new THREE.Vector3());
        const size = Math.max(0.6, Math.max(dims.x, dims.y, dims.z) / 14);
        for (const f of FACES) {
          const dir = new THREE.Vector3(...f.axis).multiplyScalar(f.out);
          const group = new THREE.Group();
          group.userData.face = f.face;
          const mat = new THREE.MeshBasicMaterial({ color: f.color, depthTest: false, transparent: true, opacity: 0.9 });
          const cone = new THREE.Mesh(new THREE.ConeGeometry(size * 0.45, size * 1.1, 20), mat);
          cone.position.y = size * 0.95;
          const stem = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.12, size * 0.12, size * 0.8, 10), mat);
          stem.position.y = size * 0.4;
          const base = new THREE.Mesh(new THREE.SphereGeometry(size * 0.22, 14, 10), mat);
          for (const m of [cone, stem, base]) { m.renderOrder = 30; m.userData.face = f.face; group.add(m); }
          group.position.copy(facePoint(b, f.face, ex));
          group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
          r.overlay.add(group);
        }
      }
    }
    if (p.selection) {
      const box = selectionBox(p.selection, p.model, p.subsurface, ex);
      if (box) {
        const helper = new THREE.Box3Helper(box, new THREE.Color(0xf59e0b));
        const m = helper.material as THREE.LineBasicMaterial;
        m.depthTest = false; m.transparent = true;
        helper.renderOrder = 20;
        r.overlay.add(helper);
      }
    }
  }, [p.sectionBox, p.mode, p.selection, p.model, p.subsurface, ex]);

  // Passend in beeld: bij een nieuw model, een andere overhoogte en op verzoek.
  useEffect(() => { fit(preset); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [p.model, p.fitRequest, ex]);

  // Muis: grepen slepen, klikken selecteert, dubbelklik draait om het punt, Esc heft de selectie op.
  useEffect(() => {
    const r = rig.current;
    if (!r) return;
    const el = r.renderer.domElement;
    const rayAt = (e: { clientX: number; clientY: number }) => {
      const rect = el.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.params.Line = { threshold: 0.05 };
      ray.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), r.camera);
      return ray;
    };
    const handleAt = (e: { clientX: number; clientY: number }) =>
      latest.current.mode === "section" ? rayAt(e).intersectObjects(r.overlay.children, true).find((h) => h.object.userData.face) ?? null : null;
    const pick = (e: MouseEvent) => {
      if (!r.content) return null;
      for (const hit of rayAt(e).intersectObjects(r.content.children, true)) {
        const sel = selectionFromHit(hit, latest.current.settings.exaggeration);
        if (sel) return { sel, hit };
      }
      return null;
    };
    // Parameter langs de as door `origin` met richting `dir` van het punt dat het dichtst bij de muisstraal ligt.
    const along = (ray: THREE.Raycaster, origin: THREE.Vector3, dir: THREE.Vector3) => {
      const o = ray.ray.origin, rd = ray.ray.direction, w = o.clone().sub(origin);
      const b = rd.dot(dir), denom = 1 - b * b;
      if (Math.abs(denom) < 1e-6) return null;
      return (w.dot(dir) - w.dot(rd) * b) / denom;
    };
    const highlight = (face: Face | null) => {
      for (const g of r.overlay.children) {
        if (!g.userData.face) continue;
        const f = FACES.find((x) => x.face === g.userData.face)!;
        g.traverse((m) => { const mat = (m as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined; if (mat?.color) mat.color.setHex(g.userData.face === face ? 0xf59e0b : f.color); });
        g.scale.setScalar(g.userData.face === face ? 1.25 : 1);
      }
    };
    let down: { x: number; y: number } | null = null;
    let drag: { face: Face; dir: THREE.Vector3; origin: THREE.Vector3; t0: number; start: SectionBox } | null = null;
    let hovered: Face | null = null;
    let pending: SectionBox | null = null, raf = 0;
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
      const { sectionBox } = latest.current;
      if (!sectionBox || e.button !== 0) return;
      const handle = handleAt(e);
      if (!handle) return;
      const face = handle.object.userData.face as Face;
      const f = FACES.find((x) => x.face === face)!;
      const dir = new THREE.Vector3(...f.axis), origin = facePoint(sectionBox, face, latest.current.settings.exaggeration);
      const t0 = along(rayAt(e), origin, dir);
      if (t0 === null) return;
      drag = { face, dir, origin, t0, start: { ...sectionBox } };
      r.controls.enabled = false;
      el.style.cursor = "grabbing";
      el.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      if (!drag) {
        const h = handleAt(e);
        const face = (h?.object.userData.face as Face | undefined) ?? null;
        if (face !== hovered) { hovered = face; highlight(face); el.style.cursor = face ? "grab" : ""; }
        return;
      }
      const t = along(rayAt(e), drag.origin, drag.dir);
      if (t === null) return;
      const exNow = latest.current.settings.exaggeration;
      const delta = (t - drag.t0) / (drag.face.startsWith("z") ? exNow : 1);
      const b = { ...drag.start, [drag.face]: Math.round((drag.start[drag.face] + delta) * 10) / 10 };
      // Vlakken blijven in volgorde met een kleinste afstand.
      if (b.e1 - b.e0 < MIN_SIZE) { if (drag.face === "e0") b.e0 = b.e1 - MIN_SIZE; else b.e1 = b.e0 + MIN_SIZE; }
      if (b.n1 - b.n0 < MIN_SIZE) { if (drag.face === "n0") b.n0 = b.n1 - MIN_SIZE; else b.n1 = b.n0 + MIN_SIZE; }
      if (b.z1 - b.z0 < MIN_SIZE) { if (drag.face === "z0") b.z0 = b.z1 - MIN_SIZE; else b.z1 = b.z0 + MIN_SIZE; }
      setBadge({ x: e.clientX - rect.left, y: e.clientY - rect.top, text: faceText(drag.face, b) });
      pending = b;
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (pending) latest.current.onSectionBox(pending); pending = null; });
    };
    const endDrag = () => {
      if (!drag) return false;
      drag = null; r.controls.enabled = true; down = null; el.style.cursor = hovered ? "grab" : ""; setBadge(null);
      return true;
    };
    const onUp = (e: PointerEvent) => {
      if (endDrag()) return;
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4 || e.button !== 0) return;
      latest.current.onSelect(pick(e)?.sel ?? null);
    };
    const onDbl = (e: MouseEvent) => {
      const found = pick(e);
      if (found) { r.controls.target.copy(found.hit.point); r.controls.update(); }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") latest.current.onSelect(null); };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("dblclick", onDbl);
    window.addEventListener("keydown", onKey);
    // Loslaten buiten het venster of een afgebroken aanwijzer rondt het slepen ook af.
    const onWindowUp = () => { endDrag(); };
    window.addEventListener("pointerup", onWindowUp);
    window.addEventListener("pointercancel", onWindowUp);
    el.addEventListener("lostpointercapture", onWindowUp);
    return () => {
      window.removeEventListener("pointerup", onWindowUp);
      window.removeEventListener("pointercancel", onWindowUp);
      el.removeEventListener("lostpointercapture", onWindowUp);
      cancelAnimationFrame(raf);
      el.removeEventListener("pointerdown", onDown); el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp); el.removeEventListener("dblclick", onDbl);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className="soil3d-viewport">
      <div className="soil3d-canvas" ref={mountRef} />
      <div className="soil3d-viewbar" role="toolbar" aria-label="Aanzicht">
        {PRESETS.map((v) => (
          <button key={v.id} type="button" title={v.title} className={preset === v.id ? "on" : ""} onClick={() => { setPreset(v.id); fit(v.id); }}>{v.label}</button>
        ))}
        <span className="sep" />
        <button type="button" title="Orthografisch of perspectief" className={ortho ? "on" : ""} onClick={() => setOrtho(!ortho)}>{ortho ? "Ortho" : "Persp"}</button>
        <button type="button" className="soil3d-viewbar-icon" title="Passend in beeld" aria-label="Passend in beeld" onClick={() => fit(preset)}><OaIcon id="view.fit" /></button>
      </div>
      {badge && <div className="soil3d-badge" style={{ left: badge.x + 14, top: badge.y + 14 }}>{badge.text}</div>}
      {unavailable && <div className="soil3d-empty">3D-weergave is op dit systeem niet beschikbaar (geen WebGL).</div>}
    </div>
  );
}
