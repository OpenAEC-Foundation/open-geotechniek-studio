import { expect, it } from "vitest";
import { overviewBounds } from "./browserReportMap";
it("matches native square map extent and offline fallback margins", () => {
    const cpts = [{ id: "A", metadata: { source_file: "a.gef" }, points: [], position: { x_rd: 100000, y_rd: 400000 } }];
    expect(overviewBounds(cpts, true)).toEqual({ xmin: 99850, xmax: 100150, ymin: 399850, ymax: 400150 });
    expect(overviewBounds(cpts, false)).toEqual({ xmin: 99994, xmax: 100006, ymin: 399994, ymax: 400006 });
    expect(overviewBounds([], true)).toBeNull();
});
