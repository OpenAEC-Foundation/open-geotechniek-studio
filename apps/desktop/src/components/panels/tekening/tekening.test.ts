import { describe, expect, it } from "vitest";
import { resolveSoort, soortFromPoints, soortHasFriction, soortHasPorePressure, SONDERING_SOORTEN } from "./sonderingSoort";
import { symbolSvg, symbolKey, type SymbolSpec } from "./symbols";
import { estimateLabelSize, placeLabels, type Box, type LabelItem } from "./labelPlacement";
import { formatScaleTick, pickScaleBar } from "./scaleBar";
import { legendEntries } from "./legend";
import { tekeningStateFromIfcgis, tekeningStateToIfcgis, type TekeningFullState } from "../../../store/tekeningState";

describe("soort sondering", () => {
  it("leidt de soort af uit de gemeten kolommen", () => {
    expect(soortFromPoints([{}, {}])).toBe("conus");
    expect(soortFromPoints([{ fs: 0.02 }, {}])).toBe("kleef");
    expect(soortFromPoints([{ u2: 0.1 }])).toBe("water");
    expect(soortFromPoints([{ fs: 0.02 }, { u2: 0 }])).toBe("kleef-water");
  });
  it("telt ontbrekende en ongeldige waarden niet mee", () => {
    expect(soortFromPoints([{ fs: null, u2: undefined }, { fs: Number.NaN }])).toBe("conus");
    expect(soortFromPoints([])).toBe("conus");
  });
  it("geeft een oude marker zonder soort de soort van zijn kleefvlag", () => {
    expect(resolveSoort(undefined, true)).toBe("kleef");
    expect(resolveSoort(undefined, false)).toBe("conus");
    expect(resolveSoort(undefined)).toBe("conus");
    expect(resolveSoort("onbekend", true)).toBe("kleef");
    expect(resolveSoort("water", true)).toBe("water");
  });
  it("kent per soort de metingen", () => {
    expect(SONDERING_SOORTEN.map((s) => [soortHasFriction(s), soortHasPorePressure(s)])).toEqual([
      [false, false], [true, false], [false, true], [true, true],
    ]);
  });
});

describe("symbolen", () => {
  const svg = (spec: SymbolSpec) => symbolSvg(spec).svg;
  it("geeft elke soort een eigen tekening", () => {
    const all = SONDERING_SOORTEN.flatMap((soort) =>
      (["uitgevoerd", "gepland"] as const).map((status) => svg({ type: "sondering", soort, status })),
    );
    expect(new Set(all).size).toBe(8);
  });
  it("tekent kleef als streep en waterspanning als ring onder de punt", () => {
    const count = (s: string, tag: string) => s.split(`<${tag} `).length - 1;
    const of = (soort: (typeof SONDERING_SOORTEN)[number]) => svg({ type: "sondering", soort, status: "gepland" });
    expect([count(of("conus"), "line"), count(of("conus"), "circle")]).toEqual([0, 0]);
    expect([count(of("kleef"), "line"), count(of("kleef"), "circle")]).toEqual([1, 0]);
    expect([count(of("water"), "line"), count(of("water"), "circle")]).toEqual([0, 1]);
    expect([count(of("kleef-water"), "line"), count(of("kleef-water"), "circle")]).toEqual([1, 1]);
  });
  it("vult uitgevoerd en laat gepland open, met overal dezelfde lijndikte", () => {
    const colors = { ink: "#111111", paper: "#ffffff", accent: "#ff0000" };
    const done = symbolSvg({ type: "sondering", soort: "conus", status: "uitgevoerd" }, { colors }).svg;
    const planned = symbolSvg({ type: "sondering", soort: "conus", status: "gepland" }, { colors }).svg;
    expect(done).toContain('<polygon points="4,3 20,3 12,16" fill="#111111"');
    expect(planned).toContain('<polygon points="4,3 20,3 12,16" fill="#ffffff"');
    const widths = [...svg({ type: "sondering", soort: "kleef-water", status: "gepland" }).matchAll(/stroke-width="([\d.]+)"/g)].map((m) => m[1]);
    expect(new Set(widths).size).toBe(1);
    expect(symbolSvg({ type: "boring", status: "gepland" }, { colors, selected: true }).svg).toContain('stroke="#ff0000"');
  });
  it("zet de punt van de driehoek op de locatie en schaalt mee", () => {
    const a = symbolSvg({ type: "sondering", soort: "kleef", status: "gepland" }, { size: 24 });
    expect([a.anchorX, a.anchorY]).toEqual([12, 16]);
    const b = symbolSvg({ type: "sondering", soort: "kleef", status: "gepland" }, { size: 48 });
    expect([b.anchorX, b.anchorY, b.width, b.height]).toEqual([24, 32, 48, 60]);
    expect(b.box.bottom).toBeGreaterThan(symbolSvg({ type: "sondering", soort: "conus", status: "gepland" }, { size: 48 }).box.bottom);
  });
});

describe("labels plaatsen", () => {
  const symbol: Box = { left: -10, top: -16, right: 10, bottom: 6 };
  const item = (key: string, x: number, y: number, text = key): LabelItem => ({ key, x, y, symbol, ...estimateLabelSize(text, 12) });
  const rect = (it: LabelItem, p: { dx: number; dy: number }): Box => ({
    left: it.x + p.dx, top: it.y + p.dy, right: it.x + p.dx + it.width, bottom: it.y + p.dy + it.height,
  });
  const hit = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

  it("zet een vrijstaand label rechts tegen het symbool, zonder aanhaallijn", () => {
    const it0 = item("S01", 100, 100);
    const p = placeLabels([it0]).get("S01")!;
    expect(p.dx).toBe(symbol.right + 3);
    expect(p.leader).toBeUndefined();
  });
  it("laat labels elkaar en de symbolen niet overlappen in een dicht raster", () => {
    const items: LabelItem[] = [];
    for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) items.push(item(`S${r * 6 + c + 1}`, 100 + c * 46, 100 + r * 44));
    const placed = placeLabels(items);
    const labels = items.map((it0) => ({ it0, box: rect(it0, placed.get(it0.key)!) }));
    for (let i = 0; i < labels.length; i++) {
      for (let j = 0; j < labels.length; j++) {
        if (i === j) continue;
        expect(hit(labels[i].box, labels[j].box), `${labels[i].it0.key}/${labels[j].it0.key}`).toBe(false);
        const o = labels[j].it0;
        expect(hit(labels[i].box, { left: o.x + symbol.left, top: o.y + symbol.top, right: o.x + symbol.right, bottom: o.y + symbol.bottom })).toBe(false);
      }
    }
  });
  it("wijkt uit met een aanhaallijn als er vlak naast het symbool geen plek is", () => {
    // Buren rondom op korte afstand: alle plekken tegen het symbool zijn bezet.
    const centre = item("MID", 200, 200, "MIDDEN");
    const ring = [[-34, 0], [34, 0], [0, -30], [0, 30], [-34, -30], [34, -30], [-34, 30], [34, 30]].map(([dx, dy], i) => item(`N${i}`, 200 + dx, 200 + dy, ""));
    const p = placeLabels([...ring, centre]).get("MID")!;
    expect(p.leader).toBeDefined();
    const l = p.leader!;
    // De lijn begint op de rand van het symbool en eindigt op de rand van het label.
    expect(l.x1).toBeGreaterThanOrEqual(symbol.left);
    expect(l.x1).toBeLessThanOrEqual(symbol.right);
    expect(l.x2).toBeGreaterThanOrEqual(p.dx);
    expect(l.x2).toBeLessThanOrEqual(p.dx + centre.width);
  });
  it("blijft uit de buurt van een opgegeven vlak", () => {
    const it0 = item("S01", 100, 100);
    const free = placeLabels([it0]).get("S01")!;
    const blocked = rect(it0, free);
    const p = placeLabels([it0], [blocked]).get("S01")!;
    expect(hit(rect(it0, p), blocked)).toBe(false);
  });
  it("is stabiel: dezelfde invoer geeft dezelfde plaatsing", () => {
    const items = [item("A", 10, 10), item("B", 30, 14), item("C", 22, 40)];
    expect([...placeLabels(items)]).toEqual([...placeLabels(items)]);
  });
});

describe("schaalstok", () => {
  const MM = 96 / 25.4;
  const at = (scale: number) => pickScaleBar(scale / 1000 / MM, 50 * MM)!;
  it("kiest ronde waarden bij de gangbare schalen", () => {
    expect([at(500).totalM, at(500).segmentM]).toEqual([25, 5]);
    expect([at(1000).totalM, at(1000).segmentM]).toEqual([50, 10]);
    expect([at(2000).totalM, at(2000).segmentM]).toEqual([100, 20]);
    expect([at(5000).totalM, at(5000).segmentM]).toEqual([250, 50]);
    expect(at(200).ticks).toEqual([0, 2, 4, 6, 8, 10]);
  });
  it("blijft bij een eigen schaal dicht bij de gewenste lengte en binnen de ruimte", () => {
    for (const s of [100, 250, 850, 1250, 3000, 7500, 20000]) {
      const bar = at(s);
      expect(bar.lengthPx / (50 * MM)).toBeGreaterThan(0.6);
      expect(bar.lengthPx / (50 * MM)).toBeLessThan(1.6);
      expect(bar.ticks[bar.ticks.length - 1]).toBe(bar.totalM);
    }
    expect(pickScaleBar(0.1, 400, 300)!.lengthPx).toBeLessThanOrEqual(300);
  });
  it("geeft niets zonder geldige schaal", () => {
    expect(pickScaleBar(0, 100)).toBeNull();
    expect(pickScaleBar(Number.NaN, 100)).toBeNull();
  });
  it("schrijft maatgetallen kort", () => {
    expect([formatScaleTick(10), formatScaleTick(2.5), formatScaleTick(0.5)]).toEqual(["10", "2.5", "0.5"]);
  });
});

describe("legenda", () => {
  it("toont alleen wat voorkomt, met het aantal, in vaste volgorde", () => {
    const specs: SymbolSpec[] = [
      { type: "boring", status: "gepland" },
      { type: "sondering", soort: "kleef", status: "gepland" },
      { type: "sondering", soort: "kleef-water", status: "uitgevoerd" },
      { type: "sondering", soort: "kleef", status: "gepland" },
    ];
    expect(legendEntries(specs).map((e) => [symbolKey(e.spec), e.count])).toEqual([
      ["sondering:kleef-water:uitgevoerd", 1],
      ["sondering:kleef:gepland", 2],
      ["boring:gepland", 1],
    ]);
    expect(legendEntries([])).toEqual([]);
  });
});

describe("opslaan en openen", () => {
  const base: TekeningFullState = {
    paperSize: "A3", scale: 500, center: { lat: 52, lon: 5, zoom: 18 },
    markers: [], rasters: [], lines: [], coordTags: [], overlay: null,
    titleBlock: { project: "", projectNumber: "", address: "", drawingNumber: "", scale: "", date: "", drawnBy: "", checkedBy: "", version: "" },
  };
  it("bewaart de soort van markers en rasters", () => {
    const state: TekeningFullState = {
      ...base,
      markers: [{ id: "S01", kind: "sondering", lat: 52, lon: 5, soort: "kleef-water", kleefmeting: true }, { id: "B01", kind: "bore", lat: 52, lon: 5 }],
      rasters: [{ id: "R01", centerLat: 52, centerLon: 5, rows: 2, cols: 2, spacingX: 20, spacingY: 20, rotation: 0, soort: "water" }],
    };
    const back = tekeningStateFromIfcgis(JSON.parse(JSON.stringify(tekeningStateToIfcgis(state))))!;
    expect(back.markers.map((m) => m.soort)).toEqual(["kleef-water", undefined]);
    expect(back.rasters[0].soort).toBe("water");
  });
  it("opent een oude tekening zonder soort met de soort van de kleefvlag", () => {
    const old = {
      paper_size: "A3", scale: 500, center: { lat: 52, lon: 5, zoom: 18 },
      markers: [{ id: "S01", kind: "sondering", lat: 52, lon: 5, kleefmeting: true }, { id: "S02", kind: "sondering", lat: 52, lon: 5 }],
      rasters: [{ id: "R01", center_lat: 52, center_lon: 5, rows: 2, cols: 2, spacing_x: 20, spacing_y: 20, rotation: 0 }],
    };
    const back = tekeningStateFromIfcgis(old)!;
    expect(back.markers.map((m) => m.soort)).toEqual(["kleef", "conus"]);
    expect(back.rasters[0].soort).toBe("conus");
  });
});
