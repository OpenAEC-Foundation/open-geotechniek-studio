import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { parseGef } from "../packages/core/dist/index.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const base = path.join(
  root,
  "apps/desktop/node_modules/@bedrock-engineer/gef-parser/dist",
);
const { default: init } = await import(
  pathToFileURL(path.join(base, "wasm/gef_file_to_map.js"))
);
await init({
  module_or_path: fs.readFileSync(
    path.join(base, "wasm/gef_file_to_map_bg.wasm"),
  ),
});
const { parseGefFile } = await import(
  pathToFileURL(path.join(base, "index.js"))
);
const python = process.env.OGS_TEST_PYTHON || "python3";
const files = fs
  .readdirSync(path.join(root, "tests/fixtures/gef"))
  .filter((f) => f.endsWith(".gef"))
  .map((f) => path.join(root, "tests/fixtures/gef", f));
files.push(path.join(root, "apps/desktop/public/example.gef"));
for (const file of files) {
  const text = fs.readFileSync(file, "utf8"),
    ours = parseGef(text, path.basename(file)),
    other = await parseGefFile(text, path.basename(file));
  const labels = new Map(
    [
      ...text.matchAll(
        /^#COLUMNINFO\s*=\s*\d+\s*,\s*[^,]+\s*,\s*([^,]+)\s*,\s*(\d+)/gm,
      ),
    ].map((m) => [Number(m[2]), m[1].trim()]),
  );
  const voidByIndex = new Map(
    [...text.matchAll(/^#COLUMNVOID\s*=\s*(\d+)\s*,\s*([-+\d.eE]+)/gm)].map(
      (m) => [Number(m[1]), Number(m[2])],
    ),
  );
  const voidByQuantity = new Map(
    [
      ...text.matchAll(
        /^#COLUMNINFO\s*=\s*(\d+)\s*,\s*[^,]+\s*,\s*[^,]+\s*,\s*(\d+)/gm,
      ),
    ].map((m) => [Number(m[2]), voidByIndex.get(Number(m[1]))]),
  );
  const result = spawnSync(
    python,
    [
      "-c",
      "import json,pygef,sys; print(json.dumps(pygef.read_cpt(sys.argv[1],engine='gef',remove_pre_excavated_rows=False,replace_column_voids=False).data.to_dicts()))",
      file,
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0)
    throw new Error(result.stderr || "pygef did not run");
  const py = JSON.parse(result.stdout);
  assert.equal(ours.points.length, other.data.length);
  assert.equal(ours.points.length, py.length);
  const close = (a, b, context) =>
    assert.ok(
      a == null ? b == null : typeof b === "number" && Math.abs(a - b) <= 1e-8,
      `${context}: ${a} != ${b}`,
    );
  for (let i = 0; i < ours.points.length; i++) {
    const p = ours.points[i],
      bed = other.data[i],
      pythonPoint = py[i];
    close(p.depth, bed.trueDepth, `${file} row ${i + 1} Bedrock depth`);
    close(p.depth, pythonPoint.depth, `${file} row ${i + 1} pygef depth`);
    for (const [field, q, pyField] of [
      ["qc", 2, "coneResistance"],
      ["fs", 3, "localFriction"],
      ["rf", 4, "frictionRatio"],
      ["u2", 6, "porePressureU2"],
    ]) {
      const normalize = (value) =>
        value === voidByQuantity.get(q) || value === -999999 ? null : value;
      close(
        p[field],
        normalize(bed[labels.get(q)]),
        `${file} row ${i + 1} Bedrock ${field}`,
      );
      close(
        p[field],
        normalize(pythonPoint[pyField]),
        `${file} row ${i + 1} pygef ${field}`,
      );
    }
  }
  console.log(
    `${path.basename(file)}: ${ours.points.length} rows agree with Bedrock 0.4.2 and pygef 0.14.1`,
  );
}
