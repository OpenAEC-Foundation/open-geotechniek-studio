import { expect, it } from "vitest";
import {
  analyzeLayers,
  withLayerInterpretation,
  LAYER_KEY,
} from "./layerAnalysis";
import type { Cpt, Layer } from "../types/cpt";
const cpt: Cpt = {
  id: "SYNTHETIC",
  metadata: { source_file: "synthetic.gef" },
  points: Array.from({ length: 101 }, (_, i) => ({
    depth: i * 0.02,
    qc: i >= 25 && i < 28 ? 1.5 : 8,
    rf: i >= 25 && i < 28 ? 6 : 0.7,
  })),
};
it("suppresses a short class excursion and keeps a sustained change with a shared boundary", () => {
  expect(analyzeLayers(cpt).layers).toHaveLength(1);
  const layered = {
    ...cpt,
    points: cpt.points.map((p, i) => (i >= 50 ? { ...p, qc: 1, rf: 2 } : p)),
  };
  const result = analyzeLayers(layered);
  expect(result.layers).toHaveLength(2);
  expect(result.layers[0].depth_bottom).toBe(result.layers[1].depth_top);
  expect(result.layers[1].zone_number).toBe(3);
});
it("never merges interpretations across a void gap", () => {
  const gap = {
    ...cpt,
    points: cpt.points.map((p, i) =>
      i >= 40 && i <= 60 ? { depth: p.depth } : p,
    ),
  };
  const result = analyzeLayers(gap);
  expect(result.layers).toHaveLength(2);
  expect(result.layers[0].depth_bottom).toBeLessThan(
    result.layers[1].depth_top,
  );
});
it("round-trips hand edits and their source attribution without changing raw measurements", () => {
  const manual: Layer[] = [
    {
      depth_top: 0,
      depth_bottom: 2,
      zone_number: 3,
      zone_name: "Klei",
      zone_color: "#4CAF50",
    },
  ];
  const edited = withLayerInterpretation(
      cpt,
      { minimumThicknessM: 0.2, hysteresisM: 0.2 },
      manual,
    ),
    roundtrip = JSON.parse(JSON.stringify(edited));
  expect(edited.points).toBe(cpt.points);
  expect(analyzeLayers(roundtrip).layers).toEqual(manual);
  expect(analyzeLayers(roundtrip).provenance).toMatchObject({
    schema: "ogs.layers/1",
    method: "manual",
    sourceFile: "synthetic.gef",
    cptId: "SYNTHETIC",
  });
});
it("rejects overlaps and invalid settings, and reports corrupt saved interpretations", () => {
  const layer = {
    depth_top: 0,
    depth_bottom: 2,
    zone_number: 3,
    zone_name: "Klei",
    zone_color: "#4CAF50",
  };
  expect(() =>
    withLayerInterpretation(cpt, { minimumThicknessM: 0.1, hysteresisM: 0.1 }, [
      layer,
      layer,
    ]),
  ).toThrow("overlap");
  expect(() =>
    withLayerInterpretation(cpt, { minimumThicknessM: NaN, hysteresisM: 0.1 }),
  ).toThrow("hysterese");
  expect(
    analyzeLayers({
      ...cpt,
      metadata: { ...cpt.metadata, extra: { [LAYER_KEY]: "broken" } },
    }),
  ).toMatchObject({
    layers: [],
    warnings: [expect.stringContaining("ongeldig")],
  });
});
