// Het ondergrondmodel als IFCX (IFC5-alfa, `ifcx_alpha`), in de opbouw van de geotechnische voorbeelden van
// buildingSMART: IfcProject → IfcSite → IfcGeomodel met IfcGeotechnicalStratum-objecten (geometrie als USD-mesh),
// sonderingen als IfcBorehole met hun lagen als waarnemingen, peilbuizen als IfcSensor.
//
// Klassen volgen IFC 4.3 (`bsi::ifc::class` met de 4.3-URI). Het PredefinedType en de 4.3-eigenschappensets
// (Pset_GeotechnicalStratumCommon, Pset_SolidStratumCapacity, Pset_BoreholeCommon) staan in de eigen namespace
// `ogs::ifc4x3::…`, met een schema in dit bestand, omdat IFC5-alfa daar nog geen vaste attributen voor heeft.
// Coördinaten zijn absoluut: RD (EPSG:28992) en NAP.
import type { SoilModel } from "../soilModel";
import { zoneInfo } from "../soilModel";
import { LITHOCLASSES } from "./geotop";
import { aquifers } from "./regis";
import type { SubsurfaceData } from "./store";

type Rgb = [number, number, number];
interface Entry { path: string; children?: Record<string, string>; attributes?: Record<string, unknown>; inherits?: Record<string, string> }

const IFC43 = "https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4.3/class/";
const cls = (code: string) => ({ "bsi::ifc::class": { code, uri: IFC43 + code } });

/** Vaste, herhaalbare id's (zelfde invoer → zelfde bestand), in UUID-vorm. */
function makeIds(seed: string) {
  let n = 0;
  return (label: string) => {
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    const s = `${seed}|${label}|${n++}`;
    for (let i = 0; i < s.length; i++) { h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619); h2 = Math.imul(h2 ^ s.charCodeAt(i), 2246822519); }
    const hex = (v: number) => (v >>> 0).toString(16).padStart(8, "0");
    const a = hex(h1) + hex(h2) + hex(h1 ^ h2) + hex(Math.imul(h1, 31) ^ h2);
    return `${a.slice(0, 8)}-${a.slice(8, 12)}-4${a.slice(13, 16)}-8${a.slice(17, 20)}-${a.slice(20, 32)}`;
  };
}

const hexRgb = (hex: string): Rgb => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? [1, 2, 3].map((i) => Math.round((parseInt(m[i], 16) / 255) * 1000) / 1000) as Rgb : [0.6, 0.6, 0.6];
};

/** Mesh-opbouw met gedeelde punten. */
class Mesh {
  points: [number, number, number][] = [];
  faceVertexIndices: number[] = [];
  private index = new Map<string, number>();
  private pt(x: number, y: number, z: number) {
    const p: [number, number, number] = [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000, Math.round(z * 1000) / 1000];
    const key = p.join(",");
    let i = this.index.get(key);
    if (i === undefined) { i = this.points.length; this.points.push(p); this.index.set(key, i); }
    return i;
  }
  quad(a: number[], b: number[], c: number[], d: number[]) {
    const [ia, ib, ic, id] = [a, b, c, d].map((p) => this.pt(p[0], p[1], p[2]));
    this.faceVertexIndices.push(ia, ib, ic, ia, ic, id);
  }
  /** Blok met de vlakken die `open(zijde)` aangeeft (−x, +x, −y, +y, onder, boven). */
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, open: (side: number) => boolean = () => true) {
    if (open(0)) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);
    if (open(1)) this.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]);
    if (open(2)) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
    if (open(3)) this.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]);
    if (open(4)) this.quad([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]);
    if (open(5)) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
  }
  get empty() { return this.faceVertexIndices.length === 0; }
  toUsd() { return { points: this.points, faceVertexIndices: this.faceVertexIndices }; }
}

export interface IfcxInput {
  model: SoilModel;
  subsurface: SubsurfaceData;
  project: { title: string; number: string; author: string };
  /** Criterium voor de draagkrachtige laag, voor de omschrijving. */
  timestamp?: string;
}

export function buildSubsurfaceIfcx({ model, subsurface, project, timestamp }: IfcxInput) {
  const id = makeIds(`${project.number}|${project.title}|${model.columns.map((c) => c.id).join(",")}`);
  const data: Entry[] = [];
  const X = (east: number) => model.origin.x + east, Y = (north: number) => model.origin.y + north;
  const g = model.grid;
  const area = { x0: X(g.east0), x1: X(g.east0 + g.nx * g.dx), y0: Y(g.north0), y1: Y(g.north0 + g.ny * g.dy) };

  const materials = new Map<string, string>();
  const material = (rgb: Rgb) => {
    const key = rgb.join(",");
    let m = materials.get(key);
    if (!m) { m = id(`material ${key}`); materials.set(key, m); data.push({ path: m, attributes: { "bsi::ifc::presentation::diffuseColor": rgb } }); }
    return m;
  };

  const rootId = id("root"), projectId = id("project"), siteId = id("site"), modelId = id("geomodel");
  const siteChildren: Record<string, string> = { Ondergrondmodel: modelId };
  const strata: Record<string, string> = {};
  data.push({ path: rootId, children: { [project.title || "Project"]: projectId } });
  data.push({ path: projectId, attributes: { ...cls("IfcProject"), "bsi::ifc::prop::name": project.title || "Project" }, children: { Locatie: siteId } });
  data.push({ path: modelId, attributes: { ...cls("IfcGeomodel"), "bsi::ifc::prop::name": "Ondergrondmodel" } });

  const stratum = (key: string, name: string, predefinedType: "SOLID" | "WATER", mesh: Mesh, rgb: Rgb, extra: Record<string, unknown> = {}) => {
    if (mesh.empty) return;
    const p = id(`stratum ${key}`);
    strata[key] = p;
    data.push({ path: p, attributes: { ...cls("IfcGeotechnicalStratum"), "bsi::ifc::prop::name": name, "ogs::ifc4x3::predefinedType": predefinedType, ...extra } });
    data.push({ path: p, attributes: { "usd::usdgeom::mesh": mesh.toUsd() }, inherits: { material: material(rgb) } });
  };

  // 1. Grondsoorten uit de sonderingen (geïnterpoleerd voxelmodel): per zone de buitenvlakken.
  const zoneAt = (i: number, j: number, k: number) => (i < 0 || j < 0 || k < 0 || i >= g.nx || j >= g.ny || k >= g.nz ? 0 : g.zone[i + g.nx * (j + g.ny * k)]);
  for (const zone of model.zonesPresent) {
    const mesh = new Mesh();
    for (let k = 0; k < g.nz; k++) for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
      if (zoneAt(i, j, k) !== zone) continue;
      const x0 = X(g.east0 + i * g.dx), y0 = Y(g.north0 + j * g.dy), zt = g.topNap - k * g.dz;
      const nb = [zoneAt(i - 1, j, k), zoneAt(i + 1, j, k), zoneAt(i, j - 1, k), zoneAt(i, j + 1, k), zoneAt(i, j, k + 1), zoneAt(i, j, k - 1)];
      mesh.box(x0, x0 + g.dx, y0, y0 + g.dy, zt - g.dz, zt, (side) => nb[side] !== zone);
    }
    const info = zoneInfo(zone);
    stratum(`zone ${zone}`, `${info?.name ?? `Zone ${zone}`} (uit sonderingen)`, "SOLID", mesh, hexRgb(info?.color ?? "#999999"), {
      "ogs::source": { name: "Sonderingen, inverse-afstandsweging", method: "IDW (macht 2) per cel, Robertson-zone", cell_m: [g.dx, g.dy, g.dz] },
    });
  }

  // 2. Watervoerende pakketten (REGIS II), begrensd tot het modelgebied.
  const { regis, geotop, wells, groundwater } = subsurface;
  if (regis) {
    for (const a of aquifers(regis)) {
      const mesh = new Mesh();
      const ks: number[] = [];
      for (let j = 0; j < regis.ny; j++) for (let i = 0; i < regis.nx; i++) {
        const c = j * regis.nx + i, t = a.top[c], b = a.bottom[c];
        if (t === null || b === null) continue;
        const x0 = Math.max(area.x0, regis.x0 + i * regis.cell), x1 = Math.min(area.x1, regis.x0 + (i + 1) * regis.cell);
        const y0 = Math.max(area.y0, regis.y0 + j * regis.cell), y1 = Math.min(area.y1, regis.y0 + (j + 1) * regis.cell);
        if (x1 <= x0 || y1 <= y0) continue;
        mesh.box(x0, x1, y0, y1, b, t);
        if (a.kh[c] !== null) ks.push(a.kh[c]!);
      }
      const head = groundwater.heads[a.index - 1] ?? null;
      const khMs = ks.length ? ks.reduce((s, v) => s + v, 0) / ks.length / 86400 : null;
      stratum(`aquifer ${a.index}`, `${a.index}e watervoerend pakket`, "SOLID", mesh, [0.49, 0.83, 0.99], {
        "ogs::ifc4x3::pset::Pset_GeotechnicalStratumCommon": { PiezometricHead: head },
        "ogs::ifc4x3::pset::Pset_SolidStratumCapacity": { HydraulicConductivity: khMs },
        "ogs::source": { name: "REGIS II (TNO)", units: a.units.join(", ") },
      });
    }
  }

  // 3. Voxelmodel (GeoTOP), per lithoklasse, begrensd tot het modelgebied.
  if (geotop) {
    const nx = geotop.xs.length, ny = geotop.ys.length, nz = geotop.zs.length;
    const at = (i: number, j: number, k: number) => (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz ? null : geotop.lithok[(i * ny + j) * nz + k]);
    const classes = new Set(geotop.lithok.filter((v): v is number => v !== null));
    for (const lk of classes) {
      const mesh = new Mesh();
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) {
        if (at(i, j, k) !== lk) continue;
        const x0 = Math.max(area.x0, geotop.xs[i] - geotop.cell / 2), x1 = Math.min(area.x1, geotop.xs[i] + geotop.cell / 2);
        const y0 = Math.max(area.y0, geotop.ys[j] - geotop.cell / 2), y1 = Math.min(area.y1, geotop.ys[j] + geotop.cell / 2);
        if (x1 <= x0 || y1 <= y0) continue;
        const nb = [at(i - 1, j, k), at(i + 1, j, k), at(i, j - 1, k), at(i, j + 1, k), at(i, j, k - 1), at(i, j, k + 1)];
        const z = geotop.zs[k];
        mesh.box(x0, x1, y0, y1, z - geotop.dz / 2, z + geotop.dz / 2, (side) => side >= 4 ? nb[side] !== lk : true);
      }
      const info = LITHOCLASSES[lk];
      stratum(`geotop ${lk}`, `${info?.name ?? `Lithoklasse ${lk}`} (GeoTOP)`, "SOLID", mesh, hexRgb(info?.color ?? "#999999"), { "ogs::source": { name: "GeoTOP (TNO)", lithoklasse: lk } });
    }
  }

  // 4. Grondwater: freatisch vlak als WATER-stratum.
  if (groundwater.phreaticNap !== null) {
    const mesh = new Mesh(), z = groundwater.phreaticNap;
    mesh.quad([area.x0, area.y0, z], [area.x1, area.y0, z], [area.x1, area.y1, z], [area.x0, area.y1, z]);
    stratum("freatisch", "Freatisch grondwater", "WATER", mesh, [0.23, 0.51, 0.96], {
      "ogs::ifc4x3::pset::Pset_GeotechnicalStratumCommon": { PiezometricHead: z },
      "ogs::source": { name: groundwater.source === "metingen" ? "Afgeleid uit peilbuismetingen (BRO)" : "Handmatig vastgelegd" },
    });
  }

  // 5. Sonderingen als IfcBorehole, met de lagen als waarnemingen.
  for (const c of model.columns) {
    const bh = id(`borehole ${c.id}`), x = X(c.east), y = Y(c.north);
    siteChildren[c.id] = bh;
    const groundDepth = groundwater.phreaticNap === null ? null : c.groundNap - groundwater.phreaticNap;
    data.push({ path: bh, attributes: { ...cls("IfcBorehole"), "bsi::ifc::prop::name": c.id, "ogs::ifc4x3::pset::Pset_BoreholeCommon": { GroundwaterDepth: groundDepth } } });
    data.push({ path: bh, attributes: { "usd::usdgeom::basiscurves": { curveVertexCounts: [2], points: [[x, y, c.groundNap], [x, y, c.endNap]] } } });
    const children: Record<string, string> = {};
    c.layers.forEach((l, n) => {
      const p = id(`layer ${c.id} ${n}`);
      children[`laag ${n + 1}`] = p;
      data.push({ path: p, attributes: { "ogs::cpt::layer": { CPT_ID: c.id, NAME: l.name, ZONE: l.zone, TOP_NAP: l.topNap, BASE_NAP: l.bottomNap } } });
      data.push({ path: p, attributes: { "usd::usdgeom::basiscurves": { curveVertexCounts: [2], points: [[x, y, l.topNap], [x, y, l.bottomNap]] } }, inherits: { material: material(hexRgb(l.color)) } });
    });
    if (Object.keys(children).length) data.push({ path: bh, children });
  }

  // 6. Peilbuizen als IfcSensor met het filter als lijn.
  for (const w of wells ?? []) {
    if (w.screenTop === null || w.screenBottom === null) continue;
    const p = id(`well ${w.id}`);
    siteChildren[w.id] = p;
    data.push({ path: p, attributes: { ...cls("IfcSensor"), "bsi::ifc::prop::name": w.id, "ogs::well": { BRO_ID: w.broId, TUBE: w.tube, AQUIFER: w.aquifer, GLD: w.gld, ...(w.stats ?? {}) } } });
    data.push({ path: p, attributes: { "usd::usdgeom::basiscurves": { curveVertexCounts: [2], points: [[w.x, w.y, w.screenTop], [w.x, w.y, w.screenBottom]] } }, inherits: { material: material([0.11, 0.31, 0.85]) } });
  }

  data.push({ path: siteId, attributes: { ...cls("IfcSite"), "bsi::ifc::prop::name": "Locatie" }, children: siteChildren });
  data.push({ path: modelId, children: strata });

  const obj = (values: Record<string, { dataType: string }>) => ({ value: { dataType: "Object", objectRestrictions: { values } } });
  return {
    header: {
      id: `ogs-ondergrond-${(project.number || "project").replace(/[^\w-]+/g, "-")}@v1.ifcx`,
      ifcxVersion: "ifcx_alpha", dataVersion: "1.0.0", author: project.author || "Open Geotechniek Studio", timestamp: timestamp ?? new Date().toISOString(),
    },
    imports: [
      { uri: "https://ifcx.dev/@standards.buildingsmart.org/ifc/core/ifc@v5a.ifcx" },
      { uri: "https://ifcx.dev/@standards.buildingsmart.org/ifc/core/prop@v5a.ifcx" },
      { uri: "https://ifcx.dev/@openusd.org/usd@v1.ifcx" },
    ],
    schemas: {
      "bsi::ifc::prop::name": { value: { dataType: "String" } },
      "ogs::ifc4x3::predefinedType": { value: { dataType: "String" } },
      "ogs::ifc4x3::pset::Pset_GeotechnicalStratumCommon": obj({ PiezometricHead: { dataType: "Real" } }),
      "ogs::ifc4x3::pset::Pset_SolidStratumCapacity": obj({ HydraulicConductivity: { dataType: "Real" } }),
      "ogs::ifc4x3::pset::Pset_BoreholeCommon": obj({ GroundwaterDepth: { dataType: "Real" } }),
      "ogs::source": { value: { dataType: "Object" } },
      "ogs::cpt::layer": obj({ CPT_ID: { dataType: "String" }, NAME: { dataType: "String" }, ZONE: { dataType: "Integer" }, TOP_NAP: { dataType: "Real" }, BASE_NAP: { dataType: "Real" } }),
      "ogs::well": { value: { dataType: "Object" } },
    },
    data,
  };
}
