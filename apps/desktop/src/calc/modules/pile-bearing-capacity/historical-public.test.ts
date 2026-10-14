import { describe, expect, it } from "vitest";
import data from "./__fixtures__/historical-public-cases.json";
import fixture from "./__fixtures__/sondering-3bm-cgeo1.json";
import { resolvePileType } from "./catalog";
import { computeBaseResistanceFromAverages } from "./parts/base-resistance";
import { computeShaftFriction } from "./parts/shaft-friction";
import { computeSummary } from "./parts/summary";
import type { PileInput } from "./types";

describe("openbare historische referentieberekeningen", () => {
  for (const c of data.cases) {
    it(`${c.source}: punt, schacht en veiligheidsstap met gepubliceerde gemiddelden`, () => {
      const input = { ...fixture.input, pileTypeId: "concrete-prefab-prestressed-driven", standard: c.standard } as PileInput;
      const pileType = resolvePileType(input)!;
      const base = computeBaseResistanceFromAverages({ diameterMm: c.widthMm, pileType, qcIGemMpa: c.qcI, qcIIGemMpa: c.qcII, qcIIIGemMpa: c.qcIII });
      // qc is afgerond op 0,1 MPa. De toegestane fout volgt uit de bronprecisie.
      const baseTolerance = base.abMm2 / 1000 * .05 + .5;
      expect(Math.abs(base.qbMaxMpa - c.qbReference)).toBeLessThanOrEqual(.1);
      expect(Math.abs(base.rbCalMax - c.rbReference)).toBeLessThanOrEqual(baseTolerance);
      let rs = 0, shaftTolerance = 0;
      for (const layer of c.shaftLayers) {
        // Alleen het gepubliceerde sectorgemiddelde; geen gereconstrueerde CPT.
        const result = computeShaftFriction({ id: "sector", metadata: { source_file: c.source }, points: [{ depth: 0, qc: layer.qcMpa }, { depth: layer.lengthM, qc: layer.qcMpa }] }, {
          pileType, diameterMm: c.widthMm, negKleefBottomNap: 0, pileToeNap: -layer.lengthM, qcCapMpa: 12,
        }, [{ kind: "sand-wet", startNap: 0, endNap: -layer.lengthM, gammaK: 20, gammaW: 10, phi: 30 }]);
        // Sectoren uit 1991 zijn op 0,1 kN afgedrukt; de bron uit 2006 op 1 kN.
        const forceRounding = c.standard === "nen-6743-1991" ? .05 : .5;
        const tolerance = 4 * c.widthMm / 1000 * layer.lengthM * .01 * .05 * 1000 + forceRounding;
        expect(Math.abs(result.rsCalMax - layer.rsReference)).toBeLessThanOrEqual(tolerance + 1e-9);
        rs += result.rsCalMax;
        shaftTolerance += tolerance;
      }
      expect(Math.abs(rs - c.rsReference)).toBeLessThanOrEqual(shaftTolerance);
      const gammaM = c.standard === "nen-6743-1991" ? 1.25 : 1.2;
      const summary = computeSummary({ rbCalMax: base.rbCalMax, rsCalMax: rs, fnkD: 0, nEd: 0, gammaM, standard: input.standard });
      const xi = c.standard === "nen-6743-1991" ? .75 : .72;
      expect(Math.abs(summary.rcK - c.representativeReference)).toBeLessThanOrEqual(xi * (baseTolerance + shaftTolerance) + .5);
      if (c.designReference !== undefined) expect(Math.abs(summary.rcD - c.designReference)).toBeLessThanOrEqual(xi * (baseTolerance + shaftTolerance) / gammaM + .05);
    });
  }
});
