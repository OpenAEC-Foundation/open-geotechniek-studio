import { describe, expect, it } from "vitest";
import { parseGefBore } from "../types/gefBoreParser";
import { admixturesFor, ADMIXTURE_WIDTH, classFromCode, classFromName, classifyLayer, layerSoilFields, layerSymbol, PATTERNS, soilCode, soilName } from "./nen5104";

describe("grondsoort volgens NEN 5104", () => {
  it("leest codes met hoofdgrondsoort, toevoegingen en gradatie", () => {
    expect(classFromCode("Kz1")).toEqual({ main: "K", admixtures: [{ letter: "z", grade: 1 }] });
    expect(classFromCode("Zs2g1")).toEqual({ main: "Z", admixtures: [{ letter: "s", grade: 2 }, { letter: "g", grade: 1 }] });
    expect(classFromCode("V")).toEqual({ main: "V", admixtures: [] });
    expect(classFromCode("Ks2h1 GCZ")?.main).toBe("K");
    // Geen code: een gewoon woord of een bijzondere aanduiding.
    expect(classFromCode("Klei")).toBeNull();
    expect(classFromCode("NBE")).toBeNull();
  });

  it("leest benamingen in woorden en de aaneengeschreven vorm uit BRO-bestanden", () => {
    expect(classFromName("Klei, zwak zandig")).toEqual({ main: "K", admixtures: [{ letter: "z", grade: 1 }] });
    expect(classFromName("zwakZandigeKlei")).toEqual({ main: "K", admixtures: [{ letter: "z", grade: 1 }] });
    expect(classFromName("sterkSiltigZand")).toEqual({ main: "Z", admixtures: [{ letter: "s", grade: 3 }] });
    expect(classFromName("Zand, matig siltig, zwak grindig")).toEqual({ main: "Z", admixtures: [{ letter: "s", grade: 2 }, { letter: "g", grade: 1 }] });
    expect(classFromName("siltigZandMetGrind")).toEqual({ main: "Z", admixtures: [{ letter: "s" }, { letter: "g" }] });
    expect(classFromName("kleiigVeen")).toEqual({ main: "V", admixtures: [{ letter: "k" }] });
    expect(classFromName("mineraalarmVeen").main).toBe("V");
    expect(classFromName("grind").main).toBe("G");
    expect(classFromName("leem").main).toBe("L");
    expect(classFromName("puin")).toEqual({ main: "X", admixtures: [] });
  });

  it("neemt de classificatie van de GEF-lezer over", () => {
    const gef = `#GEFID = 1, 1, 0\n#REPORTCODE = GEF-BORE-Report, 1, 0, 0\n#TESTID = B1\n#COLUMN = 2\n#COLUMNINFO = 1, m, diepte bovenkant laag, 1\n#COLUMNINFO = 2, m, diepte onderkant laag, 2\n#COLUMNSEPARATOR = ;\n#RECORDSEPARATOR = !\n#EOH=\n0;1.2;'Kz1;grijs';!\n1.2;3.4;'Zs2g1';!`;
    const layers = parseGefBore(gef, "b.gef").layers;
    expect(classifyLayer(layers[0])).toEqual({ main: "K", admixtures: [{ letter: "z", grade: 1 }] });
    expect(classifyLayer(layers[1])).toEqual({ main: "Z", admixtures: [{ letter: "s", grade: 2 }, { letter: "g", grade: 1 }] });
  });

  it("valt terug op de code en dan op de benaming", () => {
    expect(classifyLayer({ soil_name: "iets", soil_code: "Vk3" }).main).toBe("V");
    expect(classifyLayer({ soil_name: "Lz1" })).toEqual({ main: "L", admixtures: [{ letter: "z", grade: 1 }] });
    expect(classifyLayer({ soil_name: "matigZandigeLeem" })).toEqual({ main: "L", admixtures: [{ letter: "z", grade: 2 }] });
  });

  it("maakt code en benaming uit een gekozen grondsoort", () => {
    const soil = { main: "K" as const, admixtures: [{ letter: "z" as const, grade: 1 }] };
    expect(soilCode(soil)).toBe("Kz1");
    expect(soilName(soil)).toBe("Klei, zwak zandig");
    expect(layerSoilFields(soil)).toEqual({ soil_name: "Klei, zwak zandig", soil_code: "Kz1",
      classification: { system: "NEN5104", lithology: "Kz1", main: "K", admixtures: [{ letter: "z", grade: 1 }], qualifiers: [] } });
    expect(soilName({ main: "Z", admixtures: [{ letter: "s", grade: 2 }, { letter: "g", grade: 1 }] })).toBe("Zand, matig siltig, zwak grindig");
    expect(layerSoilFields({ main: "X", admixtures: [] })).toEqual({ soil_name: "Overig" });
  });

  it("biedt bij een hoofdgrondsoort niet de eigen grondsoort als bijmenging aan", () => {
    expect(admixturesFor("Z").map((a) => a.letter)).toEqual(["s", "g", "h", "k"]);
    expect(admixturesFor("K").map((a) => a.letter)).toEqual(["s", "z", "g", "h"]);
    expect(admixturesFor("X")).toEqual([]);
  });
});

describe("kleur en arcering", () => {
  it("geeft elke hoofdgrondsoort een eigen kleur", () => {
    const fills = (["G", "Z", "L", "K", "V"] as const).map((key) => PATTERNS[key].fill);
    expect(new Set(fills).size).toBe(5);
  });

  it("tekent een zuivere grondsoort als één strook", () => {
    expect(layerSymbol({ main: "V", admixtures: [] }).bands).toEqual([{ pattern: "V", share: 1 }]);
  });

  it("tekent de bijmenging als strook rechts, breder bij een sterkere gradatie", () => {
    const weak = layerSymbol(classFromCode("Kz1")!), strong = layerSymbol(classFromCode("Kz3")!);
    expect(weak.bands.map((b) => b.pattern)).toEqual(["K", "Z"]);
    expect(weak.bands[1].share).toBe(ADMIXTURE_WIDTH[1]);
    expect(strong.bands[1].share).toBeGreaterThan(weak.bands[1].share);
    expect(weak.bands[0].share + weak.bands[1].share).toBeCloseTo(1);
  });

  it("zet siltig, grindig en humeus om naar de tekenwijze van silt, grind en humus", () => {
    expect(layerSymbol(classFromCode("Zs2g1")!).bands.map((b) => b.pattern)).toEqual(["Z", "S", "G"]);
    expect(layerSymbol(classFromCode("Kh2")!).bands[1].pattern).toBe("H");
  });

  it("houdt de hoofdgrondsoort bij veel bijmenging op minstens 40% van de kolom", () => {
    const bands = layerSymbol(classFromCode("Ks4h4")!).bands;
    expect(bands[0].share).toBeCloseTo(0.4);
    expect(bands.reduce((sum, b) => sum + b.share, 0)).toBeCloseTo(1);
  });
});
