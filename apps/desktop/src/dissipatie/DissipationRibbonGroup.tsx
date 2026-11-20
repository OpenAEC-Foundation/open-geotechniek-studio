// Lintgroep bij de sondering: het scherm met dissipatietests openen en een GEF-dissipatiebestand toevoegen.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import RibbonGroup from "../components/ribbon/RibbonGroup";
import RibbonButton from "../components/ribbon/RibbonButton";
import { DissipationDialog, OPEN_DISSIPATION_EVENT, pickGefDissipation, useActiveCpt } from "./DissipationDialog";

export default function DissipationRibbonGroup() {
  const { t } = useTranslation("dissipatie");
  const cpt = useActiveCpt();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_DISSIPATION_EVENT, show);
    return () => window.removeEventListener(OPEN_DISSIPATION_EVENT, show);
  }, []);
  const count = cpt?.dissipation_tests?.length ?? 0;
  const tr = (key: string, nl: string, vars?: Record<string, unknown>) => t(key, nl, vars) as string;
  const add = async () => {
    if (!cpt) return;
    const outcome = await pickGefDissipation(cpt, tr);
    if (outcome?.error && !outcome.testId) alert(outcome.text);
    else if (outcome) setOpen(true);
  };
  return (
    <RibbonGroup label={tr("ribbon.group", "Dissipatie")}>
      <RibbonButton icon="geo.sondering" size="large" disabled={!cpt} active={count > 0}
        label={count > 0 ? tr("ribbon.openCount", "Dissipatie-\ntests ({{n}})", { n: count }) : tr("ribbon.open", "Dissipatie-\ntests")}
        title={!cpt ? tr("ribbon.noCpt", "Open eerst een sondering.") : count > 0
          ? tr("ribbon.openHint", "Grafiek, t50 en consolidatiecoëfficiënt van de dissipatietests bij {{cpt}}", { cpt: cpt.id })
          : tr("ribbon.none", "Geen dissipatietests bij {{cpt}}; voeg een GEF-dissipatiebestand toe.", { cpt: cpt.id })}
        onClick={() => setOpen(true)} />
      <RibbonButton icon="file.import" size="large" disabled={!cpt}
        label={tr("ribbon.add", "GEF\ntoevoegen")}
        title={tr("ribbon.addHint", "Voeg een GEF-dissipatiebestand (tijd in de eerste kolom) toe aan de actieve sondering")}
        onClick={() => void add()} />
      <DissipationDialog open={open} onClose={() => setOpen(false)} />
    </RibbonGroup>
  );
}
