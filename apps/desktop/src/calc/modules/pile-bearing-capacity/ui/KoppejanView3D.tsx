// 3D view of the pile. Two views on the same stage: the calculation view
// (4D-8D method: the three trajectories around the pile toe and the cone
// resistance next to it) and the physical view (the pile as built, in the soil).
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { OaIcon } from "../../../../components/icons/oaIcon";
import { useCptStore } from "../../../../store/useCptStore";
import { applyOverrides } from "../parts/interpretation-overrides";
import { fmtNumber } from "../../../i18n";
import { getPileType, resolvePileType } from "../catalog";
import { buildKoppejanScene } from "../parts/koppejan-scene";
import { buildPhysicalScene, soilDisplayName, type SoilDisplayKind } from "../parts/physical-scene";
import { EXCAVATION_COLOR, SOIL_COLORS, WATER_COLOR, buildPhysicalObjects, partColor } from "./physical-three";
import type { PileInput, PileResult } from "../types";
import { buildKoppejanObjects, CLIPPED_COLOR, disposeObjects, fitPose, SHAFT_COLORS, SLIP_COLOR, ZONE_COLORS, type KoppejanObjects, type LabelSprite, type SceneColors } from "./koppejan-three";
import "./koppejan-3d.css";

type Focus = "tip" | "pile";
/** "calc": de rekenkundige weergave (trajecten, bezwijklichaam, kleef, qc); "physical": de paal zoals hij is. */
export type View3D = "calc" | "physical";
const VIEW_KEY = "ogs.pile.view3d";

function storedView(key: string | undefined, fallback: View3D): View3D {
  try {
    const value = key ? localStorage.getItem(`${VIEW_KEY}.${key}`) : null;
    if (value === "calc" || value === "physical") return value;
  } catch { /* geen opslag: de standaard geldt */ }
  return fallback;
}

/** Wat het toneel van een weergave nodig heeft: de objecten en de maten voor camera en labels. */
interface Stage {
  build: (colors: SceneColors) => KoppejanObjects;
  topNap: number; toeNap: number; deqM: number; labelGapM: number; depthM: number;
  focus: Record<Focus, { x0: number; x1: number; bottomNap: number; topNap: number }>;
}
const FOV = 32;
const LABEL_PX = 20;

interface Rig { fit: (focus: Focus) => void }
/** Camerastand ten opzichte van de paalpunt, zodat hij een herberekening overleeft. */
interface Pose { offset: THREE.Vector3; target: THREE.Vector3 }

export function KoppejanView3D({ input, result, initialFocus = "tip", initialView = "calc", storageKey }: { input: PileInput; result: PileResult; initialFocus?: Focus; initialView?: View3D; storageKey?: string }) {
  const { t } = useTranslation("calcPile");
  const measured = useCptStore((s) => (input.cptId ? s.cpts.get(input.cptId) : null));
  // Dezelfde qc-lijn als waarmee is gerekend, dus met de aanpassingen van de interpretatie.
  const cpt = useMemo(() => applyOverrides(measured, input.soilProfile, input.interpretationOverrides).cpt, [measured, input.soilProfile, input.interpretationOverrides]);
  const model = useMemo(() => buildKoppejanScene(input, result, cpt, getPileType(input.pileTypeId)), [input, result, cpt]);
  const physical = useMemo(() => buildPhysicalScene(input, cpt, resolvePileType(input) ?? getPileType(input.pileTypeId)), [input, cpt]);
  const [view, setViewState] = useState<View3D>(() => storedView(storageKey, initialView));
  const setView = (next: View3D) => {
    setViewState(next);
    pose.current = null;
    try { if (storageKey) localStorage.setItem(`${VIEW_KEY}.${storageKey}`, next); } catch { /* keuze geldt dan alleen nu */ }
  };
  const stage = useMemo<Stage | null>(() => view === "physical"
    ? physical && { build: (colors) => buildPhysicalObjects(physical, colors), topNap: physical.pile.topNap, toeNap: physical.pile.toeNap, deqM: physical.deqM, labelGapM: physical.labelGapM, depthM: physical.block.halfWidthM, focus: physical.focus }
    : model && { build: (colors) => buildKoppejanObjects(model, colors), topNap: model.pile.topNap, toeNap: model.pile.toeNap, deqM: model.deqM, labelGapM: model.labelGapM, depthM: model.searchRange.radiusM, focus: model.focus },
  [view, physical, model]);
  const host = useRef<HTMLDivElement>(null);
  const rig = useRef<Rig | null>(null);
  const pose = useRef<Pose | null>(null);
  const focusRef = useRef<Focus>(initialFocus);
  const [focus, setFocus] = useState<Focus>(initialFocus);
  const [unavailable, setUnavailable] = useState(false);
  const [theme, setTheme] = useState(0);
  const sceneLabel = view === "physical"
    ? t("view3d.ariaPhysical", "3D-weergave van de paal in de grond; slepen draait, scrollen zoomt")
    : t("view3d.aria", "3D-weergave van de 4D-8D-methode; slepen draait, scrollen zoomt");

  // Thema gewisseld: opnieuw opbouwen met de nieuwe tekstkleuren.
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme((n) => n + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const container = host.current;
    if (!container || !stage || unavailable) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch { setUnavailable(true); return; }
    const style = getComputedStyle(container);
    const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
    const colors = { text: token("--theme-text", "#36363e"), muted: token("--theme-text-secondary", "#71717a"), background: token("--theme-bg-lighter", "#ffffff") };

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.setAttribute("aria-label", sceneLabel);
    renderer.domElement.setAttribute("role", "img");
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 1.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(4, 6, 10);
    scene.add(sun);
    const { root, labels } = stage.build(colors);
    scene.add(root);
    const leaders: THREE.Object3D[] = [];
    root.traverse((o) => { if (o.userData.labelGroup === "tip") leaders.push(o); });

    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 1000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.screenSpacePanning = true;
    const height = stage.topNap - stage.toeNap;
    controls.minDistance = stage.deqM * 2;
    controls.maxDistance = Math.max(height * 12, stage.deqM * 200);
    const toe = new THREE.Vector3(0, stage.toeNap, 0);
    const tan = Math.tan((FOV * Math.PI) / 360);

    const render = () => {
      const h = Math.max(1, container.clientHeight);
      const distance = camera.position.distanceTo(controls.target);
      camera.near = Math.max(0.005, distance / 200);
      camera.far = distance * 20 + height * 4;
      camera.updateProjectionMatrix();
      // Labels houden een vaste schermgrootte; rond de punt verdwijnen ze als ze elkaar zouden overlappen.
      const pxPerM = h / (2 * distance * tan);
      const showTip = stage.labelGapM * pxPerM >= LABEL_PX * 0.75;
      const scale = (LABEL_PX / h) * 2 * tan;
      for (const label of labels as LabelSprite[]) {
        label.sprite.scale.set(scale * label.aspect, scale, 1);
        label.sprite.visible = label.group !== "tip" || showTip;
      }
      for (const leader of leaders) leader.visible = showTip;
      renderer.render(scene, camera);
    };
    const fit = (kind: Focus) => {
      const labelPx = LABEL_PX * Math.max(0, ...labels.map((l) => l.aspect));
      const next = fitPose(stage.focus[kind], FOV, Math.max(1, container.clientWidth), Math.max(1, container.clientHeight), labelPx, stage.depthM);
      controls.target.copy(next.target);
      camera.position.copy(next.position);
      controls.update();
      pose.current = { offset: camera.position.clone().sub(controls.target), target: controls.target.clone().sub(toe) };
      render();
    };
    const resize = () => {
      const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
      camera.aspect = w / h;
      renderer.setSize(w, h);
      render();
    };
    const onChange = () => {
      pose.current = { offset: camera.position.clone().sub(controls.target), target: controls.target.clone().sub(toe) };
      render();
    };
    const lost = (event: Event) => { event.preventDefault(); setUnavailable(true); };

    resize();
    if (pose.current) {
      controls.target.copy(toe).add(pose.current.target);
      camera.position.copy(controls.target).add(pose.current.offset);
      controls.update();
      render();
    } else fit(focusRef.current);
    controls.addEventListener("change", onChange);
    renderer.domElement.addEventListener("webglcontextlost", lost);
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    rig.current = { fit };
    return () => {
      rig.current = null;
      resizeObserver.disconnect();
      controls.removeEventListener("change", onChange);
      controls.dispose();
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      disposeObjects(root);
      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [stage, unavailable, theme, sceneLabel]);

  const viewSwitch = (
    <div className="pile-3d-views" role="group" aria-label={t("view3d.viewSwitch", "Soort 3D-weergave")}>
      <button type="button" className={view === "physical" ? "on" : ""} aria-pressed={view === "physical"} title={t("view3d.viewPhysicalTitle", "De paal zoals hij is, in de grondlagen")} onClick={() => setView("physical")}>{t("view3d.viewPhysical", "Fysiek")}</button>
      <button type="button" className={view === "calc" ? "on" : ""} aria-pressed={view === "calc"} title={t("view3d.viewCalcTitle", "Trajecten I, II en III, bezwijklichaam, kleef en qc")} onClick={() => setView("calc")}>{t("view3d.viewCalc", "Rekenkundig")}</button>
    </div>
  );
  if (!stage) {
    return <div className="pile-3d pile-3d-empty">{viewSwitch}<p className="pile-3d-message" role="status">{view === "physical"
      ? t("view3d.noPhysical", "Er is geen 3D-weergave: de paalmaten of niveaus zijn ongeldig.")
      : result.ok
        ? t("view3d.noModel", "Er is geen 3D-weergave: koppel een sondering aan de berekening.")
        : t("view3d.notComputed", "Er is geen 3D-weergave zolang de berekening geen resultaat heeft. Pas de invoer aan of ga terug naar 2D.")}</p></div>;
  }
  if (unavailable) {
    return <p className="pile-3d-message" role="status">{t("view3d.unavailable", "3D is op dit apparaat niet beschikbaar (geen WebGL). Gebruik de 2D-tekening.")}</p>;
  }
  const materialName: Record<string, string> = {
    concrete: t("view3d.material.concrete", "Beton"), steel: t("view3d.material.steel", "Staal"), wood: t("view3d.material.wood", "Hout"), grout: t("view3d.material.grout", "Grout"),
  };

  const choose = (next: Focus) => { focusRef.current = next; setFocus(next); rig.current?.fit(next); };
  const zoneText: Record<string, string> = {
    I: t("view3d.legend.zoneI", "van de paalpunt omlaag tot de kritieke diepte"),
    II: t("view3d.legend.zoneII", "van de kritieke diepte terug omhoog naar de paalpunt"),
    III: t("view3d.legend.zoneIII", "van de paalpunt tot 8 Deq erboven"),
  };
  return (
    <div className="pile-3d">
      <div className="pile-3d-stage">
        <div className="pile-3d-canvas" ref={host} />
        <div className="pile-3d-bar" role="toolbar" aria-label={t("view3d.toolbar", "Beeld")}>
          {viewSwitch}
          <span className="sep" />
          <button type="button" className={focus === "tip" ? "on" : ""} aria-pressed={focus === "tip"} onClick={() => choose("tip")}>{t("view3d.focusTip", "Paalpunt")}</button>
          <button type="button" className={focus === "pile" ? "on" : ""} aria-pressed={focus === "pile"} onClick={() => choose("pile")}>{t("view3d.focusPile", "Hele paal")}</button>
          <span className="sep" />
          <button type="button" className="pile-3d-icon" title={t("view3d.fit", "Passend in beeld")} aria-label={t("view3d.fit", "Passend in beeld")} onClick={() => rig.current?.fit(focusRef.current)}><OaIcon id="view.fit" /></button>
        </div>
      </div>
      {view === "physical" && physical ? <>
        <ul className="pile-3d-legend pile-3d-legend-row">
          {[...new Set(physical.pile.parts.map((part) => part.material))].map((material) => (
            <li key={material}><span className="pile-3d-swatch" style={{ background: partColor(material), opacity: 1 }} /><span>{materialName[material]}</span></li>
          ))}
          {[...new Set(physical.block.layers.map((layer) => layer.kind))].map((kind: SoilDisplayKind) => (
            <li key={kind}><span className="pile-3d-swatch" style={{ background: SOIL_COLORS[kind], opacity: 1 }} /><span>{soilDisplayName(kind)}</span></li>
          ))}
          {physical.planes.some((plane) => plane.id === "water") && <li><span className="pile-3d-swatch" style={{ background: WATER_COLOR }} /><span>{t("levels.water", "Grondwater")}</span></li>}
          {physical.planes.some((plane) => plane.id === "excavation") && <li><span className="pile-3d-swatch" style={{ background: EXCAVATION_COLOR }} /><span>{t("levels.excavation", "Ontgraving")}</span></li>}
        </ul>
        <p className="pile-3d-note">{t("view3d.notePhysical", "Paal, lagen en niveaus zijn op schaal; het grondblok is opengewerkt langs de paalas. Schematisch: de heipunt, stekken en wapening, het schroefblad, de kernbuis en de lasring. Buiten het ingevoerde profiel is de dichtstbijzijnde laag doorgetrokken.")}</p>
      </> : model && <>
      <ul className="pile-3d-legend">
        {model.zones.map((zone) => (
          <li key={zone.id}>
            <span className="pile-3d-swatch" style={{ background: ZONE_COLORS[zone.id] }} />
            <span><strong>{t("view3d.legend.zone", "Traject {{zone}}", { zone: zone.id })}</strong>: {zoneText[zone.id]}; q<sub>c;{zone.id};gem</sub> = {fmtNumber(zone.qcGemMpa, 2)} MPa</span>
          </li>
        ))}
        {model.slip && (
          <li>
            <span className="pile-3d-swatch" style={{ background: SLIP_COLOR, opacity: 0.6 }} />
            <span>{t("view3d.legend.slip", "Bezwijklichaam: de grond schuift af langs een logaritmische spiraal, van de kritieke diepte onder de paalpunt naar buiten en omhoog tot 8 Deq boven de punt. Een kwart is weggelaten zodat je erin kijkt; de pijlen wijzen in de schuifrichting. De vorm is schematisch.")}</span>
          </li>
        )}
        <li>
          <span className="pile-3d-swatch pile-3d-swatch-ring" />
          <span>{t("view3d.legend.critical", "Kritieke diepte: {{depth}} m onder de paalpunt ({{ratio}} Deq, Deq = {{deq}} mm). Stippellijnen: zoekgebied 0,7 tot 4 Deq.", { depth: fmtNumber(model.critical.depthM, 2), ratio: fmtNumber(model.critical.deqRatio, 2), deq: fmtNumber(model.deqM * 1000, 0) })}</span>
        </li>
        <li>
          <span className="pile-3d-swatch pile-3d-swatch-line" />
          <span>{t("view3d.legend.qc", "Conusweerstand qc naast de paal; dikke strepen zijn de trajectgemiddelden.")}{model.qc.clipped.length >= 2 && <> <span className="pile-3d-inline" style={{ color: CLIPPED_COLOR }}>{t("view3d.legend.clipped", "Groenblauw: de afgekapte qc-lijn van traject II en III.")}</span></>}</span>
        </li>
        {model.shaftZones.map((zone) => (
          <li key={zone.id}>
            <span className="pile-3d-swatch" style={{ background: SHAFT_COLORS[zone.id] }} />
            <span>{zone.id === "negative"
              ? t("view3d.legend.negative", "Negatieve kleef langs de schacht; Fnk;d = {{force}} kN", { force: fmtNumber(zone.forceKn, 0) })
              : t("view3d.legend.positive", "Positieve schachtwrijving langs de schacht; Rs;cal;max = {{force}} kN", { force: fmtNumber(zone.forceKn, 0) })}</span>
          </li>
        ))}
      </ul>
      <p className="pile-3d-note">{t("view3d.note", "Hoogten en de paal zijn op schaal. De breedte van de trajecten is schematisch: de methode rekent alleen langs de diepte.")}</p>
      </>}
    </div>
  );
}
