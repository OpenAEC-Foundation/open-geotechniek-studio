import { expect, it } from "vitest";
import {
  excludeDepthOutliers,
  withBroOutliers,
  outliersOf,
  BRO_OUTLIERS_KEY,
} from "./depthOutliers";
import type { Cpt } from "../types/cpt";
it("excludes an isolated spike without hiding all later measurements", () => {
  const all = [1, 2, 200, 3, 4].map((depth) => ({ depth }));
  expect(excludeDepthOutliers(all)).toEqual({
    points: [all[0], all[1], all[3], all[4]],
    excluded: [3],
  });
  const cpt: Cpt = {
    id: "test",
    metadata: {
      source_file: "synthetic",
      extra: {
        [BRO_OUTLIERS_KEY]: JSON.stringify({
          all,
          excluded: [3],
          included: false,
        }),
      },
    },
    points: excludeDepthOutliers(all).points,
  };
  const included = withBroOutliers(cpt, true);
  expect(included.points).toHaveLength(5);
  expect(outliersOf(included)?.included).toBe(true);
  expect(
    withBroOutliers(JSON.parse(JSON.stringify(included)), false).points,
  ).toEqual(cpt.points);
});
it("retains repeated depths and source indices", () => {
  const all = [1, 1, 0, 2].map((depth, i) => ({
    depth,
    parameters: { source_record: 10 + i },
  }));
  expect(excludeDepthOutliers(all).excluded).toEqual([12]);
});
