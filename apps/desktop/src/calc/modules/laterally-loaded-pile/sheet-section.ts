// Damwandprofiel als doorsnede van de horizontaal belaste paal: een op buiging
// belast stalen profiel uit de profielbibliotheek (calc/library/sheetPiles).
// De bibliotheek geeft alle waarden per m doorgaande wand. De rekenbreedte is
// 1 m wand of de breedte van één plank; EI, W en A gaan daarmee evenredig.
//
// Weerstanden volgens NEN-EN 1993-5 art. 5.2.2 en 5.2.3 (uit kennis van de norm,
// niet tegen de normtekst gelegd; zie VERIFICATIE.md):
//   M_c,Rd = β_B · W_pl · f_y / γ_M0   (klasse 1 en 2)
//   M_c,Rd = β_B · W_el · f_y / γ_M0   (klasse 3)
//   V_pl,Rd = A_V · f_y / (√3 · γ_M0), A_V = t_w · (h − t_f) per lijf
//   Bij V_Ed > 0,5 V_pl,Rd: hier (1 − ρ) · M_c,Rd met ρ = (2 V_Ed / V_pl,Rd − 1)².
//     De norm reduceert alleen het lijfaandeel en heeft daarvoor de lijfhoek α
//     nodig; die staat niet in de bibliotheek. Reductie op de hele doorsnede is
//     de veilige kant.
//   N_pl,Rd = A · f_y / γ_M0
//   M_N,Rd: Z-profiel klasse 1-2: 1,11 · M_c,Rd · (1 − n) als n > 0,10
//           U-profiel klasse 1-2: 1,33 · M_c,Rd · (1 − n) als n > 0,25
//           klasse 3:             M_c,Rd · (1 − n)        als n > 0,10
//           hoedprofiel (niet in de norm genoemd): M_c,Rd · (1 − n), zonder drempel
// Buigstijfheid: β_D · E · I (art. 6.4).
import { ct } from '../../i18n';
import { SHEET_PILES, findGrade, findSheetPile, type SheetPileProfile } from '../../library/sheetPiles';
import { GAMMA_M0 } from './materials';

export interface SheetSection {
  profileId: string; manufacturer?: string;
  /** Staalsoort uit de bibliotheek, bv. S355GP. */
  grade: string;
  /** Rekenbreedte: 1 m doorgaande wand of één losse plank. */
  widthMode: 'wall' | 'single';
  /** Reductiefactoren voor schuifkrachtoverdracht in de sloten: β_B op W, β_D op I. */
  betaB: number; betaD: number;
  /** Profiel na afroesting (corrosion-section.ts); in plaats van het profiel uit de bibliotheek. */
  profileOverride?: SheetPileProfile;
}

export function defaultSheet(): SheetSection {
  const p = SHEET_PILES.find((x) => x.shape === 'Z' && !x.onRequest && x.iCm4PerM !== null && x.classes && x.webMm !== null) ?? SHEET_PILES[0];
  return { profileId: p.id, manufacturer: p.manufacturer, grade: 'S355GP', widthMode: 'wall', betaB: 1, betaD: 1 };
}

export interface SheetProps {
  profile: SheetPileProfile; grade: string; fyMpa: number; widthM: number; betaB: number; betaD: number;
  /** Doorsnedeklasse uit de catalogus bij deze staalsoort; null als de bibliotheek die niet geeft. */
  cls: number | null;
  plastic: boolean;
  /** Waarom elastisch is gerekend. */
  elasticReason: 'class3' | 'noWpl' | 'noClass' | null;
  /** Gebruikt weerstandsmoment [cm³/m] en de waarden over de rekenbreedte. */
  wCm3PerM: number; eiKnM2: number; areaMm2: number; mcRdKnM: number; nplRdKn: number;
  /** Afschuifoppervlak en -weerstand over de rekenbreedte; null als lijfdikte, hoogte of flensdikte ontbreekt. */
  avMm2: number | null; vplRdKn: number | null; websPerM: number | null;
}

export function sheetProps(cfg: SheetSection | undefined, eMpa: number): SheetProps {
  const profile = cfg ? cfg.profileOverride ?? findSheetPile(cfg.profileId, cfg.manufacturer) : undefined, grade = cfg ? findGrade(cfg.grade) : undefined;
  if (!cfg || !profile || !grade) throw new Error(ct('calcLateral', 'errors.sheetUnknown', 'Kies een damwandprofiel en een staalsoort uit de bibliotheek.'));
  if (profile.iCm4PerM === null || profile.welCm3PerM === null || profile.areaCm2PerM === null || profile.widthMm === null)
    throw new Error(ct('calcLateral', 'errors.sheetNoBending', 'Dit profiel heeft in de bibliotheek geen I, W of A en is niet op buiging te rekenen.'));
  if (![cfg.betaB, cfg.betaD, eMpa].every(Number.isFinite) || cfg.betaB <= 0 || cfg.betaB > 1 || cfg.betaD <= 0 || cfg.betaD > 1 || eMpa <= 0 || !['wall', 'single'].includes(cfg.widthMode))
    throw new Error(ct('calcLateral', 'errors.sheetBeta', 'β_B en β_D moeten groter dan 0 en hoogstens 1 zijn.'));
  const widthM = cfg.widthMode === 'wall' ? 1 : profile.widthMm / 1000, fy = grade.fyMPa;
  const cls = profile.classes?.[grade.grade] ?? null;
  const plastic = (cls === 1 || cls === 2) && profile.wplCm3PerM !== null;
  const elasticReason = plastic ? null : cls === null ? 'noClass' : cls >= 3 ? 'class3' : 'noWpl';
  const wCm3PerM = plastic ? profile.wplCm3PerM! : profile.welCm3PerM;
  // Lijven per m wand. Z: één lijf over de hoogte h per plankbreedte b. U: twee lijven per plank die elk
  // de halve wandhoogte overbruggen, samen t_w · (h − 2 t_f) per b. Hoedprofiel: twee lijven over h per plank.
  let avMm2: number | null = null, websPerM: number | null = null;
  if (profile.webMm !== null && profile.wallHeightMm !== null && profile.flangeMm !== null && profile.shape !== 'straight') {
    websPerM = (profile.shape === 'hat' ? 2 : 1) * 1000 / profile.widthMm;
    const projected = profile.wallHeightMm - (profile.shape === 'U' ? 2 : 1) * profile.flangeMm;
    avMm2 = profile.webMm * projected * websPerM * widthM;
  }
  return {
    profile, grade: grade.grade, fyMpa: fy, widthM, betaB: cfg.betaB, betaD: cfg.betaD, cls, plastic, elasticReason, wCm3PerM,
    // E [MPa] · I [cm⁴/m] · 1e4 = N·mm²/m → · 1e-9 = kNm²/m
    eiKnM2: cfg.betaD * eMpa * profile.iCm4PerM * 1e4 / 1e9 * widthM,
    areaMm2: profile.areaCm2PerM * 100 * widthM,
    mcRdKnM: cfg.betaB * wCm3PerM * 1e3 * fy / 1e6 / GAMMA_M0 * widthM,
    nplRdKn: profile.areaCm2PerM * 100 * fy / 1000 / GAMMA_M0 * widthM,
    avMm2, vplRdKn: avMm2 === null ? null : avMm2 * fy / Math.sqrt(3) / GAMMA_M0 / 1000, websPerM,
  };
}

/** Momentweerstand bij normaalkracht en dwarskracht (art. 5.2.2 en 5.2.3). */
export function sheetMoment(p: SheetProps, nEdKn: number, vEdKn: number) {
  const n = Math.abs(nEdKn) / p.nplRdKn, shape = p.profile.shape;
  const limit = shape === 'Z' ? .1 : shape === 'U' ? (p.plastic ? .25 : .1) : 0;
  const factor = !p.plastic ? 1 : shape === 'Z' ? 1.11 : shape === 'U' ? 1.33 : 1;
  const mN = n >= 1 ? 0 : n <= limit ? p.mcRdKnM : Math.min(p.mcRdKnM, factor * p.mcRdKnM * (1 - n));
  const v = Math.abs(vEdKn), rho = p.vplRdKn !== null && v > .5 * p.vplRdKn ? Math.min(1, (2 * v / p.vplRdKn - 1) ** 2) : 0;
  return { mRdKnM: (1 - rho) * mN, n, limit, factor, rho };
}
