// Ankerstaaf met verankering: geometrie per type, doorsnede van de staaf, de liggingcontrole met een handberekening en
// dat een berekening zonder type verankering dezelfde uitkomst houdt. Handberekening: VERIFICATIE.md, hoofdstuk 16.
import { describe, expect, it } from "vitest";
import { DEFAULT_TIE, computeWall, wallExample, type WallInput, type WallOk } from "./compute";
import { wallScene } from "./scene";
import { averagePhi, coarsePitch, defaultAnchorage, rodSection, stressArea, tieGeometry, tieGradeValues, tieLocation, validateAnchorage, type TieAnchorage } from "./tie-anchorage";

const ok = (i: WallInput): WallOk => { const r = computeWall(i); if (!r.ok) throw new Error(r.error); return r; };
const rad = (d: number) => (d * Math.PI) / 180;
const base = (patch: Partial<TieAnchorage> = {}): TieAnchorage => ({ ...defaultAnchorage("wall", { levelNap: -1, groundNap: 0, toeNap: -9 }), wallTopNap: -0.5, wallBottomNap: -3, wallProfileId: "", wallThicknessM: 0.2, lengthM: 12, ...patch });

describe("geometrie van de verankering per type", () => {
  it("ankerschot: voorkant op L · cos α, schot van boven- tot onderkant, passief glijvlak vanaf de onderkant", () => {
    const g = tieGeometry(-1, 0, base());
    expect(g.front).toEqual({ x: 12, z: -1 });
    expect(g.body).toEqual([{ x: 12, z: -0.5 }, { x: 12.2, z: -0.5 }, { x: 12.2, z: -3 }, { x: 12, z: -3 }]);
    expect(g.passiveFrom).toEqual({ x: 12, z: -3 });
    // De staaf loopt door het schot met de moer erachter: 0,20 m dik plus 0,15 m.
    expect(g.rodTo.x).toBeCloseTo(12.35, 12); expect(g.widthM).toBe(1.5);
    const tilted = tieGeometry(-1, 10, base());
    expect(tilted.front.x).toBeCloseTo(12 * Math.cos(rad(10)), 12); expect(tilted.front.z).toBeCloseTo(-1 - 12 * Math.sin(rad(10)), 12);
  });

  it("ankerschot van een damwandprofiel: dikte is de profielhoogte en het schot is doorgaand", () => {
    const g = tieGeometry(-1, 0, base({ wallProfileId: "AZ 18-700", wallManufacturer: "ArcelorMittal" }));
    expect(g.thicknessM).toBeCloseTo(0.42, 3); expect(g.widthM).toBeNull(); expect(g.profileId).toBe("AZ 18-700");
  });

  it("ankerpaal: kop aan het einde van de staaf, punt langs de helling van de wand af", () => {
    const an = base({ type: "pile", lengthM: 10, pileLengthM: 8, pileRakeDeg: 20, pileDiameterMm: 400 }), g = tieGeometry(-1, 0, an);
    expect(g.pileHead).toEqual({ x: 10.2, z: -0.8 });
    expect(g.pileToe!.x).toBeCloseTo(10.2 + 8 * Math.sin(rad(20)), 12); expect(g.pileToe!.z).toBeCloseTo(-0.8 - 8 * Math.cos(rad(20)), 12);
    expect(g.passiveFrom).toBeNull(); expect(g.body).toHaveLength(4);
    // Verticaal (helling 0): de punt recht onder de kop.
    expect(tieGeometry(-1, 0, { ...an, pileRakeDeg: 0 }).pileToe!.x).toBeCloseTo(10.2, 12);
  });

  it("ankerplaat: hart op het einde van de staaf, hoogte en dikte op schaal", () => {
    const g = tieGeometry(-1, 0, base({ type: "plate", lengthM: 8, plateHeightM: 1, plateThicknessM: 0.3, plateWidthM: 2 }));
    expect(g.topNap).toBeCloseTo(-0.5, 12); expect(g.bottomNap).toBeCloseTo(-1.5, 12); expect(g.passiveFrom).toEqual({ x: 8, z: -1.5 });
    expect(g.thicknessM).toBe(0.3); expect(g.widthM).toBe(2);
  });

  it("controle van de invoer per type", () => {
    expect(validateAnchorage(base())).toBeNull();
    expect(validateAnchorage(base({ lengthM: 0 }))).not.toBeNull();
    expect(validateAnchorage(base({ wallBottomNap: 0 }))).not.toBeNull();
    expect(validateAnchorage(base({ type: "pile", pileRakeDeg: 70 }))).not.toBeNull();
    expect(validateAnchorage(base({ type: "plate", plateHeightM: 0 }))).not.toBeNull();
  });
});

describe("doorsnede van de staaf", () => {
  it("spanningsdoorsnede π/4 · (d − 0,9382 · P)²: M48 × 5 = 1473 mm²; grove spoed volgens ISO 261", () => {
    expect(stressArea(48, 5)).toBeCloseTo((Math.PI / 4) * 43.309 ** 2, 6); expect(Math.round(stressArea(48, 5))).toBe(1473);
    expect(coarsePitch(36)).toBe(4); expect(coarsePitch(64)).toBe(6); expect(coarsePitch(90)).toBe(6);
  });

  it("gladde staaf, opgestuikte draad en eigen doorsneden", () => {
    const plain = rodSection({ ...DEFAULT_TIE, rodType: "plain", diameterMm: 48 });
    expect(plain.grossMm2).toBeCloseTo(Math.PI * 24 ** 2, 9); expect(plain.threadMm2).toBeCloseTo(stressArea(48, 5), 9);
    const upset = rodSection({ ...DEFAULT_TIE, rodType: "upset", diameterMm: 40, threadDiameterMm: 48, pitchMm: 5 });
    expect(upset.grossMm2).toBeCloseTo(Math.PI * 400, 9); expect(upset.threadMm2).toBeCloseTo(stressArea(48, 5), 9);
    // Zonder soort (oude berekeningen): de ingevulde doorsneden.
    expect(rodSection(DEFAULT_TIE)).toMatchObject({ grossMm2: 1257, threadMm2: 1000 });
    expect(tieGradeValues("S355", 30)).toEqual({ fyMPa: 355, fuMPa: 490 }); expect(tieGradeValues("S355", 48)).toEqual({ fyMPa: 335, fuMPa: 470 });
  });
});

describe("ligging van de verankering (handberekening)", () => {
  // Eén laag met φ′_d = 30°, teen NAP −9 m, maaiveld NAP 0, staaf horizontaal op NAP −1 m.
  const args = { id: "A1", levelNap: -1, angleDeg: 0, toeNap: -9, wallTopNap: 0, surfaceNap: 0, layers: [{ topNap: 0, phi: 30 }] };

  it("actief glijvlak onder 60°: op NAP −1 m ligt het 8 / tan 60° = 4,62 m achter de wand", () => {
    const r = tieLocation({ ...args, anchorage: base() }), slip = r.checks.find((c) => c.id === "tieSlip")!;
    expect(r.result.activeAngleDeg).toBeCloseTo(60, 12);
    expect(slip.load).toBeCloseTo(8 / Math.tan(rad(60)), 9); expect(slip.resistance).toBe(12); expect(slip.uc).toBeCloseTo(4.6188 / 12, 4); expect(slip.passes).toBe(true);
  });

  it("ankerschot tot NAP −3 m: x_min = 9 / tan 60° + 3 / tan 30° = 10,39 m; voldoet op 12 m, niet op 10 m", () => {
    const r = tieLocation({ ...args, anchorage: base() }), wedge = r.checks.find((c) => c.id === "tieWedge")!;
    expect(r.result.passive!.angleDeg).toBeCloseTo(30, 12);
    expect(wedge.load).toBeCloseTo(9 / Math.tan(rad(60)) + 3 / Math.tan(rad(30)), 9); expect(wedge.load).toBeCloseTo(10.3923, 4);
    expect(wedge.uc).toBeCloseTo(10.3923 / 12, 4); expect(wedge.passes).toBe(true);
    const short = tieLocation({ ...args, anchorage: base({ lengthM: 10 }) });
    expect(short.checks.find((c) => c.id === "tieWedge")!.passes).toBe(false); expect(short.result.passes).toBe(false);
  });

  it("ankerpaal: alleen het actieve glijvlak, op de kop van de paal; gemiddelde φ′ gewogen naar laagdikte", () => {
    const r = tieLocation({ ...args, anchorage: base({ type: "pile", lengthM: 4 }) });
    expect(r.checks.map((c) => c.id)).toEqual(["tieSlip"]); expect(r.checks[0].passes).toBe(false);
    expect(averagePhi([{ topNap: 0, phi: 30 }, { topNap: -4, phi: 35 }], 0, -9)).toBeCloseTo((4 * 30 + 5 * 35) / 9, 12);
  });

  it("de staaf die buiten het schot uitkomt geeft een melding", () => {
    expect(tieLocation({ ...args, angleDeg: 20, anchorage: base() }).warnings.length).toBeGreaterThan(0);
  });
});

describe("in de damwandberekening", () => {
  const example = wallExample();
  // Het voorbeeld heeft een anker onder 30° op NAP −1 m: het schot op 12 m langs de staaf zit dan rond NAP −7 m.
  const withWall = (patch: Partial<TieAnchorage> = {}): WallInput => ({ ...example, anchor: { ...example.anchor, kind: "tie", anchorage: base({ wallTopNap: -5.5, wallBottomNap: -8.5, ...patch }) } });

  it("zonder type verankering blijft alles gelijk; met type verandert alleen de toetslijst, niet het verenmodel", () => {
    const plain = ok(example), anchored = ok(withWall());
    expect(plain.ties).toEqual([]); expect(plain.checks.some((c) => c.id.startsWith("tie"))).toBe(false);
    expect(anchored.uls.maxMoment.value).toBe(plain.uls.maxMoment.value); expect(anchored.uls.anchor!.axialKn).toBe(plain.uls.anchor!.axialKn);
    expect(anchored.sls.maxDisplacement.value).toBe(plain.sls.maxDisplacement.value);
    // De staaftoets met de bestaande invoer (geen soort staaf) geeft dezelfde weerstand: 0,6 · 490 · 1000 / 1,25 = 235,2 kN.
    const tie = ok({ ...withWall(), anchor: { ...withWall().anchor, tie: { ...DEFAULT_TIE, enabled: true } } }).checks.find((c) => c.id === "tie")!;
    expect(tie.resistance).toBeCloseTo(235.2, 9);
  });

  it("de liggingcontroles staan in de toetsen, gerekend met φ′ als rekenwaarde aan de hoge zijde", () => {
    const r = ok(withWall()), t = r.ties[0], s = r.uls.scenario.high;
    expect(r.checks.filter((c) => c.id === "tieSlip" || c.id === "tieWedge")).toHaveLength(2);
    const direct = tieLocation({ id: "A1", levelNap: -1, angleDeg: 30, anchorage: withWall().anchor.anchorage!, toeNap: -9, wallTopNap: 0, surfaceNap: s.surfaceNap, layers: s.layers });
    expect(t.activeXM).toBeCloseTo(direct.result.activeXM, 12); expect(t.passive!.requiredXM).toBeCloseTo(direct.result.passive!.requiredXM, 12);
    expect(t.frontXM).toBeCloseTo(12 * Math.cos(rad(30)), 12);
    expect(r.warnings.some((w) => w.includes("Kranz"))).toBe(true);
  });

  it("de tekening: staaf op ware lengte, schot achter de wand, beide glijvlakken; een stempel zonder overkant gemarkeerd", () => {
    const r = ok(withWall()), s = wallScene(withWall(), r);
    expect(s.supports[0].tie?.type).toBe("wall"); expect(s.supports[0].freeM).toBe(12);
    expect(s.extentHighM).toBeGreaterThan(12 * Math.cos(rad(30)) + 0.2);
    expect(s.slip).not.toBeNull(); expect(s.passiveSlips).toHaveLength(1); expect(s.passiveSlips[0].fromNap).toBe(-8.5);
    expect(s.bottomNap).toBeLessThan(-9);
    const strut = { ...example, anchor: { ...example.anchor, kind: "strut" as const } };
    expect(wallScene(strut, ok(strut)).supports[0].open).toBe(true);
    // Zonder type: schematisch zoals voorheen.
    const plain = wallScene(example, ok(example));
    expect(plain.supports[0].tie).toBeNull(); expect(plain.passiveSlips).toEqual([]);
  });
});
