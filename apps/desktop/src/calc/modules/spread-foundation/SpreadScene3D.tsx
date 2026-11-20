// 3D-weergave van de voet in de grond, met het effectieve draagvlak en de belastingpijlen.
// De geometrie komt uit scene.ts; zonder WebGL verschijnt een melding in plaats van de scène.
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { SpreadScene, Vec3 } from "./scene";

/** Scène-as naar three.js: z omhoog wordt y omhoog. */
const v = ([x, y, z]: Vec3) => new THREE.Vector3(x, z, -y);
const ARROW_COLORS = { V: 0x1d4ed8, H: 0xb91c1c, R: 0x111827 };

export function SpreadScene3D({ scene: s }: { scene: SpreadScene }) {
  const host = useRef<HTMLDivElement>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const container = host.current;
    if (!container || unavailable) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch { setUnavailable(true); return; }
    const scene = new THREE.Scene(), size = Math.max(s.halfWidthM, s.halfLengthM, s.depthM);
    const camera = new THREE.PerspectiveCamera(36, 1, 0.01, size * 60);
    camera.position.set(size * 1.6, size * 1.3, size * 2.2);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, -s.depthM / 4, 0); controls.maxDistance = size * 20; controls.update();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(renderer.domElement);
    renderer.domElement.setAttribute("aria-label", "3D-weergave van de fundering; draaien met slepen, zoomen met scrollen");
    const render = () => renderer.render(scene, camera);
    scene.add(new THREE.AmbientLight(0xffffff, 2));
    const light = new THREE.DirectionalLight(0xffffff, 2); light.position.set(4, 8, 6); scene.add(light);

    for (const layer of s.layers) {
      const h = layer.topZ - layer.bottomZ;
      const soil = new THREE.Mesh(new THREE.BoxGeometry(2 * s.halfWidthM, h, 2 * s.halfLengthM), new THREE.MeshBasicMaterial({ color: new THREE.Color(layer.color), transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }));
      soil.position.set(0, (layer.topZ + layer.bottomZ) / 2, 0); scene.add(soil);
      const outline = new THREE.LineSegments(new THREE.EdgesGeometry(soil.geometry), new THREE.LineBasicMaterial({ color: new THREE.Color(layer.color) }));
      outline.position.copy(soil.position); scene.add(outline);
    }
    if (s.waterZ < s.groundZ && s.waterZ > -s.depthM) {
      const water = new THREE.Mesh(new THREE.PlaneGeometry(2 * s.halfWidthM, 2 * s.halfLengthM), new THREE.MeshBasicMaterial({ color: 0x2563eb, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
      water.rotation.x = -Math.PI / 2; water.position.y = s.waterZ; scene.add(water);
    }
    const footing = new THREE.Mesh(new THREE.BoxGeometry(s.footing.size[0], s.footing.size[2], s.footing.size[1]), new THREE.MeshStandardMaterial({ color: 0xb8bcc4, roughness: 0.85, transparent: true, opacity: 0.45, depthWrite: false }));
    footing.position.copy(v(s.footing.center)); scene.add(footing);
    const footingEdges = new THREE.LineSegments(new THREE.EdgesGeometry(footing.geometry), new THREE.LineBasicMaterial({ color: 0x4b5563 }));
    footingEdges.position.copy(footing.position); scene.add(footingEdges);
    // Effectief draagvlak b' × l', net onder de voet.
    const e = s.effective, eff = new THREE.Mesh(new THREE.PlaneGeometry(e.x1 - e.x0, e.y1 - e.y0), new THREE.MeshBasicMaterial({ color: 0xd97706, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    eff.rotation.x = -Math.PI / 2; eff.position.copy(v([(e.x0 + e.x1) / 2, (e.y0 + e.y1) / 2, -0.01])); eff.renderOrder = 2; scene.add(eff);
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
    <p className="cs-hint">{s.strip ? "Strook: een stuk van de doorlopende strook." : "Poer."} Oranje: het effectieve draagvlak b′ × l′. Blauw: Vd, rood: Hd, zwart: de resultante. Sleep om te draaien, scroll om te zoomen.</p>
  </>;
}
