// Dissipatietest bij een sondering met waterspanningsmeting: de conus staat stil op één diepte en de
// waterspanning wordt tegen de tijd gemeten. De gegevens horen bij de sondering en gaan mee in het project.

/** Eén meting van de tijdreeks. Tijd in seconden sinds het begin van de test, spanningen in MPa. */
export interface DissipationPoint {
  time: number;
  qc?: number;
  u1?: number;
  u2?: number;
  u3?: number;
}

export type PoreChannel = "u1" | "u2" | "u3";

/** Hoe de evenwichtswaterspanning u0 wordt bepaald. */
export type EquilibriumMode = "last" | "manual" | "groundwater";

/** Keuzes van de gebruiker bij de uitwerking; alles is optioneel en heeft een standaard. */
export interface DissipationSettings {
  channel?: PoreChannel;
  u0Mode?: EquilibriumMode;
  /** Ingevulde evenwichtswaterspanning [kPa]. */
  u0Kpa?: number;
  /** Grondwaterstand in m onder maaiveld (voor u0 uit de diepte). */
  groundwaterDepthM?: number;
  /** Stijfheidsindex I_r = G / s_u [-]. */
  rigidityIndex?: number;
  /** Oppervlakte van de conuspunt [mm²]; leeg = uit het sondeerbestand. */
  coneAreaMm2?: number;
  /** Tijdas van de grafiek: logaritmisch (standaard) of wortel-tijd. */
  timeAxis?: "log" | "sqrt";
}

export interface DissipationTest {
  id: string;
  /** Sondeertrajectlengte waarop de conus stilstaat [m]. */
  depth: number;
  source: "bro" | "gef";
  source_file?: string;
  /** Bestandsnaam van de sondering waar de test bij hoort (GEF: #PARENT). */
  parent_file?: string;
  /** Kenmerk van de test in het bestand (GEF: #TESTID). */
  test_id?: string;
  /** Begintijdstip van de test, zoals het bestand het geeft. */
  start_time?: string;
  points: DissipationPoint[];
  settings?: DissipationSettings;
  /** Opmerkingen van de lezer (bijvoorbeeld een ontbrekende diepte). */
  notes?: string[];
}
