// Indeling van de vensters in de tab 3D-model: vensters naast elkaar, elk met tabbladen (views). Pure functies, zodat
// de indeling voorspelbaar en testbaar is; de store bewaart alleen het resultaat.
import type { ViewId } from "./useSoil3DStore";

export interface ViewTab { id: string; view: ViewId }
export interface Pane { id: string; tabs: ViewTab[]; active: string }
export interface Layout { panes: Pane[]; /** Relatieve breedte per venster, som 1. */ sizes: number[]; focus: string }

let counter = 0;
const nextId = (prefix: string) => `${prefix}${++counter}-${Date.now().toString(36)}`;

export function defaultLayout(): Layout {
  const a = { id: nextId("t"), view: "model" as ViewId }, b = { id: nextId("t"), view: "section" as ViewId };
  const p1 = { id: nextId("p"), tabs: [a], active: a.id }, p2 = { id: nextId("p"), tabs: [b], active: b.id };
  return { panes: [p1, p2], sizes: [0.5, 0.5], focus: p1.id };
}

const even = (n: number) => Array.from({ length: n }, () => 1 / n);
const normal = (sizes: number[]) => { const s = sizes.reduce((a, b) => a + b, 0) || 1; return sizes.map((v) => v / s); };

/** Opent een view als nieuw tabblad in het gegeven (of het actieve) venster. */
export function openView(l: Layout, view: ViewId, paneId?: string): Layout {
  const tab = { id: nextId("t"), view };
  if (!l.panes.length) { const p = { id: nextId("p"), tabs: [tab], active: tab.id }; return { panes: [p], sizes: [1], focus: p.id }; }
  const target = paneId ?? l.focus;
  const panes = l.panes.map((p) => (p.id === target ? { ...p, tabs: [...p.tabs, tab], active: tab.id } : p));
  return { ...l, panes, focus: panes.some((p) => p.id === target) ? target : panes[0].id };
}

/** Sluit een tabblad; een venster zonder tabbladen verdwijnt en geeft zijn breedte aan de buren. */
export function closeTab(l: Layout, paneId: string, tabId: string): Layout {
  const i = l.panes.findIndex((p) => p.id === paneId);
  if (i < 0) return l;
  const pane = l.panes[i], at = pane.tabs.findIndex((t) => t.id === tabId);
  if (at < 0) return l;
  const tabs = pane.tabs.filter((t) => t.id !== tabId);
  if (tabs.length) {
    const active = pane.active === tabId ? tabs[Math.min(at, tabs.length - 1)].id : pane.active;
    return { ...l, panes: l.panes.map((p) => (p.id === paneId ? { ...p, tabs, active } : p)) };
  }
  const panes = l.panes.filter((p) => p.id !== paneId);
  const sizes = normal(l.sizes.filter((_, k) => k !== i));
  return { panes, sizes, focus: panes.some((p) => p.id === l.focus) ? l.focus : panes[Math.max(0, i - 1)]?.id ?? "" };
}

export function activate(l: Layout, paneId: string, tabId: string): Layout {
  return { ...l, focus: paneId, panes: l.panes.map((p) => (p.id === paneId ? { ...p, active: tabId } : p)) };
}

/**
 * Verplaatst een tabblad naar een ander venster, of naar een nieuw venster naast `toPane` (`side`). Een leeg
 * achtergelaten venster verdwijnt.
 */
export function moveTab(l: Layout, tabId: string, toPane: string, side?: "left" | "right"): Layout {
  const from = l.panes.find((p) => p.tabs.some((t) => t.id === tabId));
  if (!from) return l;
  const tab = from.tabs.find((t) => t.id === tabId)!;
  if (!side && from.id === toPane) return activate(l, toPane, tabId);
  if (side && from.id === toPane && from.tabs.length === 1) return l; // alleen-tabblad naast zichzelf: niets te doen
  // Eerst weghalen (zonder het venster al te laten verdwijnen), dan plaatsen, dan lege vensters opruimen.
  let panes = l.panes.map((p) => (p.id === from.id ? { ...p, tabs: p.tabs.filter((t) => t.id !== tabId), active: p.active === tabId ? (p.tabs.find((t) => t.id !== tabId)?.id ?? "") : p.active } : p));
  let sizes = [...l.sizes];
  let focus = toPane;
  if (side) {
    const k = panes.findIndex((p) => p.id === toPane);
    const pane = { id: nextId("p"), tabs: [tab], active: tab.id };
    const at = side === "right" ? k + 1 : k;
    const half = sizes[k] / 2;
    sizes[k] = half;
    panes = [...panes.slice(0, at), pane, ...panes.slice(at)];
    sizes = [...sizes.slice(0, at), half, ...sizes.slice(at)];
    focus = pane.id;
  } else {
    panes = panes.map((p) => (p.id === toPane ? { ...p, tabs: [...p.tabs, tab], active: tab.id } : p));
  }
  const keep = panes.map((p, k) => [p, sizes[k]] as const).filter(([p]) => p.tabs.length);
  return { panes: keep.map(([p]) => p), sizes: normal(keep.map(([, s]) => s)), focus };
}

/** Zet het actieve tabblad van een venster in een nieuw venster rechts ervan (of opent een kopie als het het enige is). */
export function splitRight(l: Layout, paneId: string): Layout {
  const pane = l.panes.find((p) => p.id === paneId);
  if (!pane) return l;
  const active = pane.tabs.find((t) => t.id === pane.active) ?? pane.tabs[0];
  if (!active) return l;
  if (pane.tabs.length > 1) return moveTab(l, active.id, paneId, "right");
  const k = l.panes.indexOf(pane);
  const tab = { id: nextId("t"), view: active.view };
  const fresh = { id: nextId("p"), tabs: [tab], active: tab.id };
  const panes = [...l.panes.slice(0, k + 1), fresh, ...l.panes.slice(k + 1)];
  const sizes = [...l.sizes]; const half = sizes[k] / 2; sizes[k] = half; sizes.splice(k + 1, 0, half);
  return { panes, sizes, focus: fresh.id };
}

/** Versleept de scheiding tussen venster `k` en `k + 1` met `delta` (fractie van de totale breedte). */
export function resize(l: Layout, k: number, delta: number, min = 0.12): Layout {
  if (k < 0 || k >= l.sizes.length - 1) return l;
  const sizes = [...l.sizes];
  const pair = sizes[k] + sizes[k + 1];
  const left = Math.min(pair - min, Math.max(min, sizes[k] + delta));
  sizes[k] = left; sizes[k + 1] = pair - left;
  return { ...l, sizes };
}

export const evenSizes = even;
