// Geometrie voor de tekeningen: de plattegrond van de wand en de maten van het grondblok in 3D.
// Zuivere functies; de tekening zelf staat in SectionDrawing.tsx, WallScene3D.tsx en report.ts.
import type { SheetPileProfile } from "../../library/sheetPiles";
import { getSoilType } from "../spread-foundation/catalog";
import { hasAnchor, normalizeWallInput, type Construction, type ScenarioLayer, type Side, type WallInput, type WallOk, type WallRun } from "./compute";

/** Eén recht stuk plaat in de plattegrond: van (a, x) naar (a, x) met een dikte; a langs de wand, x dwars erop [m]. */
export interface PlateSegment { a0: number; x0: number; a1: number; x1: number; thicknessM: number; kind: "flange" | "web" | "plank" }

/**
 * Plattegrond van een stalen damwand als trapeziumgolf met de maten uit de bibliotheek: plankbreedte,
 * wandhoogte, flens- en lijfdikte. Z- en U-planken geven één golf per twee planken, hoedprofielen één golf per
 * plank. De breedte van de flens staat niet in de bibliotheek en is een vast deel van de plankbreedte; de
 * sloten zijn niet getekend.
 */
export function profilePlan(p: SheetPileProfile, lengthM: number): PlateSegment[] {
  const b = (p.widthMm ?? 600) / 1000, h = (p.wallHeightMm ?? 300) / 1000;
  const tf = (p.flangeMm ?? p.webMm ?? 10) / 1000, tw = (p.webMm ?? p.flangeMm ?? 10) / 1000;
  if (p.shape === "straight") return [{ a0: 0, x0: 0, a1: lengthM, x1: 0, thicknessM: tw, kind: "web" }];
  const period = p.shape === "hat" ? b : 2 * b, flat = (p.shape === "Z" ? 0.5 : p.shape === "U" ? 0.42 : 0.3) * (period / 2), run = period / 2 - flat;
  const out: PlateSegment[] = [];
  const push = (a0: number, x0: number, a1: number, x1: number, kind: PlateSegment["kind"]) => {
    if (a0 >= lengthM) return;
    const t = a1 > lengthM ? (lengthM - a0) / (a1 - a0) : 1;
    out.push({ a0, x0, a1: a0 + t * (a1 - a0), x1: x0 + t * (x1 - x0), thicknessM: kind === "flange" ? tf : tw, kind });
  };
  for (let a = 0; a < lengthM; a += period) {
    push(a, -h / 2, a + flat, -h / 2, "flange");
    push(a + flat, -h / 2, a + flat + run, h / 2, "web");
    push(a + flat + run, h / 2, a + 2 * flat + run, h / 2, "flange");
    push(a + 2 * flat + run, h / 2, a + period, -h / 2, "web");
  }
  return out;
}

/** Breedte van één plank van een doorgaande beschoeiing in de tekening [m]. */
export const PLANK_WIDTH_M = 0.2;

/** Doorgaande wand van vlakke planken: planken van vaste breedte naast elkaar, met een voeg ertussen. */
export function plankPlan(thicknessM: number, lengthM: number): PlateSegment[] {
  const out: PlateSegment[] = [];
  for (let a = 0; a < lengthM - 1e-9; a += PLANK_WIDTH_M) out.push({ a0: a + 0.004, x0: 0, a1: Math.min(lengthM, a + PLANK_WIDTH_M) - 0.004, x1: 0, thicknessM, kind: "plank" });
  return out;
}

export interface SceneLayer { name: string; color: string; topNap: number; bottomNap: number }
export interface WallScene {
  construction: Construction;
  /** Halve breedte van het grondblok dwars op de wand en de lengte langs de wand [m]. */
  halfWidthM: number;
  lengthM: number;
  /** Stuk wand dat voor het snijvlak uitsteekt [m]. */
  frontM: number;
  topNap: number;
  bottomNap: number;
  wallTopNap: number;
  toeNap: number;
  /** Dikte van de wand of breedte van de paal dwars op de wand [m]. */
  wallHeightM: number;
  /** Platen over de volle hoogte van de wand (damwand of planken); leeg bij palen met schotten. */
  plates: PlateSegment[];
  /** Palen met hun plaats langs de wand, en de schotten aan de hoge zijde. */
  posts: Array<{ alongM: number; shape: "round" | "square"; sizeM: number }>;
  boards: { thicknessM: number; bottomNap: number } | null;
  /** Gording op het niveau van het anker, aan de lage zijde van een doorgaande wand. */
  waling: { levelNap: number; sizeM: number } | null;
  high: { surfaceNap: number; waterNap: number; layers: SceneLayer[] };
  low: { surfaceNap: number; waterNap: number; originalNap: number; layers: SceneLayer[] };
  surchargeKpa: number;
  anchors: Array<{ alongM: number; levelNap: number; angleDeg: number; lengthM: number }>;
  profileName: string;
}

const FALLBACK = "#C9B28A";
export const layerColor = (l: { soilId?: string }): string => getSoilType(l.soilId)?.color ?? FALLBACK;

/** Lagen van één zijde tussen het maaiveld en de onderkant van het blok. */
export function sceneLayers(side: Side, bottomNap: number): SceneLayer[] {
  const layers = side.layers as ScenarioLayer[];
  return layers.map((l, k) => ({ name: l.name, color: layerColor(l), topNap: k === 0 ? side.surfaceNap : Math.min(l.topNap, side.surfaceNap), bottomNap: Math.max(bottomNap, k + 1 < layers.length ? Math.min(layers[k + 1].topNap, side.surfaceNap) : bottomNap) }))
    .filter((l) => l.topNap > l.bottomNap);
}

export function wallScene(raw: WallInput, r: WallOk, run: WallRun = r.sls): WallScene {
  const i = normalizeWallInput(raw), s = run.scenario, height = i.wallTopNap - i.toeNap, sec = r.section, kind = sec.construction;
  const b = (sec.profile?.widthMm ?? 600) / 1000, period = kind === "posts" ? i.posts.spacingM : kind === "plank" ? 3 * PLANK_WIDTH_M : sec.profile?.shape === "hat" ? b : 2 * b;
  const length = Math.max(3 * period, Math.min(8, Math.ceil((0.6 * height) / period) * period)), front = kind === "posts" ? period / 2 : period;
  const bottom = i.toeNap - Math.max(0.5, 0.12 * height), half = Math.max(1.5, Math.min(9, 0.55 * height));
  const anchors: WallScene["anchors"] = [];
  if (hasAnchor(i)) for (let a = Math.min(i.anchor.spacingM, length) / 2; a < length; a += i.anchor.spacingM) anchors.push({ alongM: a, levelNap: i.anchor.levelNap, angleDeg: i.anchor.angleDeg, lengthM: half * 0.9 });
  const posts: WallScene["posts"] = [];
  if (kind === "posts") for (let a = period / 2; a < length + front; a += period) posts.push({ alongM: a, shape: i.posts.shape, sizeM: i.posts.sizeMm / 1000 });
  return {
    construction: kind, halfWidthM: half, lengthM: length, frontM: front, topNap: Math.max(i.wallTopNap, s.high.surfaceNap), bottomNap: bottom, wallTopNap: i.wallTopNap, toeNap: i.toeNap,
    wallHeightM: sec.depthM, plates: kind === "sheet-pile" && sec.profile ? profilePlan(sec.profile, length + front) : kind === "plank" ? plankPlan(sec.depthM, length + front) : [],
    posts, boards: kind === "posts" ? { thicknessM: i.posts.boardMm / 1000, bottomNap: i.posts.boardBottomNap } : null,
    waling: kind === "plank" && hasAnchor(i) ? { levelNap: i.anchor.levelNap, sizeM: Math.max(0.08, 2 * sec.depthM) } : null,
    high: { surfaceNap: s.high.surfaceNap, waterNap: s.high.waterNap, layers: sceneLayers(s.high, bottom) },
    low: { surfaceNap: s.low.surfaceNap, waterNap: s.low.waterNap, originalNap: i.groundLowNap, layers: sceneLayers(s.low, bottom) },
    surchargeKpa: s.high.surchargeKpa, anchors, profileName: sec.label,
  };
}

/** Ronde schaalwaarden (1, 2, 2,5 of 5 × 10ⁿ) die het bereik inclusief 0 dekken. */
export function niceTicks(lo: number, hi: number, target = 4): number[] {
  const a = Math.min(0, lo), b = Math.max(0, hi), span = b - a || 1;
  const raw = span / target, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((v) => v >= raw - 1e-12)!;
  const first = Math.floor(a / step + 1e-9) * step, last = Math.ceil(b / step - 1e-9) * step;
  return Array.from({ length: Math.round((last - first) / step) + 1 }, (_, k) => +(first + k * step).toPrecision(12));
}
