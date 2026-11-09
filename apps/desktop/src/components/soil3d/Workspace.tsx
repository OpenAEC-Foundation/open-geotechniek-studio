import { useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useSoil3DStore, VIEWS, type ViewId } from "./useSoil3DStore";
import { activate, closeTab, moveTab, openView, resize, splitRight, type Pane } from "./layout";
import { OaIcon } from "../icons/oaIcon";

/**
 * Vensters naast elkaar, elk met tabbladen. Een tabblad sluit met het kruisje, een nieuw tabblad komt via +, ⫽ zet het
 * actieve tabblad in een nieuw venster rechts. Tabbladen sleep je naar een ander venster, of naar de linker- of
 * rechterrand voor een nieuw venster. De scheiding tussen vensters is versleepbaar.
 */
export function Workspace({ render }: { render: (view: ViewId, tabId: string, visible: boolean) => ReactNode }) {
  const { t } = useTranslation("ribbon");
  const layout = useSoil3DStore((s) => s.layout);
  const update = useSoil3DStore((s) => s.updateLayout);
  const [dragTab, setDragTab] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const label: Record<ViewId, string> = { model: t("model3d.viewModel", "3D-model"), section: t("model3d.viewSection", "Sectiebox") };

  const startResize = (k: number, e: React.PointerEvent) => {
    const row = rowRef.current;
    if (!row) return;
    const width = row.getBoundingClientRect().width;
    let last = e.clientX;
    const move = (ev: PointerEvent) => { const d = (ev.clientX - last) / width; last = ev.clientX; update((l) => resize(l, k, d)); };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); document.body.style.cursor = ""; };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    document.body.style.cursor = "col-resize";
  };

  if (!layout.panes.length) {
    return (
      <div className="soil3d-noviews">
        <p>{t("model3d.noViews", "Geen vensters open.")}</p>
        {VIEWS.map((v) => <button key={v} type="button" className="soil3d-open" onClick={() => update((l) => openView(l, v))}>{label[v]}</button>)}
      </div>
    );
  }

  // Meerdere tabbladen van hetzelfde soort krijgen een volgnummer: "3D-model", "3D-model 2", …
  const tabTitle = (id: string, view: ViewId) => {
    const same = layout.panes.flatMap((p) => p.tabs).filter((x) => x.view === view);
    const n = same.findIndex((x) => x.id === id) + 1;
    return same.length > 1 && n > 1 ? `${label[view]} ${n}` : label[view];
  };

  const paneView = (pane: Pane) => (
    <section className={`soil3d-pane${layout.focus === pane.id ? " focus" : ""}`} aria-label={label[pane.tabs.find((x) => x.id === pane.active)?.view ?? "model"]}
      onPointerDownCapture={() => { if (layout.focus !== pane.id) update((l) => ({ ...l, focus: pane.id })); }}>
      <div className="soil3d-tabs" role="tablist"
        onDragOver={(e) => { if (dragTab) e.preventDefault(); }}
        onDrop={(e) => { e.preventDefault(); if (dragTab) update((l) => moveTab(l, dragTab, pane.id)); setDragTab(null); }}>
        <div className="soil3d-tablist">
        {pane.tabs.map((tab) => (
          <div key={tab.id} role="tab" title={tabTitle(tab.id, tab.view)} aria-selected={tab.id === pane.active} draggable
            className={`soil3d-tab${tab.id === pane.active ? " on" : ""}${dragTab === tab.id ? " dragging" : ""}`}
            onClick={() => update((l) => activate(l, pane.id, tab.id))}
            onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", tab.id); setDragTab(tab.id); }}
            onDragEnd={() => setDragTab(null)}
            onAuxClick={(e) => { if (e.button === 1) update((l) => closeTab(l, pane.id, tab.id)); }}>
            <span>{tabTitle(tab.id, tab.view)}</span>
            <button type="button" className="soil3d-tab-close" aria-label={t("model3d.closeTab", "Sluiten")} title={t("model3d.closeTab", "Sluiten")}
              onClick={(e) => { e.stopPropagation(); update((l) => closeTab(l, pane.id, tab.id)); }}><OaIcon id="ui.close" /></button>
          </div>
        ))}
        </div>
        <div className="soil3d-tab-tools">
          <button type="button" className="soil3d-tab-action" title={t("model3d.newTab", "Nieuw tabblad")}
            onClick={() => update((l) => openView(l, pane.tabs.find((x) => x.id === pane.active)?.view ?? "model", pane.id))}><OaIcon id="workspace.tab-new" /></button>
          <div className="soil3d-menu-anchor">
            <button type="button" className="soil3d-tab-action soil3d-tab-more" title={t("model3d.chooseView", "Ander soort tabblad")} aria-haspopup="menu" aria-expanded={menuFor === pane.id}
              onClick={() => setMenuFor(menuFor === pane.id ? null : pane.id)}><OaIcon id="ui.dropdown" /></button>
            {menuFor === pane.id && (
              <div className="soil3d-menu" role="menu" onMouseLeave={() => setMenuFor(null)}>
                {VIEWS.map((v) => (
                  <button key={v} type="button" role="menuitem" onClick={() => { update((l) => openView(l, v, pane.id)); setMenuFor(null); }}>{label[v]}</button>
                ))}
              </div>
            )}
          </div>
          <button type="button" className="soil3d-tab-action" title={t("model3d.splitRight", "Naast elkaar: actief tabblad in een nieuw venster rechts")} onClick={() => update((l) => splitRight(l, pane.id))}><OaIcon id="workspace.split-right" /></button>
        </div>
      </div>
      <div className="soil3d-pane-body">
        {pane.tabs.map((tab) => (
          <div key={tab.id} className="soil3d-pane-view" style={{ display: tab.id === pane.active ? "flex" : "none" }}>
            {render(tab.view, tab.id, tab.id === pane.active)}
          </div>
        ))}
        {dragTab && (
          <>
            <div className="soil3d-dropzone left" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); update((l) => moveTab(l, dragTab, pane.id, "left")); setDragTab(null); }}><span>{t("model3d.dropLeft", "Nieuw venster links")}</span></div>
            <div className="soil3d-dropzone center" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); update((l) => moveTab(l, dragTab, pane.id)); setDragTab(null); }}><span>{t("model3d.dropHere", "In dit venster")}</span></div>
            <div className="soil3d-dropzone right" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); update((l) => moveTab(l, dragTab, pane.id, "right")); setDragTab(null); }}><span>{t("model3d.dropRight", "Nieuw venster rechts")}</span></div>
          </>
        )}
      </div>
    </section>
  );

  return (
    <div className="soil3d-panes" ref={rowRef}>
      {layout.panes.map((pane, k) => (
        <div key={pane.id} className="soil3d-pane-slot" style={{ flex: `${layout.sizes[k]} 1 0` }}>
          {paneView(pane)}
          {k < layout.panes.length - 1 && <div className="soil3d-splitter" role="separator" aria-orientation="vertical" onPointerDown={(e) => startResize(k, e)} />}
        </div>
      ))}
    </div>
  );
}
