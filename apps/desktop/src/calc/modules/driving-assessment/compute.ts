// Beoordeling van een kalendering met dynamische heiformules.
//
// Invoer is de kalenderstaat (slagen per tocht) plus heiblok en paal. Per
// tocht volgt de zakking per slag s; elke heiformule geeft daaruit een
// dynamische grensweerstand Ru en, met haar eigen veiligheidsfactor, een
// toelaatbare belasting. De formules verschillen in wat ze meenemen:
//
//   Hollandse formule   Ru = η·W²·h / (s·(W+P))            botsverlies (inelastisch)
//   Engineering News    Ru = η·W·h / (s + c)               vaste verliesterm c
//   Hiley               Ru = η·W·h/(s + c/2) · (W+e²P)/(W+P)  botsing + elastische samendrukking
//   Janbu               Ru = η·W·h / (ku·s)                paalstijfheid en massaverhouding
//   Deense formule      Ru = η·W·h / (s + √(η·W·h·L/(2·A·E)))  elastische paalverkorting
//   Gates (FHWA-vorm)   Ru = 6,7·√E·log10(10·Nb) − 445     empirisch (E in J, Nb slagen/25 mm)
//
// Vergelijkende studies met proefbelastingen (o.a. Olson & Flaate 1967,
// Flaate 1964, FHWA) laten zien dat Janbu, de Deense formule, Hiley en Gates
// de kleinste spreiding hebben; de Hollandse en de Engineering News-formule
// spreiden sterk en vragen daarom een hoge veiligheidsfactor. De module
// rekent alle gekozen formules door en baseert het oordeel op de mediaan
// van de vier betrouwbaardere. Een heiformule blijft een controle op de
// uitvoering: het draagvermogen volgt uit de sonderingen (NEN 9997-1).
//
// Eenheden intern: kN, m, kPa. W en P zijn gewichten (massa × g).
import { ct } from "../../i18n";

export const G = 9.81;
export type HammerType = "drop" | "hydraulic" | "diesel" | "steam";
export type FormulaId = "dutch" | "enr" | "hiley" | "janbu" | "danish" | "gates";
export const FORMULAS: FormulaId[] = ["dutch", "enr", "hiley", "janbu", "danish", "gates"];
/** Formules met de kleinste spreiding t.o.v. proefbelastingen; hierop rust het oordeel. */
export const RELIABLE: FormulaId[] = ["hiley", "janbu", "danish", "gates"];

export interface DrivingRow { /** Diepte paalpunt aan het eind van de tocht [m − maaiveld]. */ depthM: number; /** Slagen in deze tocht. */ blows: number }

export interface DrivingInput {
  hammerType: HammerType;
  ramMassKg: number;
  dropHeightM: number;
  /** Rendement van het blok η (0–1). */
  efficiency: number;
  /** Restitutiecoëfficiënt e van de slag (muts/paalkop). */
  restitution: number;
  pileMassKg: number;
  /** Massa van heimuts en vulling; telt mee in P. */
  capMassKg: number;
  pileLengthM: number;
  /** Doorsnede van de paal [mm²·10⁻⁶ = m²]. */
  pileAreaM2: number;
  /** Elasticiteitsmodulus van de paal [GPa]. */
  eModGpa: number;
  /** Tijdelijke elastische samendrukking c = c1+c2+c3 voor Hiley [mm]. */
  tempCompressionMm: number;
  /** Lengte van een tocht [mm]; in Nederland 250 mm. */
  tochtMm: number;
  rows: DrivingRow[];
  /** Vereiste toelaatbare belasting op de paal [kN]. */
  requiredKn: number;
  /** Aantal laatste tochten waarover de slotkalender wordt gemiddeld. */
  finalCount: number;
  enabled: FormulaId[];
  /** Eigen veiligheidsfactoren; ontbrekend = standaard. */
  safety?: Partial<Record<FormulaId, number>>;
}

export interface FormulaResult {
  id: FormulaId;
  /** Dynamische grensweerstand [kN]. */
  ruKn: number;
  safety: number;
  /** Toelaatbare belasting Ru / veiligheidsfactor [kN]. */
  allowKn: number;
  /** Vereiste belasting / toelaatbaar; ≤ 1 voldoet. */
  uc: number;
  /** Benodigd aantal slagen per tocht om de vereiste belasting te halen; null = niet haalbaar met dit blok. */
  requiredBlows: number | null;
  /** Tussenwaarden voor de uitdraai. */
  terms: Record<string, number>;
}

export interface TochtResult { depthM: number; blows: number; setMm: number; allowKn: Partial<Record<FormulaId, number>> }

export interface DrivingResult {
  ok: boolean;
  error?: string;
  warnings: string[];
  /** Gewicht blok en paal(+muts) [kN], slagenergie η·W·h [kNm]. */
  wKn: number; pKn: number; energyKnm: number;
  /** Zakking per slag in de slotkalender [mm] en het aantal slagen per tocht daar. */
  finalSetMm: number; finalBlows: number;
  formulas: FormulaResult[];
  profile: TochtResult[];
  /** Mediaan van de toelaatbare belasting van de betrouwbare formules [kN]; 0 zonder zulke formules. */
  consensusKn: number;
  consensusUc: number;
  /** Grootste / kleinste toelaatbare belasting over de gekozen formules. */
  spread: number;
}

const m = (key: string, nl: string, vars?: Record<string, unknown>) => ct("calcDriving", key, nl, vars);

export function defaultSafety(id: FormulaId, hammer: HammerType): number {
  switch (id) {
    case "dutch": return hammer === "drop" ? 10 : 6;
    case "enr": return 6;
    case "gates": return 3.5;
    default: return 3;
  }
}

interface Ctx { w: number; p: number; h: number; eta: number; e: number; l: number; ae: number; c: number; hammer: HammerType }

/** Grensweerstand [kN] bij zakking per slag `s` [m]. */
export function ultimate(id: FormulaId, s: number, x: Ctx): { ru: number; terms: Record<string, number> } {
  const en = x.eta * x.w * x.h; // kNm
  switch (id) {
    case "dutch":
      return { ru: (x.eta * x.w * x.w * x.h) / (s * (x.w + x.p)), terms: {} };
    case "enr": {
      const c = x.hammer === "drop" ? 0.0254 : 0.00254;
      return { ru: en / (s + c), terms: { cMm: c * 1000 } };
    }
    case "hiley": {
      const k = (x.w + x.e * x.e * x.p) / (x.w + x.p);
      return { ru: (en / (s + x.c / 2)) * k, terms: { k, cMm: x.c * 1000 } };
    }
    case "janbu": {
      const cd = 0.75 + 0.15 * (x.p / x.w);
      const lambda = (en * x.l) / (x.ae * s * s);
      const ku = cd * (1 + Math.sqrt(1 + lambda / cd));
      return { ru: en / (ku * s), terms: { cd, lambda, ku } };
    }
    case "danish": {
      const se = Math.sqrt((en * x.l) / (2 * x.ae));
      return { ru: en / (s + se), terms: { seMm: se * 1000 } };
    }
    case "gates": {
      const joule = x.w * x.h * 1000; // nominale energie W·h
      const nb = 0.025 / s; // slagen per 25 mm
      return { ru: Math.max(0, 6.7 * Math.sqrt(joule) * Math.log10(10 * nb) - 445), terms: { joule, nb } };
    }
  }
}

/** Zakking per slag [m] waarbij Ru/veiligheid = vereist; null als zelfs s → 0 niet volstaat. */
function setFor(id: FormulaId, target: number, x: Ctx): number | null {
  let lo = 1e-5, hi = 1;
  if (ultimate(id, lo, x).ru < target) return null;
  if (ultimate(id, hi, x).ru >= target) return hi;
  for (let i = 0; i < 80; i++) {
    const mid = Math.sqrt(lo * hi);
    if (ultimate(id, mid, x).ru >= target) lo = mid; else hi = mid;
  }
  return lo;
}

const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };

export function computeDriving(input: DrivingInput): DrivingResult {
  const empty: DrivingResult = { ok: false, warnings: [], wKn: 0, pKn: 0, energyKnm: 0, finalSetMm: 0, finalBlows: 0, formulas: [], profile: [], consensusKn: 0, consensusUc: 0, spread: 0 };
  const fail = (error: string): DrivingResult => ({ ...empty, error });
  const pos = (v: number) => Number.isFinite(v) && v > 0;
  if (!pos(input.ramMassKg) || !pos(input.dropHeightM)) return fail(m("errors.hammer", "Vul de massa en de valhoogte van het heiblok in."));
  if (!(input.efficiency > 0 && input.efficiency <= 1)) return fail(m("errors.efficiency", "Het rendement ligt tussen 0 en 1."));
  if (!(input.restitution >= 0 && input.restitution <= 1)) return fail(m("errors.restitution", "De restitutiecoëfficiënt ligt tussen 0 en 1."));
  if (!pos(input.pileMassKg) || !pos(input.pileLengthM) || !pos(input.pileAreaM2) || !pos(input.eModGpa)) return fail(m("errors.pile", "Vul massa, lengte, doorsnede en elasticiteitsmodulus van de paal in."));
  if (!pos(input.tochtMm)) return fail(m("errors.tocht", "De tochtlengte moet groter dan 0 zijn."));
  if (!(input.capMassKg >= 0) || !(input.tempCompressionMm >= 0)) return fail(m("errors.negative", "Mutsmassa en tijdelijke samendrukking mogen niet negatief zijn."));
  const rows = input.rows.filter((r) => Number.isFinite(r.depthM) && Number.isFinite(r.blows));
  if (!rows.length) return fail(m("errors.noRows", "Vul de kalenderstaat in: per tocht de diepte en het aantal slagen."));
  if (rows.some((r) => r.blows <= 0)) return fail(m("errors.blows", "Elke tocht heeft minstens één slag."));
  if (!pos(input.requiredKn)) return fail(m("errors.required", "Vul de vereiste belasting op de paal in."));
  const enabled = FORMULAS.filter((f) => input.enabled.includes(f));
  if (!enabled.length) return fail(m("errors.noFormula", "Kies minstens één heiformule."));

  const x: Ctx = {
    w: (input.ramMassKg * G) / 1000, p: ((input.pileMassKg + input.capMassKg) * G) / 1000, h: input.dropHeightM,
    eta: input.efficiency, e: input.restitution, l: input.pileLengthM, ae: input.pileAreaM2 * input.eModGpa * 1e6,
    c: input.tempCompressionMm / 1000, hammer: input.hammerType,
  };
  const safetyOf = (id: FormulaId) => { const v = input.safety?.[id]; return v !== undefined && pos(v) ? v : defaultSafety(id, input.hammerType); };
  const tocht = input.tochtMm / 1000;

  const profile: TochtResult[] = rows.map((r) => {
    const s = tocht / r.blows;
    const allowKn: TochtResult["allowKn"] = {};
    for (const id of enabled) allowKn[id] = ultimate(id, s, x).ru / safetyOf(id);
    return { depthM: r.depthM, blows: r.blows, setMm: s * 1000, allowKn };
  });

  // Slotkalender: gemiddeld aantal slagen over de laatste tochten.
  const n = Math.max(1, Math.min(rows.length, Math.round(input.finalCount) || 1));
  const finalBlows = rows.slice(-n).reduce((a, r) => a + r.blows, 0) / n;
  const s = tocht / finalBlows;

  const formulas: FormulaResult[] = enabled.map((id) => {
    const { ru, terms } = ultimate(id, s, x);
    const safety = safetyOf(id), allowKn = ru / safety;
    const need = setFor(id, input.requiredKn * safety, x);
    return { id, ruKn: ru, safety, allowKn, uc: allowKn > 0 ? input.requiredKn / allowKn : Infinity, requiredBlows: need === null ? null : Math.ceil(tocht / need - 1e-9), terms };
  });

  const reliable = formulas.filter((f) => RELIABLE.includes(f.id)).map((f) => f.allowKn);
  const consensusKn = median(reliable);
  const allows = formulas.map((f) => f.allowKn).filter((v) => v > 0);
  const warnings: string[] = [];
  const setMm = s * 1000;
  if (setMm < 2) warnings.push(m("warn.refusal", "Zakking per slag {{set}} mm (< 2 mm): de paal staat vrijwel vast. Heiformules zijn hier onbetrouwbaar en doorheien kan de paal beschadigen.", { set: setMm.toFixed(1) }));
  if (setMm > 50) warnings.push(m("warn.easy", "Zakking per slag {{set}} mm (> 50 mm): zeer lichte heiing; de formules overschatten dan snel het draagvermogen.", { set: setMm.toFixed(0) }));
  if (x.w / x.p < 0.5) warnings.push(m("warn.lightHammer", "Het blok weegt minder dan de helft van paal en muts (W/P = {{ratio}}): veel slagenergie gaat verloren in de botsing.", { ratio: (x.w / x.p).toFixed(2) }));
  if (!reliable.length) warnings.push(m("warn.noReliable", "Geen van de betrouwbaardere formules (Hiley, Janbu, Deens, Gates) is gekozen; het oordeel rust op formules met een grote spreiding."));
  if (allows.length > 1 && Math.max(...allows) / Math.min(...allows) > 3) warnings.push(m("warn.spread", "De formules lopen meer dan een factor 3 uiteen. Gebruik de uitkomst als controle op de uitvoering, niet als draagvermogen."));
  if (rows.length >= 3 && rows[rows.length - 1].blows < rows[rows.length - 2].blows && rows[rows.length - 2].blows < rows[rows.length - 3].blows)
    warnings.push(m("warn.decreasing", "Het aantal slagen per tocht neemt in de laatste tochten af: de paalpunt kan de draagkrachtige laag verlaten of er treedt relaxatie op."));

  const base = reliable.length ? consensusKn : median(formulas.map((f) => f.allowKn));
  return {
    ok: true, warnings, wKn: x.w, pKn: x.p, energyKnm: x.eta * x.w * x.h, finalSetMm: setMm, finalBlows, formulas, profile,
    consensusKn: base, consensusUc: base > 0 ? input.requiredKn / base : Infinity,
    spread: allows.length ? Math.max(...allows) / Math.min(...allows) : 0,
  };
}

/** Voorbeeld: prefab betonpaal 350×350 mm, 18 m, hydraulisch blok van 5 ton. */
export function drivingExample(): DrivingInput {
  return {
    hammerType: "hydraulic", ramMassKg: 5000, dropHeightM: 0.8, efficiency: 0.9, restitution: 0.4,
    pileMassKg: 5290, capMassKg: 500, pileLengthM: 18, pileAreaM2: 0.1225, eModGpa: 30, tempCompressionMm: 8, tochtMm: 250,
    rows: [
      { depthM: 15.0, blows: 6 }, { depthM: 15.25, blows: 7 }, { depthM: 15.5, blows: 9 }, { depthM: 15.75, blows: 12 },
      { depthM: 16.0, blows: 16 }, { depthM: 16.25, blows: 21 }, { depthM: 16.5, blows: 27 }, { depthM: 16.75, blows: 32 },
      { depthM: 17.0, blows: 36 }, { depthM: 17.25, blows: 40 },
    ],
    requiredKn: 550, finalCount: 1, enabled: [...FORMULAS],
  };
}
