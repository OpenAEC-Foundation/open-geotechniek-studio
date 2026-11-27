// Open stalen buispaal. Bronnen: NEN 9997-1:2016+C2:2017, tabel 7.c (rij stalen
// paal, constante dwarsafmeting, open buis, geheid: αp 0,70, αs 0,006, αt 0,004,
// lastzakkingslijn 1), art. 7.6.2.3(d) en 7.6.2.1(13). De gevallen zijn met de
// hand nagerekend; de tabel met uitkomsten staat in NUMERIEKE-VERIFICATIE.md.
import { describe, expect, it } from "vitest";
import { computePile } from "./compute";
import { getPileType, resolvePileType } from "./catalog";
import { applyPileSystem, pileSystemIdOf } from "./pile-systems";
import { changeStandard } from "./standards";
import { openTubeAreas } from "./parts/open-tube";
import { buildPhysicalScene } from "./parts/physical-scene";
import fixture from "./__fixtures__/sondering-3bm-cgeo1.json";
import type { PileInput } from "./types";
import type { Cpt } from "../../../types/cpt";

// Synthetische sondering met overal qc = 5 MPa: qc;I = qc;II = qc;III = 5 MPa,
// dus q_b;max = ½ · αp · β · s · ((5 + 5)/2 + 5) = 0,7 · 5 = 3,5 MPa.
const cpt: Cpt = { id: "uniform", metadata: { source_file: "synthetisch", ground_level_nap: 0 }, points: [{ depth: 0, qc: 5 }, { depth: 30, qc: 5 }] };
const fx = fixture.input as PileInput;
// Buis Ø323,9 × 10, paalpunt NAP −14, positieve kleef vanaf NAP −8 (ΔL = 6 m) in zand.
const base: PileInput = { ...fx, cptId: cpt.id, diameterMm: 323.9, wallThicknessMm: 10,
  soilProfile: [{ kind: "sand-wet", startNap: fx.negKleefBottomNap, endNap: fx.pileToeNap, gammaK: 20, gammaW: 10, phi: 30 }] };
const open = (openTube?: PileInput["openTube"]): PileInput => ({ ...base, pileTypeId: "steel-pipe-driven-open", openTube });
const closed: PileInput = { ...base, pileTypeId: "steel-pipe-driven-closed-2017" };

describe("open stalen buispaal: tabel 7.c", () => {
  it("heeft de factoren van de rij 'open buis' uit tabel 7.c:2017", () => {
    const t = getPileType("steel-pipe-driven-open")!;
    expect([t.alphaP, t.alphaS, t.alphaT, t.beta, t.s, t.settlementLine]).toEqual([.7, .006, .004, 1, 1, 1]);
    expect(t.openEnd).toBe(true);
  });
  it("de gesloten buis blijft ongewijzigd", () => {
    const t = getPileType("steel-pipe-driven-closed-2017")!;
    expect([t.alphaP, t.alphaS, t.alphaT, t.openEnd]).toEqual([.7, .010, .007, undefined]);
    // Een achtergebleven openTube-veld verandert niets aan een gesloten buis.
    const a = computePile(closed, cpt), b = computePile({ ...closed, openTube: { plug: true, plugFactor: .3 } }, cpt);
    expect(b.base.rbCalMax).toBe(a.base.rbCalMax);
    expect(b.summary.rcNetD).toBe(a.summary.rcNetD);
    expect(a.base.openTube).toBeUndefined();
  });
  it("geen tabelwaarden voor 2025 en geen historische factoren: niets geschat", () => {
    expect(resolvePileType({ ...open(), standard: "nen-9997-2025" })?.factorsMissing).toBe(true);
    expect(resolvePileType({ ...open(), standard: "nen-9997-2012" })).toBeUndefined();
  });
});

// Handberekening (zie NUMERIEKE-VERIFICATIE.md, "Open stalen buispaal"):
// A_vol = π/4 · 323,9² = 82 397,1 mm²; A_binnen = π/4 · 303,9² = 72 535,6 mm²; A_ring = 9 861,5 mm².
// R_s = π · 0,3239 · 6 · αs · 5 · 1000 kN; R_c;d = (R_b + R_s) / 1,39 / 1,2.
const CASES = [
  { name: "open, zonder prop", input: open({ plug: false }), ab: 9861.5, rb: 34.52, rs: 183.16, rc: 217.68, rcd: 130.50 },
  { name: "open, met prop η = 0,5", input: open({ plug: true, plugFactor: .5 }), ab: 46129.3, rb: 161.45, rs: 183.16, rc: 344.61, rcd: 206.60 },
  { name: "open, met prop η = 1", input: open({ plug: true, plugFactor: 1 }), ab: 82397.1, rb: 288.39, rs: 183.16, rc: 471.55, rcd: 282.70 },
  { name: "gesloten (tabel 2017)", input: closed, ab: 82397.1, rb: 288.39, rs: 305.27, rc: 593.66, rcd: 355.91 },
] as const;

describe("open stalen buispaal: handgerekende gevallen", () => {
  it.each(CASES)("$name", ({ input, ab, rb, rs, rc, rcd }) => {
    const r = computePile(input, cpt);
    expect(r.ok).toBe(true);
    expect(r.base.qbMaxMpa).toBeCloseTo(3.5, 6);
    expect(r.base.abMm2).toBeCloseTo(ab, 0);
    expect(r.base.rbCalMax).toBeCloseTo(rb, 1);
    expect(r.shaft.rsCalMax).toBeCloseTo(rs, 1);
    expect(r.summary.rcCal).toBeCloseTo(rc, 1);
    expect(r.summary.rcD).toBeCloseTo(rcd, 1);
  });
  it("oppervlakken van de buis", () => {
    const a = openTubeAreas(323.9, 10);
    expect(a.fullMm2).toBeCloseTo(82397.1, 0);
    expect(a.innerMm2).toBeCloseTo(72535.6, 0);
    expect(a.ringMm2).toBeCloseTo(9861.5, 0);
  });
  it("EA van de open buis telt alleen de staalring", () => {
    const r = computePile(open(), cpt);
    expect(r.settlement.eaKn).toBeCloseTo(210_000 * 9861.5 / 1000, -2);
    // Gesloten buis: staalring plus betonvulling (ongewijzigd).
    expect(computePile(closed, cpt).settlement.eaKn).toBeCloseTo((210_000 * 9861.5 + 7_500 * 72535.6) / 1000, -2);
  });
});

describe("open stalen buispaal: keuzes en meldingen", () => {
  it("zonder openTube-veld: zonder prop", () => {
    expect(computePile(open(), cpt).base.abMm2).toBeCloseTo(9861.5, 0);
  });
  it.each([undefined, 0, -0.2, 1.2, NaN])("met prop rekent niet zonder geldige η (%s)", (plugFactor) => {
    const r = computePile(open({ plug: true, plugFactor }), cpt);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/propfactor/);
  });
  it("geen voetplaat of afwijkende puntmaat", () => {
    expect(computePile({ ...open(), baseDiameterMm: 340 }, cpt).ok).toBe(false);
  });
  it("meldt keuze, aannames en de grens boven 500 mm", () => {
    const no = computePile(open({ plug: false }), cpt).warnings.join(" ");
    expect(no).toMatch(/zonder prop/);
    expect(no).toMatch(/7\.6\.2\.3\(d\)/);
    expect(no).toMatch(/80 %/);
    const yes = computePile(open({ plug: true, plugFactor: .5 }), cpt).warnings.join(" ");
    expect(yes).toMatch(/met prop/);
    expect(yes).not.toMatch(/groter dan 500 mm/);
    const big = computePile({ ...open({ plug: true, plugFactor: .5 }), diameterMm: 610, wallThicknessMm: 12.5 }, cpt).warnings.join(" ");
    expect(big).toMatch(/groter dan 500 mm/);
  });
});

describe("open stalen buispaal: paalsysteem en 3D", () => {
  it("systeem en wissel", () => {
    const o = applyPileSystem(closed, "steel-tube-open");
    expect(o.pileTypeId).toBe("steel-pipe-driven-open");
    expect(o.openTube).toEqual({ plug: false });
    expect(pileSystemIdOf(o)).toBe("steel-tube-open");
    const back = applyPileSystem({ ...o, openTube: { plug: true, plugFactor: .4 } }, "steel-tube-closed");
    expect(back.openTube).toBeUndefined();
  });
  it("historische normversie: het open type is daar niet te rekenen", () => {
    expect(computePile(changeStandard(open(), "nen-9997-2012"), cpt).ok).toBe(false);
  });
  it("fysieke 3D: open buis zonder voetplaat; prop alleen met prop", () => {
    const t = resolvePileType(open());
    const without = buildPhysicalScene(open({ plug: false }), cpt, t)!;
    expect(without.pile.parts.map((p) => p.id)).toEqual(["shaft"]);
    expect(without.pile.parts[0].shape).toMatchObject({ kind: "round", wallM: .01, cutAway: true });
    const withPlug = buildPhysicalScene(open({ plug: true, plugFactor: .5 }), cpt, t)!;
    const plug = withPlug.pile.parts.find((p) => p.id === "plug")!;
    expect(plug.material).toBe("plug");
    expect(plug.schematic).toBe(true);
    expect(plug.shape).toMatchObject({ kind: "round", bottomNap: fx.pileToeNap });
  });
});
