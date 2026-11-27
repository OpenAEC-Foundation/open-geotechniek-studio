// 3D-weergave van de damwand in een opengewerkt grondblok: het snijvlak vooraan toont de lagen en de
// waterstanden aan beide zijden, de wand steekt ervoor uit zodat het profiel van de planken te zien is.
// De geometrie komt uit scene.ts; zonder WebGL verschijnt een melding in plaats van de scène.
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { soilOutline, type PlanPoint, type SceneLayer, type WallScene } from "./scene";

/**
 * Prisma van een gesloten omtrek in het vlak (u, v) tussen de hoogten y0 en y1, in scènecoördinaten (u, y, −v).
 * De zijwanden krijgen gedeelde normalen waar de omtrek minder dan `creaseDeg` knikt (rondingen lezen als één
 * vlak) en eigen normalen in de scherpe hoeken; de kappen boven en onder zijn getrianguleerd.
 */
function prismGeometry(outline: THREE.Vector2[], y0: number, y1: number, creaseDeg: number): THREE.BufferGeometry {
  let pts = outline.filter((p, k) => p.distanceTo(outline[(k + 1) % outline.length]) > 1e-9);
  if (THREE.ShapeUtils.isClockWise(pts)) pts = [...pts].reverse();
  const n = pts.length, position: number[] = [], normal: number[] = [];
  const vertex = (p: THREE.Vector2, h: number, nx: number, nz: number, ny = 0) => { position.push(p.x, h, -p.y); normal.push(nx, ny, nz); };
  // Kappen: driehoeken uit de omtrek; in de scène is v = −z, dus de volgorde draait voor een normaal omhoog.
  for (const [a, b0, c0] of THREE.ShapeUtils.triangulateShape(pts, [])) {
    const ccw = (pts[b0].x - pts[a].x) * (pts[c0].y - pts[a].y) - (pts[b0].y - pts[a].y) * (pts[c0].x - pts[a].x) > 0, b = ccw ? b0 : c0, c = ccw ? c0 : b0;
    vertex(pts[a], y1, 0, 0, 1); vertex(pts[b], y1, 0, 0, 1); vertex(pts[c], y1, 0, 0, 1);
    vertex(pts[a], y0, 0, 0, -1); vertex(pts[c], y0, 0, 0, -1); vertex(pts[b], y0, 0, 0, -1);
  }
  // Naar buiten gerichte normaal van stuk k in het vlak (tegen de klok in: rechts van de looprichting).
  const edgeNormal = (k: number) => { const p = pts[k], q = pts[(k + 1) % n], d = new THREE.Vector2(q.x - p.x, q.y - p.y).normalize(); return new THREE.Vector2(d.y, -d.x); };
  const cosCrease = Math.cos((creaseDeg * Math.PI) / 180);
  const cornerNormal = (k: number, own: number) => { const a = edgeNormal((k - 1 + n) % n), b = edgeNormal(k % n); return creaseDeg > 0 && a.dot(b) >= cosCrease ? a.add(b).normalize() : own === k % n ? b : a; };
  for (let k = 0; k < n; k++) {
    const p = pts[k], q = pts[(k + 1) % n], np = cornerNormal(k, k), nq = cornerNormal(k + 1, k);
    // Normaal (u, v) in het vlak wordt (u, 0, −v) in de scène.
    vertex(p, y0, np.x, -np.y); vertex(q, y0, nq.x, -nq.y); vertex(q, y1, nq.x, -nq.y);
    vertex(p, y0, np.x, -np.y); vertex(q, y1, nq.x, -nq.y); vertex(p, y1, np.x, -np.y);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normal, 3));
  return geometry;
}

/** Gesloten randlijn van een omtrek in het vlak (u, v) op hoogte h. */
function outlineLines(outline: THREE.Vector2[], h: number, material: THREE.LineBasicMaterial): THREE.LineLoop {
  return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(outline.map((q) => new THREE.Vector3(q.x, h, -q.y))), material);
}

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
    const render = () => renderer.render(scene, camera);    // Licht van boven en twee zijden, zodat de lijven van de golf aan beide zijden leesbaar blijven.
    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9a8f86, 1.1));
    const light = new THREE.DirectionalLight(0xffffff, 2.0); light.position.set(5, 8, 7); scene.add(light);
    const fill = new THREE.DirectionalLight(0xffffff, 0.9); fill.position.set(-6, 4, -3); scene.add(fill);
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
    // Plattegrond naar scène: x blijft, a langs de wand wordt z = frontM − a (het snijvlak op z = 0).
    const plan = (points: PlanPoint[]) => points.map((q) => new THREE.Vector2(q.x, q.a - s.frontM));
    // Het grondvlak per zijde sluit precies op de buitenkant van de wand (scene.wallFace). Onder de teen en boven de
    // kop van de wand is er geen staal: daar lopen beide zijden door tot dezelfde rand, zodat er geen spleet valt.
    const soilPlan = (side: 1 | -1, far: number, zone: "wall" | "below" | "above") =>
      plan(soilOutline(zone === "below" ? s.faceHigh : zone === "above" ? s.faceLow : side < 0 ? s.faceHigh : s.faceLow, far));
    const block = (l: SceneLayer, side: 1 | -1, nameAt: "left" | "right") => {
      const far = side < 0 ? -hh : hw, see = side < 0 && s.support?.kind === "grout";
      const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(l.color).lerp(white, 0.5), polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2, transparent: see, opacity: see ? 0.35 : 1, depthWrite: !see });
      const line = new THREE.LineBasicMaterial({ color: new THREE.Color(l.color).multiplyScalar(0.55) });
      const zones: Array<["wall" | "below" | "above", number, number]> = [["below", l.bottomNap, Math.min(l.topNap, s.toeNap)], ["wall", Math.max(l.bottomNap, s.toeNap), Math.min(l.topNap, s.wallTopNap)], ["above", Math.max(l.bottomNap, s.wallTopNap), l.topNap]];
      for (const [zone, bottom, top] of zones) if (top - bottom > 1e-6) {
        const outline = soilPlan(side, far, zone);
        scene.add(new THREE.Mesh(prismGeometry(outline, y(bottom), y(top), 0), material));
        // Randlijnen: de omtrek van het grondvlak aan de bovenkant (op de wand precies op de contour) en het snijvlak.
        // Alleen aan de grenzen van de laag, niet op de teen of de kop van de wand waar het vlak alleen wordt opgedeeld.
        if (top === l.topNap) scene.add(outlineLines(outline, y(top), line));
        const n = outline.length, at = (q: THREE.Vector2, h: number) => new THREE.Vector3(q.x, h, -q.y);
        const segments = [outline[0], outline[1], outline[n - 2], outline[n - 1]].flatMap((q) => [at(q, y(bottom)), at(q, y(top))]);
        if (bottom === l.bottomNap) segments.push(at(outline[0], y(bottom)), at(outline[1], y(bottom)));
        scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(segments), line));
      }
      label(l.name, new THREE.Vector3(nameAt === "left" ? -hh + 0.02 * size : hw - 0.02 * size, y(l.topNap) - 0.04 * size, face), ink, nameAt === "left" ? "left" : "right");
    };
    for (const l of s.high.layers) block(l, -1, "left");
    for (const l of s.low.layers) block(l, 1, "right");

    // Waterstanden: een doorschijnend vlak boven het maaiveld, en een streeplijn op het snijvlak eronder.
    const water = (level: number, surface: number, x0: number, x1: number) => {
      if (level > surface) {
        const side = x0 < 0 ? -1 : 1, outline = soilPlan(side, side < 0 ? x0 : x1, level > s.wallTopNap ? "above" : "wall");
        const body = new THREE.Mesh(prismGeometry(outline, y(surface), y(level), 0), new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.28, depthWrite: false }));
        body.renderOrder = 2; scene.add(body);
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

    const sheet = s.construction === "sheet-pile";
    // De grond ligt in de diepte iets achter de wand (polygonOffset met helling), zodat de wand wint waar de grond er
    // precies tegenaan ligt. De wand zelf schuift alleen een vaste kleine stap terug (geen helling: anders steken de
    // lijven bij een scherende blik door het snijvlak), zodat de randlijnen erop zichtbaar blijven.
    const solid = { polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: 1 };
    const steel = sheet ? new THREE.MeshStandardMaterial({ color: 0x6b7581, roughness: 0.5, metalness: 0.35, ...solid }) : new THREE.MeshStandardMaterial({ color: 0x8a6239, roughness: 0.9, ...solid }), edge = new THREE.LineBasicMaterial({ color: sheet ? 0x1f2937 : 0x3f2a14 });
    const wallHeight = s.wallTopNap - s.toeNap;
    // De planken: de echte gesloten omtrek uit de plattegrond (met de sloten als die erin zitten), als één prisma
    // over de hoogte van de wand, met vloeiende normalen in de rondingen en een randlijn alleen op de kop.
    // Schematische sloten (blokjes) alleen als de contour ze niet bevat; die zijn donkerder.
    const lockMaterial = new THREE.MeshStandardMaterial({ color: 0x404b59, roughness: 0.5, metalness: 0.35, ...solid });
    for (const o of s.outlines) {
      const outline = plan(o.points);
      scene.add(new THREE.Mesh(prismGeometry(outline, y(s.toeNap), y(s.wallTopNap), 35), o.kind === "lock" ? lockMaterial : steel));
      scene.add(outlineLines(outline, y(s.wallTopNap), edge));
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
    label(s.profileName, new THREE.Vector3(0, y(s.wallTopNap) + 0.05 * size, s.frontM), ink, "left");

    // Gording en ankers. De gording ligt horizontaal aan de lage zijde tegen de toppen van de golf (de buitenste
    // punten van de wand aan die zijde) en volgt de golf niet; bij een stalen damwand ook zonder aparte gording in de
    // invoer, als drager van de ankerkop. Het anker vertrekt uit het hart van de gording onder de ingestelde hoek.
    const rod = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.6 });
    const groutMaterial = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.9 });
    const crestLow = s.outlines.length ? Math.max(...s.faceLow.map((q) => q.x)) : s.wallHeightM / 2;
    const faceHighX = s.outlines.length ? Math.min(...s.faceHigh.map((q) => q.x)) : -s.wallHeightM / 2;
    const waling = s.waling ?? (sheet && s.support ? { levelNap: s.support.levelNap, sizeM: 0.2 } : null);
    const walingDepth = waling ? waling.sizeM / 2 : 0;
    if (waling) {
      const geometry = new THREE.BoxGeometry(walingDepth, waling.sizeM, s.lengthM + s.frontM), at = new THREE.Vector3(crestLow + walingDepth / 2, y(waling.levelNap), (s.frontM - s.lengthM) / 2);
      const mesh = new THREE.Mesh(geometry, sheet ? rod : steel); mesh.position.copy(at); scene.add(mesh);
      const outline = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 30), sheet ? new THREE.LineBasicMaterial({ color: 0x7c2d12 }) : edge); outline.position.copy(at); scene.add(outline);
    }
    if (s.support) for (const along of s.anchors) {
      const sup = s.support, angle = (sup.angleDeg * Math.PI) / 180, strut = sup.kind === "strut", dir = strut ? 1 : -1, cos = Math.cos(angle), sin = Math.sin(angle);
      // Hartlijn van het anker door het hart van de gording (of de kop van de paal) op het ankerniveau.
      const ox = crestLow + walingDepth / 2, oy = y(sup.levelNap), z = -along;
      const at = (length: number) => new THREE.Vector3(ox + dir * length * cos, oy - length * sin, z);
      const rodBetween = (from: THREE.Vector3, to: THREE.Vector3, radius: number, material: THREE.Material) => {
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, from.distanceTo(to), 14), material);
        bar.position.copy(from.clone().add(to).multiplyScalar(0.5));
        bar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
        scene.add(bar);
      };
      // Begin aan de voorkant van de gording; de vrije lengte telt vanaf de kant van de wand waar het anker uitkomt.
      const start = strut ? walingDepth / 2 : -(walingDepth / 2 + 0.01 * size) / cos;
      const end = strut ? (s.wallHeightM / 2 + hw - ox) / cos : (ox - faceHighX) / cos + sup.freeM;
      rodBetween(at(start), at(end), Math.max(0.012 * size, 0.02), rod);
      if (sup.groutM > 0) rodBetween(at(end), at(end + sup.groutM), Math.max(sup.groutDiameterM / 2, 0.02 * size), groutMaterial);
      // Ankerplaat met moer tegen de voorkant van de gording (bij palen zonder gording tegen de paal).
      if (!strut) { const plateHead = new THREE.Mesh(new THREE.BoxGeometry(0.012 * size, 0.045 * size, 0.045 * size), rod); plateHead.position.set(crestLow + walingDepth + 0.006 * size, oy + (walingDepth / 2 + 0.006 * size) * Math.tan(angle), z); scene.add(plateHead); }
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
      ? `${t("visual.sceneHint", "Het grondblok is opengewerkt: het snijvlak is de doorsnede, de wand steekt ervoor uit. Plankbreedte, wandhoogte en plaatdikten komen uit de profielbibliotheek. Oranje: anker of stempel. Sleep om te draaien, scroll om te zoomen.")} ${s.contourBasis === "drawing" ? t("visual.contourDrawing", "Profielvorm: contour uit fabrieks-DWG ({{manufacturer}}).", { manufacturer: s.contourManufacturer ?? "" }) : s.contourBasis === "table" ? "" : t("visual.contourSchematic", "Profielvorm schematisch: de fabriekstabellen geven de flensbreedte, de lijfhoek en de slotvorm niet; de flensbreedte is afgeleid uit A en I, het slot is een blokje.")}`
      : t("visual.sceneHintRevetment", "Het grondblok is opengewerkt: het snijvlak is de doorsnede, de beschoeiing steekt ervoor uit. Plankdikte, paalafmeting, hart-op-hartafstand en schotten staan op schaal; de plankbreedte is een tekenmaat. Oranje: anker met gording. Sleep om te draaien, scroll om te zoomen.")}</p>
  </>;
}
