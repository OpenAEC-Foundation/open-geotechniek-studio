// Geometry of the physical 3D view: the pile as it is built, in an opened-up
// block of soil. Pure data, so it can be tested without WebGL; the three.js
// scene in ui/physical-three.ts only draws what this returns.
//
// Op schaal: schacht, punt- en voetmaat, wanddikte, opzetter, las, tapsheid,
// de lagen en de niveaus. Schematisch (`schematic`): de vorm van de heipunt,
// stekken en wapening, het schroefblad, de kernbuis van een schroefinjectiepaal
// en de lasring; daarvoor zit geen maat in de invoer.
import type { Cpt } from "../../../../types/cpt";
import { ct, fmtNumber } from "../../../i18n";
import { pileSystemIdOf, type PileSystemId } from "../pile-systems";
import type { PileInput, PileTypeSpec, SoilKind } from "../types";
import { pileGeometry, shaftDiameterAtNap, woodTopNap } from "./geometry";
import { spreadDown } from "./koppejan-scene";
import type { PileMaterial } from "./material-colors";

export type PhysicalShape =
  /** Omwentelingslichaam met lineair verlopende diameter; met `wallM` een holle buis. */
  | { kind: "round"; topNap: number; bottomNap: number; topDiameterM: number; bottomDiameterM: number; wallM?: number;
      /** Holle buis met het voorste kwart weggelaten, zodat de binnenkant (leeg of met prop) te zien is. */
      cutAway?: boolean }
  /** Rechthoekige doorsnede a × b, lineair verlopend. */
  | { kind: "rect"; topNap: number; bottomNap: number; topAM: number; topBM: number; bottomAM: number; bottomBM: number }
  /** Schroefblad: schroefvlak tussen binnen- en buitendiameter. */
  | { kind: "helix"; topNap: number; bottomNap: number; innerDiameterM: number; outerTopDiameterM: number; outerBottomDiameterM: number; turns: number }
  /** Staven evenwijdig aan de paalas; posities [x, z] ten opzichte van de as. */
  | { kind: "bars"; topNap: number; bottomNap: number; diameterM: number; positions: Array<[number, number]> };

export type PhysicalRole = "shaft" | "extension" | "tip" | "footplate" | "blade" | "rebar" | "joint" | "grout" | "core" | "plug";

export interface PhysicalPart {
  id: string;
  role: PhysicalRole;
  /** "plug": grond in een open buis. */
  material: PileMaterial | "grout" | "plug";
  shape: PhysicalShape;
  /** Vorm of maat is niet uit de invoer afgeleid. */
  schematic?: boolean;
}

export type SoilDisplayKind = "sand" | "clay" | "peat";
export const soilDisplayKind = (kind: SoilKind): SoilDisplayKind => (kind === "clay" ? "clay" : kind === "peat" ? "peat" : "sand");

export interface SoilBlockLayer {
  kind: SoilDisplayKind;
  topNap: number;
  bottomNap: number;
  /** Boven het ontgravingsniveau: wordt ontgraven. */
  excavated: boolean;
  /** Buiten het ingevoerde profiel: de dichtstbijzijnde laag is doorgetrokken. */
  assumed: boolean;
}

export interface PhysicalLabel {
  id: string;
  text: string;
  /** Plek van de tekst [x, NAP]; "left" = tekst eindigt hier, "right" = tekst begint hier. */
  anchor: [number, number];
  /** Punt waar de aanhaallijn naartoe loopt; ontbreekt bij een bijschrift op het snijvlak. */
  target?: [number, number];
  align: "left" | "right";
  group: "tip" | "pile";
}

export interface PhysicalScene {
  systemId: PileSystemId | undefined;
  groundNap: number;
  deqM: number;
  pile: { topNap: number; toeNap: number; parts: PhysicalPart[]; maxRadiusM: number };
  /** Grondblok achter de paalas (z ≤ 0): het snijvlak loopt door het hart van de paal. */
  block: { halfWidthM: number; depthM: number; topNap: number; bottomNap: number; layers: SoilBlockLayer[] };
  planes: Array<{ id: "ground" | "excavation" | "water"; nap: number }>;
  labels: PhysicalLabel[];
  labelGapM: number;
  focus: Record<"tip" | "pile", { x0: number; x1: number; bottomNap: number; topNap: number }>;
}

const FOOT_PLATE_M = 0.025;
const nap = (v: number) => `NAP ${v >= 0 ? "+" : "−"}${fmtNumber(Math.abs(v), 2)} m`;
const round = (id: string, role: PhysicalRole, material: PhysicalPart["material"], topNap: number, bottomNap: number, topDiameterM: number, bottomDiameterM = topDiameterM, extra: { wallM?: number; schematic?: boolean; cutAway?: boolean } = {}): PhysicalPart => ({
  id, role, material, ...(extra.schematic ? { schematic: true } : {}),
  shape: { kind: "round", topNap, bottomNap, topDiameterM, bottomDiameterM, ...(extra.wallM ? { wallM: extra.wallM } : {}), ...(extra.cutAway ? { cutAway: true } : {}) },
});
const ring = (count: number, radius: number): Array<[number, number]> => Array.from({ length: count }, (_, i) => {
  const a = (i + 0.5) / count * 2 * Math.PI;
  return [radius * Math.cos(a), radius * Math.sin(a)];
});

/** De onderdelen van de paal, van kop naar punt. */
export function pileParts(input: PileInput, type: PileTypeSpec | undefined, systemId: PileSystemId | undefined): PhysicalPart[] {
  const top = input.pileTopNap, toe = input.pileToeNap, length = top - toe;
  const d = input.diameterMm / 1000, base = (input.baseDiameterMm ?? input.diameterMm) / 1000;
  const material: PileMaterial = type?.material ?? "steel", circular = type?.isCircular ?? true;
  const parts: PhysicalPart[] = [];
  // Stekken of wapening die boven de kop uitsteken: alleen als detail.
  const stubs = (id: string, size: number, isRound: boolean, at: number) => parts.push({ id, role: "rebar", material: "steel", schematic: true, shape: { kind: "bars",
    topNap: at + Math.min(0.25, 0.08 * length), bottomNap: at - Math.min(0.15, 0.05 * length), diameterM: Math.max(0.012, 0.06 * size),
    positions: isRound ? ring(6, 0.34 * size) : [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([x, z]) => [0.32 * size * x, 0.32 * size * z] as [number, number]) } });
  const screwTip = (id: string, shaftBottom: number, outer: number) => {
    parts.push(round(`${id}-tip`, "tip", "steel", shaftBottom, toe, outer * 0.9, outer * 0.12, { schematic: true }));
    parts.push({ id: `${id}-blade`, role: "blade", material: "steel", schematic: true, shape: { kind: "helix", topNap: shaftBottom, bottomNap: toe + 0.1 * (shaftBottom - toe), innerDiameterM: outer * 0.3, outerTopDiameterM: outer * 1.0, outerBottomDiameterM: outer * 0.45, turns: 1.5 } });
  };

  switch (systemId) {
    case "prefab-concrete": {
      // Heipunt: de onderste 0,6 · maat afgeschuind tot de halve maat (schematisch).
      const tipH = Math.min(0.6 * d, 0.25 * length), y = toe + tipH;
      if (circular) {
        parts.push(round("shaft", "shaft", "concrete", top, y, d), round("tip", "tip", "concrete", y, toe, d, 0.5 * d, { schematic: true }));
      } else {
        parts.push({ id: "shaft", role: "shaft", material: "concrete", shape: { kind: "rect", topNap: top, bottomNap: y, topAM: d, topBM: d, bottomAM: d, bottomBM: d } });
        parts.push({ id: "tip", role: "tip", material: "concrete", schematic: true, shape: { kind: "rect", topNap: y, bottomNap: toe, topAM: d, topBM: d, bottomAM: 0.5 * d, bottomBM: 0.5 * d } });
      }
      stubs("rebar", d, circular, top);
      break;
    }
    case "steel-tube-closed": {
      const plate = Math.min(FOOT_PLATE_M, 0.2 * length), wall = Math.max(0, Math.min(input.wallThicknessMm / 1000, d / 2));
      parts.push(round("shaft", "shaft", "steel", top, toe + plate, d, d, { wallM: wall }));
      parts.push(round("footplate", "footplate", "steel", toe + plate, toe, base));
      break;
    }
    case "steel-tube-open": {
      // Open buis zonder voetplaat. Met prop: grond in de buis vanaf de punt.
      // De hoogte van de prop volgt niet uit de invoer (schematisch, 4 · binnendiameter).
      const wall = Math.max(0, Math.min(input.wallThicknessMm / 1000, d / 2)), inner = Math.max(0, d - 2 * wall);
      parts.push(round("shaft", "shaft", "steel", top, toe, d, d, { wallM: wall, cutAway: true }));
      if (input.openTube?.plug && inner > 0) parts.push(round("plug", "plug", "plug", Math.min(top, toe + Math.min(4 * inner, 0.5 * length)), toe, inner * 0.995, inner * 0.995, { schematic: true }));
      break;
    }
    case "screw-injection": {
      // De schacht is de groutschil; de stalen kernbuis is niet ingevoerd.
      const tipH = Math.min(0.8 * d, 0.25 * length), y = toe + tipH;
      parts.push(round("grout", "grout", "grout", top, y, d));
      parts.push(round("core", "core", "steel", top + Math.min(0.3, 0.1 * length), y, 0.45 * d, 0.45 * d, { wallM: 0.04 * d, schematic: true }));
      screwTip("screw", y, base);
      break;
    }
    case "screw-permanent-casing": {
      const tipH = Math.min(0.9 * base, 0.25 * length), y = toe + tipH, wall = Math.max(0, Math.min(input.wallThicknessMm / 1000, d / 2));
      parts.push(round("shaft", "shaft", "steel", top, y, d, d, { wallM: wall }));
      screwTip("screw", y, base);
      break;
    }
    case "screw-lost-tip":
    case "screw-soil-displacing": {
      const tipH = Math.min(0.9 * base, 0.25 * length), y = toe + tipH;
      parts.push(round("shaft", "shaft", "concrete", top, y, d));
      screwTip("screw", y, base);
      stubs("rebar", d, true, top);
      break;
    }
    case "vibro": {
      // In de grond gevormd op een stalen voetplaat; een bredere voetmaat is de plaat.
      const plate = Math.min(0.03, 0.2 * length);
      parts.push(round("shaft", "shaft", "concrete", top, toe + plate, d), round("footplate", "footplate", "steel", toe + plate, toe, base));
      stubs("rebar", d, true, top);
      break;
    }
    case "timber":
    case "timber-extension": {
      const ext = input.concreteExtension, woodTop = woodTopNap(input);
      if (ext) {
        parts.push(ext.isCircular ? round("extension", "extension", "concrete", top, ext.jointNap, ext.sizeMm / 1000)
          : { id: "extension", role: "extension", material: "concrete", shape: { kind: "rect", topNap: top, bottomNap: ext.jointNap, topAM: ext.sizeMm / 1000, topBM: ext.sizeMm / 1000, bottomAM: ext.sizeMm / 1000, bottomBM: ext.sizeMm / 1000 } });
        stubs("rebar", ext.sizeMm / 1000, ext.isCircular, top);
      }
      if (circular) {
        const knots = [woodTop, ...(input.timberTaper ? [woodTop - input.timberTaper.lengthM] : []), toe]
          .filter((v, i, all) => Number.isFinite(v) && v <= woodTop && v >= toe && all.indexOf(v) === i).sort((a, b) => b - a);
        for (let i = 1; i < knots.length; i++) parts.push(round(`wood-${i}`, "shaft", "wood", knots[i - 1], knots[i], shaftDiameterAtNap(input, knots[i - 1]) / 1000, shaftDiameterAtNap(input, knots[i]) / 1000));
      } else {
        const b = (input.sideBMm ?? input.diameterMm) / 1000;
        parts.push({ id: "wood-1", role: "shaft", material: "wood", shape: { kind: "rect", topNap: woodTop, bottomNap: toe, topAM: d, topBM: b, bottomAM: d, bottomBM: b } });
      }
      if (ext) {
        // Las: stalen ring om de kop van het hout, onder de opzetter (schematisch).
        const woodD = circular ? d : Math.hypot(d, (input.sideBMm ?? input.diameterMm) / 1000), h = Math.min(0.12, 0.2 * (woodTop - toe));
        parts.push(round("joint", "joint", "steel", ext.jointNap, ext.jointNap - h, woodD * 1.06, woodD * 1.06, { wallM: woodD * 0.04, schematic: true }));
      }
      break;
    }
    default: {
      // Avegaar-, DPA- en boorpaal, en onbekende systemen: een rechte schacht in het materiaal van het paaltype.
      if (!circular) parts.push({ id: "shaft", role: "shaft", material, shape: { kind: "rect", topNap: top, bottomNap: toe, topAM: d, topBM: d, bottomAM: d, bottomBM: d } });
      else if (material === "steel" && !type?.requiresEA) parts.push(round("shaft", "shaft", "steel", top, toe, d, d, { wallM: Math.max(0, Math.min(input.wallThicknessMm / 1000, d / 2)) }));
      else parts.push(round("shaft", "shaft", material, top, toe, d));
      if (material === "concrete") stubs("rebar", d, circular, top);
    }
  }
  return parts.filter((p) => p.shape.topNap > p.shape.bottomNap);
}

/** Grootste halve breedte van een onderdeel (bij een rechthoek de halve diagonaal). */
export function partRadius(shape: PhysicalShape): number {
  switch (shape.kind) {
    case "round": return Math.max(shape.topDiameterM, shape.bottomDiameterM) / 2;
    case "rect": return Math.max(Math.hypot(shape.topAM, shape.topBM), Math.hypot(shape.bottomAM, shape.bottomBM)) / 2;
    case "helix": return Math.max(shape.outerTopDiameterM, shape.outerBottomDiameterM) / 2;
    case "bars": return Math.max(0, ...shape.positions.map(([x, z]) => Math.hypot(x, z))) + shape.diameterM / 2;
  }
}

/** Lagen van het grondblok: het ingevoerde profiel, gesplitst op het ontgravingsniveau; gelijke lagen samengevoegd. */
export function soilBlockLayers(input: PileInput, topNap: number, bottomNap: number): SoilBlockLayer[] {
  const profile = input.soilProfile
    .filter((l) => [l.startNap, l.endNap].every(Number.isFinite) && l.startNap > l.endNap)
    .sort((a, b) => b.startNap - a.startNap);
  const pieces: SoilBlockLayer[] = [];
  const push = (kind: SoilDisplayKind, top: number, bottom: number, assumed: boolean) => {
    const t = Math.min(top, topNap), b = Math.max(bottom, bottomNap);
    if (t - b < 1e-6) return;
    const cut = input.excavationNap;
    for (const [pt, pb] of cut < t - 1e-6 && cut > b + 1e-6 ? [[t, cut], [cut, b]] : [[t, b]]) {
      const excavated = (pt + pb) / 2 > cut, last = pieces[pieces.length - 1];
      if (last && last.kind === kind && last.excavated === excavated && last.assumed === assumed && Math.abs(last.bottomNap - pt) < 1e-6) last.bottomNap = pb;
      else pieces.push({ kind, topNap: pt, bottomNap: pb, excavated, assumed });
    }
  };
  if (!profile.length) return pieces;
  // Boven en onder het profiel en in een gat ertussen: de dichtstbijzijnde laag doorgetrokken.
  if (profile[0].startNap < topNap) push(soilDisplayKind(profile[0].kind), topNap, profile[0].startNap, true);
  profile.forEach((layer, i) => {
    push(soilDisplayKind(layer.kind), layer.startNap, layer.endNap, false);
    const next = profile[i + 1];
    if (next && next.startNap < layer.endNap - 1e-6) push(soilDisplayKind(layer.kind), layer.endNap, next.startNap, true);
  });
  const last = profile[profile.length - 1];
  if (last.endNap > bottomNap) push(soilDisplayKind(last.kind), last.endNap, bottomNap, true);
  return pieces;
}

const SOIL_NL: Record<SoilDisplayKind, string> = { sand: "Zand", clay: "Klei", peat: "Veen" };
export const soilDisplayName = (kind: SoilDisplayKind) => ct("calcPile", `view3d.soil.${kind}`, SOIL_NL[kind]);

/**
 * Bouwt het model voor de fysieke 3D-weergave. Heeft geen rekenresultaat nodig:
 * de paal is ook te zien als de berekening nog niet rond is. Geeft null bij
 * ongeldige maten of niveaus.
 */
export function buildPhysicalScene(input: PileInput, cpt: Cpt | null | undefined, pileType: PileTypeSpec | undefined): PhysicalScene | null {
  const top = input.pileTopNap, toe = input.pileToeNap;
  if (![top, toe, input.diameterMm, input.excavationNap, input.waterNap].every(Number.isFinite) || top <= toe || input.diameterMm <= 0) return null;
  const baseSizeMm = input.timberTaper?.toeDiameterMm ?? input.baseDiameterMm ?? input.diameterMm;
  let deqM: number;
  try { deqM = pileGeometry(baseSizeMm, pileType?.isCircular ?? true, input.sideBMm).equivalentDiameterMm / 1000; } catch { return null; }
  const systemId = pileSystemIdOf(input);
  const parts = pileParts(input, pileType, systemId);
  if (!parts.length) return null;
  const maxRadiusM = Math.max(...parts.map((p) => partRadius(p.shape)));
  const length = top - toe;
  const groundNap = cpt?.metadata.ground_level_nap ?? input.excavationNap;

  const halfWidthM = Math.max(6 * maxRadiusM, 0.11 * length, 0.8);
  const blockTop = groundNap, blockBottom = toe - Math.max(1, 5 * deqM);
  const layers = soilBlockLayers(input, blockTop, blockBottom);
  const planes: PhysicalScene["planes"] = [{ id: "ground", nap: groundNap }];
  if (Math.abs(input.excavationNap - groundNap) > 0.01) planes.push({ id: "excavation", nap: input.excavationNap });
  if (input.waterNap < blockTop + 2 && input.waterNap > blockBottom) planes.push({ id: "water", nap: input.waterNap });

  // Niveaus links van het blok, van boven naar beneden uit elkaar geschoven.
  const sceneTop = Math.max(top, ...parts.map((p) => p.shape.topNap), groundNap), sceneBottom = blockBottom;
  const labelGapM = 0.055 * (sceneTop - sceneBottom);
  const labelX = -(halfWidthM + 0.25 * halfWidthM);
  const tr = (key: string, nl: string, level: number) => ct("calcPile", `view3d.physical.${key}`, nl, { nap: nap(level) });
  type Wanted = { id: string; text: string; target: [number, number] };
  const wanted: Wanted[] = [
    { id: "head", text: tr("head", "paalkop {{nap}}", top), target: [-partRadius(parts[0].shape), top] },
    { id: "ground", text: ct("calcPile", "view3d.label.ground", "maaiveld {{nap}}", { nap: nap(groundNap) }), target: [-halfWidthM, groundNap] },
    ...planes.filter((p) => p.id !== "ground").map((p): Wanted => ({ id: p.id, text: p.id === "water" ? tr("water", "grondwater {{nap}}", p.nap) : tr("excavation", "ontgraving {{nap}}", p.nap), target: [-halfWidthM, p.nap] })),
    ...(input.concreteExtension ? [{ id: "joint", text: tr("joint", "las {{nap}}", input.concreteExtension.jointNap), target: [-maxRadiusM, input.concreteExtension.jointNap] } satisfies Wanted] : []),
    { id: "toe", text: ct("calcPile", "view3d.label.toe", "paalpunt {{nap}}", { nap: nap(toe) }), target: [-partRadius(parts[parts.length - 1].shape) * 0.5, toe] },
  ];
  wanted.sort((a, b) => b.target[1] - a.target[1]);
  const levels = spreadDown(wanted.map((l) => l.target[1]), labelGapM);
  const labels: PhysicalLabel[] = wanted.map((l, i) => ({ id: l.id, text: l.text, anchor: [labelX, levels[i]], target: l.target, align: "left", group: "pile" }));
  // Laagnamen rechts van het blok, met een aanhaallijn naar het snijvlak; een laag die te dun is voor een naam blijft zonder.
  layers.forEach((layer, i) => {
    if (layer.assumed || layer.topNap - layer.bottomNap < labelGapM) return;
    labels.push({ id: `layer-${i}`, text: layer.excavated ? ct("calcPile", "view3d.physical.excavatedLayer", "{{soil}} (ontgraven)", { soil: soilDisplayName(layer.kind) }) : soilDisplayName(layer.kind),
      anchor: [1.2 * halfWidthM, (layer.topNap + layer.bottomNap) / 2], target: [0.9 * halfWidthM, (layer.topNap + layer.bottomNap) / 2], align: "right", group: "pile" });
  });

  // Paalpunt van dichtbij: de punt, de voet of het schroefblad vult het beeld.
  const tipSize = Math.max(deqM, 2 * maxRadiusM), tipHalf = Math.min(halfWidthM, 3 * tipSize);
  return {
    systemId, groundNap, deqM,
    pile: { topNap: top, toeNap: toe, parts, maxRadiusM },
    block: { halfWidthM, depthM: halfWidthM, topNap: blockTop, bottomNap: blockBottom, layers },
    planes, labels, labelGapM,
    focus: {
      tip: { x0: -tipHalf, x1: tipHalf, bottomNap: Math.max(blockBottom, toe - 1.5 * tipSize), topNap: Math.min(sceneTop, toe + 3.5 * tipSize) },
      // Rechts ruimte voor de laagnamen: die hebben een vaste schermgrootte, de hoogte van het beeld is de maat.
      pile: { x0: labelX, x1: 1.2 * halfWidthM + 0.3 * (sceneTop - sceneBottom), bottomNap: sceneBottom - 0.03 * length, topNap: sceneTop + 0.08 * length },
    },
  };
}
