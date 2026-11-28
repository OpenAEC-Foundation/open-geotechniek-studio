// Koppeling tussen een berekening en haar plaats in het project: welke maten en niveaus uit de invoer van de
// module komen. Alleen lezen; de modules zelf blijven ongewijzigd. Ontbreekt een veld (oudere invoer), dan valt
// de functie terug op wat de module zelf aanneemt, of geeft null.
import { resolvePileType } from "../calc/modules/pile-bearing-capacity/catalog";
import type { PileInput } from "../calc/modules/pile-bearing-capacity/types";
import { getTensionPileType } from "../calc/modules/tension-pile/catalog";
import type { TensionInput } from "../calc/modules/tension-pile/compute";
import type { LateralInput } from "../calc/modules/laterally-loaded-pile/compute";
import type { SpreadInput } from "../calc/modules/spread-foundation/compute";
import { DEFAULT_TIE, anchorAngle, normalizeWallInput, wallSupports, type AnchorKind, type WallInput } from "../calc/modules/sheet-pile-wall/compute";
import { anchorWallProfile, rodSection, tieGeometry, type TieGeometry } from "../calc/modules/sheet-pile-wall/tie-anchorage";
import { findSheetPile, type SheetPileProfile } from "../calc/library/sheetPiles";

export interface PileSpec {
  topNap: number;
  toeNap: number;
  /** Diameter (rond) of zijde (vierkant) [m]. */
  sizeM: number;
  circular: boolean;
  /** Het kopniveau staat niet in de berekening en is aangenomen (zoals de module zelf doet). */
  topAssumed?: boolean;
}

export interface WallSupportSpec {
  kind: AnchorKind;
  levelNap: number;
  /** Hoek met de horizontaal, omlaag positief [°]. */
  angleDeg: number;
  spacingM: number;
  /** Lengte van het anker [m]: bij een groutanker vrije lengte plus groutlichaam, bij een ankerstaaf met verankering de staaf; anders null (schematisch). */
  lengthM: number | null;
  groutM: number;
  /** Ankerstaaf met opgegeven verankering: staaf en schot, paal of plaat in de doorsnede (x achter de wand, NAP); anders null. */
  tie: TieGeometry | null;
  /** Diameter van de ankerstaaf [m]. */
  rodDiameterM: number;
  /** Damwandprofiel van een ankerschot. */
  anchorProfile: SheetPileProfile | null;
}

export interface WallSpec {
  construction: "sheet-pile" | "plank" | "posts";
  topNap: number;
  toeNap: number;
  /** Diepste ontgraving over de bouwfasen [m NAP]. */
  excavationNap: number;
  groundHighNap: number;
  /** Dikte van de wand dwars op de lijn [m] (schematisch bij een damwand zonder contour). */
  thicknessM: number;
  profile: SheetPileProfile | null;
  profileName: string;
  supports: WallSupportSpec[];
}

export interface FootingSpec { shape: "strip" | "pad"; widthM: number; lengthM: number | null; foundationNap: number; groundNap: number }

export type CalcSpec = { kind: "piles"; pile: PileSpec } | { kind: "wall"; wall: WallSpec } | { kind: "footing"; footing: FootingSpec };

const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function pileSpec(moduleId: string, input: unknown): PileSpec | null {
  if (moduleId === "pile-bearing-capacity") {
    const i = input as PileInput;
    if (!fin(i.pileTopNap) || !fin(i.pileToeNap) || !fin(i.diameterMm)) return null;
    let circular = true;
    try { circular = resolvePileType(i)?.isCircular ?? true; } catch { /* onbekend paaltype: rond */ }
    return { topNap: i.pileTopNap, toeNap: i.pileToeNap, sizeM: i.diameterMm / 1000, circular };
  }
  if (moduleId === "tension-pile") {
    const i = input as TensionInput;
    if (!fin(i.pileTopNap) || !fin(i.pileToeNap) || !fin(i.sizeMm)) return null;
    return { topNap: i.pileTopNap, toeNap: i.pileToeNap, sizeM: i.sizeMm / 1000, circular: getTensionPileType(i.pileTypeId)?.isCircular ?? true };
  }
  if (moduleId === "laterally-loaded-pile") {
    const i = input as LateralInput;
    if (!fin(i.lengthM) || !i.section || !fin(i.section.diameterMm)) return null;
    // De module rekent vanaf de kop en neemt NAP 0 aan als het kopniveau ontbreekt.
    const top = fin(i.headNap) ? i.headNap : 0;
    return { topNap: top, toeNap: top - i.lengthM, sizeM: i.section.diameterMm / 1000, circular: i.section.kind !== "concrete-square" && i.section.kind !== "sheet-pile", ...(fin(i.headNap) ? {} : { topAssumed: true }) };
  }
  return null;
}

function wallSpec(input: unknown): WallSpec | null {
  const raw = input as WallInput;
  if (!raw || !fin(raw.wallTopNap) || !fin(raw.toeNap) || !raw.anchor) return null;
  let i: WallInput;
  try { i = normalizeWallInput(raw); } catch { return null; }
  const construction = i.construction ?? "sheet-pile";
  const profile = construction === "sheet-pile" ? (findSheetPile(i.profileId, i.manufacturer) ?? findSheetPile(i.profileId) ?? null) : null;
  const thicknessM = construction === "plank" ? (i.plankMm ?? 50) / 1000
    : construction === "posts" ? (i.posts?.sizeMm ?? 140) / 1000
    : Math.max(0.01, (profile?.wallHeightMm ?? 400) / 1000);
  const phases = (i.phases ?? []).map((p) => p.excavationNap).filter(fin);
  const excavationNap = Math.min(fin(i.excavationNap) ? i.excavationNap : i.wallTopNap, ...phases);
  let supports: WallSupportSpec[] = [];
  try {
    supports = wallSupports(i).map((a) => {
      let tie: TieGeometry | null = null;
      try { tie = a.kind === "tie" && a.anchorage && a.anchorage.lengthM > 0 ? tieGeometry(a.levelNap, a.angleDeg, a.anchorage) : null; } catch { tie = null; }
      return {
        kind: a.kind ?? "tie", levelNap: a.levelNap, angleDeg: anchorAngle(a), spacingM: fin(a.spacingM) && a.spacingM > 0 ? a.spacingM : 2,
        lengthM: a.kind === "grout" && a.grout ? a.grout.freeLengthM + a.grout.groutLengthM : tie ? a.anchorage!.lengthM : null,
        groutM: a.kind === "grout" && a.grout ? a.grout.groutLengthM : 0,
        tie, rodDiameterM: rodSection({ ...DEFAULT_TIE, ...a.tie }).diameterMm / 1000, anchorProfile: tie && a.anchorage ? anchorWallProfile(a.anchorage) : null,
      };
    }).filter((a) => fin(a.levelNap));
  } catch { supports = []; }
  return {
    construction, topNap: i.wallTopNap, toeNap: i.toeNap, excavationNap,
    groundHighNap: fin(i.groundHighNap) ? i.groundHighNap : i.wallTopNap, thicknessM, profile,
    profileName: construction === "sheet-pile" ? (profile?.id ?? i.profileId ?? "") : construction, supports,
  };
}

function footingSpec(input: unknown): FootingSpec | null {
  const i = input as SpreadInput;
  if (!i || !fin(i.widthM) || !fin(i.foundationNap)) return null;
  const shape = i.shape === "strip" ? "strip" : "pad";
  return { shape, widthM: i.widthM, lengthM: shape === "pad" && fin(i.lengthM) ? i.lengthM : null, foundationNap: i.foundationNap, groundNap: fin(i.groundNap) ? i.groundNap : i.foundationNap };
}

/** Maten en niveaus van een berekening voor de plaatsing; null als de invoer onvolledig is of de module niet geplaatst wordt. */
export function calcSpec(calc: { moduleId: string; input: unknown }): CalcSpec | null {
  if (!calc.input || typeof calc.input !== "object") return null;
  try {
    const pile = pileSpec(calc.moduleId, calc.input);
    if (pile) return pile.topNap > pile.toeNap ? { kind: "piles", pile } : null;
    if (calc.moduleId === "sheet-pile-wall") { const wall = wallSpec(calc.input); return wall && wall.topNap > wall.toeNap ? { kind: "wall", wall } : null; }
    if (calc.moduleId === "spread-foundation") { const footing = footingSpec(calc.input); return footing ? { kind: "footing", footing } : null; }
  } catch { /* onvolledige invoer */ }
  return null;
}

/** Sondering van de berekening (voor "bij de sondering van de berekening"). */
export function calcCptId(calc: { input: unknown }): string | null {
  const id = (calc.input as { cptId?: unknown } | null)?.cptId;
  return typeof id === "string" && id ? id : null;
}
