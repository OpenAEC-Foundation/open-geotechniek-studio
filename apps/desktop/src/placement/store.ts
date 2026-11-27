// Weergave en bediening van de plaatsingen: lagen aan/uit in 3D, tekenen op de kaart en "Toon in 3D-model".
// De plaatsingen zelf staan bij de berekening (CalculationInstance.placement) en gaan mee met het project.
import { create } from "zustand";
import { useCalculationsStore } from "../calc/framework/store";
import { getCalcModule } from "../calc/framework/registry";
import type { CalculationInstance, ProjectContext } from "../calc/framework/types";
import { useCptStore } from "../store/useCptStore";
import type { Placement, PlacementKind, RdXY } from "./types";

export interface PlacementLayers { piles: boolean; walls: boolean; pit: boolean; anchors: boolean; footings: boolean }
export type PlacementLayer = keyof PlacementLayers;

/** Tekenen op de kaart of de situatietekening: punten verzamelen tot "Klaar". */
export interface Drawing { calcId: string; kind: PlacementKind; points: RdXY[] }

interface PlacementState {
  layers: PlacementLayers;
  toggleLayer: (key: PlacementLayer) => void;
  drawing: Drawing | null;
  startDrawing: (calcId: string, kind: PlacementKind) => void;
  addPoint: (p: RdXY) => void;
  undoPoint: () => void;
  cancelDrawing: () => void;
  /** Verzoek aan de 3D-weergave om een berekening te selecteren. */
  focus: { calcId: string; seq: number } | null;
  requestFocus: (calcId: string) => void;
  clearFocus: () => void;
}

export const usePlacementStore = create<PlacementState>((set) => ({
  layers: { piles: true, walls: true, pit: true, anchors: true, footings: true },
  toggleLayer: (key) => set((s) => ({ layers: { ...s.layers, [key]: !s.layers[key] } })),
  drawing: null,
  startDrawing: (calcId, kind) => set({ drawing: { calcId, kind, points: [] } }),
  addPoint: (p) => set((s) => (s.drawing ? { drawing: { ...s.drawing, points: [...s.drawing.points, p] } } : s)),
  undoPoint: () => set((s) => (s.drawing ? { drawing: { ...s.drawing, points: s.drawing.points.slice(0, -1) } } : s)),
  cancelDrawing: () => set({ drawing: null }),
  focus: null,
  requestFocus: (calcId) => set((s) => ({ focus: { calcId, seq: (s.focus?.seq ?? 0) + 1 } })),
  clearFocus: () => set({ focus: null }),
}));

/** Berekeningen van het actieve project. */
export function activeCalcs(): { docId: string | null; calcs: CalculationInstance[] } {
  const docId = useCptStore.getState().activeDocId;
  return { docId, calcs: (docId ? useCalculationsStore.getState().byDoc.get(docId) : undefined) ?? [] };
}

/** Zet (of wist, met undefined) de plaatsing van een berekening in het actieve project. */
export function setPlacement(calcId: string, placement: Placement | undefined) {
  const { docId } = activeCalcs();
  if (!docId) return;
  useCalculationsStore.getState().updateCalculation(docId, calcId, { placement });
}

/** Open een berekening: het tabblad Berekeningen met deze berekening actief. */
export function openCalculation(calcId: string) {
  useCalculationsStore.getState().navigate(calcId, "sheet");
  window.dispatchEvent(new CustomEvent("ogs:ribbon-switch", { detail: { tab: "berekeningen" } }));
}

/** Naar het 3D-model, met deze berekening geselecteerd. */
export function showIn3D(calcId: string) {
  usePlacementStore.getState().requestFocus(calcId);
  window.dispatchEvent(new CustomEvent("ogs:ribbon-switch", { detail: { tab: "model3d" } }));
}

export type CalcStatus = "ok" | "fail" | "pending";
const statusCache = new Map<string, { key: string; status: CalcStatus; text: string }>();

/** Uitkomst van de berekening (u.c. voldoet of niet), onthouden zolang de berekening niet wijzigt. */
export function calcStatus(calc: CalculationInstance, ctx: ProjectContext): { status: CalcStatus; text: string } {
  const key = `${calc.updatedAt}|${ctx.cpts.size}`;
  const hit = statusCache.get(calc.id);
  if (hit && hit.key === key) return hit;
  let out: { status: CalcStatus; text: string } = { status: "pending", text: "" };
  try {
    const mod = getCalcModule(calc.moduleId);
    const line = mod?.statusLine?.(mod.compute(calc.input, ctx));
    if (line) out = { status: line.pending ? "pending" : line.ok ? "ok" : "fail", text: line.text };
  } catch { /* rekenfout: geen status */ }
  statusCache.set(calc.id, { key, ...out });
  return out;
}

/** Projectcontext zoals de rekenmodules hem krijgen. */
export function projectContext(calcs: CalculationInstance[]): ProjectContext {
  const s = useCptStore.getState();
  return { cpts: s.cpts, activeCptId: s.activeCptId, projectMeta: s.projectMeta, calculations: calcs };
}

/** Vaste kleur per berekening, uit een rustig palet (zelfde berekening, zelfde kleur, in 3D en op de kaart). */
const PALETTE = ["#2563eb", "#9333ea", "#0891b2", "#c2410c", "#4d7c0f", "#be185d", "#0f766e", "#7c3aed", "#b45309", "#1d4ed8"];
export function calcColor(calcId: string): string {
  let h = 0;
  for (let k = 0; k < calcId.length; k++) h = (h * 31 + calcId.charCodeAt(k)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
export const STATUS_COLOR: Record<CalcStatus, string> = { ok: "#16a34a", fail: "#dc2626", pending: "#9ca3af" };
