// GEF-dissipatiebestand herkennen bij het openen en aan de sondering koppelen (#PARENT).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyseDissipation } from "./analysis";
import { belongsToCpt, dissipationLast, isDissipationName, withDissipationTest } from "./cptDissipation";
import { looksLikeGefDissipation, parseGefDissipation } from "./gefDissipation";
import type { Cpt } from "../types/cpt";

vi.mock("../utils/platform", () => ({ IS_TAURI: false }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null) }));

const gef = (opts: { columns?: string[]; rows: string[]; extra?: string[] }) => [
  "#GEFID= 1, 1, 0", "#FILEOWNER= test", "#FILEDATE= 2024,01,01", "#PROJECTID= CPT, 1, -",
  "#PARENT= S01.gef, 6.33, Sondeerlengte, 1", `#COLUMN= ${(opts.columns ?? []).length || 3}`,
  ...(opts.columns ?? ["#COLUMNINFO= 1, s, Tijd, 12", "#COLUMNINFO= 2, MPa, Conusweerstand qc, 2", "#COLUMNINFO= 3, MPa, Waterspanning u1, 5"]),
  "#COLUMNVOID= 3, -99999.0", ...(opts.extra ?? []),
  "#TESTID= S01 -DIS", "#REPORTCODE= GEF-DISS-Report,1,0,0", "#STARTDATE= 2024,03,07", "#EOH=",
  ...opts.rows, "",
].join("\n");

const cpt = (id: string, source_file: string): Cpt => ({ id, metadata: { source_file }, points: [{ depth: 1, qc: 1 }] });

describe("GEF-dissipatietest", () => {
  it("herkent en leest tijd, conusweerstand en waterspanning met de diepte uit #PARENT", () => {
    const text = gef({ rows: ["0 1.2 0.300", "10 1.0 -99999.0", "20 0.9 0.200"] });
    expect(looksLikeGefDissipation(text)).toBe(true);
    const test = parseGefDissipation(text, "S01_DIS_01.gef");
    expect(test).toMatchObject({ test_id: "S01 -DIS", parent_file: "S01.gef", depth: 6.33, start_time: "2024-03-07", source: "gef", source_file: "S01_DIS_01.gef" });
    expect(test.points).toEqual([{ time: 0, qc: 1.2, u1: 0.3 }, { time: 10, qc: 1.0 }, { time: 20, qc: 0.9, u1: 0.2 }]);
  });
  it("rekent minuten en kPa om en leest een eigen kolom- en recordscheiding", () => {
    const text = gef({
      columns: ["#COLUMNINFO= 1, min, Tijd, 12", "#COLUMNINFO= 2, kPa, Waterspanning u2, 6"],
      extra: ["#COLUMNSEPARATOR= ;", "#RECORDSEPARATOR= !"],
      rows: ["0;250!", "0.5;150!"],
    });
    const test = parseGefDissipation(text, "x.gef");
    expect(test.points).toEqual([{ time: 0, u2: 0.25 }, { time: 30, u2: 0.15 }]);
    // 1 bar = 0,1 MPa.
    const bar = parseGefDissipation(gef({ columns: ["#COLUMNINFO= 1, s, Tijd, 12", "#COLUMNINFO= 2, bar, u1, 5"], rows: ["0 2.5"] }), "b.gef");
    expect(bar.points).toEqual([{ time: 0, u1: 0.25 }]);
  });
  it("weigert een test zonder waterspanning, met een onbekende eenheid of zonder #EOH", () => {
    expect(() => parseGefDissipation(gef({ columns: ["#COLUMNINFO= 1, s, Tijd, 12", "#COLUMNINFO= 2, MPa, qc, 2"], rows: ["0 1"] }), "a.gef")).toThrow(/waterspanningskolom/);
    expect(() => parseGefDissipation(gef({ columns: ["#COLUMNINFO= 1, s, Tijd, 12", "#COLUMNINFO= 2, psi, u1, 5"], rows: ["0 1"] }), "a.gef")).toThrow(/onbekende eenheid in kolom 2/);
    expect(() => parseGefDissipation(gef({ columns: ["#COLUMNINFO= 1, dagen, Tijd, 12", "#COLUMNINFO= 2, MPa, u1, 5"], rows: ["0 1"] }), "a.gef")).toThrow(/onbekende eenheid in kolom 1/);
    expect(() => parseGefDissipation(gef({ rows: ["0 1 -99999.0"] }), "a.gef")).toThrow(/zonder waterspanningsmetingen/);
    expect(() => parseGefDissipation(gef({ rows: ["0 1 0.3"] }).replace("#EOH=", ""), "a.gef")).toThrow(/EOH/);
  });
  it("bepaalt t50 vanaf het maximum bij een stijgend begin (Sully et al., 1999)", () => {
    const test = parseGefDissipation(gef({ rows: ["0 1 0.30", "10 1 0.50", "20 1 0.40", "40 1 0.20", "100 1 0.10"] }), "a.gef");
    const r = analyseDissipation(test);
    // Piek 500 kPa op 10 s, laatste meting 100 kPa: u50 = 300 kPa, tussen 400 kPa (20 s) en 200 kPa (40 s).
    // Vanaf de piek zijn dat 10 en 30 s; halverwege in log-tijd: √(10 × 30) = 17,32 s.
    expect(r).toMatchObject({ channel: "u1", nonMonotonic: true, ui: 500, tStart: 10, u0: 100, u50: 300 });
    expect(r.t50).toBeCloseTo(Math.sqrt(300), 9);
    expect(r.t50).toBeCloseTo(17.32, 2);
    // Alleen stijgend: de beginwaarde ligt onder de laatste meting; dat wordt gemeld.
    const rising = analyseDissipation(parseGefDissipation(gef({ rows: ["0 1 0.1", "10 1 0.2"] }), "a.gef"));
    expect(rising.warnings).toEqual(["u0FromLast", "negativeExcess"]);
  });
  it("koppelt op #PARENT, test-id of bestandsnaam en vervangt een test uit hetzelfde bestand", () => {
    const test = parseGefDissipation(gef({ rows: ["0 1 0.3", "10 1 0.2"] }), "S01_DIS_01.gef");
    expect(belongsToCpt(test, cpt("X", "s01.GEF"))).toBe(true);
    expect(belongsToCpt({ ...test, parent_file: undefined }, cpt("S01-DIS", "andere.gef"))).toBe(true);
    expect(belongsToCpt({ ...test, parent_file: undefined }, cpt("Y", "S01.gef"))).toBe(true);
    expect(belongsToCpt({ ...test, parent_file: undefined, source_file: "S010_DIS.gef" }, cpt("Y", "S01.gef"))).toBe(false);
    const once = withDissipationTest(cpt("S01", "S01.gef"), test);
    // Hetzelfde bestand opnieuw ingelezen met een andere diepte: het kenmerk verschilt, de test wordt toch vervangen.
    const again = parseGefDissipation(gef({ rows: ["0 1 0.3", "10 1 0.2"] }).replace("6.33", "2"), "s01_dis_01.GEF");
    expect(again.id).not.toBe(test.id);
    const twice = withDissipationTest(once, again);
    expect(twice.dissipation_tests).toHaveLength(1);
    expect(twice.dissipation_tests![0].depth).toBe(2);
    const deeper = withDissipationTest(twice, { ...test, id: "gef-S01_DIS_02.gef-1.00", source_file: "S01_DIS_02.gef", depth: 1 });
    expect(deeper.dissipation_tests!.map((t) => t.source_file)).toEqual(["S01_DIS_02.gef", "s01_dis_01.GEF"]);
  });
  it("houdt de keuzes van de gebruiker vast als het bestand opnieuw wordt ingelezen", () => {
    const test = parseGefDissipation(gef({ rows: ["0 1 0.3", "10 1 0.2"] }), "S01_DIS_01.gef");
    const withChoice = withDissipationTest(cpt("S01", "S01.gef"), { ...test, settings: { rigidityIndex: 150 } });
    expect(withDissipationTest(withChoice, test).dissipation_tests![0].settings).toEqual({ rigidityIndex: 150 });
  });
  it("zet dissipatietests achteraan bij het openen van meerdere bestanden", () => {
    expect(isDissipationName("C:/data/A9-8_568-DKMP2008.000_DIS_01.GEF")).toBe(true);
    expect(isDissipationName("S01.gef")).toBe(false);
    expect(isDissipationName("Distelweg.gef")).toBe(false);
    expect(dissipationLast(["S01_DIS_01.gef", "S01.gef"], (n) => n)).toEqual(["S01.gef", "S01_DIS_01.gef"]);
  });
});

describe("dissipatietest in het project", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    const { useCptStore } = await import("../store/useCptStore");
    useCptStore.setState({ documents: [], activeDocId: null, cpts: new Map(), activeCptId: null });
  });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  it("hangt de test aan de sondering in het open project, zonder nieuw document", async () => {
    const { useCptStore, newProjectDocument, placeCpt, addCptToActiveProject, openContentByFilename } = await import("../store/useCptStore");
    newProjectDocument();
    const project = useCptStore.getState().activeDocId!;
    placeCpt(cpt("S01", "S01.gef"), "S01.gef", project);
    placeCpt(cpt("S02", "S02.gef"), "S02.gef", project);
    const text = gef({ rows: ["0 1 0.3", "10 1 0.2"] });
    const updated = await addCptToActiveProject(text, "S01_DIS_01.gef", project);
    expect(updated.id).toBe("S01");
    const state = useCptStore.getState();
    expect(state.documents).toHaveLength(1);
    expect(state.activeCptId).toBe("S01");
    expect(state.cpts.get("S01")!.dissipation_tests).toHaveLength(1);
    expect(state.cpts.get("S01")!.metadata.extra).toBeUndefined();
    // Openen (slepen, Bestand › Openen) vindt hetzelfde project.
    newProjectDocument();
    expect(await openContentByFilename(text, "S01_DIS_01.gef")).toBe(true);
    expect(useCptStore.getState().activeDocId).toBe(project);
    expect(useCptStore.getState().cpts.get("S01")!.dissipation_tests).toHaveLength(1);
  });
  it("legt uit welke sondering eerst open moet", async () => {
    const { newProjectDocument, addCptToActiveProject } = await import("../store/useCptStore");
    newProjectDocument();
    await expect(addCptToActiveProject(gef({ rows: ["0 1 0.3"] }), "S01_DIS_01.gef")).rejects.toThrow(/S01\.gef/);
  });
});
