import { Trans, useTranslation } from "react-i18next";
import type { CalcModule } from "../types";
import { moduleName, moduleText } from "../moduleText";

export function ComingSoonPanel({ module }: { module: CalcModule }) {
  const { t } = useTranslation("calc");
  return (
    <div className="calc-coming-soon">
      <div className="calc-coming-soon-icon">🔜</div>
      <h2>{moduleName(module)}</h2>
      <p className="calc-coming-soon-norm">{moduleText(module, "norm")}</p>
      <p className="calc-coming-soon-desc">{moduleText(module, "subtitle")}</p>
      <p className="calc-coming-soon-hint">
        <Trans t={t} i18nKey="comingSoon.hint" defaults="Deze module wordt nog gebouwd. Volg de roadmap op <link>GitHub</link>."
          components={{
            link: <a
              href="https://github.com/OpenAEC-Foundation/open-geotechniek-studio"
              target="_blank"
              rel="noopener noreferrer"
            />,
          }} />
      </p>
    </div>
  );
}
