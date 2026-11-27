// Afroesting van de paaldoorsnede (stalen buis hol of gevuld, en damwandprofiel), met de gedeelde rekenkern in
// calc/shared/corrosion.ts. De afroesting geldt in de materiaaltoetsing en de N–M-toets; de buigstijfheid alleen
// als `reducedStiffness` aan staat. Betonpalen kennen geen afroesting.
//
// Buis: aan de buitenzijde wordt de diameter 2·Δ_buiten kleiner en de wand Δ_buiten dunner; een holle buis kan ook
// aan de binnenzijde roesten (2 kanten), dan wordt de wand ook Δ_binnen dunner. Bij een gevulde buis roest alleen de
// buitenzijde; de betonkern blijft gelijk.
// Damwandprofiel: 1 zijde (zijde 1) of 2 zijden, met de exacte contour waar die er is en anders de benadering.
import { ct } from '../../i18n';
import { findSheetPile } from '../../library/sheetPiles';
import { NO_CORROSION, corrodedSheetPile, corrodedTube, faceSourceText, requireLoss, type CorrodedSheet, type CorrosionFace } from '../../shared/corrosion';
import type { CheckRow } from './material-types';
import type { PileSection } from './section';

export interface PileCorrosion {
  /** Buitenzijde van de buis of zijde 1 van het damwandprofiel. */
  outer: CorrosionFace;
  /** Binnenzijde van een holle buis of zijde 2 van het profiel; telt alleen bij 2 kanten. */
  inner: CorrosionFace;
  sides: 1 | 2;
  /** Rekent de paal met de EI na afroesting; standaard met de oorspronkelijke. */
  reducedStiffness: boolean;
  /**
   * Afroesting van de kop tot dit niveau [m NAP] (b.v. tot 1 m in de waterbodem); leeg = de hele paal. Geldt voor de
   * EI na afroesting; de toetsen gebruiken de afgeroeste doorsnede over de hele paal (veilige kant).
   */
  zoneBottomNap?: number;
  /** Doorsnedeklasse van het damwandprofiel na afroesting als die onzeker is; leeg = de ongunstigste. */
  classChoice?: 2 | 3 | 4;
}
export const DEFAULT_PILE_CORROSION: PileCorrosion = { outer: NO_CORROSION, inner: NO_CORROSION, sides: 1, reducedStiffness: false };

export interface PileCorrosionInfo {
  kind: 'tube' | 'sheet';
  outerMm: number; innerMm: number; sides: 1 | 2; sourceOuter: string; sourceInner: string; reducedStiffness: boolean;
  /** Buis: diameter en wanddikte voor en na afroesting [mm]. */
  tube?: { diameterMm: number; wallMm: number; reducedDiameterMm: number; reducedWallMm: number };
  sheet?: CorrodedSheet;
  /** De doorsnede na afroesting, voor de toetsen. */
  section: PileSection;
  /** Afroesting tot een niveau: EI na afroesting van de kop tot diepte bottomM [m]; daaronder de oorspronkelijke EI. */
  stiffnessZone?: { bottomM: number; eiKnM2: number };
}

/** Doorsnede na afroesting; null zonder afroesting of bij beton. Gooit een fout bij een ontbrekende tabelwaarde. */
export function corrodePile(section: PileSection, raw: PileCorrosion | undefined): PileCorrosionInfo | null {
  if (!raw) return null;
  const c = { ...DEFAULT_PILE_CORROSION, ...raw }, kind = section.kind;
  if (kind !== 'steel-tube' && kind !== 'filled-tube' && kind !== 'sheet-pile') return null;
  // Een gevulde buis roest alleen aan de buitenzijde.
  const twoSides = c.sides === 2 && kind !== 'filled-tube';
  const sheet = kind === 'sheet-pile';
  const out = requireLoss(c.outer, sheet ? ct('calcLateral', 'corrosion.side1', 'zijde 1') : ct('calcLateral', 'corrosion.outer', 'buitenzijde'));
  const inn = twoSides ? requireLoss(c.inner, sheet ? ct('calcLateral', 'corrosion.side2', 'zijde 2') : ct('calcLateral', 'corrosion.inner', 'binnenzijde')) : 0;
  if (typeof out === 'string') throw new Error(out);
  if (typeof inn === 'string') throw new Error(inn);
  if (out === 0 && inn === 0) return null;
  const base = { outerMm: out, innerMm: inn, sides: twoSides ? 2 as const : 1 as const, sourceOuter: faceSourceText(c.outer), sourceInner: twoSides ? faceSourceText(c.inner) : '', reducedStiffness: c.reducedStiffness };
  if (sheet) {
    const cfg = section.sheet, profile = cfg ? findSheetPile(cfg.profileId, cfg.manufacturer) : undefined;
    if (!cfg || !profile) throw new Error(ct('calcLateral', 'errors.sheetUnknown', 'Kies een damwandprofiel en een staalsoort uit de bibliotheek.'));
    const corroded = corrodedSheetPile(profile, out, inn, c.classChoice);
    return { kind: 'sheet', ...base, sheet: corroded, section: { ...section, sheet: { ...cfg, profileOverride: corroded.profile } } };
  }
  const r = corrodedTube(section.diameterMm, section.wallMm, out, inn);
  return { kind: 'tube', ...base, tube: { diameterMm: section.diameterMm, wallMm: section.wallMm, reducedDiameterMm: r.diameterMm, reducedWallMm: r.wallMm }, section: { ...section, diameterMm: r.diameterMm, wallMm: r.wallMm } };
}

/** Rij ter informatie bovenaan de materiaaltoetsing: wat de afroesting met de doorsnede doet. */
export function corrosionRow(info: PileCorrosionInfo): CheckRow {
  const steps = info.kind === 'tube' && info.tube ? [
    { s: 'Δ_buiten', v: info.outerMm, u: 'mm', d: 2 }, ...(info.sides === 2 ? [{ s: 'Δ_binnen', v: info.innerMm, u: 'mm', d: 2 }] : []),
    { s: 'D', v: info.tube.diameterMm, u: 'mm', d: 1 }, { s: 'D_red', f: 'D − 2 Δ_buiten', v: info.tube.reducedDiameterMm, u: 'mm', d: 1 },
    { s: 't', v: info.tube.wallMm, u: 'mm', d: 2 }, { s: 't_red', f: info.sides === 2 ? 't − Δ_buiten − Δ_binnen' : 't − Δ_buiten', v: info.tube.reducedWallMm, u: 'mm', d: 2 },
  ] : info.sheet ? [
    { s: 'Δ_1', v: info.outerMm, u: 'mm', d: 2 }, ...(info.sides === 2 ? [{ s: 'Δ_2', v: info.innerMm, u: 'mm', d: 2 }] : []),
    { s: 't_f,red', f: 't_f − Δ_1 − Δ_2', v: info.sheet.profile.flangeMm ?? 0, u: 'mm', d: 2 }, { s: 't_w,red', f: 't_w − Δ_1 − Δ_2', v: info.sheet.profile.webMm ?? 0, u: 'mm', d: 2 },
    { s: 'A_red', v: info.sheet.profile.areaCm2PerM ?? 0, u: 'cm²/m', d: 1 }, { s: 'W_el,red', v: info.sheet.profile.welCm3PerM ?? 0, u: 'cm³/m', d: 0 }, { s: 'W_pl,red', v: info.sheet.profile.wplCm3PerM ?? 0, u: 'cm³/m', d: 0 },
  ] : [];
  return { id: 'corrosion', label: 'Afroesting', article: 'NEN-EN 1993-5 tabel 4-1, 4-2', uc: null, status: 'info', steps,
    note: info.kind === 'tube'
      ? { key: 'corrosionTube', nl: 'Getoetst met de doorsnede na afroesting, ook de doorsnedeklasse en D/t. {{stiffness}}', vars: { stiffness: info.reducedStiffness ? ct('calcLateral', 'corrosion.eiReduced', 'De paal is gerekend met EI na afroesting.') : ct('calcLateral', 'corrosion.eiOriginal', 'De paal is gerekend met de EI zonder afroesting.') } }
      : { key: 'corrosionSheet', nl: 'Getoetst met het profiel na afroesting ({{basis}}), met de doorsnedeklasse bij de verkleinde flensdikte. {{stiffness}}', vars: { basis: info.sheet?.basis === 'contour' ? ct('calcLateral', 'corrosion.basisContour', 'uit de exacte contour') : ct('calcLateral', 'corrosion.basisApprox', 'benadering met de plaatdikten'), stiffness: info.reducedStiffness ? ct('calcLateral', 'corrosion.eiReduced', 'De paal is gerekend met EI na afroesting.') : ct('calcLateral', 'corrosion.eiOriginal', 'De paal is gerekend met de EI zonder afroesting.') } } };
}
