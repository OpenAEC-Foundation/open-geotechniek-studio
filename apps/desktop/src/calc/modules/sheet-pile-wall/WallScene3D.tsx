// 3D-weergave van de damwand in een opengewerkt grondblok: het snijvlak vooraan toont de lagen en de
// waterstanden aan beide zijden, de wand steekt ervoor uit zodat het profiel van de planken te zien is.
// De geometrie komt uit scene.ts; zonder WebGL verschijnt een melding in plaats van de scène.
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { clipLine, type SceneLayer, type WallScene } from "./scene";

export function WallScene3D({ scene: latest }: { scene: WallScene }) {
  const { t } = useTranslation("calcWall");
  // De scène wordt alleen opnieuw opgebouwd als de geometrie verandert, zodat de camerastand blijft staan.
  const key = JSON.stringify(latest), s = useMemo(() => latest, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const host = useRef<HTMLDivElement>(null);
  const [unavailable, setUnavailable] = useState(false);
  const labels = { ground: t("visual.ground", "mv"), water: t("visual.water", "water"), toe: t("visual.toe", "teen"), aria: t("visual.sceneAria", "3D-weergave van de damwand; draaien met slepen, zoomen met scrollen") };
  const labelKey = JSON.stringify(labels);
  useEffect(() => {
    const container = host.current;
    if (!container || unavailable) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch { setUnavailable(true); return; }
    const scene = new THREE.Scene(), hw = s.halfWidthM, hh = s.extentHighM, len = s.lengthM, mid = (s.topNap + s.bottomNap) / 2, size = Math.max(hw, hh * 0.7, len, s.topNap - s.bottomNap);
    // Scène-assen: x dwars op de wand (hoge zijde negatief), y omhoog (NAP min het midden), z langs de wand naar de kijker.
    const y = (nap: number) => nap - mid;
    const camera = new THREE.PerspectiveCamera(36, 1, 0.01, size * 60);
    camera.position.set(size * 0.95, size * 0.55, size * 1.75);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, -len / 3); controls.maxDistance = size * 20; controls.update();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(renderer.domElement);
    renderer.domElement.setAttribute("aria-label", labels.aria);
    const render = () => renderer.render(scene, camera);
    scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const light = new THREE.DirectionalLight(0xffffff, 2.2); light.position.set(5, 8, 7); scene.add(light);
    const ink = getComputedStyle(container).color || "#222", white = new THREE.Color(0xffffff), face = 0.004 * size;

    const label = (text: string, at: THREE.Vector3, color: string, align: "left" | "right") => {
      const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d");
      if (!ctx) return;
      const font = "600 44px Inter, system-ui, sans-serif"; ctx.font = font;
      canvas.width = Math.ceil(ctx.measureText(text).width) + 16; canvas.height = 60;
      ctx.font = font; ctx.fillStyle = color; ctx.textBaseline = "middle"; ctx.fillText(text, 8, 32);
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
      const h = 0.05 * size, w = (h * canvas.width) / canvas.height;
      sprite.scale.set(w, h, 1); sprite.center.set(align === "left" ? 0 : 1, 0.5); sprite.position.copy(at); sprite.renderOrder = 5; scene.add(sprite);
    };
    const nap = (v: number) => `NAP ${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2).replace(".", ",")}`;
    const block = (l: SceneLayer, x0: number, x1: number, nameAt: "left" | "right") => {
      // In de plattegrond: de rand aan de wand volgt de hartlijn van de planken, zodat de grond in de golf sluit.
      const edgeLine = clipLine(s.wallLine, s.frontM, s.frontM + len), far = nameAt === "left" ? x0 : x1;
      const shape = new THREE.Shape([new THREE.Vector2(far, 0), ...edgeLine.map((q) => new THREE.Vector2(q.x, q.a - s.frontM)), new THREE.Vector2(far, len)]);
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: l.topNap - l.bottomNap, bevelEnabled: false });
      geometry.rotateX(-Math.PI / 2); geometry.translate(0, y(l.bottomNap), 0);
      const see = nameAt === "left" && s.support?.kind === "grout";
      const soil = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: new THREE.Color(l.color).lerp(white, 0.5), polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, transparent: see, opacity: see ? 0.35 : 1, depthWrite: !see }));
      scene.add(soil);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: new THREE.Color(l.color).multiplyScalar(0.55) }));
      scene.add(edges);
      label(l.name, new THREE.Vector3(nameAt === "left" ? x0 + 0.02 * size : x1 - 0.02 * size, y(l.topNap) - 0.04 * size, face), ink, nameAt === "left" ? "left" : "right");
    };
    for (const l of s.high.layers) block(l, -hh, 0, "left");
    for (const l of s.low.layers) block(l, 0, hw, "right");

    // Waterstanden: een doorschijnend vlak boven het maaiveld, en een streeplijn op het snijvlak eronder.
    const water = (level: number, surface: number, x0: number, x1: number) => {
      if (level > surface) {
        const body = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, level - surface, len), new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.28, depthWrite: false }));
        body.position.set((x0 + x1) / 2, y((level + surface) / 2), -len / 2); body.renderOrder = 2; scene.add(body);
      } else if (level > s.bottomNap) {
        const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x0, y(level), face), new THREE.Vector3(x1, y(level), face)]);
        const line = new THREE.Line(geometry, new THREE.LineDashedMaterial({ color: 0x2563eb, dashSize: 0.03 * size, gapSize: 0.02 * size }));
        line.computeLineDistances(); line.renderOrder = 3; scene.add(line);
      }
    };
    water(s.high.waterNap, s.high.surfaceNap, -hh, 0); water(s.low.waterNap, s.low.surfaceNap, 0, hw);
    label(`${labels.ground} ${nap(s.high.surfaceNap)}`, new THREE.Vector3(-hh - 0.03 * size, y(s.high.surfaceNap), face), ink, "right");
    label(`${labels.water} ${nap(s.high.waterNap)}`, new THREE.Vector3(-hh - 0.03 * size, y(s.high.waterNap), face), "#2563eb", "right");
    label(nap(s.low.surfaceNap), new THREE.Vector3(hw + 0.03 * size, y(s.low.surfaceNap), face), ink, "left");
    label(`${labels.water} ${nap(s.low.waterNap)}`, new THREE.Vector3(hw + 0.03 * size, y(s.low.waterNap) - (Math.abs(s.low.waterNap - s.low.surfaceNap) < 0.06 * size ? 0.06 * size : 0), face), "#2563eb", "left");
    label(`${labels.toe} ${nap(s.toeNap)}`, new THREE.Vector3(-hh - 0.03 * size, y(s.toeNap), face), ink, "right");

    // De planken: elk recht stuk van de plattegrond als plaat over de volle hoogte van de wand.
    const sheet = s.construction === "sheet-pile";
    const steel = sheet ? new THREE.MeshStandardMaterial({ color: 0x5b6470, roughness: 0.55, metalness: 0.5 }) : new THREE.MeshStandardMaterial({ color: 0x8a6239, roughness: 0.9 }), edge = new THREE.LineBasicMaterial({ color: sheet ? 0x1f2937 : 0x3f2a14 });
    const wallHeight = s.wallTopNap - s.toeNap;
    // De planken: de echte omtrek uit de plattegrond, geëxtrudeerd over de hoogte van de wand; de sloten donkerder.
    const lockMaterial = new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.5, metalness: 0.5 });
    for (const o of s.outlines) {
      const shape = new THREE.Shape(o.points.map((q) => new THREE.Vector2(q.x, q.a - s.frontM)));
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: wallHeight, bevelEnabled: false });
      geometry.rotateX(-Math.PI / 2); geometry.translate(0, y(s.toeNap), 0);
      scene.add(new THREE.Mesh(geometry, o.kind === "lock" ? lockMaterial : steel));
      scene.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 30), edge));
    }
    // Palen met schotten: de palen tot de teen, de schotten aan de hoge zijde tot hun onderkant.
    const body = (geometry: THREE.BufferGeometry, at: THREE.Vector3) => {
      const mesh = new THREE.Mesh(geometry, steel); mesh.position.copy(at); scene.add(mesh);
      const outline = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 30), edge); outline.position.copy(at); scene.add(outline);
    };
    for (const p of s.posts) body(p.shape === "round" ? new THREE.CylinderGeometry(p.sizeM / 2, p.sizeM / 2, wallHeight, 20) : new THREE.BoxGeometry(p.sizeM, wallHeight, p.sizeM), new THREE.Vector3(0, y((s.wallTopNap + s.toeNap) / 2), s.frontM - p.alongM));
    if (s.boards) {
      const total = s.wallTopNap - s.boards.bottomNap, count = Math.max(1, Math.round(total / 0.2)), h = total / count;
      for (let n = 0; n < count; n++) body(new THREE.BoxGeometry(s.boards.thicknessM, h - 0.006, s.lengthM + s.frontM), new THREE.Vector3(-s.wallHeightM / 2 - s.boards.thicknessM / 2, y(s.wallTopNap - (n + 0.5) * h), (s.frontM - s.lengthM) / 2));
    }
    if (s.waling) body(new THREE.BoxGeometry(s.waling.sizeM / 2, s.waling.sizeM, s.lengthM + s.frontM), new THREE.Vector3(s.wallHeightM / 2 + s.waling.sizeM / 4, y(s.waling.levelNap), (s.frontM - s.lengthM) / 2));
    label(s.profileName, new THREE.Vector3(0, y(s.wallTopNap) + 0.05 * size, s.frontM), ink, "left");

    // Ankers of stempels op hun hart-op-hartafstand.
    const rod = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.6 });
    const groutMaterial = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.9 });
    if (s.support) for (const along of s.anchors) {
      const sup = s.support, angle = (sup.angleDeg * Math.PI) / 180, strut = sup.kind === "strut", dir = strut ? 1 : -1, free = strut ? hw : sup.freeM;
      const at = (length: number) => new THREE.Vector3(dir * (s.wallHeightM / 2 + length * Math.cos(angle)), y(sup.levelNap) - length * Math.sin(angle), -along);
      const rodBetween = (from: THREE.Vector3, to: THREE.Vector3, radius: number, material: THREE.Material) => {
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, from.distanceTo(to), 14), material);
        bar.position.copy(from.clone().add(to).multiplyScalar(0.5));
        bar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
        scene.add(bar);
      };
      rodBetween(at(0), at(free), Math.max(0.012 * size, 0.02), rod);
      if (sup.groutM > 0) rodBetween(at(free), at(free + sup.groutM), Math.max(sup.groutDiameterM / 2, 0.02 * size), groutMaterial);
      const plateHead = new THREE.Mesh(new THREE.BoxGeometry(0.02 * size, 0.06 * size, 0.06 * size), rod); plateHead.position.set(-dir * (s.wallHeightM / 2 + 0.01 * size), y(sup.levelNap), -along); scene.add(plateHead);
    }
    // Actief glijvlak op het snijvlak, gestippeld.
    if (s.slip) {
      const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-s.wallHeightM / 2, y(s.toeNap), face), new THREE.Vector3(-s.wallHeightM / 2 - s.slip.reachM, y(Math.min(s.wallTopNap, s.high.surfaceNap)), face)]);
      const line = new THREE.Line(geometry, new THREE.LineDashedMaterial({ color: 0xb91c1c, dashSize: 0.02 * size, gapSize: 0.015 * size })); line.computeLineDistances(); line.renderOrder = 4; scene.add(line);
    }
    // Bovenbelasting als pijlen op het maaiveld van de hoge zijde.
    if (s.surchargeKpa > 0) for (let n = 0; n < 4; n++) for (let m = 0; m < 3; m++)
      scene.add(new THREE.ArrowHelper(new THREE.Vector3(0, -1, 0), new THREE.Vector3(-Math.min(hw, hh) + ((n + 0.5) * (Math.min(hw, hh) - s.wallHeightM)) / 4, y(s.high.surfaceNap) + 0.09 * size, -((m + 0.5) * len) / 3), 0.085 * size, 0x1d4ed8, 0.03 * size, 0.018 * size));

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
  }, [s, unavailable, labelKey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (unavailable) return <p className="cs-hint" role="status">{t("visual.noWebgl", "3D is op dit apparaat niet beschikbaar. De doorsnede toont dezelfde gegevens.")}</p>;
  return <>
    <div className="sw-scene" ref={host} />
    <p className="cs-hint">{s.construction === "sheet-pile"
      ? `${t("visual.sceneHint", "Het grondblok is opengewerkt: het snijvlak is de doorsnede, de wand steekt ervoor uit. Plankbreedte, wandhoogte en plaatdikten komen uit de profielbibliotheek. Oranje: anker of stempel. Sleep om te draaien, scroll om te zoomen.")} ${s.contourBasis === "table" ? "" : t("visual.contourSchematic", "Profielvorm schematisch: de fabriekstabellen geven de flensbreedte, de lijfhoek en de slotvorm niet; de flensbreedte is afgeleid uit A en I, het slot is een blokje.")}`
      : t("visual.sceneHintRevetment", "Het grondblok is opengewerkt: het snijvlak is de doorsnede, de beschoeiing steekt ervoor uit. Plankdikte, paalafmeting, hart-op-hartafstand en schotten staan op schaal; de plankbreedte is een tekenmaat. Oranje: anker met gording. Sleep om te draaien, scroll om te zoomen.")}</p>
  </>;
}
