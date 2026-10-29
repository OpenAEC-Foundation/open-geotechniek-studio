/** Behavioral adaptations from Bedrock Engineer's Apache-2.0 parsers:
 * gef-parser-ts e895db2, src/depth-correction.ts (initial offset/pre-excavation)
 * bro-xml-parser-ts ed84e54, src/schemas/cpt-curation.ts (encoding/channel masks).
 * Modified for OGS: strict numbers, explicit diagnostics and preserved source quantities.
 * Copyright Bedrock Engineer contributors; upstream license in licenses/bedrock-Apache-2.0.txt.
 */
import type { MeasurementPoint } from "./cpt";
export function maskPreExcavation(
  points: MeasurementPoint[],
  depth: number | undefined,
  reference: "depth" | "penetration" = "depth",
): { points: MeasurementPoint[]; masked: number[] } {
  const masked: number[] = [];
  return {
    points: points.map((point, index) => {
      const position =
        reference === "penetration"
          ? Math.abs(
              point.parameters?.penetration_length_m ??
                point.parameters?.["1"] ??
                point.depth,
            )
          : point.depth;
      if (
        depth == null ||
        !Number.isFinite(depth) ||
        depth <= 0 ||
        position >= depth
      )
        return point;
      masked.push(point.parameters?.source_record ?? index + 1);
      return {
        ...point,
        pre_excavated: true,
        parameters: {
          ...point.parameters,
          ...Object.fromEntries(
            ["qc", "fs", "rf", "u2"].map((key) => [
              `source_${key}`,
              point[key as "qc" | "fs" | "rf" | "u2"] ?? null,
            ]),
          ),
        },
        qc: undefined,
        fs: undefined,
        rf: undefined,
        u2: undefined,
      };
    }),
    masked,
  };
}
export const BRO_CHANNELS: Record<string, string> = {
  penetrationLength: "length",
  depth: "depth",
  elapsedTime: "elapsedTime",
  coneResistance: "qc",
  correctedConeResistance: "correctedQc",
  netConeResistance: "netQc",
  magneticFieldStrengthX: "magX",
  magneticFieldStrengthY: "magY",
  magneticFieldStrengthZ: "magZ",
  magneticFieldStrengthTotal: "magTotal",
  electricalConductivity: "electricCond",
  inclinationEW: "inclEw",
  inclinationNS: "inclNs",
  inclinationX: "inclX",
  inclinationY: "inclY",
  inclinationResultant: "inclination",
  magneticInclination: "magInclination",
  magneticDeclination: "magDeclination",
  localFriction: "fs",
  poreRatio: "poreRatio",
  temperature: "temp",
  porePressureU1: "u1",
  porePressureU2: "u2",
  porePressureU3: "u3",
  frictionRatio: "rf",
};
