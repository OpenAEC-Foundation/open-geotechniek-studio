import { describe, expect, it } from "vitest";
import type { Cpt } from "../types/cpt";
import { parseProjectFile } from "../types/projectFile";
import { buildTestReport } from "../utils/cptTestReport";
import { applyEdits } from "./applyEdits";
import { describeEffect, describeOp, editReportGroup, logRows } from "./logbook";
import { EDITS_KEY, ORIGINAL_KEY, addEdit, editLogOf, editMarksOf, isEdited, newEdit, originalOf, rebaseEdits, removeEdit, resetEdits, undoLastEdit } from "./state";

const project = { title: "Proef", client: "", location: "", project_number: "", author: "", date: "2026-11-20" };

function cpt(): Cpt {
  return {
    id: "S01",
    metadata: { source_file: "S01.gef", extra: { COMPANYID: "Sondeerbedrijf" } },
    points: Array.from({ length: 10 }, (_, i) => ({ depth: Number((1 + i / 10).toFixed(1)), qc: 10 + i, fs: 0.1, rf: (100 * 0.1) / (10 + i), parameters: { source_record: i + 1 } })),
  };
}
const at = new Date("2026-11-20T09:30:00");
const trim = () => newEdit({ kind: "trim-top", depth: 1.2 }, "A. Meetman", "Voorboring tot 1,2 m", at);
const shift = () => newEdit({ kind: "zero-shift", channel: "qc", offset: -0.5 }, "A. Meetman", "Nulpuntverloop conus", at);
const fix = () => newEdit({ kind: "set-value", depth: 1.5, channel: "qc", value: 20 }, "A. Meetman", "Storing in het signaal", at);

describe("bewerkingen bij de sondering", () => {
  it("bewaart het origineel naast de bewerkte meetwaarden", () => {
    const original = cpt(), frozen = JSON.stringify(original);
    const edited = addEdit(addEdit(original, trim()), shift());
    expect(JSON.stringify(original)).toBe(frozen);
    expect(isEdited(original)).toBe(false);
    expect(isEdited(edited)).toBe(true);
    // De rest van de app leest `points`: dat zijn de bewerkte waarden.
    expect(edited.points.map((p) => p.depth)).toEqual([1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9]);
    expect(edited.points[0].qc).toBe(11.5);
    expect(edited.points).toEqual(applyEdits(original, editLogOf(edited).edits).points);
    expect(originalOf(edited)).toEqual(original);
    expect(editLogOf(edited).originalCount).toBe(10);
  });

  it("maakt de laatste of een gekozen bewerking ongedaan en herstelt alles", () => {
    const original = cpt(), a = trim(), b = shift(), c = fix();
    const edited = [a, b, c].reduce(addEdit, original);
    expect(editLogOf(undoLastEdit(edited)).edits.map((e) => e.id)).toEqual([a.id, b.id]);
    // De eerste bewerking weg: de twee latere worden opnieuw op het origineel toegepast.
    const withoutTrim = removeEdit(edited, a.id);
    expect(withoutTrim.points).toHaveLength(10);
    expect(withoutTrim.points[0].qc).toBe(9.5);
    expect(withoutTrim.points[5].qc).toBe(20);
    expect(withoutTrim.points).toEqual(applyEdits(original, [b, c]).points);
    // Alles ongedaan: het origineel, zonder sporen in de metadata.
    expect(resetEdits(edited)).toEqual(original);
    expect(undoLastEdit(undoLastEdit(undoLastEdit(edited)))).toEqual(original);
    expect(removeEdit(addEdit(original, a), a.id).metadata.extra).toEqual({ COMPANYID: "Sondeerbedrijf" });
  });

  it("blijft behouden bij opslaan en heropenen van het project", () => {
    const edited = [trim(), shift(), fix()].reduce(addEdit, cpt());
    const reopened = parseProjectFile(JSON.stringify({ project, cpts: [edited] })).cpts![0];
    expect(reopened).toEqual(edited);
    expect(editLogOf(reopened)).toEqual(editLogOf(edited));
    expect(originalOf(reopened)).toEqual(cpt());
    // Na heropenen kan er verder worden bewerkt en ongedaan gemaakt.
    expect(undoLastEdit(reopened).points[3].qc).toBe(14.5);
    expect(resetEdits(reopened)).toEqual(cpt());
  });

  it("laat een project zonder bewerkingen ongemoeid", () => {
    const reopened = parseProjectFile(JSON.stringify({ project, cpts: [cpt()] })).cpts![0];
    expect(isEdited(reopened)).toBe(false);
    expect(originalOf(reopened)).toBe(reopened);
    expect(editReportGroup(reopened)).toBeNull();
    expect(buildTestReport(reopened, project).map((g) => g.title)).not.toContain("Bewerkingen op de meetwaarden");
  });

  it("overleeft een onleesbaar logboek", () => {
    const broken: Cpt = { ...cpt(), metadata: { source_file: "S01.gef", extra: { [EDITS_KEY]: "{niet json", [ORIGINAL_KEY]: "[]" } } };
    expect(isEdited(broken)).toBe(false);
    expect(originalOf(broken).points).toHaveLength(10);
    expect(originalOf(broken).metadata.extra).toBeUndefined();
  });

  it("past de bewerkingen opnieuw toe als de bronwaarden van buitenaf zijn vervangen", () => {
    const edited = addEdit(cpt(), shift());
    // Bijvoorbeeld: bij de validatie zijn records uitgesloten en `points` is vervangen door bronwaarden.
    const replaced: Cpt = { ...edited, points: cpt().points.slice(0, 4) };
    const rebased = rebaseEdits(replaced);
    expect(rebased.points.map((p) => p.qc)).toEqual([9.5, 10.5, 11.5, 12.5]);
    expect(originalOf(rebased).points).toEqual(cpt().points.slice(0, 4));
  });

  it("geeft de markeringen voor de grafiek", () => {
    const edited = [trim(), fix()].reduce(addEdit, cpt());
    expect(editMarksOf(edited)).toEqual([{ from: 1.0, to: 1.1 }, { from: 1.5, to: 1.5 }]);
    expect(editMarksOf(cpt())).toEqual([]);
  });
});

describe("logboek", () => {
  it("noemt per bewerking tijdstip, wie, wat, het resultaat en de reden", () => {
    const edited = [trim(), shift(), fix()].reduce(addEdit, cpt());
    const rows = logRows(edited, "nl");
    expect(rows.map((r) => r.what)).toEqual([
      "Bovenkant afgekapt: alles boven 1.20 m vervalt",
      "Nulpuntverschuiving qc -0.5 MPa",
      "qc op 1.50 m gecorrigeerd",
    ]);
    expect(rows.map((r) => r.result)).toEqual(["geraakte meetpunten: 2", "geraakte meetpunten: 8", "14.5 MPa → 20 MPa"]);
    expect(rows[0]).toMatchObject({ index: 1, time: "20-11-2026 09:30" });
    expect(rows[0].edit).toMatchObject({ by: "A. Meetman", reason: "Voorboring tot 1,2 m" });
  });

  it("beschrijft elke soort bewerking", () => {
    expect(describeOp({ kind: "remove-range", from: 2, to: 2.5 }, "nl")).toBe("Traject 2.00 tot 2.50 m verwijderd");
    expect(describeOp({ kind: "invalidate-range", from: 2, to: 2.5, channels: [] }, "nl")).toBe("Alle kanalen ongeldig gemaakt van 2.00 tot 2.50 m");
    expect(describeOp({ kind: "invalidate-range", from: 2, to: 2.5, channels: ["fs", "u2"] }, "nl")).toBe("fs, u2 ongeldig gemaakt van 2.00 tot 2.50 m");
    expect(describeOp({ kind: "trim-bottom", depth: 18 }, "nl")).toBe("Onderkant afgekapt: alles onder 18.00 m vervalt");
    expect(describeOp({ kind: "zero-shift", channel: "u2", offset: 0.012, from: 5, to: 9 }, "nl")).toBe("Nulpuntverschuiving u2 +0.012 MPa van 5.00 tot 9.00 m");
    expect(describeOp({ kind: "depth-shift", offset: -0.15 }, "nl")).toBe("Diepteverschuiving -0.15 m");
    expect(describeOp({ kind: "remove-outliers", from: 1, to: 9, channel: "fs", halfWindow: 5, threshold: 3 }, "nl"))
      .toBe("Uitschieters in fs ongeldig gemaakt van 1.00 tot 9.00 m (venster ±5, drempel 3)");
    expect(describeEffect({ kind: "set-value", depth: 1, channel: "u2", value: null }, { affected: 1, before: 0.02, after: null, marks: [] }, "nl")).toBe("0.02 MPa → geen waarde");
  });

  it("levert de tabel Bewerkingen voor het testrapport", () => {
    const edited = [trim(), shift()].reduce(addEdit, cpt());
    const group = editReportGroup(edited)!;
    expect(group.title).toBe("Bewerkingen op de meetwaarden");
    expect(group.rows).toEqual([
      { label: "Meetpunten", value: "10 in het bronbestand, 8 na bewerking; de oorspronkelijke meetwaarden zijn bewaard." },
      { label: "1. 20-11-2026 09:30", value: "Bovenkant afgekapt: alles boven 1.20 m vervalt; geraakte meetpunten: 2. Reden: Voorboring tot 1,2 m (A. Meetman)" },
      { label: "2. 20-11-2026 09:30", value: "Nulpuntverschuiving qc -0.5 MPa; geraakte meetpunten: 8. Reden: Nulpuntverloop conus (A. Meetman)" },
    ]);
    // Het testrapport van de sondering neemt de tabel over en telt de bewerkte meetpunten.
    const report = buildTestReport(edited, project);
    expect(report[report.length - 1]).toEqual(group);
    expect(report.find((g) => g.title === "Resultaten")!.rows.find((r) => r.label === "Aantal meetpunten")!.value).toBe("8");
  });
});
