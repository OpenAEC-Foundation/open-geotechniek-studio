// Beknopt overzicht van de dissipatietests in het linkerpaneel: per test de diepte, t50 en c_h, met een
// knop naar het scherm met de grafiek, de invoer en de uitkomst.
import { useTranslation } from "react-i18next";
import { OaIcon } from "../components/icons/oaIcon";
import { useCptStore } from "../store/useCptStore";
import type { Cpt } from "../types/cpt";
import { analyseDissipation } from "./analysis";
import { coneAreaFromFile, withoutDissipationTest } from "./cptDissipation";
import { openDissipationDialog } from "./DissipationDialog";
import { formatCh, formatTime } from "./summary";
import "./dissipatie.css";

export default function DissipationPanel({ cpt }: { cpt: Cpt }) {
  const { t } = useTranslation("dissipatie");
  const tests = cpt.dissipation_tests ?? [];
  const area = coneAreaFromFile(cpt);
  return (
    <div className="dis-panel">
      {tests.map((test) => {
        const r = analyseDissipation(test, area);
        return (
          <div key={test.id} className="dis-panel-row">
            <button type="button" className="dis-panel-open" title={test.source_file} onClick={() => openDissipationDialog(test.id)}>
              <strong>{test.depth.toFixed(2)} m</strong>
              <span>{r.channel} · {test.source === "bro" ? "BRO" : "GEF"}</span>
              <span>{t("row.t50", "t₅₀")} {formatTime(r.t50)}</span>
              <span>{t("row.ch", "cₕ [m²/s]")} {formatCh(r.ch)}</span>
            </button>
            <button type="button" className="dis-panel-remove" aria-label={t("dialog.remove", "Test verwijderen")} title={t("dialog.removeHint", "Haal deze test weg bij de sondering")}
              onClick={() => useCptStore.getState().replaceCpt(withoutDissipationTest(cpt, test.id))}>
              <OaIcon id="document.close" />
            </button>
          </div>
        );
      })}
      <button type="button" className="dis-panel-more" title={t("panel.openHint", "Grafiek, invoer en uitkomst van de dissipatietests")} onClick={() => openDissipationDialog()}>
        {t("panel.open", "Uitwerken…")}
      </button>
    </div>
  );
}
