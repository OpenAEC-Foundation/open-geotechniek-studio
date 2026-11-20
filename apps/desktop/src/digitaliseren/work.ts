// De werktoestand van het scherm: wat de gebruiker tot nu toe heeft aangeklikt en ingevuld, met
// tekstvelden zoals ze getypt zijn. Hieruit volgt het vastgelegde `DigitizedRecord` en omgekeerd.
import { solveCalibration, toPixel, type Calibration, type Px } from "./calibration";
import type { ConeKind, DigitizedRecord } from "./record";
import { DEFAULT_STEP, normalizeReadings, readingsFromPixels, type DepthMode, type Interpolation, type SecondKind } from "./series";

export interface AxisWork { a: Px | null; b: Px | null; va: string; vb: string }
export interface SeriesWork { depth: AxisWork; value: AxisWork; points: Px[] }
export type SeriesId = "qc" | "second";

/** Alles wat met ongedaan maken terugkomt. */
export interface Work {
  qc: SeriesWork;
  second: SeriesWork;
  secondKind: "none" | SecondKind;
  /** De tweede reeks gebruikt de diepte-as van qc (zelfde grafiek of zelfde blad). */
  shareDepth: boolean;
}

export interface Header {
  id: string; date: string; groundLevel: string; x: string; y: string; origin: string;
  coneKind: ConeKind; depthMode: DepthMode; step: string; interpolation: Interpolation;
}

const emptyAxis = (): AxisWork => ({ a: null, b: null, va: "", vb: "" });
const emptySeries = (): SeriesWork => ({ depth: emptyAxis(), value: emptyAxis(), points: [] });
export const emptyWork = (): Work => ({ qc: emptySeries(), second: emptySeries(), secondKind: "none", shareDepth: true });
export const emptyHeader = (): Header => ({
  id: "", date: "", groundLevel: "", x: "", y: "", origin: "",
  coneKind: "mechanical", depthMode: "depth", step: text(DEFAULT_STEP.mechanical), interpolation: "linear",
});

/** Getal uit een tekstveld; een komma mag. Leeg of onleesbaar geeft NaN. */
export const num = (s: string) => (s.trim() === "" ? NaN : Number(s.trim().replace(",", ".")));
export function text(v: number | undefined): string { return v === undefined || !Number.isFinite(v) ? "" : String(v).replace(".", ","); }

const NOWHERE: Px = { x: NaN, y: NaN };

/** De ijking van een reeks; ontbrekende punten en waarden worden NaN en vallen dan af bij de controle. */
export function calibrationOf(work: Work, series: SeriesId): Calibration {
  const s = work[series], depth = series === "second" && work.shareDepth ? work.qc.depth : s.depth;
  const axis = (a: AxisWork) => ({ a: a.a ?? NOWHERE, b: a.b ?? NOWHERE, va: num(a.va), vb: num(a.vb) });
  return { depth: axis(depth), value: axis(s.value) };
}

export function toRecord(work: Work, header: Header, image: { name: string; width: number; height: number }): DigitizedRecord {
  const x = num(header.x), y = num(header.y);
  return {
    version: 1,
    id: header.id.trim(),
    date: header.date || undefined,
    groundLevelNap: num(header.groundLevel),
    xRd: header.x.trim() ? x : undefined,
    yRd: header.y.trim() ? y : undefined,
    origin: header.origin.trim(),
    coneKind: header.coneKind,
    depthMode: header.depthMode,
    step: num(header.step),
    interpolation: header.interpolation,
    image,
    qc: { calibration: calibrationOf(work, "qc"), points: work.qc.points },
    second: work.secondKind === "none" ? undefined : { kind: work.secondKind, calibration: calibrationOf(work, "second"), points: work.second.points },
  };
}

export function fromRecord(r: DigitizedRecord): { work: Work; header: Header } {
  const axis = (a: Calibration["depth"]): AxisWork => ({ a: a.a, b: a.b, va: text(a.va), vb: text(a.vb) });
  const series = (s: { calibration: Calibration; points: Px[] }): SeriesWork => ({ depth: axis(s.calibration.depth), value: axis(s.calibration.value), points: s.points });
  const same = (a: Calibration["depth"], b: Calibration["depth"]) => JSON.stringify(a) === JSON.stringify(b);
  return {
    work: {
      qc: series(r.qc),
      second: r.second ? series(r.second) : emptySeries(),
      secondKind: r.second?.kind ?? "none",
      shareDepth: !r.second || same(r.second.calibration.depth, r.qc.calibration.depth),
    },
    header: {
      id: r.id, date: r.date ?? "", groundLevel: text(r.groundLevelNap), x: text(r.xRd), y: text(r.yRd), origin: r.origin,
      coneKind: r.coneKind, depthMode: r.depthMode, step: text(r.step), interpolation: r.interpolation,
    },
  };
}

/**
 * De lijn die over de onderlegger wordt getekend: door de aangeklikte punten op volgorde van diepte,
 * recht of trapsgewijs. Zonder bruikbare ijking volgt hij de punten in de volgorde van aanklikken.
 */
export function previewLine(work: Work, series: SeriesId, interpolation: Interpolation): { points: Px[]; calibrated: boolean } {
  const m = solveCalibration(calibrationOf(work, series));
  if (!m) return { points: work[series].points, calibrated: false };
  // De omrekening naar diepte onder maaiveld valt hier weg: de lijn gaat terug naar dezelfde as.
  const { readings } = normalizeReadings(readingsFromPixels(work[series].points, m, "depth", 0));
  const out: Px[] = [];
  readings.forEach((r, i) => {
    out.push(toPixel(m, r.value, r.depth));
    if (interpolation === "step" && i < readings.length - 1) out.push(toPixel(m, r.value, readings[i + 1].depth));
  });
  return { points: out, calibrated: true };
}
