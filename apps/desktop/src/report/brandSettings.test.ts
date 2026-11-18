import { beforeEach, describe, expect, it } from "vitest";
import { applyBrandMode, getBrandMode, saveOwnBrand, setBrandMode } from "./brandSettings";
import { DEFAULT_BRAND, mergeBrand, useReportBrand } from "./reportBrand";

const png = "data:image/png;base64,iVBORw0KGgo=";
const jpg = "data:image/jpeg;base64,/9j/4AAQ";

describe("bron van de huisstijl", () => {
  beforeEach(() => { window.localStorage.clear(); useReportBrand.getState().reset(); });

  it("begint met de standaard OpenAEC-stijl", async () => {
    expect(await getBrandMode()).toBe("standaard");
    expect(useReportBrand.getState().brand.organization).toBe(DEFAULT_BRAND.organization);
  });

  it("past een eigen huisstijl met voorblad en briefpapier direct toe en gaat terug naar standaard", async () => {
    await setBrandMode("eigen");
    await saveOwnBrand({ organization: "Bureau Eigen", accent: [10, 20, 30], logoDataUrl: png, coverImage: jpg, pageImage: jpg });
    let b = useReportBrand.getState().brand;
    expect(b.organization).toBe("Bureau Eigen");
    expect(b.accent).toEqual([10, 20, 30]);
    expect(b.coverImage).toBe(jpg);
    expect(b.pageImage).toBe(jpg);
    expect(useReportBrand.getState().source).toBe("Eigen huisstijl");
    await setBrandMode("standaard");
    b = useReportBrand.getState().brand;
    expect(b.organization).toBe(DEFAULT_BRAND.organization);
    expect(b.coverImage).toBeUndefined();
    // De eigen huisstijl blijft bewaard voor een volgende keer.
    await applyBrandMode("eigen");
    expect(useReportBrand.getState().brand.organization).toBe("Bureau Eigen");
  });

  it("weigert achtergronden die geen afbeelding zijn", () => {
    const b = mergeBrand({ coverImage: "data:application/pdf;base64,JVBERi0=", pageImage: "https://x/y.png" });
    expect(b.coverImage).toBeUndefined();
    expect(b.pageImage).toBeUndefined();
  });
});
