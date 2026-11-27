// Drawing pane of the pile module: the 2D chart, the pile in 3D with the 4D-8D
// method, or both next to each other (the default).
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { PanelProps } from "../../../framework/types";
import type { PileInput, PileResult } from "../types";
import { KoppejanView3D } from "./KoppejanView3D";
import { VisualPanel } from "./VisualPanel";
import "./koppejan-3d.css";

type Mode = "2d" | "both" | "3d";
const KEY = "ogs.pile.drawingMode";

function storedMode(): Mode {
  try {
    const value = localStorage.getItem(KEY);
    if (value === "2d" || value === "3d" || value === "both") return value;
  } catch { /* geen opslag: de standaard geldt */ }
  return "both";
}

export function DrawingPanel(props: PanelProps<PileInput, PileResult>) {
  const { t } = useTranslation("calcPile");
  const [mode, setModeState] = useState<Mode>(storedMode);
  const setMode = (next: Mode) => {
    setModeState(next);
    try { localStorage.setItem(KEY, next); } catch { /* keuze geldt dan alleen nu */ }
  };
  const button = (value: Mode, label: string, title?: string) => (
    <button type="button" className={mode === value ? "on" : ""} aria-pressed={mode === value} title={title} onClick={() => setMode(value)}>{label}</button>
  );
  return (
    <div className={`pile-drawing pile-drawing-${mode}`}>
      <div className="pile-drawing-switch" role="group" aria-label={t("view3d.switch", "Weergave van de tekening")}>
        {button("2d", "2D")}
        {button("both", t("view3d.switchBoth", "2D + 3D"), t("view3d.switchBothTitle", "Sondering en de paal in 3D naast elkaar"))}
        {button("3d", "3D", t("view3d.switch3dTitle", "De paal in 3D: fysiek of rekenkundig (4D-8D-methode)"))}
      </div>
      {mode === "2d" && <VisualPanel {...props} />}
      {mode === "3d" && <KoppejanView3D input={props.input} result={props.result} storageKey="3d" />}
      {mode === "both" && (
        <div className="pile-drawing-split">
          <VisualPanel {...props} />
          {/* Naast de sondering standaard de paal zoals hij is; de rekenkundige weergave is één klik verder. */}
          <KoppejanView3D input={props.input} result={props.result} initialFocus="pile" initialView="physical" storageKey="both" />
        </div>
      )}
    </div>
  );
}
