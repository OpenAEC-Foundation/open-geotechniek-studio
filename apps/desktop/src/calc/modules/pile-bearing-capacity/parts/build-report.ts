// apps/desktop/src/calc/modules/pile-bearing-capacity/parts/build-report.ts
//
// Eén plek waar het paalrapport wordt samengesteld. Het afdrukvoorbeeld
// in de werkbalk en de PDF-export gebruiken allebei deze functie, zodat
// wat je op het scherm ziet exact is wat je exporteert.
import type { ProjectContext } from "../../../framework/types";
import type { PileInput, PileResult } from "../types";
import { generatePileReport } from "./pile-report-pdf";
import { computeMultiCptSummary } from "./multi-cpt-summary";
import { getPileType, pileTypeName, resolvePileType } from "../catalog";
import { applyStandard, getStandard } from "../standards";
import { computePile } from "../compute";
import { chooseLevels, computeSystems, defaultCapacityConfig, matrixCellInput, overviewTargets } from "../capacity-table";
import { renderCapacityAppendix, renderGoverningAppendix } from "./capacity-report";
import { ct } from "../../../i18n";
import { applyOverrides } from "./interpretation-overrides";

/** Datum als dd-mm-jjjj; projectdatum wint, anders vandaag. */
function reportDate(iso: string | undefined): string {
  return (iso || new Date().toISOString().slice(0, 10)).slice(0, 10).split("-").reverse().join("-");
}

export function buildPileReport(input: PileInput, result: PileResult, ctx: ProjectContext): Uint8Array {
  if (!result.ok) throw new Error(result.error ?? ct("calcPileCore", "report.errors.failed", "Berekening niet geslaagd"));
  const pileType = resolvePileType(input);
  const table = input.capacityTable;
  // Voorbeeldberekeningen: de gekozen cellen uit de tabel, anders het huidige rekenblad.
  const picks = table?.examples?.length ? table.examples : [{ cptId: input.cptId ?? "", sizeMm: input.diameterMm, toeNap: input.pileToeNap }];
  const sonderingen = picks.map((e) => {
    const isCurrent = e.cptId === (input.cptId ?? "") && e.sizeMm === input.diameterMm && e.toeNap === input.pileToeNap;
    const exampleInput = isCurrent ? input : matrixCellInput(input, e.cptId, e.sizeMm, e.toeNap);
    // De sondering gaat mee zodat het rapport ook het visuele blad bevat.
    const cpt = e.cptId ? ctx.cpts.get(e.cptId) : undefined;
    const exampleResult = isCurrent ? result : computePile(exampleInput, cpt ?? null);
    if (!exampleResult.ok) throw new Error(ct("calcPileCore", "report.errors.exampleFailed", "Voorbeeld {{cpt}}, {{size}} mm op {{level}} m NAP is niet berekenbaar: {{error}}", { cpt: e.cptId, size: e.sizeMm, level: e.toeNap, error: exampleResult.error }));
    // Het rapport toont de lagen waarmee is gerekend; de meetlijn blijft de sondering uit het project.
    const eff = applyOverrides(cpt, exampleInput.soilProfile, exampleInput.interpretationOverrides);
    return {
      name: picks.length > 1 ? `${e.cptId ?? "Sondering"} · ${e.sizeMm} mm · NAP ${e.toeNap}` : (e.cptId || "Sondering"),
      input: eff.applied.length ? { ...exampleInput, soilProfile: eff.layers, interpretationOverrides: undefined } : exampleInput,
      result: exampleResult, cpt,
      adjustedCpt: eff.cpt && eff.cpt !== cpt ? eff.cpt : undefined,
      adjustments: eff.applied,
    };
  });
  // Alle aanpassingen van de sonderingen in deze uitdraai: de voorbeelden en de tabel.
  const reportCptIds = [...new Set([...picks.map((e) => e.cptId), ...(table ? defaultCapacityConfig(input, [...ctx.cpts.keys()]).cptIds : [])])];
  const interpretation = reportCptIds.flatMap((id) =>
    applyOverrides(ctx.cpts.get(id), input.soilProfile, input.interpretationOverrides).applied.map((applied, i) => ({ nr: `A${i + 1}`, applied })));
  const summary = computeMultiCptSummary({
    standard: input.standard,
    cases: sonderingen.map((s) => ({
      cptId: s.name,
      rbCalMax: s.result.base.rbCalMax,
      rsCalMax: s.result.shaft.rsCalMax,
      rcCal: s.result.base.rbCalMax + s.result.shaft.rsCalMax,
      fnkD: s.result.negKleef.fnkD,
    })),
    gammaM: input.gammaM,
    nEd: input.nEd,
    stiffness: "non-stiff",
  });
  // Een statistische eindanalyse heeft alleen zin voor één paal (maat en niveau) op meerdere sonderingen.
  const samePile = picks.every((e) => e.sizeMm === picks[0].sizeMm && e.toeNap === picks[0].toeNap);
  const circular = pileType?.isCircular ?? true;
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
    sonderingen,
    summary,
    interpretation,
    endAnalysis: samePile,
    pileTypeName: pileType?.name ?? input.pileTypeId,
    factors: {
      alphaP: pileType?.alphaP ?? 0.7,
      alphaS: pileType?.alphaS ?? 0.008,
      alphaT: pileType?.alphaT ?? 0.006,
    },
    appendix: table ? (c) => {
      const config = defaultCapacityConfig(input, [...ctx.cpts.keys()]);
      const systems = computeSystems(input, ctx.cpts, config);
      const m = systems[0].m;
      renderGoverningAppendix(c, systems.map((s) => {
        const type = getPileType(s.pileTypeId), shown = type ? applyStandard(type, input.standard) ?? type : undefined;
        return { name: shown ? pileTypeName(shown) : s.pileTypeId, circular: type?.isCircular ?? true, m: s.m };
      }), overviewTargets(config), ctx.cpts);
      renderCapacityAppendix(c, m, chooseLevels(m), (s) => `${circular ? "Ø" : "□"}${s}`);
    } : undefined,
  });
}

export function pileReportFileName(input: PileInput): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `paaldraagvermogen-${input.cptId ?? "Sondering"}-${ts}`;
}
