// Rekenblad, tekening, 3D-geometrie en uitdraai van de fundering op staal.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectContext } from "../../framework/types";
import { DEFAULT_FACTORS } from "./catalog";
import { computeSpread, type SpreadInput, type SpreadOk } from "./compute";
import { spreadFoundationModule as module } from "./module";
import { footingThickness, spreadScene } from "./scene";

const ctx = { cpts: new Map(), activeCptId: null, projectMeta: { title: "Proef", client: "", project_number: "P1", author: "", date: "2026-01-05" } } as unknown as ProjectContext;
const input: SpreadInput = {
  ...(module.defaultInput(ctx) as SpreadInput), shape: "pad", widthM: 2, lengthM: 3, foundationNap: -0.8, groundNap: 0, waterNap: -1.5, vDKn: 600, hDKn: 60, hArmM: 1, eccBM: 0.1,
  vGRepKn: 400, hQRepKn: 40, slopeDeg: 10, baseTiltDeg: 5, factors: DEFAULT_FACTORS,
  layers: [{ topNap: 0, name: "Zand, matig", gamma: 18, gammaSat: 20, phi: 32.5, c: 0, cu: 0, soilId: "sand-medium" }, { topNap: -2, name: "Klei, matig", gamma: 17, gammaSat: 17, phi: 17.5, c: 5, cu: 50, soilId: "clay-medium" }],
};
const ok = (i: SpreadInput): SpreadOk => { const r = computeSpread(i); if (!r.ok) throw new Error(r.error); return r; };
afterEach(cleanup);

describe("module", () => {
  it("staat als experimentele module in de categorie funderingen op staal en rekent met de standaardinvoer", () => {
    expect(module.id).toBe("spread-foundation"); expect(module.status).toBe("experimental"); expect(module.category).toBe("spread");
    const first = module.defaultInput(ctx) as SpreadInput, r = module.compute(first, ctx) as SpreadOk;
    expect(r.ok).toBe(true);
    expect(module.statusLine!(r).text).toMatch(/^u\.c\. /);
    expect(module.checks!(first, r).map((c) => c.label)).toEqual(["draagvermogen gedraineerd", "excentriciteit"]);
  });

  it("invoer: wisselen tussen strook en poer, lagen bewerken en ze vastzetten", () => {
    const onChange = vi.fn(), r = ok(input);
    render(<module.InputPanel input={input} result={r} onChange={onChange} />);
    expect(screen.getByLabelText("Lengte L [m]")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Vorm van de fundering"), { target: { value: "strip" } });
    expect(onChange.mock.lastCall?.[0].shape).toBe("strip");
    fireEvent.click(screen.getByRole("button", { name: "Laag toevoegen" }));
    expect(onChange.mock.lastCall?.[0].layers).toHaveLength(3);
    fireEvent.change(screen.getByLabelText("Grondsoort laag 2"), { target: { value: "peat" } });
    expect(onChange.mock.lastCall?.[0].layers[1]).toMatchObject({ soilId: "peat", cu: 10, phi: 15 });
    fireEvent.click(screen.getByLabelText(/Invloedsdiepte ze met de hand vastzetten/));
    expect(onChange.mock.lastCall?.[0].zeManualM).toBeCloseTo(r.drained.zeM, 2);
    expect(screen.getByRole("button", { name: "Voorstel uit sondering" })).toBeDisabled();
  });

  it("uitkomsten: per toets belasting, weerstand en unity check, de iteratie en de ingevulde formules", () => {
    const r = ok(input);
    render(<module.ResultPanel input={input} result={r} />);
    const summary = screen.getByRole("table", { name: "Overzicht van de toetsen" });
    for (const title of ["Verticaal draagvermogen, gedraineerd", "Afschuiven, gedraineerd", "Excentriciteit van de resultante", "Kantelen om de rand van de voet (EQU)"]) expect(summary).toHaveTextContent(title);
    expect(summary).toHaveTextContent(/Doorponsen, ongedraineerd/);
    expect(screen.getByRole("table", { name: "Iteratie naar de invloedsdiepte" }).querySelectorAll("tbody tr")).toHaveLength(r.drained.iterations.length);
    expect(screen.getAllByText(/σ'v;z;d·Nq·sq·iq·bq·λq/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/γG;stb · VG;rep · a/).length).toBe(1);
  });

  it("tekening: doorsnede met helling, belastingen, effectieve breedte en bezwijkvlak; 3D valt terug zonder WebGL", () => {
    const r = ok(input);
    const { container } = render(<module.VisualPanel input={input} result={r} />);
    const svg = screen.getByRole("img", { name: /Doorsnede van de fundering/ });
    expect(svg.querySelectorAll(".sf-slip:not(.sf-slip-undrained) polyline")).toHaveLength(3); // eenzijdig: wig, spiraal, passieve wig
    expect(svg.querySelectorAll(".sf-load")).toHaveLength(3); // Vd, Hd en de resultante
    expect(svg).toHaveTextContent(`b′ = ${r.dims.bRawM.toFixed(2).replace(".", ",")} m`);
    expect(svg).toHaveTextContent("β = 10,0°"); expect(svg).toHaveTextContent("α = 5,0°");
    expect(svg.querySelectorAll(".sf-punch")).toHaveLength(r.punch.length);
    fireEvent.click(screen.getByRole("tab", { name: "3D" }));
    expect(container.querySelector("svg.sf-section")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("3D is op dit apparaat niet beschikbaar");
  });

  it("zonder horizontale belasting, excentriciteit en helling is het bezwijkvlak tweezijdig", () => {
    const centric = { ...input, hDKn: 0, eccBM: 0, slopeDeg: 0, hQRepKn: 0 };
    render(<module.VisualPanel input={centric} result={ok(centric)} />);
    expect(screen.getByRole("img", { name: /Doorsnede/ }).querySelectorAll(".sf-slip:not(.sf-slip-undrained) polyline")).toHaveLength(6);
  });

  it("uitdraai: een PDF met de toetsen, de iteratie en de kanteltoets", () => {
    const r = ok(input), pdf = module.buildReport!(input, r, ctx);
    const text = new TextDecoder("latin1").decode(pdf);
    expect(text.startsWith("%PDF-")).toBe(true);
    for (const part of ["Overzicht van de toetsen", "Invloedsdiepte", "Kantelen om de rand van de voet", "Verticaal draagvermogen, gedraineerd", "Bezwijkvlak in de tekening", "Overgangszone"]) expect(text).toContain(part);
    expect(module.reportFileName!(input)).toBe("fundering-op-staal-poer");
    expect(() => module.buildReport!(input, { ok: false, error: "fout" }, ctx)).toThrow("fout");
  });
});

describe("geometrie van de 3D-weergave", () => {
  it("poer: blok op schaal, effectief draagvlak verschoven naar de kant van de resultante", () => {
    const r = ok(input), s = spreadScene(input, r);
    expect(s.strip).toBe(false);
    expect(s.footing.size).toEqual([2, 3, footingThickness(2, 0.8)]);
    expect(s.effective.x1).toBe(1); expect(s.effective.x1 - s.effective.x0).toBeCloseTo(r.dims.bRawM, 9);
    expect(s.effective.y1 - s.effective.y0).toBeCloseTo(r.dims.lRawM, 9);
    expect(s.resultantAt).toEqual([r.dims.eccBM, 0, 0]);
    expect(s.resultantAngleDeg).toBeCloseTo(Math.atan(60 / 600) * 180 / Math.PI, 9);
    const kinds = Object.fromEntries(s.arrows.map((a) => [a.kind, a]));
    expect(kinds.V.to[2]).toBe(s.thicknessM); expect(kinds.V.from[0]).toBe(0.1); // Vd grijpt aan op zijn eigen excentriciteit
    expect(kinds.H.to[0]).toBeGreaterThan(kinds.H.from[0]); expect(kinds.H.from[2]).toBe(1); // Hd wijst naar +x, op de arm
    expect(kinds.R.to).toEqual(s.resultantAt); expect(kinds.R.from[0]).toBeLessThan(kinds.R.to[0]);
    expect(s.layers.map((l) => l.name)).toEqual(["Zand, matig", "Klei, matig"]);
    expect(s.layers[0].topZ).toBeCloseTo(0.8, 9); expect(s.layers[1].topZ).toBeCloseTo(-1.2, 9);
    expect(s.depthM).toBeGreaterThanOrEqual(1.25 * r.drained.zeM);
  });
  it("strook: een doorlopend stuk, het draagvlak over de volle lengte; Hd evenwijdig aan L draait de pijlen", () => {
    const strip = { ...input, shape: "strip" as const, widthM: 1.2 }, s = spreadScene(strip, ok(strip));
    expect(s.strip).toBe(true); expect(s.lengthM).toBeCloseTo(3.6, 9);
    expect(s.effective.y0).toBe(-s.lengthM / 2); expect(s.effective.y1).toBe(s.lengthM / 2);
    const along = { ...input, hDirection: "L" as const }, a = spreadScene(along, ok(along)).arrows.find((x) => x.kind === "H")!;
    expect(a.to[1]).toBeGreaterThan(a.from[1]); expect(a.to[0]).toBe(0);
  });
  it("bezwijkvlak: het snijvlak van de 3D is de doorsnede; met Hd eenzijdig, ondieper en korter, en bij Hd → 0 het symmetrische vlak", () => {
    const sand = { ...input, shape: "strip" as const, widthM: 2, eccBM: 0, slopeDeg: 0, baseTiltDeg: 0, vDKn: 300, hArmM: 0, hGRepKn: 0, hQRepKn: 0, mQRepKnm: 0, layers: [input.layers[0]] };
    const at = (hDKn: number) => { const i = { ...sand, hDKn }, r = ok(i); return { r, s: spreadScene(i, r) }; };
    const vertical = at(0), inclined = at(60), m = inclined.s.mechanism;
    expect(vertical.s.slip).toHaveLength(2); expect(inclined.s.slip).toHaveLength(1);
    // tan δ = 60/300 = 0,2 bij φ'gem;rep = 32,5°: sin Δ = sin 11,31° / sin 32,5° → Δ = 21,41°, α = 16,36°.
    expect(m.obliquity).toBeCloseTo(0.2, 9); expect(m.drained.rotationDeg).toBeCloseTo(16.36, 2);
    expect(m.drained.maxDepthM).toBeLessThan(vertical.s.mechanism.drained.maxDepthM); expect(m.drained.reachM).toBeLessThan(vertical.s.mechanism.drained.reachM);
    // De omtrek op het snijvlak bestaat uit dezelfde punten als het vlak in de doorsnede, en loopt naar de kant van Hd (+x).
    const outline = inclined.s.slip[0], side = m.drained.sides[0];
    expect(outline[0]).toEqual({ x: -1, depth: 0 }); expect(outline[1]).toEqual({ x: side.wedge[1].x, depth: side.wedge[1].z });
    expect(outline[outline.length - 2]).toEqual({ x: side.passive[1].x, depth: 0 }); expect(outline[outline.length - 2].x).toBeCloseTo(1 + m.drained.reachM, 9);
    expect(Math.max(...outline.map((q) => q.depth))).toBeCloseTo(m.drained.maxDepthM, 2);
    expect(Math.min(...outline.map((q) => q.x))).toBe(-1); // aan de andere kant geen zone
    // Een heel kleine Hd geeft het vlak van Prandtl aan de kant van Hd.
    const tiny = at(0.003).s.slip[0], prandtl = vertical.s.slip[0];
    tiny.forEach((q, k) => { expect(q.x).toBeCloseTo(prandtl[k].x, 3); expect(q.depth).toBeCloseTo(prandtl[k].depth, 3); });
    // Hd evenwijdig aan L: in de doorsnede over de breedte blijft het vlak dat van Prandtl.
    const pad = { ...sand, shape: "pad" as const, lengthM: 4, hDKn: 60, hDirection: "L" as const };
    expect(spreadScene(pad, ok(pad)).mechanism.drained.rotationDeg).toBe(0);
  });
  it("ongedraineerd bezwijkvlak: een cirkelboog die met Hd / (A'·cu;d) draait", () => {
    const clay = { ...input, shape: "strip" as const, widthM: 2, eccBM: 0, slopeDeg: 0, baseTiltDeg: 0, hArmM: 0, vDKn: 200, hDKn: 37.04, layers: [{ ...input.layers[1], topNap: 0 }] };
    const m = spreadScene(clay, ok(clay)).mechanism;
    // cu;d = 50/1,35 = 37,04 kPa; Hd / (A'·cu;d) = 37,04 / (2 · 37,04) = 0,5 → α = 15°.
    expect(m.undrainedRatio).toBeCloseTo(0.5, 3); expect(m.undrained!.kind).toBe("circle"); expect(m.undrained!.rotationDeg).toBeCloseTo(15, 1);
    expect(m.undrained!.sides).toHaveLength(1);
  });
  it("de voet krijgt een dikte binnen de dekking", () => {
    expect(footingThickness(1, 0.2)).toBe(0.2); expect(footingThickness(1, 0)).toBe(0.3); expect(footingThickness(6, 2)).toBe(0.8);
  });
});
