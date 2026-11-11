import { describe, expect, it } from "vitest";
import type { Cpt, ProjectMeta } from "../types/cpt";
import { buildSoilModel } from "../components/soil3d/soilModel";
import { buildProjectIfcx, cylinderMesh, splitMesh, stableUuid, stratumMesh, type IfcxDocument } from "./projectIfcx";

function cpt(id: string, x: number, ground: number, depth: number, qc: (d: number) => number, rf: number): Cpt {
  const points = [];
  for (let d = 0.1; d <= depth + 1e-9; d += 0.1) points.push({ depth: Math.round(d * 10) / 10, qc: qc(d), rf, fs: (qc(d) * rf) / 100 });
  return {
    id,
    metadata: { ground_level_nap: ground, source_file: `${id}.gef`, date: "2026-11-01" } as Cpt["metadata"],
    position: { x_rd: 126300 + x, y_rd: 426680 },
    points,
  } as Cpt;
}

const meta: ProjectMeta = { title: "Testproject", client: "Klant", location: "Dordrecht", project_number: "P-1", author: "Ingenieur", date: "2026-11-11" };
const cpts = [
  cpt("A", -10, 1, 12, (d) => (d > 6.05 ? 15 : 0.8), 4),
  cpt("B", 10, 0.5, 14, (d) => (d > 8.05 ? 18 : 2), 0.6),
];
const model = buildSoilModel(cpts, { bearingQcMpa: 10, bearingMinThicknessM: 1 });
const doc = buildProjectIfcx({
  meta, cpts, model, timestamp: "2026-11-11T12:00:00Z",
  piles: [{ id: "p1", name: "Paal 1", cptId: "A", pileType: "Stalen buispaal", diameterMm: 219, headNap: 0.5, toeNap: -7, rcNetDKn: 300 }],
});

/** Schema's die de geïmporteerde IFC5- en USD-bestanden leveren. */
const IMPORTED = new Set([
  "bsi::ifc::class", "bsi::ifc::presentation::diffuseColor", "bsi::ifc::presentation::opacity",
  "usd::usdgeom::mesh", "usd::usdgeom::basiscurves", "usd::xformop", "usd::usdgeom::visibility",
]);

type Schema = { dataType: string; objectRestrictions?: { values: Record<string, Schema> }; arrayRestrictions?: { value: Schema } };
function conforms(value: unknown, s: Schema, where: string): string[] {
  switch (s.dataType) {
    case "String": return typeof value === "string" ? [] : [`${where}: geen tekst`];
    case "Real": return typeof value === "number" && Number.isFinite(value) ? [] : [`${where}: geen getal`];
    case "Integer": return Number.isInteger(value) ? [] : [`${where}: geen geheel getal`];
    case "Boolean": return typeof value === "boolean" ? [] : [`${where}: geen boolean`];
    case "Array":
      return Array.isArray(value) ? value.flatMap((v, i) => conforms(v, s.arrayRestrictions!.value, `${where}[${i}]`)) : [`${where}: geen lijst`];
    case "Object": {
      if (typeof value !== "object" || value === null || Array.isArray(value)) return [`${where}: geen object`];
      const fields = s.objectRestrictions!.values;
      const errs = Object.keys(value).filter((k) => !(k in fields)).map((k) => `${where}.${k}: onbekend veld`);
      for (const [k, fs] of Object.entries(fields)) {
        if (!(k in value)) errs.push(`${where}.${k}: ontbreekt`);
        else errs.push(...conforms((value as Record<string, unknown>)[k], fs, `${where}.${k}`));
      }
      return errs;
    }
  }
  return [`${where}: onbekend type ${s.dataType}`];
}

function validate(d: IfcxDocument): string[] {
  const errors: string[] = [];
  const paths = new Set(d.data.map((e) => e.path));
  const childTargets = new Set<string>();
  for (const e of d.data) {
    for (const [name, target] of Object.entries(e.children ?? {})) {
      if (!paths.has(target)) errors.push(`${e.path} → kind ${name} bestaat niet`);
      if (!/^[A-Za-z0-9_-]+$/.test(name)) errors.push(`ongeldige kindnaam ${name}`);
      childTargets.add(target);
    }
    for (const target of Object.values(e.inherits ?? {})) if (!paths.has(target)) errors.push(`${e.path} erft van ontbrekend ${target}`);
    for (const [key, value] of Object.entries(e.attributes ?? {})) {
      if (IMPORTED.has(key)) continue;
      const schema = d.schemas[key];
      if (!schema) { errors.push(`attribuut ${key} zonder schema`); continue; }
      errors.push(...conforms(value, schema.value as Schema, key));
    }
    const strat = e.attributes?.["bsi::ifc::geotechnicalStratum"] as { observations: { ref: string }[] } | undefined;
    for (const o of strat?.observations ?? []) if (!paths.has(o.ref)) errors.push(`waarneming ${o.ref} bestaat niet`);
    const mesh = e.attributes?.["usd::usdgeom::mesh"] as { points: number[][]; faceVertexIndices: number[] } | undefined;
    if (mesh) {
      if (mesh.faceVertexIndices.length % 3) errors.push(`${e.path}: mesh niet in driehoeken`);
      if (mesh.faceVertexIndices.some((i) => i < 0 || i >= mesh.points.length)) errors.push(`${e.path}: index buiten bereik`);
    }
  }
  const roots = [...paths].filter((p) => !childTargets.has(p) && d.data.some((e) => e.path === p && e.children));
  if (roots.length !== 1) errors.push(`verwacht één wortel, gevonden ${roots.length}`);
  return errors;
}

/** Elke rand hoort bij precies twee driehoeken: het oppervlak is gesloten. */
function isClosed(indices: number[]): boolean {
  const edges = new Map<string, number>();
  for (let t = 0; t < indices.length; t += 3) {
    const tri = [indices[t], indices[t + 1], indices[t + 2]];
    for (let k = 0; k < 3; k++) {
      const a = tri[k], b = tri[(k + 1) % 3];
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  return [...edges.values()].every((n) => n === 2);
}

const byClass = (code: string) => doc.data.filter((e) => (e.attributes?.["bsi::ifc::class"] as { code: string } | undefined)?.code === code);

describe("buildProjectIfcx", () => {
  it("is een geldig IFC5-alpha-document met kloppende verwijzingen en schema's", () => {
    expect(doc.header.ifcxVersion).toBe("ifcx_alpha");
    expect(doc.imports.map((i) => i.uri)).toContain("https://ifcx.dev/@standards.buildingsmart.org/ifc/core/ifc@v5a.ifcx");
    expect(validate(doc)).toEqual([]);
  });

  it("bevat project, site, sonderingen, grondmodel, lagen en paal", () => {
    expect(byClass("IfcProject")).toHaveLength(1);
    expect(byClass("IfcSite")).toHaveLength(1);
    expect(byClass("IfcBorehole")).toHaveLength(2);
    expect(byClass("IfcGeomodel")).toHaveLength(1);
    expect(byClass("IfcGeotechnicalStratum").length).toBe(model.zonesPresent.length);
    expect(byClass("IfcPile")).toHaveLength(1);
    expect(byClass("IfcVirtualElement")).toHaveLength(1); // bovenkant draagkrachtige laag
  });

  it("neemt de meetreeksen en metadata van de sondering op", () => {
    const hole = byClass("IfcBorehole")[0];
    const qc = hole.attributes!["ogs::cpt::qc"] as { unit: string; depth: number[]; value: number[] };
    expect(qc.unit).toBe("MPa");
    expect(qc.depth.length).toBe(cpts[0].points.length);
    expect(hole.attributes!["ogs::cpt"]).toMatchObject({ id: "A", xRd: 126290, yRd: 426680, groundLevelNap: 1 });
  });

  it("georefereert de lokale oorsprong in RD, NAP en WGS84", () => {
    const ref = doc.data.find((e) => e.attributes?.epsg28992)!;
    expect(ref.attributes!.epsg28992).toEqual({ eastings: model.origin.x, northings: model.origin.y });
    const wgs = ref.attributes!.epsg4326 as { latitude: number; longitude: number };
    // RD (126 300, 426 680) ligt bij Gorinchem: ca. 51,83° N, 4,97° O.
    expect(wgs.latitude).toBeGreaterThan(51.78);
    expect(wgs.latitude).toBeLessThan(51.88);
    expect(wgs.longitude).toBeGreaterThan(4.92);
    expect(wgs.longitude).toBeLessThan(5.02);
  });

  it("legt per grondsoort de verwijzing naar de waarnemingen in de sonderingen", () => {
    for (const s of byClass("IfcGeotechnicalStratum")) {
      const obs = (s.attributes!["bsi::ifc::geotechnicalStratum"] as { observations: unknown[] }).observations;
      expect(obs.length).toBeGreaterThan(0);
    }
  });

  it("maakt gesloten meshes voor de lagen en kolommen", () => {
    for (const z of model.zonesPresent) expect(isClosed(stratumMesh(model.grid, z).indices)).toBe(true);
    expect(isClosed(cylinderMesh(0, 0, -5, 1, 0.3).faceVertexIndices)).toBe(true);
  });

  it("deelt grote meshes op binnen de puntgrens zonder driehoeken te verliezen", () => {
    const big = stratumMesh(model.grid, model.zonesPresent[0]).toUsd();
    const parts = splitMesh(big, 100);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) {
      expect(p.points.length).toBeLessThanOrEqual(100);
      expect(Math.max(...p.faceVertexIndices)).toBeLessThan(p.points.length);
    }
    expect(parts.reduce((n, p) => n + p.faceVertexIndices.length, 0)).toBe(big.faceVertexIndices.length);
    expect(splitMesh(big)).toHaveLength(1);
  });

  it("houdt elke mesh in het document binnen 65 535 punten", () => {
    for (const e of doc.data) {
      const m = e.attributes?.["usd::usdgeom::mesh"] as { points: unknown[] } | undefined;
      if (m) expect(m.points.length).toBeLessThanOrEqual(65535);
    }
  });

  it("geeft bij dezelfde invoer dezelfde paden", () => {
    const again = buildProjectIfcx({ meta, cpts, model, timestamp: "2026-11-11T12:00:00Z" });
    expect(again.data.find((e) => (e.attributes?.["bsi::ifc::class"] as { code: string } | undefined)?.code === "IfcProject")!.path)
      .toBe(byClass("IfcProject")[0].path);
    expect(stableUuid("x")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(stableUuid("x")).not.toBe(stableUuid("y"));
  });
});
