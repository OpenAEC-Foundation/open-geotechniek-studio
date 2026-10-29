import { describe, it, expect } from "vitest";
import { parseGef } from "./gefParser";
import { validationOf } from "../validation/report";
const header = (extra = "") =>
  `#GEFID=1,0,0\n#TESTID=SYNTHETIC\n#COLUMN=3\n#COLUMNINFO=1,m,length,1\n#COLUMNINFO=2,MPa,qc,2\n#COLUMNINFO=3,MPa,fs,3\n#XYID=31000,155000,463000\n#ZID=31000,2\n${extra}#EOH=\n`;
describe("diagnostic GEF importer (#14)", () => {
  it("never shifts columns on an invalid numeric token", () => {
    const c = parseGef(header() + "1 bad 0.02", "test.gef");
    expect(c.points[0].qc).toBeUndefined();
    expect(c.points[0].fs).toBe(0.02);
    expect(validationOf(c)?.diagnostics).toContainEqual(
      expect.objectContaining({ code: "INVALID_NUMBER", record: 1, column: 2 }),
    );
  });
  it("filters per-column voids and BRO voids, preserving their column positions", () => {
    const c = parseGef(
      header("#COLUMNVOID=2,-9999\n") + "1 -9999 0.02\n2 -999999 0.03",
      "test.gef",
    );
    expect(c.points.map((p) => p.qc)).toEqual([undefined, undefined]);
    expect(validationOf(c)?.voids).toBe(2);
  });
  it("uses corrected depth regardless of column order", () => {
    const c = parseGef(
      header()
        .replace("#COLUMN=3", "#COLUMN=4")
        .replace("#EOH=", "#COLUMNINFO=4,m,depth,11\n#EOH=") + "2 4 .02 1.95",
      "test.gef",
    );
    expect(c.points[0].depth).toBe(1.95);
  });
  it("keeps unknown coordinate systems as source text and warns rather than plotting RD", () => {
    const c = parseGef(
      header().replace("31000,155000", "4326,155000") + "1 2 .01",
      "test.gef",
    );
    expect(c.position).toBeUndefined();
    expect(validationOf(c)?.coordinateSystem?.xy).toBe("4326");
  });
  it("handles explicit record/column separators, decimal commas and empty tokens", () => {
    const c = parseGef(
      header("#COLUMNSEPARATOR=: \n#RECORDSEPARATOR=;\n") +
        "1:2,5:;2:3,5:0,02;",
      "test.gef",
    );
    expect(c.points).toHaveLength(2);
    expect(c.points[0].qc).toBe(2.5);
    expect(c.points[0].fs).toBeUndefined();
    expect(c.points[1].fs).toBe(0.02);
  });
  it("reports missing depth, count and min/max discrepancies", () => {
    const c = parseGef(
      header("#LASTSCAN=3\n#COLUMNMINMAX=2,0,1\n") + "bad 4 .01\n1 4 .01",
      "test.gef",
    );
    const v = validationOf(c)!;
    expect(v.omittedRecords).toBe(1);
    expect(v.diagnostics.map((d) => d.code)).toEqual(
      expect.arrayContaining(["MISSING_DEPTH", "LASTSCAN", "COLUMNMINMAX"]),
    );
  });
  it("preserves unknown columns and typed measurement variables", () => {
    const c = parseGef(
      header("#MEASUREMENTVAR=14,1.2,m,predrilled\n").replace(
        "MPa,fs,3",
        "MPa,other,99",
      ) + "1 2 7",
      "test.gef",
    );
    expect(c.points[0].parameters?.["99"]).toBe(7);
    expect(validationOf(c)?.measurementVariables?.["14"].value).toBe(1.2);
  });
  it("marks negative depth corrections and rejects trailing junk numbers", () => {
    const c = parseGef(header() + "-1 2x .02", "test.gef");
    expect(c.points[0].depth).toBe(1);
    expect(c.points[0].qc).toBeUndefined();
    expect(validationOf(c)?.diagnostics.map((d) => d.code)).toContain(
      "NEGATIVE_DEPTH",
    );
  });
});
