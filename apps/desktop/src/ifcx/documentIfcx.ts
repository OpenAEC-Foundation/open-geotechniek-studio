// IFCX van een geopend document (project of losse sondering): verzamelt de
// sonderingen, het grondmodel en de palen uit de paalberekeningen en bouwt
// er één IFC5-bestand van. Gedeeld door het IFC-tabblad, de exportknoppen
// en de MCP-tool, zodat ze allemaal hetzelfde bestand opleveren.
import type { Cpt, ProjectMeta } from "../types/cpt";
import { buildSoilModel, type SoilModel } from "../components/soil3d/soilModel";
import { useCalculationsStore } from "../calc/framework/store";
import { computePile } from "../calc/modules/pile-bearing-capacity/compute";
import { pileTypeName, resolvePileType } from "../calc/modules/pile-bearing-capacity/catalog";
import type { PileInput } from "../calc/modules/pile-bearing-capacity/types";
import { zoneName } from "../utils/soilZones";
import { APP_VERSION } from "../version";
import { buildProjectIfcx, type IfcxDocument, type PileExport } from "./projectIfcx";

export interface IfcxSource {
  id: string;
  meta: ProjectMeta;
  cpts: Cpt[];
}

/** Criterium voor de draagkrachtige laag: uit een funderingsadvies, anders de standaard. */
export function bearingCriterion(docId: string): { qcMpa: number; minThicknessM: number } {
  const calcs = useCalculationsStore.getState().byDoc.get(docId) ?? [];
  const advice = calcs.find((c) => c.moduleId === "foundation-advice");
  const input = advice?.input as { bearingQcMpa?: number; bearingMinThicknessM?: number } | undefined;
  return {
    qcMpa: Number.isFinite(input?.bearingQcMpa) ? input!.bearingQcMpa! : 10,
    minThicknessM: Number.isFinite(input?.bearingMinThicknessM) ? input!.bearingMinThicknessM! : 1,
  };
}

/** Palen uit de paalberekeningen van het document, met Rc;net;d als die berekend is. */
export function pilesOf(docId: string, cpts: Cpt[]): PileExport[] {
  const calcs = useCalculationsStore.getState().byDoc.get(docId) ?? [];
  const byId = new Map(cpts.map((c) => [c.id, c]));
  return calcs
    .filter((c) => c.moduleId === "pile-bearing-capacity")
    .flatMap((c) => {
      const input = c.input as PileInput;
      if (!input.cptId || !Number.isFinite(input.pileTopNap) || !Number.isFinite(input.pileToeNap)) return [];
      const cpt = byId.get(input.cptId) ?? null;
      let rcNetDKn: number | undefined;
      try {
        const r = computePile(input, cpt);
        if (r.ok && Number.isFinite(r.summary.rcNetD)) rcNetDKn = r.summary.rcNetD;
      } catch { /* geen resultaat: alleen de geometrie */ }
      const type = resolvePileType(input);
      return [{
        id: c.id, name: c.name, cptId: input.cptId,
        pileType: type ? pileTypeName(type) : input.pileTypeId,
        diameterMm: input.diameterMm, headNap: input.pileTopNap, toeNap: input.pileToeNap, rcNetDKn,
      }];
    });
}

/** Bouwt het IFCX-document; geeft ook het grondmodel terug (null zonder sonderingen). */
export function documentIfcx(source: IfcxSource, timestamp = new Date().toISOString()): { doc: IfcxDocument; model: SoilModel | null } {
  const criterion = bearingCriterion(source.id);
  let model: SoilModel | null = null;
  if (source.cpts.length) {
    try {
      model = buildSoilModel(source.cpts, { bearingQcMpa: criterion.qcMpa, bearingMinThicknessM: criterion.minThicknessM });
    } catch {
      model = null;
    }
  }
  const doc = buildProjectIfcx({
    meta: source.meta,
    cpts: source.cpts,
    model,
    piles: pilesOf(source.id, source.cpts),
    zoneName: (z) => zoneName(z),
    timestamp,
    version: APP_VERSION,
    bearingCriterion: criterion,
  });
  return { doc, model };
}

/**
 * IFCX als tekst: ingesprongen voor leesbaarheid, maar getallenlijsten
 * (coördinaten, indices, meetreeksen) op één regel, anders wordt elk getal
 * een eigen regel en het bestand onnodig groot.
 */
export function stringifyIfcx(doc: IfcxDocument): string {
  return JSON.stringify(doc, null, 2).replace(/\[\s*(-?[\d.eE+-]+(?:,\s*-?[\d.eE+-]+)*)\s*\]/g, (_, list: string) => `[${list.split(/,\s*/).join(", ")}]`);
}

export function documentIfcxText(source: IfcxSource, timestamp?: string): string {
  return stringifyIfcx(documentIfcx(source, timestamp).doc);
}
