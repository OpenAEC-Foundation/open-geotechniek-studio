// Een gedigitaliseerde sondering: wat de gebruiker heeft ingevoerd (herkomst, ijkpunten, aangeklikte
// punten) en de gewone sondering die daaruit volgt. Het ingevoerde staat in de uitbreidbare metadata
// van de sondering, zodat zij met het project meegaat en later weer te openen en bij te werken is.
import i18next from "i18next";
import type { Cpt } from "../types/cpt";
import { calibrationProblem, solveCalibration, type Calibration, type CalibrationProblem, type Px } from "./calibration";
import { buildPoints, MAX_STEP, MIN_STEP, normalizeReadings, readingsFromPixels, type DepthMode, type Interpolation, type NormalizedReadings, type SecondKind } from "./series";

/** Het ingevoerde, als JSON. */
export const DIGITIZED_KEY = "ogs:digitized";
/** De onderlegger (verkleinde afbeelding als data-URL), zodat de punten later weer op de scan liggen. */
export const DIGITIZED_IMAGE_KEY = "ogs:digitized-image";

export type ConeKind = "mechanical" | "electrical";

export interface DigitizedSeries { calibration: Calibration; points: Px[] }

export interface DigitizedRecord {
  version: 1;
  /** Naam of nummer van de sondering. */
  id: string;
  date?: string;
  groundLevelNap: number;
  xRd?: number;
  yRd?: number;
  /** Verplichte herkomstvermelding, bijvoorbeeld het rapport en de datum waar de grafiek uit komt. */
  origin: string;
  coneKind: ConeKind;
  depthMode: DepthMode;
  step: number;
  interpolation: Interpolation;
  image: { name: string; width: number; height: number };
  qc: DigitizedSeries;
  second?: DigitizedSeries & { kind: SecondKind };
}

export type RecordProblem =
  | { kind: "id" | "origin" | "groundLevel" | "step" | "position" | "qcPoints" | "secondPoints" | "noSeries" }
  | { kind: "qcCalibration" | "secondCalibration"; problem: CalibrationProblem };

/** Wat er nog ontbreekt of niet klopt; leeg als de sondering gemaakt kan worden. */
export function recordProblems(r: DigitizedRecord): RecordProblem[] {
  const out: RecordProblem[] = [];
  const qcProblem = calibrationProblem(r.qc.calibration);
  if (qcProblem) out.push({ kind: "qcCalibration", problem: qcProblem });
  if (r.qc.points.length < 2) out.push({ kind: "qcPoints" });
  if (r.second) {
    const problem = calibrationProblem(r.second.calibration);
    if (problem) out.push({ kind: "secondCalibration", problem });
    if (r.second.points.length < 2) out.push({ kind: "secondPoints" });
  }
  if (!r.id.trim()) out.push({ kind: "id" });
  if (!Number.isFinite(r.groundLevelNap)) out.push({ kind: "groundLevel" });
  if ((r.xRd === undefined) !== (r.yRd === undefined) || [r.xRd, r.yRd].some((v) => v !== undefined && !Number.isFinite(v))) out.push({ kind: "position" });
  if (!r.origin.trim()) out.push({ kind: "origin" });
  if (!(r.step >= MIN_STEP && r.step <= MAX_STEP)) out.push({ kind: "step" });
  if (!out.length && !buildPoints(seriesOf(r)).length) out.push({ kind: "noSeries" });
  return out;
}

/** De aflezingen van beide reeksen, gesorteerd en ontdubbeld. */
export function readingsOf(r: DigitizedRecord): { qc: NormalizedReadings; second?: NormalizedReadings } {
  const read = (s: DigitizedSeries): NormalizedReadings => {
    const m = solveCalibration(s.calibration);
    return m ? normalizeReadings(readingsFromPixels(s.points, m, r.depthMode, r.groundLevelNap)) : { readings: [], duplicates: 0, reordered: false };
  };
  return { qc: read(r.qc), second: r.second ? read(r.second) : undefined };
}

function seriesOf(r: DigitizedRecord) {
  const { qc, second } = readingsOf(r);
  return {
    qc: qc.readings, step: r.step, interpolation: r.interpolation, groundLevelNap: r.groundLevelNap,
    second: r.second && second ? { kind: r.second.kind, readings: second.readings } : undefined,
  };
}

const CONE_NL: Record<ConeKind, string> = { mechanical: "mechanisch", electrical: "elektrisch" };
const nlNumber = (v: number) => String(v).replace(".", ",");

/**
 * De gewone sondering bij het ingevoerde. Gooit een fout als er nog iets ontbreekt; vraag dat vooraf
 * na met `recordProblems`. `image` is de onderlegger als data-URL en gaat mee in de metadata.
 */
export function buildDigitizedCpt(record: DigitizedRecord, image?: string): Cpt {
  if (recordProblems(record).length) throw new Error("De gedigitaliseerde sondering is niet compleet.");
  const r: DigitizedRecord = { ...record, id: record.id.trim(), origin: record.origin.trim() };
  const hasPosition = r.xRd !== undefined && r.yRd !== undefined;
  return {
    id: r.id,
    metadata: {
      date: r.date || undefined,
      ground_level_nap: r.groundLevelNap,
      source_file: r.image.name || "gedigitaliseerd",
      extra: {
        // Leesbaar in het paneel met bestandsmetadata.
        "Herkomst": r.origin,
        "Soort sondering": `${CONE_NL[r.coneKind]}, gedigitaliseerd van papier of scan`,
        "Meetreeks": `stap ${nlNumber(r.step)} m, ${r.interpolation === "step" ? "trapsgewijs per aflezing" : "lineair tussen de aangeklikte punten"}`,
        [DIGITIZED_KEY]: JSON.stringify(r),
        ...(image ? { [DIGITIZED_IMAGE_KEY]: image } : {}),
      },
    },
    position: hasPosition ? { x_rd: r.xRd!, y_rd: r.yRd!, z_nap: r.groundLevelNap } : undefined,
    points: buildPoints(seriesOf(r)),
  };
}

const isPx = (p: unknown): p is Px => !!p && typeof p === "object" && Number.isFinite((p as Px).x) && Number.isFinite((p as Px).y);
const isAxis = (a: unknown) => {
  const v = a as Calibration["depth"];
  return !!v && isPx(v.a) && isPx(v.b) && Number.isFinite(v.va) && Number.isFinite(v.vb);
};
const isSeries = (s: unknown): s is DigitizedSeries => {
  const v = s as DigitizedSeries;
  return !!v && !!v.calibration && isAxis(v.calibration.depth) && isAxis(v.calibration.value) && Array.isArray(v.points) && v.points.every(isPx);
};

const cache = new WeakMap<Cpt, DigitizedRecord | null>();

/** Het ingevoerde van een gedigitaliseerde sondering; `null` bij een gemeten bestand of onleesbare gegevens. */
export function digitizedOf(cpt: Cpt | null | undefined): DigitizedRecord | null {
  const raw = cpt?.metadata.extra?.[DIGITIZED_KEY];
  if (!cpt || !raw) return null;
  if (cache.has(cpt)) return cache.get(cpt)!;
  let record: DigitizedRecord | null = null;
  try {
    const v = JSON.parse(raw) as DigitizedRecord;
    if (v && v.version === 1 && typeof v.id === "string" && typeof v.origin === "string" && isSeries(v.qc) && (v.second === undefined || isSeries(v.second))
      && Number.isFinite(v.groundLevelNap) && Number.isFinite(v.step) && v.image && Number.isFinite(v.image.width) && Number.isFinite(v.image.height)) {
      record = {
        ...v,
        coneKind: v.coneKind === "electrical" ? "electrical" : "mechanical",
        depthMode: v.depthMode === "nap" ? "nap" : "depth",
        interpolation: v.interpolation === "step" ? "step" : "linear",
        second: v.second ? { ...v.second, kind: v.second.kind === "rf" ? "rf" : "fs" } : undefined,
      };
    }
  } catch { /* onleesbaar: de sondering blijft bruikbaar als gewone sondering */ }
  cache.set(cpt, record);
  return record;
}

export const isDigitized = (cpt: Cpt | null | undefined) => digitizedOf(cpt) !== null;
export const digitizedImageOf = (cpt: Cpt | null | undefined) => cpt?.metadata.extra?.[DIGITIZED_IMAGE_KEY];

const t = (key: string, nl: string, vars?: Record<string, unknown>) => i18next.t(`digitaliseren:${key}`, { defaultValue: nl, ...vars }) as string;
export const coneKindLabel = (kind: ConeKind) => kind === "mechanical" ? t("cone.mechanical", "mechanisch") : t("cone.electrical", "elektrisch");

/** Kort label voor de grafiek, in de actieve taal; `null` bij een gemeten bestand. */
export function digitizedLabel(cpt: Cpt | null | undefined): string | null {
  const r = digitizedOf(cpt);
  return r ? t("label.badge", "gedigitaliseerd ({{cone}})", { cone: coneKindLabel(r.coneKind) }) : null;
}

/** Regel voor de paalberekening en haar uitdraai; `null` bij een gemeten bestand. */
export function digitizedNote(cpt: Cpt | null | undefined): string | null {
  const r = digitizedOf(cpt);
  return r ? t("label.note", "Sondering {{id}} is gedigitaliseerd van papier of scan (soort: {{cone}}; herkomst: {{origin}}). De nauwkeurigheid is lager dan die van een gemeten bestand.", { id: r.id, cone: coneKindLabel(r.coneKind), origin: r.origin }) : null;
}

/** Rubriek voor het testrapport van de sondering; `null` bij een gemeten bestand. Het rapport is Nederlandstalig. */
export function digitizedReportGroup(cpt: Cpt): { title: string; rows: Array<{ label: string; value: string | null }> } | null {
  const r = digitizedOf(cpt);
  if (!r) return null;
  const axis = (c: Calibration, unit: string) =>
    `diepte-as ${nlNumber(c.depth.va)} en ${nlNumber(c.depth.vb)} ${r.depthMode === "nap" ? "m NAP" : "m onder maaiveld"}; waarde-as ${nlNumber(c.value.va)} en ${nlNumber(c.value.vb)} ${unit}`;
  return {
    title: "Gedigitaliseerde sondering",
    rows: [
      { label: "Herkomst", value: r.origin },
      { label: "Soort sondering", value: `${CONE_NL[r.coneKind]}; overgenomen van papier of scan, niet uit een gemeten bestand` },
      { label: "Onderlegger", value: r.image.name || null },
      { label: "IJking qc", value: axis(r.qc.calibration, "MPa") },
      ...(r.second ? [{ label: r.second.kind === "fs" ? "IJking fs" : "IJking Rf", value: axis(r.second.calibration, r.second.kind === "fs" ? "MPa" : "%") }] : []),
      { label: "Aangeklikte punten", value: `${r.qc.points.length} voor qc${r.second ? `, ${r.second.points.length} voor ${r.second.kind === "fs" ? "fs" : "Rf"}` : "; fs en Rf zijn niet overgenomen"}` },
      { label: "Meetreeks", value: `${cpt.points.length} waarden op een stap van ${nlNumber(r.step)} m, ${r.interpolation === "step" ? "trapsgewijs per aflezing" : "lineair tussen de aangeklikte punten"}` },
      { label: "Nauwkeurigheid", value: "Lager dan die van een gemeten bestand: de waarden zijn met de hand van de grafiek afgelezen." },
    ],
  };
}
