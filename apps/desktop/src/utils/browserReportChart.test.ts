import { expect, it } from "vitest";
import { reportChartModel } from "./browserReportChart";
it("matches native 595x841 plot axis coordinates and fixed scales", () => {
    const chart = reportChartModel({ id: "ref", metadata: { source_file: "ref.gef", ground_level_nap: 2 }, points: [{ depth: 0, qc: 0, fs: 0, rf: 0, u2: 0 }, { depth: 10, qc: 30, fs: .25, rf: 10, u2: 1 }] });
    expect(chart.napTop).toBe(2);
    expect(chart.napBottom).toBe(-8);
    // Native plot/mod.rs geometry: plot=(62,64,495,653), SBT x=547.
    expect(chart.curves.qc).toEqual([[{ x: 62, y: 64 }, { x: 545, y: 717 }]]);
    expect(chart.curves.fs).toEqual([[{ x: 62, y: 64 }, { x: 223, y: 717 }]]);
    expect(chart.curves.rf).toEqual([[{ x: 545, y: 64 }, { x: 446, y: 717 }]]);
    expect(chart.curves.u2).toEqual(chart.curves.qc);
});
it("preserves missing-data gaps and reports true out-of-range peaks", () => {
    const chart = reportChartModel({ id: "ref", metadata: { source_file: "ref.gef" }, points: [{ depth: 0, fs: .1 }, { depth: 1 }, { depth: 2, fs: .7 }, { depth: 3, fs: .2 }] });
    expect(chart.curves.fs.map(s => s.length)).toEqual([1, 2]);
    expect(chart.curves.fs[1][0].x).toBe(223);
    expect(chart.overflow).toContain("fs: maximum 0.700 MPa (schaal 0.25)");
});
it("uses readable metre ticks for a ten metre sounding",()=>{
 const chart=reportChartModel({id:"ticks",metadata:{source_file:"ticks.gef",ground_level_nap:2},points:[{depth:0},{depth:10}]});
 expect(chart.napTicks).toEqual([-8,-7,-6,-5,-4,-3,-2,-1,0,1,2]);
});
