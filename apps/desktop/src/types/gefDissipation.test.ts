import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  belongsToCpt, dissipationLast, dissipationTestsOf, isDissipationName, looksLikeGefDissipation,
  parseGefDissipation, summarizeDissipation, withDissipationTest,
} from "./gefDissipation";
import type { Cpt } from "./cpt";

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
    expect(test).toMatchObject({ id: "S01 -DIS", parent_file: "S01.gef", depth_m: 6.33, date: "2024-03-07", u_channel: "u1" });
    expect(test.points).toEqual([{ t: 0, qc: 1.2, u: 0.3 }, { t: 10, qc: 1.0, u: undefined }, { t: 20, qc: 0.9, u: 0.2 }]);
  });
  it("rekent minuten en kPa om en leest een eigen kolom- en recordscheiding", () => {
    const text = gef({
      columns: ["#COLUMNINFO= 1, min, Tijd, 12", "#COLUMNINFO= 2, kPa, Waterspanning u2, 6"],
      extra: ["#COLUMNSEPARATOR= ;", "#RECORDSEPARATOR= !"],
      rows: ["0;250!", "0.5;150!"],
    });
    const test = parseGefDissipation(text, "x.gef");
    expect(test.u_channel).toBe("u2");
    expect(test.points).toEqual([{ t: 0, qc: undefined, u: 0.25 }, { t: 30, qc: undefined, u: 0.15 }]);
  });
  it("weigert een test zonder waterspanning of met een onbekende eenheid", () => {
    expect(() => parseGefDissipation(gef({ columns: ["#COLUMNINFO= 1, s, Tijd, 12", "#COLUMNINFO= 2, MPa, qc, 2"], rows: ["0 1"] }), "a.gef")).toThrow(/waterspanningskolom/);
    expect(() => parseGefDissipation(gef({ columns: ["#COLUMNINFO= 1, s, Tijd, 12", "#COLUMNINFO= 2, bar, u1, 5"], rows: ["0 1"] }), "a.gef")).toThrow(/onbekende eenheid/);
  });
  it("bepaalt t50 vanaf het maximum, ook bij een stijgend begin", () => {
    const test = parseGefDissipation(gef({ rows: ["0 1 0.30", "10 1 0.50", "20 1 0.40", "40 1 0.20", "100 1 0.10"] }), "a.gef");
    const s = summarizeDissipation(test)!;
    expect(s).toMatchObject({ u_max: 0.5, t_u_max: 10, u_end: 0.1, t_end: 100 });
    expect(s.u50).toBeCloseTo(0.3);
    expect(s.t50).toBeCloseTo(30); // tussen 0,40 op 20 s en 0,20 op 40 s
    const rising = parseGefDissipation(gef({ rows: ["0 1 0.1", "10 1 0.2"] }), "a.gef");
    expect(summarizeDissipation(rising)!.t50).toBeUndefined();
  });
  it("koppelt op #PARENT, test-id of bestandsnaam en vervangt een test uit hetzelfde bestand", () => {
    const test = parseGefDissipation(gef({ rows: ["0 1 0.3", "10 1 0.2"] }), "S01_DIS_01.gef");
    expect(belongsToCpt(test, cpt("X", "s01.GEF"))).toBe(true);
    expect(belongsToCpt({ ...test, parent_file: undefined }, cpt("S01-DIS", "andere.gef"))).toBe(true);
    expect(belongsToCpt({ ...test, parent_file: undefined }, cpt("Y", "S01.gef"))).toBe(true);
    expect(belongsToCpt({ ...test, parent_file: undefined, source_file: "S010_DIS.gef" }, cpt("Y", "S01.gef"))).toBe(false);
    const once = withDissipationTest(cpt("S01", "S01.gef"), test);
    const twice = withDissipationTest(once, { ...test, depth_m: 2 });
    expect(dissipationTestsOf(twice)).toHaveLength(1);
    const deeper = withDissipationTest(twice, { ...test, source_file: "S01_DIS_02.gef", depth_m: 1 });
    expect(dissipationTestsOf(deeper).map((t) => t.source_file)).toEqual(["S01_DIS_02.gef", "S01_DIS_01.gef"]);
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
    expect(dissipationTestsOf(state.cpts.get("S01")!)).toHaveLength(1);
    // Openen (slepen, Bestand › Openen) vindt hetzelfde project.
    newProjectDocument();
    expect(await openContentByFilename(text, "S01_DIS_01.gef")).toBe(true);
    expect(useCptStore.getState().activeDocId).toBe(project);
  });
  it("legt uit welke sondering eerst open moet", async () => {
    const { newProjectDocument, addCptToActiveProject } = await import("../store/useCptStore");
    newProjectDocument();
    await expect(addCptToActiveProject(gef({ rows: ["0 1 0.3"] }), "S01_DIS_01.gef")).rejects.toThrow(/S01\.gef/);
  });
});
