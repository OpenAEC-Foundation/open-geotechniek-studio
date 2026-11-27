// Bestaande projecten: dissipatietests in de eerdere opslagvorm (JSON in de vrije metadata) en in het
// veld `dissipation_tests` komen beide uit op hetzelfde veld.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { checkBroCpt } from "../broExport/broCptCheck";
import { prefillSupplement } from "../broExport/broCptSupplement";
import { parseBroCptXml } from "../types/broCptParser";
import type { Cpt } from "../types/cpt";
import { parseCptSnapshot, parseProjectFile } from "../types/projectFile";
import { analyseDissipation } from "./analysis";
import { parseGefDissipation } from "./gefDissipation";
import { fromLegacyTest, LEGACY_DISSIPATION_KEY, migrateDissipation } from "./migrate";

const fixture = (name: string) => readFileSync(resolve(__dirname, "__fixtures__", name), "utf-8");

/** Zoals de eerdere vorm een test bewaarde: tijd `t`, één waterspanning `u` en het kanaal apart. */
const legacyTest = {
  id: "S01 -DIS", source_file: "S01_DIS_01.gef", parent_file: "S01.gef", depth_m: 6.33, date: "2024-03-07", u_channel: "u1",
  points: [{ t: 0, qc: 1.2, u: 0.3 }, { t: 10, qc: 1.0 }, { t: 20, qc: 0.9, u: 0.2 }],
};
const legacyCpt = (tests: unknown[] = [legacyTest]): Cpt => ({
  id: "S01", metadata: { source_file: "S01.gef", extra: { Opmerking: "blijft staan", [LEGACY_DISSIPATION_KEY]: JSON.stringify(tests) } }, points: [{ depth: 1, qc: 1 }],
});

describe("dissipatietests uit de eerdere opslagvorm", () => {
  it("zet een test om met diepte, kanaal, datum en koppeling", () => {
    expect(fromLegacyTest(legacyTest)).toEqual({
      id: "gef-S01_DIS_01.gef-6.33", depth: 6.33, source: "gef", source_file: "S01_DIS_01.gef", parent_file: "S01.gef", test_id: "S01 -DIS", start_time: "2024-03-07",
      points: [{ time: 0, qc: 1.2, u1: 0.3 }, { time: 10, qc: 1.0 }, { time: 20, qc: 0.9, u1: 0.2 }],
    });
  });
  it("geeft hetzelfde als het bestand nu opnieuw inlezen", () => {
    const text = ["#GEFID= 1, 1, 0", "#PARENT= S01.gef, 6.33, Sondeerlengte, 1", "#COLUMN= 3", "#COLUMNINFO= 1, s, Tijd, 12", "#COLUMNINFO= 2, MPa, qc, 2",
      "#COLUMNINFO= 3, MPa, u1, 5", "#COLUMNVOID= 3, -99999.0", "#TESTID= S01 -DIS", "#REPORTCODE= GEF-DISS-Report,1,0,0", "#STARTDATE= 2024,03,07", "#EOH=",
      "0 1.2 0.300", "10 1.0 -99999.0", "20 0.9 0.200", ""].join("\n");
    expect(fromLegacyTest(legacyTest)).toEqual(parseGefDissipation(text, "S01_DIS_01.gef"));
  });
  it("zet de tests in het veld en haalt de sleutel weg; de overige metadata blijft", () => {
    const cpt = migrateDissipation(legacyCpt());
    expect(cpt.dissipation_tests).toHaveLength(1);
    expect(cpt.metadata.extra).toEqual({ Opmerking: "blijft staan" });
    // De uitwerking werkt op de omgezette test: u_i 300 kPa, u_0 (laatste meting) 200 kPa.
    expect(analyseDissipation(cpt.dissipation_tests![0])).toMatchObject({ channel: "u1", ui: 300, u0: 200 });
  });
  it("meldt een ontbrekende diepte en slaat een test zonder meetreeks over", () => {
    const { depth_m: _depth, ...withoutDepth } = legacyTest;
    const cpt = migrateDissipation(legacyCpt([withoutDepth, { ...legacyTest, source_file: "leeg.gef", points: [] }, null]));
    expect(cpt.dissipation_tests).toHaveLength(1);
    expect(cpt.dissipation_tests![0]).toMatchObject({ depth: 0, notes: ["De diepte van de test staat niet in het bestand; vul de diepte zelf in."] });
  });
  it("laat een onleesbare waarde vallen zonder de sondering te breken", () => {
    const broken: Cpt = { id: "S01", metadata: { source_file: "S01.gef", extra: { [LEGACY_DISSIPATION_KEY]: "{kapot" } }, points: [{ depth: 1, qc: 1 }] };
    const cpt = migrateDissipation(broken);
    expect("dissipation_tests" in cpt).toBe(false);
    expect(cpt.metadata.extra).toBeUndefined();
  });
});

describe("dissipatietests in het veld", () => {
  const bro = parseBroCptXml(fixture("sondering-met-dissipatie.xml"), "sondering-met-dissipatie.xml");
  it("blijft ongewijzigd, met de keuzes van de gebruiker", () => {
    const withChoice: Cpt = { ...bro, dissipation_tests: bro.dissipation_tests!.map((t) => ({ ...t, settings: { rigidityIndex: 200 } })) };
    expect(migrateDissipation(withChoice)).toBe(withChoice);
  });
  it("gaat voor als dezelfde test in beide vormen staat; een andere test komt erbij", () => {
    const current = fromLegacyTest(legacyTest)!;
    const both: Cpt = { ...legacyCpt([legacyTest, { ...legacyTest, source_file: "S01_DIS_02.gef", depth_m: 9 }]), dissipation_tests: [{ ...current, settings: { rigidityIndex: 200 } }] };
    const cpt = migrateDissipation(both);
    expect(cpt.dissipation_tests!.map((t) => [t.source_file, t.settings?.rigidityIndex])).toEqual([["S01_DIS_01.gef", 200], ["S01_DIS_02.gef", undefined]]);
    expect(cpt.metadata.extra?.[LEGACY_DISSIPATION_KEY]).toBeUndefined();
  });
});

describe("bestaande projecten openen", () => {
  const bro = parseBroCptXml(fixture("sondering-met-dissipatie.xml"), "sondering-met-dissipatie.xml");
  const project = (cpts: Cpt[]) => JSON.stringify({ project: { title: "Test" }, cpts: JSON.parse(JSON.stringify(cpts)) });

  it("een project in de eerdere vorm krijgt de tests in het veld", () => {
    const [cpt] = parseProjectFile(project([legacyCpt()])).cpts!;
    expect(cpt.dissipation_tests?.map((t) => t.depth)).toEqual([6.33]);
    expect(cpt.metadata.extra?.[LEGACY_DISSIPATION_KEY]).toBeUndefined();
  });
  it("een project met het veld blijft zoals het is opgeslagen", () => {
    const [cpt] = parseProjectFile(project([bro])).cpts!;
    expect(cpt.dissipation_tests).toEqual(bro.dissipation_tests);
  });
  it("een losse opgeslagen sondering in de eerdere vorm wordt ook omgezet", () => {
    expect(parseCptSnapshot(JSON.stringify(legacyCpt())).dissipation_tests).toHaveLength(1);
  });
  it("de BRO-export weigert een sondering met dissipatietests, uit beide vormen", () => {
    const messages = (cpt: Cpt) => checkBroCpt(cpt, prefillSupplement(cpt)).filter((i) => i.severity === "error").map((i) => i.message).join(" ");
    expect(messages(migrateDissipation(legacyCpt()))).toContain("dissipatietests");
    expect(messages(bro)).toContain("dissipatietests");
    // Ook als alleen het veld de tests kent (geen bron-XML, geen BRO-kenmerk).
    const { extra: _extra, ...metadata } = bro.metadata;
    expect(messages({ ...bro, metadata })).toContain("dissipatietests");
    expect(messages({ ...bro, metadata, dissipation_tests: undefined })).not.toContain("dissipatietests");
  });
});
