// Ankerstaaf met de verankering aan het einde: een ankerschot (korte damwand of ankerwand), een ankerpaal of een
// ankerplaat (betonblok). Zuivere functies: de doorsnede van de staaf, de ligging in de doorsnede voor de tekening en
// de 3D-weergave, en de controles van de ligging tegen de glijvlakken. Bronnen en handberekening: VERIFICATIE.md.
//
// Assen in de doorsnede: x is de afstand achter de wand naar de hoge zijde [m], z het niveau [m NAP]. De dikte van
// de wand telt niet mee (zoals bij het groutanker): de staaf begint op x = 0.
import { ct } from "../../i18n";
import { findSheetPile, type SheetPileProfile } from "../../library/sheetPiles";
import type { WallCheck } from "./compute";

const t = (key: string, nl: string, vars?: Record<string, unknown>) => ct("calcWall", key, nl, vars);
const rad = (deg: number) => (deg * Math.PI) / 180;
const n = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d).replace(".", ",") : "—");

export type TieAnchorageType = "wall" | "pile" | "plate";

/**
 * Verankering van een ankerstaaf. Alle maten in m, de paaldiameter in mm. Velden die bij het gekozen type niet horen
 * blijven bewaard, zodat wisselen van type de eerdere invoer niet weggooit.
 */
export interface TieAnchorage {
  type: TieAnchorageType;
  /** Lengte van de staaf van de wand tot de voorkant van de verankering, langs de staaf [m]. */
  lengthM: number;
  /** Ankerschot: bovenkant en onderkant [m NAP]; damwandprofiel uit de bibliotheek, of leeg voor een plaat met breedte en dikte per anker. */
  wallTopNap: number;
  wallBottomNap: number;
  wallProfileId: string;
  wallManufacturer?: string;
  wallWidthM: number;
  wallThicknessM: number;
  /** Ankerpaal: lengte langs de as [m], helling met de verticaal [°] (positief: de punt van de wand af) en diameter [mm]. */
  pileLengthM: number;
  pileRakeDeg: number;
  pileDiameterMm: number;
  /** Ankerplaat of betonblok: breedte langs de wand, hoogte en dikte [m]; het hart ligt op het einde van de staaf. */
  plateWidthM: number;
  plateHeightM: number;
  plateThicknessM: number;
}

/** Voorstel bij het kiezen van een type: lengte 1,3 × de wandhoogte, schot van 0,5 m boven tot 1,5 m onder de staaf. */
export function defaultAnchorage(type: TieAnchorageType, o: { levelNap: number; groundNap: number; toeNap: number; profileId?: string; manufacturer?: string }): TieAnchorage {
  const r = (v: number) => Math.round(v * 100) / 100, height = Math.max(1, o.groundNap - o.toeNap);
  return {
    type, lengthM: Math.max(4, Math.round(1.3 * height * 2) / 2),
    wallTopNap: r(Math.min(o.groundNap, o.levelNap + 0.5)), wallBottomNap: r(o.levelNap - 1.5), wallProfileId: o.profileId ?? "", wallManufacturer: o.manufacturer, wallWidthM: 1.5, wallThicknessM: 0.2,
    pileLengthM: Math.max(6, Math.round(height)), pileRakeDeg: 20, pileDiameterMm: 400,
    plateWidthM: 1.5, plateHeightM: 1, plateThicknessM: 0.3,
  };
}

/** Damwandprofiel van een ankerschot, of null voor een plaat. */
export const anchorWallProfile = (an: TieAnchorage): SheetPileProfile | null =>
  an.type === "wall" && an.wallProfileId ? findSheetPile(an.wallProfileId, an.wallManufacturer) ?? findSheetPile(an.wallProfileId) ?? null : null;

/** Dikte van de verankering dwars op de wand [m]: het profiel, de plaat of het blok, of de paaldiameter. */
export function anchorageThickness(an: TieAnchorage): number {
  if (an.type === "pile") return an.pileDiameterMm / 1000;
  if (an.type === "plate") return an.plateThicknessM;
  const p = anchorWallProfile(an);
  return p?.wallHeightMm ? p.wallHeightMm / 1000 : an.wallThicknessM;
}

// ─── Doorsnede van de staaf ──────────────────────────────────────

/** Soort staaf: eigen doorsneden (A_g en A_s ingevuld, de standaard), gladde staaf met gesneden draad, of opgestuikte draad. */
export type RodType = "custom" | "plain" | "upset";
export interface RodInput { rodType?: RodType; grossMm2: number; threadMm2: number; diameterMm?: number; threadDiameterMm?: number; pitchMm?: number }

/**
 * Spanningsdoorsnede van metrische schroefdraad: A_s = π/4 · (d − 0,9382 · P)² (NEN-EN ISO 898-1, het gemiddelde van
 * flank- en kerndiameter). Voorbeeld: M48 × 5 geeft 1473 mm².
 */
export const stressArea = (dMm: number, pitchMm: number): number => (Math.PI / 4) * (dMm - 0.9382 * pitchMm) ** 2;

/** Spoed van de grove draad (ISO 261) voor M20 tot en met M68; daarboven 6 mm, de spoed die ISO 261 voor die maten noemt. */
export function coarsePitch(dMm: number): number {
  const table: Array<[number, number]> = [[20, 2.5], [22, 2.5], [24, 3], [27, 3], [30, 3.5], [33, 3.5], [36, 4], [39, 4], [42, 4.5], [45, 4.5], [48, 5], [52, 5], [56, 5.5], [60, 5.5], [64, 6], [68, 6]];
  if (dMm < 20) return 2.5;
  const hit = table.find(([d]) => d >= dMm - 1e-9);
  return hit ? hit[1] : 6;
}

/** Bruto doorsnede, spanningsdoorsnede en de diameter van de schacht (voor de tekening) van een ankerstaaf. */
export function rodSection(r: RodInput): { grossMm2: number; threadMm2: number; diameterMm: number; threadDiameterMm: number | null; pitchMm: number | null } {
  const type = r.rodType ?? "custom";
  if (type === "custom" || !(r.diameterMm! > 0)) return { grossMm2: r.grossMm2, threadMm2: r.threadMm2, diameterMm: Math.sqrt((4 * r.grossMm2) / Math.PI), threadDiameterMm: null, pitchMm: null };
  const d = r.diameterMm!, thread = type === "upset" && r.threadDiameterMm! > 0 ? r.threadDiameterMm! : d, p = r.pitchMm! > 0 ? r.pitchMm! : coarsePitch(thread);
  return { grossMm2: (Math.PI * d * d) / 4, threadMm2: stressArea(thread, p), diameterMm: d, threadDiameterMm: thread, pitchMm: p };
}

/**
 * Staalsoorten voor de staaf met f_y en f_u volgens NEN-EN 1993-1-1 tabel 3.1, voor een dikte (diameter) tot 40 mm en
 * van 40 tot 80 mm. Boven 80 mm geeft die tabel niets: dan geldt de eigen invoer.
 */
export const TIE_GRADES: Array<{ id: string; thin: [number, number]; thick: [number, number] }> = [
  { id: "S235", thin: [235, 360], thick: [215, 360] },
  { id: "S355", thin: [355, 490], thick: [335, 470] },
  { id: "S460", thin: [460, 540], thick: [430, 530] },
];
export function tieGradeValues(id: string, diameterMm: number): { fyMPa: number; fuMPa: number } | null {
  const g = TIE_GRADES.find((x) => x.id === id);
  if (!g) return null;
  const [fy, fu] = diameterMm > 40 ? g.thick : g.thin;
  return { fyMPa: fy, fuMPa: fu };
}

// ─── Ligging in de doorsnede ─────────────────────────────────────

export interface XZ { x: number; z: number }

/** De staaf en de verankering in de doorsnede, voor de tekening en de 3D-weergave. */
export interface TieGeometry {
  type: TieAnchorageType;
  /** Begin van de staaf bij de wand en het einde achter de verankering (door het schot of de plaat, met de moer). */
  rodFrom: XZ;
  rodTo: XZ;
  /** Voorkant van de verankering waar de staaf binnenkomt: het punt van de liggingcontrole. */
  front: XZ;
  /** Omtrek van de verankering in de doorsnede (schot, plaat of paal). */
  body: XZ[];
  /** Dikte dwars op de wand en breedte langs de wand per anker [m]; null = doorgaand (damwandprofiel). */
  thicknessM: number;
  widthM: number | null;
  /** Bovenkant en onderkant van schot of plaat, of kop en punt van de paal. */
  topNap: number;
  bottomNap: number;
  /** Ankerpaal: kop en punt van de as. */
  pileHead: XZ | null;
  pileToe: XZ | null;
  /** Begin van het passieve glijvlak voor het schot of de plaat (onderkant voorzijde); null bij een paal. */
  passiveFrom: XZ | null;
  /** Damwandprofiel van het schot, als dat er een is. */
  profileId: string | null;
}

/** Staaf en verankering van een ankerstaaf op niveau `levelNap` onder hoek `angleDeg` (omlaag positief). */
export function tieGeometry(levelNap: number, angleDeg: number, an: TieAnchorage): TieGeometry {
  const a = rad(angleDeg), cos = Math.cos(a), sin = Math.sin(a), along = (l: number): XZ => ({ x: l * cos, z: levelNap - l * sin });
  const front = along(an.lengthM), th = anchorageThickness(an), nut = 0.15;
  if (an.type === "pile") {
    const d = an.pileDiameterMm / 1000, r = rad(an.pileRakeDeg), head = { x: front.x + d / 2, z: front.z + d / 2 };
    const toe = { x: head.x + an.pileLengthM * Math.sin(r), z: head.z - an.pileLengthM * Math.cos(r) };
    // Rechthoek langs de as: loodrecht erop een halve diameter naar elke kant.
    const ux = Math.cos(r) * (d / 2), uz = Math.sin(r) * (d / 2);
    return { type: "pile", rodFrom: along(0), rodTo: along(an.lengthM + d + nut), front, thicknessM: d, widthM: d, topNap: head.z, bottomNap: toe.z,
      body: [{ x: head.x - ux, z: head.z - uz }, { x: head.x + ux, z: head.z + uz }, { x: toe.x + ux, z: toe.z + uz }, { x: toe.x - ux, z: toe.z - uz }], pileHead: head, pileToe: toe, passiveFrom: null, profileId: null };
  }
  const top = an.type === "wall" ? an.wallTopNap : front.z + an.plateHeightM / 2, bottom = an.type === "wall" ? an.wallBottomNap : front.z - an.plateHeightM / 2;
  const profile = an.type === "wall" ? anchorWallProfile(an) : null;
  return { type: an.type, rodFrom: along(0), rodTo: along(an.lengthM + (th + nut) / cos), front, thicknessM: th, widthM: profile ? null : an.type === "wall" ? an.wallWidthM : an.plateWidthM, topNap: top, bottomNap: bottom,
    body: [{ x: front.x, z: top }, { x: front.x + th, z: top }, { x: front.x + th, z: bottom }, { x: front.x, z: bottom }], pileHead: null, pileToe: null, passiveFrom: { x: front.x, z: bottom }, profileId: profile?.id ?? null };
}

// ─── Controles van de ligging ────────────────────────────────────

/** Gemiddelde φ′ tussen twee niveaus, gewogen naar laagdikte; lagen van boven naar onder, de bovenste loopt door tot boven. */
export function averagePhi(layers: Array<{ topNap: number; phi: number }>, top: number, bottom: number): number {
  if (!(top > bottom)) return layers.length ? layerPhi(layers, top) : 0;
  const cuts = [top, ...layers.map((l) => l.topNap).filter((z) => z < top && z > bottom), bottom];
  let weighted = 0;
  for (let k = 1; k < cuts.length; k++) weighted += layerPhi(layers, (cuts[k - 1] + cuts[k]) / 2) * (cuts[k - 1] - cuts[k]);
  return weighted / (top - bottom);
}
function layerPhi(layers: Array<{ topNap: number; phi: number }>, nap: number): number {
  let found = layers[0];
  for (const l of layers) if (l.topNap >= nap) found = l;
  return found?.phi ?? 0;
}

/** Uitkomst van de liggingcontrole van één ankerstaaf, ook voor de tekening (glijvlakken) en de uitdraai. */
export interface TieLocation {
  id: string;
  type: TieAnchorageType;
  geometry: TieGeometry;
  /** Actief glijvlak van de wand vanaf de teen: hoek met de horizontaal en de gemiddelde φ′_d. */
  activeAngleDeg: number;
  phiActiveDeg: number;
  /** Afstand van het actieve glijvlak achter de wand op het niveau van de voorkant van de verankering, en de aanwezige afstand [m]. */
  activeXM: number;
  frontXM: number;
  /** Schot of plaat: passief glijvlak vanaf de onderkant, de benodigde en de aanwezige afstand tot de wand [m]. */
  passive: { angleDeg: number; phiDeg: number; requiredXM: number; surfaceNap: number } | null;
  passes: boolean;
}

export interface TieLocationArgs {
  id: string;
  levelNap: number;
  angleDeg: number;
  anchorage: TieAnchorage;
  toeNap: number;
  wallTopNap: number;
  /** Maaiveld aan de hoge zijde [m NAP] en de lagen van die zijde met φ′ als rekenwaarde. */
  surfaceNap: number;
  layers: Array<{ topNap: number; phi: number }>;
}

/**
 * Ligging van de verankering, met dezelfde vereenvoudiging als het groutanker: het actieve glijvlak van de wand loopt
 * vanaf de teen onder θ_a = 45° + φ′_gem;d / 2, met φ′ gemiddeld over de hoogte van de wand (aan de veilige kant ten
 * opzichte van het nulpunt van de belasting). De voorkant van de verankering op het niveau van de staaf ligt achter dat vlak.
 *
 * Bij een ankerschot of ankerplaat daarbij de gangbare grafische controle (CUR 166, ligging van het ankerscherm;
 * Terzaghi, 1943): het passieve glijvlak voor het schot, vanaf de onderkant onder θ_p = 45° − φ′_gem;d / 2 naar de wand
 * toe, snijdt het actieve glijvlak van de wand niet onder het maaiveld. Dat geeft x_schot ≥ (z_mv − z_teen) / tan θ_a +
 * (z_mv − z_onder) / tan θ_p, met φ′ voor het schot gemiddeld van het maaiveld tot de onderkant.
 */
export function tieLocation(o: TieLocationArgs, suffix = ""): { result: TieLocation; checks: WallCheck[]; warnings: string[] } {
  const g = tieGeometry(o.levelNap, o.angleDeg, o.anchorage), warnings: string[] = [];
  const top = Math.min(o.wallTopNap, o.surfaceNap), phiA = averagePhi(o.layers, top, o.toeNap), thetaA = 45 + phiA / 2, tanA = Math.tan(rad(thetaA));
  const activeX = Math.max(0, (g.front.z - o.toeNap) / tanA), frontX = g.front.x;
  const name = o.anchorage.type === "wall" ? t("tie.typeWall", "ankerschot") : o.anchorage.type === "pile" ? t("tie.typePile", "ankerpaal") : t("tie.typePlate", "ankerplaat");
  const checks: WallCheck[] = [{
    id: "tieSlip", label: t("tie.checks.slip.label", "ligging verankering") + suffix, title: t("tie.checks.slip.title", "Verankering buiten het actieve glijvlak") + suffix, article: "CUR 166",
    load: activeX, resistance: frontX, unit: "m", uc: frontX > 0 ? activeX / frontX : Infinity, passes: activeX <= frontX + 1e-9,
    steps: [
      { symbol: "θ_a", formula: "45° + φ′_gem;d / 2", filled: `45 + ${n(phiA)} / 2`, result: `${n(thetaA, 1)}°` },
      { symbol: "x_glij", formula: "(z_v − z_teen) / tan θ_a", filled: `(${n(g.front.z)} − (${n(o.toeNap)})) / tan ${n(thetaA, 1)}°`, result: `${n(activeX)} m` },
      { symbol: "x_v", formula: t("tie.steps.front", "L · cos α, voorkant van het {{name}}", { name }), filled: `${n(o.anchorage.lengthM)} · cos ${n(o.angleDeg, 1)}°`, result: `${n(frontX)} m` },
    ],
  }];
  let passive: TieLocation["passive"] = null;
  if (g.passiveFrom) {
    const zb = g.passiveFrom.z, phiP = averagePhi(o.layers, o.surfaceNap, zb), thetaP = 45 - phiP / 2, tanP = Math.tan(rad(thetaP));
    const required = (o.surfaceNap - o.toeNap) / tanA + Math.max(0, o.surfaceNap - zb) / tanP;
    passive = { angleDeg: thetaP, phiDeg: phiP, requiredXM: required, surfaceNap: o.surfaceNap };
    checks.push({
      id: "tieWedge", label: t("tie.checks.wedge.label", "glijvlakken schot") + suffix, title: t("tie.checks.wedge.title", "Passief glijvlak van het schot buiten het actieve glijvlak van de wand") + suffix, article: t("tie.checks.wedge.article", "CUR 166; Terzaghi (1943)"),
      load: required, resistance: frontX, unit: "m", uc: frontX > 0 ? required / frontX : Infinity, passes: required <= frontX + 1e-9,
      steps: [
        { symbol: "θ_p", formula: "45° − φ′_gem;d / 2", filled: `45 − ${n(phiP)} / 2`, result: `${n(thetaP, 1)}°` },
        { symbol: "x_min", formula: "(z_mv − z_teen) / tan θ_a + (z_mv − z_onder) / tan θ_p", filled: `(${n(o.surfaceNap)} − (${n(o.toeNap)})) / tan ${n(thetaA, 1)}° + (${n(o.surfaceNap)} − (${n(zb)})) / tan ${n(thetaP, 1)}°`, result: `${n(required)} m` },
        { symbol: "x_v", formula: t("tie.steps.frontShort", "afstand van de wand tot de voorkant"), result: `${n(frontX)} m` },
      ],
    });
  }
  const an = o.anchorage;
  if (an.type === "wall" && !(g.front.z <= an.wallTopNap + 1e-9 && g.front.z >= an.wallBottomNap - 1e-9)) warnings.push(t("tie.warnings.outside", "De staaf {{id}} komt buiten de hoogte van het ankerschot uit; controleer de lengte, de hoek en de onderkant en bovenkant van het schot.", { id: o.id }));
  if (g.topNap > o.surfaceNap + 1e-9) warnings.push(t("tie.warnings.aboveGround", "De verankering van {{id}} komt boven het maaiveld van de hoge zijde uit.", { id: o.id }));
  return { result: { id: o.id, type: an.type, geometry: g, activeAngleDeg: thetaA, phiActiveDeg: phiA, activeXM: activeX, frontXM: frontX, passive, passes: checks.every((c) => c.passes) }, checks, warnings };
}

/** Controle van de invoer van de verankering; een melding of null. */
export function validateAnchorage(an: TieAnchorage): string | null {
  const pos = (...v: number[]) => v.every((x) => Number.isFinite(x) && x > 0);
  if (!pos(an.lengthM)) return t("tie.errors.length", "Ankerstaaf: vul de lengte van de staaf tot de verankering in (groter dan 0).");
  if (an.type === "wall" && !(Number.isFinite(an.wallTopNap) && Number.isFinite(an.wallBottomNap) && an.wallTopNap > an.wallBottomNap && (an.wallProfileId || pos(an.wallWidthM, an.wallThicknessM))))
    return t("tie.errors.wall", "Ankerschot: de bovenkant ligt boven de onderkant; zonder profiel zijn breedte en dikte groter dan 0.");
  if (an.type === "pile" && !(pos(an.pileLengthM, an.pileDiameterMm) && Number.isFinite(an.pileRakeDeg) && Math.abs(an.pileRakeDeg) < 60)) return t("tie.errors.pile", "Ankerpaal: lengte en diameter groter dan 0, helling kleiner dan 60°.");
  if (an.type === "plate" && !pos(an.plateWidthM, an.plateHeightM, an.plateThicknessM)) return t("tie.errors.plate", "Ankerplaat: breedte, hoogte en dikte groter dan 0.");
  return null;
}
