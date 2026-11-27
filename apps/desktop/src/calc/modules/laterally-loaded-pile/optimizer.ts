// Optimalisatie op gewicht: een genetisch algoritme over discrete keuzes
// (paaltype, maat, wanddikte, staalsoort, betonklasse, staafdiameter en
// paalpunt) dat de lichtste paal zoekt die aan de eisen voldoet.
//
// Werkwijze (een standaard genetisch algoritme, zie bv. Goldberg, 1989,
// "Genetic Algorithms in Search, Optimization and Machine Learning"):
// - een genoom is een rij gehele getallen, één per keuze;
// - selectie per toernooi, uniforme kruising, mutatie per gen (een stap naar
//   de buurwaarde in de reeks of een willekeurige waarde), en elitisme;
// - stoppen na een vast aantal generaties of als het beste resultaat een
//   aantal generaties niet verbetert;
// - een eigen randomgenerator met vaste startwaarde (seed): dezelfde invoer
//   geeft dezelfde uitkomst;
// - overschrijding van de eisen is een straf in de doelfunctie:
//   f = m + P · v · (m + 100 kg), met v de som van de overschrijdingen
//   (u.c. − 1 en |y| / y_max − 1); niet berekenbaar of buiten de toetsing telt als v = 10;
// - elke variant wordt één keer doorgerekend (geheugen op het ontwerp).
//
// Dit bestand gebruikt geen DOM: het draait in de web worker
// (optimizer.worker.ts) en, als er geen worker is, in stukjes op de hoofddraad.
import type { LateralInput } from './compute';
import type { SectionKind } from './section';
import { PREFAB_SQUARE, STEEL_TUBE_OD } from '../pile-bearing-capacity/standard-sizes';
import { CONCRETE_CLASSES, STEEL_GRADES, concreteClassOf, designConcrete, steelGradeOf } from './materials';
import { SHEET_PILES, SHEET_PILE_GRADES, findSheetPile } from '../../library/sheetPiles';
import { defaultSheet } from './sheet-section';
import { designLabel, designOf, evaluateVariant, pileWidthM, systemFor, withSystem, type VariantDesign, type VariantOutcome } from './variants';

/** Ronde betonpalen [mm]: dezelfde reeks als de paaltabel (pile-table.ts). */
export const ROUND_SERIES = [300, 350, 400, 450, 500, 550, 600];
/** Gangbare wanddikten van buispalen [mm]; in het instelscherm aan te passen. */
export const WALL_SERIES = [6.3, 8, 10, 12.5, 14.2, 16, 20];
/** Gangbare staafdiameters [mm]. */
export const BAR_SERIES = [12, 16, 20, 25, 32];
export const OPT_KINDS: SectionKind[] = ['steel-tube', 'filled-tube', 'concrete-square', 'concrete-round', 'sheet-pile'];

export function seriesOf(kind: SectionKind): number[] {
  return kind === 'concrete-square' ? PREFAB_SQUARE : kind === 'concrete-round' ? ROUND_SERIES : kind === 'sheet-pile' ? [] : STEEL_TUBE_OD;
}

export interface OptimizerSettings {
  /** Doelgrootheid: totale massa per paal, of alleen het staal (buis of profiel en wapening). */
  objective: 'total' | 'steel';
  /** Eis kopverplaatsing [mm]; leeg = geen eis. */
  maxDisplacementMm?: number;
  kinds: SectionKind[];
  /** Maten per doorsnede [mm]. */
  sizes: Partial<Record<SectionKind, number[]>>;
  wallsMm: number[];
  /** Staalsoorten van de buis (S235 … S460). */
  steelGrades: string[];
  concreteClasses: string[];
  barDiametersMm: number[];
  /** Damwand: reeksen als "fabrikant|reeks" en staalsoorten uit de bibliotheek. */
  sheetSeries: string[];
  sheetGrades: string[];
  /** Paalpunt [m NAP] tussen twee grenzen met een stap; gelijk = vaste paalpunt. */
  toeHighNap: number; toeLowNap: number; toeStepM: number;
  /** Werkende breedte van de grondveren gelijk aan de paalbreedte. */
  widthFollowsPile: boolean;
  population: number; generations: number;
  /** Stoppen als het beste resultaat zoveel generaties niet verbetert. */
  stall: number;
  seed: number;
  /** Kans op mutatie per gen. */
  mutation: number;
  elite: number; tournament: number;
  /** Strafgewicht P op de overschrijding. */
  penalty: number;
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;

export function defaultSettings(base: LateralInput): OptimizerSettings {
  const s = base.section, head = base.headNap ?? 0, toe = round3(head - base.lengthM);
  const sheet = s.sheet ?? defaultSheet(), profile = findSheetPile(sheet.profileId, sheet.manufacturer);
  const sizes: OptimizerSettings['sizes'] = {};
  for (const k of OPT_KINDS) if (k !== 'sheet-pile') sizes[k] = [...seriesOf(k)];
  return {
    objective: 'total', kinds: [s.kind], sizes,
    wallsMm: [...WALL_SERIES], steelGrades: [steelGradeOf(s.tubeFydMpa) || 'S355'],
    concreteClasses: [concreteClassOf(s.fckMpa, s.fcdMpa) || 'C35/45'], barDiametersMm: [s.barDiameterMm],
    sheetSeries: profile ? [`${profile.manufacturer}|${profile.series}`] : [], sheetGrades: [sheet.grade],
    toeHighNap: toe, toeLowNap: toe, toeStepM: 0.5,
    widthFollowsPile: Math.abs(base.springWidthM - pileWidthM(s)) < 1e-9,
    population: 50, generations: 30, stall: 8, seed: 1, mutation: 0.15, elite: 2, tournament: 3, penalty: 20,
  };
}

/** De keuzes per gen, afgeleid uit de instellingen. */
export interface Space {
  kinds: SectionKind[];
  sizes: Partial<Record<SectionKind, number[]>>;
  /** Damwandprofielen als "fabrikant|profiel", van licht naar zwaar. */
  sheets: string[];
  walls: number[]; steelFy: number[]; sheetGrades: string[]; concrete: string[]; bars: number[]; lengths: number[];
}
const GENES = 7; // soort, maat, wand, staalsoort, betonklasse, staaf, lengte

export function buildSpace(base: LateralInput, st: OptimizerSettings): Space {
  const head = base.headNap ?? 0, step = Math.max(0.05, Math.abs(st.toeStepM) || 0.5);
  const hi = Math.max(st.toeHighNap, st.toeLowNap), lo = Math.min(st.toeHighNap, st.toeLowNap), lengths: number[] = [];
  for (let toe = hi; toe >= lo - 1e-9 && lengths.length < 400; toe -= step) { const L = round3(head - toe); if (L > 0) lengths.push(L); }
  const sheets = SHEET_PILES.filter((p) => st.sheetSeries.includes(`${p.manufacturer}|${p.series}`) && p.iCm4PerM !== null && p.welCm3PerM !== null && p.areaCm2PerM !== null && p.widthMm !== null)
    .sort((a, b) => a.areaCm2PerM! - b.areaCm2PerM!).map((p) => `${p.manufacturer}|${p.id}`);
  const uniq = <T,>(xs: T[]) => [...new Set(xs)];
  const sizes: Space['sizes'] = {};
  for (const k of st.kinds) if (k !== 'sheet-pile') sizes[k] = uniq((st.sizes[k] ?? []).filter((v) => v > 0)).sort((a, b) => a - b);
  const kinds = st.kinds.filter((k) => k === 'sheet-pile' ? sheets.length > 0 : (sizes[k]?.length ?? 0) > 0);
  return {
    kinds, sizes, sheets,
    walls: uniq(st.wallsMm.filter((v) => v > 0)).sort((a, b) => a - b),
    steelFy: uniq(st.steelGrades.map((g) => STEEL_GRADES.find((x) => x.id === g)?.fyMpa).filter((v): v is number => v !== undefined)).sort((a, b) => a - b),
    sheetGrades: SHEET_PILE_GRADES.map((g) => g.grade).filter((g) => st.sheetGrades.includes(g)),
    concrete: CONCRETE_CLASSES.map((c) => c.id).filter((c) => st.concreteClasses.includes(c)),
    bars: uniq(st.barDiametersMm.filter((v) => v > 0)).sort((a, b) => a - b),
    lengths: lengths.length ? lengths : [base.lengthM],
  };
}

/** Aantal keuzes per gen voor een soort; 1 als het gen bij die soort niet meetelt. */
function counts(sp: Space, kind: SectionKind): number[] {
  const tube = kind === 'steel-tube' || kind === 'filled-tube', sheet = kind === 'sheet-pile', concrete = kind !== 'steel-tube' && !sheet;
  return [sp.kinds.length, sheet ? sp.sheets.length : sp.sizes[kind]?.length ?? 0, tube ? Math.max(1, sp.walls.length) : 1,
    sheet ? Math.max(1, sp.sheetGrades.length) : tube ? Math.max(1, sp.steelFy.length) : 1,
    concrete ? Math.max(1, sp.concrete.length) : 1, concrete ? Math.max(1, sp.bars.length) : 1, sp.lengths.length];
}
/** Bovengrens per gen over alle soorten; een gen is een getal 0 … max − 1. */
function geneMax(sp: Space): number[] {
  const all = sp.kinds.map((k) => counts(sp, k));
  return Array.from({ length: GENES }, (_, i) => Math.max(1, ...all.map((c) => c[i])));
}
/** Aantal verschillende ontwerpen in de zoekruimte. */
export function spaceSize(sp: Space): number {
  return sp.kinds.reduce((a, k) => a + counts(sp, k).slice(1).reduce((x, y) => x * y, 1), 0);
}

/** Van genoom naar ontwerp; het gen wordt evenredig op de reeks van de soort gelegd. */
export function decode(base: LateralInput, st: OptimizerSettings, sp: Space, g: number[], max = geneMax(sp)): VariantDesign {
  const pick = (i: number, n: number) => Math.min(n - 1, Math.floor(g[i] * n / max[i]));
  const kind = sp.kinds[pick(0, sp.kinds.length)], c = counts(sp, kind), b = designOf(base), s = { ...b.section, kind };
  const size = kind === 'sheet-pile' ? 0 : sp.sizes[kind]![pick(1, c[1])];
  if (kind === 'sheet-pile') {
    const [manufacturer, profileId] = sp.sheets[pick(1, c[1])].split('|'), p = findSheetPile(profileId, manufacturer);
    s.sheet = { ...(b.section.sheet ?? defaultSheet()), manufacturer, profileId, ...(sp.sheetGrades.length ? { grade: sp.sheetGrades[pick(3, c[3])] } : {}) };
    if (p?.wallHeightMm) s.diameterMm = p.wallHeightMm;
  } else {
    s.diameterMm = size;
    if (kind === 'concrete-square') s.barCount = Math.max(4, Math.round(s.barCount / 4) * 4);
    if (kind === 'steel-tube' || kind === 'filled-tube') {
      if (sp.walls.length) s.wallMm = sp.walls[pick(2, c[2])];
      if (sp.steelFy.length) s.tubeFydMpa = sp.steelFy[pick(3, c[3])];
    }
    if (kind !== 'steel-tube') {
      if (sp.concrete.length) { const fck = CONCRETE_CLASSES.find((x) => x.id === sp.concrete[pick(4, c[4])])!.fckMpa; s.fckMpa = fck; s.fcdMpa = designConcrete(fck); }
      if (sp.bars.length) s.barDiameterMm = sp.bars[pick(5, c[5])];
    }
  }
  const lengthM = sp.lengths[pick(6, c[6])];
  const d: VariantDesign = withSystem({ ...b, section: s, lengthM }, systemFor(kind, b.pileSystemId));
  if (st.widthFollowsPile) d.springWidthM = pileWidthM(s);
  return d;
}

/** Kleine, snelle randomgenerator met vaste startwaarde (mulberry32). */
export function rng(seed: number) {
  let a = (seed >>> 0) || 1;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export interface Candidate { design: VariantDesign; label: string; outcome: VariantOutcome; objectiveKg: number; violation: number; fitness: number }
export const objectiveKg = (o: VariantOutcome, st: Pick<OptimizerSettings, 'objective'>) => st.objective === 'steel' ? o.mass.steelKg : o.mass.totalKg;

/** Som van de overschrijdingen van de eisen; 0 = voldoet. */
export function violationOf(o: VariantOutcome, st: Pick<OptimizerSettings, 'maxDisplacementMm'>): number {
  if (!o.ok || o.uc === null || o.outside || !Number.isFinite(o.uc)) return 10;
  let v = Math.max(0, o.uc - 1);
  if (st.maxDisplacementMm !== undefined && st.maxDisplacementMm > 0) v += Math.max(0, Math.abs(o.yHeadMm) / st.maxDisplacementMm - 1);
  // Een detailleringsregel die niet voldoet zonder hoge u.c.: toch een kleine straf.
  return v === 0 && !o.passes ? 0.01 : v;
}
export function fitnessOf(m: number, v: number, penalty: number) {
  return Number.isFinite(m) ? m + penalty * v * (m + 100) : Infinity;
}

export interface GenerationPoint { generation: number; bestKg: number | null; evaluated: number }
export interface OptimizerProgress { generation: number; generations: number; evaluated: number; feasible: number; bestKg: number | null; bestLabel: string | null; history: GenerationPoint[] }
export interface OptimizerResult {
  /** Beste tien die voldoen, licht naar zwaar; als niets voldoet de tien met de kleinste overschrijding. */
  best: Candidate[];
  history: GenerationPoint[];
  evaluated: number; feasible: number; spaceSize: number; generations: number;
  reason: 'generations' | 'stall' | 'stopped' | 'exhausted';
  ms: number;
}
/** Wat met de berekening wordt bewaard. */
export interface OptimizerRecord {
  settings: OptimizerSettings; history: GenerationPoint[];
  evaluated: number; feasible: number; spaceSize: number; generations: number;
  reason: OptimizerResult['reason']; ms: number; at: string;
  bestKg: number | null; bestLabel: string | null;
}
export const recordOf = (st: OptimizerSettings, r: OptimizerResult, at = new Date().toISOString()): OptimizerRecord => {
  const top = r.best.find((c) => c.violation === 0);
  return { settings: st, history: r.history, evaluated: r.evaluated, feasible: r.feasible, spaceSize: r.spaceSize, generations: r.generations, reason: r.reason, ms: r.ms, at,
    bestKg: top ? top.objectiveKg : null, bestLabel: top ? top.label : null };
};

export interface Hooks {
  onProgress?: (p: OptimizerProgress) => void;
  shouldStop?: () => boolean;
  /** Tussen generaties even loslaten (worker: berichten lezen; hoofddraad: de interface laten tekenen). */
  pause?: () => Promise<void>;
  /** Voor tests: een eigen rekenfunctie. */
  evaluate?: (d: VariantDesign) => VariantOutcome;
  now?: () => number;
}

/** Beste kandidaten uit het geheugen. */
function ranked(cache: Map<string, Candidate>, n = 10): Candidate[] {
  const all = [...cache.values()], ok = all.filter((c) => c.violation === 0).sort((a, b) => a.objectiveKg - b.objectiveKg || a.label.localeCompare(b.label));
  return ok.length ? ok.slice(0, n) : all.sort((a, b) => a.fitness - b.fitness).slice(0, n);
}

export async function runOptimizer(base: LateralInput, st: OptimizerSettings, hooks: Hooks = {}): Promise<OptimizerResult> {
  const now = hooks.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now())), t0 = now();
  const sp = buildSpace(base, st), max = geneMax(sp), size = spaceSize(sp), rand = rng(st.seed);
  const pop = Math.max(4, Math.round(st.population)), gens = Math.max(1, Math.round(st.generations));
  const elite = Math.min(pop - 1, Math.max(0, Math.round(st.elite))), k = Math.max(2, Math.round(st.tournament));
  const evaluate = hooks.evaluate ?? ((d: VariantDesign) => evaluateVariant(base, d, st.maxDisplacementMm));
  const cache = new Map<string, Candidate>(), history: GenerationPoint[] = [];
  const done = (reason: OptimizerResult['reason'], generations: number): OptimizerResult =>
    ({ best: ranked(cache), history, evaluated: cache.size, feasible: [...cache.values()].filter((c) => c.violation === 0).length, spaceSize: size, generations, reason, ms: now() - t0 });
  if (!sp.kinds.length || !sp.lengths.length) return done('exhausted', 0);

  const score = (g: number[]): Candidate => {
    const design = decode(base, st, sp, g, max), key = JSON.stringify(design);
    let c = cache.get(key);
    if (!c) {
      const outcome = evaluate(design), m = objectiveKg(outcome, st), v = violationOf(outcome, st);
      c = { design, label: designLabel(design), outcome, objectiveKg: m, violation: v, fitness: fitnessOf(m, v, st.penalty) };
      cache.set(key, c);
    }
    return c;
  };
  const randomGenome = () => max.map((n) => Math.floor(rand() * n));
  // De huidige invoer als startpunt, als die in de zoekruimte ligt.
  const seedGenome = (): number[] | null => {
    const s = base.section, ki = sp.kinds.indexOf(s.kind);
    if (ki < 0) return null;
    const c = counts(sp, s.kind), at = (i: number, j: number) => j < 0 ? Math.floor(rand() * max[i]) : Math.min(max[i] - 1, Math.floor((j + .5) * max[i] / c[i]));
    const sizeIdx = s.kind === 'sheet-pile' ? sp.sheets.findIndex((x) => x.endsWith(`|${s.sheet?.profileId}`)) : sp.sizes[s.kind]!.indexOf(s.diameterMm);
    return [at(0, ki), at(1, sizeIdx), at(2, sp.walls.indexOf(s.wallMm)), at(3, s.kind === 'sheet-pile' ? sp.sheetGrades.indexOf(s.sheet?.grade ?? '') : sp.steelFy.indexOf(s.tubeFydMpa)),
      at(4, sp.concrete.indexOf(concreteClassOf(s.fckMpa, s.fcdMpa))), at(5, sp.bars.indexOf(s.barDiameterMm)), at(6, sp.lengths.findIndex((L) => Math.abs(L - base.lengthM) < 1e-6))];
  };
  let population: number[][] = Array.from({ length: pop }, randomGenome);
  const seeded = seedGenome(); if (seeded) population[0] = seeded;

  let best = Infinity, still = 0, generation = 0;
  for (generation = 1; generation <= gens; generation++) {
    const scored = population.map((g) => ({ g, c: score(g) })).sort((a, b) => a.c.fitness - b.c.fitness);
    const top = ranked(cache, 1)[0], bestKg = top && top.violation === 0 ? top.objectiveKg : null;
    history.push({ generation, bestKg, evaluated: cache.size });
    hooks.onProgress?.({ generation, generations: gens, evaluated: cache.size, feasible: [...cache.values()].filter((c) => c.violation === 0).length, bestKg, bestLabel: bestKg === null ? null : top.label, history: [...history] });
    const f = scored[0].c.fitness;
    if (f < best - 1e-9) { best = f; still = 0; } else still++;
    if (cache.size >= size) return done('exhausted', generation);
    if (still >= Math.max(1, st.stall)) return done('stall', generation);
    if (generation === gens) break;
    await hooks.pause?.();
    if (hooks.shouldStop?.()) return done('stopped', generation);
    // Volgende generatie: de besten blijven, de rest uit toernooi, kruising en mutatie.
    const pickParent = () => { let w = scored[Math.floor(rand() * scored.length)]; for (let i = 1; i < k; i++) { const o = scored[Math.floor(rand() * scored.length)]; if (o.c.fitness < w.c.fitness) w = o; } return w.g; };
    const next = scored.slice(0, elite).map((x) => [...x.g]);
    while (next.length < pop) {
      const a = pickParent(), b = pickParent();
      const child = a.map((v, i) => rand() < .5 ? v : b[i]);
      for (let i = 0; i < GENES; i++) if (max[i] > 1 && rand() < st.mutation) {
        // Een stap is één plaats in de reeks van de soort van het kind.
        const kind = sp.kinds[Math.min(sp.kinds.length - 1, Math.floor(child[0] * sp.kinds.length / max[0]))], n = Math.max(1, counts(sp, kind)[i]);
        const stepSize = Math.max(1, Math.round(max[i] / n));
        child[i] = rand() < .5 ? Math.max(0, Math.min(max[i] - 1, child[i] + (rand() < .5 ? -1 : 1) * stepSize)) : Math.floor(rand() * max[i]);
      }
      next.push(child);
    }
    population = next;
  }
  return done('generations', Math.min(generation, gens));
}

/** Alle ontwerpen in de zoekruimte; voor de controle van het algoritme op een kleine ruimte. */
export function enumerate(base: LateralInput, st: OptimizerSettings): VariantDesign[] {
  const sp = buildSpace(base, st), max = geneMax(sp), out = new Map<string, VariantDesign>();
  const walk = (i: number, g: number[]) => {
    if (i === GENES) { const d = decode(base, st, sp, g, max); out.set(JSON.stringify(d), d); return; }
    for (let v = 0; v < max[i]; v++) walk(i + 1, [...g, v]);
  };
  walk(0, []);
  return [...out.values()];
}
