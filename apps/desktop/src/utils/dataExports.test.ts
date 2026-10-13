import { describe, expect, it } from "vitest";
import type { Cpt } from "../types/cpt";
import { parseGef } from "../types/gefParser";
import { parseBroCptXml } from "../types/broCptParser";
import { cptToGef, cptToBroXml, cptToCsv, cptsToGeoJson } from "./dataExports";

const cpt: Cpt = {
  id: "S<&'1", metadata: { source_file: "source.gef", date: "2026-10-14", project_number: "P1" },
  position: { x_rd: 155000, y_rd: 463000, z_nap: 1.5 },
  points: [
    { depth: 0.1, depth_nap: 1.4, qc: 2, fs: 0.1, rf: 5, u2: 0.03, inclination: 2 },
    { depth: 0.2, depth_nap: 1.3 },
  ],
};

describe("browserexport", () => {
  it("GEF behoudt meetwaarden, lege kanalen, RD en NAP", () => {
    const result = parseGef(cptToGef(cpt), "export.gef");
    expect(result.id).toBe(cpt.id);
    expect(result.position).toEqual(cpt.position);
    expect(result.points).toEqual(cpt.points);
    expect(result.metadata.date).toBe(cpt.metadata.date);
  });
  it("BRO XML ontsnapt tekst en behoudt alle meetkanalen", () => {
    const result = parseBroCptXml(cptToBroXml(cpt), "export.xml");
    expect(result.id).toBe(cpt.id);
    expect(result.position).toEqual(cpt.position);
    expect(result.points).toEqual(cpt.points);
    expect(result.metadata.date).toBe(cpt.metadata.date);
  });
  it("CSV houdt ontbrekende waarden in de juiste kolom", () => {
    expect(cptToCsv(cpt)).toBe("depth,depth_nap,qc,fs,rf,u2,inclination\n0.1,1.4,2,0.1,5,0.03,2\n0.2,1.3,,,,,\n");
  });
  it("GeoJSON gebruikt lengtegraad vóór breedtegraad en slaat locaties zonder coördinaten over", () => {
    const result = cptsToGeoJson([cpt, { ...cpt, id: "zonder locatie", position: undefined }]);
    expect(result.features).toHaveLength(1);
    expect(result.features[0].geometry.coordinates).toEqual([5.38720621, 52.1551744]);
    expect(result.features[0].properties.max_depth).toBe(0.2);
  });
});
