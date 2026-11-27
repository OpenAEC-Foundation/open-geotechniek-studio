// Een gedigitaliseerde sondering doet mee in de paaldraagvermogenberekening en is daar als zodanig vermeld.
import { describe, expect, it } from "vitest";
import { computePile } from "../calc/modules/pile-bearing-capacity/compute";
import fixture from "../calc/modules/pile-bearing-capacity/__fixtures__/sondering-3bm-cgeo1.json";
import type { PileInput } from "../calc/modules/pile-bearing-capacity/types";
import type { Cpt } from "../types/cpt";
import { buildDigitizedCpt } from "./record";
import { sampleRecord } from "./__fixtures__/sample";

describe("gedigitaliseerde sondering in de paalberekening", () => {
  const cpt = buildDigitizedCpt(sampleRecord());
  // Het profiel van het voorbeeld loopt tot NAP -8 m; daaronder draagt een zandlaag, zodat ook de schacht meedoet.
  const input = {
    ...fixture.input, cptId: cpt.id,
    soilProfile: [...fixture.input.soilProfile, { kind: "sand-wet", startNap: -8, endNap: -20.5, gammaK: 20, gammaW: 10, phi: 32.5 }],
  } as PileInput;
  const result = computePile(input, cpt);

  it("geeft een geldige uitkomst", () => {
    expect(result.ok).toBe(true);
    expect(result.base.rbCalMax).toBeGreaterThan(0);
    expect(result.shaft.rsCalMax).toBeGreaterThan(0);
    expect(result.summary.rcD).toBeGreaterThan(0);
    expect(Number.isFinite(result.summary.unityCheck)).toBe(true);
  });

  it("rekent hetzelfde als met een gemeten sondering met dezelfde meetwaarden", () => {
    const measured: Cpt = { id: cpt.id, metadata: { source_file: "gemeten.gef", ground_level_nap: cpt.metadata.ground_level_nap }, points: cpt.points };
    const reference = computePile(input, measured);
    expect(result.base).toEqual(reference.base);
    expect(result.shaft).toEqual(reference.shaft);
    expect(result.summary).toEqual(reference.summary);
    expect(result.negKleef.fnkD).toBeCloseTo(fixture.expected.fnkD, 0);
    // Alleen de vermelding komt erbij.
    expect(result.warnings.slice(1)).toEqual(reference.warnings);
  });

  it("vermeldt bij de uitkomst dat de sondering gedigitaliseerd is, met het soort sondering en de herkomst", () => {
    expect(result.warnings[0]).toContain("Sondering S-1961-07 is gedigitaliseerd");
    expect(result.warnings[0]).toContain("mechanisch");
    expect(result.warnings[0]).toContain("rapport 1234");
    expect(computePile(input, { ...cpt, metadata: { source_file: "gemeten.gef", ground_level_nap: -0.5 } }).warnings.join(" ")).not.toContain("gedigitaliseerd");
  });
});
