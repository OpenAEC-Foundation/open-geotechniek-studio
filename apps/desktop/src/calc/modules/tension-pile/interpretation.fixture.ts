// Kunstmatige sondering en invoer voor de toetsen van de grondlaaginterpretatie
// in de trekpalenmodule. Maaiveld NAP 0,00 m, meetpunten om de 0,1 m tot 22 m.
//   0 –  3 m  klei   qc 1,0 MPa
//   3 –  5 m  veen   qc 0,4 MPa
//   5 –  8 m  klei   qc 1,5 MPa
//   8 – 22 m  zand   qc 10 MPa, met een terugval naar 3 MPa van 12 tot 13 m
//                    en een vaster pakket van 14 MPa van 16 tot 18 m
import type { Cpt } from "../../../types/cpt";
import type { TensionInput } from "./compute";

function soilAt(depth: number): { qc: number; rf: number } {
  if (depth < 3) return { qc: 1, rf: 2 };
  if (depth < 5) return { qc: 0.4, rf: 3 };
  if (depth < 8) return { qc: 1.5, rf: 2 };
  if (depth >= 12 && depth < 13) return { qc: 3, rf: 0.8 };
  if (depth >= 16 && depth < 18) return { qc: 14, rf: 0.8 };
  return { qc: 10, rf: 0.8 };
}

export const fixtureCpt: Cpt = {
  id: "S1",
  metadata: { source_file: "kunstmatig", ground_level_nap: 0 },
  points: Array.from({ length: 221 }, (_, i) => {
    const depth = Math.round(i * 10) / 100;
    return { depth, depth_nap: -depth, ...soilAt(depth) };
  }),
};

export const fixtureInput: TensionInput = {
  cptId: "S1", pileTypeId: "prefab-concrete", sizeMm: 290,
  pileTopNap: -0.5, pileToeNap: -20, waterNap: -1,
  excavationReduction: "sqrt", ftMaxRepKn: 0, ftMinRepKn: 0, ftDKn: 0,
  cptCount: 1, stiffStructure: false, includeCohesive: true, halveCohesive: true,
};

export const fixtureGroupInput: TensionInput = {
  ...fixtureInput, excavationNap: -2, ftMaxRepKn: 200, ftMinRepKn: 50, ftDKn: 150,
  group: { spacingXM: 1.5, spacingYM: 1.5 },
};
