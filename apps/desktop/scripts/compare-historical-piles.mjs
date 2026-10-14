import { createServer } from "vite";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const folder = "/src/calc/modules/pile-bearing-capacity/";
const server = await createServer({ root, configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false }, appType: "custom" });
try {
  const { resolvePileType } = await server.ssrLoadModule(folder + "catalog.ts");
  const { computeBaseResistanceFromAverages, computeBaseResistance } = await server.ssrLoadModule(folder + "parts/base-resistance.ts");
  const { computeShaftFriction } = await server.ssrLoadModule(folder + "parts/shaft-friction.ts");
  const { computeSummary } = await server.ssrLoadModule(folder + "parts/summary.ts");
  const fixture = JSON.parse(await readFile(root + folder + "__fixtures__/historical-public-cases.json", "utf8"));
  const comparisons = fixture.cases.map(c => {
    const input = { pileTypeId: "concrete-prefab-prestressed-driven", standard: c.standard };
    const pileType = resolvePileType(input);
    const averages = { diameterMm: c.widthMm, qcIGemMpa: c.qcI, qcIIGemMpa: c.qcII, qcIIIGemMpa: c.qcIII };
    const base = computeBaseResistanceFromAverages({ ...averages, pileType });
    const rb2017 = computeBaseResistanceFromAverages({ ...averages, pileType: resolvePileType({ ...input, standard: "nen-9997-2017" }) }).rbCalMax;
    let rs = 0;
    for (const l of c.shaftLayers) {
      rs += computeShaftFriction({ id: "sector", metadata: { source_file: c.source }, points: [{ depth: 0, qc: l.qcMpa }, { depth: l.lengthM, qc: l.qcMpa }] }, {
        pileType, diameterMm: c.widthMm, negKleefBottomNap: 0, pileToeNap: -l.lengthM, qcCapMpa: 12,
      }, [{ kind: "sand-wet", startNap: 0, endNap: -l.lengthM, gammaK: 20, gammaW: 10, phi: 30 }]).rsCalMax;
    }
    const summary = computeSummary({ rbCalMax: base.rbCalMax, rsCalMax: rs, fnkD: 0, nEd: 0, gammaM: c.standard === "nen-6743-1991" ? 1.25 : 1.2, standard: c.standard });
    return { source: c.source, standard: c.standard,
      reference: { rbKn: c.rbReference, rsKn: c.rsReference, representativeKn: c.representativeReference, designKn: c.designReference },
      calculated: { rbKn: base.rbCalMax, rsKn: rs, representativeKn: summary.rcK, designKn: summary.rcD },
      differenceKn: { rb: base.rbCalMax - c.rbReference, rs: rs - c.rsReference, representative: summary.rcK - c.representativeReference },
      sameAveragesWith2017Factors: { rbKn: rb2017 },
    };
  });
  const annex = JSON.parse(await readFile(root + folder + "__fixtures__/historical-annex-cpt.json", "utf8"));
  const base = computeBaseResistance({ id: "bijlage-A", metadata: { source_file: annex.source }, points: annex.points }, { pileToeDepth: annex.toeDepth, diameterMm: annex.roundedDeqMm, pileType: { ...resolvePileType({ pileTypeId: "concrete-prefab-prestressed-driven", standard: "nen-6743-2006" }), isCircular: true }, method: "minimum-qb" });
  console.log(JSON.stringify({ sources: fixture.sources, comparisons, annex: { source: annex.source, qbReferenceMpa: annex.qbReference, qbCalculatedMpa: base.qbMaxMpa, criticalDepthM: base.criticalDepthM } }, null, 2));
} finally {
  await server.close();
}
