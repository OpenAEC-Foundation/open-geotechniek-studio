// Voorbeeldinvoer voor de tests van het digitaliseren.
import type { Calibration, Px } from "../calibration";
import type { DigitizedRecord } from "../record";

// Rechte grafiek: de diepte-as staat op x = 100 met 50 px per meter (y = 50 is 0 m), de qc-as op
// y = 50 met 20 px per MPa (x = 100 is 0 MPa).
export const STRAIGHT: Calibration = {
  depth: { a: { x: 100, y: 50 }, b: { x: 100, y: 1050 }, va: 0, vb: 20 },
  value: { a: { x: 100, y: 50 }, b: { x: 500, y: 50 }, va: 0, vb: 20 },
};
/** Het pixel bij een qc en een diepte in de rechte grafiek. */
export const at = (qc: number, depth: number): Px => ({ x: 100 + 20 * qc, y: 50 + 50 * depth });

/** Een complete invoer: mechanische sondering, qc 5 MPa tot 7,4 m en 12 MPa vanaf 7,6 m, tot 20 m. */
export function sampleRecord(patch: Partial<DigitizedRecord> = {}): DigitizedRecord {
  return {
    version: 1, id: "S-1961-07", date: "1961-05-17", groundLevelNap: -0.5, xRd: 155000, yRd: 463000,
    origin: "gedigitaliseerd van rapport 1234 d.d. 17-05-1961", coneKind: "mechanical", depthMode: "depth", step: 0.2, interpolation: "linear",
    image: { name: "rapport-1234.pdf", width: 600, height: 1100 },
    qc: { calibration: STRAIGHT, points: [at(5, 0), at(5, 7.4), at(12, 7.6), at(12, 20)] },
    ...patch,
  };
}
