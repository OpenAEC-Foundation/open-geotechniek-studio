import { describe, expect, it } from "vitest";
import { CPT_REPORT_SECTIONS, EMPTY_PROFILE, brandFromProfile, contactLine, profileProblems } from "./profile";

const profile = { ...EMPTY_PROFILE, name: "Voorbeeld Sonderingen B.V.", address: "Dorpsstraat 1", postalCity: "1234 AB Ergens", phone: "010 1234567", email: "info@voorbeeld.test", website: "voorbeeld.test", kvk: "12345678" };

describe("bedrijfsprofiel sondeerbedrijf", () => {
  it("maakt een contactregel van wat is ingevuld", () => {
    expect(contactLine(profile)).toBe("Dorpsstraat 1 · 1234 AB Ergens · T 010 1234567 · info@voorbeeld.test · KvK 12345678");
    expect(contactLine({ ...EMPTY_PROFILE, name: "X", phone: "06" })).toBe("T 06");
  });
  it("controleert naam, KvK-nummer en e-mailadres", () => {
    expect(profileProblems(profile)).toEqual([]);
    expect(profileProblems({ ...profile, name: " " })).toHaveLength(1);
    expect(profileProblems({ ...profile, kvk: "1234" })).toHaveLength(1);
    expect(profileProblems({ ...profile, email: "geen-adres" })).toHaveLength(1);
  });
  it("zet in het sondeerrapport de teksten en het testrapport aan", () => {
    expect(CPT_REPORT_SECTIONS).toMatchObject({ cover: true, perCpt: true, texts: true, testReport: true });
  });
  it("zet het profiel om naar de huisstijl en behoudt voorblad en briefpapier", () => {
    const brand = brandFromProfile(profile, { coverImage: "data:x", pageImage: "data:y", secondary: [1, 2, 3] });
    expect(brand).toMatchObject({ organization: "Voorbeeld Sonderingen B.V.", website: "voorbeeld.test", badges: ["SONDEERRAPPORT"], coverImage: "data:x", pageImage: "data:y", secondary: [1, 2, 3] });
    expect(brand.contact).toContain("KvK 12345678");
  });
});
