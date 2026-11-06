import { useMemo, useState } from "react";
import { useCalculationsStore } from "../store";
import { useCptStore } from "../../../store/useCptStore";
import { getCalcModule } from "../registry";
import type { CalculationInstance } from "../types";


interface Props {
  onAddClick: () => void;
}

/** Library-tree per actief project — lijst van calc-instances. */
// Stabiele referentie voor de empty-array fallback — als we `?? []`
// binnen een zustand-selector returnen, krijgt zustand elke render een
// nieuwe array-referentie en triggert dat een infinite re-render loop.
const EMPTY_LIST: readonly never[] = [];

export function ProjectTreePanel({ onAddClick }: Props) {
  const activeDocId = useCptStore((s) => s.activeDocId);
  const activeCalcId = useCalculationsStore((s) => s.activeCalcId);
  // Subscribe naar byDoc als geheel (stabiele Map-referentie), derive
  // de lijst via useMemo. Voorheen: nieuwe `[]` op elke selector-call
  // → zustand re-render loop.
  const byDoc = useCalculationsStore((s) => s.byDoc);
  const list = useMemo(
    () => (activeDocId ? byDoc.get(activeDocId) ?? EMPTY_LIST : EMPTY_LIST),
    [activeDocId, byDoc],
  ) as CalculationInstance[];
  const visibleList = list.filter((calculation) => getCalcModule(calculation.moduleId));
  const navigate = useCalculationsStore((s) => s.navigate);
  const nav = useCalculationsStore((s) => s.sheetNav);
  const cpts = useCptStore((s) => s.cpts);
  const activeCptId = useCptStore((s) => s.activeCptId);
  const projectMeta = useCptStore((s) => s.projectMeta);
  const remove = useCalculationsStore((s) => s.removeCalculation);
  const duplicate = useCalculationsStore((s) => s.duplicate);
  const update = useCalculationsStore((s) => s.updateCalculation);

  const [renaming, setRenaming] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  if (!activeDocId) {
    return (
      <div className="calc-tree-empty">
        <p>Open een project om berekeningen toe te voegen.</p>
      </div>
    );
  }

  // Group per category
  const grouped = visibleList.reduce<Record<string, CalculationInstance[]>>((acc, c) => {
    const mod = getCalcModule(c.moduleId);
    const cat = mod?.category ?? "other";
    (acc[cat] = acc[cat] ?? []).push(c);
    return acc;
  }, {});

  const categoryNames: Record<string, string> = {
    pile: "Palen",
    spread: "Funderingen",
    wall: "Wanden",
    anchor: "Ankers",
    other: "Overig",
  };

  return (
    <div className="calc-tree">
      <button className="calc-tree-add" onClick={onAddClick}>
        + Nieuwe berekening
      </button>

      {visibleList.length === 0 && (
        <p className="calc-tree-empty-hint">
          Nog geen berekeningen. Klik op "+" om er een toe te voegen.
        </p>
      )}

      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat} className="calc-tree-group">
          <div className="calc-tree-group-title">{categoryNames[cat] ?? cat}</div>
          <ul>
            {items.map((c) => {
              const mod = getCalcModule(c.moduleId);
              const isActive = c.id === activeCalcId;
              const isRenaming = renaming === c.id;
              return (
                <li key={c.id} className={isActive ? "active" : ""}>
                  {isRenaming ? (
                    <input
                      autoFocus
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      onBlur={() => {
                        if (draftName.trim()) {
                          update(activeDocId, c.id, { name: draftName.trim() });
                        }
                        setRenaming(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        if (e.key === "Escape") setRenaming(null);
                      }}
                    />
                  ) : (
                    <button
                      className="calc-tree-item"
                      onClick={() => navigate(c.id, mod?.table ? "table" : "sheet")}
                      onDoubleClick={() => {
                        setRenaming(c.id);
                        setDraftName(c.name);
                      }}
                      title={`${mod?.name ?? c.moduleId} — ${c.updatedAt}`}
                    >
                      <span className="calc-tree-item-name">{c.name}</span>
                      {mod?.status === "coming-soon" && (
                        <span className="calc-tree-badge">🔜</span>
                      )}
                    </button>
                  )}
                  <div className="calc-tree-actions">
                    <button
                      onClick={() => duplicate(activeDocId, c.id)}
                      title="Dupliceren"
                    >
                      ⎘
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Verwijder "${c.name}"?`)) {
                          remove(activeDocId, c.id);
                        }
                      }}
                      title="Verwijderen"
                    >
                      ×
                    </button>
                  </div>
                  {isActive && mod?.table && (() => {
                    const table = mod.table, items = table.items(c.input, { cpts, activeCptId, projectMeta });
                    const here = nav.calcId === c.id ? nav : { view: "sheet", cptId: null };
                    const node = (label: string, current: boolean, go: () => void, depth = 0) => (
                      <li key={label} className={`calc-tree-child depth-${depth}${current ? " current" : ""}`}>
                        <button type="button" onClick={go} aria-current={current ? "page" : undefined}>{label}</button>
                      </li>
                    );
                    return (
                      <ul className="calc-tree-children" aria-label={`Onderdelen van ${c.name}`}>
                        {node(table.label, here.view === "table" && !here.cptId, () => navigate(c.id, "table"))}
                        {items.map((it) => node(it.label, here.view === "table" && here.cptId === it.id, () => navigate(c.id, "table", it.id), 1))}
                        {node("Rekenblad", here.view !== "table" && here.view !== "settings", () => navigate(c.id, "sheet"))}
                        {node("Instellingen", here.view === "settings", () => navigate(c.id, "settings"))}
                      </ul>
                    );
                  })()}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
