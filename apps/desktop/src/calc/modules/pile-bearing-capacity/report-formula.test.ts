// Formulas in the report are vector text: real Greek letters from the embedded
// symbol font, real subscripts in a smaller size, and never an image.
import { afterEach, describe, expect, it } from "vitest";
import { jsPDF } from "jspdf";
import { formula, makeCursor, sectionTitle, table, verdict } from "./parts/pile-report-pdf";
import { DEFAULT_BRAND, useReportBrand } from "../../../report/reportBrand";
import { reportPalette } from "../../../report/reportPalette";
import { richWidth, richWrap } from "../../../report/reportText";

const PROJECT = { number: "1", description: "Proef", norm: "NEN 9997-1", date: "01-01-2026", author: "Tester" };

function build(draw: (c: ReturnType<typeof makeCursor>) => void): string {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  draw(makeCursor(doc, PROJECT));
  return new TextDecoder("latin1").decode(new Uint8Array(doc.output("arraybuffer")));
}

/** Text written in the embedded symbol font, decoded through its ToUnicode table. */
function symbolText(pdf: string): string {
  const toUnicode = new Map<string, string>();
  for (const m of pdf.matchAll(/<([0-9a-f]{4})><([0-9a-f]{4})>/g)) toUnicode.set(m[1], String.fromCharCode(parseInt(m[2], 16)));
  let out = "";
  for (const m of pdf.matchAll(/<([0-9a-fA-F]+)> Tj/g)) {
    for (let i = 0; i < m[1].length; i += 4) out += toUnicode.get(m[1].slice(i, i + 4).toLowerCase()) ?? "?";
  }
  return out;
}

/** A fill or stroke colour as jsPDF writes it in the page content. */
const colorOp = ([r, g, b]: [number, number, number], op: "rg" | "RG") => `${(r / 255).toFixed(2)} ${(g / 255).toFixed(2)} ${(b / 255).toFixed(2)} ${op}`.replace(/(\.\d*?)0+ /g, "$1 ").replace(/\. /g, ". ");

afterEach(() => useReportBrand.getState().reset());

describe("formulas in the report", () => {
  const pdf = build((c) => formula(c, "R_b;cal;max", "A_b · α_p · q_c;I;gem / γ_m", "37668 mm² × 0,70 × 17,97 / 1,20 × 10^-3", "395 kN", "...(7.6)"));

  it("writes Greek letters as text in an embedded font, not as an image", () => {
    expect(pdf).not.toContain("/Subtype /Image");
    expect(pdf).toContain("/FontFile2");
    const symbols = symbolText(pdf);
    expect(symbols).toContain("α");
    expect(symbols).toContain("γ");
    // No transliteration left over from the font without Greek letters.
    expect(pdf).not.toContain("alpha");
    expect(pdf).not.toContain("gamma");
  });

  it("sets subscripts and superscripts as smaller text beside their symbol", () => {
    expect(pdf).toContain("(R) Tj");
    expect(pdf).toContain("(b;cal;max) Tj");
    expect(pdf).toContain("(c;I;gem) Tj");
    expect(pdf).not.toContain("R_b");
    // 9 pt body, scripts at 72 %.
    expect(pdf).toMatch(/\/F\d+ 9 Tf/);
    expect(pdf).toMatch(/\/F\d+ 6\.4[78]\d* Tf/);
    // 10^-3 becomes a raised "−3" with a real minus sign.
    expect(pdf).not.toContain("10^");
    expect(symbolText(pdf)).toContain("−");
  });

  it("puts every line of the formula behind an equals sign in one column", () => {
    const xs = [...pdf.matchAll(/([\d.]+) [\d.]+ Td\s*\(=\) Tj/g)].map((m) => m[1]);
    expect(xs).toHaveLength(3);
    expect(new Set(xs).size).toBe(1);
    expect(pdf).toContain("(395 kN) Tj");
  });

  it("leaves names with an underscore alone", () => {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const style = { size: 9 };
    doc.setFontSize(9);
    expect(richWidth(doc, "CPT_01", style)).toBeCloseTo(doc.getTextWidth("CPT_01"), 6);
    expect(richWidth(doc, "R_c", style)).toBeLessThan(doc.getTextWidth("R_c"));
    expect(richWrap(doc, "121882_1.gef", 100, style)).toEqual(["121882_1.gef"]);
  });

  it("keeps ordinary text readable as plain text in the file", () => {
    const text = build((c) => { sectionTitle(c, "Negatieve kleef", "art. 7.3.2.2 (d)"); table(c, [{ label: "Laag", width: 10 }, { label: "γ_k [kN/m³]", width: 10, align: "right" }], [["klei", "18"]]); });
    for (const t of ["Negatieve kleef", "art. 7.3.2.2", "Laag", "klei", "18"]) expect(text).toContain(`(${t}`);
    expect(symbolText(text)).toContain("γ");
  });
});

describe("colours of the report", () => {
  it("takes the accent from the house style and the verdict colours from the tokens", () => {
    expect(reportPalette().accent).toEqual(DEFAULT_BRAND.accent);
    expect(reportPalette().success).toEqual([22, 101, 52]);
    expect(reportPalette().error).toEqual([185, 28, 28]);
    useReportBrand.getState().setBrand({ accent: [0, 90, 160] }, "test");
    expect(reportPalette().accent).toEqual([0, 90, 160]);
  });

  it("draws the rule under a title in the accent and the verdict in green or red", () => {
    useReportBrand.getState().setBrand({ accent: [0, 102, 153] }, "test");
    const pdf = build((c) => { sectionTitle(c, "Toets"); verdict(c, "Indicatieve rekentoets: voldoet", true); verdict(c, "Indicatieve rekentoets: voldoet niet", false); });
    expect(pdf).toContain(colorOp([0, 102, 153], "RG"));
    expect(pdf).toContain(colorOp([22, 101, 52], "rg"));
    expect(pdf).toContain(colorOp([185, 28, 28], "rg"));
    // The amber of the default house style is gone once another accent is set.
    expect(pdf).not.toContain(colorOp([217, 119, 6], "RG"));
  });
});
