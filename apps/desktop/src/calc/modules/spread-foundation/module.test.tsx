// Rekenblad, tekening, 3D-geometrie en uitdraai van de fundering op staal.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectContext } from "../../framework/types";
import { DEFAULT_FACTORS } from "./catalog";
import { computeSpread, type SpreadInput, type SpreadOk } from "./compute";
import { spreadFoundationModule as module } from "./module";
import { footingThickness, groundHeight, layerPolygon, spreadScene } from "./scene";

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
    expect(svg.querySelectorAll(".sf-slip-governing polyline")).toHaveLength(4); // maatgevend: wig, spiraal, passieve wig en het verlengde door de dekking
    expect(svg.querySelectorAll(".sf-slip-other:not(.sf-slip-undrained) polyline")).toHaveLength(4); // het andere vlak, gestreept
    expect(svg.querySelectorAll(".sf-slip-fill")).toHaveLength(1);
    expect(svg.querySelectorAll(".sf-load")).toHaveLength(3); // Vd, Hd en de resultante
    expect(svg).toHaveTextContent(`b′ = ${r.dims.bRawM.toFixed(2).replace(".", ",")} m`);
    expect(svg).toHaveTextContent("β = 10,0°"); expect(svg).toHaveTextContent("α = 5,0°");
    expect(svg.querySelectorAll(".sf-punch")).toHaveLength(r.punch.length);
    fireEvent.click(screen.getByRole("tab", { name: "3D" }));
    expect(container.querySelector("svg.sf-section")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("3D is op dit apparaat niet beschikbaar");
  });

  it("zonder horizontale belasting en hellingen zijn beide kanten van het bezwijkvlak gelijk en doorgetrokken", () => {
    const centric = { ...input, hDKn: 0, eccBM: 0, slopeDeg: 0, baseTiltDeg: 0, hQRepKn: 0 };
    render(<module.VisualPanel input={centric} result={ok(centric)} />);
    expect(screen.getByRole("img", { name: /Doorsnede/ }).querySelectorAll(".sf-slip-governing polyline")).toHaveLength(8);
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
  it("bezwijkvlak: het snijvlak van de 3D is de doorsnede; beide kanten, met Hd het maatgevende ondieper en korter, en bij Hd → 0 gelijk", () => {
    const sand = { ...input, shape: "strip" as const, widthM: 2, eccBM: 0, slopeDeg: 0, baseTiltDeg: 0, vDKn: 300, hArmM: 0, hGRepKn: 0, hQRepKn: 0, mQRepKnm: 0, layers: [input.layers[0]] };
    const at = (hDKn: number) => { const i = { ...sand, hDKn }, r = ok(i); return { r, s: spreadScene(i, r) }; };
    const vertical = at(0), inclined = at(60), m = inclined.s.mechanism;
    expect(vertical.s.slip.map((x) => [x.dir, x.governing])).toEqual([[1, true], [-1, true]]);
    expect(inclined.s.slip.map((x) => [x.dir, x.governing])).toEqual([[1, true], [-1, false]]);
    // tan δ = 60/300 = 0,2 bij φ'gem;rep = 32,5°: sin Δ = sin 11,31° / sin 32,5° → Δ = 21,41°, α = 16,36°.
    expect(m.obliquity).toBeCloseTo(0.2, 9); expect(m.drained.rotationDeg).toBeCloseTo(16.36, 2);
    expect(m.drained.maxDepthM).toBeLessThan(vertical.s.mechanism.drained.maxDepthM); expect(m.drained.reachM).toBeLessThan(vertical.s.mechanism.drained.reachM);
    // De omtrek op het snijvlak bestaat uit dezelfde punten als het vlak in de doorsnede, en loopt naar de kant van Hd (+x).
    const outline = inclined.s.slip[0].outline, side = m.drained.sides[0];
    expect(outline[0]).toEqual({ x: -1, depth: 0 }); expect(outline[1]).toEqual({ x: side.wedge[1].x, depth: side.wedge[1].z });
    expect(outline[outline.length - 2]).toEqual({ x: side.passive[1].x, depth: 0 }); expect(outline[outline.length - 2].x).toBeCloseTo(1 + m.drained.reachM, 9);
    expect(Math.max(...outline.map((q) => q.depth))).toBeCloseTo(m.drained.maxDepthM, 2);
    expect(Math.min(...outline.map((q) => q.x))).toBe(-1);
    // Het andere vlak loopt naar −x en is dieper en langer; het verlengde door de dekking eindigt op het maaiveld (0,8 m boven de aanleg).
    const other = inclined.s.slip[1];
    expect(Math.min(...other.outline.map((q) => q.x))).toBeCloseTo(-1 - m.drained.sides[1].reachM, 9);
    expect(m.drained.sides[1].maxDepthM).toBeGreaterThan(vertical.s.mechanism.drained.maxDepthM);
    expect(inclined.s.depthM).toBeGreaterThanOrEqual(Math.min(8, 1.1 * m.drained.sides[1].maxDepthM));
    for (const x of inclined.s.slip) expect(x.daylight[1].depth).toBeCloseTo(-0.8, 9);
    // Een heel kleine Hd geeft aan beide kanten het vlak van Prandtl.
    const tiny = at(0.003).s.slip, prandtl = vertical.s.slip;
    tiny.forEach((x, j) => x.outline.forEach((q, k) => { expect(q.x).toBeCloseTo(prandtl[j].outline[k].x, 2); expect(q.depth).toBeCloseTo(prandtl[j].outline[k].depth, 2); }));
    // Hd evenwijdig aan L: in de doorsnede over de breedte blijft het vlak dat van Prandtl.
    const pad = { ...sand, shape: "pad" as const, lengthM: 4, hDKn: 60, hDirection: "L" as const };
    expect(spreadScene(pad, ok(pad)).mechanism.drained.rotationDeg).toBe(0);
  });
  it("helling: het maaiveld loopt af onder β, de onderkant ligt onder α en het vlak eindigt op het schuine maaiveld; de berekening verandert niet", () => {
    const flat = { ...input, shape: "strip" as const, widthM: 2, eccBM: 0, slopeDeg: 0, baseTiltDeg: 0, hDKn: 0, hArmM: 0, hGRepKn: 0, hQRepKn: 0, mQRepKnm: 0, layers: [input.layers[0]] };
    const sloped = { ...flat, slopeDeg: 15, baseTiltDeg: 8 }, r = ok(sloped), s = spreadScene(sloped, r), level = spreadScene(flat, ok(flat));
    const tanB = Math.tan(15 * Math.PI / 180), tanA = Math.tan(8 * Math.PI / 180);
    expect(s.slopeTan).toBeCloseTo(tanB, 12); expect(s.baseTan).toBeCloseTo(tanA, 12); expect(level.slopeTan).toBe(0); expect(level.baseTan).toBe(0);
    // Maaiveld: horizontaal tot de rand van de voet, daarna op ware schaal aflopend.
    expect(groundHeight(s, -3)).toBe(0.8); expect(groundHeight(s, 1)).toBe(0.8); expect(groundHeight(s, 3)).toBeCloseTo(0.8 - 2 * tanB, 12);
    // De bovenste laag is in het blok afgesneden door het hellende maaiveld; zonder helling is het een rechthoek.
    const top = layerPolygon(s, s.layers[0]), hw = s.halfWidthM;
    for (const q of top) expect(q.z).toBeLessThanOrEqual(groundHeight(s, q.x) + 1e-9);
    expect(top.some((q) => q.x === 1 && Math.abs(q.z - 0.8) < 1e-9)).toBe(true); // de knik bij de rand van de voet
    expect(top.some((q) => q.x > 1 && Math.abs(q.z - groundHeight(s, q.x)) < 1e-9 && q.z < 0.8)).toBe(true);
    expect(layerPolygon(level, level.layers[0])).toEqual([{ x: -level.halfWidthM, z: level.layers[0].bottomZ }, { x: level.halfWidthM, z: level.layers[0].bottomZ }, { x: level.halfWidthM, z: 0.8 }, { x: -level.halfWidthM, z: 0.8 }]);
    expect(hw).toBeGreaterThan(1);
    // De onderkant van de voet draait om het midden: ∓ 1·tan 8°.
    expect(s.footingProfile[0]).toEqual({ x: -1, z: -tanA }); expect(s.footingProfile[1]).toEqual({ x: 1, z: tanA });
    expect(level.footingProfile[0]).toEqual({ x: -1, z: -0 }); expect(level.footingProfile[1].z).toBe(0);
    // Het vlak begint op de schuine onderkant en eindigt aan beide kanten op het maaiveld.
    const [low, high] = s.slip;
    expect(low.outline[0]).toEqual({ x: -1, depth: tanA }); expect(low.outline[low.outline.length - 1].depth).toBeCloseTo(-tanA, 12);
    expect(-low.daylight[1].depth).toBeCloseTo(groundHeight(s, low.daylight[1].x), 9); expect(low.daylight[1].x).toBeGreaterThan(1);
    expect(-high.daylight[1].depth).toBeCloseTo(0.8, 9); expect(high.daylight[1].x).toBeLessThan(-1);
    expect(low.governing).toBe(true); expect(high.governing).toBe(false);
    expect(s.mechanism.drained.sides[0].fanDeg).toBeCloseTo(90 - 8 - 15, 9); expect(s.mechanism.drained.sides[1].fanDeg).toBeCloseTo(90 + 8, 9);
    expect(s.mechanism.drained.sides[0].reachM).toBeLessThan(level.mechanism.drained.reachM);
    // Alleen de weergave verandert: dekking en maten in de berekening blijven die van de invoer.
    expect(r.coverM).toBeCloseTo(0.8, 12); expect(r.dims.bRawM).toBe(2); expect(r.qKpa).toBeCloseTo(ok(flat).qKpa, 12);
  });
  it("ongedraineerd bezwijkvlak: een cirkelboog die met Hd / (A'·cu;d) draait", () => {
    const clay = { ...input, shape: "strip" as const, widthM: 2, eccBM: 0, slopeDeg: 0, baseTiltDeg: 0, hArmM: 0, vDKn: 200, hDKn: 37.04, layers: [{ ...input.layers[1], topNap: 0 }] };
    const m = spreadScene(clay, ok(clay)).mechanism;
    // cu;d = 50/1,35 = 37,04 kPa; Hd / (A'·cu;d) = 37,04 / (2 · 37,04) = 0,5 → α = 15°.
    expect(m.undrainedRatio).toBeCloseTo(0.5, 3); expect(m.undrained!.kind).toBe("circle"); expect(m.undrained!.rotationDeg).toBeCloseTo(15, 1);
    expect(m.undrained!.sides.map((x) => x.governing)).toEqual([true, false]);
  });
  it("de voet krijgt een dikte binnen de dekking", () => {
    expect(footingThickness(1, 0.2)).toBe(0.2); expect(footingThickness(1, 0)).toBe(0.3); expect(footingThickness(6, 2)).toBe(0.8);
  });
});
