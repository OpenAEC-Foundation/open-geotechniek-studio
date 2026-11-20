import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseBroCptXml } from "../types/broCptParser";
import { parseProjectFile } from "../types/projectFile";
import { looksLikeGef } from "../types/gefParser";
import {
  analyseDissipation, coneRadius, horizontalConsolidation, hydrostatic, normalised, theoreticalU2Curve, T50_STAR,
} from "./analysis";
import { looksLikeGefDissipation, parseGefDissipation } from "./gefDissipation";
import { coneAreaFromFile, withDissipationTest } from "./cptDissipation";
import type { DissipationTest } from "./types";

const fixture = (name: string) => readFileSync(resolve(__dirname, "__fixtures__", name), "utf-8");
const test = (u2Kpa: Array<[number, number]>, extra: Partial<DissipationTest> = {}): DissipationTest => ({
  id: "t", depth: 6, source: "gef", points: u2Kpa.map(([time, u]) => ({ time, u2: u / 1000 })), ...extra,
});

describe("dissipatietests uit BRO-XML", () => {
  const cpt = parseBroCptXml(fixture("sondering-met-dissipatie.xml"), "sondering-met-dissipatie.xml");
  it("leest alle tests met diepte, begintijd en tijdreeks, op diepte gesorteerd", () => {
    expect(cpt.points).toHaveLength(4);
    expect(cpt.dissipation_tests?.map((t) => t.depth)).toEqual([5.34, 9.8]);
    const [first, second] = cpt.dissipation_tests!;
    expect(first.source).toBe("bro");
    expect(first.start_time).toBe("2024-03-11T10:15:00+01:00");
    expect(first.points).toHaveLength(9);
    // Verlopen tijd [s], conusweerstand [MPa], u1 (niet gemeten), u2 [MPa], u3 (niet gemeten).
    expect(first.points[4]).toEqual({ time: 100, qc: 0.43, u2: 0.13 });
    expect(second.points.map((p) => p.u2)).toEqual([0.15, 0.17, 0.19, 0.18, 0.15, 0.12, 0.095, 0.09]);
  });
  it("laat de meetreeks van de sondering zelf ongemoeid", () => {
    expect(cpt.points.map((p) => p.u2)).toEqual([0.01, 0.21, 0.15, 0.11]);
  });
  it("neemt de conusoppervlakte uit het bestand", () => {
    expect(coneAreaFromFile(cpt)).toBe(1500);
  });
  it("een sondering zonder dissipatietest krijgt het veld niet", () => {
    const xml = fixture("sondering-met-dissipatie.xml").replace(/<cptcommon:dissipationTest [\s\S]*?<\/cptcommon:dissipationTest>/g, "");
    expect("dissipation_tests" in parseBroCptXml(xml, "zonder.xml")).toBe(false);
  });
  it("gaat mee in het projectbestand", () => {
    const project = parseProjectFile(JSON.stringify({ project: { title: "Test" }, cpts: [JSON.parse(JSON.stringify(cpt))] }));
    expect(project.cpts?.[0].dissipation_tests).toEqual(cpt.dissipation_tests);
  });
});

describe("dissipatietest uit een GEF-bestand", () => {
  const text = fixture("dissipatietest.gef");
  it("herkent het bestand aan de tijd als eerste kolom", () => {
    expect(looksLikeGef(text)).toBe(true);
    expect(looksLikeGefDissipation(text)).toBe(true);
    expect(looksLikeGefDissipation(text.replace("#COLUMNINFO= 1, s, tijd, 12", "#COLUMNINFO= 1, m, sondeerlengte, 1"))).toBe(false);
  });
  it("leest tijd, conusweerstand en waterspanning, met de diepte en de sondering uit #PARENT", () => {
    const file = parseGefDissipation(text, "dissipatietest.gef");
    expect(file.parentFile).toBe("S01.GEF");
    expect(file.testId).toBe("S01");
    expect(file.test.depth).toBe(7.52);
    expect(file.test.start_time).toBe("2024-03-11");
    expect(file.test.points).toHaveLength(8);
    expect(file.test.points[1]).toEqual({ time: 2, qc: 0.515, u2: 0.29 });
    // De ontbrekende conusweerstand (COLUMNVOID) blijft leeg.
    expect(file.test.points[4]).toEqual({ time: 120, u2: 0.175 });
  });
  it("rekent kPa en minuten om en neemt zonder #PARENT de vaste sondeerlengte", () => {
    const other = text.replace("#PARENT= S01.GEF, 7.52, m\n", "").replace("1, s, tijd", "1, min, tijd").replace("3, MPa, waterspanning", "3, kPa, waterspanning");
    const file = parseGefDissipation(other, "x.gef");
    expect(file.test.depth).toBeCloseTo(7.52, 10);
    expect(file.test.points[1].time).toBe(120);
    expect(file.test.points[1].u2).toBeCloseTo(0.00029, 12);
  });
  it("weigert een gewoon sondeerbestand", () => {
    expect(() => parseGefDissipation("#GEFID= 1,1,0\n#COLUMNINFO= 1, m, sondeerlengte, 1\n#COLUMNINFO= 2, MPa, qc, 2\n#EOH=\n1 2\n", "s.gef")).toThrow("tijdkolom");
  });
  it("komt bij de sondering en vervangt een eerdere test uit hetzelfde bestand", () => {
    const cpt = parseBroCptXml(fixture("sondering-met-dissipatie.xml"), "s.xml");
    const { test: added } = parseGefDissipation(text, "dissipatietest.gef");
    const once = withDissipationTest(cpt, added), twice = withDissipationTest(once, added);
    expect(once.dissipation_tests?.map((t) => t.depth)).toEqual([5.34, 7.52, 9.8]);
    expect(twice.dissipation_tests).toHaveLength(3);
    expect(cpt.dissipation_tests).toHaveLength(2);
  });
});

describe("uitwerking", () => {
  it("c_h volgens Teh & Houlsby (1991), met de hand nagerekend", () => {
    // Conus 1000 mm²: r² = A/π = 318,3099 mm² = 3,183099e-4 m², r = 17,84 mm.
    expect(coneRadius(1000) * 1000).toBeCloseTo(17.841, 3);
    // u2: T*50 = 0,245; I_r = 100 -> √I_r = 10; t50 = 100 s.
    // c_h = 0,245 × 3,183099e-4 × 10 / 100 = 7,798592e-6 m²/s.
    expect(horizontalConsolidation(T50_STAR.u2!, coneRadius(1000), 100, 100)).toBeCloseTo(7.798592e-6, 11);
    // u1: T*50 = 0,118 -> 0,118 × 3,183099e-4 × 10 / 100 = 3,756057e-6 m²/s.
    expect(horizontalConsolidation(T50_STAR.u1!, coneRadius(1000), 100, 100)).toBeCloseTo(3.756057e-6, 11);
  });

  it("vindt t50 en c_h terug op de theoretische curve van Teh & Houlsby", () => {
    // Curve voor c_h = 2e-6 m²/s, conus 1000 mm², I_r = 100, u_i = 300 kPa, u_0 = 100 kPa.
    // t50 = T*50 · r² · √I_r / c_h = 0,245 × 3,183099e-4 × 10 / 2e-6 = 389,93 s.
    const curve = test([]);
    curve.points = theoreticalU2Curve(2e-6, 1000, 100, 300, 100);
    curve.settings = { u0Mode: "manual", u0Kpa: 100, coneAreaMm2: 1000, rigidityIndex: 100 };
    const r = analyseDissipation(curve);
    expect(r.ui).toBeCloseTo(300, 9);
    expect(r.u50).toBeCloseTo(200, 9);
    expect(r.t50).toBeCloseTo(389.93, 2);
    expect(r.ch).toBeCloseTo(2e-6, 12);
    expect(r.nonMonotonic).toBe(false);
    expect(r.warnings).toEqual([]);
    // De test is gestopt bij 80 % afbouw.
    expect(r.minU).toBeCloseTo(0.2, 9);
    expect(normalised(r)[4]).toEqual({ time: expect.closeTo(389.93, 2), U: expect.closeTo(0.5, 9) });
  });

  it("monotone test uit het BRO-bestand: t50 op een meetpunt, conus uit het bestand", () => {
    const cpt = parseBroCptXml(fixture("sondering-met-dissipatie.xml"), "s.xml");
    const r = analyseDissipation(cpt.dissipation_tests![0], coneAreaFromFile(cpt));
    // u_i = 210, u_0 = laatste meting 50 -> u50 = 130 kPa, gemeten op t = 100 s.
    expect(r).toMatchObject({ channel: "u2", ui: 210, u0: 50, u0Mode: "last", u50: 130, nonMonotonic: false, coneAreaMm2: 1500 });
    expect(r.t50).toBeCloseTo(100, 9);
    // c_h = 0,245 × (1500/π × 1e-6) × 10 / 100 = 1,169789e-5 m²/s.
    expect(r.ch).toBeCloseTo(1.169789e-5, 10);
    expect(r.warnings).toEqual(["u0FromLast"]);
  });

  it("niet-monotoon verloop: meldt het en rekent t50 vanaf de piek (Sully et al., 1999)", () => {
    const cpt = parseBroCptXml(fixture("sondering-met-dissipatie.xml"), "s.xml");
    const r = analyseDissipation(cpt.dissipation_tests![1]);
    // Piek 190 kPa op t = 20 s; u_0 = 90 -> u50 = 140 kPa, tussen t = 200 s (150) en 600 s (120).
    // Vanaf de piek: 180 s en 580 s; aandeel (150 - 140) / 30 = 1/3 in log-tijd -> 180 × (580/180)^(1/3) = 265,9 s.
    expect(r.nonMonotonic).toBe(true);
    expect(r.warnings).toContain("nonMonotonic");
    expect(r).toMatchObject({ ui: 190, tStart: 20, u0: 90, u50: 140 });
    expect(r.t50).toBeCloseTo(180 * (580 / 180) ** (1 / 3), 9);
    expect(r.t50).toBeCloseTo(265.9, 1);
    // Zonder correctie zou de eerste doorgang van 140 kPa vóór de piek liggen: die telt niet.
    expect(r.t50!).toBeGreaterThan(180);
    expect(normalised(r)[0]).toEqual({ time: 0, U: 1 });
  });

  it("een kleine rimpel in het begin is geen niet-monotoon verloop", () => {
    const r = analyseDissipation(test([[0, 200], [1, 200.4], [10, 180], [100, 120], [1000, 100]]));
    expect(r.nonMonotonic).toBe(false);
    expect(r.ui).toBe(200);
  });

  it("u_0 uit de grondwaterstand en de diepte", () => {
    // 6,0 m diep, grondwater 1,5 m onder maaiveld: u_0 = 4,5 × 9,81 = 44,145 kPa.
    expect(hydrostatic(6, 1.5)).toBeCloseTo(44.145, 9);
    const r = analyseDissipation(test([[0, 244.145], [10, 200], [100, 144.145], [1000, 60]], { settings: { u0Mode: "groundwater", groundwaterDepthM: 1.5 } }));
    expect(r.u0).toBeCloseTo(44.145, 9);
    expect(r.u50).toBeCloseTo(144.145, 9);
    expect(r.t50).toBeCloseTo(100, 6);
    expect(r.warnings).toEqual([]);
  });

  it("meldt wat ontbreekt in plaats van een getal te geven", () => {
    // 50 % afbouw niet gehaald binnen de meting.
    const short = analyseDissipation(test([[0, 300], [10, 280], [100, 260]], { settings: { u0Mode: "manual", u0Kpa: 100 } }));
    expect(short.t50).toBeNull();
    expect(short.ch).toBeNull();
    expect(short.warnings).toEqual(["t50NotReached"]);
    expect(short.minU).toBeCloseTo(0.8, 9);
    // Geen overspanning.
    expect(analyseDissipation(test([[0, 100], [10, 100.1], [100, 100]])).warnings).toContain("noExcess");
    // Geen ingevulde u_0: de laatste meting geldt, met een melding.
    expect(analyseDissipation(test([[0, 300], [100, 100]], { settings: { u0Mode: "manual" } })).warnings).toEqual(["manualMissing", "u0FromLast"]);
    // Voor u3 geeft de publicatie geen T*50: wel t50, geen c_h.
    const u3 = analyseDissipation({ id: "t", depth: 6, source: "gef", points: [[0, 300], [10, 200], [100, 100]].map(([time, u]) => ({ time, u3: u / 1000 })) });
    expect(u3.t50).toBeCloseTo(10, 9);
    expect(u3.ch).toBeNull();
    expect(u3.warnings).toContain("noT50Factor");
    expect(analyseDissipation(test([[0, 300]])).warnings).toEqual(["noData"]);
  });
});
