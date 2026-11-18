import { describe, expect, it } from "vitest";
import { huisstijlToBrand, kleurRgb, logoPath, type Huisstijl } from "./cloudBrand";
import { DEFAULT_BRAND, mergeBrand } from "./reportBrand";
import { coverPalette } from "../utils/browserReportBrand";

const voorbeeld: Huisstijl = {
  schema: "huisstijl/1",
  weergave: "lid",
  handelsnaam: {
    naam: "Ingenieursbureau Voorbeeld B.V.", website: "https://www.voorbeeld.nl/", telefoon: "078 123 45 67", email: "info@voorbeeld.nl", kvk: "12345678",
    adressen: { bezoek: { regel1: "Kade 1", postcode: "3311 AA", plaats: "Dordrecht" }, post: null },
  },
  merk: { naam: "Voorbeeld", tagline: "Constructief advies" },
  logos: { main: { svg: "/files/main.svg", png: "/files/main.png" }, white: { svg: "/files/white.svg" } },
  kleuren: { primary: { hex: "#1E5AA8", rgb: { r: 30, g: 90, b: 168 } }, secondary: { hex: "#7FB2E5" }, text: { hex: "#1A1A1A" } },
  bijgewerkt: "2026-10-21 12:00:00.000000",
};

describe("huisstijl/1 naar rapporthuisstijl", () => {
  it("neemt naam, kleuren, website en contact over", () => {
    const b = mergeBrand(huisstijlToBrand(voorbeeld));
    expect(b.organization).toBe("Voorbeeld");
    expect(b.tagline).toBe("Constructief advies");
    expect(b.website).toBe("www.voorbeeld.nl");
    expect(b.accent).toEqual([30, 90, 168]);
    expect(b.secondary).toEqual([127, 178, 229]);
    expect(b.dark).toEqual([26, 26, 26]);
    expect(b.contact).toBe("Kade 1, 3311 AA Dordrecht · 078 123 45 67 · info@voorbeeld.nl · KvK 12345678");
    expect(b.badges).toEqual([]);
  });

  it("valt terug op de handelsnaam en laat bij een publieke weergave het contact weg", () => {
    const publiek: Huisstijl = { schema: "huisstijl/1", weergave: "publiek", handelsnaam: { naam: "Alleen Naam" }, merk: { naam: null }, kleuren: {} };
    const b = mergeBrand(huisstijlToBrand(publiek));
    expect(b.organization).toBe("Alleen Naam");
    expect(b.accent).toEqual(DEFAULT_BRAND.accent);
    expect(b.contact).toBeUndefined();
  });

  it("kiest PNG voor SVG en een wit logo voor het donkere voorblad", () => {
    expect(logoPath(voorbeeld, ["main"])).toBe("/files/main.png");
    expect(logoPath(voorbeeld, ["white", "light"])).toBe("/files/white.svg");
    expect(logoPath(voorbeeld, ["light"])).toBeNull();
    expect(logoPath({ ...voorbeeld, logos: { main: { png: "https://x.cloud.open-aec.eu/files/a.png" } } }, ["main"])).toBe("/files/a.png");
  });

  it("leest kleuren uit rgb of hex", () => {
    expect(kleurRgb({ hex: "#d97706" })).toEqual([217, 119, 6]);
    expect(kleurRgb({ hex: "rood" })).toBeUndefined();
  });

  it("houdt het standaardvoorblad ongewijzigd en leidt een eigen palet af", () => {
    const std = coverPalette(DEFAULT_BRAND);
    expect(std.dark).toEqual([54, 54, 62]);
    expect(std.b).toEqual([245, 158, 11]);
    const eigen = coverPalette(mergeBrand(huisstijlToBrand(voorbeeld)));
    expect(eigen.a).toEqual([30, 90, 168]);
    expect(eigen.b).toEqual([127, 178, 229]);
    expect(eigen.dark).toEqual([26, 26, 26]);
  });
});
