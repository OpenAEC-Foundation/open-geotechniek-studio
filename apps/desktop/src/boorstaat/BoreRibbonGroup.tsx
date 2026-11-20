// Lintgroep Boringen: een boring toevoegen en een bestaande boring openen in de boorstaat-editor.
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import RibbonGroup from "../components/ribbon/RibbonGroup";
import RibbonButton from "../components/ribbon/RibbonButton";
import { useCptStore } from "../store/useCptStore";
import { boresOf, openBoreEditor } from "./boreStore";
import "./boorstaat.css";

export default function BoreRibbonGroup() {
  const { t } = useTranslation("boring");
  const documents = useCptStore((s) => s.documents);
  const activeDocId = useCptStore((s) => s.activeDocId);
  const bores = useMemo(() => boresOf(documents.find((d) => d.id === activeDocId)), [documents, activeDocId]);
  const [chosen, setChosen] = useState("");
  useEffect(() => { if (!bores.some((b) => b.id === chosen)) setChosen(bores[0]?.id ?? ""); }, [bores, chosen]);

  return (
    <RibbonGroup label={t("ribbon.group", "Boringen")}>
      <RibbonButton icon="geo.bore" label={t("ribbon.add", "Boring\ntoevoegen")} title={t("ribbon.addTitle", "Voer een boring met de hand in: kopgegevens, lagen en grondwaterstand")} onClick={() => openBoreEditor()} />
      <RibbonButton icon="project.properties" label={t("ribbon.edit", "Boorstaat\nbewerken")} disabled={!chosen} title={t("ribbon.editTitle", "Bekijk en bewerk de boorstaat van de gekozen boring")} onClick={() => openBoreEditor(chosen)} />
      <div className="ribbon-info-block">
        <div className="ribbon-info-title">{t("ribbon.count", "Boringen: {{count}}", { count: bores.length })}</div>
        {bores.length > 0
          ? <select className="bs-ribbon-select" aria-label={t("ribbon.choose", "Boring kiezen")} value={chosen} onChange={(e) => setChosen(e.target.value)}>
              {bores.map((b) => <option key={b.id} value={b.id}>{b.id}</option>)}
            </select>
          : <div className="ribbon-info-sub">{t("ribbon.none", "Voeg een boring toe of open een boorbestand.")}</div>}
      </div>
    </RibbonGroup>
  );
}
