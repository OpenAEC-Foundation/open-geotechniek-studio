import { describe, it, expect } from "vitest";
import { parseGef } from "./gefParser";
import { validationOf } from "../validation/report";
const header = (extra = "") =>
  `#GEFID=1,0,0\n#TESTID=SYNTHETIC\n#COLUMN=3\n#COLUMNINFO=1,m,length,1\n#COLUMNINFO=2,MPa,qc,2\n#COLUMNINFO=3,MPa,fs,3\n#XYID=31000,155000,463000\n#ZID=31000,2\n${extra}#EOH=\n`;
describe("diagnostic GEF importer (#14)", () => {
  it("accepts one terminal column separator and reports the actual record line", () => {
    const source=header("#COLUMNSEPARATOR=;\n#RECORDSEPARATOR=!\n")+"1;2;0.02;!\n2;bad;0.03;!";
    const c=parseGef(source,"synthetic.gef"),report=validationOf(c)!;
    expect(c.points).toHaveLength(2);
    expect(c.points[1].fs).toBe(0.03);
    expect(report.diagnostics.filter(d=>d.code==='TRAILING_COLUMN_SEPARATOR')).toHaveLength(2);
    expect(report.diagnostics.some(d=>d.code==='COLUMN_COUNT')).toBe(false);
    expect(report.diagnostics.find(d=>d.code==='INVALID_NUMBER')).toMatchObject({record:2,column:2,line:source.split('\n').findIndex(line=>line.startsWith('2;bad'))+1});
  });
  it("retains an empty last measurement rather than treating it as formatting",()=>{
    const c=parseGef(header("#COLUMNSEPARATOR=;\n#RECORDSEPARATOR=!\n")+"1;2;!","synthetic.gef");
    expect(c.points[0].fs).toBeUndefined();
    expect(validationOf(c)?.diagnostics.some(d=>d.code==='EMPTY_NUMBER'&&d.column===3)).toBe(true);
  });
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

it('preserves the first penetration offset and masks pre-excavation channels (Bedrock)',()=>{
 const source=header('#MEASUREMENTVAR=13,1,m,pre-excavation\n').replace('#COLUMN=3','#COLUMN=4').replace('#EOH=','#COLUMNINFO=4,deg,inclination,8\n#EOH=')+'0.5 100 .02 60\n1 2 .02 60\n2 3 .03 60';
 const c=parseGef(source,'synthetic.gef');
 expect(c.points[0].depth).toBe(0.5);expect(c.points[1].depth).toBeCloseTo(0.75);expect(c.points[2].depth).toBeCloseTo(1.25);
 expect(c.points[0].qc).toBeUndefined();expect(c.points[0].pre_excavated).toBe(true);expect(c.points[0].parameters?.source_qc).toBe(100);
 expect(c.points[1].qc).toBe(2);expect(c.points[2].qc).toBe(3);expect(validationOf(c)?.diagnostics.some(d=>d.code==='PRE_EXCAVATED')).toBe(true);
});


it('converts declared units without changing preserved source quantities',()=>{
 const value=parseGef(header().replace('1,m,length','1,cm,length').replace('2,MPa,qc','2,kPa,qc').replace('3,MPa,fs','3,kPa,fs')+'100 2000 20','units.gef');
 expect(value.points[0]).toMatchObject({depth:1,qc:2,fs:.02,rf:1,parameters:{'1':100,'2':2000}});
 expect(validationOf(value)?.diagnostics.filter(d=>d.code==='UNIT_CONVERSION')).toHaveLength(3);
});
it('refuses to interpret unknown pressure units as MPa',()=>{
 const value=parseGef(header().replace('2,MPa,qc','2,bananas,qc')+'1 2000 .02','units.gef');
 expect(value.points[0].qc).toBeUndefined();expect(value.points[0].parameters?.['2']).toBe(2000);
 expect(validationOf(value)?.diagnostics.some(d=>d.code==='UNKNOWN_UNIT')).toBe(true);
});

it('reports mixed record depth methods and explicit fallback from a void corrected depth',()=>{
 const source=header('#COLUMNVOID=4,-999999\n').replace('#COLUMN=3','#COLUMN=4').replace('#EOH=','#COLUMNINFO=4,m,depth,11\n#EOH=')+'1 2 .02 .98\n2 3 .03 -999999';
 const value=parseGef(source,'mixed.gef'),report=validationOf(value)!;
 expect(report.depthMethod).toBe('mixed');expect(report.depthMethods).toEqual([{record:1,method:'corrected-depth'},{record:2,method:'penetration-length'}]);
 expect(report.diagnostics.find(d=>d.code==='DEPTH_FALLBACK')).toMatchObject({record:2,column:4});
});
