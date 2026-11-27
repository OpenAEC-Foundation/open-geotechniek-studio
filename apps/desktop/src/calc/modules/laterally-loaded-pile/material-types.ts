// Typen en hulpfuncties van de materiaaltoetsing (zie material-check.ts).
/** ok/fail tellen mee in het oordeel; info is ter informatie, na = kan niet, outside = valt buiten deze toetsing. */
export type CheckStatus = 'ok' | 'fail' | 'info' | 'na' | 'outside';
/** Symbool in de notatie van de rapporttekst (V_Rd,c), waarde en eenheid. */
export interface Quantity { s: string; v: number; u: string; d?: number }
/** Tussenstap: symbool, eventueel de formule, waarde en eenheid. */
export interface Step extends Quantity { f?: string }
/** Toelichting: vertaalsleutel onder material.notes, met de Nederlandse tekst als standaard. */
export interface Note { key: string; nl: string; vars?: Record<string, string | number> }
export interface CheckRow {
  id: string;
  /** Nederlandse naam; vertaling onder material.rows.<id>. */
  label: string;
  /** Norm en artikel, bv. "EN 1992-1-1 art. 6.2.2". */
  article: string;
  demand?: Quantity; resistance?: Quantity;
  uc: number | null; status: CheckStatus;
  /** Diepte onder de paalkop van de maatgevende snede [m]. */
  zM?: number;
  steps: Step[]; note?: Note;
  /** Detailleringsregel (wapeningsgrenzen): telt mee in het oordeel, maar is alleen maatgevend als zij niet voldoet. */
  detail?: boolean;
}
export interface MaterialResult {
  standard: string; rows: CheckRow[];
  /** Hoogste u.c. van de toetsen die meetellen. */
  governing: { id: string; label: string; uc: number } | null;
  /** null: geen toets met een oordeel. */
  ok: boolean | null;
  /** Een deel valt buiten de toetsing (bv. doorsnedeklasse 4): geen oordeel "voldoet". */
  outside: boolean;
  notes: Note[];
  /** Wat voor dit paaltype niet is getoetst. */
  notChecked: Note;
}
/** Aanvullende invoer voor de materiaaltoetsing; alles optioneel. */
export interface MaterialInput {
  /** Beugels of spiraal: staafdiameter [mm] en hart-op-hart-afstand of spoed [mm]; 0 of leeg = geen. */
  stirrupDiameterMm?: number; stirrupSpacingMm?: number;
  /** Aantal beugelsneden in de dwarskrachtrichting (vierkante paal); standaard 2. */
  stirrupLegs?: number;
  /** cot θ van de drukdiagonaal, 1 tot 2,5 (art. 6.2.3 (2)); standaard 2,5. */
  cotTheta?: number;
  /** In de grond gevormde paal (boorpaal): minimumwapening volgens art. 9.8.5. */
  boredPile?: boolean;
}
export interface Demand {
  nEdKn: number; mMaxKnM: number; zM: number; vMaxKn: number; zV: number;
  samples: Array<{ zM: number; m: number; v: number }>;
}
export interface ExistingCheck { uc: number | null; mRdKnM: number | null; error: string | null }
export interface PartialResult { standard: string; rows: CheckRow[]; notes: Note[]; notChecked: Note }

export const ucOf = (demand: number, resistance: number) => resistance > 1e-9 ? demand / resistance : demand > 1e-9 ? Infinity : 0;
export function check(id: string, label: string, article: string, demand: Quantity, resistance: Quantity, steps: Step[], extra: Partial<CheckRow> = {}): CheckRow {
  const uc = ucOf(Math.abs(demand.v), resistance.v);
  return { id, label, article, demand, resistance, uc, status: uc <= 1 ? 'ok' : 'fail', steps, ...extra };
}
export const noCheck = (id: string, label: string, article: string, status: 'na' | 'outside', note: Note): CheckRow => ({ id, label, article, uc: null, status, steps: [], note });
/** Reductie van de vloeigrens bij V_Ed > 0,5 V_pl,Rd: ρ = (2 V_Ed / V_pl,Rd − 1)² (EN 1993-1-1 art. 6.2.8 (3)). */
export const shearRho = (vKn: number, vplKn: number) => vKn > .5 * vplKn ? Math.min(1, (2 * vKn / vplKn - 1) ** 2) : 0;
