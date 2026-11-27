// Lintgroep bij de sondering: opent het scherm met dissipatietests. Een GEF-dissipatiebestand komt erbij
// door het te openen (het vindt zijn sondering zelf) of met de knop in het scherm.
import { useTranslation } from "react-i18next";
import RibbonGroup from "../components/ribbon/RibbonGroup";
import RibbonButton from "../components/ribbon/RibbonButton";
import { openDissipationDialog, useActiveCpt } from "./DissipationDialog";

export default function DissipationRibbonGroup() {
  const { t } = useTranslation("dissipatie");
  const cpt = useActiveCpt();
  const count = cpt?.dissipation_tests?.length ?? 0;
  const tr = (key: string, nl: string, vars?: Record<string, unknown>) => t(key, nl, vars) as string;
  return (
    <RibbonGroup label={tr("ribbon.group", "Dissipatie")}>
      <RibbonButton icon="geo.sondering" size="large" disabled={!cpt} active={count > 0}
        label={count > 0 ? tr("ribbon.openCount", "Dissipatie-\ntests ({{n}})", { n: count }) : tr("ribbon.open", "Dissipatie-\ntests")}
        title={!cpt ? tr("ribbon.noCpt", "Open eerst een sondering.") : count > 0
          ? tr("ribbon.openHint", "Grafiek, t50 en consolidatiecoëfficiënt van de dissipatietests bij {{cpt}}", { cpt: cpt.id })
          : tr("ribbon.none", "Geen dissipatietests bij {{cpt}}; voeg een GEF-dissipatiebestand toe.", { cpt: cpt.id })}
        onClick={() => openDissipationDialog()} />
    </RibbonGroup>
  );
}
