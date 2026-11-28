// Trajectkeuze van de 4D-8D-methode (NEN 9997-1:2016+C2:2017, art. 7.6.2.3(e)).
//
// De standaard is de normkeuze (minimum qb;max). De keuze bij minimum qc;I
// ("legacy-qci", zoals de referentie kiest) gebruikt dezelfde afkapregels. Referentie: referentie-rapport 984, bladen 2-3 en 25
// (paal Ø219 mm gesloten buis, αp = 0,70). Tussenwaarden en de verklaring van
// het verschil bij S1 staan in NUMERIEKE-VERIFICATIE.md.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseGef } from "./__fixtures__/gefParser";
import { detectSoilLayers } from "./__fixtures__/soilDetector";
import { computeBaseResistance } from "./parts/base-resistance";
import { computePile } from "./compute";
import { getPileType } from "./catalog";
import type { Cpt } from "../../../types/cpt";

const pileType = getPileType("steel-pipe-driven-closed")!;
const DEQ = 0.219;
const load = (file: string) => parseGef(readFileSync(resolve(__dirname, "__fixtures__", file), "utf-8"), file);
const base = (cpt: Cpt, toeNap: number, method?: "legacy-qci") =>
  computeBaseResistance(cpt, { pileToeDepth: (cpt.metadata.ground_level_nap ?? 0) - toeNap, diameterMm: 219, pileType, method });

describe("trajectkeuze — sondering S1 uit referentie-rapport 984", () => {
  const cpt = load("121882_1.gef");
  it("keuze bij minimum qc;I reproduceert de referentie: eindpunt traject I op 0,7 Deq", () => {
    const r = base(cpt, -14.5, "legacy-qci");
    expect(r.criticalDepthM / DEQ).toBeCloseTo(0.7, 6);
    // Referentie blad 2-3: 17,97 / 17,73 / 13,91 MPa, Rb;cal;max = 419 kN.
    expect(r.qcIGemMpa).toBeCloseTo(17.97, 2);
    expect(Math.abs(r.qcIIGemMpa - 17.73)).toBeLessThan(0.05);
    expect(Math.abs(r.qcIIIGemMpa - 13.91)).toBeLessThan(0.15);
    expect(Math.abs(r.rbCalMax - 419)).toBeLessThan(3);
  });
  it("standaard (minimum qb;max, normconform) vindt de zwakke laag op 3,4-4 Deq onder de punt: 4,0 Deq en circa 367 kN", () => {
    // Gemeten qc daalt van circa 23 MPa (15,9 m) naar 12,8 MPa (16,1-16,2 m onder maaiveld).
    const r = base(cpt, -14.5);
    expect(r.criticalDepthM / DEQ).toBeCloseTo(4, 6);
    expect(r.qcIGemMpa).toBeCloseTo(18.91, 2);
    expect(r.qcIIGemMpa).toBeCloseTo(12.77, 2);
    expect(r.qcIIIGemMpa).toBeCloseTo(11.97, 2);
    expect(r.rbCalMax).toBeCloseTo(366.6, 0);
    // Ook op 0,7 Deq is qb;max niet lager: het minimum ligt op de rand van het zoekgebied.
    expect(r.qbMaxMpa).toBeLessThan(base(cpt, -14.5, "legacy-qci").qbMaxMpa * 0.9);
  });
  it("rekent met de normkeuze en meldt ter informatie de waarde bij minimum qc;I", () => {
    const soilProfile = detectSoilLayers(cpt, { waterNap: -0.16, topNap: 0.84, botNap: -14.5, minLayerThicknessM: 0.5 });
    const result = computePile({
      cptId: "S1", pileTypeId: "steel-pipe-driven-closed", diameterMm: 219, wallThicknessMm: 8,
      pileTopNap: 0.34, pileToeNap: -14.5, waterNap: -0.16, excavationNap: 0.84, nEd: 324, nEk: 303,
      gammaM: 1.2, gammaFnk: 1, negKleefBottomNap: -9, ksMinFactor: 0.25, soilProfile,
    }, cpt);
    if (!result.ok) throw new Error(result.error);
    expect(result.base.rbCalMax).toBeCloseTo(366.6, 0);
    const warning = result.warnings.find(w => w.includes("7.6.2.3(e)"));
    expect(warning).toBeDefined();
    expect(warning).toContain("417");
  });
});

describe("trajectkeuze — overige sonderingen uit referentie-rapport 984", () => {
  // Bij deze sonderingen vallen beide keuzes binnen 1 % van elkaar.
  const cases: Array<[string, number, number]> = [
    ["121882_2.gef", -17, 265], ["121882_3.gef", -14.5, 320], ["121882_4.gef", -14.5, 378], ["121882_5.gef", -14.5, 341],
    ["121882_6.gef", -14.5, 326], ["121882_7.gef", -14.5, 243], ["121882_8.gef", -14.5, 255],
  ];
  for (const [file, toe, rbRef] of cases) {
    it(`${file}: normkeuze en bestaande keuze verschillen minder dan 1 %; Rb binnen 3 % van ${rbRef} kN`, () => {
      const cpt = load(file);
      const a = base(cpt, toe, "legacy-qci"), n = base(cpt, toe);
      expect(n.rbCalMax).toBeLessThanOrEqual(a.rbCalMax + 1e-9);
      expect(1 - n.rbCalMax / a.rbCalMax).toBeLessThan(0.01);
      expect(Math.abs(a.rbCalMax - rbRef) / rbRef).toBeLessThan(0.03);
      expect(Math.abs(n.rbCalMax - rbRef) / rbRef).toBeLessThan(0.03);
    });
  }
  it("S2 (paalpunt NAP −17,00, blad 25): 14,51 / 13,62 / 6,03 MPa", () => {
    const r = base(load("121882_2.gef"), -17);
    expect(Math.abs(r.qcIGemMpa - 14.51)).toBeLessThan(0.05);
    expect(Math.abs(r.qcIIGemMpa - 13.62)).toBeLessThan(0.05);
    expect(Math.abs(r.qcIIIGemMpa - 6.03)).toBeLessThan(0.05);
  });
});

describe("afkapregel traject II (art. 7.6.2.3(e))", () => {
  it("start bij de gemeten qc op het eindpunt van traject I, zonder begrenzing op qc;I", () => {
    // qc = diepte (MPa); paalpunt 10 m, Deq 1 m. Minimum qc;I bij 0,7 Deq: 10,35 MPa.
    // Traject II loopt van 10,7 naar 10 m met dalende qc: elke waarde telt, gemiddeld 10,35.
    // Met een begrenzing op qc;I zou het 10,2625 MPa worden.
    const cpt: Cpt = { id: "lineair", metadata: { source_file: "synthetisch" }, points: [{ depth: 0, qc: 0 }, { depth: 20, qc: 20 }] };
    const r = computeBaseResistance(cpt, { pileToeDepth: 10, diameterMm: 1000, pileType: { ...pileType, isCircular: true }, method: "legacy-qci" });
    expect(r.criticalDepthM).toBeCloseTo(0.7, 8);
    expect(r.qcIGemMpa).toBeCloseTo(10.35, 8);
    expect(r.qcIIGemMpa).toBeCloseTo(10.35, 8);
  });
});
