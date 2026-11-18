import { describe, expect, it } from "vitest";
import { activate, closeTab, defaultLayout, moveTab, openView, resize, splitRight } from "./layout";

const views = (l: ReturnType<typeof defaultLayout>) => l.panes.map((p) => p.tabs.map((t) => t.view + (t.id === p.active ? "*" : "")));

describe("vensters met tabbladen", () => {
  it("begint met 3D-model en sectiebox naast elkaar", () => {
    const l = defaultLayout();
    expect(views(l)).toEqual([["model*"], ["section*"]]);
    expect(l.sizes).toEqual([0.5, 0.5]);
  });

  it("opent een view als actief tabblad in het venster met focus", () => {
    const l0 = defaultLayout();
    const l = openView(l0, "section", l0.panes[0].id);
    expect(views(l)).toEqual([["model", "section*"], ["section*"]]);
  });

  it("sluit een tabblad; een leeg venster verdwijnt en de breedte gaat naar de rest", () => {
    let l = defaultLayout();
    const right = l.panes[1];
    l = closeTab(l, right.id, right.tabs[0].id);
    expect(views(l)).toEqual([["model*"]]);
    expect(l.sizes).toEqual([1]);
    l = closeTab(l, l.panes[0].id, l.panes[0].tabs[0].id);
    expect(l.panes).toHaveLength(0);
    l = openView(l, "model");
    expect(views(l)).toEqual([["model*"]]);
  });

  it("kiest bij sluiten van het actieve tabblad de buur als actief", () => {
    let l = defaultLayout();
    const p = l.panes[0];
    l = openView(l, "section", p.id);
    l = openView(l, "model", p.id);
    const tabs = l.panes[0].tabs;
    l = activate(l, p.id, tabs[1].id);
    l = closeTab(l, p.id, tabs[1].id);
    expect(l.panes[0].active).toBe(tabs[2].id);
  });

  it("sleept een tabblad naar een ander venster of naar een nieuw venster ernaast", () => {
    let l = defaultLayout();
    const [left, right] = l.panes;
    l = moveTab(l, right.tabs[0].id, left.id);
    expect(views(l)).toEqual([["model", "section*"]]);
    l = moveTab(l, l.panes[0].tabs[1].id, l.panes[0].id, "right");
    expect(views(l)).toEqual([["model*"], ["section*"]]);
    expect(l.sizes[0] + l.sizes[1]).toBeCloseTo(1, 9);
    expect(l.focus).toBe(l.panes[1].id);
  });

  it("zet het actieve tabblad naast zich, of maakt een kopie als het het enige is", () => {
    let l = defaultLayout();
    l = splitRight(l, l.panes[0].id);
    expect(views(l)).toEqual([["model*"], ["model*"], ["section*"]]);
    expect(l.sizes).toEqual([0.25, 0.25, 0.5]);
  });

  it("verschuift de scheiding binnen grenzen", () => {
    const l = resize(defaultLayout(), 0, 0.2);
    expect(l.sizes[0]).toBeCloseTo(0.7, 9);
    expect(resize(defaultLayout(), 0, 0.9).sizes[1]).toBeCloseTo(0.12, 9);
  });
});
