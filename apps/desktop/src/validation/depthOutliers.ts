import type { Cpt, MeasurementPoint } from "../types/cpt";
export const BRO_OUTLIERS_KEY = "ogs:bro-outliers";
/** Longest non-decreasing subsequence, O(n log n). A single spike cannot hide the remaining sounding. */
export function excludeDepthOutliers(points: MeasurementPoint[]): {
  points: MeasurementPoint[];
  excluded: number[];
} {
  const tails: number[] = [],
    previous: number[] = new Array(points.length).fill(-1);
  points.forEach((point, i) => {
    let lo = 0,
      hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (points[tails[mid]].depth <= point.depth) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) previous[i] = tails[lo - 1];
    tails[lo] = i;
  });
  const included = new Set<number>();
  let at = tails.length ? tails[tails.length - 1] : -1;
  while (at >= 0) {
    included.add(at);
    at = previous[at];
  }
  return {
    points: points.filter((_, i) => included.has(i)),
    excluded: points.flatMap((p, i) =>
      included.has(i) ? [] : [p.parameters?.source_record ?? i + 1],
    ),
  };
}
export function outliersOf(
  cpt: Cpt,
): { all: MeasurementPoint[]; excluded: number[]; included: boolean } | null {
  try {
    const value = JSON.parse(cpt.metadata.extra?.[BRO_OUTLIERS_KEY] ?? "null");
    return value && Array.isArray(value.all) && Array.isArray(value.excluded)
      ? value
      : null;
  } catch {
    return null;
  }
}
export function withBroOutliers(cpt: Cpt, included: boolean): Cpt {
  const data = outliersOf(cpt);
  if (!data) return cpt;
  return {
    ...cpt,
    points: included ? data.all : excludeDepthOutliers(data.all).points,
    metadata: {
      ...cpt.metadata,
      extra: {
        ...cpt.metadata.extra,
        [BRO_OUTLIERS_KEY]: JSON.stringify({ ...data, included }),
      },
    },
  };
}
