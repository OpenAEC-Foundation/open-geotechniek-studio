// Bestaande projecten: een sondering uit de eerdere werkwijze "uit scan" en een gedigitaliseerde
// sondering komen beide uit op dezelfde vorm, met dezelfde vermelding, en blijven bij te werken.
import { describe, expect, it } from "vitest";
import type { Cpt } from "../types/cpt";
import { parseCptSnapshot, parseProjectFile } from "../types/projectFile";
import { buildTestReport } from "../utils/cptTestReport";
import { isScanCpt, migrateScanCpt, SCAN_STEP, scanRecord } from "./migrate";
import { buildDigitizedCpt, DIGITIZED_KEY, digitizedLabel, digitizedNote, digitizedOf, digitizedReportGroup, recordProblems } from "./record";
import { fromRecord, toRecord } from "./work";
import { sampleRecord } from "./__fixtures__/sample";
import { scanCpt } from "./__fixtures__/scanCpt";

describe("sondering uit de eerdere werkwijze herkennen", () => {
  it("herkent haar aan de scan als bronbestand en alleen conusweerstand", () => {
    expect(isScanCpt(scanCpt())).toBe(true);
    expect(isScanCpt({ ...scanCpt(), metadata: { ...scanCpt().metadata, source_file: "S-12.PDF" } })).toBe(true);
    // Een gemeten bestand, een sondering met wrijving en een al gedigitaliseerde sondering niet.
    expect(isScanCpt({ ...scanCpt(), metadata: { source_file: "S-12.gef" } })).toBe(false);
    expect(isScanCpt({ ...scanCpt(), points: scanCpt().points.map((p) => ({ ...p, fs: 0.05 })) })).toBe(false);
    expect(isScanCpt(buildDigitizedCpt(sampleRecord()))).toBe(false);
  });
});

describe("omzetten", () => {
  it("geeft de sondering het ingevoerde mee en laat de meetwaarden ongemoeid", () => {
    const old = scanCpt(), cpt = migrateScanCpt(old);
    expect(cpt.points).toBe(old.points);
    expect(cpt.metadata.extra!.Herkomst).toBe(old.metadata.extra!.Herkomst);
    const record = digitizedOf(cpt)!;
    expect(record).toMatchObject({
      id: "S-12", date: "1975-03-01", groundLevelNap: -0.4, xRd: 155000, yRd: 463000, coneKind: "unknown", depthMode: "depth", step: SCAN_STEP,
      origin: "Overgetekend van een scan (sondering-12.png); alleen de conusweerstand",
      image: { name: "sondering-12.png", synthetic: true },
    });
    // 1,00 m is beeldrij 50; 2 MPa ligt op x = 100.
    expect(record.qc).toMatchObject({ method: "trace", points: [] });
    expect(record.qc.trace!.top).toBe(50);
    expect(record.qc.trace!.x).toHaveLength(101);
    expect(record.qc.trace!.x[0]).toBe(100);
    expect(recordProblems(record)).toEqual([]);
  });

  it("geeft bij opnieuw opbouwen precies dezelfde meetwaarden", () => {
    const old = scanCpt(), rebuilt = buildDigitizedCpt(digitizedOf(migrateScanCpt(old))!);
    expect(rebuilt.points).toEqual(old.points);
    expect(rebuilt).toMatchObject({ id: "S-12", position: old.position, metadata: { date: "1975-03-01", ground_level_nap: -0.4, source_file: "sondering-12.png" } });
    // Ook via het scherm: inlezen in de werktoestand en weer terug.
    const record = digitizedOf(migrateScanCpt(old))!, { work, header } = fromRecord(record);
    expect(header).toMatchObject({ coneKind: "unknown", step: "0,02", groundLevel: "-0,4" });
    expect(buildDigitizedCpt(toRecord(work, header, record.image)).points).toEqual(old.points);
  });

  it("zonder maaiveld blijft zij leesbaar en vermeld; het maaiveld is nodig om haar bij te werken", () => {
    const cpt = JSON.parse(JSON.stringify(migrateScanCpt(scanCpt(null)))) as Cpt;
    const record = digitizedOf(cpt)!;
    expect(record.groundLevelNap).toBeNaN();
    expect(recordProblems(record).map((p) => p.kind)).toEqual(["groundLevel"]);
    expect(digitizedLabel(cpt)).toBe("gedigitaliseerd");
    // Met het maaiveld erbij: dezelfde dieptes en waarden, nu ook met de hoogte in NAP.
    const rebuilt = buildDigitizedCpt({ ...record, groundLevelNap: 1.25 });
    expect(rebuilt.points.map((p) => [p.depth, p.qc])).toEqual(cpt.points.map((p) => [p.depth, p.qc]));
    expect(rebuilt.points[0].depth_nap).toBe(0.25);
  });

  it("houdt een onderbreking in de lijn als lege beeldrijen", () => {
    const old = scanCpt();
    const gapped = { ...old, points: old.points.filter((p) => p.depth < 1.5 || p.depth > 1.6) };
    const record = scanRecord(gapped);
    // 1,50 tot en met 1,60 m: de rijen 75 tot en met 80 ontbreken.
    expect(record.qc.trace!.x.slice(24, 32)).toEqual([220, null, null, null, null, null, null, 255]);
    // Bij opnieuw opbouwen loopt de meetreeks recht door de onderbreking.
    const rebuilt = buildDigitizedCpt(record);
    expect(rebuilt.points.find((p) => p.depth === 1.54)!.qc).toBeCloseTo(4.7, 6);
    expect(rebuilt.points).toHaveLength(101);
  });

  it("vermeldt haar in grafiek, paalberekening en rapport als gedigitaliseerd, soort onbekend", () => {
    const cpt = migrateScanCpt(scanCpt());
    expect(digitizedLabel(cpt)).toBe("gedigitaliseerd");
    expect(digitizedNote(cpt)).toContain("gedigitaliseerd van papier of scan (soort: onbekend; herkomst: Overgetekend van een scan (sondering-12.png)");
    const row = (label: string) => digitizedReportGroup(cpt)!.rows.find((r) => r.label === label)?.value;
    expect(row("Soort sondering")).toContain("soort onbekend");
    expect(row("IJking qc")).toBe("niet bewaard (overgenomen met de eerdere werkwijze, zonder de scan)");
    expect(row("Gevolgde lijn")).toBe("qc over 101 beeldrijen; fs en Rf zijn niet overgenomen");
    expect(row("Meetreeks")).toBe("101 waarden op een stap van 0,02 m, gemiddelde van de gevolgde lijn per stap");
    expect(buildTestReport(cpt, { title: "", client: "", location: "", project_number: "", author: "", date: "" }).map((g) => g.title)).toContain("Gedigitaliseerde sondering");
  });
});

describe("bestaande projecten openen", () => {
  const project = (cpts: Cpt[]) => JSON.stringify({ project: { title: "Test" }, cpts: JSON.parse(JSON.stringify(cpts)) });

  it("een project met een sondering uit de eerdere werkwijze: zij wordt omgezet", () => {
    const [cpt] = parseProjectFile(project([scanCpt()])).cpts!;
    expect(digitizedOf(cpt)).toMatchObject({ id: "S-12", coneKind: "unknown" });
    expect(cpt.points).toEqual(scanCpt().points);
    expect(digitizedOf(parseCptSnapshot(JSON.stringify(scanCpt())))).not.toBeNull();
  });

  it("een project met een gedigitaliseerde sondering blijft zoals het is opgeslagen", () => {
    const saved = buildDigitizedCpt(sampleRecord(), "data:image/jpeg;base64,AAAA");
    const [cpt] = parseProjectFile(project([saved])).cpts!;
    expect(cpt).toEqual(JSON.parse(JSON.stringify(saved)));
    expect(digitizedOf(cpt)).toEqual(sampleRecord());
    // Een tweede keer openen zet niets opnieuw om.
    const [again] = parseProjectFile(project([migrateScanCpt(scanCpt())])).cpts!;
    expect(again.metadata.extra![DIGITIZED_KEY]).toBe(migrateScanCpt(scanCpt()).metadata.extra![DIGITIZED_KEY]);
  });

  it("een gemeten sondering blijft ongemoeid", () => {
    const measured: Cpt = { id: "A", metadata: { source_file: "a.gef" }, points: [{ depth: 1, qc: 2 }, { depth: 1.02, qc: 2.1 }] };
    expect(migrateScanCpt(measured)).toBe(measured);
    expect(parseProjectFile(project([measured])).cpts![0]).toEqual(measured);
  });
});
