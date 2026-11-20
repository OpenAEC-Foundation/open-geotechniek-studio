// Drawing pane of the pile module: the 2D chart, or the 3D explanation of the
// 4D-8D method.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { PanelProps } from "../../../framework/types";
import type { PileInput, PileResult } from "../types";
import { KoppejanView3D } from "./KoppejanView3D";
import { VisualPanel } from "./VisualPanel";
import "./koppejan-3d.css";

export function DrawingPanel(props: PanelProps<PileInput, PileResult>) {
  const { t } = useTranslation("calcPile");
  const [mode, setMode] = useState<"2d" | "3d">("2d");
  return (
    <div className="pile-drawing">
      <div className="pile-drawing-switch" role="group" aria-label={t("view3d.switch", "Weergave van de tekening")}>
        <button type="button" className={mode === "2d" ? "on" : ""} aria-pressed={mode === "2d"} onClick={() => setMode("2d")}>2D</button>
        <button type="button" className={mode === "3d" ? "on" : ""} aria-pressed={mode === "3d"} title={t("view3d.switch3dTitle", "4D-8D-methode in 3D")} onClick={() => setMode("3d")}>3D</button>
      </div>
      {mode === "2d" ? <VisualPanel {...props} /> : <KoppejanView3D input={props.input} result={props.result} />}
    </div>
  );
}
