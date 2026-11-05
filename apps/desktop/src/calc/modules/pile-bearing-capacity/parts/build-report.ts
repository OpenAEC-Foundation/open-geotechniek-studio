// apps/desktop/src/calc/modules/pile-bearing-capacity/parts/build-report.ts
//
// Eén plek waar het paalrapport wordt samengesteld. Het afdrukvoorbeeld
// in de werkbalk en de PDF-export gebruiken allebei deze functie, zodat
// wat je op het scherm ziet exact is wat je exporteert.
import type { ProjectContext } from "../../../framework/types";
import type { PileInput, PileResult } from "../types";
import { generatePileReport } from "./pile-report-pdf";
import { computeMultiCptSummary } from "./multi-cpt-summary";
import { resolvePileType } from "../catalog";
import { getStandard } from "../standards";

/** Datum als dd-mm-jjjj; projectdatum wint, anders vandaag. */
function reportDate(iso: string | undefined): string {
  return (iso || new Date().toISOString().slice(0, 10)).slice(0, 10).split("-").reverse().join("-");
}

export function buildPileReport(input: PileInput, result: PileResult, ctx: ProjectContext): Uint8Array {
  if (!result.ok) throw new Error(result.error ?? "Berekening niet geslaagd");
  const pileType = resolvePileType(input);
  // De sondering gaat mee zodat het rapport ook het visuele blad (qc-
  // grafiek met paal en invloedszones) per sondering bevat.
  const cpt = input.cptId ? ctx.cpts.get(input.cptId) : undefined;
  const sondering = { name: input.cptId ?? "Sondering", input, result, cpt };
  const summary = computeMultiCptSummary({
    standard: input.standard,
    cases: [{
      cptId: sondering.name,
      rbCalMax: result.base.rbCalMax,
      rsCalMax: result.shaft.rsCalMax,
      rcCal: result.base.rbCalMax + result.shaft.rsCalMax,
      fnkD: result.negKleef.fnkD,
    }],
    gammaM: input.gammaM,
    nEd: input.nEd,
    stiffness: "non-stiff",
  });
  const meta = ctx.projectMeta;
  return generatePileReport({
    project: {
      number: meta.project_number || "-",
      description: meta.title || "Paaldraagvermogen-berekening",
      norm: `${getStandard(input.standard)?.label}; factorenset ${pileType?.edition ?? "bestaand model"}`,
      date: reportDate(meta.date),
      author: meta.author || "Open Geotechniek Studio",
      onderdeel: "Paaldraagvermogen",
    },
    sonderingen: [sondering],
    summary,
    pileTypeName: pileType?.name ?? input.pileTypeId,
    factors: {
      alphaP: pileType?.alphaP ?? 0.7,
      alphaS: pileType?.alphaS ?? 0.008,
      alphaT: pileType?.alphaT ?? 0.006,
    },
  });
}

export function pileReportFileName(input: PileInput): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `paaldraagvermogen-${input.cptId ?? "Sondering"}-${ts}`;
}
