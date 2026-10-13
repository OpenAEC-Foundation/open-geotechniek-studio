import { expect, it } from "vitest";
import fixture from "./__fixtures__/native-core.json";
import type { Cpt } from "../types/cpt";
import { detectLayers } from "./browserCore";
import { reportChartModel } from "./browserReportChart";
// Generated with the native Rust engine by src-tauri/examples/browser_core_reference.rs.
it("matches layers produced by the native engine", () => expect(detectLayers(fixture.cpt as unknown as Cpt)).toEqual(fixture.layers));
it.each([['qc', '#1F4FA8'], ['fs', '#D02828'], ['rf', '#000000'], ['u2', '#06B6D4']] as const)("matches actual native SVG %s curve coordinates", (key, color) => {
    const path = fixture.svg.match(new RegExp('<polyline points="([^"]*)"[^>]*stroke="' + color + '"'));
    expect(path).not.toBeNull();
    const expected = path![1].split(' ').map(point => point.split(',').map(Number));
    const actual = reportChartModel(fixture.cpt as unknown as Cpt).curves[key].flat();
    expect(actual).toHaveLength(expected.length);
    actual.forEach((point, i) => { expect(point.x).toBeCloseTo(expected[i][0], 2); expect(point.y).toBeCloseTo(expected[i][1], 2); });
});
