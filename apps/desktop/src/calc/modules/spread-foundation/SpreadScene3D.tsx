// 3D-weergave van de voet in een opengewerkt grondblok: het snijvlak toont dezelfde lagen, niveaus en
// hetzelfde bezwijkvlak als de doorsnede, met het effectieve draagvlak en de belastingpijlen.
// De geometrie komt uit scene.ts; zonder WebGL verschijnt een melding in plaats van de scène.
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { groundHeight, layerPolygon, type ScenePoint, type SpreadScene, type Vec3 } from "./scene";

/** Scène-as naar three.js: z omhoog wordt y omhoog. */
const v = ([x, y, z]: Vec3) => new THREE.Vector3(x, z, -y);
const ARROW_COLORS = { V: 0x1d4ed8, H: 0xb91c1c, R: 0x111827 };

export function SpreadScene3D({ scene: latest }: { scene: SpreadScene }) {
  // De scène wordt alleen opnieuw opgebouwd als de geometrie verandert, zodat de camerastand blijft staan.
  const key = JSON.stringify(latest), s = useMemo(() => latest, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const host = useRef<HTMLDivElement>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const container = host.current;
    if (!container || unavailable) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch { setUnavailable(true); return; }
    const scene = new THREE.Scene(), size = Math.max(s.halfWidthM, s.halfLengthM, s.depthM);
    const camera = new THREE.PerspectiveCamera(36, 1, 0.01, size * 60);
    camera.position.set(size * 0.75, size * 0.6, size * 1.9);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, (s.groundZ - s.depthM) / 2, 0); controls.maxDistance = size * 20; controls.update();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(renderer.domElement);
    renderer.domElement.setAttribute("aria-label", "3D-weergave van de fundering; draaien met slepen, zoomen met scrollen");
    const render = () => renderer.render(scene, camera);
    scene.add(new THREE.AmbientLight(0xffffff, 2));
    const light = new THREE.DirectionalLight(0xffffff, 2); light.position.set(4, 8, 6); scene.add(light);

    // Opengewerkt grondblok: de achterste helft staat er, het snijvlak vooraan is de doorsnede.
    const ink = getComputedStyle(container).color || "#222", white = new THREE.Color(0xffffff);
    const hw = s.halfWidthM, hl = s.halfLengthM, face = 0.004 * size;
    const line = (pts: THREE.Vector3[], color: THREE.ColorRepresentation, dashed = false) => {
      const geometry = new THREE.BufferGeometry().setFromPoints(pts);
      const l = new THREE.Line(geometry, dashed ? new THREE.LineDashedMaterial({ color, dashSize: 0.04 * size, gapSize: 0.03 * size }) : new THREE.LineBasicMaterial({ color }));
      if (dashed) l.computeLineDistances();
      l.renderOrder = 3; scene.add(l);
    };
    const label = (text: string, at: THREE.Vector3, color: string, align: "left" | "right") => {
      const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d");
      if (!ctx) return;
      const font = "600 44px Inter, system-ui, sans-serif"; ctx.font = font;
      canvas.width = Math.ceil(ctx.measureText(text).width) + 16; canvas.height = 60;
      ctx.font = font; ctx.fillStyle = color; ctx.textBaseline = "middle"; ctx.fillText(text, 8, 32);
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
      const h = 0.085 * size, w = (h * canvas.width) / canvas.height;
      sprite.scale.set(w, h, 1); sprite.center.set(align === "left" ? 0 : 1, 0.5); sprite.position.copy(at); sprite.renderOrder = 5; scene.add(sprite);
    };
    const nap = (z: number) => { const value = s.foundationNap + z; return `NAP ${value >= 0 ? "+" : ""}${value.toFixed(2).replace(".", ",")}`; };
    // Een profiel uit de doorsnede (x, z) als lichaam over een lengte naar achteren, vanaf `front`.
    const prism = (profile: ScenePoint[], length: number, front: number) => {
      const geometry = new THREE.ExtrudeGeometry(new THREE.Shape(profile.map((q) => new THREE.Vector2(q.x, q.z))), { depth: length, bevelEnabled: false });
      geometry.translate(0, 0, front - length);
      return geometry;
    };
    // De lagen blijven horizontaal; het hellende maaiveld snijdt ze aan de lage zijde af, op ware schaal.
    for (const layer of s.layers) {
      const soil = new THREE.Mesh(prism(layerPolygon(s, layer), hl, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(layer.color).lerp(white, 0.55), polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
      scene.add(soil);
      scene.add(new THREE.LineSegments(new THREE.EdgesGeometry(soil.geometry), new THREE.LineBasicMaterial({ color: new THREE.Color(layer.color).multiplyScalar(0.55) })));
      label(layer.name, new THREE.Vector3(hw - 0.03 * size, Math.min(layer.topZ, groundHeight(s, hw)) - 0.07 * size, face), ink, "right");
    }
    const level = (z: number, text: string, color: string, dashed: boolean) => {
      if (z > s.groundZ + 1e-6 || z < -s.depthM) return;
      if (dashed) line([new THREE.Vector3(-hw, z, face), new THREE.Vector3(hw, z, face)], color, true);
      label(text, new THREE.Vector3(-hw - 0.04 * size, z, face), color, "right");
    };
    level(s.groundZ, `mv ${nap(s.groundZ)}`, ink, false);
    if (Math.abs(s.groundZ) > 0.05 * size) level(0, `aanleg ${nap(0)}`, ink, true);
    if (s.waterZ < s.groundZ) level(s.waterZ, `gws ${nap(s.waterZ)}`, "#2563eb", true);
    level(-s.zeM, `ze ${nap(-s.zeM)}`, "#b91c1c", true);
    // Bezwijkvlak: alleen op het snijvlak, als omtrek met een lichte vulling. Niets steekt voor het grondblok uit.
    // Het maatgevende vlak doorgetrokken met vulling, het andere gestreept; beide komen uit op het (hellende) maaiveld.
    const clip = (q: { x: number; depth: number }) => ({ x: Math.max(-hw, Math.min(hw, q.x)), depth: Math.min(s.depthM, q.depth) });
    for (const side of s.slip) {
      const clipped = side.outline.map(clip);
      line([...clipped, clipped[0]].map((q) => new THREE.Vector3(q.x, -q.depth, face)), 0xb91c1c, !side.governing);
      if (side.daylight[1].depth < side.daylight[0].depth - 1e-9 && Math.abs(side.daylight[0].x) < hw) line(side.daylight.map(clip).map((q) => new THREE.Vector3(q.x, -q.depth, face)), 0xb91c1c, true);
      if (!side.governing) continue;
      const shape = new THREE.Shape(clipped.map((q) => new THREE.Vector2(q.x, -q.depth)));
      const fill = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: 0xb91c1c, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
      fill.position.z = face / 2; fill.renderOrder = 1; scene.add(fill);
    }
    // De voet met dezelfde doorsnede als in de tekening: de onderkant onder de hoek α.
    const footing = new THREE.Mesh(prism(s.footingProfile, s.footing.size[1], s.footing.size[1] / 2), new THREE.MeshStandardMaterial({ color: 0xb8bcc4, roughness: 0.85, transparent: true, opacity: 0.45, depthWrite: false }));
    scene.add(footing);
    scene.add(new THREE.LineSegments(new THREE.EdgesGeometry(footing.geometry), new THREE.LineBasicMaterial({ color: 0x4b5563 })));
    // Effectief draagvlak b' × l', net onder de voet.
    const e = s.effective, eff = new THREE.Mesh(new THREE.PlaneGeometry(e.x1 - e.x0, e.y1 - e.y0), new THREE.MeshBasicMaterial({ color: 0xd97706, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    eff.rotation.x = -Math.PI / 2; eff.position.copy(v([(e.x0 + e.x1) / 2, (e.y0 + e.y1) / 2, -0.01])); eff.renderOrder = 2;
    const base = new THREE.Group(); base.rotation.z = Math.atan(s.baseTan); base.add(eff); scene.add(base);
    for (const a of s.arrows) {
      const from = v(a.from), to = v(a.to), len = from.distanceTo(to);
      if (len < 1e-6) continue;
      scene.add(new THREE.ArrowHelper(to.clone().sub(from).normalize(), from, len, ARROW_COLORS[a.kind], Math.min(len * 0.3, size * 0.12), Math.min(len * 0.16, size * 0.06)));
    }

    const lost = (event: Event) => { event.preventDefault(); setUnavailable(true); };
    const resize = () => { const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight); camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h); render(); };
    const observer = new ResizeObserver(resize); observer.observe(container);
    controls.addEventListener("change", render);
    renderer.domElement.addEventListener("webglcontextlost", lost);
    resize();
    return () => {
      observer.disconnect(); controls.removeEventListener("change", render); controls.dispose();
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose();
        if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => m.dispose());
      });
      scene.clear(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    };
  }, [s, unavailable]);
  if (unavailable) return <p className="cs-hint" role="status">3D is op dit apparaat niet beschikbaar. De doorsnede toont dezelfde gegevens.</p>;
  return <>
    <div className="sf-scene" ref={host} />
    <p className="cs-hint">{s.strip ? "Strook: een stuk van de doorlopende strook." : "Poer."} Het grondblok is opengewerkt: het snijvlak is de doorsnede. Rood op het snijvlak: het bezwijkvlak aan beide kanten{s.mechanism.drained.symmetric ? "" : ", doorgetrokken het maatgevende en gestreept het andere"}; de rode stippellijn is de invloedsdiepte ze. Oranje: het effectieve draagvlak b′ × l′. Blauw: Vd, rood: Hd, zwart: de resultante. Sleep om te draaien, scroll om te zoomen.</p>
  </>;
}
