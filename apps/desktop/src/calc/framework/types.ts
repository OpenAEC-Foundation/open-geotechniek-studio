// apps/desktop/src/calc/framework/types.ts
import type { ReactNode, FC } from "react";
import type { Cpt, ProjectMeta } from "../../types/cpt";

/** Categorie waarmee modules in de UI gegroepeerd worden. */
export type CalcCategory = "pile" | "spread" | "wall" | "anchor";

/** Implementatie-status — bepaalt of de module échte UI rendert of een
 *  "Coming soon"-placeholder.
 *  - "experimental": module rendert wel volledig, maar getallen zijn nog
 *    niet productie-geverifieerd. De CalculationsView toont een prominente
 *    tussenstand-banner zodat de gebruiker weet dat resultaten indicatief
 *    zijn en niet voor toetsing bij vergunning of uitvoering geschikt. */
export type CalcStatus = "available" | "experimental" | "coming-soon";

/** Context die de framework aan elke module-aanroep meegeeft. */
export interface ProjectContext {
  cpts: Map<string, Cpt>;
  activeCptId: string | null;
  projectMeta: ProjectMeta;
}

/** Eén element in een paneel van de Berekeningen-view. Module-specifiek. */
export interface PanelProps<TInput, TResult> {
  input: TInput;
  result: TResult;
  onChange?: (next: TInput) => void;
}

/** Module-blueprint. Elke calc-type implementeert deze interface. */
export interface CalcModule<TInput = unknown, TResult = unknown> {
  id: string;                    // "pile-bearing-capacity"
  name: string;                  // UI-naam in NL
  subtitle: string;              // korte ondertitel
  category: CalcCategory;
  icon: ReactNode;
  norm: string;                  // "NEN-EN 1997-1:2005+A1:2013+NB:2019"
  status: CalcStatus;
  defaultInput: (ctx: ProjectContext) => TInput;
  compute: (input: TInput, ctx: ProjectContext) => TResult;
  InputPanel: FC<PanelProps<TInput, TResult>>;
  VisualPanel: FC<PanelProps<TInput, TResult>>;
  ResultPanel: FC<PanelProps<TInput, TResult>>;
  /** Optioneel: parameters en standaardreeksen van deze berekening (tab Instellingen). */
  SettingsPanel?: FC<PanelProps<TInput, TResult>>;
  /** Optioneel: een tabel over veel varianten tegelijk (sonderingen, palen). */
  table?: CalcTable<TInput>;
  /** `pending`: er is (nog) niet gerekend omdat invoer ontbreekt — geen
   *  afkeuring, dus niet als fout tonen. */
  statusLine?: (result: TResult) => { text: string; ok: boolean; pending?: boolean };
  /** Kernuitkomsten onder het invoerscherm, als chips. Een toets met `uc`
   *  kleurt groen of rood; zonder `uc` is het een informatieve waarde. */
  checks?: (input: TInput, result: TResult) => CalcCheck[];
  /** Het rapport zoals het op papier komt. Voedt zowel het
   *  afdrukvoorbeeld als de PDF-export; zonder deze haak tonen beide niet. */
  buildReport?: (input: TInput, result: TResult, ctx: ProjectContext) => Uint8Array;
  /** Naam van het tekeningpaneel naast de invoer; standaard "Sondering". */
  visualLabel?: string;
  /** Het model heeft veel ruimte nodig (3D, diagrammen): de uitdraai
   *  wordt in de gewone weergave smaller. */
  wideVisual?: boolean;
  /** Bestandsnaam (zonder extensie) voor de PDF-export. */
  reportFileName?: (input: TInput) => string;
}

/** Eén uitkomst onder het invoerscherm. */
export interface CalcCheck {
  label: string;
  /** Opgemaakte waarde inclusief eenheid, b.v. "812 kN". */
  value: string;
  /** Unity check; aanwezig = dit is een toets met voldoet/voldoet niet. */
  uc?: number;
}

/** Eén berekening-instance binnen een project. */
export interface CalculationInstance {
  id: string;                    // UUID, stable over save/load
  moduleId: string;              // "pile-bearing-capacity"
  name: string;                  // user-given e.g. "Hoofdgebouw"
  input: unknown;                // module-specific JSON
  createdAt: string;             // ISO 8601
  updatedAt: string;             // ISO 8601
  cptRefs?: string[];
  boreRefs?: string[];
}

/** Eigenschappen van een tabelweergave; `focus` is één onderdeel (sondering, paal). */
export interface TablePanelProps<TInput = unknown> {
  input: TInput;
  ctx: ProjectContext;
  onChange: (next: TInput) => void;
  /** Open het rekenblad (na het instellen van de invoer). */
  onOpen: () => void;
  focus: string | null;
  onFocus: (id: string | null) => void;
}

export interface CalcTable<TInput = unknown> {
  /** Naam van het tabblad en het knooppunt in de projectboom. */
  label: string;
  Panel: FC<TablePanelProps<TInput>>;
  /** Onderdelen onder de tabel in de projectboom. */
  items: (input: TInput, ctx: ProjectContext) => Array<{ id: string; label: string }>;
}

