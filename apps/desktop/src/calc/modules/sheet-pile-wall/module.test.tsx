// Rekenblad, tekening, 3D-geometrie en uitdraai van de damwand en de beschoeiing.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectContext } from "../../framework/types";
import { findSheetPile } from "../../library/sheetPiles";
import { computeWall, revetmentExample, wallExample, type WallInput, type WallOk } from "./compute";
import { sheetPileWallModule as module } from "./module";
import { clipLine, niceTicks, plankPlan, profilePlan, wallScene } from "./scene";

const ctx = { cpts: new Map(), activeCptId: null, projectMeta: { title: "Proef", client: "", project_number: "P1", author: "", date: "2026-01-05" } } as unknown as ProjectContext;
const ok = (i: WallInput): WallOk => { const r = computeWall(i); if (!r.ok) throw new Error(r.error); return r; };
afterEach(cleanup);

describe("module", () => {
  it("staat als conceptmodule bij de wanden en rekent met de standaardinvoer", () => {
    expect(module.id).toBe("sheet-pile-wall"); expect(module.status).toBe("experimental"); expect(module.category).toBe("wall");
    const first = module.defaultInput(ctx) as WallInput, r = module.compute(first, ctx) as WallOk;
    expect(r.ok).toBe(true);
    expect(module.statusLine!(r).text).toMatch(/^u\.c\. \d,\d\d \(/);
    expect(module.checks!(first, r).map((c) => c.label)).toEqual(["M max", "anker", "y kop", "buiging", "normaalkracht", "dwarskracht", "passieve weerstand", "inheidiepte"]);
    const pending = module.statusLine!(module.compute({ ...first, toeNap: 5 }, ctx));
    expect(pending.pending).toBe(true); expect(pending.ok).toBe(false);
  });

  it("invoer damwand: niveaus, profielkeuze, anker, lagen en factoren", () => {
    const input = wallExample(), onChange = vi.fn();
    render(<module.InputPanel input={input} result={ok(input)} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Profiel"), { target: { value: "AZ 26-700" } });
    expect(onChange.mock.lastCall?.[0].profileId).toBe("AZ 26-700");
    fireEvent.change(screen.getByLabelText("Fabrikant"), { target: { value: "terra infrastructure" } });
    expect(findSheetPile(onChange.mock.lastCall?.[0].profileId, "terra infrastructure")).toBeDefined();
    fireEvent.click(screen.getByLabelText(/Starre steun/));
    expect(onChange.mock.lastCall?.[0].anchor.rigid).toBe(true);
    fireEvent.click(screen.getAllByRole("button", { name: "Laag toevoegen" })[0]);
    expect(onChange.mock.lastCall?.[0].layersHigh).toHaveLength(3); expect(onChange.mock.lastCall?.[0].layersHigh[2].kh).toBe(0);
    fireEvent.change(screen.getByLabelText("Grondsoort laag 1, hoge zijde"), { target: { value: "clay-medium" } });
    expect(onChange.mock.lastCall?.[0].layersHigh[0]).toMatchObject({ soilId: "clay-medium", phi: 17.5, delta: 11.7, kh: 20000 });
    fireEvent.click(screen.getByLabelText("ongedr. laag 2, hoge zijde"));
    expect(onChange.mock.lastCall?.[0].layersHigh[1].undrained).toBe(true);
    fireEvent.click(screen.getByLabelText(/Lage zijde heeft dezelfde lagen/));
    expect(onChange.mock.lastCall?.[0]).toMatchObject({ lowSameAsHigh: false }); expect(onChange.mock.lastCall?.[0].layersLow).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Set partiële factoren"), { target: { value: "rc3" } });
    expect(onChange.mock.lastCall?.[0].factors.gammaPhi).toBe(1.2);
    expect(screen.getByRole("button", { name: "Voorstel uit sondering" })).toBeDisabled();
    expect(screen.getByText(/niet tegen de tekst van NEN 9997-1 en CUR 166 gelegd/)).toBeInTheDocument();
    expect(screen.getByText(/levert daarvoor geen tabelwaarden/)).toBeInTheDocument();
  });

  it("invoer beschoeiing: soort constructie, hout of eigen waarden, palen met schotten zonder anker", () => {
    const input = wallExample(), onChange = vi.fn();
    const view = render(<module.InputPanel input={input} result={ok(input)} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Soort constructie"), { target: { value: "plank" } });
    expect(onChange.mock.lastCall?.[0].construction).toBe("plank");
    fireEvent.click(screen.getByRole("button", { name: "palen met schotten" }));
    const posts = onChange.mock.lastCall?.[0] as WallInput;
    expect(posts).toMatchObject({ construction: "posts", material: "timber" }); expect(computeWall(posts).ok).toBe(true);
    view.rerender(<module.InputPanel input={posts} result={ok(posts)} onChange={onChange} />);
    expect(screen.queryByLabelText("Profiel")).toBeNull(); expect(screen.queryByLabelText(/Eén ankerrij of stempel/)).toBeNull();
    expect(screen.getByLabelText("Factor ruimtelijke werking")).toHaveValue("3");
    expect(screen.getByText(/Broms \(1964\)/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Sterkteklasse hout"), { target: { value: "D70" } });
    expect(onChange.mock.lastCall?.[0].timber).toMatchObject({ classId: "D70", fmK: 70, eMeanMPa: 20000, kmod: 0.5 });
    fireEvent.change(screen.getByLabelText("Materiaal"), { target: { value: "custom" } });
    const custom = { ...posts, material: "custom" as const };
    view.rerender(<module.InputPanel input={custom} result={ok(custom)} onChange={onChange} />);
    expect(screen.getByLabelText("Buigstijfheid EI per paal [kNm²]")).toBeInTheDocument();
    // De schotten blijven van hout, dus de sterkteklasse blijft in beeld.
    expect(screen.getByLabelText("Sterkteklasse hout")).toBeInTheDocument();
  });

  it("uitkomsten: toetsen, verenmodel naast Blum, coëfficiënten en spanningen", () => {
    const input = wallExample(), r = ok(input);
    render(<module.ResultPanel input={input} result={r} />);
    const summary = screen.getByRole("table", { name: "Overzicht van de toetsen" });
    for (const title of ["Buiging van het profiel", "Buiging met normaalkracht", "Dwarskracht in het profiel", "Aangesproken passieve weerstand", "Inheidiepte tegen Blum, vrij opgelegde voet"]) expect(summary).toHaveTextContent(title);
    const compare = screen.getByRole("table", { name: "Verenmodel naast de methode van Blum" });
    expect(compare.querySelectorAll("tbody tr")).toHaveLength(3); expect(compare).toHaveTextContent("Blum, ingeklemde voet");
    expect(screen.getByRole("table", { name: "Gronddrukcoëfficiënten per laag" })).toHaveTextContent("gekromd");
    expect(screen.getByRole("table", { name: "Spanningen per niveau" }).querySelectorAll("tbody tr")).toHaveLength(r.levels.length);
    expect(screen.getByText(/Niet in deze versie: fasering/)).toBeInTheDocument();
    cleanup();
    render(<module.ResultPanel input={input} result={{ ok: false, error: "Geen evenwicht" }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Geen evenwicht");
  });

  it("tekening: doorsnede met gronddruk, anker en drie lijnen; rekenwaarden of representatief; 3D valt terug zonder WebGL", () => {
    const input = wallExample(), r = ok(input);
    const { container } = render(<module.VisualPanel input={input} result={r} />);
    const svg = screen.getByRole("img", { name: /Doorsnede van de damwand/ });
    expect(svg.querySelectorAll(".sw-pressure")).toHaveLength(4); expect(svg.querySelectorAll(".sw-column")).toHaveLength(3); expect(svg.querySelectorAll(".sw-anchor line")).toHaveLength(1);
    expect(svg).toHaveTextContent("q = 10,0 kPa"); expect(svg).toHaveTextContent(`${Math.round(r.uls.anchor!.axialKn)} kN/m`); expect(svg).toHaveTextContent("NAP −9,00");
    fireEvent.change(screen.getByLabelText("Waarden in de tekening"), { target: { value: "sls" } });
    expect(svg).toHaveTextContent(`${Math.round(r.sls.anchor!.axialKn)} kN/m`);
    fireEvent.click(screen.getByRole("tab", { name: "3D" }));
    expect(container.querySelector("svg.sw-section")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("3D is op dit apparaat niet beschikbaar");
    cleanup();
    const posts = revetmentExample("posts");
    render(<module.VisualPanel input={posts} result={ok(posts)} />);
    const drawing = screen.getByRole("img", { name: /Doorsnede/ });
    expect(drawing.querySelectorAll(".sw-board")).toHaveLength(1); expect(drawing.querySelectorAll(".sw-wall-posts")).toHaveLength(1); expect(drawing.querySelectorAll(".sw-anchor")).toHaveLength(0);
    cleanup();
    render(<module.VisualPanel input={input} result={{ ok: false, error: "fout" }} />);
    expect(screen.getByText(/De tekening verschijnt zodra/)).toBeInTheDocument();
  });

  it("uitdraai: een PDF met invoer, formules, figuur, verloop over de hoogte, Blum en de toetsen", () => {
    const input = wallExample(), pdf = module.buildReport!(input, ok(input), ctx), text = new TextDecoder("latin1").decode(pdf);
    expect(text.startsWith("%PDF-")).toBe(true);
    for (const part of ["Grondlagen, beide zijden", "Gronddruk", "Spanningen op de kenmerkende niveaus", "Verenmodel", "Verloop over de hoogte", "Controle met de methode van Blum", "Overzicht van de toetsen", "Buiging van het profiel", "Concept alpha"]) expect(text).toContain(part);
    expect(module.reportFileName!(input)).toBe("damwand-az-18-700");
    const posts = revetmentExample("posts"), revetment = new TextDecoder("latin1").decode(module.buildReport!(posts, ok(posts), ctx));
    for (const part of ["Beschoeiing van palen met schotten", "Palen en schotten", "Buiging van het schot tussen de palen"]) expect(revetment).toContain(part);
    expect(module.reportFileName!(posts)).toBe("beschoeiing-palen-met-schotten"); expect(module.reportFileName!(revetmentExample("plank"))).toBe("beschoeiing-planken");
    expect(() => module.buildReport!(input, { ok: false, error: "fout" }, ctx)).toThrow("fout");
  });
});

describe("geometrie van de tekeningen", () => {
  it("stalen damwand: de contour uit de fabriekstekening met de plankbreedte en wandhoogte uit de bibliotheek", () => {
    const z = findSheetPile("AZ 18-700")!, plan = profilePlan(z, 2.8);
    // Vier planken van 700 mm: vier getekende platen met de sloten erin; de hartlijn loopt van 0 tot 2,8 m tussen ± (420 − 9)/2 mm.
    expect(plan.outlines.filter((o) => o.kind === "plate")).toHaveLength(4); expect(plan.outlines.filter((o) => o.kind === "lock")).toHaveLength(0);
    expect(plan.line[0].a).toBe(0); expect(Math.abs(plan.line[0].x)).toBeCloseTo(0.2055, 9); expect(plan.line[plan.line.length - 1].a).toBeCloseTo(2.8, 12);
    expect(Math.max(...plan.outlines.flatMap((o) => (o.kind === "plate" ? o.points.map((q) => q.x) : [])))).toBeCloseTo(0.21, 3);
    expect(plan.basis).toBe("drawing");
    // Zonder tekening (een profiel van een fabrikant zonder openbare CAD-download) blijft het de schematische vorm met sloten.
    const u = profilePlan(findSheetPile("JFESP-2")!, 1.6);
    expect(u.basis).not.toBe("drawing"); expect(u.outlines.filter((o) => o.kind === "lock").length).toBeGreaterThan(0);
    expect(clipLine(plan.line, 0.35, 1.05).map((q) => +q.x.toFixed(4))).toEqual([expect.any(Number), ...plan.line.filter((q) => q.a > 0.35 && q.a < 1.05).map((q) => +q.x.toFixed(4)), expect.any(Number)]);
    expect(clipLine([{ a: 0, x: 0 }, { a: 2, x: 1 }], 0.5, 1.5)).toEqual([{ a: 0.5, x: 0.25 }, { a: 1.5, x: 0.75 }]);
    const scene = wallScene(wallExample(), ok(wallExample()));
    expect(scene.construction).toBe("sheet-pile"); expect(scene.wallHeightM).toBe(0.42); expect(scene.outlines.length).toBeGreaterThan(8); expect(scene.contourBasis).toBe("drawing"); expect(scene.contourManufacturer).toBe("ArcelorMittal"); expect(scene.wallLine.length).toBeGreaterThan(8); expect(scene.posts).toHaveLength(0);
    expect(scene.anchors.length).toBeGreaterThan(0); expect(scene.support).toMatchObject({ kind: "tie", levelNap: -1, angleDeg: 30 }); expect(scene.slip).toBeNull();
    expect(scene.high.layers.map((l) => l.name)).toEqual(["Zand, matig", "Zand, vast"]); expect(scene.low.layers[0].topNap).toBe(-4);
    expect(wallScene(wallExample(), ok(wallExample()), ok(wallExample()).uls).low.surfaceNap).toBeCloseTo(-4.3, 12);
  });

  it("beschoeiing: vlakke planken naast elkaar, of palen op hun hart-op-hartafstand met schotten en zonder anker", () => {
    // Houten planken met messing en groef (twaalf hoekpunten), een eigen doorsnede als rechte plank.
    expect(plankPlan(0.05, 0.6, true)).toHaveLength(3); expect(plankPlan(0.05, 0.6, true)[0].points).toHaveLength(12); expect(plankPlan(0.05, 0.6, false)[0].points).toHaveLength(4);
    expect(Math.max(...plankPlan(0.05, 0.6, true)[0].points.map((q) => q.x))).toBe(0.025);
    const plank = { ...revetmentExample("plank"), toeNap: -2.5, anchor: { ...revetmentExample("plank").anchor, enabled: true } }, a = wallScene(plank, ok(plank));
    expect(a.construction).toBe("plank"); expect(a.waling).toMatchObject({ levelNap: -0.3 }); expect(a.anchors.length).toBeGreaterThan(0); expect(a.boards).toBeNull();
    const posts = revetmentExample("posts"), b = wallScene(posts, ok(posts));
    expect(b.outlines).toHaveLength(0); expect(b.contourBasis).toBeNull(); expect(b.boards).toEqual({ thicknessM: 0.04, bottomNap: -1.3 }); expect(b.waling).toBeNull(); expect(b.anchors).toHaveLength(0);
    expect(b.posts[1].alongM - b.posts[0].alongM).toBeCloseTo(0.8, 12); expect(b.posts[0]).toMatchObject({ shape: "round", sizeM: 0.16 });
    // Open water aan de lage zijde ligt boven de bodem.
    expect(b.low.waterNap).toBeGreaterThan(b.low.surfaceNap);
  });

  it("schaalverdeling met ronde waarden rond nul", () => {
    expect(niceTicks(-89.7, 12, 2)).toEqual([-100, 0, 100]); expect(niceTicks(0, 9.4, 2)).toEqual([0, 5, 10]); expect(niceTicks(0, 0, 2)).toEqual([0]);
  });
});
