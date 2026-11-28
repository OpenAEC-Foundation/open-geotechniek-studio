import type { Cpt, ProjectMeta } from "../types/cpt";
import { DEFAULT_SECTIONS, type ReportSections } from "../store/reportSectionsState";
import { activeBores } from "../boorstaat/boreStore";
import { generateCptReport } from "./cptReport";

/** The CPT report of the app: as generateCptReport, with the bores of the active document by default. */
export async function generateBrowserReport(cpts: Cpt[], project: ProjectMeta, sections: ReportSections = DEFAULT_SECTIONS): Promise<Uint8Array> {
    const bores = sections.boreLogs === false ? [] : sections.bores ?? activeBores();
    return generateCptReport(cpts, project, { ...sections, bores });
}
