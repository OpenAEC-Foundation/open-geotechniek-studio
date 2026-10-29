import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { rdToWgs84 } from "./coordinates";
const references = JSON.parse(
  readFileSync("../../tests/fixtures/bro/coordinates.json", "utf8"),
) as Array<{ id: string; x: number; y: number; lat: number; lon: number }>;
it.each(references)(
  "map approximation agrees within 0.5 m with BRO ETRS89 for $id",
  (p) => {
    const value = rdToWgs84(p.x, p.y),
      dy = (value.lat - p.lat) * 111320,
      dx = (value.lon - p.lon) * 111320 * Math.cos((p.lat * Math.PI) / 180);
    expect(Math.hypot(dx, dy)).toBeLessThan(0.5);
  },
);
