// IFCX-export (IFC5 alpha) van een geotechnisch project: sonderingen met
// metadata en meetreeksen, de laagindeling per sondering, het 3D-grondmodel
// als geotechnische lagen, de bovenkant van de draagkrachtige laag en de
// palen uit de paalberekeningen.
//
// De opbouw volgt de geotechnische voorbeelden van buildingSMART
// (IFC5-development, examples/Geotech): IfcBorehole met per laag een kind,
// IfcGeomodel met IfcGeotechnicalStratum-meshes die naar de waarnemingen in
// de sonderingen verwijzen, kleuren via `inherits.material`, en
// georeferentie met een referentiepunt in lokale coördinaten plus
// kaartcoördinaten (RD, NAP, WGS84). Geometrie staat in meters: x = oost,
// y = noord t.o.v. het RD-referentiepunt, z = NAP.
import type { Cpt, MeasurementPoint, ProjectMeta } from "../types/cpt";
import type { Column, SoilModel, Surface, VoxelGrid } from "../components/soil3d/soilModel";
import { zones } from "../utils/soilZones";
import { rdToWgs84 } from "../utils/coordinates";

export const IFCX_IMPORTS = [
  "https://ifcx.dev/@standards.buildingsmart.org/ifc/core/ifc@v5a.ifcx",
  "https://ifcx.dev/@openusd.org/usd@v1.ifcx",
] as const;

const IFC_CLASS_URI = "https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4.3/class/";

export interface IfcxEntry {
  path: string;
  children?: Record<string, string>;
  inherits?: Record<string, string>;
  attributes?: Record<string, unknown>;
}
export interface IfcxDocument {
  header: { id: string; ifcxVersion: "ifcx_alpha"; dataVersion: string; author: string; timestamp: string };
  imports: { uri: string }[];
  schemas: Record<string, { value: SchemaValue }>;
  data: IfcxEntry[];
}
type SchemaValue = {
  dataType: "String" | "Real" | "Integer" | "Boolean" | "Object" | "Array";
  quantityKind?: string;
  objectRestrictions?: { values: Record<string, SchemaValue> };
  arrayRestrictions?: { value: SchemaValue };
};

export interface PileExport {
  id: string;
  name: string;
  cptId: string;
  pileType: string;
  diameterMm: number;
  headNap: number;
  toeNap: number;
  rcNetDKn?: number;
}

export interface ProjectIfcxInput {
  meta: ProjectMeta;
  cpts: Cpt[];
  model: SoilModel | null;
  piles?: PileExport[];
  /** Weergavenaam van een grondsoortzone (vertaald); standaard de Nederlandse naam. */
  zoneName?: (zone: number) => string;
  author?: string;
  timestamp?: string;
  /** Applicatieversie voor de header. */
  version?: string;
  /** Criterium waarmee de draagkrachtige laag is bepaald. */
  bearingCriterion?: { qcMpa: number; minThicknessM: number };
}

// ─── Hulpfuncties ────────────────────────────────────────────────

/** Deterministische UUID (versie 8) uit een tekst: dezelfde invoer geeft dezelfde paden. */
export function stableUuid(seed: string): string {
  const words: number[] = [];
  for (let round = 0; round < 4; round++) {
    let h = (0x811c9dc5 ^ (round * 0x9e3779b9)) >>> 0;
    const s = `${round}:${seed}`;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    words.push(h);
  }
  const hex = words.map((w) => w.toString(16).padStart(8, "0")).join("");
  const v = hex.slice(0, 12) + "8" + hex.slice(13, 16) + ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16) + hex.slice(17);
  return `${v.slice(0, 8)}-${v.slice(8, 12)}-${v.slice(12, 16)}-${v.slice(16, 20)}-${v.slice(20, 32)}`;
}

/** Kindnaam in IFCX: zonder spaties of tekens die als pad kunnen worden opgevat. */
export function childName(name: string): string {
  return name.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "item";
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return [0.6, 0.6, 0.6];
  return [m[1], m[2], m[3]].map((p) => Math.round((parseInt(p, 16) / 255) * 1000) / 1000) as [number, number, number];
}

const ifcClass = (code: string) => ({ code, uri: IFC_CLASS_URI + code });

/** Schrijft geometrie in afgeronde lokale coördinaten. */
class MeshBuilder {
  points: [number, number, number][] = [];
  indices: number[] = [];
  private lookup = new Map<string, number>();
  vertex(x: number, y: number, z: number): number {
    const p: [number, number, number] = [r3(x), r3(y), r3(z)];
    const key = p.join(",");
    let i = this.lookup.get(key);
    if (i === undefined) {
      i = this.points.length;
      this.points.push(p);
      this.lookup.set(key, i);
    }
    return i;
  }
  tri(a: number, b: number, c: number) {
    if (a !== b && b !== c && a !== c) this.indices.push(a, b, c);
  }
  quad(a: number, b: number, c: number, d: number) {
    this.tri(a, b, c);
    this.tri(a, c, d);
  }
  get empty() { return this.indices.length === 0; }
  toUsd() { return { faceVertexIndices: this.indices, points: this.points }; }
}

/** Viewers laden indices vaak als 16-bits getallen: hoogstens 65 535 punten per mesh. */
export const MAX_MESH_POINTS = 65535;

/** Deelt een mesh op in stukken van hoogstens `max` punten (per driehoek, zonder gaten). */
export function splitMesh(mesh: { points: [number, number, number][]; faceVertexIndices: number[] }, max = MAX_MESH_POINTS) {
  if (mesh.points.length <= max) return [mesh];
  const parts: { points: [number, number, number][]; faceVertexIndices: number[] }[] = [];
  let points: [number, number, number][] = [], indices: number[] = [], map = new Map<number, number>();
  const flush = () => { if (indices.length) parts.push({ points, faceVertexIndices: indices }); points = []; indices = []; map = new Map(); };
  for (let t = 0; t < mesh.faceVertexIndices.length; t += 3) {
    const tri = mesh.faceVertexIndices.slice(t, t + 3);
    if (points.length + tri.filter((i) => !map.has(i)).length > max) flush();
    for (const i of tri) {
      let j = map.get(i);
      if (j === undefined) { j = points.length; points.push(mesh.points[i]); map.set(i, j); }
      indices.push(j);
    }
  }
  flush();
  return parts;
}

/** Verticale cilinder (prisma) van `bottom` tot `top`, met deksels. */
export function cylinderMesh(x: number, y: number, bottom: number, top: number, radius: number, sides = 12) {
  const m = new MeshBuilder();
  const lo: number[] = [], hi: number[] = [];
  for (let s = 0; s < sides; s++) {
    const a = (2 * Math.PI * s) / sides;
    const px = x + radius * Math.cos(a), py = y + radius * Math.sin(a);
    lo.push(m.vertex(px, py, bottom));
    hi.push(m.vertex(px, py, top));
  }
  const cTop = m.vertex(x, y, top), cBot = m.vertex(x, y, bottom);
  for (let s = 0; s < sides; s++) {
    const n = (s + 1) % sides;
    m.quad(lo[s], lo[n], hi[n], hi[s]);
    m.tri(cTop, hi[s], hi[n]);
    m.tri(cBot, lo[n], lo[s]);
  }
  return m.toUsd();
}

/**
 * Buitenhuid van één grondsoort in het voxelraster: alleen de zijden naar
 * een andere zone of leegte, zodat elke stratum een gesloten oppervlak is.
 */
export function stratumMesh(grid: VoxelGrid, zone: number) {
  const { nx, ny, nz, east0, north0, dx, dy, topNap, dz } = grid;
  const at = (i: number, j: number, k: number) =>
    i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz ? 0 : grid.zone[i + nx * (j + ny * k)];
  const m = new MeshBuilder();
  const X = (i: number) => east0 + i * dx, Y = (j: number) => north0 + j * dy, Z = (k: number) => topNap - k * dz;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (at(i, j, k) !== zone) continue;
    const x0 = X(i), x1 = X(i + 1), y0 = Y(j), y1 = Y(j + 1), zt = Z(k), zb = Z(k + 1);
    const v = (x: number, y: number, z: number) => m.vertex(x, y, z);
    if (at(i - 1, j, k) !== zone) m.quad(v(x0, y0, zb), v(x0, y0, zt), v(x0, y1, zt), v(x0, y1, zb));
    if (at(i + 1, j, k) !== zone) m.quad(v(x1, y0, zb), v(x1, y1, zb), v(x1, y1, zt), v(x1, y0, zt));
    if (at(i, j - 1, k) !== zone) m.quad(v(x0, y0, zb), v(x1, y0, zb), v(x1, y0, zt), v(x0, y0, zt));
    if (at(i, j + 1, k) !== zone) m.quad(v(x0, y1, zb), v(x0, y1, zt), v(x1, y1, zt), v(x1, y1, zb));
    if (at(i, j, k - 1) !== zone) m.quad(v(x0, y0, zt), v(x1, y0, zt), v(x1, y1, zt), v(x0, y1, zt));
    if (at(i, j, k + 1) !== zone) m.quad(v(x0, y0, zb), v(x0, y1, zb), v(x1, y1, zb), v(x1, y0, zb));
  }
  return m;
}

/** Driehoeksnet door de celmiddens van een geïnterpoleerd oppervlak. */
export function surfaceMesh(s: Surface) {
  const m = new MeshBuilder();
  const idx: number[] = [];
  for (let j = 0; j < s.ny; j++) for (let i = 0; i < s.nx; i++)
    idx.push(m.vertex(s.east0 + (i + 0.5) * s.dx, s.north0 + (j + 0.5) * s.dy, s.values[i + s.nx * j]));
  for (let j = 0; j + 1 < s.ny; j++) for (let i = 0; i + 1 < s.nx; i++) {
    const a = idx[i + s.nx * j], b = idx[i + 1 + s.nx * j], c = idx[i + 1 + s.nx * (j + 1)], d = idx[i + s.nx * (j + 1)];
    m.quad(a, b, c, d);
  }
  return m;
}

/** Meetreeks: alle punten met een eindige waarde, uitgedund tot hoogstens `max` punten. */
function series(points: MeasurementPoint[], pick: (p: MeasurementPoint) => number | undefined, max = 2000) {
  const valid = points.filter((p) => Number.isFinite(p.depth) && Number.isFinite(pick(p) as number));
  const step = Math.max(1, Math.ceil(valid.length / max));
  const kept = valid.filter((_, i) => i % step === 0);
  return { depth: kept.map((p) => r3(p.depth)), value: kept.map((p) => Math.round((pick(p) as number) * 10000) / 10000) };
}

// ─── Schema's voor de eigen namespaces ───────────────────────────

const S = (dataType: SchemaValue["dataType"], quantityKind?: string): SchemaValue => (quantityKind ? { dataType, quantityKind } : { dataType });
const obj = (values: Record<string, SchemaValue>): SchemaValue => ({ dataType: "Object", objectRestrictions: { values } });
const arr = (value: SchemaValue): SchemaValue => ({ dataType: "Array", arrayRestrictions: { value } });
const seriesSchema = obj({ unit: S("String"), depth: arr(S("Real", "Length")), value: arr(S("Real")) });

export const IFCX_SCHEMAS: IfcxDocument["schemas"] = {
  "bsi::ifc::prop::name": { value: S("String") },
  "bsi::ifc::geotechnicalStratum": {
    value: obj({ observations: arr(obj({ ref: S("String") })) }),
  },
  epsg28992: { value: obj({ eastings: S("Real", "Length"), northings: S("Real", "Length") }) },
  epsg5709: { value: obj({ height: S("Real", "Length") }) },
  epsg4326: { value: obj({ latitude: S("Real", "Angle"), longitude: S("Real", "Angle") }) },
  "points::array": { value: obj({ positions: arr(arr(S("Real"))) }) },
  "ogs::project": {
    value: obj({ title: S("String"), client: S("String"), location: S("String"), projectNumber: S("String"), author: S("String"), date: S("String") }),
  },
  "ogs::cpt": {
    value: obj({
      id: S("String"), sourceFile: S("String"), date: S("String"), equipment: S("String"),
      xRd: S("Real", "Length"), yRd: S("Real", "Length"), groundLevelNap: S("Real", "Length"),
      finalDepth: S("Real", "Length"), pointCount: S("Integer"),
    }),
  },
  "ogs::cpt::qc": { value: seriesSchema },
  "ogs::cpt::fs": { value: seriesSchema },
  "ogs::cpt::rf": { value: seriesSchema },
  "ogs::cpt::u2": { value: seriesSchema },
  "ogs::cpt::layer": {
    value: obj({
      cptId: S("String"), zone: S("Integer"), soil: S("String"), method: S("String"),
      topNap: S("Real", "Length"), bottomNap: S("Real", "Length"),
    }),
  },
  "ogs::soil::zone": { value: obj({ zone: S("Integer"), soil: S("String"), classification: S("String") }) },
  "ogs::model": {
    value: obj({
      method: S("String"), cellSizeX: S("Real", "Length"), cellSizeY: S("Real", "Length"), cellSizeZ: S("Real", "Length"),
      bearingQcMpa: S("Real"), bearingMinThicknessM: S("Real", "Length"), indicative: S("Boolean"),
    }),
  },
  "ogs::pile": {
    value: obj({ cptId: S("String"), pileType: S("String"), diameterMm: S("Real"), headNap: S("Real", "Length"), toeNap: S("Real", "Length"), rcNetDKn: S("Real") }),
  },
};

// ─── Export ──────────────────────────────────────────────────────

export function buildProjectIfcx(input: ProjectIfcxInput): IfcxDocument {
  const { meta, cpts, model } = input;
  const zoneName = input.zoneName ?? ((z: number) => zones.find((x) => x.number === z)?.name ?? `Zone ${z}`);
  const data: IfcxEntry[] = [];
  const seed = `ogs:${meta.title}:${meta.project_number}`;
  const P = (key: string) => stableUuid(`${seed}:${key}`);
  const add = (e: IfcxEntry) => { data.push(e); return e.path; };
  /**
   * Zet een mesh op een object. Past hij niet binnen de puntgrens, dan komen
   * de stukken als kinderen (Part_1, Part_2 …) met hetzelfde materiaal.
   */
  const attachMesh = (path: string, key: string, mesh: { points: [number, number, number][]; faceVertexIndices: number[] }, mat: string) => {
    const parts = splitMesh(mesh);
    if (parts.length === 1) {
      add({ path, inherits: { material: mat }, attributes: { "usd::usdgeom::mesh": parts[0] } });
      return;
    }
    const children: Record<string, string> = {};
    parts.forEach((part, i) => {
      const child = P(`${key}:part:${i}`);
      children[`Part_${i + 1}`] = child;
      add({ path: child, inherits: { material: mat }, attributes: { "usd::usdgeom::mesh": part } });
    });
    add({ path, children });
  };

  const origin = model?.origin ?? { x: 0, y: 0 };
  const root = P("root"), project = P("project"), site = P("site");
  const siteChildren: Record<string, string> = {};

  // Materialen: één kleur per grondsoort, plus vaste kleuren voor overige objecten.
  const materials = new Map<string, string>();
  const material = (key: string, rgb: [number, number, number], opacity?: number) => {
    let path = materials.get(key);
    if (!path) {
      path = P(`material:${key}`);
      const attributes: Record<string, unknown> = { "bsi::ifc::presentation::diffuseColor": rgb };
      if (opacity !== undefined) attributes["bsi::ifc::presentation::opacity"] = opacity;
      add({ path, attributes });
      materials.set(key, path);
    }
    return path;
  };
  const zoneMaterial = (z: number) => material(`zone-${z}`, hexToRgb(zones.find((x) => x.number === z)?.color ?? "#999999"));

  add({ path: root, children: { [childName(meta.title || "Project")]: project } });
  add({
    path: project,
    children: { Site: site },
    attributes: {
      "bsi::ifc::class": ifcClass("IfcProject"),
      "bsi::ifc::prop::name": meta.title || "Project",
      "ogs::project": {
        title: meta.title ?? "", client: meta.client ?? "", location: meta.location ?? "",
        projectNumber: meta.project_number ?? "", author: meta.author ?? "", date: meta.date ?? "",
      },
    },
  });

  // Georeferentie: referentiepunt in de lokale oorsprong met RD, NAP en WGS84.
  const refPoint = P("reference-point");
  siteChildren.ReferencePoint = refPoint;
  const wgs = rdToWgs84(origin.x, origin.y);
  add({
    path: refPoint,
    attributes: {
      "points::array": { positions: [[0, 0, 0]] },
      "usd::xformop": { transform: [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]] },
      epsg28992: { eastings: r3(origin.x), northings: r3(origin.y) },
      epsg5709: { height: 0 },
      epsg4326: { latitude: Math.round(wgs.lat * 1e8) / 1e8, longitude: Math.round(wgs.lon * 1e8) / 1e8 },
    },
  });

  // ─── Grondonderzoek: één IfcBorehole per sondering ─────────────
  const columnById = new Map<string, Column>((model?.columns ?? []).map((c) => [c.id, c]));
  const radius = Math.max(0.25, (model?.span ?? 40) / 160);
  const observationsByZone = new Map<number, string[]>();
  const usedNames = new Set<string>();
  const uniqueName = (base: string) => {
    let n = childName(base), i = 2;
    while (usedNames.has(n)) n = `${childName(base)}_${i++}`;
    usedNames.add(n);
    return n;
  };

  for (const cpt of cpts) {
    const col = columnById.get(cpt.id);
    if (!col || !col.placed) continue; // zonder RD-positie geen plek in het model
    const hole = P(`cpt:${cpt.id}`);
    const name = cpt.metadata.source_file?.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "") || cpt.id;
    siteChildren[uniqueName(`CPT_${name}`)] = hole;
    const holeChildren: Record<string, string> = {};
    const maxDepth = cpt.points.reduce((m, p) => (Number.isFinite(p.depth) ? Math.max(m, p.depth) : m), 0);
    const attributes: Record<string, unknown> = {
      "bsi::ifc::class": ifcClass("IfcBorehole"),
      "bsi::ifc::prop::name": name,
      "ogs::cpt": {
        id: cpt.id, sourceFile: cpt.metadata.source_file ?? "", date: cpt.metadata.date ?? "", equipment: cpt.metadata.equipment ?? "",
        xRd: r3(cpt.position?.x_rd ?? origin.x + col.east), yRd: r3(cpt.position?.y_rd ?? origin.y + col.north),
        groundLevelNap: r3(col.groundNap), finalDepth: r3(maxDepth), pointCount: cpt.points.length,
      },
    };
    const qc = series(cpt.points, (p) => p.qc), fs = series(cpt.points, (p) => p.fs), rf = series(cpt.points, (p) => p.rf), u2 = series(cpt.points, (p) => p.u2);
    if (qc.value.length) attributes["ogs::cpt::qc"] = { unit: "MPa", ...qc };
    if (fs.value.length) attributes["ogs::cpt::fs"] = { unit: "MPa", ...fs };
    if (rf.value.length) attributes["ogs::cpt::rf"] = { unit: "%", ...rf };
    if (u2.value.length) attributes["ogs::cpt::u2"] = { unit: "MPa", ...u2 };
    add({ path: hole, attributes });

    // Laagindeling: per laag een kolomstuk in de kleur van de grondsoort.
    col.layers.forEach((l, li) => {
      if (!(l.topNap > l.bottomNap)) return;
      const layer = P(`cpt:${cpt.id}:layer:${li}`);
      holeChildren[`L${String(li + 1).padStart(3, "0")}_${childName(zoneName(l.zone))}`] = layer;
      add({
        path: layer,
        inherits: { material: zoneMaterial(l.zone) },
        attributes: {
          "bsi::ifc::prop::name": zoneName(l.zone),
          "ogs::cpt::layer": { cptId: cpt.id, zone: l.zone, soil: zoneName(l.zone), method: "indicative-qc-rf", topNap: r3(l.topNap), bottomNap: r3(l.bottomNap) },
          "usd::usdgeom::mesh": cylinderMesh(col.east, col.north, l.bottomNap, l.topNap, radius),
        },
      });
      const list = observationsByZone.get(l.zone) ?? [];
      list.push(layer);
      observationsByZone.set(l.zone, list);
    });

    // De conusweerstand als lijn naast de sondering (30 MPa ≈ 6 % van het model).
    if (qc.value.length > 1) {
      const scale = Math.max(2, (model?.span ?? 40) * 0.06) / 30;
      const curve = P(`cpt:${cpt.id}:qc-curve`);
      holeChildren.qc_curve = curve;
      add({
        path: curve,
        inherits: { material: material("qc", [0.702, 0.149, 0.118]) },
        attributes: {
          "bsi::ifc::prop::name": "qc",
          "usd::usdgeom::basiscurves": {
            curveVertexCounts: [qc.value.length],
            points: qc.depth.map((d, i) => [r3(col.east + radius + Math.min(qc.value[i], 60) * scale), r3(col.north), r3(col.groundNap - d)]),
          },
        },
      });
    }
    add({ path: hole, children: holeChildren });
  }

  // ─── Grondmodel ─────────────────────────────────────────────────
  if (model) {
    const geomodel = P("geomodel");
    siteChildren.GroundModel = geomodel;
    const g = model.grid;
    const gmChildren: Record<string, string> = {};
    add({
      path: geomodel,
      attributes: {
        "bsi::ifc::class": ifcClass("IfcGeomodel"),
        "bsi::ifc::prop::name": "Grondmodel (indicatief)",
        "ogs::model": {
          method: "IDW-stemming van de qc/Rf-laagindeling tussen sonderingen (macht 2)",
          cellSizeX: r3(g.dx), cellSizeY: r3(g.dy), cellSizeZ: r3(g.dz),
          bearingQcMpa: input.bearingCriterion?.qcMpa ?? 10, bearingMinThicknessM: input.bearingCriterion?.minThicknessM ?? 1,
          indicative: true,
        },
      },
    });
    for (const z of model.zonesPresent) {
      const mesh = stratumMesh(g, z);
      if (mesh.empty) continue;
      const stratum = P(`stratum:${z}`);
      gmChildren[`Z${z}_${childName(zoneName(z))}`] = stratum;
      add({
        path: stratum,
        attributes: {
          "bsi::ifc::class": ifcClass("IfcGeotechnicalStratum"),
          "bsi::ifc::prop::name": zoneName(z),
          "bsi::ifc::geotechnicalStratum": { observations: (observationsByZone.get(z) ?? []).map((ref) => ({ ref })) },
          "ogs::soil::zone": { zone: z, soil: zoneName(z), classification: "qc/Rf (indicatief)" },
        },
      });
      attachMesh(stratum, `stratum:${z}`, mesh.toUsd(), zoneMaterial(z));
    }
    if (model.bearing) {
      const surface = P("bearing-layer");
      gmChildren.BearingLayerTop = surface;
      add({
        path: surface,
        inherits: { material: material("bearing", [0.91, 0.349, 0.047], 0.5) },
        attributes: {
          "bsi::ifc::class": ifcClass("IfcVirtualElement"),
          "bsi::ifc::prop::name": "Bovenkant draagkrachtige laag",
          "usd::usdgeom::mesh": surfaceMesh(model.bearing).toUsd(),
        },
      });
    }
    add({ path: geomodel, children: gmChildren });
  }

  // ─── Palen uit de paalberekeningen ──────────────────────────────
  for (const pile of input.piles ?? []) {
    const col = columnById.get(pile.cptId);
    if (!col || !col.placed || !(pile.headNap > pile.toeNap)) continue;
    const path = P(`pile:${pile.id}`);
    siteChildren[uniqueName(`Pile_${pile.name}`)] = path;
    const r = Math.max(0.05, pile.diameterMm / 2000);
    add({
      path,
      inherits: { material: material("pile", [0.122, 0.161, 0.2]) },
      attributes: {
        "bsi::ifc::class": ifcClass("IfcPile"),
        "bsi::ifc::prop::name": pile.name,
        "ogs::pile": { cptId: pile.cptId, pileType: pile.pileType, diameterMm: pile.diameterMm, headNap: r3(pile.headNap), toeNap: r3(pile.toeNap), rcNetDKn: r3(pile.rcNetDKn ?? 0) },
        // Naast de sondering, zodat beide zichtbaar blijven.
        "usd::usdgeom::mesh": cylinderMesh(col.east - 3 * radius - r, col.north, pile.toeNap, pile.headNap, r, 16),
      },
    });
  }

  add({ path: site, attributes: { "bsi::ifc::class": ifcClass("IfcSite"), "bsi::ifc::prop::name": meta.location || "Site" } });
  add({ path: site, children: siteChildren });

  return {
    header: {
      id: `open-geotechniek-studio/${childName(meta.title || "project")}@${input.timestamp ?? new Date().toISOString()}.ifcx`,
      ifcxVersion: "ifcx_alpha",
      dataVersion: input.version ?? "1.0.0",
      author: input.author || meta.author || "Open Geotechniek Studio",
      timestamp: input.timestamp ?? new Date().toISOString(),
    },
    imports: IFCX_IMPORTS.map((uri) => ({ uri })),
    schemas: IFCX_SCHEMAS,
    data,
  };
}
