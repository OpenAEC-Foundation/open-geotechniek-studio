// Varianten van de horizontaal belaste paal: bij dezelfde grond en belasting
// meerdere paalontwerpen naast elkaar (paaltype, maat, wand of wapening,
// sterkteklasse en paalpunt), met per variant het gewicht en de toetsen.
//
// Dit bestand gebruikt geen DOM en geen React, zodat het ook in de web worker
// van de optimalisatie draait (optimizer.worker.ts).
//
// Gewicht: uit de oppervlakken van sectionStiffness (section.ts), dus van
// dezelfde doorsnede als de toetsen. Dichtheden:
//   staal  ρ = 7850 kg/m³ (NEN-EN 1993-1-1 art. 3.2.6)
//   beton  ρ = 2400 kg/m³ (aangenomen; normaal beton ligt volgens NEN-EN 206
//          tussen 2000 en 2600 kg/m³), over het netto betonoppervlak
//          (zonder de staven).
// Langswapening loopt over de hele paallengte; beugels en spiraal tellen niet
// mee.
import { computeLateral, type LateralInput, type LateralResult } from './compute';
import { sectionStiffness, type PileSection, type SectionKind } from './section';
import type { MaterialInput } from './material-types';
import { CAST_IN_SITU, SYSTEM_KINDS } from './pile-link';
import { PILE_SYSTEMS, type PileSystemId } from '../pile-bearing-capacity/pile-systems';
import { findSheetPile } from '../../library/sheetPiles';
import { concreteClassOf, steelGradeOf } from './materials';
import { ct } from '../../i18n';

export const STEEL_DENSITY = 7850;
export const CONCRETE_DENSITY = 2400;

/** Wat een variant van de basisinvoer onderscheidt; grond en belasting blijven gelijk. */
export interface VariantDesign {
  pileSystemId?: string;
  section: PileSection;
  lengthM: number;
  springWidthM: number;
  material?: MaterialInput;
}
export interface LateralVariant {
  id: string; name: string; design: VariantDesign;
  /** Uit de optimalisatie, of door de gebruiker gemaakt. */
  origin?: 'manual' | 'optimizer';
}
export interface VariantsConfig {
  items: LateralVariant[];
  /** Blad "Varianten" in de uitdraai. */
  inReport?: boolean;
  /** Grens kopverplaatsing voor het oordeel in de vergelijking [mm]; leeg = geen grens. */
  maxDisplacementMm?: number;
  /** Laatste optimalisatie: instellingen en verloop. */
  optimizer?: import('./optimizer').OptimizerRecord;
}

/** Vertaalsleutel (onder input.kinds) en Nederlandse naam per doorsnede. */
export const KIND_KEYS: Record<SectionKind, [string, string]> = {
  'concrete-square': ['concreteSquare', 'Beton vierkant'], 'concrete-round': ['concreteRound', 'Beton rond'],
  'filled-tube': ['filledTube', 'Buis gevuld'], 'steel-tube': ['steelTube', 'Buis hol'], 'sheet-pile': ['sheetPile', 'Damwandprofiel'],
};

export interface PileMass {
  /** Buis of damwandprofiel [kg]. */
  profileKg: number;
  /** Langswapening [kg]. */
  rebarKg: number;
  /** Netto betonvolume [m³] en massa [kg]. */
  concreteM3: number; concreteKg: number;
  /** Staal: profiel + wapening [kg]. */
  steelKg: number;
  /** Totaal per paal [kg]. */
  totalKg: number;
}

/** Gewicht van één paal; NaN als de doorsnede ongeldig is. */
export function pileMass(section: PileSection, lengthM: number): PileMass {
  try {
    const s = sectionStiffness(section);
    const profileKg = s.steelAreaM2 * lengthM * STEEL_DENSITY, rebarKg = s.rebarAreaMm2 / 1e6 * lengthM * STEEL_DENSITY;
    const concreteM3 = s.concreteAreaM2 * lengthM, concreteKg = concreteM3 * CONCRETE_DENSITY;
    return { profileKg, rebarKg, concreteM3, concreteKg, steelKg: profileKg + rebarKg, totalKg: profileKg + rebarKg + concreteKg };
  } catch {
    return { profileKg: NaN, rebarKg: NaN, concreteM3: NaN, concreteKg: NaN, steelKg: NaN, totalKg: NaN };
  }
}

/** Paalbreedte voor de werkende breedte van de grondveren [m]. */
export function pileWidthM(section: PileSection): number {
  if (section.kind !== 'sheet-pile') return section.diameterMm / 1000;
  const cfg = section.sheet;
  return cfg?.widthMode === 'single' ? (findSheetPile(cfg.profileId, cfg.manufacturer)?.widthMm ?? 1000) / 1000 : 1;
}

export function designOf(input: LateralInput): VariantDesign {
  return structuredClone({ pileSystemId: input.pileSystemId, section: input.section, lengthM: input.lengthM, springWidthM: input.springWidthM, material: input.material });
}

/** Andere paallengte: lagen gaan mee, de onderste laag eindigt op de punt (zelfde regel als de paaltabel). */
export function withLength(input: LateralInput, L: number): LateralInput {
  if (!(L > 0) || L === input.lengthM) return input;
  const last = Math.max(...input.layers.map((l) => l.bottomM));
  const layers = input.layers.filter((l) => l.topM < L - 1e-9)
    .map((l) => ({ ...l, bottomM: Math.abs(l.bottomM - last) < 1e-9 ? L : Math.min(l.bottomM, L) }));
  return { ...input, lengthM: Math.round(L * 1000) / 1000, layers };
}

/** De basisinvoer met het ontwerp van een variant; de lijst varianten blijft staan. */
export function applyDesign(input: LateralInput, d: VariantDesign): LateralInput {
  const next: LateralInput = { ...input, section: structuredClone(d.section), springWidthM: d.springWidthM, material: d.material ? structuredClone(d.material) : undefined };
  if (d.pileSystemId) next.pileSystemId = d.pileSystemId; else delete next.pileSystemId;
  return withLength(next, d.lengthM);
}

/** Een paalsysteem dat bij de doorsnede past: het huidige als dat kan, anders het eerste met deze doorsnede. */
export function systemFor(kind: SectionKind, current?: string): PileSystemId | undefined {
  if (kind === 'sheet-pile') return undefined;
  const ids = PILE_SYSTEMS.map((p) => p.id);
  if (current && ids.includes(current as PileSystemId) && SYSTEM_KINDS[current as PileSystemId].includes(kind)) return current as PileSystemId;
  return kind === 'steel-tube' ? 'steel-tube-closed' : kind === 'filled-tube' ? 'screw-permanent-casing' : 'prefab-concrete';
}

/** Ander paalsysteem: de minimumwapening van een boorpaal volgt het systeem, zoals in het invoerblok. */
export function withSystem(d: VariantDesign, system: string | undefined): VariantDesign {
  if (system === d.pileSystemId) return d;
  const bored = !!system && CAST_IN_SITU.includes(system as PileSystemId);
  return { ...d, pileSystemId: system, material: { ...d.material, boredPile: bored || undefined } };
}

/** Korte omschrijving: Ø323,9×10 S355, □320 8Ø20 C35/45, AZ 18-800 S355GP. */
export function designLabel(d: VariantDesign): string {
  const s = d.section, mm = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',');
  if (s.kind === 'sheet-pile') return `${s.sheet?.profileId ?? '?'} ${s.sheet?.grade ?? ''}`.trim();
  const tube = s.kind === 'steel-tube' || s.kind === 'filled-tube';
  const size = s.kind === 'concrete-square' ? `□${mm(s.diameterMm)}` : `Ø${mm(s.diameterMm)}`;
  const parts = [tube ? `${size}×${mm(s.wallMm)}` : size];
  if (tube) parts.push(steelGradeOf(s.tubeFydMpa) || `fy ${mm(s.tubeFydMpa)}`);
  if (s.kind !== 'steel-tube') {
    parts.push(`${s.barCount}Ø${mm(s.barDiameterMm)}`);
    parts.push(concreteClassOf(s.fckMpa, s.fcdMpa) || `fck ${mm(s.fckMpa)}`);
  }
  return parts.join(' ');
}

export interface VariantOutcome {
  ok: boolean; error?: string;
  mass: PileMass; lengthM: number;
  yHeadMm: number; mMaxKnM: number;
  /** Maatgevende u.c. met de naam van de toets (sleutel onder material.rows, of 'nm'). */
  uc: number | null; checkId: string | null; checkLabel: string | null;
  /** Valt (deels) buiten de toetsing. */
  outside: boolean;
  passes: boolean;
}

/** Maatgevende toets uit een uitkomst: de hoogste van de N–M-toets en de materiaaltoetsing. */
export function governing(r: Extract<LateralResult, { ok: true }>): { uc: number | null; id: string | null; label: string | null } {
  const g = r.material?.governing, nm = r.sectionUtilization;
  if (g && (nm === null || g.uc >= nm)) return { uc: g.uc, id: g.id, label: g.label };
  if (nm !== null) return { uc: nm, id: 'nm', label: ct('calcLateral', 'variants.nmCheck', 'N–M-toets') };
  return { uc: null, id: null, label: null };
}

/** Rekent één variant door met de grond en belasting van de basisinvoer. */
export function evaluateVariant(base: LateralInput, d: VariantDesign, maxDisplacementMm?: number): VariantOutcome {
  const { variants: _v, pileTable: _t, ...rest } = base;
  const input = applyDesign(rest as LateralInput, d), mass = pileMass(input.section, input.lengthM);
  const r = computeLateral(input);
  if (!r.ok) return { ok: false, error: r.error, mass, lengthM: input.lengthM, yHeadMm: NaN, mMaxKnM: NaN, uc: null, checkId: null, checkLabel: null, outside: false, passes: false };
  const g = governing(r), yHeadMm = r.beam.nodes[0].yM * 1000, outside = !!r.material?.outside;
  const passes = g.uc !== null && g.uc <= 1 && r.material?.ok !== false && !outside && (maxDisplacementMm === undefined || Math.abs(yHeadMm) <= maxDisplacementMm);
  return { ok: true, mass, lengthM: input.lengthM, yHeadMm, mMaxKnM: r.maxMomentKnM, uc: g.uc, checkId: g.id, checkLabel: g.label, outside, passes };
}

/** Nieuwe variant van een ontwerp, met een unieke naam. */
export function newVariant(cfg: VariantsConfig | undefined, design: VariantDesign, name?: string, origin: LateralVariant['origin'] = 'manual'): LateralVariant {
  const used = new Set((cfg?.items ?? []).map((v) => v.id));
  let n = (cfg?.items.length ?? 0) + 1;
  while (used.has(`v${n}`)) n++;
  return { id: `v${n}`, name: name ?? ct('calcLateral', 'variants.defaultName', 'Variant {{n}}', { n }), design: structuredClone(design), origin };
}

/** Andere doorsnede in een variant; de werkende breedte gaat mee als die gelijk was aan de paalbreedte. */
export function reshape(d: VariantDesign, patch: Partial<PileSection>): VariantDesign {
  const section = { ...d.section, ...patch }, follows = Math.abs(d.springWidthM - pileWidthM(d.section)) < 1e-9;
  return { ...d, section, springWidthM: follows ? pileWidthM(section) : d.springWidthM };
}

/** Leest een opgeslagen lijst varianten; onbruikbare items vallen weg. */
export function readVariants(raw: unknown): VariantsConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Partial<VariantsConfig>;
  const items = Array.isArray(r.items) ? r.items.filter((v): v is LateralVariant =>
    !!v && typeof v.id === 'string' && typeof v.name === 'string' && !!v.design && typeof v.design.section?.kind === 'string' && Number.isFinite(v.design.lengthM) && Number.isFinite(v.design.springWidthM)) : [];
  return { ...r, items };
}
