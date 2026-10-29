import type { Cpt, ProjectMeta } from "../types/cpt";

// Matches cpt-core/src/ifc.rs: exchange previews, not schema-validated IFC models.
export const IFC_EXPORT_NOTE = "Experimentele IFC-uitwisseling; nog niet gevalideerd tegen het officiële IFC-schema.";
const nativeNote = "Experimental OpenGeo CPT JSON exchange; not a standard IFC model";
type Format = "ifc4x3" | "ifcx";

function guid(kind: string, key: string): string {
  let hash = BigInt("0xcbf29ce484222325");
  for (const byte of new TextEncoder().encode(`${kind}|${key}`)) {
    hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * BigInt("0x100000001b3"));
  }
  const rotated = BigInt.asUintN(32, (hash << BigInt(13)) | (hash >> BigInt(51)));
  return `OGS${hash.toString(16).padStart(16, "0")}${rotated.toString(16).padStart(8, "0")}`;
}

export function generateIfcContent(cpts: Cpt[], project: ProjectMeta, format: Format): string {
  const timestamp = new Date().toISOString();
  if (format === "ifcx") {
    return JSON.stringify({
      schema: "ifcx-cpt-0.1",
      header: { originating_system: "Open Geotechniek Studio", timestamp, note: nativeNote },
      objects: [
        { type: "IfcProject", id: guid("project", project.title), name: project.title,
          client: project.client, location: project.location, project_number: project.project_number,
          author: project.author, date: project.date },
        { type: "IfcSite", id: guid("site", project.location), name: `Site - ${project.location}` },
        ...cpts.map(cpt => ({
          type: "OpenGeoCpt", id: cpt.id, guid: guid("cpt", cpt.id),
          metadata: { ...cpt.metadata },
          source_file: cpt.metadata.source_file, project_name: cpt.metadata.project_name ?? null,
          project_number: cpt.metadata.project_number ?? null, date: cpt.metadata.date ?? null,
          ground_level_nap: cpt.metadata.ground_level_nap ?? null,
          position: cpt.position ? { ...cpt.position, z_nap: cpt.position.z_nap ?? null } : null,
          points: cpt.points.map(p => ({ ...p, depth: p.depth, depth_nap: p.depth_nap ?? null,
            qc: p.qc ?? null, fs: p.fs ?? null, rf: p.rf ?? null, u2: p.u2 ?? null, inclination: p.inclination ?? null })),
        })),
      ],
    }, null, 2);
  }
  throw new Error("IFC4x3-export is uitgeschakeld: de oude STEP-writer is niet schema-geldig. Gebruik het CPT-projectbestand of de experimentele IFCX-snapshot.");
}
