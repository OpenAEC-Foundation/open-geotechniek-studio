import { describe, expect, it } from "vitest";
import { aquifers, cellValue, parseRegisAscii, regisRange, regisUrl, unitKind } from "./regis";
import { geotopRange, parseGeotopAscii } from "./geotop";
import { parseGldCsv, seriesStats, wellAquifer } from "./groundwater";

const area = { xmin: 126310, ymin: 426610, xmax: 126390, ymax: 426690 };

// Zoals OPeNDAP het teruggeeft (één cel; waarden ingekort uit een echt antwoord bij Gorinchem).
const REGIS = `Dataset: REGIS.nc
top.x, 126300
top.top[top.layer="mv"][top.y=426600], 1.83
top.top[top.layer="NUhlc"][top.y=426600], 1.83
top.top[top.layer="NUBXz1"][top.y=426600], -9999
top.top[top.layer="NUKRz2"][top.y=426600], -8.77
top.top[top.layer="NUKRk1"][top.y=426600], -12.0
top.top[top.layer="NUKRz3"][top.y=426600], -12.4
top.top[top.layer="NUSTz1"][top.y=426600], -19.33
top.top[top.layer="NUWAk1"][top.y=426600], -41.82
top.top[top.layer="NUPZ-WAz2"][top.y=426600], -62.22
bottom.x, 126300
bottom.bottom[bottom.layer="mv"][bottom.y=426600], -9999
bottom.bottom[bottom.layer="NUhlc"][bottom.y=426600], -8.77
bottom.bottom[bottom.layer="NUBXz1"][bottom.y=426600], -9999
bottom.bottom[bottom.layer="NUKRz2"][bottom.y=426600], -12.0
bottom.bottom[bottom.layer="NUKRk1"][bottom.y=426600], -12.4
bottom.bottom[bottom.layer="NUKRz3"][bottom.y=426600], -19.33
bottom.bottom[bottom.layer="NUSTz1"][bottom.y=426600], -41.44
bottom.bottom[bottom.layer="NUWAk1"][bottom.y=426600], -62.22
bottom.bottom[bottom.layer="NUPZ-WAz2"][bottom.y=426600], -80
kh.x, 126300
kh.kh[kh.layer="NUKRz2"][kh.y=426600], 10
kh.kh[kh.layer="NUKRz3"][kh.y=426600], 20
kh.kh[kh.layer="NUSTz1"][kh.y=426600], 30
kh.kh[kh.layer="NUPZ-WAz2"][kh.y=426600], 15
`;

describe("REGIS II", () => {
  it("vraagt de cellen van het gebied op met de juiste indexen", () => {
    expect(regisRange(area)).toEqual({ i0: 1263, i1: 1263, j0: 1266, j1: 1266 });
    expect(regisUrl(area)).toContain("top%5B0:1:131%5D%5B1266:1:1266%5D%5B1263:1:1263%5D");
  });

  it("leest eenheden, maaiveld en doorlatendheid en laat ontbrekende eenheden weg", () => {
    const g = parseRegisAscii(REGIS, area);
    expect(g.x0).toBe(126300);
    expect(g.y0).toBe(426600);
    expect(g.ground).toEqual([1.83]);
    expect(g.units.map((u) => u.name)).toEqual(["NUhlc", "NUKRz2", "NUKRk1", "NUKRz3", "NUSTz1", "NUWAk1", "NUPZ-WAz2"]);
    expect(g.units.find((u) => u.name === "NUSTz1")!.kh).toEqual([30]);
    expect(cellValue(g, g.ground, 126350, 426650)).toBe(1.83);
    expect(cellValue(g, g.ground, 126450, 426650)).toBeNull();
  });

  it("deelt eenheden in en bouwt pakketten, met een dunne kleilaag binnen het pakket", () => {
    expect(unitKind("NUhlc")).toBe("deklaag");
    expect(unitKind("NUKRz2")).toBe("watervoerend");
    expect(unitKind("NUPZ-WAz2")).toBe("watervoerend");
    expect(unitKind("NUWAk1")).toBe("scheidend");
    const packs = aquifers(parseRegisAscii(REGIS, area));
    expect(packs).toHaveLength(2);
    // NUKRk1 is 0,4 m dik: onderbreekt het eerste pakket niet.
    expect(packs[0]).toMatchObject({ index: 1, top: [-8.77], bottom: [-41.44], units: ["NUKRz2", "NUKRz3", "NUSTz1"] });
    expect(packs[0].kD[0]).toBeCloseTo(10 * 3.23 + 20 * 6.93 + 30 * 22.11, 6);
    expect(packs[1]).toMatchObject({ index: 2, top: [-62.22], bottom: [-80] });
  });
});

describe("GeoTOP", () => {
  it("leest lithoklassen per voxel, met het midden van de voxel als coördinaat", () => {
    const r = geotopRange(area, -2, 0);
    expect(r).toMatchObject({ i0: 1127, i1: 1128, j0: 881, j1: 882, k0: 96, k1: 100 });
    const text = `Dataset: geotop.nc
lithok.z, -2, -1.5, -1, -0.5, 0
lithok.lithok[lithok.x=126300][lithok.y=426600], 1, 2, 7, 6, -127
lithok.lithok[lithok.x=126400][lithok.y=426700], 7, 6, 6, 6, 6
`;
    const g = parseGeotopAscii(text, area, -2, 0);
    expect(g.xs).toEqual([126300, 126400]);
    expect(g.ys).toEqual([426600, 426700]);
    expect(g.zs).toEqual([-2, -1.5, -1, -0.5, 0]);
    const at = (ix: number, iy: number, iz: number) => g.lithok[(ix * g.ys.length + iy) * g.zs.length + iz];
    expect([0, 1, 2, 3, 4].map((k) => at(0, 0, k))).toEqual([1, 2, 7, 6, null]);
    expect(at(1, 1, 0)).toBe(7);
    expect(at(0, 1, 0)).toBeNull();
  });
});

describe("grondwater", () => {
  const csv = (rows: [string, number][]) => [`"OBS","(x)","(y)","reguliereMeting","onbekend","OPR"`, ",,,,,", ...rows.map(([t, v]) => `"${t}T12:00:00+01:00","${v.toFixed(3)}","onbekend",,,"discontinu"`)].join("\n");

  it("leest de meetreeks uit de BRO-CSV", () => {
    const s = parseGldCsv(csv([["1952-06-28", 0.28], ["1952-06-14", 0.18]]));
    expect(s.map((x) => x.v)).toEqual([0.18, 0.28]);
  });

  it("berekent gemiddelde, uitersten en een benadering van GHG en GLG over hydrologische jaren", () => {
    const rows: [string, number][] = [];
    for (let year = 2015; year <= 2020; year++) {
      // twee metingen per maand, winter hoog (+0,5), zomer laag (−0,5)
      for (let m = 0; m < 12; m++) for (const d of [14, 28]) {
        const winter = m <= 2 || m >= 10;
        rows.push([`${year}-${String(m + 1).padStart(2, "0")}-${d}`, winter ? 0.5 : -0.5]);
      }
    }
    const st = seriesStats(parseGldCsv(csv(rows)))!;
    expect(st.n).toBe(144);
    expect(st.min).toBe(-0.5);
    expect(st.max).toBe(0.5);
    expect(st.ghg).toBeCloseTo(0.5, 9);
    expect(st.glg).toBeCloseTo(-0.5, 9);
    expect(st.years).toBeGreaterThanOrEqual(5);
  });

  it("plaatst een filter in de deklaag of een pakket", () => {
    const packs = [{ index: 1, top: -8.77, bottom: -41.44 }, { index: 2, top: -62.22, bottom: -80 }];
    expect(wellAquifer(-0.5, packs)).toBe(0);
    expect(wellAquifer(-15, packs)).toBe(1);
    expect(wellAquifer(-70, packs)).toBe(2);
    expect(wellAquifer(-50, packs)).toBeNull();
  });
});
