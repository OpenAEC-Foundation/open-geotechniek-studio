import { describe, expect, it } from "vitest";
import { parseGef } from "../types/gefParser";
import { parseBroCptXml } from "../types/broCptParser";
import { validationOf } from "../validation/report";
import fixture from "./__fixtures__/magnetometer-synthetisch.gef?raw";
import { angleUnitFactor, fieldUnitFactor, hasMagnetometer, magnetometerData, totalFromComponents } from "./channels";
import {
  analyseMagnetometer, backgroundField, DEFAULT_MAG_SETTINGS, magSettingsFor, median, verticalGradient, withMagSettings,
} from "./analysis";

// Het testbestand: achtergrondveld B0 = (19000, 600, 45100) nT plus een verticale puntdipool op
// z0 = 8,00 m, r0 = 1,00 m naast de sondering, K = 400 nT·m³. Veld van een puntdipool met
// eenheidsmoment m: B = K·(3·(m·r)·r - m) / |r|³ met r de eenheidsvector van dipool naar meetpunt
// (standaardformule uit de magnetostatica); voor een verticale dipool uitgeschreven:
//   dBx = -3·K·dz·r0 / r^5,  dBz = K·(2·dz² - r0²) / r^5,  dz = z - z0,  r² = dz² + r0².
const B0 = [19000, 600, 45100] as const, Z0 = 8, R0 = 1, K = 400;
const fieldAt = (z: number) => {
  const dz = z - Z0, r = Math.hypot(dz, R0);
  return [B0[0] - (3 * K * dz * R0) / r ** 5, B0[1], B0[2] + (K * (2 * dz * dz - R0 * R0)) / r ** 5] as const;
};

const gef = (columns: string[], rows: string[]) =>
  `#GEFID=1,1,0\n#TESTID=T\n#FILEOWNER=x\n#FILEDATE=2026,1,1\n#PROJECTID=x\n#REPORTCODE=GEF-CPT-Report,1,1,2\n#COLUMN=${columns.length}\n` +
  columns.map((c, i) => `#COLUMNINFO=${i + 1},${c}\n`).join("") + `#EOH=\n${rows.join("\n")}\n`;

describe("herkenning van magnetometerkanalen", () => {
  const cpt = parseGef(fixture, "magnetometer-synthetisch.gef");
  const data = magnetometerData(cpt)!;

  it("leest de GEF-kolomgrootheden 31 t/m 36 als benoemde reeksen in nT en graden", () => {
    expect(hasMagnetometer(cpt)).toBe(true);
    expect(data.present).toEqual(["x", "y", "z", "inclination", "declination"]);
    expect(data.depth).toHaveLength(301);
    const i = data.depth.findIndex((d) => Math.abs(d - 8) < 1e-9);
    // Op 8,00 m is dz = 0: dBx = 0 en dBz = -K/r0³ = -400 nT.
    expect(data.channels.x![i]).toBeCloseTo(19000, 1);
    expect(data.channels.y![i]).toBeCloseTo(600, 1);
    expect(data.channels.z![i]).toBeCloseTo(44700, 1);
    // Inclinatie = atan(Bz / Bh) = atan(44700 / wortel(19000² + 600²)) = 66,962 graden.
    expect(data.channels.inclination![i]).toBeCloseTo(66.962, 3);
    expect(data.channels.declination![i]).toBeCloseTo(1.809, 3);
  });

  it("meldt de magnetometerkolommen niet als onbekende kolom", () => {
    expect(validationOf(cpt)?.diagnostics.filter((d) => d.code === "UNKNOWN_COLUMN")).toEqual([]);
    expect(validationOf(cpt)?.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });

  it("berekent het totaalveld uit de componenten als kolom 34 ontbreekt", () => {
    expect(data.totalSource).toBe("computed");
    const i = data.depth.findIndex((d) => Math.abs(d - 8) < 1e-9);
    // wortel(19000² + 600² + 44700²) = wortel(2 359 450 000) = 48 574,17 nT
    expect(data.total![i]).toBeCloseTo(48574.17, 1);
    data.depth.forEach((z, k) => expect(data.total![k]!).toBeCloseTo(Math.hypot(...fieldAt(z)), 0));
  });

  it("gebruikt het gemeten totaalveld als kolom 34 er is, en rekent eenheden om naar nT en graden", () => {
    const c = parseGef(gef(
      ["m,lengte,1", "MPa,qc,2", "uT,Bx,31", "µT,By,32", "mT,Bz,33", "nT,Btot,34", "rad,incl,35"],
      ["1.0 5 19.0 0.6 0.0451 48000 1.0", "2.0 5 19.0 0.6 0.0451 48100 0.5"],
    ), "t.gef");
    const d = magnetometerData(c)!;
    expect(d.totalSource).toBe("measured");
    expect(d.total).toEqual([48000, 48100]);
    expect(d.channels.x![0]).toBeCloseTo(19000, 6);
    expect(d.channels.y![0]).toBeCloseTo(600, 6);
    expect(d.channels.z![0]).toBeCloseTo(45100, 6);
    expect(d.channels.inclination![0]).toBeCloseTo(180 / Math.PI, 9);
    expect(fieldUnitFactor("nT")).toBe(1);
    expect(fieldUnitFactor("gauss")).toBe(1e5);
    expect(angleUnitFactor("graden")).toBe(1);
  });

  it("laat een kanaal met een onbekende eenheid weg en meldt dat", () => {
    const c = parseGef(gef(["m,lengte,1", "MPa,qc,2", "furlong,Btot,34", "nT,Bz,33"], ["1.0 5 48000 45100", "2.0 5 48100 45100"]), "t.gef");
    const d = magnetometerData(c)!;
    expect(d.present).toEqual(["z"]);
    expect(d.unknownUnits).toEqual([{ channel: "total", unit: "furlong" }]);
    expect(d.total).toBeNull();
  });

  it("slaat een void over en geeft geen magnetometer bij een gewone sondering", () => {
    const c = parseGef(gef(["m,lengte,1", "MPa,qc,2", "nT,Btot,34"], ["1.0 5 48000", "2.0 5 -999999", "3.0 5 48010"]), "t.gef");
    expect(magnetometerData(c)!.total).toEqual([48000, null, 48010]);
    const plain = parseGef(gef(["m,lengte,1", "MPa,qc,2"], ["1.0 5", "2.0 5"]), "t.gef");
    expect(hasMagnetometer(plain)).toBe(false);
    expect(magnetometerData(plain)).toBeNull();
  });

  it("leest de kanalen uit BRO-XML (nT en graden volgens de BRO-catalogus)", () => {
    const flags = ["penetrationLength", "depth", "coneResistance", "magneticFieldStrengthX", "magneticFieldStrengthY",
      "magneticFieldStrengthZ", "magneticFieldStrengthTotal", "magneticInclination", "magneticDeclination"];
    const xml = `<?xml version="1.0"?><dispatchDataResponse xmlns:gml="http://www.opengis.net/gml/3.2"><CPT_O><broId>CPT000000000001</broId>
      <parameters>${flags.map((f) => `<${f}>ja</${f}>`).join("")}</parameters>
      <cptResult><values>1.0,1.0,5,19000,600,45100,48942.5,3.5,-1.2;2.0,2.0,6,19010,600,45090,-999999,3.6,-1.1;</values></cptResult></CPT_O></dispatchDataResponse>`;
    const d = magnetometerData(parseBroCptXml(xml, "bro.xml"))!;
    expect(d.present).toEqual(["x", "y", "z", "total", "inclination", "declination"]);
    expect(d.totalSource).toBe("measured");
    expect(d.total).toEqual([48942.5, null]);
    expect(d.channels.x).toEqual([19000, 19010]);
    expect(d.channels.declination).toEqual([-1.2, -1.1]);
  });
});

describe("totaalveld, gradiënt en achtergrond", () => {
  it("totaalveld: 3-4-12 geeft 13", () => {
    expect(totalFromComponents([3, null], [4, 1], [12, 1])).toEqual([13, null]);
  });

  it("gradiënt van een rechte lijn is overal de helling, ook aan de randen en bij ongelijke stappen", () => {
    const z = [0, 0.5, 1, 2, 4];
    expect(verticalGradient(z, z.map((d) => 100 + 20 * d))).toEqual([20, 20, 20, 20, 20]);
  });

  it("gradiënt van B = z² op een vast raster is 2z in het midden; een void geeft eenzijdige differenties", () => {
    const z = [0, 1, 2, 3, 4], b = z.map((d) => d * d);
    // (4 - 0)/2 = 2, (9 - 1)/2 = 4, (16 - 4)/2 = 6; randen (1 - 0)/1 = 1 en (16 - 9)/1 = 7.
    expect(verticalGradient(z, b)).toEqual([1, 2, 4, 6, 7]);
    // Zonder het punt op 2 m: naast het gat (1 - 0)/1 = 1 en (16 - 9)/1 = 7.
    expect(verticalGradient(z, [0, 1, null, 9, 16])).toEqual([1, 1, null, 7, 7]);
  });

  it("achtergrond is de mediaan over het ingestelde traject", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
    const z = [0, 1, 2, 3, 4, 5], b = [10, 20, 30, 40, 500, null];
    expect(backgroundField(z, b, null, null)).toEqual({ background: 30, count: 5 });
    expect(backgroundField(z, b, 1, 3)).toEqual({ background: 30, count: 3 });
    expect(backgroundField(z, b, 0, 1)).toEqual({ background: 15, count: 2 });
    expect(backgroundField(z, b, 9, 10)).toEqual({ background: null, count: 0 });
  });
});

describe("zones", () => {
  const cpt = parseGef(fixture, "magnetometer-synthetisch.gef");
  const data = magnetometerData(cpt)!;

  it("vindt de dipoolverstoring van het testbestand op de juiste diepte", () => {
    const settings = { ...DEFAULT_MAG_SETTINGS, backgroundFrom: 0, backgroundTo: 4 };
    const result = analyseMagnetometer(data, settings);
    // Ver van de dipool: |B0| = wortel(19000² + 600² + 45100²) = 48 942,5 nT; op 0-4 m is de bijdrage van de dipool < 11 nT.
    expect(Math.abs(result.background! - 48942.5)).toBeLessThan(10);
    expect(result.backgroundCount).toBe(81);
    expect(result.zones).toHaveLength(1);
    const [zone] = result.zones;
    expect(zone.top).toBeLessThan(Z0);
    expect(zone.bottom).toBeGreaterThan(Z0);
    expect(zone.top).toBeGreaterThan(Z0 - 2.5);
    expect(zone.bottom).toBeLessThan(Z0 + 2.5);
    // Op 8,00 m: 48 574,2 - 48 942,5 = -368 nT. Het uiterste van de totaalveldafwijking ligt door de
    // horizontale component iets onder de dipool (binnen 0,2 m).
    expect(zone.peakAnomaly).toBeLessThan(-360);
    expect(zone.peakAnomaly).toBeGreaterThan(-420);
    expect(Math.abs(zone.peakAnomalyDepth - Z0)).toBeLessThanOrEqual(0.2);
    expect(zone.byAnomaly && zone.byGradient).toBe(true);
    expect(Math.abs(zone.peakGradient!)).toBeGreaterThan(300);
    // De afwijking per meetpunt is totaalveld min achtergrond.
    const i = data.depth.findIndex((d) => Math.abs(d - 8) < 1e-9);
    expect(result.anomaly[i]).toBeCloseTo(data.total![i]! - result.background!, 9);
  });

  it("markeert niets boven de ingestelde begindiepte", () => {
    const result = analyseMagnetometer(data, { ...DEFAULT_MAG_SETTINGS, backgroundFrom: 0, backgroundTo: 4, analysisFrom: 12 });
    expect(result.zones).toEqual([]);
  });

  it("geeft geen zones bij een vlak signaal, ook niet met een kleine rimpel onder de drempels", () => {
    const depth = Array.from({ length: 200 }, (_, i) => i * 0.05);
    const flat = { depth, channels: {}, present: [], total: depth.map(() => 48900), totalSource: "measured" as const, unknownUnits: [] };
    const a = analyseMagnetometer(flat);
    expect(a.background).toBe(48900);
    expect(a.zones).toEqual([]);
    expect(a.gradient.every((g) => g === 0)).toBe(true);
    // Rimpel van ±2 nT per 0,05 m: afwijking 2 nT < 50 nT, gradiënt hooguit 4/0,05 = 80 nT/m < 100 nT/m.
    const ripple = { ...flat, total: depth.map((_, i) => 48900 + (i % 2 ? 2 : -2)) };
    expect(analyseMagnetometer(ripple).zones).toEqual([]);
  });

  it("splitst en voegt zones samen volgens de ingestelde tussenafstand", () => {
    const depth = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const total = [0, 0, 100, 0, 0, 0, 0, -200, -150, 0, 0];
    const base = { depth, channels: {}, present: [], total, totalSource: "measured" as const, unknownUnits: [] };
    const settings = { ...DEFAULT_MAG_SETTINGS, anomalyThreshold: 50, gradientThreshold: 1e9, mergeGap: 0 };
    expect(analyseMagnetometer(base, settings).zones.map((z) => [z.top, z.bottom, z.peakAnomaly, z.peakAnomalyDepth]))
      .toEqual([[2, 2, 100, 2], [7, 8, -200, 7]]);
    expect(analyseMagnetometer(base, { ...settings, mergeGap: 5 }).zones.map((z) => [z.top, z.bottom, z.peakAnomaly]))
      .toEqual([[2, 8, -200]]);
  });

  it("bewaart de instellingen bij de sondering", () => {
    expect(magSettingsFor(cpt)).toEqual(DEFAULT_MAG_SETTINGS);
    const changed = { ...DEFAULT_MAG_SETTINGS, backgroundFrom: 1, backgroundTo: 4, anomalyThreshold: 25 };
    expect(magSettingsFor(withMagSettings(cpt, changed))).toEqual(changed);
  });
});
