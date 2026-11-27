import { describe, expect, it } from "vitest";
import type { Cpt } from "../types/cpt";
import { matchCoordinates, normalizeId, parseCoordinates, withPosition } from "./coordinates";

const cpt = (id: string, source_file?: string): Cpt => ({ id, metadata: { source_file, ground_level_nap: -0.4 } as Cpt["metadata"], points: [] });

describe("coordinatenbestand", () => {
  it("leest puntkomma, tab en komma, met kopregel en decimale komma", () => {
    const { rows, skipped } = parseCoordinates("naam;x;y;z\nS01;74571,2;412253,5;0,05\nS02;74581.6;412243.9\n\n# opmerking\n");
    expect(skipped).toBe(0);
    expect(rows).toEqual([{ id: "S01", x: 74571.2, y: 412253.5, z: 0.05 }, { id: "S02", x: 74581.6, y: 412243.9 }]);
    expect(parseCoordinates("1\t100\t200").rows).toEqual([{ id: "1", x: 100, y: 200 }]);
    expect(parseCoordinates("1,100.5,200.5").rows).toEqual([{ id: "1", x: 100.5, y: 200.5 }]);
  });
  it("telt onleesbare regels", () => {
    expect(parseCoordinates("S01;abc;12\nS02;1;2").skipped).toBe(1);
  });
  it("vergelijkt namen los van voorvoegsel en voorloopnullen", () => {
    expect(normalizeId("S01")).toBe("1");
    expect(normalizeId("CPT-012")).toBe("12");
    expect(normalizeId("DKM 3")).toBe("3");
    expect(normalizeId("B12a")).toBe("b12a");
  });
  it("koppelt op naam, losse naam en volgnummer in de bestandsnaam", () => {
    const { rows } = parseCoordinates("S01;1;2\nS12;3;4\nS99;5;6");
    const r = matchCoordinates(rows, [cpt("1"), cpt("CPT000000036564", "24150_12.GEF"), cpt("7")]);
    expect(r.matches.map((m) => [m.cptId, m.row.id])).toEqual([["1", "S01"], ["CPT000000036564", "S12"]]);
    expect(r.missing).toEqual(["7"]);
    expect(r.unmatched).toEqual(["S99"]);
  });
  it("zet de positie en neemt de hoogte alleen over als die in het bestand staat", () => {
    const a = withPosition(cpt("1"), { id: "S01", x: 10, y: 20 });
    expect(a.position).toMatchObject({ x_rd: 10, y_rd: 20, z_nap: -0.4 });
    expect(a.metadata.ground_level_nap).toBe(-0.4);
    const b = withPosition(cpt("1"), { id: "S01", x: 10, y: 20, z: 1.25 });
    expect(b.metadata.ground_level_nap).toBe(1.25);
    expect(b.position).toMatchObject({ z_nap: 1.25 });
  });
});
