// Lintknop "Sondering digitaliseren": opent het scherm; is de actieve sondering al gedigitaliseerd,
// dan opent die om bij te werken.
import { useTranslation } from "react-i18next";
import RibbonButton from "../components/ribbon/RibbonButton";
import { useCptStore } from "../store/useCptStore";
import { digitizedOf } from "./record";
import { openDigitizer } from "./store";

export default function DigitizeRibbonButton() {
  const { t } = useTranslation("digitaliseren");
  const active = useCptStore((s) => (s.activeCptId ? s.cpts.get(s.activeCptId) : undefined));
  const existing = digitizedOf(active) ? active!.id : undefined;
  return (
    <RibbonButton icon="draw.line" active={!!existing}
      label={existing ? t("ribbon.edit", "Digitalisering\nbijwerken") : t("ribbon.add", "Sondering\ndigitaliseren")}
      title={existing
        ? t("ribbon.editTitle", "Open de gedigitaliseerde sondering {{id}} opnieuw om punten of gegevens bij te werken", { id: existing })
        : t("ribbon.addTitle", "Maak een sondering van een grafiek op papier of in een PDF of scan: assen ijken en de lijn aanklikken")}
      onClick={() => openDigitizer(existing)} />
  );
}
