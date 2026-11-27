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
  /** Het gedraineerde bezwijkvlak per kant, in de doorsnede: x [m] en diepte onder het aanlegniveau [m]. */
  slip: SceneSlip[];
  /** Tangens van de maaiveldhelling β (aflopend vanaf x = B/2) en van de helling α van de onderkant (oplopend naar +x). */
  slopeTan: number;
  baseTan: number;
  /** Doorsnede van de voet: onderkant onder de hoek α, bovenkant horizontaal. x en z [m] ten opzichte van het aanlegniveau. */
  footingProfile: ScenePoint[];
  /** Het bezwijkmechanisme zelf, gedraineerd en (als er ongedraineerd is getoetst) ongedraineerd; x vanaf het midden van b'. */
  mechanism: SpreadSlip;
}

export interface ScenePoint { x: number; z: number }
export interface SceneSlip {
  /** +1: de kant waarheen Hd wijst en waar het maaiveld afloopt; −1: de andere kant. */
  dir: 1 | -1;
  /** Het maatgevende mechanisme; bij een symmetrisch geval beide kanten. */
  governing: boolean;
  /** Gesloten omtrek: rand, punt van de wig, overgangszone, uittredepunt, rand. */
  outline: { x: number; depth: number }[];
  /** Verlengde van de glijlijn door de dekking: van het uittredepunt tot het maaiveld. */
  daylight: [{ x: number; depth: number }, { x: number; depth: number }];
}

/** Hoogte van het maaiveld boven het aanlegniveau op afstand x van het midden van de voet: horizontaal tot de rand, daarna aflopend onder β. */
export const groundHeight = (s: Pick<SpreadScene, "groundZ" | "slopeTan" | "footing">, x: number): number => s.groundZ - Math.max(0, x - s.footing.size[0] / 2) * s.slopeTan;

/** Doorsnede van een grondlaag in het blok: horizontale laaggrenzen, aan de bovenkant afgesneden door het hellende maaiveld. */
export function layerPolygon(s: Pick<SpreadScene, "groundZ" | "slopeTan" | "footing" | "halfWidthM">, layer: SceneLayer): ScenePoint[] {
  const hw = s.halfWidthM, crest = s.footing.size[0] / 2, g = (x: number) => groundHeight(s, x);
  const out: ScenePoint[] = [{ x: -hw, z: layer.bottomZ }], xAt = (z: number) => crest + (s.groundZ - z) / s.slopeTan;
  if (g(hw) >= layer.topZ - 1e-9) out.push({ x: hw, z: layer.bottomZ }, { x: hw, z: layer.topZ });
  else if (g(hw) > layer.bottomZ) out.push({ x: hw, z: layer.bottomZ }, { x: hw, z: g(hw) }, { x: Math.max(crest, xAt(layer.topZ)), z: layer.topZ });
  else out.push({ x: xAt(layer.bottomZ), z: layer.bottomZ }, { x: Math.max(crest, xAt(layer.topZ)), z: layer.topZ });
  out.push({ x: -hw, z: layer.topZ });
  return out;
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
 * Het bezwijkmechanisme in de doorsnede over de breedte, aan beide kanten. Een horizontale belasting in de
 * breedterichting, een maaiveldhelling of een hellende onderkant maakt de kant +1 maatgevend (slip.ts).
 */
export function spreadSlip(input: SpreadInput, r: SpreadOk): SpreadSlip {
  const d = r.dims, c = r.drained, inSection = r.strip || input.hDirection === "B", h = inSection ? input.hDKn : 0;
  // De hellende onderkant draait om het midden van de voet; het vlak rekent vanaf het midden van b'.
  const shape = { bEffM: d.bRawM, slopeDeg: input.slopeDeg, baseTiltDeg: input.baseTiltDeg, coverM: Math.max(0, r.coverM - d.eccBM * Math.tan((input.baseTiltDeg * Math.PI) / 180)) };
  const tanPhi = Math.tan((c.phiD * Math.PI) / 180);
  const obliquity = h <= 0 ? 0 : c.phiRepDeg < 1e-6 || tanPhi < 1e-9 ? (c.cD > 0 ? h / (d.areaM2 * c.cD) : 0) : h / (c.vKn + (d.areaM2 * c.cD) / tanPhi);
  const u = r.undrained, undrainedRatio = u && h > 0 && u.cuD > 0 ? h / (u.dims.areaM2 * u.cuD) : 0;
  return {
    phiDeg: c.phiRepDeg, obliquity, undrainedRatio,
    drained: slipSurface({ ...shape, phiDeg: c.phiRepDeg, obliquity }),
    undrained: u ? slipSurface({ ...shape, phiDeg: 0, obliquity: undrainedRatio }) : null,
  };
}

/** Korte toelichting bij de twee kanten van het vlak: welke maatgevend is en waarom. */
export function slipExplanation(input: Pick<SpreadInput, "slopeDeg" | "baseTiltDeg">, m: SlipSurface): string {
  const f = (v: number, dec: number) => v.toFixed(dec).replace(".", ","), [near, far] = m.sides;
  if (m.symmetric) return `Het bezwijkvlak is aan beide kanten gelijk: openingshoek ${f(near.fanDeg, 1)}°, ${f(near.maxDepthM, 2)} m diep en ${f(near.reachM, 2)} m naast b'.`;
  const why = [m.rotationDeg > 0 ? "Hd daarheen wijst" : "", input.slopeDeg > 0 ? "het maaiveld daar afloopt" : "", input.baseTiltDeg > 0 ? "de onderkant daarheen oploopt" : ""].filter(Boolean);
  const reason = why.length > 1 ? `${why.slice(0, -1).join(", ")} en ${why[why.length - 1]}` : why[0];
  return `Doorgetrokken: het maatgevende vlak, in de doorsnede rechts: openingshoek ${f(near.fanDeg, 1)}°, ${f(near.maxDepthM, 2)} m diep en ${f(near.reachM, 2)} m naast b'. ` +
    `Gestreept: het vlak naar de andere kant bij dezelfde belasting (openingshoek ${f(far.fanDeg, 1)}°, ${f(far.maxDepthM, 2)} m diep). ` +
    `Het eerste is maatgevend omdat ${reason}: de hoofdspanning hoeft naar die kant minder ver te draaien, en naar de andere kant bezwijkt de grond pas bij een ${m.otherSideFactor > 100 ? "meer dan 100" : f(m.otherSideFactor, 2)} keer zo grote belasting.`;
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
  const near = 3 * Math.max(r.drained.zeM, 1.5 * B), mechanism = spreadSlip(input, r);
  const slopeTan = Math.tan((input.slopeDeg * Math.PI) / 180), baseTan = Math.tan((input.baseTiltDeg * Math.PI) / 180);
  // Ook het niet-maatgevende vlak blijft in beeld, tot hooguit 4·B diep.
  const depthM = Math.max(1.25 * r.drained.zeM, 2 * B, Math.min(4 * B, 1.1 * Math.max(...mechanism.drained.sides.map((x) => x.maxDepthM))), ...r.punch.filter((p) => p.thicknessM <= near).map((p) => p.thicknessM + 0.3 * B));
  const groundZ = input.groundNap - input.foundationNap;
  const layers: SceneLayer[] = r.layers.map((l, i) => ({
    topZ: Math.min(groundZ, i === 0 ? groundZ : l.topNap - input.foundationNap), bottomZ: Math.max(-depthM, (r.layers[i + 1]?.topNap ?? -Infinity) - input.foundationNap), name: l.name, color: layerColor(l),
  })).filter((l) => l.topZ - l.bottomZ > 1e-6);
  // Van het stelsel van het vlak (oorsprong in het midden van b', op de onderkant) naar dat van de voet.
  const place = (q: { x: number; z: number }) => ({ x: d.eccBM + q.x, depth: q.z - d.eccBM * baseTan });
  const slip: SceneSlip[] = mechanism.drained.sides.map((side) => ({
    dir: side.dir, governing: side.governing, outline: [...side.wedge.slice(0, 2), ...side.transition, side.passive[1], side.passive[2]].map(place), daylight: [place(side.passive[1]), place(side.daylight)],
  }));
  const topZ = Math.max(thicknessM, (B / 2) * baseTan + 0.1);
  const footingProfile: ScenePoint[] = [{ x: -B / 2, z: (-B / 2) * baseTan }, { x: B / 2, z: (B / 2) * baseTan }, { x: B / 2, z: topZ }, { x: -B / 2, z: topZ }];
  return {
    strip, lengthM, thicknessM, footing: { center: [0, 0, thicknessM / 2], size: [B, lengthM, thicknessM] }, effective, resultantAt, resultantAngleDeg: (Math.atan(tan) * 180) / Math.PI, arrows, layers,
    halfWidthM: Math.max(2 * B, B / 2 + Math.min(r.drained.aeM, 4 * B) + 0.4 * B), halfLengthM: strip ? lengthM / 2 : Math.max(lengthM, lengthM / 2 + B), depthM, groundZ, waterZ: input.waterNap - input.foundationNap, foundationNap: input.foundationNap, zeM: r.drained.zeM, slip, mechanism, slopeTan, baseTan, footingProfile,
  };
}
