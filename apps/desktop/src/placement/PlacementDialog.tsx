import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCalculationsStore } from "../calc/framework/store";
import type { CalculationInstance } from "../calc/framework/types";
import { OaIcon } from "../components/icons/oaIcon";
import { useExtension } from "../hooks/useExtensions";
import { useCptStore } from "../store/useCptStore";
import { calcCptId, calcSpec } from "./calcGeometry";
import { polylineLength, wallSides } from "./geometry";
import { setPlacement, showIn3D, usePlacementStore } from "./store";
import { hasGeometry, placementKindFor, type FootingPlacement, type PilePlacement, type Placement, type PlacementKind, type RdXY, type WallPlacement } from "./types";
import "./placement.css";

const fmt = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d).replace(".", ",") : "");
const parse = (s: string) => Number(s.replace(",", ".").trim());

/** Getalveld dat pas bij verlaten of Enter doorgeeft, met komma of punt. */
function NumField({ value, onCommit, digits = 2, label, width = 96 }: { value: number; onCommit: (v: number) => void; digits?: number; label: string; width?: number }) {
  const [text, setText] = useState(fmt(value, digits));
  useEffect(() => setText(fmt(value, digits)), [value, digits]);
  const commit = () => { const v = parse(text); if (Number.isFinite(v) && text.trim()) onCommit(v); else setText(fmt(value, digits)); };
  return <input aria-label={label} type="text" inputMode="decimal" value={text} style={{ width }} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); }} />;
}

/** Sonderingen met RD-coördinaten, voor "bij sondering". */
function useCptPoints(): Array<{ id: string; x: number; y: number }> {
  const cpts = useCptStore((s) => s.cpts);
  return [...cpts.values()].filter((c) => c.position && Number.isFinite(c.position.x_rd) && Number.isFinite(c.position.y_rd)).map((c) => ({ id: c.id, x: c.position!.x_rd, y: c.position!.y_rd }));
}

/** Een eerste punt: de sondering van de berekening, anders de eerste sondering met coördinaten. */
function startPoint(calc: CalculationInstance, cpts: Array<{ id: string; x: number; y: number }>): RdXY & { cptId?: string } {
  const own = calcCptId(calc);
  const c = cpts.find((p) => p.id === own) ?? cpts[0];
  return c ? { x: c.x, y: c.y, cptId: c.id } : { x: 155000, y: 463000 };
}

function emptyPlacement(kind: PlacementKind): Placement {
  if (kind === "piles") return { kind: "piles", positions: [] };
  if (kind === "wall") return { kind: "wall", points: [], closed: true, excavation: "inside" };
  return { kind: "footing", x: NaN, y: NaN, angleDeg: 0 };
}

/** Knoppen in de werkbalk van een berekening: plaatsen en tonen in het 3D-model. */
export function PlacementBar({ calc }: { calc: CalculationInstance }) {
  const { t } = useTranslation("placement");
  const [open, setOpen] = useState(false);
  const kind = placementKindFor(calc.moduleId);
  if (!kind) return null;
  const placed = hasGeometry(calc.placement);
  return (
    <div className="placement-bar">
      <button type="button" className="placement-btn" onClick={() => setOpen(true)} title={t("bar.placeHint", "Plaats deze berekening op de kaart en in het 3D-model")}>
        <OaIcon id="geo.coordinate-tag" />{placed ? t("bar.edit", "Plaatsing") : t("bar.place", "Plaatsen")}
      </button>
      <button type="button" className="placement-btn" disabled={!placed} onClick={() => showIn3D(calc.id)} title={placed ? undefined : t("bar.notPlaced", "Plaats de berekening eerst")}>
        <OaIcon id="view.model-3d" />{t("bar.show3d", "Toon in 3D-model")}
      </button>
      {open && <PlacementDialog calc={calc} kind={kind} onClose={() => setOpen(false)} />}
    </div>
  );
}

export function PlacementDialog({ calc, kind, onClose }: { calc: CalculationInstance; kind: PlacementKind; onClose: () => void }) {
  const { t } = useTranslation("placement");
  const cpts = useCptPoints();
  const tekening = useExtension("tekening");
  const placement = calc.placement?.kind === kind ? calc.placement : emptyPlacement(kind);
  const save = (p: Placement) => setPlacement(calc.id, p);
  const draw = (target: "kaart" | "tekening") => {
    usePlacementStore.getState().startDrawing(calc.id, kind);
    onClose();
    window.dispatchEvent(new CustomEvent("ogs:ribbon-switch", { detail: { tab: target } }));
  };
  const spec = calcSpec(calc);
  return (
    <div className="calc-modal-backdrop" onClick={onClose}>
      <div className="calc-modal placement-modal" role="dialog" aria-label={t("dialog.title", "Plaatsing")} onClick={(e) => e.stopPropagation()}>
        <div className="calc-modal-header">
          <h2>{t("dialog.title", "Plaatsing")} · {calc.name}</h2>
          <button className="calc-modal-close" onClick={onClose} aria-label={t("dialog.close", "Sluiten")}><OaIcon id="ui.close" /></button>
        </div>
        <div className="calc-modal-body placement-body">
          <p className="placement-intro">
            {kind === "piles" && t("dialog.introPiles", "Eén of meer palen op RD-coördinaten. Kop en punt komen uit de berekening.")}
            {kind === "wall" && t("dialog.introWall", "Een damwandlijn of een gesloten bouwkuip in RD. Bovenkant, teen, ontgraving en ankers komen uit de berekening.")}
            {kind === "footing" && t("dialog.introFooting", "Middelpunt en richting van de strook of poer. Maten en diepte komen uit de berekening.")}
          </p>
          {!spec && <p className="placement-warn">{t("dialog.incomplete", "De invoer van de berekening is nog niet volledig; het model toont hem pas als kop/bovenkant en punt/teen bekend zijn.")}</p>}
          <div className="placement-draw">
            <span>{kind === "wall" ? t("dialog.drawWall", "Teken de lijn door punten te klikken:") : t("dialog.drawPoints", "Klik de plaats aan:")}</span>
            <button type="button" onClick={() => draw("kaart")}>{t("dialog.onMap", "Op de kaart")}</button>
            {tekening && <button type="button" onClick={() => draw("tekening")}>{t("dialog.onDrawing", "Op de situatietekening")}</button>}
          </div>
          {placement.kind === "piles" && <PileEditor calc={calc} p={placement} cpts={cpts} save={save} />}
          {placement.kind === "wall" && <WallEditor calc={calc} p={placement} cpts={cpts} save={save} />}
          {placement.kind === "footing" && <FootingEditor calc={calc} p={placement} cpts={cpts} save={save} lengthFixed={spec?.kind === "footing" && spec.footing.lengthM !== null} />}
        </div>
        <div className="calc-modal-footer">
          <button type="button" disabled={!calc.placement} onClick={() => setPlacement(calc.id, undefined)}>{t("dialog.clear", "Plaatsing wissen")}</button>
          <button type="button" disabled={!hasGeometry(calc.placement)} onClick={() => { onClose(); showIn3D(calc.id); }}>{t("bar.show3d", "Toon in 3D-model")}</button>
          <button type="button" className="primary" onClick={onClose}>{t("dialog.done", "Klaar")}</button>
        </div>
      </div>
    </div>
  );
}

type Cpts = Array<{ id: string; x: number; y: number }>;

function CptPick({ cpts, onPick, label }: { cpts: Cpts; onPick: (c: { id: string; x: number; y: number }) => void; label: string }) {
  const { t } = useTranslation("placement");
  if (!cpts.length) return null;
  return (
    <select aria-label={label} value="" onChange={(e) => { const c = cpts.find((x) => x.id === e.target.value); if (c) onPick(c); }}>
      <option value="">{label}</option>
      {cpts.map((c) => <option key={c.id} value={c.id}>{t("dialog.atCpt", "bij {{id}}", { id: c.id })}</option>)}
    </select>
  );
}

function PileEditor({ calc, p, cpts, save }: { calc: CalculationInstance; p: PilePlacement; cpts: Cpts; save: (p: Placement) => void }) {
  const { t } = useTranslation("placement");
  const nextId = () => { let k = p.positions.length + 1; while (p.positions.some((x) => x.id === `P${k}`)) k++; return `P${k}`; };
  const set = (positions: PilePlacement["positions"]) => save({ kind: "piles", positions });
  return (
    <div className="placement-section">
      <table className="placement-table">
        <thead><tr><th>{t("table.pile", "Paal")}</th><th>RD x [m]</th><th>RD y [m]</th><th>{t("table.cpt", "Sondering")}</th><th /></tr></thead>
        <tbody>
          {p.positions.map((q, k) => (
            <tr key={q.id}>
              <td><input aria-label={t("table.pile", "Paal")} value={q.label ?? q.id} style={{ width: 64 }} onChange={(e) => set(p.positions.map((x, j) => (j === k ? { ...x, label: e.target.value } : x)))} /></td>
              <td><NumField label="RD x" value={q.x} onCommit={(v) => set(p.positions.map((x, j) => (j === k ? { ...x, x: v, cptId: undefined } : x)))} /></td>
              <td><NumField label="RD y" value={q.y} onCommit={(v) => set(p.positions.map((x, j) => (j === k ? { ...x, y: v, cptId: undefined } : x)))} /></td>
              <td>{q.cptId ?? "–"}</td>
              <td><button type="button" className="placement-icon" aria-label={t("table.remove", "Verwijderen")} onClick={() => set(p.positions.filter((_, j) => j !== k))}><OaIcon id="ui.close" /></button></td>
            </tr>
          ))}
          {!p.positions.length && <tr><td colSpan={5} className="placement-muted">{t("table.noPiles", "Nog geen palen geplaatst.")}</td></tr>}
        </tbody>
      </table>
      <div className="placement-actions">
        <button type="button" onClick={() => { const s = startPoint(calc, cpts); set([...p.positions, { id: nextId(), x: s.x, y: s.y }]); }}>{t("table.addCoord", "+ Coördinaat")}</button>
        <CptPick cpts={cpts} label={t("table.addAtCpt", "+ Bij sondering…")} onPick={(c) => set([...p.positions, { id: nextId(), x: c.x, y: c.y, cptId: c.id }])} />
      </div>
    </div>
  );
}

function WallEditor({ calc, p, cpts, save }: { calc: CalculationInstance; p: WallPlacement; cpts: Cpts; save: (p: Placement) => void }) {
  const { t } = useTranslation("placement");
  const docId = useCptStore((s) => s.activeDocId);
  const others = (useCalculationsStore((s) => (docId ? s.byDoc.get(docId) : undefined)) ?? []).filter((c) => c.moduleId === "sheet-pile-wall" && c.id !== calc.id);
  const set = (patch: Partial<WallPlacement>) => {
    const next = { ...p, ...patch };
    if (next.closed && next.points.length < 3) next.closed = false;
    // De kant van de ontgraving hoort bij de vorm: binnen/buiten bij een kuip, links/rechts bij een lijn.
    if (next.closed && (next.excavation === "left" || next.excavation === "right")) next.excavation = "inside";
    if (!next.closed && (next.excavation === "inside" || next.excavation === "outside")) next.excavation = "right";
    save(next);
  };
  const sides = wallSides(p);
  return (
    <div className="placement-section">
      <div className="placement-row">
        <label><input type="checkbox" checked={p.closed} disabled={p.points.length < 3} onChange={(e) => set({ closed: e.target.checked })} /> {t("wall.closed", "Gesloten bouwkuip")}</label>
        <label>{t("wall.side", "Ontgraving")}{" "}
          <select value={p.excavation} onChange={(e) => set({ excavation: e.target.value as WallPlacement["excavation"] })}>
            {p.closed
              ? <><option value="inside">{t("wall.inside", "binnen de kuip")}</option><option value="outside">{t("wall.outside", "buiten de kuip")}</option></>
              : <><option value="left">{t("wall.left", "links van de lijn")}</option><option value="right">{t("wall.right", "rechts van de lijn")}</option></>}
          </select>
        </label>
        {p.points.length >= 2 && <span className="placement-muted">{p.closed ? t("wall.perimeter", "omtrek") : t("wall.length", "lengte")} {fmt(polylineLength(p.points, p.closed), 1)} m</span>}
      </div>
      <table className="placement-table">
        <thead><tr><th>{t("table.point", "Punt")}</th><th>RD x [m]</th><th>RD y [m]</th><th /></tr></thead>
        <tbody>
          {p.points.map((q, k) => (
            <tr key={k}>
              <td>{k + 1}</td>
              <td><NumField label="RD x" value={q.x} onCommit={(v) => set({ points: p.points.map((x, j) => (j === k ? { ...x, x: v } : x)) })} /></td>
              <td><NumField label="RD y" value={q.y} onCommit={(v) => set({ points: p.points.map((x, j) => (j === k ? { ...x, y: v } : x)) })} /></td>
              <td><button type="button" className="placement-icon" aria-label={t("table.remove", "Verwijderen")} onClick={() => set({ points: p.points.filter((_, j) => j !== k), sideCalcIds: undefined })}><OaIcon id="ui.close" /></button></td>
            </tr>
          ))}
          {!p.points.length && <tr><td colSpan={4} className="placement-muted">{t("table.noPoints", "Nog geen punten. Teken de lijn of voeg punten toe.")}</td></tr>}
        </tbody>
      </table>
      <div className="placement-actions">
        <button type="button" onClick={() => { const last = p.points[p.points.length - 1]; const s = last ? { x: last.x + 10, y: last.y } : startPoint(calc, cpts); set({ points: [...p.points, { x: s.x, y: s.y }] }); }}>{t("table.addPoint", "+ Punt")}</button>
        <CptPick cpts={cpts} label={t("table.addAtCpt", "+ Bij sondering…")} onPick={(c) => set({ points: [...p.points, { x: c.x, y: c.y }] })} />
      </div>
      {sides.length > 0 && (
        <>
          <h3 className="placement-sub">{t("wall.perSide", "Berekening per zijde")}</h3>
          <table className="placement-table">
            <thead><tr><th>{t("wall.sideCol", "Zijde")}</th><th>{t("wall.lengthCol", "Lengte")}</th><th>{t("wall.calcCol", "Berekening")}</th></tr></thead>
            <tbody>
              {sides.map((s) => (
                <tr key={s.index}>
                  <td>{s.index + 1}–{(s.index + 1) % p.points.length + 1}</td>
                  <td>{fmt(s.length, 1)} m</td>
                  <td>
                    <select value={p.sideCalcIds?.[s.index] ?? ""} onChange={(e) => {
                      const ids = Array.from({ length: p.points.length }, (_, k) => p.sideCalcIds?.[k] ?? null);
                      ids[s.index] = e.target.value || null;
                      set({ sideCalcIds: ids.some((x) => x) ? ids : undefined });
                    }}>
                      <option value="">{t("wall.thisCalc", "deze berekening")}</option>
                      {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function FootingEditor({ calc, p, cpts, save, lengthFixed }: { calc: CalculationInstance; p: FootingPlacement; cpts: Cpts; save: (p: Placement) => void; lengthFixed: boolean }) {
  const { t } = useTranslation("placement");
  const has = Number.isFinite(p.x) && Number.isFinite(p.y);
  const set = (patch: Partial<FootingPlacement>) => {
    const base = has ? p : { ...p, ...startPoint(calc, cpts) };
    const next: FootingPlacement = { kind: "footing", x: base.x, y: base.y, angleDeg: base.angleDeg, ...(base.lengthM ? { lengthM: base.lengthM } : {}), ...patch };
    save(next);
  };
  return (
    <div className="placement-section">
      <table className="placement-table">
        <tbody>
          <tr><th>RD x [m]</th><td><NumField label="RD x" value={p.x} onCommit={(v) => set({ x: v })} /></td></tr>
          <tr><th>RD y [m]</th><td><NumField label="RD y" value={p.y} onCommit={(v) => set({ y: v })} /></td></tr>
          <tr><th>{t("footing.angle", "Draaiing lengteas [°]")}</th><td><NumField label="angle" digits={1} value={p.angleDeg} onCommit={(v) => set({ angleDeg: v })} /> <span className="placement-muted">{t("footing.angleHint", "t.o.v. RD-x, tegen de klok in")}</span></td></tr>
          {!lengthFixed && <tr><th>{t("footing.length", "Lengte strook [m]")}</th><td><NumField label="length" value={p.lengthM ?? 10} onCommit={(v) => set({ lengthM: v > 0 ? v : undefined })} /></td></tr>}
        </tbody>
      </table>
      <div className="placement-actions">
        <CptPick cpts={cpts} label={t("table.atCpt", "Bij sondering…")} onPick={(c) => set({ x: c.x, y: c.y })} />
      </div>
    </div>
  );
}
