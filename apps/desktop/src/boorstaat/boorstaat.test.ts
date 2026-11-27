import { describe, expect, it } from "vitest";
import { parseBhrgtXml, type Bore } from "../types/bore";
import { boreDepth, buildBoorstaat, displayDate, layerDetails, layerTitle, pickScale } from "./boorstaat";
import { patternRect, textWidth, wrapText, type Prim } from "./scene";

const bore: Bore = {
  id: "B01", position: { x_rd: 120000, y_rd: 450000, z_nap: 1.5 }, final_depth: 5, groundwater_depth: 1.2,
  layers: [
    { top_depth: 0, base_depth: 0.8, soil_name: "Zand, zwak siltig", soil_code: "Zs1", colour: "bruin", description: "ophooglaag" },
    { top_depth: 0.8, base_depth: 2.5, soil_name: "Klei, zwak zandig", soil_code: "Kz1", colour: "grijs" },
    { top_depth: 2.5, base_depth: 3.1, soil_name: "Veen", soil_code: "V" },
    { top_depth: 3.1, base_depth: 5, soil_name: "Zand, matig siltig, zwak grindig", soil_code: "Zs2g1" },
  ],
  metadata: { source_file: "handmatig", start_date: "2026-11-03", bore_method: "Handboring (edelman)" },
};
const texts = (items: Prim[]) => items.filter((p): p is Extract<Prim, { t: "text" }> => p.t === "text").map((p) => p.text);

describe("schaal en hulpfuncties", () => {
  it("kiest de kleinste gangbare schaal waarop de boring past", () => {
    // 5 m op 200 mm: 1:25 geeft precies 200 mm; 1:20 zou 250 mm vragen.
    expect(pickScale(5, 200)).toBe(25);
    expect(pickScale(5, 199)).toBe(40);
    expect(pickScale(20, 200)).toBe(100);
    expect(pickScale(1, 200)).toBe(10);
  });
  it("neemt als einddiepte minstens de onderkant van de diepste laag", () => {
    expect(boreDepth(bore)).toBe(5);
    expect(boreDepth({ ...bore, final_depth: 3 })).toBe(5);
    expect(boreDepth({ ...bore, final_depth: undefined, layers: [] })).toBe(0);
  });
  it("toont een datum als dag-maand-jaar", () => {
    expect(displayDate("2026-11-03")).toBe("03-11-2026");
    expect(displayDate("3 nov 2026")).toBe("3 nov 2026");
  });
  it("breekt tekst op woordgrenzen binnen de breedte", () => {
    const lines = wrapText("grijs; zwak humeus; enkele schelpresten; roestvlekken", 7, 30);
    expect(lines.length).toBeGreaterThan(1);
    for (const row of lines) expect(textWidth(row, 7)).toBeLessThanOrEqual(30);
    expect(lines.join(" ")).toBe("grijs; zwak humeus; enkele schelpresten; roestvlekken");
  });
  it("benoemt een laag volgens NEN 5104 en zet de bijzonderheden op een rij", () => {
    expect(layerTitle({ top_depth: 0, base_depth: 1, soil_name: "zwakZandigeKlei" })).toBe("Klei, zwak zandig");
    expect(layerTitle({ top_depth: 0, base_depth: 1, soil_name: "puin" })).toBe("puin");
    expect(layerTitle({ top_depth: 0, base_depth: 1, soil_name: "kleiMetKeien" })).toBe("Klei, met keien");
    expect(layerTitle({ top_depth: 0, base_depth: 1, soil_name: "siltigZandMetGrind" })).toBe("Zand, siltig, grindig");
    expect(layerTitle({ top_depth: 0, base_depth: 1, soil_name: "Zand, zwak siltig, glauconiethoudend", soil_code: "Zs1" })).toBe("Zand, zwak siltig, glauconiethoudend");
    expect(layerDetails(bore.layers[0])).toBe("kleur bruin; ophooglaag");
    expect(layerDetails({ top_depth: 0, base_depth: 1, soil_name: "zand", colour: "standaardBruin", secondary: [{ label: "Kalk", value: "zwakKalkhoudend" }] })).toBe("kleur bruin; kalk: zwak kalkhoudend");
    // De coderegel van een GEF-boring herhaalt de code niet in de bijzonderheden.
    expect(layerDetails({ top_depth: 0, base_depth: 1, soil_name: "Klei", soil_code: "Ks2h1", description: "Ks2h1;grijs" })).toBe("grijs");
    expect(layerDetails({ top_depth: 0, base_depth: 1, soil_name: "Klei", secondary: [{ label: "Kalk", value: "kalkrijk" }] })).toBe("kalk: kalkrijk");
  });
});

describe("boring uit een BRO-bestand", () => {
  // Opbouw van een laag zoals BHR-GT 2.1 hem levert: de benaming staat onder <soil> in geotechnicalSoilName.
  const xml = `<?xml version="1.0"?><dispatchDataResponse xmlns:bhrgtcom="http://www.broservices.nl/xsd/bhrgtcommon/2.1" xmlns="http://www.broservices.nl/xsd/dsbhr-gt/2.1"><BHR_GT_O><broId>BHR000000000001</broId>
    <bhrgtcom:layer><bhrgtcom:upperBoundary uom="m">0.00</bhrgtcom:upperBoundary><bhrgtcom:lowerBoundary uom="m">1.00</bhrgtcom:lowerBoundary><bhrgtcom:soil><bhrgtcom:geotechnicalSoilName>zwakGrindigZand</bhrgtcom:geotechnicalSoilName><bhrgtcom:colour>standaardBruin</bhrgtcom:colour></bhrgtcom:soil></bhrgtcom:layer>
    <bhrgtcom:layer><bhrgtcom:upperBoundary uom="m">1.00</bhrgtcom:upperBoundary><bhrgtcom:lowerBoundary uom="m">2.50</bhrgtcom:lowerBoundary><bhrgtcom:soil><bhrgtcom:geotechnicalSoilName>sterkZandigeKlei</bhrgtcom:geotechnicalSoilName></bhrgtcom:soil></bhrgtcom:layer>
  </BHR_GT_O></dispatchDataResponse>`;
  it("leest de grondsoort en tekent die met kleur, arcering en NEN 5104-benaming", () => {
    const read = parseBhrgtXml(xml, "b.xml");
    expect(read.layers.map((l) => l.soil_name)).toEqual(["zwakGrindigZand", "sterkZandigeKlei"]);
    const layout = buildBoorstaat(read);
    expect(layout.layers.map((l) => l.bands.map((b) => b.pattern).join(""))).toEqual(["ZG", "KZ"]);
    const shown = texts(layout.scene.items);
    for (const row of ["0.00 - 1.00  Zand, zwak grindig", "1.00 - 2.50  Klei, sterk zandig", "kleur bruin"]) expect(shown).toContain(row);
  });
});

describe("arcering", () => {
  it("blijft binnen het vlak", () => {
    for (const key of ["G", "Z", "L", "K", "V", "S", "H", "X"] as const) {
      const items = patternRect(key, 10, 20, 24, 30);
      expect(items[0]).toMatchObject({ t: "rect", x: 10, y: 20, w: 24, h: 30 });
      for (const p of items.slice(1)) {
        if (p.t === "line") for (const [x, y] of [[p.x1, p.y1], [p.x2, p.y2]]) {
          expect(x).toBeGreaterThanOrEqual(10 - 1e-6); expect(x).toBeLessThanOrEqual(34 + 1e-6);
          expect(y).toBeGreaterThanOrEqual(20 - 1e-6); expect(y).toBeLessThanOrEqual(50 + 1e-6);
        }
        if (p.t === "circle") {
          expect(p.cx - p.r).toBeGreaterThanOrEqual(10 - 1e-6); expect(p.cx + p.r).toBeLessThanOrEqual(34 + 1e-6);
          expect(p.cy - p.r).toBeGreaterThanOrEqual(20 - 1e-6); expect(p.cy + p.r).toBeLessThanOrEqual(50 + 1e-6);
        }
      }
    }
  });
  it("onderscheidt de grondsoorten: punten voor zand, kringen voor grind, lijnen voor klei en veen", () => {
    const kinds = (key: "G" | "Z" | "K" | "V" | "X") => new Set(patternRect(key, 0, 0, 24, 30).slice(1).map((p) => p.t === "circle" ? (p.fill ? "dot" : "ring") : p.t));
    expect([...kinds("Z")]).toEqual(["dot"]);
    expect([...kinds("G")]).toEqual(["ring"]);
    expect([...kinds("K")]).toEqual(["line"]);
    expect([...kinds("V")]).toEqual(["line"]);
    expect(kinds("X").size).toBe(0);
    // Klei schuin, veen liggend.
    const first = (key: "K" | "V") => patternRect(key, 0, 0, 24, 30).find((p) => p.t === "line") as Extract<Prim, { t: "line" }>;
    expect(first("V").y1).toBe(first("V").y2);
    expect(first("K").y1).not.toBe(first("K").y2);
  });
});

describe("opbouw van de boorstaat", () => {
  const layout = buildBoorstaat(bore);

  it("tekent elke laag op schaal, aansluitend van maaiveld tot einddiepte", () => {
    expect(layout.layers).toHaveLength(4);
    expect(layout.mmPerMeter).toBeCloseTo(1000 / layout.scale);
    expect(layout.layers[0].top).toBeCloseTo(layout.column.y);
    bore.layers.forEach((layer, i) => {
      expect(layout.layers[i].top).toBeCloseTo(layout.column.y + layer.top_depth * layout.mmPerMeter);
      expect(layout.layers[i].bottom).toBeCloseTo(layout.column.y + layer.base_depth * layout.mmPerMeter);
      if (i) expect(layout.layers[i].top).toBeCloseTo(layout.layers[i - 1].bottom);
    });
    expect(layout.column.height).toBeCloseTo(5 * layout.mmPerMeter);
    expect(layout.column.y + layout.column.height).toBeLessThanOrEqual(layout.scene.height);
  });

  it("kiest voor 5 m op het standaardblad schaal 1:25", () => {
    expect(layout.scale).toBe(25);
    expect(texts(layout.scene.items)).toContain("1 : 25");
  });

  it("verdeelt de kolom per laag in hoofdgrondsoort en bijmengstroken", () => {
    expect(layout.layers.map((l) => l.bands.map((b) => b.pattern).join(""))).toEqual(["ZS", "KZ", "V", "ZSG"]);
    for (const l of layout.layers) {
      expect(l.bands[0].x).toBeCloseTo(layout.column.x);
      expect(l.bands.reduce((sum, b) => sum + b.width, 0)).toBeCloseTo(layout.column.width);
    }
  });

  it("zet de diepteschaal t.o.v. maaiveld en NAP naast elkaar", () => {
    expect(layout.ticks[0]).toMatchObject({ depth: 0, nap: 1.5 });
    const last = layout.ticks[layout.ticks.length - 1];
    expect(last).toMatchObject({ depth: 5, nap: -3.5 });
    expect(last.y).toBeCloseTo(layout.column.y + layout.column.height);
    const shown = texts(layout.scene.items);
    for (const label of ["m -mv", "m NAP", "1.50", "-3.50"]) expect(shown).toContain(label);
    // Zonder maaiveldhoogte alleen de schaal t.o.v. maaiveld.
    const noNap = buildBoorstaat({ ...bore, position: undefined });
    expect(noNap.ticks[0].nap).toBeUndefined();
    expect(texts(noNap.scene.items)).not.toContain("m NAP");
  });

  it("zet de laaggrenzen, de beschrijvingen en de kop op het blad", () => {
    const shown = texts(layout.scene.items);
    for (const depth of ["0.80", "2.50", "3.10", "5.00"]) expect(shown).toContain(depth);
    for (const row of ["0.00 - 0.80  Zand, zwak siltig", "0.80 - 2.50  Klei, zwak zandig", "2.50 - 3.10  Veen", "kleur bruin; ophooglaag", "kleur grijs"]) expect(shown).toContain(row);
    expect(shown.some((s) => s.startsWith("3.10 - 5.00  Zand, matig siltig"))).toBe(true);
    for (const value of ["B01", "03-11-2026", "Handboring (edelman)", "120000.00 m", "450000.00 m", "NAP 1.50 m", "5.00 m -mv", "1.20 m -mv (NAP 0.30 m)"]) expect(shown).toContain(value);
  });

  it("tekent de grondwaterstand op de juiste diepte en alleen als die bekend is", () => {
    expect(layout.groundwaterY).toBeCloseTo(layout.column.y + 1.2 * layout.mmPerMeter);
    expect(layout.scene.items.some((p) => p.t === "poly")).toBe(true);
    const dry = buildBoorstaat({ ...bore, groundwater_depth: undefined });
    expect(dry.groundwaterY).toBeUndefined();
    expect(dry.scene.items.some((p) => p.t === "poly")).toBe(false);
    expect(texts(dry.scene.items)).toContain("niet bekend");
  });

  it("neemt alleen de gebruikte tekenwijzen op in de legenda", () => {
    expect(layout.legend).toEqual(["G", "Z", "K", "V", "S"]);
    const shown = texts(layout.scene.items);
    for (const name of ["Legenda", "Grind", "Zand", "Klei", "Veen", "Silt"]) expect(shown).toContain(name);
    expect(shown).not.toContain("Leem");
  });

  it("houdt de beschrijvingen van dunne lagen uit elkaar en op het blad", () => {
    const thin: Bore = { ...bore, final_depth: 20, layers: Array.from({ length: 40 }, (_, i) => ({ top_depth: i * 0.5, base_depth: (i + 1) * 0.5, soil_name: i % 2 ? "Klei, zwak zandig" : "Zand, zwak siltig", colour: "grijs", description: "enkele schelpresten" })) };
    const result = buildBoorstaat(thin);
    expect(result.scale).toBe(100);
    const titles = result.scene.items.filter((p): p is Extract<Prim, { t: "text" }> => p.t === "text" && p.bold === true && / - /.test(p.text));
    expect(titles).toHaveLength(40);
    for (let i = 1; i < titles.length; i++) expect(titles[i].y - titles[i - 1].y).toBeGreaterThanOrEqual(2.9);
    expect(titles[39].y).toBeLessThan(result.scene.height - 15);
  });

  it("meldt een boring zonder lagen in plaats van een lege kolom", () => {
    const empty = buildBoorstaat({ ...bore, final_depth: undefined, layers: [] });
    expect(empty.layers).toHaveLength(0);
    expect(texts(empty.scene.items)).toContain("Deze boring heeft nog geen lagen.");
  });
});
