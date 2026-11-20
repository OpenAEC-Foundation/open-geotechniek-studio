// Teksten op de boorstaat in de taal van de app. Grondsoortnamen blijven de Nederlandse NEN 5104-benamingen.
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { BOORSTAAT_LABELS, type BoorstaatLabels } from "./boorstaat";

export function useBoorstaatLabels(): BoorstaatLabels {
  const { t, i18n } = useTranslation("boring");
  return useMemo(
    () => Object.fromEntries((Object.keys(BOORSTAAT_LABELS) as Array<keyof BoorstaatLabels>).map((key) => [key, t(`sheet.${key}`, BOORSTAAT_LABELS[key])])) as unknown as BoorstaatLabels,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, i18n.language],
  );
}
