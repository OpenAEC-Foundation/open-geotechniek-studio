// Plaats van een berekening in het project: waar de palen, de damwand of de fundering in RD liggen.
// De hoogtes (paalkop, paalpunt, bovenkant en teen van de wand) komen uit de berekening zelf; hier staat
// alleen de ligging in plan. Bewaard bij de berekening (veld `placement`); ontbreekt het, dan is de
// berekening niet geplaatst (oude projecten).

/** Punt in RD (EPSG:28992) [m]. */
export interface RdXY { x: number; y: number }

/** Eén paal: positie in RD, eventueel overgenomen van een sondering. */
export interface PilePosition extends RdXY { id: string; label?: string; cptId?: string }

export interface PilePlacement { kind: "piles"; positions: PilePosition[] }

/**
 * Damwand als lijn of gesloten veelhoek (bouwkuip). `excavation` is de kant van de ontgraving:
 * bij een gesloten veelhoek binnen of buiten de kuip, bij een open lijn links of rechts in de tekenrichting.
 * `sideCalcIds[k]` is de berekening die voor zijde k (van punt k naar k + 1) geldt; leeg = deze berekening.
 */
export interface WallPlacement {
  kind: "wall";
  points: RdXY[];
  closed: boolean;
  excavation: "inside" | "outside" | "left" | "right";
  sideCalcIds?: Array<string | null>;
}

/** Strook of poer: middelpunt, draaiing van de lengteas t.o.v. de RD-x-as (tegen de klok in) en bij een strook de lengte. */
export interface FootingPlacement { kind: "footing"; x: number; y: number; angleDeg: number; lengthM?: number }

export type Placement = PilePlacement | WallPlacement | FootingPlacement;
export type PlacementKind = Placement["kind"];

/** Welke soort plaatsing bij een module hoort; null = deze module wordt niet geplaatst. */
export function placementKindFor(moduleId: string): PlacementKind | null {
  if (moduleId === "pile-bearing-capacity" || moduleId === "tension-pile" || moduleId === "laterally-loaded-pile") return "piles";
  if (moduleId === "sheet-pile-wall") return "wall";
  if (moduleId === "spread-foundation") return "footing";
  return null;
}

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const xy = (v: unknown): RdXY | null => {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  return num(r.x) && num(r.y) ? { x: r.x, y: r.y } : null;
};

/** Leest een bewaarde plaatsing; alles wat niet klopt valt weg, zodat een beschadigd bestand gewoon opent. */
export function parsePlacement(raw: unknown): Placement | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  if (r.kind === "piles" && Array.isArray(r.positions)) {
    const positions: PilePosition[] = [];
    r.positions.forEach((p, k) => {
      const q = xy(p);
      if (!q) return;
      const o = p as Record<string, unknown>;
      positions.push({ ...q, id: typeof o.id === "string" && o.id ? o.id : `P${k + 1}`, ...(typeof o.label === "string" && o.label ? { label: o.label } : {}), ...(typeof o.cptId === "string" && o.cptId ? { cptId: o.cptId } : {}) });
    });
    return { kind: "piles", positions };
  }
  if (r.kind === "wall" && Array.isArray(r.points)) {
    const points = r.points.map(xy).filter((p): p is RdXY => !!p);
    const closed = r.closed === true && points.length >= 3;
    const ex = r.excavation;
    const excavation: WallPlacement["excavation"] = closed
      ? (ex === "outside" ? "outside" : "inside")
      : (ex === "left" ? "left" : "right");
    const sides = Array.isArray(r.sideCalcIds) ? r.sideCalcIds.map((s) => (typeof s === "string" && s ? s : null)) : undefined;
    return { kind: "wall", points, closed, excavation, ...(sides && sides.some((s) => s) ? { sideCalcIds: sides } : {}) };
  }
  if (r.kind === "footing" && num(r.x) && num(r.y)) {
    return { kind: "footing", x: r.x, y: r.y, angleDeg: num(r.angleDeg) ? r.angleDeg : 0, ...(num(r.lengthM) && r.lengthM > 0 ? { lengthM: r.lengthM } : {}) };
  }
  return undefined;
}

/** Een plaatsing die iets in het model zet. */
export function hasGeometry(p: Placement | undefined): p is Placement {
  if (!p) return false;
  if (p.kind === "piles") return p.positions.length > 0;
  if (p.kind === "wall") return p.points.length >= 2;
  return Number.isFinite(p.x) && Number.isFinite(p.y);
}
