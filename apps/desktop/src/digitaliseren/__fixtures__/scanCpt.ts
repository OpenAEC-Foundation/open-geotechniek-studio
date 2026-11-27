// Een sondering zoals de eerdere werkwijze "Sondering uit scan" haar bewaarde: alleen conusweerstand op
// een stap van 0,02 m, de scan als bronbestand en één regel herkomst.
import type { Cpt } from "../../types/cpt";

/** qc loopt van 2 MPa op 1,00 m lineair naar 12 MPa op 3,00 m (0,1 MPa per stap). */
export function scanCpt(ground: number | null = -0.4): Cpt {
  const points = Array.from({ length: 101 }, (_, i) => {
    const depth = Math.round((1 + i * 0.02) * 1000) / 1000;
    return { depth, qc: Math.round((2 + i * 0.1) * 100) / 100, ...(ground !== null ? { depth_nap: Math.round((ground - depth) * 1000) / 1000 } : {}) };
  });
  return {
    id: "S-12",
    metadata: {
      source_file: "sondering-12.png",
      ...(ground !== null ? { ground_level_nap: ground } : {}),
      date: "1975-03-01",
      extra: { Herkomst: "Overgetekend van een scan (sondering-12.png); alleen de conusweerstand" },
    },
    position: { x_rd: 155000, y_rd: 463000, ...(ground !== null ? { z_nap: ground } : {}) },
    points,
  };
}
