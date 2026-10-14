import { createServer } from "vite";
import { fileURLToPath } from "node:url";

// Uitvoeren: node apps/desktop/scripts/benchmark-pile.mjs
const server = await createServer({
  root: fileURLToPath(new URL("../", import.meta.url)),
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
});
try {
  const { computeBaseResistance } = await server.ssrLoadModule("/src/calc/modules/pile-bearing-capacity/parts/base-resistance.ts");
  const { getPileType } = await server.ssrLoadModule("/src/calc/modules/pile-bearing-capacity/catalog.ts");
  const cpt = {
    id: "benchmark",
    metadata: { source_file: "synthetisch" },
    points: Array.from({ length: 30001 }, (_, i) => ({
      depth: i * .001,
      qc: 10 + 4 * Math.sin(i * .007) + 2 * Math.cos(i * .019),
    })),
  };
  const args = { pileToeDepth: 20, diameterMm: 400, pileType: getPileType("steel-pipe-driven-closed") };
  for (let i = 0; i < 3; i++) computeBaseResistance(cpt, args);
  const times = [];
  for (let i = 0; i < 15; i++) {
    const start = performance.now();
    computeBaseResistance(cpt, args);
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  console.log(JSON.stringify({ medianMs: times[7], samples: times.length, points: cpt.points.length }));
} finally {
  await server.close();
}
