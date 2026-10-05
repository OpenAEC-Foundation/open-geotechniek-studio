import { describe, expect, it } from "vitest";
import { computeBaseResistance } from "./base-resistance";
import { computeShaftFriction } from "./shaft-friction";
import { getPileType } from "../catalog";
import type { Cpt } from "../../../../types/cpt";
import annex from "../__fixtures__/historical-annex-cpt.json";
const pileType = { ...getPileType("concrete-prefab-prestressed-driven")!, alphaP: 1 };
const cpt = (points: Cpt["points"]): Cpt => ({ id: "analytisch", metadata: { source_file: "synthetisch" }, points });

describe("historische trajectprocedure", () => {
  it("vergelijkt het tabellarische CPT-profiel uit bijlage A met de gepubliceerde puntweerstand", () => {
    // Het normvoorbeeld rondt Deq af op 400 mm. Alleen qb wordt hier
    // vergeleken; het eveneens afgeronde puntoppervlak wordt niet overgenomen.
    const result = computeBaseResistance(cpt(annex.points), { pileToeDepth: annex.toeDepth, diameterMm: annex.roundedDeqMm, pileType: { ...pileType, isCircular: true }, method: "minimum-qb" });
    expect(Math.abs(result.qbMaxMpa - annex.qbReference)).toBeLessThanOrEqual(.1);
  });
  it("minimaliseert de volledige puntweerstand in plaats van alleen qc;I", () => {
    const result = computeBaseResistance(cpt([{ depth: 0, qc: 10 }, { depth: 10.7, qc: 10 }, { depth: 11, qc: 30 }, { depth: 13.9, qc: 30 }, { depth: 14, qc: 1 }, { depth: 20, qc: 1 }]), {
      pileToeDepth: 10, diameterMm: 1000, pileType: { ...pileType, isCircular: true }, method: "minimum-qb",
    });
    expect(result.criticalDepthM).toBeCloseTo(4, 8);
    expect(result.qcIGemMpa).toBeCloseTo(25.3875, 8);
    expect(result.qcIIGemMpa).toBeCloseTo(1, 8);
    expect(result.qcIIIGemMpa).toBeCloseTo(1, 8);
  });
  it("start traject II bij de gemeten conusweerstand, zonder extra qc;I-begrenzing", () => {
    const result = computeBaseResistance(cpt([{ depth: 0, qc: 1 }, { depth: 20, qc: 21 }]), {
      pileToeDepth: 10, diameterMm: 1000, pileType: { ...pileType, isCircular: true }, method: "minimum-qb",
    });
    expect(result.qcIGemMpa).toBeCloseTo(11.35, 8);
    expect(result.qcIIGemMpa).toBeCloseTo(11.35, 8);
  });
  it("snijdt een lineaire schachtpiek op exact 12 MPa af", () => {
    const result = computeShaftFriction(cpt([{ depth: 0, qc: 4 }, { depth: 1, qc: 20 }]), {
      pileType, diameterMm: 1000, negKleefBottomNap: 0, pileToeNap: -1, qcCapMpa: 12,
    }, [{ kind: "sand-wet", startNap: 0, endNap: -1, gammaK: 20, gammaW: 10, phi: 30 }]);
    expect(result.perLayer[0].qcGemMpa).toBeCloseTo(10, 8);
    expect(result.rsCalMax).toBeCloseTo(400, 8);
  });
});
