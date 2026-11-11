import i18next from "i18next";
import type { Cpt, ProjectMeta } from "./cpt";
import type { Bore } from "./bore";

const m = (key: string, nl: string, vars?: Record<string, unknown>) =>
  i18next.t(`import:${key}`, { defaultValue: nl, ...vars }) as string;

export interface ProjectFile {
  project: Partial<ProjectMeta>;
  cpts?: Cpt[];
  bores?: Bore[];
  tekening?: unknown;
  title_block?: unknown;
  calculations?: unknown[];
  gis?: unknown;
  deliverable?: unknown;
  crs?: unknown;
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function readJson(content: string): unknown {
  return JSON.parse(content.replace(/^\uFEFF/, ""));
}

/** IFCX embeds the complete editable project in its header. Entity order is arbitrary. */
function payload(value: unknown): unknown {
  if (!object(value)) return value;
  if (value.schema === "ifcx-cpt-0.1" && Array.isArray(value.objects)) {
    const project = value.objects.find(item => object(item) && item.type === "IfcProject");
    if (!object(project)) throw new Error(m("project.ifcxMissingProject", "IFCX mist projectgegevens."));
    return {
      project: { ...project, title: project.name },
      cpts: value.objects.filter(item => object(item) && item.type === "OpenGeoCpt").map(item => ({
        id: item.id, position: item.position ?? undefined, points: item.points,
        metadata: { ...(object(item.metadata) ? item.metadata : {}), source_file: item.source_file, project_name: item.project_name,
          project_number: item.project_number, date: item.date, ground_level_nap: item.ground_level_nap },
      })),
    };
  }
  const header = value.header;
  if (object(header) && object(header.metadata) && header.metadata.openGeoStudio !== undefined) {
    return header.metadata.openGeoStudio;
  }
  return value;
}

export function isProjectFile(value: unknown): boolean {
  const data = payload(value);
  return object(data) && (object(data.project) || Array.isArray(data.cpts) || Array.isArray(data.data));
}

export function validateCpt(value: unknown): asserts value is Cpt {
  if (!object(value) || typeof value.id !== "string" || !value.id.trim() ||
      !object(value.metadata) || typeof value.metadata.source_file !== "string" ||
      !Array.isArray(value.points) || value.points.some(p => !object(p) || typeof p.depth !== "number" || !Number.isFinite(p.depth))) {
    throw new Error(m("project.invalidCpt", "Ongeldige sondering: id, metadata of meetpunten ontbreken."));
  }
  const channels = ["depth_nap", "qc", "fs", "rf", "u2", "inclination"];
  if ((value.points as Record<string, unknown>[]).some(point => channels.some(key =>
    point[key] != null && (typeof point[key] !== "number" || !Number.isFinite(point[key]))))) {
    throw new Error(m("project.invalidCptValues", "Ongeldige sondering: meetwaarden moeten eindige getallen zijn."));
  }
  validatePosition(value.position);
}

function validatePosition(value: unknown): void {
  if (value == null) return;
  if (!object(value) || ["x_rd", "y_rd"].some(key => typeof value[key] !== "number" || !Number.isFinite(value[key])) ||
      (value.z_nap != null && (typeof value.z_nap !== "number" || !Number.isFinite(value.z_nap)))) {
    throw new Error(m("project.invalidPosition", "Ongeldige locatiecoördinaten."));
  }
}

export function parseCptSnapshot(content: string): Cpt {
  const data = readJson(content);
  validateCpt(data);
  return data;
}

export function parseProjectFile(content: string): ProjectFile {
  const data = payload(readJson(content));
  if (!object(data) || !object(data.project)) {
    throw new Error(m("project.noProjectData", "Dit projectbestand bevat geen bewerkbare projectgegevens."));
  }
  for (const key of ["title", "client", "location", "project_number", "author", "date"]) {
    if (data.project[key] != null && typeof data.project[key] !== "string") {
      throw new Error(m("project.invalidField", "Ongeldig projectveld: {{field}}.", { field: key }));
    }
  }
  if (data.cpts !== undefined && !Array.isArray(data.cpts)) throw new Error(m("project.invalidCptList", "Ongeldige sonderingenlijst."));
  for (const cpt of (data.cpts ?? []) as unknown[]) validateCpt(cpt);
  if (data.bores !== undefined && (!Array.isArray(data.bores) || data.bores.some(b =>
      !object(b) || typeof b.id !== "string" || !b.id || !object(b.metadata) || !Array.isArray(b.layers)))) {
    throw new Error(m("project.invalidBoreList", "Ongeldige boringenlijst."));
  }
  for (const bore of (data.bores ?? []) as Bore[]) {
    validatePosition(bore.position);
    if (typeof bore.metadata.source_file !== "string" || bore.layers.some(layer =>
      !object(layer) || typeof layer.top_depth !== "number" || !Number.isFinite(layer.top_depth) ||
      typeof layer.base_depth !== "number" || !Number.isFinite(layer.base_depth) ||
      layer.top_depth < 0 || layer.base_depth <= layer.top_depth || typeof layer.soil_name !== "string")) {
      throw new Error(m("project.invalidBoreLayers", "Ongeldige boorlagen."));
    }
  }
  for (const objects of [data.cpts ?? [], data.bores ?? []] as { id: string }[][]) {
    if (new Set(objects.map(item => item.id)).size !== objects.length) {
      throw new Error(m("project.duplicateId", "Dubbele object-id in projectbestand; import zou gegevens overschrijven."));
    }
  }
  return data as unknown as ProjectFile;
}
