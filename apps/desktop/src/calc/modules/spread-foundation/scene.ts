// Geometrie voor de doorsnede en de 3D-weergave: de voet, het effectieve draagvlak b' × l',
// de belastingpijlen en de grondlagen. Pure functies; de weergaven bouwen hierop.
// Assen: x in de breedterichting (positief in de richting van H), y in de lengterichting,
// z omhoog, met z = 0 op het funderingsvlak.
import { getSoilType } from "./catalog";
import type { SpreadInput, SpreadLayer, SpreadOk } from "./compute";
import { slipSurface, type SlipSurface } from "./slip";

export type Vec3 = [x: number, y: number, z: number];
export interface SceneBox { center: Vec3; size: Vec3 }
export interface SceneArrow { kind: "V" | "H" | "R"; from: Vec3; to: Vec3; label: string }
export interface SceneLayer { topZ: number; bottomZ: number; name: string; color: string }

export interface SpreadScene {
  strip: boolean;
  /** Getekende lengte van de voet [m]; bij een strook een stuk van de doorlopende strook. */
  lengthM: number;
  thicknessM: number;
  footing: SceneBox;
  /** Effectief draagvlak op het funderingsvlak. */
  effective: { x0: number; x1: number; y0: number; y1: number };
  /** Aangrijpingspunt van de resultante op het funderingsvlak. */
  resultantAt: Vec3;
  /** Hoek van de resultante met de verticaal [°]. */
  resultantAngleDeg: number;
  arrows: SceneArrow[];
  layers: SceneLayer[];
  /** Halve afmeting van het getekende grondblok en de diepte ervan [m]. */
  halfWidthM: number;
  halfLengthM: number;
  depthM: number;
  groundZ: number;
  waterZ: number;
  /** Aanlegniveau [m NAP]; de z-as van de scène heeft hier zijn nulpunt. */
  foundationNap: number;
  /** Invloedsdiepte onder het funderingsvlak [m]. */
  zeM: number;
  /** Omtrek van het bezwijkvlak per kant, in de doorsnede: x [m] en diepte onder het funderingsvlak [m]. */
  slip: { x: number; depth: number }[][];
  /** Het bezwijkmechanisme zelf, gedraineerd en (als er ongedraineerd is getoetst) ongedraineerd; x vanaf het midden van b'. */
  mechanism: SpreadSlip;
}

export interface SpreadSlip {
  /** Hoek waarmee het gedraineerde vlak is getekend: φ'gem;rep [°]. */
  phiDeg: number;
  /** Helling van de belasting in de doorsnede: tan δ = Hd / (Vd + A'·c'·cot φ'); 0 als Hd evenwijdig aan L werkt. */
  obliquity: number;
  drained: SlipSurface;
  /** Hd / (A'·cu;d) en het cirkelvormige vlak. */
  undrainedRatio: number;
  undrained: SlipSurface | null;
}

/**
 * Het bezwijkmechanisme in de doorsnede over de breedte. Een horizontale belasting in de breedterichting
 * maakt het eenzijdig, met de hoeken uit slip.ts; een excentriciteit of een maaiveldhelling alleen eenzijdig.
 */
export function spreadSlip(input: SpreadInput, r: SpreadOk): SpreadSlip {
  const d = r.dims, c = r.drained, inSection = r.strip || input.hDirection === "B", h = inSection ? input.hDKn : 0;
  const oneSided = input.hDKn > 0 || input.slopeDeg > 0 || d.eccBM > 1e-6;
  const tanPhi = Math.tan((c.phiD * Math.PI) / 180);
  const obliquity = h <= 0 ? 0 : c.phiRepDeg < 1e-6 || tanPhi < 1e-9 ? (c.cD > 0 ? h / (d.areaM2 * c.cD) : 0) : h / (c.vKn + (d.areaM2 * c.cD) / tanPhi);
  const u = r.undrained, undrainedRatio = u && h > 0 && u.cuD > 0 ? h / (u.dims.areaM2 * u.cuD) : 0;
  return {
    phiDeg: c.phiRepDeg, obliquity, undrainedRatio,
    drained: slipSurface({ bEffM: d.bRawM, phiDeg: c.phiRepDeg, obliquity, oneSided }),
    undrained: u ? slipSurface({ bEffM: d.bRawM, phiDeg: 0, obliquity: undrainedRatio, oneSided }) : null,
  };
}

/** Dikte van de getekende voet: de invoer kent geen dikte, dus een kwart van B, binnen de dekking als die er is. */
export function footingThickness(widthM: number, coverM: number): number {
  const t = Math.min(0.8, Math.max(0.3, 0.25 * widthM));
  return coverM > 0.05 ? Math.min(t, coverM) : t;
}

export function layerColor(layer: SpreadLayer): string {
  return getSoilType(layer.soilId)?.color ?? (layer.cu > 0 ? (layer.phi < 16 ? "#795548" : "#4CAF50") : layer.phi >= 34 ? "#FF5722" : layer.phi >= 31 ? "#FF9800" : "#FFC107");
}

export function spreadScene(input: SpreadInput, r: SpreadOk): SpreadScene {
  const strip = r.strip, B = input.widthM, lengthM = strip ? Math.max(3 * B, 3) : input.lengthM;
  const thicknessM = footingThickness(B, r.coverM), d = r.dims;
  const alongL = !strip && input.hDirection === "L";
  // De excentriciteit schuift het draagvlak naar de kant waarheen de resultante is verplaatst.
  const effective = { x0: 2 * d.eccBM - B / 2, x1: B / 2, y0: strip ? -lengthM / 2 : 2 * d.eccLM - lengthM / 2, y1: lengthM / 2 };
  const resultantAt: Vec3 = [d.eccBM, strip ? 0 : d.eccLM, 0];
  const len = Math.max(1.2 * B, 1), hLen = input.hDKn > 0 ? Math.max(0.4 * len, Math.min(len, (len * input.hDKn) / input.vDKn)) : 0;
  const top = thicknessM + len, hz = Math.max(input.hArmM, thicknessM * 0.5);
  const arrows: SceneArrow[] = [{ kind: "V", from: [input.eccBM, strip ? 0 : input.eccLM, top], to: [input.eccBM, strip ? 0 : input.eccLM, thicknessM], label: "Vd" }];
  if (input.hDKn > 0) {
    const from: Vec3 = alongL ? [0, -hLen - B / 2, hz] : [-hLen - B / 2, 0, hz];
    arrows.push({ kind: "H", from, to: alongL ? [0, -B / 2, hz] : [-B / 2, 0, hz], label: "Hd" });
  }
  const tan = input.hDKn / input.vDKn, rLen = len * 1.15, run = (rLen * tan) / Math.sqrt(1 + tan * tan), rise = rLen / Math.sqrt(1 + tan * tan);
  arrows.push({ kind: "R", from: alongL ? [resultantAt[0], resultantAt[1] - run, rise] : [resultantAt[0] - run, resultantAt[1], rise], to: resultantAt, label: "Rd" });
  // Diepte van de tekening: de invloedsdiepte ruim in beeld; een fictief funderingsvlak alleen als het daar dichtbij ligt.
  const near = 3 * Math.max(r.drained.zeM, 1.5 * B);
  const depthM = Math.max(1.25 * r.drained.zeM, 2 * B, ...r.punch.filter((p) => p.thicknessM <= near).map((p) => p.thicknessM + 0.3 * B));
  const groundZ = input.groundNap - input.foundationNap;
  const layers: SceneLayer[] = r.layers.map((l, i) => ({
    topZ: Math.min(groundZ, i === 0 ? groundZ : l.topNap - input.foundationNap), bottomZ: Math.max(-depthM, (r.layers[i + 1]?.topNap ?? -Infinity) - input.foundationNap), name: l.name, color: layerColor(l),
  })).filter((l) => l.topZ - l.bottomZ > 1e-6);
  const mechanism = spreadSlip(input, r);
  const slip = mechanism.drained.sides
    .map((side) => [...side.wedge.slice(0, 2), ...side.transition, side.passive[1], side.passive[2]].map((q) => ({ x: d.eccBM + q.x, depth: q.z })));
  return {
    strip, lengthM, thicknessM, footing: { center: [0, 0, thicknessM / 2], size: [B, lengthM, thicknessM] }, effective, resultantAt, resultantAngleDeg: (Math.atan(tan) * 180) / Math.PI, arrows, layers,
    halfWidthM: Math.max(2 * B, B / 2 + Math.min(r.drained.aeM, 4 * B) + 0.4 * B), halfLengthM: strip ? lengthM / 2 : Math.max(lengthM, lengthM / 2 + B), depthM, groundZ, waterZ: input.waterNap - input.foundationNap, foundationNap: input.foundationNap, zeM: r.drained.zeM, slip, mechanism,
  };
}
