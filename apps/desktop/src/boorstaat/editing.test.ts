import { beforeEach, describe, expect, it } from "vitest";
import { parseGefBore } from "../types/gefBoreParser";
import { parseProjectFile } from "../types/projectFile";
import { newProjectDocument, useCptStore } from "../store/useCptStore";
import { activeProjectPayload } from "../store/projectSerialization";
import { activeBores, removeBore, saveBore } from "./boreStore";
import { boreFromDraft, draftFromBore, draftProblems, draftSoil, emptyDraft, MANUAL_SOURCE, newLayer, nextBoreId, num, type BoreDraft } from "./editing";

/** Een boring zoals iemand hem in het formulier invult. */
function filledDraft(): BoreDraft {
  const draft = emptyDraft([]);
  return {
    ...draft, id: "B07", date: "2026-11-03", method: "Handboring (edelman)", x: "120000", y: "450000,5", z: "1,5", groundwater: "1,2",
    layers: [
      { ...newLayer([]), top: "0", base: "0,8", main: "Z", admixtures: [{ letter: "s", grade: 1 }, { letter: "", grade: 1 }], colour: "bruin", remark: "ophooglaag" },
      { ...newLayer([]), top: "0.8", base: "2.5", main: "K", admixtures: [{ letter: "z", grade: 1 }, { letter: "h", grade: 2 }], colour: "grijs" },
      { ...newLayer([]), top: "2.5", base: "3", main: "X", name: "puin" },
    ],
  };
}

describe("invoer van een boring", () => {
  it("leest getallen met komma of punt en herkent onzin", () => {
    expect(num("1,5")).toBe(1.5);
    expect(num(" -0.25 ")).toBe(-0.25);
    expect(num("")).toBeUndefined();
    expect(num("1,2,3")).toBeNaN();
    expect(num("abc")).toBeNaN();
  });

  it("geeft een nieuwe boring het eerste vrije nummer en een nieuwe laag aansluitend op de vorige", () => {
    expect(nextBoreId(["B01", "B02", "B04"])).toBe("B03");
    expect(emptyDraft(["B01"]).id).toBe("B02");
    const layer = newLayer([{ ...newLayer([]), top: "0", base: "1,4" }]);
    expect([layer.top, layer.base]).toEqual(["1.4", "2.4"]);
  });

  it("maakt van het formulier een boring met NEN 5104-benaming, code en classificatie", () => {
    const draft = filledDraft();
    expect(draftProblems(draft)).toEqual([]);
    const bore = boreFromDraft(draft);
    expect(bore).toEqual({
      id: "B07", final_depth: 3, groundwater_depth: 1.2, position: { x_rd: 120000, y_rd: 450000.5, z_nap: 1.5 },
      metadata: { source_file: MANUAL_SOURCE, start_date: "2026-11-03", bore_method: "Handboring (edelman)" },
      layers: [
        { top_depth: 0, base_depth: 0.8, soil_name: "Zand, zwak siltig", soil_code: "Zs1", colour: "bruin", description: "ophooglaag",
          classification: { system: "NEN5104", lithology: "Zs1", main: "Z", admixtures: [{ letter: "s", grade: 1 }], qualifiers: [] } },
        { top_depth: 0.8, base_depth: 2.5, soil_name: "Klei, zwak zandig, matig humeus", soil_code: "Kz1h2", colour: "grijs",
          classification: { system: "NEN5104", lithology: "Kz1h2", main: "K", admixtures: [{ letter: "z", grade: 1 }, { letter: "h", grade: 2 }], qualifiers: [] } },
        { top_depth: 2.5, base_depth: 3, soil_name: "puin" },
      ],
    });
  });

  it("telt een dubbel gekozen bijmenging één keer", () => {
    const layer = { ...newLayer([]), main: "K" as const, admixtures: [{ letter: "z" as const, grade: 1 }, { letter: "z" as const, grade: 3 }] as [any, any] };
    expect(draftSoil(layer).admixtures).toEqual([{ letter: "z", grade: 1 }]);
  });

  it("meldt wat er niet klopt", () => {
    const base = filledDraft();
    const problems = (patch: Partial<BoreDraft>) => draftProblems({ ...base, ...patch }, ["B01"]);
    expect(problems({ id: " " })).toEqual(["Vul een boornummer in."]);
    expect(problems({ id: "B01" })).toEqual(["Boornummer B01 bestaat al."]);
    expect(problems({ y: "" })).toEqual(["Vul X en Y allebei in als getal, of laat ze allebei leeg."]);
    expect(problems({ x: "", y: "" })).toEqual(["Vul bij de maaiveldhoogte ook X en Y in."]);
    expect(problems({ groundwater: "nat" })).toEqual(["Grondwaterstand (m -mv): geen getal."]);
    expect(problems({ groundwater: "-1" })).toEqual(["De grondwaterstand is een diepte onder maaiveld en kan niet negatief zijn."]);
    expect(problems({ finalDepth: "2" })).toEqual(["De einddiepte is ondieper dan de diepste laag (3.00 m)."]);
    const layers = (index: number, patch: object) => problems({ layers: base.layers.map((l, i) => i === index ? { ...l, ...patch } : l) });
    expect(layers(1, { base: "" })).toEqual(["Laag 2: vul boven- en onderkant in als getal."]);
    expect(layers(1, { base: "0.5" })).toEqual(["Laag 2: de onderkant moet dieper liggen dan de bovenkant."]);
    expect(layers(1, { top: "0.5" })).toEqual(["Laag 2: overlapt de laag erboven (die eindigt op 0.80 m)."]);
    expect(layers(0, { top: "-1" })).toEqual(["Laag 1: de bovenkant ligt boven het maaiveld."]);
  });

  it("laat een gelezen boring ongemoeid zolang de grondsoort niet wordt gewijzigd", () => {
    const gef = `#GEFID = 1, 1, 0\n#REPORTCODE = GEF-BORE-Report, 1, 0, 0\n#TESTID = B-gef\n#COLUMN = 2\n#COLUMNINFO = 1, m, diepte bovenkant laag, 1\n#COLUMNINFO = 2, m, diepte onderkant laag, 2\n#COLUMNSEPARATOR = ;\n#RECORDSEPARATOR = !\n#XYID = 31000, 120000, 450000\n#ZID = 31000, -1.5\n#EOH=\n0;1.2;'Ks2h1;grijs';!\n1.2;3.4;'Zs1';!`;
    const read = parseGefBore(gef, "b.gef");
    const draft = draftFromBore(read);
    expect(draft.layers.map((l) => [l.main, l.admixtures[0].letter, l.admixtures[1].letter])).toEqual([["K", "s", "h"], ["Z", "s", ""]]);
    expect(boreFromDraft(draft)).toEqual(read);
    // Alleen de grondwaterstand en één laaggrens erbij: de rest blijft zoals gelezen.
    const edited = boreFromDraft({ ...draft, groundwater: "0,9", layers: draft.layers.map((l, i) => i ? { ...l, base: "4" } : l) });
    expect(edited.groundwater_depth).toBe(0.9);
    expect(edited.layers[1]).toEqual({ ...read.layers[1], base_depth: 4 });
    expect(edited.metadata).toEqual(read.metadata);
    // Een andere grondsoort kiezen vervangt benaming, code en classificatie van die laag.
    const changed = boreFromDraft({ ...draft, layers: draft.layers.map((l, i) => i ? { ...l, main: "G" as const, admixtures: [{ letter: "z" as const, grade: 2 }, { letter: "" as const, grade: 1 }], soilChanged: true } : l) });
    expect(changed.layers[1]).toMatchObject({ soil_name: "Grind, matig zandig", soil_code: "Gz2" });
    expect(changed.layers[0]).toEqual(read.layers[0]);
  });
});

describe("opslaan met het project en heropenen", () => {
  beforeEach(() => {
    useCptStore.setState({ documents: [], activeDocId: null });
    newProjectDocument();
  });

  it("bewaart een ingevoerde boring in het projectbestand en leest hem identiek terug", () => {
    const bore = boreFromDraft(filledDraft());
    saveBore(bore);
    expect(activeBores()).toEqual([bore]);
    const file = parseProjectFile(JSON.stringify(activeProjectPayload()));
    expect(file.bores).toEqual([bore]);
    // Heropenen in de editor geeft weer hetzelfde formulier en dezelfde boring.
    const reopened = draftFromBore(file.bores![0]);
    expect(reopened).toMatchObject({ id: "B07", date: "2026-11-03", x: "120000", y: "450000.5", z: "1.5", groundwater: "1.2" });
    expect(reopened.layers.map((l) => [l.top, l.base, l.main, l.name])).toEqual([["0", "0.8", "Z", ""], ["0.8", "2.5", "K", ""], ["2.5", "3", "X", "puin"]]);
    expect(boreFromDraft(reopened)).toEqual(bore);
  });

  it("werkt een boring bij op zijn plek, ook onder een nieuw nummer, en verwijdert hem", () => {
    const first = boreFromDraft(filledDraft()), second = boreFromDraft({ ...filledDraft(), id: "B08" });
    saveBore(first); saveBore(second);
    saveBore({ ...first, id: "B01", groundwater_depth: 2 }, "B07");
    expect(activeBores().map((b) => [b.id, b.groundwater_depth])).toEqual([["B01", 2], ["B08", 1.2]]);
    removeBore("B08");
    expect(activeBores().map((b) => b.id)).toEqual(["B01"]);
  });

  it("leest een projectbestand van voor de boorstaten zonder grondwaterstand of classificatie", () => {
    const old = { project: { title: "Oud project" }, bores: [{ id: "B1", layers: [{ top_depth: 0, base_depth: 2, soil_name: "zwakZandigeKlei" }], metadata: { source_file: "b1.xml" } }] };
    const bore = parseProjectFile(JSON.stringify(old)).bores![0];
    const draft = draftFromBore(bore);
    expect(draft.groundwater).toBe("");
    expect(draft.layers[0]).toMatchObject({ main: "K", admixtures: [{ letter: "z", grade: 1 }, { letter: "", grade: 1 }] });
    expect(draftProblems(draft)).toEqual([]);
    expect(boreFromDraft(draft)).toEqual({ ...bore, final_depth: 2 });
  });

  it("opent een boring zonder project als los tabblad en werkt dat tabblad daarna bij", () => {
    useCptStore.setState({ documents: [], activeDocId: null });
    const bore = boreFromDraft(filledDraft());
    saveBore(bore);
    const state = useCptStore.getState();
    expect(state.documents).toHaveLength(1);
    expect(state.documents[0]).toMatchObject({ kind: "bore", title: "B07" });
    saveBore({ ...bore, id: "B09" }, "B07");
    expect(useCptStore.getState().documents).toHaveLength(1);
    expect(activeBores().map((b) => b.id)).toEqual(["B09"]);
  });
});
