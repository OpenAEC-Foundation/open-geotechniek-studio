import { describe, it, expect } from "vitest";
import { looksLikeGefBore, parseGefBore } from "./gefBoreParser";

const bore = `#GEFID = 1, 1, 0
#REPORTCODE = GEF-BORE-Report, 1, 0, 0
#TESTID = B-test
#COLUMN = 2
#COLUMNINFO = 1, m, diepte bovenkant laag, 1
#COLUMNINFO = 2, m, diepte onderkant laag, 2
#COLUMNTEXT = 1, aan
#COLUMNSEPARATOR = ;
#RECORDSEPARATOR = !
#XYID = 31000, 120000, 450000
#ZID = 31000, -1.5
#EOH=
0;1.2;'Ks2h1;grijs';!
1.2;3.4;'Zs1';!`;

describe("GEF-boringen", () => {
  it("leest laaggrenzen, gecodeerde grond en volledige beschrijving", () => {
    const result = parseGefBore(bore, "boring.gef");
    expect(result.id).toBe("B-test");
    expect(result.position).toEqual({ x_rd: 120000, y_rd: 450000, z_nap: -1.5 });
    expect(result.layers).toEqual([
      { top_depth: 0, base_depth: 1.2, soil_name: "klei (Ks2h1)", description: "Ks2h1;grijs" },
      { top_depth: 1.2, base_depth: 3.4, soil_name: "zand (Zs1)", description: "Zs1" },
    ]);
    expect(result.final_depth).toBe(3.4);
  });
  it("herkent boring zonder afhankelijkheid van headerlengte of extensie", () => {
    expect(looksLikeGefBore(`#COMMENT = ${"x".repeat(6000)}\n${bore}`)).toBe(true);
    expect(looksLikeGefBore(bore.replace("GEF-BORE-Report", "GEF-CPT-Report"))).toBe(false);
  });
  it("volgt kolomlabels bij afwijkende kolomvolgorde en converteert centimeters", () => {
    const changed = bore.replace("1, m, diepte bovenkant laag, 1", "2, cm, diepte bovenkant laag, 1")
      .replace("2, m, diepte onderkant laag, 2", "1, cm, diepte onderkant laag, 2")
      .replace("0;1.2;", "120;0;").replace("1.2;3.4;", "340;120;");
    expect(parseGefBore(changed, "b.gef").layers[1].base_depth).toBe(3.4);
  });
  it("weigert ontbrekende, lege en overlappende laaggegevens", () => {
    for (const invalid of [bore.replace("#EOH=", ""), bore.replace("0;1.2;", ";1.2;"), bore.replace("1.2;3.4;", "1;3.4;"), bore.replace("'Zs1'", "''")]) {
      expect(() => parseGefBore(invalid, "b.gef")).toThrow();
    }
  });
  it("labelt lokale coördinaten niet als RD/NAP", () => {
    expect(parseGefBore(bore.replace("#XYID = 31000", "#XYID = 00000"), "b.gef").position).toBeUndefined();
    expect(parseGefBore(bore.replace("#ZID = 31000", "#ZID = 32000"), "b.gef").position?.z_nap).toBeUndefined();
  });
});
