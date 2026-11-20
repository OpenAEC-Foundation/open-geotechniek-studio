// Meetwaarden bewerken: de bewerkingen op een sondering en wat ze in het logboek achterlaten.
// Een bewerking verandert het origineel nooit; de lijst wordt telkens opnieuw op het origineel toegepast.

/** De kanalen van een meetpunt die bewerkt kunnen worden. */
export const CHANNELS = ["qc", "fs", "rf", "u2", "inclination"] as const;
export type Channel = (typeof CHANNELS)[number];

/** Eenheid waarin een kanaal in het meetpunt staat. */
export const CHANNEL_UNIT: Record<Channel, string> = { qc: "MPa", fs: "MPa", rf: "%", u2: "MPa", inclination: "°" };

/** Dieptes zijn in meter onder maaiveld, zoals ze op dat moment in de reeks staan (na eerdere bewerkingen). */
export type EditOp =
  /** Meetpunten in het traject vervallen helemaal. */
  | { kind: "remove-range"; from: number; to: number }
  /** Waarden in het traject worden ongeldig; een lege lijst kanalen betekent alle kanalen. */
  | { kind: "invalidate-range"; from: number; to: number; channels: Channel[] }
  /** Alles boven deze diepte vervalt. */
  | { kind: "trim-top"; depth: number }
  /** Alles onder deze diepte vervalt. */
  | { kind: "trim-bottom"; depth: number }
  /** Nulpuntverschuiving: een constante bij elke waarde van het kanaal, eventueel alleen in een traject. */
  | { kind: "zero-shift"; channel: Channel; offset: number; from?: number; to?: number }
  /** Alle dieptes verschuiven; positief is dieper. */
  | { kind: "depth-shift"; offset: number }
  /** Eén meetwaarde corrigeren; `null` maakt de waarde ongeldig. */
  | { kind: "set-value"; depth: number; channel: Channel; value: number | null }
  /** Uitschieters in een traject ongeldig maken (lopende mediaan, zie `findOutliers`). */
  | { kind: "remove-outliers"; from: number; to: number; channel: Channel; halfWindow: number; threshold: number };

export type EditKind = EditOp["kind"];
export const EDIT_KINDS: EditKind[] = ["remove-range", "invalidate-range", "trim-top", "trim-bottom", "zero-shift", "depth-shift", "set-value", "remove-outliers"];

/** Eén regel van het logboek: wat, wanneer, door wie en waarom. */
export interface MeasurementEdit {
  id: string;
  /** Tijdstip, ISO 8601. */
  at: string;
  by: string;
  reason: string;
  op: EditOp;
}

/** Een stuk van de diepteas, in de dieptes van de bewerkte reeks. */
export interface DepthSpan { from: number; to: number }

/** Wat een bewerking heeft gedaan, voor het logboek en de markering in de grafiek. */
export interface EditEffect {
  /** Aantal geraakte meetpunten. */
  affected: number;
  /** Bij een losse meetwaarde: de waarde ervoor en erna (`null` = geen waarde). */
  before?: number | null;
  after?: number | null;
  /** Waar in de bewerkte reeks deze bewerking zichtbaar is. */
  marks: DepthSpan[];
}
