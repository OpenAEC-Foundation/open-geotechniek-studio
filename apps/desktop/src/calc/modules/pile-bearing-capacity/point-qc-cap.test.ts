// Optie "qc in traject I en II begrenzen op 15 MPa" (eigen, conservatieve keuze;
// NEN 9997-1 art. 7.6.2.3(e) begrenst alleen qb;max). Handberekeningen hieronder.

import { describe, it, expect } from "vitest";
import { computeBaseResistance } from "./parts/base-resistance";
import { computePile } from "./compute";
import { getPileType } from "./catalog";
import type { Cpt } from "../../../types/cpt";
import type { PileInput } from "./types";

const pileType = { ...getPileType("steel-pipe-driven-closed")!, isCircular: true }; // αp 0,70, β = s = 1
const cpt = (points: Cpt["points"]): Cpt => ({ id: "analytisch", metadata: { source_file: "synthetisch" }, points });

describe("qc-begrenzing 15 MPa in traject I en II", () => {
  it("constante qc = 20 MPa: zonder optie 14,0 MPa, met optie 10,5 MPa", () => {
    const c = cpt([{ depth: 0, qc: 20 }, { depth: 30, qc: 20 }]);
    const a = { pileToeDepth: 15, diameterMm: 1000, pileType };
    // Zonder: ½ · 0,7 · ((20 + 20)/2 + 20) = 14,0. Met: I = II = 15; III start op 15 → 15.
    // ½ · 0,7 · ((15 + 15)/2 + 15) = 10,5.
    expect(computeBaseResistance(c, a).qbMaxMpa).toBeCloseTo(14, 10);
    const r = computeBaseResistance(c, { ...a, qcCapMpa: 15 });
    expect(r.qcIGemMpa).toBeCloseTo(15, 10);
    expect(r.qcIIGemMpa).toBeCloseTo(15, 10);
    expect(r.qcIIIGemMpa).toBeCloseTo(15, 10);
    expect(r.qbMaxMpa).toBeCloseTo(10.5, 10);
  });

  it("lineair qc = diepte, punt op 14,5 m: snijpunt met 15 MPa binnen traject I", () => {
    // Deq = 1 m; eindpunt traject I op 0,7 Deq (qc stijgt met de diepte).
    // Met optie: qc;I = (0,5 · 14,75 + 0,2 · 15) / 0,7 = 14,8214 MPa; traject II gelijk.
    // Traject III (6,5-14,5 m) ligt onder 15 MPa: 10,5 MPa. Zonder optie qc;I = qc;II = 14,85.
    const c = cpt([{ depth: 0, qc: 0 }, { depth: 30, qc: 30 }]);
    const a = { pileToeDepth: 14.5, diameterMm: 1000, pileType };
    const off = computeBaseResistance(c, a), on = computeBaseResistance(c, { ...a, qcCapMpa: 15 });
    expect(off.qcIGemMpa).toBeCloseTo(14.85, 10);
    expect(off.qcIIGemMpa).toBeCloseTo(14.85, 10);
    expect(on.criticalDepthM).toBeCloseTo(0.7, 10);
    expect(on.qcIGemMpa).toBeCloseTo(10.375 / 0.7, 10);
    expect(on.qcIIGemMpa).toBeCloseTo(10.375 / 0.7, 10);
    expect(on.qcIIIGemMpa).toBeCloseTo(10.5, 10);
    expect(on.qbMaxMpa).toBeCloseTo(0.35 * (10.375 / 0.7 + 10.5), 10);
  });

  it("staat standaard uit en meldt zich in de uitvoer als hij aan staat", () => {
    const c: Cpt = { ...cpt([{ depth: 0, qc: 20 }, { depth: 30, qc: 20 }]), metadata: { source_file: "synthetisch", ground_level_nap: 0 } };
    const input: PileInput = {
      cptId: "analytisch", pileTypeId: "steel-pipe-driven-closed", diameterMm: 219, wallThicknessMm: 8,
      pileTopNap: 0, pileToeNap: -15, waterNap: -1, excavationNap: 0, nEd: 100, nEk: 80,
      gammaM: 1.2, gammaFnk: 1, negKleefBottomNap: -10, ksMinFactor: 0.25,
      soilProfile: [{ kind: "sand-wet", startNap: 0, endNap: -15, gammaK: 20, gammaW: 10, phi: 30 }],
    };
    const off = computePile(input, c), on = computePile({ ...input, capPointQc15: true }, c);
    if (!off.ok || !on.ok) throw new Error("berekening mislukt");
    expect(off.base.qbMaxMpa).toBeCloseTo(14, 8);
    expect(on.base.qbMaxMpa).toBeCloseTo(10.5, 8);
    const added = on.warnings.filter(w => !off.warnings.includes(w));
    expect(added).toHaveLength(1);
    expect(added[0]).toContain("15 MPa");
    expect(added[0]).toContain("7.6.2.3(e)");
    expect(on.shaft.rsCalMax).toBeCloseTo(off.shaft.rsCalMax, 10);
  });
});
