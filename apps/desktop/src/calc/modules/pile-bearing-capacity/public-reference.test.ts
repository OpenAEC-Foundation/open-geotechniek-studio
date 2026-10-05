import { describe, expect, it } from "vitest";
import reference from "./__fixtures__/public-reference-cases.json";
import { computeBaseResistanceFromAverages } from "./parts/base-resistance";
import { computeShaftFriction } from "./parts/shaft-friction";
import type { PileTypeSpec } from "./types";

describe("100 openbare referentiegevallen — componentcontrole met bronfactoren", () => {
  it("bevat 100 verschillende bronregels", () => {
    expect(reference.cases).toHaveLength(100);
    expect(new Set(reference.cases.map(c => `${c.source}/${c.page}/${c.cpt}/${c.toeNap}`)).size).toBe(100);
  });

  for (const c of reference.cases) {
    it(`${c.id}: ${c.source} p.${c.page}, sondering ${c.cpt}, punt ${c.toeNap} m NAP`, () => {
      const pileType: PileTypeSpec = {
        id: "reference", name: "Referentiepaal", alphaP: c.alphaP, alphaS: c.alphaS,
        alphaT: 0, beta: c.beta, s: c.s, isCircular: c.isCircular,
      };
      const base = computeBaseResistanceFromAverages({
        diameterMm: c.baseMm, pileType,
        qcIGemMpa: c.qcI, qcIIGemMpa: c.qcII, qcIIIGemMpa: c.qcIII,
      });
      // De bron rondt qc af op 0,1 MPa, qb op 0,01 MPa en krachten op 1 kN.
      // Toleranties volgen uit deze afrondingen, niet uit de gemeten afwijking.
      const pressureUncertainty = c.alphaP * c.beta * c.s * 0.05;
      expect(Math.abs(base.qbMaxMpa - c.qbReference)).toBeLessThanOrEqual(pressureUncertainty + 0.005 + 1e-9);
      expect(Math.abs(base.rbCalMax - c.rbReference)).toBeLessThanOrEqual(base.abMm2 / 1000 * pressureUncertainty + 0.5 + 1e-9);

      // Een constante qc over de bronlaagdikte representeert uitsluitend het
      // gepubliceerde laaggemiddelde; dit is geen gereconstrueerde sondering.
      const shaft = computeShaftFriction({
        id: c.id, metadata: { source_file: c.source, ground_level_nap: 0 },
        points: [{ depth: 0, qc: c.qcShaft }, { depth: c.shaftLengthM, qc: c.qcShaft }],
      }, {
        pileType, diameterMm: c.shaftMm, negKleefBottomNap: 0, pileToeNap: -c.shaftLengthM,
      }, [{ kind: "sand-wet", startNap: 0, endNap: -c.shaftLengthM, gammaK: 20, gammaW: 10, phi: 30 }]);
      const perimeter = (c.isCircular ? Math.PI : 4) * c.shaftMm / 1000;
      const shaftUncertainty = perimeter * c.shaftLengthM * c.alphaS * 0.05 * 1000 + 0.5;
      expect(Math.abs(shaft.rsCalMax - c.rsReference)).toBeLessThanOrEqual(shaftUncertainty + 1e-9);
    });
  }
});
