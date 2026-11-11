import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { CALC_REGISTRY } from "../registry";
import { useCalculationsStore } from "../store";
import { useCptStore } from "../../../store/useCptStore";
import type { CalcCategory } from "../types";
import { ct } from "../../i18n";
import { moduleName, moduleText } from "../moduleText";

interface Props {
  open: boolean;
  onClose: () => void;
}

const CATEGORY_LABELS: Record<CalcCategory, () => string> = {
  pile: () => ct("calc", "categories.pile", "Palen"),
  spread: () => ct("calc", "categories.spread", "Funderingen"),
  wall: () => ct("calc", "categories.wall", "Wanden"),
  anchor: () => ct("calc", "categories.anchor", "Ankers"),
  report: () => ct("calc", "categories.report", "Rapporten"),
};

export function NewCalculationDialog({ open, onClose }: Props) {
  const { t } = useTranslation("calc");
  const activeDocId = useCptStore((s) => s.activeDocId);
  const projectMeta = useCptStore((s) => s.projectMeta);
  const cpts = useCptStore((s) => s.cpts);
  const activeCptId = useCptStore((s) => s.activeCptId);
  const addCalc = useCalculationsStore((s) => s.addCalculation);

  const [selectedId, setSelectedId] = useState<string | null>(CALC_REGISTRY[0]?.id ?? null);
  const [name, setName] = useState("");

  const grouped = useMemo(() => {
    const g: Record<string, typeof CALC_REGISTRY> = {};
    for (const m of CALC_REGISTRY) {
      (g[m.category] = g[m.category] ?? []).push(m);
    }
    return g;
  }, []);

  if (!open) return null;

  const handleAdd = () => {
    if (!selectedId || !activeDocId) return;
    const mod = CALC_REGISTRY.find((m) => m.id === selectedId);
    if (!mod) return;
    const ctx = { cpts, activeCptId, projectMeta };
    const input = mod.defaultInput(ctx);
    const finalName = name.trim() || moduleName(mod);
    // Atomic: input meegeven aan addCalculation in plaats van een aparte
    // updateCalc-aanroep. Met de oude 2-step (addCalc → updateCalc) was
    // er een korte tussenstand waarin `instance.input === {}` was, en
    // module-componenten die meteen renderden (VisualPanel/ResultPanel)
    // op `input.<veld>.toFixed()` crashten zonder defaults.
    addCalc(activeDocId, mod.id, finalName, input);
    onClose();
  };

  return (
    <div className="calc-modal-backdrop" onClick={onClose}>
      <div className="calc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="calc-modal-header">
          <h2>{t("dialog.title", "Nieuwe berekening")}</h2>
          <button className="calc-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="calc-modal-body">
          <label className="calc-modal-field">
            <span>{t("dialog.name", "Naam")}</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("dialog.namePlaceholder", "Bijvoorbeeld: Zetting ophoging")}
            />
          </label>

          <div className="calc-modal-modules">
            {(Object.keys(CATEGORY_LABELS) as CalcCategory[]).filter((cat) => grouped[cat]?.length).map((cat) => (
              <div key={cat} className="calc-modal-category">
                <div className="calc-modal-category-title">{CATEGORY_LABELS[cat]()}</div>
                {(grouped[cat] ?? []).map((m) => (
                  <label key={m.id} className="calc-modal-module">
                    <input
                      type="radio"
                      name="module"
                      value={m.id}
                      checked={selectedId === m.id}
                      onChange={() => setSelectedId(m.id)}
                    />
                    <div className="calc-modal-module-text">
                      <div>
                        <strong>{moduleName(m)}</strong>
                        {m.status === "coming-soon" && (
                          <span className="calc-modal-alpha" title={t("dialog.alphaTitle", "Alpha — nog in ontwikkeling, niet productie-gereed")}>
                            {" "}{t("dialog.alpha", "CONCEPT — in ontwikkeling")}
                          </span>
                        )}
                        {m.status === "experimental" && (
                          <span className="calc-modal-alpha" title={t("dialog.alphaTitle", "Alpha — nog in ontwikkeling, niet productie-gereed")}>
                            {" "}{t("dialog.alpha", "CONCEPT — in ontwikkeling")}
                          </span>
                        )}
                      </div>
                      <small>{moduleText(m, "norm")}</small>
                    </div>
                  </label>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="calc-modal-footer">
          <button onClick={onClose}>{t("dialog.cancel", "Annuleren")}</button>
          <button
            className="primary"
            disabled={!selectedId || !activeDocId}
            onClick={handleAdd}
          >
            {t("dialog.add", "Toevoegen")}
          </button>
        </div>
      </div>
    </div>
  );
}
