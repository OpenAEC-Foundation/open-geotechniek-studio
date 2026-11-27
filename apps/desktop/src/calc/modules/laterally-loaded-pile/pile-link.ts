// Koppeling met de module paaldraagvermogen: dezelfde paalsystemen als keuze,
// en een horizontale berekening die de gegevens van een verticale overneemt.
//
// Een paalsysteem (prefab, vibro, boorpaal, ...) zegt hoe de paal wordt
// gemaakt; de horizontale berekening heeft daarnaast de constructieve
// doorsnede nodig (beton vierkant of rond, buis hol of gevuld). Elk systeem
// laat de doorsneden toe die erbij passen. Houten palen hebben in deze module
// nog geen doorsnedeberekening en zijn daarom niet te kiezen.
import { getPileType } from '../pile-bearing-capacity/catalog';
import { PILE_SYSTEMS, pileSystemIdOf, type PileSystemId } from '../pile-bearing-capacity/pile-systems';
import type { PileInput, SoilKind } from '../pile-bearing-capacity/types';
import { lateralExample, type LateralInput, type LateralLayer } from './compute';
import type { SectionKind } from './section';

export const SYSTEM_KINDS: Record<PileSystemId, SectionKind[]> = {
  'prefab-concrete': ['concrete-square', 'concrete-round'],
  'steel-tube-closed': ['steel-tube', 'filled-tube'],
  'screw-injection': ['steel-tube', 'filled-tube'],
  'screw-permanent-casing': ['filled-tube', 'steel-tube'],
  'screw-lost-tip': ['concrete-round'], 'screw-soil-displacing': ['concrete-round'], vibro: ['concrete-round'],
  auger: ['concrete-round'], 'auger-cased': ['concrete-round'], bored: ['concrete-round'],
  timber: [], 'timber-extension': [],
};
/** In de grond gevormde palen: de minimumwapening van NEN-EN 1992-1-1 art. 9.8.5 geldt. */
export const CAST_IN_SITU: PileSystemId[] = ['screw-lost-tip', 'screw-soil-displacing', 'vibro', 'auger', 'auger-cased', 'bored'];
export const systemAvailable = (id: PileSystemId) => SYSTEM_KINDS[id].length > 0;

/** Het paalsysteem van de invoer; zonder opgeslagen keuze afgeleid uit de doorsnede. */
export function systemOf(input: Pick<LateralInput, 'pileSystemId' | 'section'>): PileSystemId | 'sheet-pile' {
  const kind = input.section.kind;
  if (kind === 'sheet-pile') return 'sheet-pile';
  const stored = PILE_SYSTEMS.find((s) => s.id === input.pileSystemId)?.id;
  if (stored && SYSTEM_KINDS[stored].includes(kind)) return stored;
  return kind === 'steel-tube' ? 'steel-tube-closed' : kind === 'filled-tube' ? 'screw-permanent-casing' : 'prefab-concrete';
}

/** Beddingklasse bij een grondsoort van de paalberekening. De klasse (los, matig, vast) volgt niet uit de grondsoort: zand matig, klei en veen slap als veilige keuze voor de verplaatsing. */
const SPRING_OF: Record<SoilKind, string> = { 'sand-dry': 'sand-medium', 'sand-wet': 'sand-medium', clay: 'clay-soft', peat: 'peat-soft' };

/** Uit welke verticale berekening de gegevens komen, en wat de horizontale berekening zelf niet gebruikt. */
export interface InheritedFrom {
  calcId: string; name: string; cptId: string | null;
  /** Grondwaterstand en maaiveld of ontgravingsniveau [m NAP]; ter vermelding, de veren rekenen er niet mee. */
  waterNap: number; surfaceNap: number;
  /** Datum van overnemen (ISO). */
  at: string;
}
export type PileLink = { ok: true; input: LateralInput } | { ok: false; reason: 'timber' | 'unknownType' | 'noLength' };

/**
 * Zet de gegevens van een paaldraagvermogenberekening in een horizontale
 * berekening: paalsysteem en doorsnede, maat en wanddikte, paalkop en
 * paalpunt, het grondprofiel onder maaiveld en N_Ed. `current` is de
 * horizontale invoer die blijft staan voor alles wat de verticale berekening
 * niet kent (H, M, wapening, sterkten, instellingen).
 *
 * De verticale berekening kent geen grensweerstand p_u per laag; de overgenomen
 * berekening rekent daarom met lineaire veren, tot de gebruiker p_u invult.
 */
export function applyPile(current: LateralInput, pile: PileInput, source: { calcId: string; name: string }, at = new Date().toISOString()): PileLink {
  const type = getPileType(pile.pileTypeId), system = pileSystemIdOf(pile);
  if (!type || !system) return { ok: false, reason: 'unknownType' };
  if (!systemAvailable(system)) return { ok: false, reason: 'timber' };
  const lengthM = +(pile.pileTopNap - pile.pileToeNap).toFixed(3);
  if (!(lengthM > 0)) return { ok: false, reason: 'noLength' };
  const kinds = SYSTEM_KINDS[system];
  const kind: SectionKind = type.material === 'concrete' ? (type.isCircular ? 'concrete-round' : 'concrete-square') : kinds[0];
  const tube = kind === 'steel-tube' || kind === 'filled-tube', head = pile.pileTopNap, surface = pile.excavationNap;
  // Lagen onder maaiveld en boven de paalpunt, in meters onder de paalkop.
  const layers: LateralLayer[] = [];
  for (const l of [...pile.soilProfile].sort((a, b) => b.startNap - a.startNap)) {
    const top = Math.min(l.startNap, pile.excavationNap, head), bottom = Math.max(l.endNap, pile.pileToeNap);
    if (top - bottom < 1e-6) continue;
    layers.push({ topM: +(head - top).toFixed(3), bottomM: +(head - bottom).toFixed(3), springId: SPRING_OF[l.kind], manualKhKnM3: 0, frictionDeg: l.phi, netPressureKpa: 0 });
  }
  if (!layers.length) return { ok: false, reason: 'noLength' };
  const barStep = kind === 'concrete-square' ? 4 : 1;
  const inherited: InheritedFrom = { calcId: source.calcId, name: source.name, cptId: pile.cptId, waterNap: pile.waterNap, surfaceNap: surface, at };
  return { ok: true, input: {
    ...current, headNap: head, lengthM, nEdKn: pile.nEd, springWidthM: pile.diameterMm / 1000, pileSystemId: system, inherited,
    analysisMode: 'linear', layerCorrection: 'none', layers,
    section: { ...current.section, kind, diameterMm: pile.diameterMm, ...(tube ? { wallMm: pile.wallThicknessMm } : {}), barCount: Math.max(4, Math.round(current.section.barCount / barStep) * barStep) },
    material: { ...current.material, ...(CAST_IN_SITU.includes(system) ? { boredPile: true } : {}) },
    pileTable: undefined,
  } };
}

/** Nieuwe horizontale berekening uit een verticale: H en M op nul, omdat de verticale berekening die niet kent. */
export function lateralInputFromPile(pile: PileInput, source: { calcId: string; name: string }, at?: string): PileLink {
  return applyPile({ ...structuredClone(lateralExample), headForceKn: 0, headMomentKnM: 0 }, pile, source, at);
}
