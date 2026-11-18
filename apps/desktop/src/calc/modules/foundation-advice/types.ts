/** Invoer van het funderingsadvies; projectgegevens komen uit het project. */
export interface AdviceInput {
  /** Kenmerk of documentnummer, bijvoorbeeld "2321-FA-01". */
  reference: string;
  version: string;
  status: 'concept' | 'definitief';
  advisor: string;
  checker: string;
  /** Omschrijving van het bouwwerk en de belastingen. */
  structure: string;
  consequenceClass: 'CC1' | 'CC2' | 'CC3';
  designLifeYears: number;
  /** Vloerpeil (peil = 0) in m NAP; leeg = niet opgegeven. */
  floorLevelNap?: number;
  /** Grondwaterstand voor het ontwerp, m NAP. */
  groundwaterNap?: number;
  /** Indicatieve draagkrachtige laag: qc ≥ bearingQcMpa over minstens bearingMinThicknessM. */
  bearingQcMpa: number;
  bearingMinThicknessM: number;
  /** Opgenomen sonderingen en berekeningen; ontbrekend = alles. */
  cptIds?: string[];
  calcIds?: string[];
  /** Bijlagen. */
  appendixCpts: boolean;
  appendixCalcs: boolean;
  /** Twee aanzichten van het 3D-grondmodel in de bodemopbouw; ontbrekend = ja. */
  soilModel3d?: boolean;
  /** Vrije teksten die het advies aanvullen. */
  introNote: string;
  remarks: string;
}

export const DEFAULT_ADVICE: AdviceInput = {
  reference: '', version: '1.0', status: 'concept', advisor: '', checker: '',
  structure: '', consequenceClass: 'CC2', designLifeYears: 50,
  bearingQcMpa: 10, bearingMinThicknessM: 1,
  appendixCpts: true, appendixCalcs: true, soilModel3d: true, introNote: '', remarks: '',
};
