import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseGef } from "./gefParser";
import { exportGef } from "./gefWriter";
import { validationOf } from "../validation/report";
const source = readFileSync(
  "../../tests/fixtures/gef/synthetic-cpt.gef",
  "utf8",
);
it("round-trips all measurement columns, corrected depth and RD/NAP through a standard GEF document", () => {
  const cpt = parseGef(source, "synthetic.gef"),
    output = exportGef(cpt),
    read = parseGef(output.text, "roundtrip.gef");
  expect(
    read.points.map((p) => [
      p.depth,
      p.qc,
      p.fs,
      p.rf,
      p.u2,
      p.parameters?.["1"],
    ]),
  ).toEqual(
    cpt.points.map((p) => [
      p.depth,
      p.qc,
      p.fs,
      p.rf,
      p.u2,
      p.parameters?.["1"],
    ]),
  );
  expect(read.position).toEqual(cpt.position);
  expect(
    validationOf(read)?.diagnostics.filter((d) => d.severity === "error"),
  ).toEqual([]);
  expect(output.text).toContain("#XYID= 31000");
  expect(output.text).toContain("#LASTSCAN= 3");
});
it("preserves explicit pre-excavation rather than inventing it from the first sample", () => {
  const cpt = parseGef(source, "synthetic.gef"),
    out = exportGef(cpt);
  expect(out.text).toContain("13, 0, m");
  expect(out.text).not.toContain("13, 0.98");
});
it("rejects recovered invalid records and missing original numeric data", () => {
  expect(() =>
    exportGef(parseGef(source.replace("1;2;", "1;bad;"), "bad.gef")),
  ).toThrow("bronfouten");
  const cpt = parseGef(source, "synthetic.gef");
  delete cpt.points[0].parameters?.column_2;
  expect(() => exportGef(cpt)).toThrow("kolomwaarden");
});
it("rejects header injection rather than silently altering a source id", () => {
  const cpt = parseGef(source, "synthetic.gef");
  cpt.id = "changed\n#ZID=31000,99";
  expect(() => exportGef(cpt)).toThrow("regeleinde");
});
