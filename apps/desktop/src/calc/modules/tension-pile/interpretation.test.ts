// Aanpassingen van de grondlaaginterpretatie in de trekpaalberekening.
//
// De sondering is kunstmatig (interpretation.fixture.ts), zodat elk verschil
// met de hand na te rekenen is. Voor een alleenstaande paal zonder ontgraving
// en zonder afsnuiten is de schachtwrijving volgens NEN 9997-1 art. 7.6.3.3
//   R_t;d = O_s · Σ α_t · q_c;z;d · Δz,  q_c;z;d = q_c / (ξ · γ_m;var;qc · γ_s;t)
// dus lineair in de conusweerstand per laag. Hier: prefab □290 (O_s = 1,16 m,
// α_t = 0,007 in zand), ξ3 = 1,39 bij één sondering, γ_m;var;qc = 1,00 en
// γ_s;t = 1,35, dus per MPa·m zand 1,16 · 0,007 · 1000 / 1,8765 = 4,3272 kN.
import { describe, expect, it } from "vitest";
import { computeTension, tensionInterpretation, type TensionInput, type TensionOverride, type TensionResult } from "./compute";
import { computeTensionTable } from "./table";
import { buildTensionReport } from "./report";
import { fixtureCpt as cpt, fixtureGroupInput as groupInput, fixtureInput as input } from "./interpretation.fixture";
import { toIfcxArray, fromIfcxArray } from "../../framework/persistence";
import { useCalculationsStore } from "../../framework/store";
import type { Cpt } from "../../../types/cpt";

const ok = (r: TensionResult) => { if (!r.ok) throw new Error(r.error); return r; };
const run = (i: TensionInput) => ok(computeTension(i, cpt));
const withOverrides = (base: TensionInput, ...o: TensionOverride[]): TensionInput => ({ ...base, interpretationOverrides: o });
const override = (id: string, topNap: number, bottomNap: number, rest: Partial<TensionOverride>): TensionOverride => ({ id, cptId: "S1", topNap, bottomNap, ...rest });

/** Schachtwrijving per MPa·m zand [kN]: O_s · α_t · 1000 / (ξ · γ_m;var;qc · γ_s;t). */
const KN_PER_MPA_M = 1.16 * 0.007 * 1000 / (1.39 * 1.0 * 1.35);

describe("zonder aanpassingen blijft de uitkomst gelijk", () => {
  // Vastgelegd met de rekenkern van vóór de aanpassingen, op dezelfde sondering en invoer.
  it("alleenstaande paal: dezelfde getallen als voorheen", () => {
    const r = run(input);
    expect(r.rSingleKn).toBe(565.6931787903014);
    expect(r.rFrictionKn).toBe(565.6931787903014);
    expect(r.gPileKn).toBe(19.80172727272727);
    expect(r.rtDKn).toBe(585.4949060630287);
    expect(r.layers).toHaveLength(42);
    expect(r.interpretation).toBeUndefined();
  });
  it("paal in een groep met ontgraving: dezelfde getallen als voorheen", () => {
    const r = run(groupInput);
    expect(r.rSingleKn).toBe(412.730731184083);
    expect(r.rFrictionKn).toBe(227.7862382380505);
    expect(r.group!.rKluitKn).toBe(242.61642740680023);
    expect(r.rtDKn).toBe(247.58796551077776);
    expect(r.unityCheck).toBe(0.6058452788306883);
  });
  it("een lege lijst en aanpassingen van een andere sondering veranderen niets", () => {
    const plain = run(input);
    expect(run(withOverrides(input))).toEqual(plain);
    expect(run(withOverrides(input, { ...override("o", -12, -13, { qc: { mode: "fixed", valueMpa: 20 }, soilKind: "peat" }), cptId: "S2" }))).toEqual(plain);
    expect(tensionInterpretation(input, cpt).cpt).toBe(cpt);
  });
});

describe("aangepaste conusweerstand", () => {
  it("lineair over de terugval: 7,0 MPa·m erbij, dus 30,29 kN meer wrijving", () => {
    // NAP -11,90 tot -13,00 m: op beide randen 10 MPa, dus de lijn ligt op 10 MPa (11,0 MPa·m).
    // Gemeten: 0,1 m van 10 naar 3 (0,65), 0,9 m op 3 (2,70), 0,1 m van 3 naar 10 (0,65) = 4,0 MPa·m.
    const r = run(withOverrides(input, override("o1", -11.9, -13, { qc: { mode: "interpolate" }, comment: "lokale terugval" })));
    expect(r.rSingleKn - run(input).rSingleKn).toBeCloseTo(KN_PER_MPA_M * 7.0, 6);
    expect(KN_PER_MPA_M * 7.0).toBeCloseTo(30.29, 2);
    expect(r.rtDKn).toBeGreaterThan(run(input).rtDKn);
    expect(r.gPileKn).toBe(run(input).gPileKn);
    expect(r.interpretation).toHaveLength(1);
    expect(r.interpretation![0]).toMatchObject({ status: "applied", topNap: -11.9, bottomNap: -13 });
    expect(r.interpretation![0].qc!.measuredMinMpa).toBeCloseTo(3, 9);
    expect(r.interpretation![0].qc!.measuredMeanMpa).toBeCloseTo(4.0 / 1.1, 9);
  });
  it("vaste waarde 10 MPa van NAP -12 tot -13 m: de lagen in het traject rekenen met 10 MPa", () => {
    // Gemeten gemiddelde over het traject: 0,9 m op 3 en 0,1 m van 3 naar 10 = 3,35 MPa.
    const r = run(withOverrides(input, override("o1", -12, -13, { qc: { mode: "fixed", valueMpa: 10 } })));
    const inside = r.layers.filter((l) => l.topNap <= -12 + 1e-9 && l.bottomNap >= -13 - 1e-9);
    expect(inside.reduce((s, l) => s + l.thicknessM, 0)).toBeCloseTo(1, 9);
    for (const l of inside) expect(l.qcMpa).toBeCloseTo(10, 2);
    expect(r.rSingleKn - run(input).rSingleKn).toBeCloseTo(KN_PER_MPA_M * (10 - 3.35), 2);
  });
  it("een lagere vaste waarde verlaagt de trekweerstand", () => {
    // NAP -14 tot -15 m: gemeten 10 MPa, nu 4 MPa: 6 MPa·m minder, dus 25,96 kN minder.
    const r = run(withOverrides(input, override("o1", -14, -15, { qc: { mode: "fixed", valueMpa: 4 } })));
    expect(r.rtDKn - run(input).rtDKn).toBeCloseTo(-KN_PER_MPA_M * 6, 2);
  });
  it("de aangepaste waarde wordt daarna afgesnoten zoals een gemeten waarde", () => {
    // 20 MPa over 0,5 m is een dunne piek: afsnuiten op 12 MPa (art. 7.6.3.3).
    const r = run(withOverrides(input, override("o1", -14, -14.5, { qc: { mode: "fixed", valueMpa: 20 } })));
    const layer = r.layers.find((l) => Math.abs(l.topNap + 14) < 1e-9)!;
    expect(layer.qcMpa).toBeCloseTo(20, 2);
    expect(layer.qcAppliedMpa).toBe(12);
  });
  it("verandert de grondsoort niet: de laagindeling volgt de meting", () => {
    const r = run(withOverrides(input, override("o1", -12, -13, { qc: { mode: "fixed", valueMpa: 0.3 } })));
    expect(r.layers.filter((l) => l.topNap <= -12 && l.bottomNap >= -13).every((l) => l.soil === "sand")).toBe(true);
  });
});

describe("aangepaste grondsoort", () => {
  it("zand naar veen van NAP -14 tot -16 m: 20,2 MPa·m zand vervalt, dus 87,41 kN minder", () => {
    // Gemeten: 1,9 m op 10 MPa en de laatste 0,1 m van 10 naar 14 MPa (gemiddeld 12) = 20,2 MPa·m.
    const r = run(withOverrides(input, override("o1", -14, -16, { soilKind: "peat" })));
    const inside = r.layers.filter((l) => l.topNap <= -14 + 1e-9 && l.bottomNap >= -16 - 1e-9);
    expect(inside.every((l) => l.soil === "peat" && l.alphaT === 0 && l.rSingleKn === 0)).toBe(true);
    expect(r.rSingleKn - run(input).rSingleKn).toBeCloseTo(-KN_PER_MPA_M * 20.2, 6);
    expect(KN_PER_MPA_M * 20.2).toBeCloseTo(87.41, 2);
    expect(r.interpretation![0].soil).toEqual({ before: ["sand"], after: "peat" });
  });
  it("klei naar zand van NAP -5,5 tot -7,5 m: α_t van 0,010 naar 0,007, dus 5,56 kN minder", () => {
    // Klei met qc 1,5 MPa: α_t = 0,02 (tabel 7.d), gehalveerd = 0,010. Zand: 0,007.
    // 1,16 · (0,007 − 0,010) · 1500 kPa / 1,8765 · 2 m = −5,564 kN.
    const r = run(withOverrides(input, override("o1", -5.5, -7.5, { soilKind: "sand" })));
    expect(r.rSingleKn - run(input).rSingleKn).toBeCloseTo(1.16 * (0.007 - 0.010) * 1500 / (1.39 * 1.35) * 2, 6);
  });
  it("in een groep volgt het kluitgewicht het volumegewicht van de nieuwe grondsoort", () => {
    // A = 1,5 · 1,5 − 0,29² = 2,1659 m². Het traject ligt boven de kegel (hoogte 0,83 m vanaf de punt op NAP -20 m).
    // Onder water: zand 20/1,1 − 10 = 8,182 kN/m³, veen 11/1,1 − 10 = 0. Verschil over 2 m: 2,1659 · 2 · 8,182 = 35,44 kN.
    const r = run(withOverrides(groupInput, override("o1", -14, -16, { soilKind: "peat" })));
    const base = run(groupInput);
    expect(r.group!.coneHeightM).toBeCloseTo(0.83, 2);
    expect(r.group!.rKluitKn - base.group!.rKluitKn).toBeCloseTo(-(1.5 * 1.5 - 0.29 * 0.29) * 2 * (20 / 1.1 - 10), 6);
    expect(r.rFrictionKn).toBeLessThan(base.rFrictionKn);
    expect(r.rtDKn).toBeLessThan(base.rtDKn);
  });
  it("gebruikt de eigen volumegewichten uit de invoer voor de nieuwe laag", () => {
    const custom: TensionInput = { ...groupInput, soil: { peat: { gammaSat: 12.1 } } };
    const r = run(withOverrides(custom, override("o1", -14, -16, { soilKind: "peat" })));
    // Veen 12,1/1,1 − 10 = 1,0 kN/m³ in plaats van zand 8,182 kN/m³.
    expect(r.group!.rKluitKn - run(custom).group!.rKluitKn).toBeCloseTo(-(1.5 * 1.5 - 0.29 * 0.29) * 2 * (20 / 1.1 - 12.1 / 1.1), 6);
  });
});

describe("niet toegepaste aanpassingen", () => {
  it("meldt een traject buiten de sondering en een aanpassing zonder wijziging, en rekent op de meting", () => {
    const r = run(withOverrides(input, override("o1", -30, -31, { qc: { mode: "interpolate" } }), override("o2", -12, -13, {})));
    expect(r.interpretation!.map((a) => a.status)).toEqual(["outsideRange", "invalid"]);
    expect(r.rtDKn).toBe(run(input).rtDKn);
    expect(r.layers).toEqual(run(input).layers);
  });
});

describe("tabel, bewaren en uitdraai", () => {
  const dip = override("o1", -11.9, -13, { qc: { mode: "interpolate" }, comment: "lokale terugval" });
  const peat = override("o2", -14, -16, { soilKind: "peat", comment: "veenlaag uit boring" });

  it("geldt in de tabel alleen voor de eigen sondering", () => {
    const other: Cpt = { ...cpt, id: "S2" };
    const cpts = new Map([[cpt.id, cpt], [other.id, other]]);
    const table = (i: TensionInput) => computeTensionTable({ ...i, table: { cptIds: ["S1", "S2"], toeNaps: [-20], sizesMm: [290] } }, cpts).cells[0][0];
    const plain = table(input), adjusted = table(withOverrides(input, dip));
    const rt = (c: typeof plain, k: number) => ok(c.perCpt[k].mean).rtDKn;
    expect(rt(adjusted, 0)).toBeGreaterThan(rt(plain, 0));
    expect(rt(adjusted, 1)).toBe(rt(plain, 1));
  });

  it("bewaren en herladen geeft dezelfde invoer en dezelfde uitkomst", () => {
    const adjusted = withOverrides(input, dip, peat);
    const store = useCalculationsStore;
    store.setState({ byDoc: new Map(), activeCalcId: null });
    const id = store.getState().addCalculation("project-1", "tension-pile", "Trekpaal");
    store.getState().updateCalculation("project-1", id, { input: adjusted });
    const saved = JSON.parse(JSON.stringify(toIfcxArray(store.getState().byDoc.get("project-1")!)));
    store.setState({ byDoc: new Map(), activeCalcId: null });
    store.getState().loadFromIfcx("project-1", fromIfcxArray(saved));
    const reloaded = store.getState().byDoc.get("project-1")![0].input as TensionInput;
    expect(reloaded).toEqual(adjusted);
    expect(reloaded.interpretationOverrides).toEqual([dip, peat]);
    expect(run(reloaded)).toEqual(run(adjusted));
    store.setState({ byDoc: new Map(), activeCalcId: null });
  });

  const meta = { title: "Test", project_number: "1", author: "Test", date: "2026-11-20" } as never;
  const ctx = { cpts: new Map([[cpt.id, cpt]]), activeCptId: cpt.id, projectMeta: meta };
  const text = (i: TensionInput) => new TextDecoder("latin1").decode(buildTensionReport(i, computeTension(i, cpt), ctx));

  it("de uitdraai noemt de aanpassingen met traject, wijziging en toelichting, en alleen als ze er zijn", () => {
    const adjusted = text(withOverrides(input, dip, peat));
    expect(adjusted).toContain("Aanpassingen aan de grondlaaginterpretatie");
    expect(adjusted).toContain("-11,90 / -13,00");
    expect(adjusted).toContain("lokale terugval");
    expect(adjusted).toContain("-14,00 / -16,00");
    expect(adjusted).toContain("veenlaag uit boring");
    expect(adjusted).toContain("Zand");
    expect(adjusted).toContain("Veen");
    expect(text(input)).not.toContain("Aanpassingen aan de grondlaaginterpretatie");
  });

  it("de uitdraai van de tabel noemt de aanpassingen van alle sonderingen in de tabel", () => {
    const tableInput: TensionInput = { ...withOverrides(input, dip), table: { cptIds: ["S1"], toeNaps: [-19, -20], sizesMm: [290] } };
    const adjusted = text(tableInput);
    expect(adjusted).toContain("Trekweerstandtabellen");
    expect(adjusted).toContain("lokale terugval");
    expect(text({ ...tableInput, interpretationOverrides: undefined })).not.toContain("Aanpassingen aan de grondlaaginterpretatie");
  });
});
