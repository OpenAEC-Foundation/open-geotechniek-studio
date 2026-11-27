import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useCalculationsStore } from "../calc/framework/store";
import { OaIcon } from "../components/icons/oaIcon";
import { calcColor, usePlacementStore, type PlacementLayer } from "./store";
import { hasGeometry } from "./types";

/** Rijen in de lagenlijst van het 3D-model: de geplaatste berekeningen, per soort aan of uit. */
export function PlacementLayerRows({ docId }: { docId: string | null }) {
  const { t } = useTranslation("placement");
  const layers = usePlacementStore((s) => s.layers);
  const toggle = usePlacementStore((s) => s.toggleLayer);
  const calcs = useCalculationsStore((s) => (docId ? s.byDoc.get(docId) : undefined)) ?? [];
  const placed = calcs.filter((c) => hasGeometry(c.placement));
  const [open, setOpen] = useState(true);
  const count = (kind: string) => placed.filter((c) => c.placement!.kind === kind).length;
  const all = Object.values(layers).every(Boolean);
  const rows: Array<{ key: PlacementLayer; label: string; n?: number }> = [
    { key: "piles", label: t("layers.piles", "Palen"), n: count("piles") },
    { key: "walls", label: t("layers.walls", "Damwanden"), n: count("wall") },
    { key: "pit", label: t("layers.pit", "Ontgraving") },
    { key: "anchors", label: t("layers.anchors", "Ankers en stempels") },
    { key: "footings", label: t("layers.footings", "Funderingen op staal"), n: count("footing") },
  ];
  const setAll = () => { for (const r of rows) if (layers[r.key] === all) toggle(r.key); };
  return (
    <div className="soil3d-layer">
      <div className="soil3d-layer-row">
        <button type="button" className="soil3d-twisty" aria-label={open ? t("layers.collapse", "Inklappen") : t("layers.expand", "Uitklappen")} onClick={() => setOpen(!open)}>
          <OaIcon id="tree.collapse" className={open ? undefined : "soil3d-closed"} />
        </button>
        <label title={t("layers.hint", "Berekeningen met een plaats in het project")}>
          <input type="checkbox" checked={all} onChange={setAll} />
          <span>{t("layers.title", "Geplaatste berekeningen")}</span>
        </label>
        <span className="soil3d-layer-status">{placed.length ? String(placed.length) : t("layers.none", "geen")}</span>
      </div>
      {open && (
        <div className="soil3d-layer-children">
          {rows.map((r) => (
            <div key={r.key} className="soil3d-layer-row">
              <span className="soil3d-twisty empty" />
              <label>
                <input type="checkbox" checked={layers[r.key]} onChange={() => toggle(r.key)} />
                <span>{r.label}</span>
              </label>
              {r.n !== undefined && <span className="soil3d-layer-status">{r.n || ""}</span>}
            </div>
          ))}
          {placed.map((c) => (
            <div key={c.id} className="soil3d-note placement-legend">
              <span className="soil3d-swatch" style={{ background: calcColor(c.id) }} />{c.name}
            </div>
          ))}
          {!placed.length && <div className="soil3d-note soil3d-muted">{t("layers.empty", "Plaats een berekening via de knop Plaatsen in de berekening.")}</div>}
        </div>
      )}
    </div>
  );
}
