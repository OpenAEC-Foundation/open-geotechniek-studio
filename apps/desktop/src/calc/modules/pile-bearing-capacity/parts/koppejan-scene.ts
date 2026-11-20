// Geometry of the 3D explanation of the 4D-8D method: which volumes, between
// which levels, with which labels. Pure data, so it can be tested without WebGL;
// the three.js scene in ui/koppejan-three.ts only draws what this returns.
import type { Cpt } from "../../../../types/cpt";
import { ct, fmtNumber } from "../../../i18n";
import type { PileInput, PileResult, PileTypeSpec } from "../types";
import { shaftDiameterAtNap, woodTopNap } from "./geometry";
import type { PileMaterial } from "./material-colors";

export type KoppejanZoneId = "I" | "II" | "III";

/** Eén traject als omwentelingsvolume rond de paalas. De hoogte is op schaal;
 *  de straal is schematisch (de methode kent alleen een traject langs de diepte). */
export interface KoppejanZone {
  id: KoppejanZoneId;
  topNap: number;
  bottomNap: number;
  /** 0 = massieve kern onder de paalpunt. */
  innerRadiusM: number;
  outerRadiusM: number;
  /** Richting waarin het traject wordt doorlopen. */
  direction: "down" | "up";
  qcGemMpa: number;
}

/** Stuk paalschacht met een lineair verlopende maat (diameter of zijde). */
export interface PileSegment {
  topNap: number;
  bottomNap: number;
  topSizeM: number;
  bottomSizeM: number;
  isCircular: boolean;
  material: PileMaterial;
}

export interface ShaftZone {
  id: "negative" | "positive";
  topNap: number;
  bottomNap: number;
  forceKn: number;
}

export interface SceneLabel {
  id: KoppejanZoneId | "critical" | "toe" | "ground" | "negative" | "positive" | "qcAxis";
  text: string;
  /** Plek van de tekst [x, NAP]; "left" = tekst eindigt hier, "right" = tekst begint hier. */
  anchor: [number, number];
  /** Punt waar de aanhaallijn naartoe loopt; ontbreekt bij een los bijschrift. */
  target?: [number, number];
  align: "left" | "right";
  /** "tip": alleen leesbaar van dichtbij, de weergave verbergt ze bij uitzoomen. */
  group: "tip" | "pile";
}

export interface QcPoint { nap: number; qcMpa: number }

export interface KoppejanScene {
  groundNap: number;
  deqM: number;
  pile: { topNap: number; toeNap: number; segments: PileSegment[] };
  zones: KoppejanZone[];
  /** Zoekgebied van de kritieke diepte: 0,7 en 4 Deq onder de paalpunt. */
  searchRange: { topNap: number; bottomNap: number; radiusM: number };
  critical: { nap: number; depthM: number; deqRatio: number };
  shaftZones: ShaftZone[];
  /** Bezwijklichaam rond de paalpunt als omwentelingslichaam; null als traject III ontbreekt. */
  slip: SlipBody | null;
  qc: {
    /** x van qc = 0 en breedte van de as tot axisMaxMpa [m]. */
    originX: number;
    widthM: number;
    axisMaxMpa: number;
    raw: QcPoint[];
    /** Afgekapte qc-lijn over de trajecten II en III; leeg als het resultaat hem niet bevat. */
    clipped: QcPoint[];
    /** Trajectgemiddelde als verticale lijn over de hoogte van het traject. */
    averages: Array<{ zone: KoppejanZoneId; topNap: number; bottomNap: number; qcMpa: number }>;
  };
  labels: SceneLabel[];
  /** Afstand tussen de labels rond de paalpunt [m]; de weergave verbergt ze als dat te krap wordt. */
  labelGapM: number;
  /** Uitsnedes voor "passend in beeld" [m]: x van het labelanker links tot rechts van de qc-as, NAP van onder naar boven. */
  focus: Record<"tip" | "pile", { x0: number; x1: number; bottomNap: number; topNap: number }>;
}

/** Bezwijklichaam volgens het glijvlak waarop de 4D-8D-methode berust: een logaritmische
 *  spiraal die onder de paalpunt begint op de kritieke diepte, naar buiten draait en
 *  boven de punt weer bij de schacht uitkomt. */
export interface SlipBody {
  /** Doorsnede van het glijvlak van onder naar boven: [straal vanaf de paalas, NAP]. */
  profile: Array<[number, number]>;
  /** Groei van de spiraal: r = r0·exp(θ·tanSpiral). */
  tanSpiral: number;
  maxRadiusM: number;
  /** Niveau waarop het lichaam het breedst is. */
  widestNap: number;
  bottomNap: number;
  topNap: number;
}

/** Logaritmische spiraal met de pool in het hart van de paalpunt: bij θ = 0 recht omlaag
 *  met straal `depthM`, bij θ = π recht omhoog met straal `heightM`. */
export function slipBody(toeNap: number, depthM: number, heightM: number, steps = 48): SlipBody | null {
  if (!(depthM > 0) || !(heightM > 0)) return null;
  const tanSpiral = Math.log(heightM / depthM) / Math.PI;
  const profile: Array<[number, number]> = [];
  let maxRadiusM = 0, widestNap = toeNap;
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * Math.PI;
    const r = depthM * Math.exp(theta * tanSpiral);
    const x = i === 0 || i === steps ? 0 : r * Math.sin(theta), level = toeNap - r * Math.cos(theta);
    profile.push([x, level]);
    if (x > maxRadiusM) { maxRadiusM = x; widestNap = level; }
  }
  return { profile, tanSpiral, maxRadiusM, widestNap, bottomNap: toeNap - depthM, topNap: toeNap + heightM };
}

/** Schematische stralen, in Deq. */
const CORE_RADIUS_DEQ = 1.25;
const OUTER_RADIUS_DEQ = 2.5;
const FOOT_HEIGHT_M = 0.05;
/** Kleinste afstand tussen de labels rond de paalpunt, in Deq. */
const LABEL_GAP_DEQ = 1.4;

const nap = (v: number) => `NAP ${v >= 0 ? "+" : "−"}${fmtNumber(Math.abs(v), 2)} m`;
const mpa = (v: number) => `${fmtNumber(v, 2)} MPa`;
const kn = (v: number) => `${fmtNumber(v, 0)} kN`;

/** Schuift labels (van boven naar beneden) uit elkaar tot ze minstens `gap` uit elkaar staan. */
export function spreadDown(levels: number[], gap: number): number[] {
  const out: number[] = [];
  for (const level of levels) out.push(out.length ? Math.min(level, out[out.length - 1] - gap) : level);
  return out;
}

function pileSegments(input: PileInput, pileType: PileTypeSpec | undefined, baseSizeMm: number): PileSegment[] {
  const material: PileMaterial = pileType?.material ?? "steel";
  const isCircular = pileType?.isCircular ?? true;
  const ext = input.concreteExtension;
  const taper = input.timberTaper;
  const knots = [input.pileTopNap,
    ...(ext ? [ext.jointNap] : []),
    ...(taper ? [woodTopNap(input) - taper.lengthM] : []),
    input.pileToeNap,
  ].filter((v, i, all) => Number.isFinite(v) && v <= input.pileTopNap && v >= input.pileToeNap && all.indexOf(v) === i)
    .sort((a, b) => b - a);
  const segments: PileSegment[] = [];
  for (let i = 1; i < knots.length; i++) {
    const top = knots[i - 1], bottom = knots[i];
    const inExtension = !!ext && (top + bottom) / 2 > ext.jointNap;
    segments.push(inExtension
      ? { topNap: top, bottomNap: bottom, topSizeM: ext.sizeMm / 1000, bottomSizeM: ext.sizeMm / 1000, isCircular: ext.isCircular, material: "concrete" }
      : { topNap: top, bottomNap: bottom, topSizeM: shaftDiameterAtNap(input, top) / 1000, bottomSizeM: shaftDiameterAtNap(input, bottom) / 1000, isCircular, material });
  }
  // Afwijkende puntmaat zonder tapsheid (voetplaat, verbrede voet): als dunne plaat aan de punt.
  const last = segments[segments.length - 1];
  if (last && !taper && Math.abs(baseSizeMm / 1000 - last.bottomSizeM) > 1e-6 && last.topNap - last.bottomNap > FOOT_HEIGHT_M) {
    const footTop = last.bottomNap + FOOT_HEIGHT_M;
    segments.push({ ...last, topNap: footTop, topSizeM: baseSizeMm / 1000, bottomSizeM: baseSizeMm / 1000 });
    last.bottomNap = footTop;
  }
  return segments;
}

/**
 * Bouwt het model voor de 3D-weergave. Geeft null als er niets zinnigs te
 * tekenen is (geen sondering, berekening mislukt, ongeldige maten).
 */
export function buildKoppejanScene(
  input: PileInput,
  result: PileResult,
  cpt: Cpt | null | undefined,
  pileType: PileTypeSpec | undefined,
): KoppejanScene | null {
  if (!cpt || !result.ok) return null;
  const base = result.base;
  const deqM = base.deqMm / 1000;
  const toe = input.pileToeNap, top = input.pileTopNap;
  if (![deqM, base.criticalDepthM, base.qcIGemMpa, base.qcIIGemMpa, base.qcIIIGemMpa, toe, top].every(Number.isFinite)) return null;
  if (deqM <= 0 || base.criticalDepthM <= 0 || top <= toe) return null;

  const groundNap = cpt.metadata.ground_level_nap ?? 0;
  const coreR = CORE_RADIUS_DEQ * deqM, outerR = OUTER_RADIUS_DEQ * deqM;
  const baseSizeMm = input.timberTaper?.toeDiameterMm ?? input.baseDiameterMm ?? input.diameterMm;
  const segments = pileSegments(input, pileType, baseSizeMm);
  if (!segments.length) return null;
  const toeSegment = segments[segments.length - 1];
  // Buitenkant van de paal bij de punt: bij een vierkante paal de halve diagonaal.
  const toeRadiusM = Math.min(coreR, toeSegment.bottomSizeM / 2 * (toeSegment.isCircular ? 1 : Math.SQRT2));

  const criticalNap = toe - base.criticalDepthM;
  // De berekening kapt traject III af op het maaiveld.
  const zoneIIITop = Math.min(groundNap, toe + 8 * deqM);
  const zones: KoppejanZone[] = [
    { id: "I", topNap: toe, bottomNap: criticalNap, innerRadiusM: 0, outerRadiusM: coreR, direction: "down", qcGemMpa: base.qcIGemMpa },
    { id: "II", topNap: toe, bottomNap: criticalNap, innerRadiusM: coreR, outerRadiusM: outerR, direction: "up", qcGemMpa: base.qcIIGemMpa },
    ...(zoneIIITop > toe ? [{ id: "III" as const, topNap: zoneIIITop, bottomNap: toe, innerRadiusM: toeRadiusM, outerRadiusM: outerR, direction: "up" as const, qcGemMpa: base.qcIIIGemMpa }] : []),
  ];

  // Kleeftrajecten langs de schacht, alleen als ze een kracht leveren.
  const shaftZones: ShaftZone[] = [];
  const negTop = Math.min(top, input.excavationNap, groundNap);
  const negBottom = Math.max(toe, result.negKleef.bottomNap);
  if (result.negKleef.fnkD > 0.5 && Number.isFinite(negBottom) && negTop > negBottom) {
    shaftZones.push({ id: "negative", topNap: negTop, bottomNap: negBottom, forceKn: result.negKleef.fnkD });
  }
  const posTop = Math.min(top, input.posKleefTopNap ?? input.negKleefBottomNap);
  if (result.shaft.rsCalMax > 0.5 && Number.isFinite(posTop) && posTop > toe) {
    shaftZones.push({ id: "positive", topNap: posTop, bottomNap: toe, forceKn: result.shaft.rsCalMax });
  }

  // Sondering: qc-lijn in een vlak naast de paal, van maaiveld tot onder het zoekgebied.
  const sceneTop = Math.max(top, groundNap);
  const sceneBottom = toe - 6 * deqM;
  const raw: QcPoint[] = [];
  for (const p of cpt.points) {
    if (typeof p.qc !== "number" || !Number.isFinite(p.qc) || !Number.isFinite(p.depth)) continue;
    const level = groundNap - p.depth;
    if (level <= sceneTop && level >= sceneBottom) raw.push({ nap: level, qcMpa: Math.max(0, p.qc) });
  }
  raw.sort((a, b) => b.nap - a.nap);
  const clipped: QcPoint[] = (base.clippedQcCurve ?? [])
    .filter((p) => Number.isFinite(p.depth) && Number.isFinite(p.qcClipped))
    .map((p) => ({ nap: groundNap - p.depth, qcMpa: Math.max(0, p.qcClipped) }))
    .sort((a, b) => b.nap - a.nap);
  const qcMax = Math.max(0, ...raw.map((p) => p.qcMpa), base.qcIGemMpa, base.qcIIGemMpa, base.qcIIIGemMpa);
  const axisMaxMpa = Math.max(5, Math.ceil(qcMax * 1.05 / 5) * 5);
  // Het bezwijklichaam is breder dan de schematische trajecten: de qc-as en de labels staan erbuiten.
  const slip = zoneIIITop > toe ? slipBody(toe, base.criticalDepthM, zoneIIITop - toe) : null;
  const reach = Math.max(outerR, slip?.maxRadiusM ?? 0);
  const originX = reach + deqM;
  const widthM = Math.max(5 * deqM, 0.1 * (top - toe));

  // Labels links van de paal, van boven naar beneden; rond de punt uit elkaar geschoven.
  const labelX = -(reach + deqM);
  const zoneIII = zones.find((z) => z.id === "III");
  const tipWanted: Array<{ id: SceneLabel["id"]; text: string; target: [number, number] }> = [
    ...(zoneIII ? [{ id: "III" as const, text: ct("calcPile", "view3d.label.zone", "{{symbol}} = {{value}}", { symbol: "qc;III;gem", value: mpa(base.qcIIIGemMpa) }), target: [-(toeRadiusM + outerR) / 2, (zoneIII.topNap + toe) / 2] as [number, number] }] : []),
    { id: "toe", text: ct("calcPile", "view3d.label.toe", "paalpunt {{nap}}", { nap: nap(toe) }), target: [-toeRadiusM, toe] },
    { id: "II", text: ct("calcPile", "view3d.label.zone", "{{symbol}} = {{value}}", { symbol: "qc;II;gem", value: mpa(base.qcIIGemMpa) }), target: [-(coreR + outerR) / 2, toe - base.criticalDepthM * 0.35] },
    { id: "I", text: ct("calcPile", "view3d.label.zone", "{{symbol}} = {{value}}", { symbol: "qc;I;gem", value: mpa(base.qcIGemMpa) }), target: [-coreR / 2, toe - base.criticalDepthM * 0.65] },
    { id: "critical", text: ct("calcPile", "view3d.label.critical", "kritieke diepte {{depth}} m", { depth: fmtNumber(base.criticalDepthM, 2) }), target: [-outerR, criticalNap] },
  ];
  const labelGapM = LABEL_GAP_DEQ * deqM;
  const tipLevels = spreadDown(tipWanted.map((l) => l.target[1]), labelGapM);
  const labels: SceneLabel[] = tipWanted.map((l, i) => ({ id: l.id, text: l.text, anchor: [labelX, tipLevels[i]], target: l.target, align: "left", group: "tip" }));
  labels.push({ id: "qcAxis", text: ct("calcPile", "view3d.label.qcAxis", "qc 0 – {{max}} MPa", { max: fmtNumber(axisMaxMpa, 0) }), anchor: [originX + widthM, sceneBottom - 0.6 * deqM], align: "left", group: "tip" });
  labels.push({ id: "ground", text: ct("calcPile", "view3d.label.ground", "maaiveld {{nap}}", { nap: nap(groundNap) }), anchor: [labelX, groundNap], target: [-outerR, groundNap], align: "left", group: "pile" });
  for (const zone of shaftZones) {
    const text = zone.id === "negative"
      ? ct("calcPile", "view3d.label.negative", "Fnk;d = {{force}}", { force: kn(zone.forceKn) })
      : ct("calcPile", "view3d.label.positive", "Rs;cal;max = {{force}}", { force: kn(zone.forceKn) });
    // Boven traject III blijven, zodat het label niet tussen de trajectlabels valt.
    const level = Math.max((zone.topNap + zone.bottomNap) / 2, Math.min(zone.topNap, zoneIIITop + 1.5 * deqM));
    labels.push({ id: zone.id, text, anchor: [labelX, level], target: [-toeSegment.topSizeM / 2, level], align: "left", group: "pile" });
  }

  const x1 = originX + widthM + 0.5 * deqM;
  return {
    groundNap, deqM,
    pile: { topNap: top, toeNap: toe, segments },
    zones,
    searchRange: { topNap: toe - 0.7 * deqM, bottomNap: toe - 4 * deqM, radiusM: outerR },
    critical: { nap: criticalNap, depthM: base.criticalDepthM, deqRatio: base.criticalDepthM / deqM },
    shaftZones,
    slip,
    qc: {
      originX, widthM, axisMaxMpa, raw, clipped,
      averages: zones.map((z) => ({ zone: z.id, topNap: z.topNap, bottomNap: z.bottomNap, qcMpa: z.qcGemMpa })),
    },
    labels, labelGapM,
    focus: {
      tip: { x0: labelX, x1, bottomNap: sceneBottom - deqM, topNap: Math.min(sceneTop + deqM, toe + 10.5 * deqM) },
      pile: { x0: labelX, x1, bottomNap: sceneBottom - deqM, topNap: sceneTop + deqM },
    },
  };
}
