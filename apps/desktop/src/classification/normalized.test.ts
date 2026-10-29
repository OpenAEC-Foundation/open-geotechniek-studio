import { it, expect } from "vitest";
import { normalizeCpt, zoneForIc } from "./normalized";
const example = {
  qcMpa: 10.1,
  fsMpa: 0.1,
  u2Mpa: 0,
  areaRatio: 0.8,
  totalStressKpa: 100,
  waterPressureKpa: 0,
};
it("matches a transparent reference point Qt=100, Fr=1, Bq=0", () => {
  const r = normalizeCpt(example);
  if (!r.ok) throw new Error(r.error);
  expect(r.Qt).toBe(100);
  expect(r.Fr).toBe(1);
  expect(r.Bq).toBe(0);
  expect(r.Ic).toBeCloseTo(Math.sqrt(1.47 ** 2 + 1.22 ** 2), 12);
  expect(r.zone.number).toBe(6);
});
it("corrects qt with measured u2 and the actual cone area ratio", () => {
  const r = normalizeCpt({
    ...example,
    qcMpa: 1,
    fsMpa: 0.01,
    u2Mpa: 0.2,
    waterPressureKpa: 50,
  });
  if (!r.ok) throw new Error(r.error);
  expect(r.qtMpa).toBeCloseTo(1.04, 12);
  expect(r.Qt).toBeCloseTo(18.8, 12);
  expect(r.Fr).toBeCloseTo(1000 / 940, 12);
  expect(r.Bq).toBeCloseTo(150 / 940, 12);
});
it.each([
  [1.309, 7],
  [1.31, 6],
  [2.05, 5],
  [2.6, 4],
  [2.95, 3],
  [3.6, 3],
  [3.601, 2],
])("assigns Ic %s to its published interval", (ic, n) =>
  expect(zoneForIc(ic)?.number).toBe(n),
);
it.each([
  { fsMpa: 0 },
  { qcMpa: 0 },
  { areaRatio: 0 },
  { areaRatio: 1.1 },
  { totalStressKpa: 0 },
  { waterPressureKpa: 100 },
  { qcMpa: 0.01 },
  { u2Mpa: Infinity },
])("rejects nonphysical or undefined logarithmic input %j", (change) =>
  expect(normalizeCpt({ ...example, ...change }).ok).toBe(false),
);
