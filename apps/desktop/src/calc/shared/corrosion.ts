// Afroesting van stalen doorsneden: het dikteverlies per zijde en de doorsnede die daarna overblijft. Gedeeld door de
// damwandmodule en de horizontaal belaste paal.
//
// Dikteverlies per blootgestelde zijde volgens NEN-EN 1993-5 tabel 4-1 (in grond) en tabel 4-2 (in zoet water en
// zeewater), de aanbevolen waarden, per ontwerplevensduur. Uit kennis van de norm overgenomen en niet tegen de
// normtekst of de Nederlandse bijlage gelegd (zie VERIFICATIE.md van de damwand). Een eigen waarde kan altijd.
//
// Doorsnede na afroesting:
// - damwandprofiel met een exacte contour (sheet-pile-contours.json): elke rand van de omtrek schuift loodrecht naar
//   binnen over het dikteverlies van de zijde waar hij naar toe kijkt (de normaal naar buiten wijst naar +y: zijde 1,
//   naar −y: zijde 2; een rand precies loodrecht op de as blijft staan). A, I, W_el en W_pl volgen uit de verkleinde
//   omtrek, als verhouding tot de onverkleinde contour toegepast op de waarden van de profieltabel.
// - zonder exacte contour een benadering: I, W_el en W_pl evenredig met de flensdikte, (t − Δ) / t, en A evenredig
//   met de gemiddelde plaatdikte, (t_m − Δ) / t_m met t_m = (t + s) / 2; Δ is het verlies van beide zijden samen.
// - de doorsnedeklasse (NEN-EN 1993-5 tabel 5-1, b / (t_f · ε)) wordt bepaald met de verkleinde flensdikte. De
//   bibliotheek geeft b niet; waar b / t_f ligt, volgt uit de klassen van de catalogus bij de verschillende staalsoorten.
//   Blijft er na afroesting meer dan één klasse mogelijk, dan geldt de hoogste, tenzij de gebruiker een klasse kiest.
//   De klasse wordt nooit gunstiger dan die van de catalogus.
// - stalen buis: aan de buitenzijde wordt de diameter 2 Δ_buiten kleiner, de wand Δ_buiten + Δ_binnen dunner.
import { ct } from "../i18n";
import { findGrade, type SheetPileProfile } from "../library/sheetPiles";
import { drawingContour, polygonModuli, sectionPolygons, type Pt } from "../library/sheetPileContour";

export const DESIGN_LIVES = [5, 25, 50, 75, 100] as const;
export type DesignLife = (typeof DESIGN_LIVES)[number];

export type CorrosionEnvironmentId =
  | "soil-undisturbed" | "soil-polluted" | "soil-aggressive"
  | "fill-loose" | "fill-compacted" | "fill-aggressive-loose" | "fill-aggressive-compacted"
  | "fresh-water" | "fresh-water-polluted" | "sea-splash" | "sea-immersion";

export interface CorrosionEnvironment {
  id: CorrosionEnvironmentId;
  /** Tabel van NEN-EN 1993-5. */
  table: "4-1" | "4-2";
  /** Nederlandse omschrijving (vertaling onder calc:corrosion.env.<id>). */
  nl: string;
  /** Dikteverlies [mm] per zijde bij 5, 25, 50, 75 en 100 jaar; null = niet opgenomen, eigen waarde invullen. */
  lossMm: ReadonlyArray<number | null>;
  /** Afgeleid uit de opmerking bij de tabel (verdichte aanvulling: de helft) in plaats van een eigen rij. */
  derived?: boolean;
}

/**
 * NEN-EN 1993-5 tabel 4-1 (grond, met of zonder grondwater) en tabel 4-2 (zoet water en zeewater), aanbevolen waarden
 * per zijde. Kolommen: ontwerplevensduur 5, 25, 50, 75 en 100 jaar. Verdichte aanvulling: de waarde van de niet
 * verdichte aanvulling gedeeld door twee, volgens de opmerking bij tabel 4-1.
 */
export const CORROSION_ENVIRONMENTS: readonly CorrosionEnvironment[] = [
  { id: "soil-undisturbed", table: "4-1", nl: "Onverstoorde natuurlijke grond (zand, silt, klei)", lossMm: [0, 0.3, 0.6, 0.9, 1.2] },
  { id: "soil-polluted", table: "4-1", nl: "Verontreinigde natuurlijke grond en industrieterrein", lossMm: [0.15, 0.75, 1.5, 2.25, 3.0] },
  { id: "soil-aggressive", table: "4-1", nl: "Agressieve natuurlijke grond (moeras, veen)", lossMm: [0.2, 1.0, 1.75, 2.5, 3.25] },
  { id: "fill-loose", table: "4-1", nl: "Aanvulling, niet verdicht, niet agressief", lossMm: [0.18, 0.7, 1.2, 1.7, 2.2] },
  { id: "fill-compacted", table: "4-1", nl: "Aanvulling, verdicht, niet agressief", lossMm: [0.09, 0.35, 0.6, 0.85, 1.1], derived: true },
  { id: "fill-aggressive-loose", table: "4-1", nl: "Aanvulling, niet verdicht, agressief (as, slakken)", lossMm: [0.5, 2.0, 3.25, 4.5, 5.75] },
  { id: "fill-aggressive-compacted", table: "4-1", nl: "Aanvulling, verdicht, agressief (as, slakken)", lossMm: [0.25, 1.0, 1.625, 2.25, 2.875], derived: true },
  { id: "fresh-water", table: "4-2", nl: "Zoet water (rivier, kanaal), zone van sterke aantasting (waterlijn)", lossMm: [0.15, 0.55, 0.9, 1.15, 1.4] },
  { id: "fresh-water-polluted", table: "4-2", nl: "Zeer verontreinigd zoet water, zone van sterke aantasting (waterlijn)", lossMm: [0.3, 1.3, 2.3, 3.3, 4.3] },
  { id: "sea-splash", table: "4-2", nl: "Zeewater, gematigd klimaat, zone van sterke aantasting (laagwater en spatzone)", lossMm: [0.55, 1.9, 3.75, 5.6, 7.5] },
  { id: "sea-immersion", table: "4-2", nl: "Zeewater, gematigd klimaat, blijvend onder water of getijdezone", lossMm: [0.25, 0.9, 1.75, 2.6, 3.5] },
];

/** Afroesting van één zijde: geen, uit de tabel of een eigen waarde. */
export interface CorrosionFace {
  source: "none" | "table" | "custom";
  environment: CorrosionEnvironmentId;
  lifeYears: DesignLife;
  /** Eigen dikteverlies [mm]. */
  customMm: number;
}
export const NO_CORROSION: CorrosionFace = { source: "none", environment: "soil-undisturbed", lifeYears: 50, customMm: 0 };

export const environmentOf = (id: CorrosionEnvironmentId): CorrosionEnvironment | undefined => CORROSION_ENVIRONMENTS.find((e) => e.id === id);

/** Tabelwaarde [mm]; null als de cel leeg is of de combinatie onbekend. */
export function tableLossMm(id: CorrosionEnvironmentId, life: number): number | null {
  const env = environmentOf(id), k = DESIGN_LIVES.indexOf(life as DesignLife);
  return env && k >= 0 ? env.lossMm[k] ?? null : null;
}

/** Dikteverlies van een zijde [mm]; null als de tabel geen waarde heeft of de eigen waarde ongeldig is. */
export function faceLossMm(face: CorrosionFace | undefined): number | null {
  if (!face || face.source === "none") return 0;
  if (face.source === "custom") return Number.isFinite(face.customMm) && face.customMm >= 0 ? face.customMm : null;
  return tableLossMm(face.environment, face.lifeYears);
}

/** Herkomst van het dikteverlies voor de uitdraai, in het Nederlands. */
export function faceSourceText(face: CorrosionFace | undefined): string {
  if (!face || face.source === "none") return "geen afroesting";
  if (face.source === "custom") return "eigen waarde";
  const env = environmentOf(face.environment);
  return `NEN-EN 1993-5 tabel ${env?.table ?? "?"}, ${env?.nl.toLowerCase() ?? face.environment}, ${face.lifeYears} jaar${env?.derived ? " (helft van niet verdicht)" : ""}`;
}

/** Leest het dikteverlies van een zijde of geeft een melding als het ontbreekt. */
export function requireLoss(face: CorrosionFace | undefined, where: string): number | string {
  const v = faceLossMm(face);
  if (v === null) return ct("calc", "corrosion.errors.missing", "Afroesting {{where}}: de tabel heeft voor deze keuze geen waarde. Vul een eigen dikteverlies in.", { where });
  return v;
}

// ─── Omtrek naar binnen verschuiven ───────────────────────────────

const signedArea = (poly: Pt[]) => poly.reduce((s, p, k) => { const q = poly[(k + 1) % poly.length]; return s + (p.x * q.y - q.x * p.y) / 2; }, 0);

/**
 * Verschuift een gesloten omtrek naar binnen: elke rand loodrecht over het verlies van de zijde waar zijn normaal
 * naar buiten naar toe wijst (+y: `lossPos`, −y: `lossNeg`). De hoekpunten zijn de snijpunten van de verschoven
 * randen; bij bijna evenwijdige randen of een te lange verstek het gemiddelde van de twee verschoven punten.
 */
export function offsetPolygon(input: Pt[], lossPos: number, lossNeg: number): Pt[] {
  let poly = input.filter((p, k) => { const q = input[(k + 1) % input.length]; return Math.hypot(q.x - p.x, q.y - p.y) > 1e-9; });
  if (poly.length < 3 || (lossPos === 0 && lossNeg === 0)) return poly.map((p) => ({ ...p }));
  if (signedArea(poly) < 0) poly = [...poly].reverse();
  const n = poly.length, limit = 4 * Math.max(lossPos, lossNeg);
  // Per rand: richting, inwaartse normaal en verschuiving.
  const edges = poly.map((p, k) => {
    const q = poly[(k + 1) % n], len = Math.hypot(q.x - p.x, q.y - p.y), ux = (q.x - p.x) / len, uy = (q.y - p.y) / len;
    // Tegen de klok in ligt het binnengebied links: de normaal naar buiten is (uy, −ux). Een rand loodrecht op de as van
    // de wand (normaal langs de wand, bijvoorbeeld in een slot) kijkt naar geen van beide zijden en blijft staan.
    const outY = -ux, d = outY > 1e-6 ? lossPos : outY < -1e-6 ? lossNeg : 0;
    return { p, ux, uy, ix: -uy, iy: ux, d };
  });
  return poly.map((p, k) => {
    const a = edges[(k - 1 + n) % n], b = edges[k];
    const pa = { x: p.x + a.ix * a.d, y: p.y + a.iy * a.d }, pb = { x: p.x + b.ix * b.d, y: p.y + b.iy * b.d };
    const det = a.ux * b.uy - a.uy * b.ux;
    if (Math.abs(det) > 1e-6) {
      const s = ((pb.x - pa.x) * b.uy - (pb.y - pa.y) * b.ux) / det, x = { x: pa.x + s * a.ux, y: pa.y + s * a.uy };
      if (Math.hypot(x.x - p.x, x.y - p.y) <= limit) return x;
    }
    return { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
  });
}

// ─── Damwandprofiel ───────────────────────────────────────────────

/** Grenzen van b / (t_f · ε) voor klasse 2 en 3 (NEN-EN 1993-5 tabel 5-1). */
const CLASS_LIMITS: Record<"Z" | "U", [number, number]> = { Z: [45, 66], U: [37, 49] };

/** Doorsnedeklasse 2, 3 of 4 uit b / (t_f · ε); klasse 1 vraagt een aparte toets van de rotatiecapaciteit. */
export function sheetClassFromRatio(shape: "Z" | "U", ratio: number): 2 | 3 | 4 {
  const [c2, c3] = CLASS_LIMITS[shape];
  return ratio <= c2 + 1e-9 ? 2 : ratio <= c3 + 1e-9 ? 3 : 4;
}

/**
 * Bereik van b / t_f dat bij de klassen van de catalogus past, over alle staalsoorten; [0, ∞) als er niets uit volgt.
 * Klasse 1 en 2 vallen onder dezelfde grens.
 */
export function catalogRatioRange(p: Pick<SheetPileProfile, "shape" | "classes">): [number, number] {
  let lo = 0, hi = Infinity;
  if (p.shape !== "Z" && p.shape !== "U") return [lo, hi];
  const [c2, c3] = CLASS_LIMITS[p.shape];
  for (const [grade, cls] of Object.entries(p.classes ?? {})) {
    const g = findGrade(grade); if (!g) continue;
    const eps = Math.sqrt(235 / g.fyMPa);
    if (cls <= 2) hi = Math.min(hi, c2 * eps);
    else if (cls === 3) { lo = Math.max(lo, c2 * eps); hi = Math.min(hi, c3 * eps); }
    else lo = Math.max(lo, c3 * eps);
  }
  return lo <= hi ? [lo, hi] : [0, Infinity];
}

export interface CorrodedSheet {
  /** Het profiel na afroesting: t, s, h, A, I, W_el, W_pl, massa en klassen verkleind. Zonder verlies het origineel. */
  profile: SheetPileProfile;
  original: SheetPileProfile;
  /** Dikteverlies aan zijde 1 (+y in de contour) en zijde 2 (−y) [mm]. */
  lossPosMm: number;
  lossNegMm: number;
  /** contour: uit de exacte contour opnieuw gerekend; approx: benadering met de plaatdikten; none: geen verlies. */
  basis: "contour" | "approx" | "none";
  /**
   * Per staalsoort de doorsnedeklasse na afroesting die bij de klassen van de catalogus past: [laagste, hoogste]. Is
   * het bereik groter dan één klasse, dan is de klasse onzeker en geldt de hoogste, tenzij de gebruiker een klasse kiest.
   */
  classRange: Record<string, [number, number]>;
  /** Staalsoorten waarvan de klasse door de afroesting ongunstiger is geworden. */
  shiftedGrades: string[];
  /** Staalsoorten waarvan de klasse na afroesting onzeker is (bereik van twee klassen of meer). */
  uncertainGrades: string[];
  /** Verkleinde omtrekken per getekende strook (alleen bij een exacte contour), voor de tekening. */
  polygons?: Pt[][];
}

/**
 * Damwandprofiel na afroesting met `lossPosMm` aan zijde 1 (+y in de contour) en `lossNegMm` aan zijde 2. Zonder
 * verlies komt het profiel ongewijzigd terug. Gooit een fout als er geen plaatdikte is of het verlies te groot is.
 */
export function corrodedSheetPile(p: SheetPileProfile, lossPosMm: number, lossNegMm: number, classChoice?: 2 | 3 | 4): CorrodedSheet {
  const loss = lossPosMm + lossNegMm;
  if (!(lossPosMm >= 0 && lossNegMm >= 0)) throw new Error(ct("calc", "corrosion.errors.negative", "Het dikteverlies door afroesting kan niet negatief zijn."));
  if (loss === 0) return { profile: p, original: p, lossPosMm: 0, lossNegMm: 0, basis: "none", classRange: {}, shiftedGrades: [], uncertainGrades: [] };
  const t = p.flangeMm ?? null, s = p.webMm ?? null;
  if (t === null || s === null) throw new Error(ct("calc", "corrosion.errors.noThickness", "De bibliotheek geeft voor dit profiel geen flens- en lijfdikte; de afroesting kan niet worden verwerkt."));
  if (!(loss < 0.9 * Math.min(t, s))) throw new Error(ct("calc", "corrosion.errors.tooLarge", "Het dikteverlies ({{loss}} mm) is bijna de hele plaatdikte ({{t}} mm): de doorsnede is daarmee niet meer te toetsen.", { loss: loss.toFixed(2).replace(".", ","), t: Math.min(t, s).toFixed(1).replace(".", ",") }));
  const tRed = t - loss, sRed = s - loss;
  let area = p.areaCm2PerM, inertia = p.iCm4PerM, wel = p.welCm3PerM, wpl = p.wplCm3PerM, basis: CorrodedSheet["basis"], polygons: Pt[][] | undefined;
  if (drawingContour(p)) {
    const { polygons: polys, widthMm } = sectionPolygons(p, {});
    polygons = polys.map((poly) => offsetPolygon(poly, lossPosMm, lossNegMm));
    const before = polygonModuli(polys, widthMm), after = polygonModuli(polygons, widthMm);
    // Verhouding tot de contour zonder afroesting op de waarden van de tabel: de toets blijft op de tabel aansluiten.
    const scale = (v: number | null, a: number, b: number) => (v === null ? null : (v * b) / a);
    area = scale(p.areaCm2PerM, before.areaCm2PerM, after.areaCm2PerM); inertia = scale(p.iCm4PerM, before.iCm4PerM, after.iCm4PerM);
    wel = scale(p.welCm3PerM, before.welCm3PerM, after.welCm3PerM); wpl = scale(p.wplCm3PerM, before.wplCm3PerM, after.wplCm3PerM);
    basis = "contour";
  } else {
    const fw = tRed / t, fa = ((t + s) / 2 - loss) / ((t + s) / 2);
    area = p.areaCm2PerM === null ? null : p.areaCm2PerM * fa; inertia = p.iCm4PerM === null ? null : p.iCm4PerM * fw;
    wel = p.welCm3PerM === null ? null : p.welCm3PerM * fw; wpl = p.wplCm3PerM === null ? null : p.wplCm3PerM * fw;
    basis = "approx";
  }
  // Doorsnedeklasse met de verkleinde flensdikte: b / (t_f · ε) wordt t / (t − Δ) maal zo groot. Waar b / t_f ligt,
  // volgt uit de klassen van de catalogus over alle staalsoorten (catalogRatioRange); de grenzen van tabel 5-1 vallen
  // daarbij grotendeels weg, alleen hun onderlinge verhouding telt.
  const classes = p.classes ? { ...p.classes } : undefined, classRange: Record<string, [number, number]> = {}, shiftedGrades: string[] = [], uncertainGrades: string[] = [];
  if (classes && (p.shape === "Z" || p.shape === "U")) {
    const [lo, hi] = catalogRatioRange(p), grow = t / tRed;
    for (const [grade, cls] of Object.entries(classes)) {
      const gr = findGrade(grade); if (!gr) continue;
      const eps = Math.sqrt(235 / gr.fyMPa), floor = Math.max(cls, 2);
      const from = Math.max(floor, sheetClassFromRatio(p.shape, (lo * grow) / eps + 1e-9)), to = Math.max(floor, Number.isFinite(hi) ? sheetClassFromRatio(p.shape, (hi * grow) / eps) : 4);
      classRange[grade] = [from, to];
      if (to > from) uncertainGrades.push(grade);
      const next = classChoice !== undefined ? Math.min(to, Math.max(from, classChoice)) : to;
      if (next > floor) { classes[grade] = next; shiftedGrades.push(grade); }
    }
  }
  const factorA = area !== null && p.areaCm2PerM ? area / p.areaCm2PerM : 1;
  const profile: SheetPileProfile = {
    ...p, flangeMm: tRed, webMm: sRed, wallHeightMm: p.wallHeightMm === null ? null : p.wallHeightMm - loss,
    areaCm2PerM: area, iCm4PerM: inertia, welCm3PerM: wel, wplCm3PerM: wpl, massKgPerM2: p.massKgPerM2 === null ? null : p.massKgPerM2 * factorA, classes,
  };
  return { profile, original: p, lossPosMm, lossNegMm, basis, classRange, shiftedGrades, uncertainGrades, polygons };
}

// ─── Stalen buis ──────────────────────────────────────────────────

/** Buis na afroesting: de diameter 2·Δ_buiten kleiner, de wand Δ_buiten + Δ_binnen dunner. */
export function corrodedTube(diameterMm: number, wallMm: number, outerMm: number, innerMm: number): { diameterMm: number; wallMm: number } {
  if (!(outerMm >= 0 && innerMm >= 0)) throw new Error(ct("calc", "corrosion.errors.negative", "Het dikteverlies door afroesting kan niet negatief zijn."));
  const wall = wallMm - outerMm - innerMm;
  if (!(wall > 0.1 * wallMm)) throw new Error(ct("calc", "corrosion.errors.tooLarge", "Het dikteverlies ({{loss}} mm) is bijna de hele plaatdikte ({{t}} mm): de doorsnede is daarmee niet meer te toetsen.", { loss: (outerMm + innerMm).toFixed(2).replace(".", ","), t: wallMm.toFixed(1).replace(".", ",") }));
  return { diameterMm: diameterMm - 2 * outerMm, wallMm: wall };
}
